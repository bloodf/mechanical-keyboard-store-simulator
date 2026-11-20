import { newWorldSeed } from "./rng";

export const STATE_VERSION = 1;
export const START_MONEY_CENTS = 50_000; // $500

/** Everything that is persisted. Keep it plain JSON (no classes, no Maps). */
export interface GameState {
  version: typeof STATE_VERSION;
  seed: string;
  createdAt: number; // ms epoch
  day: number; // 1-based
  money: number; // integer cents — never floats for money
  reputation: number; // 0..500 (= 0.0..5.0 stars)
  playTimeSec: number;
  stats: {
    customersServed: number;
    keyboardsBuilt: number;
    membraneExplained: number;
    angryCustomers: number;
  };
  inventory: Record<string, number>; // partId -> count
  goalsCompleted: string[];
  unlocks: string[];
  flags: {
    knownCheater: boolean; // the 🤡 badge
    cheatCount: number;
  };
}

export function createNewGame(opts: { cheatCount?: number; seed?: string } = {}): GameState {
  const cheatCount = opts.cheatCount ?? 0;
  return {
    version: STATE_VERSION,
    seed: opts.seed ?? newWorldSeed(),
    createdAt: Date.now(),
    day: 1,
    money: START_MONEY_CENTS,
    reputation: 300,
    playTimeSec: 0,
    stats: { customersServed: 0, keyboardsBuilt: 0, membraneExplained: 0, angryCustomers: 0 },
    inventory: {},
    goalsCompleted: [],
    unlocks: ["tool.basic_bench"],
    flags: { knownCheater: cheatCount > 0, cheatCount },
  };
}

const isInt = (v: unknown, min = -Infinity, max = Infinity): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isNum = (v: unknown, min = -Infinity, max = Infinity): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

const MAX_MONEY = 1_000_000_000_00; // $1B — anything above is not reachable in normal play

/**
 * Structural + sanity validation. A decrypted save that fails this is treated as tampered
 * (it can only happen if someone forged a save with the extracted key, or a bug — see tests).
 */
export function validateState(s: unknown): s is GameState {
  if (!isObj(s)) return false;
  if (s.version !== STATE_VERSION) return false;
  if (typeof s.seed !== "string" || !/^[0-9A-Z]{4,32}$/.test(s.seed)) return false;
  if (!isInt(s.createdAt, 0)) return false;
  if (!isInt(s.day, 1, 1_000_000)) return false;
  if (!isInt(s.money, -MAX_MONEY, MAX_MONEY)) return false;
  if (!isInt(s.reputation, 0, 500)) return false;
  if (!isNum(s.playTimeSec, 0)) return false;
  const st = s.stats;
  if (!isObj(st)) return false;
  for (const k of ["customersServed", "keyboardsBuilt", "membraneExplained", "angryCustomers"]) {
    if (!isInt(st[k], 0)) return false;
  }
  if (!isObj(s.inventory)) return false;
  for (const v of Object.values(s.inventory)) if (!isInt(v, 0, 100_000)) return false;
  if (!isStrArr(s.goalsCompleted) || !isStrArr(s.unlocks)) return false;
  const f = s.flags;
  if (!isObj(f) || typeof f.knownCheater !== "boolean" || !isInt(f.cheatCount, 0)) return false;
  if (f.knownCheater !== f.cheatCount > 0) return false;
  return true;
}
