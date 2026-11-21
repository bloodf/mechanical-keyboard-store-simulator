/**
 * Persistence with tamper detection.
 *
 * Layout in localStorage:
 *   mkss.save.a / mkss.save.b  — two sealed slots written alternately (counter parity picks the slot)
 *   mkss.shame                 — sealed { count, pending } cheat record; survives the wipe
 *
 * localStorage.setItem is atomic per key, so a crash can never leave a half-written slot;
 * therefore a slot that fails to open is treated as tampering, not corruption.
 */
import { createNewGame, migrateState, validateState, type GameState } from "../core/state";
import { open, seal } from "./crypto";

export const KEYS = {
  a: "mkss.save.a",
  b: "mkss.save.b",
  shame: "mkss.shame",
} as const;

type Slot = "a" | "b";

interface Envelope {
  slot: Slot;
  counter: number;
  savedAt: number;
  state: GameState;
}

interface ShameRecord {
  count: number;
  pending: boolean; // true = cheater screen must be shown (even after reload)
}

export type LoadResult =
  | { kind: "empty" }
  | { kind: "ok"; state: GameState }
  | { kind: "tampered"; cheatCount: number; reason: string };

/** Minimal Storage subset so tests can use an in-memory store. */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryKV implements KV {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

/** localStorage can throw (disabled storage, Safari private mode). Fall back to memory. */
export function defaultStorage(): { kv: KV; persistent: boolean } {
  try {
    const probe = "mkss.probe";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return { kv: localStorage, persistent: true };
  } catch {
    return { kv: new MemoryKV(), persistent: false };
  }
}

export type SaveResult = "ok" | "failed" | "tampered" | "wiped" | "conflict";

export class SaveManager {
  private counter = 0;
  /** Exactly what this session last read/wrote per slot; anything else in storage = edited externally. */
  private known: Record<Slot, string | null> = { a: null, b: null };

  constructor(private kv: KV) {}

  hasSave(): boolean {
    return this.kv.getItem(KEYS.a) !== null || this.kv.getItem(KEYS.b) !== null;
  }

  load(): LoadResult {
    const shame = this.readShame();
    if (shame.record?.pending) {
      return { kind: "tampered", cheatCount: shame.record.count, reason: "pending" };
    }
    const rawA = this.kv.getItem(KEYS.a);
    const rawB = this.kv.getItem(KEYS.b);
    if (rawA === null && rawB === null) {
      // A tampered shame record on its own (no save) still counts as cheating.
      if (shame.tampered) return this.flagCheater(shame.record?.count ?? 0, "shame record modified");
      this.known = { a: null, b: null };
      return { kind: "empty" };
    }

    const envs: Envelope[] = [];
    for (const [slot, raw] of [["a", rawA], ["b", rawB]] as const) {
      if (raw === null) continue;
      const env = this.openSlot(slot, raw);
      if (!env) return this.flagCheater(shame.record?.count ?? 0, `slot ${slot} failed authentication`);
      envs.push(env);
    }
    if (shame.tampered) return this.flagCheater(shame.record?.count ?? 0, "shame record modified");

    if (envs.length === 2) {
      const [x, y] = envs;
      if (x.state.seed !== y.state.seed) return this.flagCheater(shame.record?.count ?? 0, "slots from different runs");
      if (Math.abs(x.counter - y.counter) !== 1) return this.flagCheater(shame.record?.count ?? 0, "slot counters inconsistent");
    }
    const newest = envs.reduce((p, c) => (c.counter > p.counter ? c : p));
    this.counter = newest.counter;
    this.known = { a: rawA, b: rawB };
    return { kind: "ok", state: newest.state };
  }

  /**
   * Seal and write the state.
   *  - "failed":   the browser refused to store it (quota etc.); the previous save is intact.
   *  - "tampered": the slots were edited while the game was running → cheater flagged, nothing written.
   *  - "wiped":    the player cleared site data while playing → respected, nothing written.
   *  - "conflict": storage changed but is authentic (another tab of the game saved) → nothing written.
   */
  save(state: GameState): SaveResult {
    const curA = this.kv.getItem(KEYS.a);
    const curB = this.kv.getItem(KEYS.b);
    if (curA !== this.known.a || curB !== this.known.b) {
      if (curA === null && curB === null) return "wiped";
      // Authentic data written by another tab is not cheating; anything else is.
      return this.load().kind === "ok" ? "conflict" : "tampered";
    }
    const counter = this.counter + 1;
    const slot: Slot = counter % 2 === 0 ? "a" : "b";
    const env: Envelope = { slot, counter, savedAt: Date.now(), state };
    const blob = seal(JSON.stringify(env), `slot:${slot}`);
    try {
      this.kv.setItem(KEYS[slot], blob);
    } catch {
      return "failed";
    }
    this.known[slot] = blob;
    this.counter = counter;
    return "ok";
  }

  /** Start a fresh run (keeps the shame record so the 🤡 badge persists). */
  newGame(): GameState {
    this.wipeSlots();
    const shame = this.readShame().record;
    const state = createNewGame({ cheatCount: shame?.count ?? 0 });
    this.save(state);
    return state;
  }

  /** Called from the cheater screen's "start over" button. */
  acceptShame(): GameState {
    const count = this.readShame().record?.count ?? 1;
    this.writeShame({ count: Math.max(1, count), pending: false });
    return this.newGame();
  }

  private flagCheater(prevCount: number, reason: string): LoadResult {
    const count = prevCount + 1;
    this.wipeSlots();
    this.writeShame({ count, pending: true });
    return { kind: "tampered", cheatCount: count, reason };
  }

  private wipeSlots() {
    this.kv.removeItem(KEYS.a);
    this.kv.removeItem(KEYS.b);
    this.counter = 0;
    this.known = { a: null, b: null };
  }

  private openSlot(slot: Slot, raw: string): Envelope | null {
    const json = open(raw, `slot:${slot}`);
    if (json === null) return null;
    try {
      const env = JSON.parse(json) as Envelope;
      if (env.slot !== slot) return null;
      env.state = migrateState(env.state) as GameState;
      if (!Number.isInteger(env.counter) || env.counter < 1) return null;
      if ((env.counter % 2 === 0 ? "a" : "b") !== slot) return null;
      if (!validateState(env.state)) return null;
      return env;
    } catch {
      return null;
    }
  }

  private readShame(): { record: ShameRecord | null; tampered: boolean } {
    const raw = this.kv.getItem(KEYS.shame);
    if (raw === null) return { record: null, tampered: false };
    const json = open(raw, "shame");
    if (json === null) return { record: null, tampered: true };
    try {
      const r = JSON.parse(json) as ShameRecord;
      if (!Number.isInteger(r.count) || r.count < 0 || typeof r.pending !== "boolean") {
        return { record: null, tampered: true };
      }
      return { record: r, tampered: false };
    } catch {
      return { record: null, tampered: true };
    }
  }

  private writeShame(r: ShameRecord) {
    try {
      this.kv.setItem(KEYS.shame, seal(JSON.stringify(r), "shame"));
    } catch {
      /* storage full — badge is best-effort */
    }
  }
}
