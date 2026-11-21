import { newWorldSeed } from "./rng";
import { NAME_MAX, STORE_NAME_MAX } from "../data/names";
import type { BuildSession, JobRequest, Order } from "../build/types";
import type { LayoutId } from "../data/layouts";

export const STATE_VERSION = 4;
export const START_MONEY_CENTS = 50_000; // $500
export const DAY_START = 9 * 60; // 09:00
export const DAY_END = 18 * 60; // 18:00

/** Everything that is persisted. Keep it plain JSON (no classes, no Maps). */
export interface GameState {
  version: typeof STATE_VERSION;
  seed: string;
  createdAt: number; // ms epoch
  day: number; // 1-based
  minute: number; // minutes since midnight (workshop time; advances with work)
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
    lateDeliveries: number;
    ordersDeclined: number;
  };
  today: { income: number; expenses: number; shipped: number }; // ledger of the current day
  ordersIssued: number; // next order index (orders are generated from seed + index)
  offers: Order[]; // new orders waiting for an answer
  accepted: Order[]; // accepted orders waiting for the bench
  activeBuild: BuildSession | null; // keyboard on the bench (survives reloads)
  shipments: Shipment[]; // supplier deliveries on the way
  mail: Mail[]; // newest first (includes scheduled messages: shown once `at` has passed)
  history: BuildRecord[]; // most recent first, capped
  profile: PlayerProfile;
  inventory: Record<string, number>; // SKU -> units (see build/stock.ts)
  goalsCompleted: string[];
  unlocks: string[];
  flags: {
    knownCheater: boolean; // the 🤡 badge
    cheatCount: number;
  };
  /** Set by the v3 → v4 migration: the game hands out the starter stock on load. */
  needsStarterKit?: boolean;
}

export interface PlayerProfile {
  name: string;
  storeName: string;
  created: boolean; // false until the player has named themselves and the workshop
}

export interface Shipment {
  id: string;
  items: Record<string, number>;
  arrives: number; // absolute workshop minute (see absMinute)
  express: boolean;
  cost: number; // cents paid (items + shipping)
}

export type MailKind = "welcome" | "review" | "complaint" | "membrane" | "delivery" | "cancelled" | "reply";
export interface Mail {
  id: string;
  at: number; // absolute workshop minute when it arrives
  kind: MailKind;
  from: string;
  key: string; // i18n key of the body
  params: Record<string, string | number>;
  stars?: number;
  read: boolean;
}

export interface BuildRecord {
  jobId: string;
  customer: string;
  layout: LayoutId;
  stars: number;
  profit: number;
  day: number;
  late?: number; // days late
}

export const HISTORY_MAX = 30;
export const MAIL_MAX = 40;
export const OFFERS_MAX = 6;
export const ACCEPTED_MAX = 4;

/** Absolute workshop minute (day 1 00:00 = 0). */
export const absMinute = (day: number, minute: number) => (day - 1) * 1440 + minute;
export const nowAbs = (s: Pick<GameState, "day" | "minute">) => absMinute(s.day, s.minute);

