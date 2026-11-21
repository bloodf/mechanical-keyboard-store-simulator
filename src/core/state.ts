import { newWorldSeed } from "./rng";
import type { BuildSession, JobRequest } from "../build/types";
import type { LayoutId } from "../data/layouts";

export const STATE_VERSION = 2;
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
    perfectBuilds: number;
    totalProfit: number; // cents, can be negative
  };
  jobsIssued: number; // next job index (jobs are generated from seed + index)
  jobBoard: JobRequest[]; // tickets waiting at the bench
  activeBuild: BuildSession | null; // keyboard in progress (survives reloads)
  history: BuildRecord[]; // most recent first, capped
  inventory: Record<string, number>; // partId -> count
  goalsCompleted: string[];
  unlocks: string[];
  flags: {
    knownCheater: boolean; // the 🤡 badge
    cheatCount: number;
  };
}

export interface BuildRecord {
  jobId: string;
  customer: string;
  layout: LayoutId;
  stars: number;
  profit: number;
  day: number;
}

export const HISTORY_MAX = 30;

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
    stats: { customersServed: 0, keyboardsBuilt: 0, membraneExplained: 0, angryCustomers: 0, perfectBuilds: 0, totalProfit: 0 },
    jobsIssued: 0,
    jobBoard: [],
    activeBuild: null,
    history: [],
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

/**
 * Upgrade older (authentic) saves to the current format. Runs before validation, so
 * a save from an older game version is never mistaken for tampering.
 */
export function migrateState(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  let s: Record<string, unknown> = { ...raw };
  if (s.version === 1) {
    const stats = isObj(s.stats) ? s.stats : {};
    s = {
      ...s,
      version: 2,
      stats: { ...stats, perfectBuilds: 0, totalProfit: 0 },
      jobsIssued: 0,
      jobBoard: [],
      activeBuild: null,
      history: [],
    };
  }
  return s;
}

const MAX_MONEY = 1_000_000_000_00; // $1B — anything above is not reachable in normal play

const isJobLike = (j: unknown): boolean =>
  isObj(j) && typeof j.id === "string" && isInt(j.index, 0) && isInt(j.budget, 0, MAX_MONEY) && isObj(j.customer) && Array.isArray(j.sound) && Array.isArray(j.quote);

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
  for (const k of ["customersServed", "keyboardsBuilt", "membraneExplained", "angryCustomers", "perfectBuilds"]) {
    if (!isInt(st[k], 0)) return false;
  }
  if (!isInt(st.totalProfit, -MAX_MONEY, MAX_MONEY)) return false;
  if (!isInt(s.jobsIssued, 0)) return false;
  if (!Array.isArray(s.jobBoard) || s.jobBoard.length > 10 || !s.jobBoard.every(isJobLike)) return false;
  if (s.activeBuild !== null && !(isObj(s.activeBuild) && isJobLike(s.activeBuild.job) && typeof s.activeBuild.step === "string")) return false;
  if (!Array.isArray(s.history) || s.history.length > HISTORY_MAX) return false;
  for (const h of s.history) {
    if (!isObj(h) || typeof h.jobId !== "string" || !isInt(h.stars, 1, 5) || !isInt(h.profit, -MAX_MONEY, MAX_MONEY)) return false;
  }
  if (!isObj(s.inventory)) return false;
  for (const v of Object.values(s.inventory)) if (!isInt(v, 0, 100_000)) return false;
  if (!isStrArr(s.goalsCompleted) || !isStrArr(s.unlocks)) return false;
  const f = s.flags;
  if (!isObj(f) || typeof f.knownCheater !== "boolean" || !isInt(f.cheatCount, 0)) return false;
  if (f.knownCheater !== f.cheatCount > 0) return false;
  return true;
}
