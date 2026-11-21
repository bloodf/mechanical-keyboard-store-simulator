import { describe, expect, it } from "vitest";
import { createNewGame, DAY_END, DAY_START, nowAbs, validateState, type GameState } from "../../src/core/state";
import { generateCatalog } from "../../src/data/catalog";
import { generateOrder } from "../../src/build/jobs";
import { evaluateBuild } from "../../src/build/scoring";
import { parseSku, skuCase, skuKeycaps, skuPcb, skuPlate, skuStab, skuSwitch, starterKit, unitPrice, SKU_LUBE } from "../../src/build/stock";
import {
  abandonBuild,
  acceptOrder,
  advance,
  cartTotal,
  declineOrder,
  explainMembrane,
  inbox,
  nextDay,
  pitchMechanical,
  placeSupplierOrder,
  reserve,
  shipBuild,
  startBuild,
  startGame,
  stepMinutes,
  swapReserved,
  unreadCount,
} from "../../src/build/workshop";
import { CASE_MATERIALS, PCBS, PLATES, STABS } from "../../src/data/parts";
import { LAYOUT_IDS } from "../../src/data/layouts";

const cat = generateCatalog("WORKSHOP1");

function fresh(): GameState {
  const s = createNewGame({ seed: "WORKSHOP1" });
  startGame(s, cat);
  return s;
}

describe("new game", () => {
  it("starts at 09:00 on day 1 with starter stock, a welcome letter and a buildable first order", () => {
    const s = fresh();
    expect(s.minute).toBe(DAY_START);
    expect(Object.keys(s.inventory).length).toBeGreaterThan(5);
    expect(unreadCount(s)).toBe(1);
    expect(s.offers.length).toBe(2);
    const first = s.offers[0];
    expect(first.kind).toBe("build");
    expect(first.layout).toEqual({ kind: "exact", id: "65" });
    // the starter kit covers a 65% build
    const kit = starterKit(cat);
    expect(Object.keys(kit).some((k) => k.startsWith("case/") && k.includes("/65/"))).toBe(true);
    expect(Object.entries(kit).some(([k, n]) => k.startsWith("sw/") && n >= 68)).toBe(true);
    expect(validateState(s)).toBe(true);
  });
});

describe("stock", () => {
  it("every catalog product has a price and SKUs round-trip", () => {
    for (const l of LAYOUT_IDS) {
      for (const m of CASE_MATERIALS) for (const c of cat.caseColors[m.id]) expect(unitPrice(skuCase(m.id, l, c.id), cat)).toBeGreaterThan(0);
      for (const p of PCBS) for (const fp of ["mx", "choc"] as const) expect(unitPrice(skuPcb(p.id, l, fp), cat)).toBeGreaterThan(0);
      for (const p of PLATES.filter((p) => p.id !== "none")) expect(unitPrice(skuPlate(p.id, l, "mx"), cat)).toBeGreaterThan(0);
    }
    for (const st of STABS) expect(unitPrice(skuStab(st.id, "choc"), cat)).toBeGreaterThan(0);
    for (const sw of cat.switches) expect(unitPrice(skuSwitch(sw.id), cat)).toBeGreaterThan(0);
    for (const k of cat.keycaps) expect(unitPrice(skuKeycaps(k.id), cat)).toBeGreaterThan(0);
    expect(parseSku(skuPcb("hotswap", "tkl", "choc"))).toEqual({ kind: "pcb", id: "hotswap", layout: "tkl", fp: "choc" });
    expect(unitPrice("case/unobtainium/65/x", cat)).toBeNull();
    expect(unitPrice(SKU_LUBE, cat)).toBeGreaterThan(0);
  });
  it("the catalog has MX, Box and Choc switches, and low-profile keycaps", () => {
    expect(new Set(cat.switches.map((s) => s.family))).toEqual(new Set(["mx", "box", "choc"]));
    expect(cat.keycaps.some((k) => k.profile === "lp")).toBe(true);
    expect(new Set(cat.keycaps.map((k) => k.profile)).size).toBeGreaterThanOrEqual(7);
  });
});