export function createNewGame(opts: { cheatCount?: number; seed?: string } = {}): GameState {
  const cheatCount = opts.cheatCount ?? 0;
  const seed = opts.seed ?? newWorldSeed();
  return {
    version: STATE_VERSION,
    seed,
    profile: { name: "", storeName: "", created: false },
    createdAt: Date.now(),
    day: 1,
    minute: DAY_START,
    money: START_MONEY_CENTS,
    reputation: 300,
    playTimeSec: 0,
    stats: { customersServed: 0, keyboardsBuilt: 0, membraneExplained: 0, angryCustomers: 0, perfectBuilds: 0, totalProfit: 0, lateDeliveries: 0, ordersDeclined: 0 },
    today: { income: 0, expenses: 0, shipped: 0 },
    ordersIssued: 0,
    offers: [],
    accepted: [],
    activeBuild: null,
    shipments: [],
    mail: [],
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

/** An old job (v3) becomes an order that arrived today and is due in a few days. */
function jobToOrder(j: JobRequest, day: number): Order {
  return { ...j, kind: "build", received: day, expires: day + 1, due: day + 4 };
}

/**
 * Upgrade older (authentic) saves to the current format. Runs before validation, so
 * a save from an older game version is never mistaken for tampering.
 */
export function migrateState(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  let s: Record<string, unknown> = { ...raw };
  if (s.version === 1) {
    const stats = isObj(s.stats) ? s.stats : {};
    s = { ...s, version: 2, stats: { ...stats, perfectBuilds: 0, totalProfit: 0 }, jobsIssued: 0, jobBoard: [], activeBuild: null, history: [] };
  }
  if (s.version === 2) {
    const board = Array.isArray(s.jobBoard) ? [...s.jobBoard] : [];
    const active = s.activeBuild as { job?: unknown } | null;
    if (active && active.job) board.unshift(active.job);
    s = { ...s, version: 3, profile: { name: "", storeName: "", avatar: null, created: false }, activeBuild: null, jobBoard: board.slice(0, 3) };
  }
  if (s.version === 3) {
    // v4: the workshop (stock, suppliers, orders with deadlines, workshop clock). The shop floor and the
    // avatar are gone. A build in progress goes back to the accepted orders; the player gets the starter stock.
    const day = isInt(s.day, 1) ? s.day : 1;
    const board = (Array.isArray(s.jobBoard) ? s.jobBoard : []) as JobRequest[];
    const active = s.activeBuild as { job?: JobRequest } | null;
    const accepted = active?.job ? [jobToOrder(active.job, day)] : [];
    const p = isObj(s.profile) ? s.profile : {};
    const stats = isObj(s.stats) ? s.stats : {};
    s = {
      ...s,
      version: 4,
      minute: DAY_START,
      stats: { ...stats, lateDeliveries: 0, ordersDeclined: 0 },
      today: { income: 0, expenses: 0, shipped: 0 },
      ordersIssued: isInt(s.jobsIssued, 0) ? s.jobsIssued : 0,
      offers: board.slice(0, OFFERS_MAX).map((j) => jobToOrder(j, day)),
      accepted,
      activeBuild: null,
      shipments: [],
      mail: [],
      inventory: {},
      profile: { name: typeof p.name === "string" ? p.name : "", storeName: typeof p.storeName === "string" ? p.storeName : "", created: p.created === true },
      needsStarterKit: true,
    };
    delete s.jobBoard;
    delete s.jobsIssued;
  }
  return s;
}

const MAX_MONEY = 1_000_000_000_00; // $1B — anything above is not reachable in normal play

const isJobLike = (j: unknown): boolean =>
  isObj(j) && typeof j.id === "string" && isInt(j.index, 0) && isInt(j.budget, 0, MAX_MONEY) && isObj(j.customer) && Array.isArray(j.sound) && Array.isArray(j.quote);
const isOrderLike = (o: unknown): boolean =>
  isJobLike(o) && isObj(o) && (o.kind === "build" || o.kind === "membrane") && isInt(o.received, 1) && isInt(o.expires, 1) && isInt(o.due, 1);

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
  if (!isInt(s.minute, 0, 1439)) return false;
  if (!isInt(s.money, -MAX_MONEY, MAX_MONEY)) return false;
  if (!isInt(s.reputation, 0, 500)) return false;
  if (!isNum(s.playTimeSec, 0)) return false;
  const st = s.stats;
  if (!isObj(st)) return false;
  for (const k of ["customersServed", "keyboardsBuilt", "membraneExplained", "angryCustomers", "perfectBuilds", "lateDeliveries", "ordersDeclined"]) {
    if (!isInt(st[k], 0)) return false;
  }
  if (!isInt(st.totalProfit, -MAX_MONEY, MAX_MONEY)) return false;
  if (!isInt(s.ordersIssued, 0)) return false;
  const td = s.today;
  if (!isObj(td) || !isInt(td.income, 0, MAX_MONEY) || !isInt(td.expenses, 0, MAX_MONEY) || !isInt(td.shipped, 0)) return false;
  if (!Array.isArray(s.offers) || s.offers.length > OFFERS_MAX + 4 || !s.offers.every(isOrderLike)) return false;
  if (!Array.isArray(s.accepted) || s.accepted.length > ACCEPTED_MAX + 2 || !s.accepted.every(isOrderLike)) return false;
  if (s.activeBuild !== null && !(isObj(s.activeBuild) && isOrderLike(s.activeBuild.job) && typeof s.activeBuild.step === "string" && isObj(s.activeBuild.reserved))) return false;
  if (!Array.isArray(s.shipments) || s.shipments.length > 50) return false;
  for (const sh of s.shipments) {
    if (!isObj(sh) || typeof sh.id !== "string" || !isObj(sh.items) || !isInt(sh.arrives, 0) || !isInt(sh.cost, 0, MAX_MONEY)) return false;
    for (const v of Object.values(sh.items)) if (!isInt(v, 1, 100_000)) return false;
  }
  if (!Array.isArray(s.mail) || s.mail.length > MAIL_MAX + 20) return false;
  for (const m of s.mail) if (!isObj(m) || typeof m.id !== "string" || !isInt(m.at, 0) || typeof m.key !== "string" || typeof m.read !== "boolean") return false;
  if (!Array.isArray(s.history) || s.history.length > HISTORY_MAX) return false;
  for (const h of s.history) {
    if (!isObj(h) || typeof h.jobId !== "string" || !isInt(h.stars, 1, 5) || !isInt(h.profit, -MAX_MONEY, MAX_MONEY)) return false;
  }
  if (!isObj(s.inventory)) return false;
  for (const v of Object.values(s.inventory)) if (!isInt(v, 0, 100_000)) return false;
  if (!isStrArr(s.goalsCompleted) || !isStrArr(s.unlocks)) return false;
  const p = s.profile;
  if (!isObj(p) || typeof p.name !== "string" || p.name.length > NAME_MAX || typeof p.storeName !== "string" || p.storeName.length > STORE_NAME_MAX) return false;
  if (typeof p.created !== "boolean") return false;
  const f = s.flags;
  if (!isObj(f) || typeof f.knownCheater !== "boolean" || !isInt(f.cheatCount, 0)) return false;
  if (f.knownCheater !== f.cheatCount > 0) return false;
  return true;
}
