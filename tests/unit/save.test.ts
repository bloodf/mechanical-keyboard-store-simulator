import { describe, expect, it } from "vitest";
import { createNewGame, validateState } from "../../src/core/state";
import { open, seal } from "../../src/save/crypto";
import { KEYS, MemoryKV, SaveManager } from "../../src/save/saveManager";

function flipChar(s: string, i: number) {
  return s.slice(0, i) + (s[i] === "A" ? "B" : "A") + s.slice(i + 1);
}

describe("crypto", () => {
  it("round-trips and rejects modification or wrong context", () => {
    const blob = seal("hello thock", "slot:a");
    expect(open(blob, "slot:a")).toBe("hello thock");
    expect(open(blob, "slot:b")).toBeNull();
    for (let i = 6; i < blob.length; i += 7) expect(open(flipChar(blob, i), "slot:a")).toBeNull();
    expect(open(blob.slice(0, -4), "slot:a")).toBeNull();
    expect(open("garbage", "slot:a")).toBeNull();
  });
  it("does not contain readable plaintext and differs each time", () => {
    const a = seal('{"money":50000}', "x");
    expect(a).not.toContain("money");
    expect(a).not.toBe(seal('{"money":50000}', "x"));
  });
});

describe("SaveManager", () => {
  it("empty storage → empty", () => {
    expect(new SaveManager(new MemoryKV()).load().kind).toBe("empty");
  });

  it("saves and loads the newest state across alternating slots", () => {
    const kv = new MemoryKV();
    const m = new SaveManager(kv);
    const s = m.newGame();
    for (let d = 2; d <= 5; d++) {
      s.day = d;
      m.save(s);
    }
    expect(kv.getItem(KEYS.a)).not.toBeNull();
    expect(kv.getItem(KEYS.b)).not.toBeNull();
    const r = new SaveManager(kv).load();
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.state.day).toBe(5);
  });

  it("keeps saving correctly after reload (counter continues)", () => {
    const kv = new MemoryKV();
    const s = new SaveManager(kv).newGame();
    const m2 = new SaveManager(kv);
    m2.load();
    s.day = 9;
    m2.save(s);
    s.day = 10;
    m2.save(s);
    const r = new SaveManager(kv).load();
    expect(r.kind === "ok" && r.state.day).toBe(10);
  });

  it("detects a modified slot, wipes it, and the cheater screen persists across reloads", () => {
    const kv = new MemoryKV();
    const m = new SaveManager(kv);
    const s = m.newGame();
    s.day = 2;
    m.save(s);
    kv.setItem(KEYS.a, flipChar(kv.getItem(KEYS.a)!, 40));
    const r = new SaveManager(kv).load();
    expect(r.kind).toBe("tampered");
    expect(kv.getItem(KEYS.a)).toBeNull();
    expect(kv.getItem(KEYS.b)).toBeNull();
    // Reloading the page does not escape the shame.
    const again = new SaveManager(kv).load();
    expect(again.kind === "tampered" && again.cheatCount).toBe(1);
  });

  it("plaintext JSON pasted into a slot is detected", () => {
    const kv = new MemoryKV();
    new SaveManager(kv).newGame();
    kv.setItem(KEYS.b, JSON.stringify({ ...createNewGame(), money: 99999999 }));
    expect(new SaveManager(kv).load().kind).toBe("tampered");
  });

  it("a blob copied into the other slot is detected", () => {
    const kv = new MemoryKV();
    new SaveManager(kv).newGame(); // writes slot b
    kv.setItem(KEYS.a, kv.getItem(KEYS.b)!);
    expect(new SaveManager(kv).load().kind).toBe("tampered");
  });

  it("mixing slots from two different runs is detected", () => {
    const kv1 = new MemoryKV();
    const m1 = new SaveManager(kv1);
    const s1 = m1.newGame();
    m1.save(s1); // slot a
    const kv2 = new MemoryKV();
    const m2 = new SaveManager(kv2);
    const s2 = m2.newGame();
    m2.save(s2);
    kv1.setItem(KEYS.a, kv2.getItem(KEYS.a)!);
    expect(new SaveManager(kv1).load().kind).toBe("tampered");
  });

  it("accepting shame starts a new run with the 🤡 badge, and it survives New Game", () => {
    const kv = new MemoryKV();
    const m = new SaveManager(kv);
    m.newGame();
    kv.setItem(KEYS.b, "MKSS1.nope");
    expect(new SaveManager(kv).load().kind).toBe("tampered");
    const fresh = new SaveManager(kv).acceptShame();
    expect(fresh.flags.knownCheater).toBe(true);
    expect(fresh.flags.cheatCount).toBe(1);
    const loaded = new SaveManager(kv).load();
    expect(loaded.kind === "ok" && loaded.state.flags.knownCheater).toBe(true);
    expect(new SaveManager(kv).newGame().flags.knownCheater).toBe(true);
  });

  it("second offense increments the count", () => {
    const kv = new MemoryKV();
    new SaveManager(kv).newGame();
    kv.setItem(KEYS.b, "x");
    new SaveManager(kv).load();
    new SaveManager(kv).acceptShame();
    kv.setItem(KEYS.b, "y");
    const r = new SaveManager(kv).load();
    expect(r.kind === "tampered" && r.cheatCount).toBe(2);
  });

  it("editing the shame record is itself cheating", () => {
    const kv = new MemoryKV();
    new SaveManager(kv).newGame();
    kv.setItem(KEYS.b, "x");
    new SaveManager(kv).load();
    new SaveManager(kv).acceptShame();
    kv.setItem(KEYS.shame, "MKSS1.AAAA");
    expect(new SaveManager(kv).load().kind).toBe("tampered");
  });

  it("deleting everything is a legit fresh start (no badge)", () => {
    const kv = new MemoryKV();
    new SaveManager(kv).newGame();
    Object.values(KEYS).forEach((k) => kv.removeItem(k));
    expect(new SaveManager(kv).load().kind).toBe("empty");
  });

  it("a storage failure during save keeps the previous save intact", () => {
    const kv = new MemoryKV();
    const m = new SaveManager(kv);
    const s = m.newGame();
    const orig = kv.setItem.bind(kv);
    kv.setItem = () => {
      throw new Error("QuotaExceeded");
    };
    s.day = 7;
    expect(m.save(s)).toBe("failed");
    kv.setItem = orig;
    expect(new SaveManager(kv).load().kind).toBe("ok");
    s.day = 8;
    expect(m.save(s)).toBe("ok");
    const r = new SaveManager(kv).load();
    expect(r.kind === "ok" && r.state.day).toBe(8);
  });
});