describe("suppliers", () => {
  it("standard shipping arrives the next morning, express two workshop hours later", () => {
    const s = fresh();
    const sku = skuSwitch(cat.switches[1].id);
    const money = s.money;
    const std = placeSupplierOrder(s, [{ sku, qty: 35 }], "standard", cat)!;
    expect(std).not.toBeNull();
    expect(s.money).toBe(money - std.cost);
    const exp = placeSupplierOrder(s, [{ sku: skuKeycaps(cat.keycaps[2].id), qty: 1 }], "express", cat)!;
    expect(exp.cost).toBeGreaterThan(unitPrice(skuKeycaps(cat.keycaps[2].id), cat)!);
    const before = s.inventory[sku] ?? 0;
    let ev = advance(s, 60);
    expect(ev.some((e) => e.kind === "delivery")).toBe(false);
    ev = advance(s, 60);
    expect(ev.filter((e) => e.kind === "delivery").length).toBe(1);
    expect(s.inventory[skuKeycaps(cat.keycaps[2].id)]).toBe(1);
    expect(s.inventory[sku] ?? 0).toBe(before);
    const rep = nextDay(s, cat);
    expect(rep.deliveries).toBe(1);
    expect(s.inventory[sku]).toBe(before + 35);
    expect(validateState(s)).toBe(true);
  });
  it("can't order more than you can pay; bulk switch packs are cheaper per switch", () => {
    const s = fresh();
    s.money = 100;
    expect(placeSupplierOrder(s, [{ sku: skuKeycaps(cat.keycaps[0].id), qty: 1 }], "standard", cat)).toBeNull();
    const sku = skuSwitch(cat.switches[0].id);
    const small = cartTotal([{ sku, qty: 10 }], cat, "standard")!.items / 10;
    const bulk = cartTotal([{ sku, qty: 110 }], cat, "standard")!.items / 110;
    expect(bulk).toBeLessThan(small);
  });
});

describe("orders & days", () => {
  it("accepting, declining, expiring and new orders each morning", () => {
    const s = fresh();
    const [a, b] = s.offers;
    expect(acceptOrder(s, a.id)).toBe(true);
    declineOrder(s, b.id);
    expect(s.offers.length).toBe(0);
    expect(s.accepted.map((o) => o.id)).toEqual([a.id]);
    const r = nextDay(s, cat);
    expect(s.day).toBe(2);
    expect(r.newOffers).toBeGreaterThanOrEqual(2);
    expect(s.offers.every((o) => o.received === 2)).toBe(true);
    nextDay(s, cat);
    nextDay(s, cat); // offers from day 2 expired by day 4
    expect(s.offers.every((o) => o.received >= 3)).toBe(true);
    expect(validateState(s)).toBe(true);
  });
  it("clients cancel orders that are far past their deadline", () => {
    const s = fresh();
    acceptOrder(s, s.offers[0].id);
    const due = s.accepted[0].due;
    const rep = s.reputation;
    while (s.day <= due + 2) nextDay(s, cat);
    expect(s.accepted.length).toBe(0);
    expect(s.reputation).toBeLessThan(rep);
    expect(inbox(s).some((m) => m.kind === "cancelled")).toBe(true);
  });
  it("membrane requests: explain (reply mail later) or pitch a real build", () => {
    const s = fresh();
    let found = 0;
    for (let i = 2; i < 200 && found < 2; i++) {
      const o = generateOrder(s.seed, i, cat, { day: 1, builds: 0 });
      if (o.kind !== "membrane") continue;
      s.offers.push(o);
      if (found === 0) {
        const n = s.mail.length;
        explainMembrane(s, o.id, 1);
        expect(s.stats.membraneExplained).toBe(1);
        expect(s.mail.length).toBe(n + 1);
        expect(inbox(s).length).toBe(n); // the reply arrives a bit later
        advance(s, 120);
        expect(inbox(s).length).toBe(n + 1);
      } else {
        const conv = pitchMechanical(s, o.id, cat)!;
        expect(conv.kind).toBe("build");
        expect(acceptOrder(s, conv.id)).toBe(true);
      }
      found++;
    }
    expect(found).toBe(2);
    expect(validateState(s)).toBe(true);
  });
  it("generated orders sometimes ask for a keycap profile, low-profile, hot-swap or a case material", () => {
    const seen = new Set<string>();
    for (let i = 2; i < 400; i++) {
      const o = generateOrder("WORKSHOP1", i, cat, { day: 1, builds: 8 });
      for (const k of Object.keys(o.wants ?? {})) seen.add(k);
      expect(o.due).toBeGreaterThan(o.received);
    }
    expect(seen).toEqual(new Set(["profile", "lowProfile", "hotswap", "caseMaterial"]));
  });
});