describe("live tampering (edited while the game is open)", () => {
  it("the next save detects it instead of silently overwriting", () => {
    const kv = new MemoryKV();
    const m = new SaveManager(kv);
    const s = m.newGame();
    m.save(s);
    kv.setItem(KEYS.a, flipChar(kv.getItem(KEYS.a)!, 50));
    expect(m.save(s)).toBe("tampered");
    const r = new SaveManager(kv).load();
    expect(r.kind === "tampered" && r.cheatCount).toBe(1);
  });
  it("clearing site data while playing is respected, not punished", () => {
    const kv = new MemoryKV();
    const m = new SaveManager(kv);
    const s = m.newGame();
    m.save(s);
    Object.values(KEYS).forEach((k) => kv.removeItem(k));
    expect(m.save(s)).toBe("wiped");
    expect(new SaveManager(kv).load().kind).toBe("empty");
  });
  it("another tab saving is a conflict, not cheating", () => {
    const kv = new MemoryKV();
    const tab1 = new SaveManager(kv);
    const s = tab1.newGame();
    const tab2 = new SaveManager(kv);
    tab2.load();
    expect(tab2.save(s)).toBe("ok");
    expect(tab1.save(s)).toBe("conflict");
    expect(new SaveManager(kv).load().kind).toBe("ok");
  });
  it("normal consecutive saves never trip the check", () => {
    const kv = new MemoryKV();
    const m = new SaveManager(kv);
    const s = m.newGame();
    for (let i = 0; i < 20; i++) expect(m.save(s)).toBe("ok");
    const m2 = new SaveManager(kv);
    m2.load();
    for (let i = 0; i < 5; i++) expect(m2.save(s)).toBe("ok");
  });
});

describe("save migration", () => {
  it("an authentic v1 save (Phase 0) upgrades to v2 instead of being called cheating", () => {
    const kv = new MemoryKV();
    const v1 = {
      version: 1, seed: "ABCDEF12", createdAt: 1, day: 3, money: 12345, reputation: 300, playTimeSec: 10,
      stats: { customersServed: 0, keyboardsBuilt: 0, membraneExplained: 0, angryCustomers: 0 },
      inventory: {}, goalsCompleted: [], unlocks: [], flags: { knownCheater: false, cheatCount: 0 },
    };
    kv.setItem(KEYS.b, seal(JSON.stringify({ slot: "b", counter: 1, savedAt: 1, state: v1 }), "slot:b"));
    const r = new SaveManager(kv).load();
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.state.version).toBe(3);
      expect(r.state.profile.created).toBe(false);
      expect(r.state.money).toBe(12345);
      expect(r.state.jobBoard).toEqual([]);
      expect(r.state.activeBuild).toBeNull();
    }
  });
});

describe("profile", () => {
  it("rejects broken avatars and over-long names", () => {
    const s = createNewGame();
    expect(validateState(s)).toBe(true);
    expect(validateState({ ...s, profile: { ...s.profile, name: "x".repeat(50) } })).toBe(false);
    expect(validateState({ ...s, profile: { ...s.profile, avatar: { ...s.profile.avatar, skin: "red" } } })).toBe(false);
    expect(validateState({ ...s, profile: { ...s.profile, avatar: { ...s.profile.avatar, hairStyle: "mohawk9000" } } })).toBe(false);
  });
});

describe("validateState", () => {
  it("accepts a new game and rejects impossible values", () => {
    const s = createNewGame();
    expect(validateState(s)).toBe(true);
    expect(validateState({ ...s, money: 1.5 })).toBe(false);
    expect(validateState({ ...s, day: 0 })).toBe(false);
    expect(validateState({ ...s, reputation: 9000 })).toBe(false);
    expect(validateState({ ...s, inventory: { x: -1 } })).toBe(false);
    expect(validateState({ ...s, flags: { knownCheater: false, cheatCount: 3 } })).toBe(false);
  });
});