describe("the bench", () => {
  it("parts are taken from stock and go back if the build is put aside", () => {
    const s = fresh();
    acceptOrder(s, s.offers[0].id);
    const b = startBuild(s, s.accepted[0].id)!;
    expect(b).not.toBeNull();
    const caseSku = Object.keys(s.inventory).find((k) => k.startsWith("case/"))!;
    expect(reserve(s, caseSku)).toBe(true);
    expect(s.inventory[caseSku]).toBeUndefined();
    const sw = Object.keys(s.inventory).find((k) => k.startsWith("sw/"))!;
    const swN = s.inventory[sw];
    expect(reserve(s, sw, 68)).toBe(true);
    expect(reserve(s, SKU_LUBE)).toBe(true);
    expect(swapReserved(s, caseSku, "case/brass/65/polished")).toBe(false); // not in stock
    abandonBuild(s);
    expect(s.activeBuild).toBeNull();
    expect(s.inventory[caseSku]).toBe(1);
    expect(s.inventory[sw]).toBe(swN);
    expect(s.accepted.length).toBe(1);
    expect(validateState(s)).toBe(true);
  });
  it("shipping pays the client's price, schedules a review and applies late penalties", () => {
    const s = fresh();
    acceptOrder(s, s.offers[0].id);
    const b = startBuild(s, s.accepted[0].id)!;
    b.layout = "65";
    b.caseMaterial = "plastic";
    b.caseColor = { id: "black", hex: "#26262a" };
    b.pcb = "hotswap";
    b.family = "mx";
    b.plate = "aluminum";
    b.stabs = "standard";
    b.stabLube = 1;
    b.switchId = cat.switches[0].id;
    b.lube = { quality: 1, over: 0, skipped: false };
    b.keycapsId = cat.keycaps[0].id;
    b.screws = { quality: 1, loose: 0, stripped: 0 };
    const r = evaluateBuild(b, cat);
    const money = s.money;
    const out = shipBuild(s, r);
    expect(out.late).toBe(0);
    expect(s.money).toBe(money + out.pay + out.tip);
    expect(s.stats.keyboardsBuilt).toBe(1);
    expect(s.today.shipped).toBe(1);
    const review = s.mail.find((m) => m.kind === "review" || m.kind === "complaint")!;
    expect(review.at).toBeGreaterThan(nowAbs(s));
    expect(validateState(s)).toBe(true);

    // a second, late one
    const s2 = fresh();
    acceptOrder(s2, s2.offers[0].id);
    const b2 = startBuild(s2, s2.accepted[0].id)!;
    Object.assign(b2, { ...b, job: b2.job, reserved: {} });
    while (s2.day <= b2.job.due + 1) nextDay(s2, cat);
    const out2 = shipBuild(s2, evaluateBuild(b2, cat));
    expect(out2.late).toBe(2);
    expect(out2.pay).toBeLessThan(r.pay);
    expect(out2.stars).toBeLessThanOrEqual(Math.max(1, r.stars - 1));
    expect(s2.stats.lateDeliveries).toBe(1);
  });
  it("work takes workshop time; closing time at 18:00", () => {
    const s = fresh();
    acceptOrder(s, s.offers[0].id);
    const b = startBuild(s, s.accepted[0].id)!;
    b.layout = "65";
    b.lube = { quality: 1, over: 0, skipped: false };
    const total = (["case", "pcb", "damp", "plate", "stabs", "switches", "lube", "install", "screws", "keycaps", "test", "sound", "deliver"] as const).reduce((t, st) => t + stepMinutes(b, st), 0);
    expect(total).toBeGreaterThan(120);
    expect(total).toBeLessThan(300);
    const ev = advance(s, DAY_END - s.minute + 5);
    expect(ev.some((e) => e.kind === "closing")).toBe(true);
  });
});
