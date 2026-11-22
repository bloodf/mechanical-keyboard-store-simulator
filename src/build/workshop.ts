/**
 * The workshop's business rules (framework-free, unit tested): the clock, client orders,
 * supplier deliveries, the build ↔ stock link, shipping to clients, reviews and mail.
 *
 * Time only moves when you work (each build step takes workshop minutes) or when you close for the day,
 * so there's no pressure to click fast — only deadlines (in days) to plan around.
 */
import { derive } from "../core/rng";
import { absMinute, ACCEPTED_MAX, DAY_END, DAY_START, HISTORY_MAX, MAIL_MAX, nowAbs, OFFERS_MAX, type GameState, type Mail, type MailKind, type Shipment } from "../core/state";
import type { Catalog } from "../data/catalog";
import { getLayout } from "../data/layouts";
import { convertMembrane, generateOrder } from "./jobs";
import { newSession } from "./session";
import { EXPRESS_MINUTES, give, packPrice, SHIPPING_FEE, SKU_LUBE, parseSku, starterKit, stockValue, take, unitPrice, type Shipping } from "./stock";
import type { BuildSession, Order, StepId } from "./types";
import type { BuildResult } from "./scoring";
import { hasTool } from "./tools";

export function formatClock(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Workshop minutes a finished step takes. */
export function stepMinutes(b: BuildSession, step: StepId, owner: Pick<GameState, "unlocks"> = { unlocks: [] }): number {
  const keys = b.layout ? getLayout(b.layout).keys.length : 60;
  switch (step) {
    case "case":
      return 10;
    case "pcb":
      return 5;
    case "damp":
      return 5 + b.damp.length * 4 + (b.damp.includes("tape") ? 12 : 0);
    case "plate":
      return 5;
    case "stabs":
      return 15 + (b.stabLube ? 10 : 0) + b.stabMods.length * 5;
    case "switches":
      return 5;
    case "lube":
      return b.lube && !b.lube.skipped ? Math.round(keys * (hasTool(owner, "lubeStation") ? 0.35 : 0.5)) : 0;
    case "install":
      return Math.round(keys * 0.25);
    case "solder":
      return Math.round(keys * (hasTool(owner, "solderStation") ? 0.42 : 0.6));
    case "screws":
      return 10;
    case "keycaps":
      return 15;
    case "test":
      return hasTool(owner, "keyTester") ? 4 : 10;
    case "sound":
      return 5;
    case "deliver":
      return hasTool(owner, "packingStation") ? 5 : 15;
  }
}

export type WorkshopEvent = { kind: "delivery"; shipment: Shipment } | { kind: "mail"; mail: Mail } | { kind: "closing" };

export interface DayReport {
  day: number; // the day that just ended
  income: number;
  expenses: number;
  shipped: number;
  newOffers: number;
  deliveries: number;
  expired: number;
  cancelled: number;
  rent: number; // paid this morning
  newMail: number; // arrived overnight
  rescue: number; // emergency money from Grandma Thock (when broke)
}

/** Daily workshop rent (charged each morning, never below $0). */
export const RENT = 25_00;
/** When you're broke with nothing to build, Grandma helps out (at most once a week). */
export const RESCUE = 200_00;
const RESCUE_EVERY = 7;

const mailId = (s: GameState) => `m${s.ordersIssued}.${s.mail.length}.${nowAbs(s)}.${Math.floor(Math.random() * 1e6)}`;

export function addMail(s: GameState, m: Omit<Mail, "id" | "read">): Mail {
  const mail: Mail = { ...m, id: mailId(s), read: false };
  s.mail.unshift(mail);
  s.mail.sort((a, b) => b.at - a.at);
  // drop the oldest read messages beyond the cap
  while (s.mail.length > MAIL_MAX) {
    const i = s.mail.map((x) => x.read).lastIndexOf(true);
    s.mail.splice(i >= 0 ? i : s.mail.length - 1, 1);
  }
  return mail;
}

/** Messages that have arrived (scheduled ones stay hidden until their time). */
export function inbox(s: GameState): Mail[] {
  const now = nowAbs(s);
  return s.mail.filter((m) => m.at <= now);
}
export const unreadCount = (s: GameState) => inbox(s).filter((m) => !m.read).length;

// ---------------------------------------------------------------- new game / days
/** First morning: starter stock, a welcome letter and the first (easy) orders. */
export function startGame(s: GameState, cat: Catalog) {
  for (const [sku, n] of Object.entries(starterKit(cat))) give(s.inventory, sku, n);
  addMail(s, { at: nowAbs(s), kind: "welcome", from: "@mail.from.supplier", key: "mail.welcome", params: {} });
  s.offers.push(generateOrder(s.seed, s.ordersIssued++, cat, { day: s.day, builds: s.stats.keyboardsBuilt, tutorial: true }));
  s.offers.push(generateOrder(s.seed, s.ordersIssued++, cat, { day: s.day, builds: s.stats.keyboardsBuilt }));
}

function newOffersCount(s: GameState): number {
  const rng = derive(s.seed, "offers", s.day);
  return Math.max(2, Math.min(5, 1 + Math.round(s.reputation / 150) + rng.int(0, 1)));
}

/** Close the workshop for the day and open it the next morning. */
export function nextDay(s: GameState, cat: Catalog): DayReport {
  const report: DayReport = { day: s.day, income: s.today.income, expenses: s.today.expenses, shipped: s.today.shipped, newOffers: 0, deliveries: 0, expired: 0, cancelled: 0, rent: 0, newMail: 0, rescue: 0 };
  const before = nowAbs(s);
  s.day += 1;
  s.minute = DAY_START;
  s.today = { income: 0, expenses: 0, shipped: 0 };
  report.deliveries = receiveShipments(s).length;
  // unanswered offers expire
  const offersBefore = s.offers.length;
  s.offers = s.offers.filter((o) => o.expires >= s.day);
  report.expired = offersBefore - s.offers.length;
  // rent (the landlord takes what's there, never more)
  report.rent = Math.min(RENT, Math.max(0, s.money));
  s.money -= report.rent;
  s.today.expenses += report.rent;
  // broke, nothing on the bench or on the shelves: Grandma Thock sends money
  if (s.money < 50_00 && !s.activeBuild && stockValue(s.inventory, cat) < 100_00 && !s.shipments.length && s.day - (s.rescueDay ?? -99) >= RESCUE_EVERY) {
    s.money += RESCUE;
    s.rescueDay = s.day;
    report.rescue = RESCUE;
    addMail(s, { at: nowAbs(s), kind: "gift", from: "@mail.from.grandma", key: "mail.rescue", params: { money: RESCUE } });
  }
  // accepted orders far past their deadline are cancelled by the client
  for (const o of [...s.accepted]) {
    if (s.day > o.due + 2) {
      s.accepted = s.accepted.filter((x) => x.id !== o.id);
      s.reputation = Math.max(0, s.reputation - 15);
      s.stats.angryCustomers++;
      addMail(s, { at: nowAbs(s), kind: "cancelled", from: o.customer.name, key: "mail.cancelled", params: { name: o.customer.name.split(" ")[0] } });
      report.cancelled++;
    }
  }
  const n = Math.min(newOffersCount(s), OFFERS_MAX - s.offers.length);
  for (let i = 0; i < n; i++) s.offers.push(generateOrder(s.seed, s.ordersIssued++, cat, { day: s.day, builds: s.stats.keyboardsBuilt }));
  report.newOffers = Math.max(0, n);
  const now = nowAbs(s);
  report.newMail = s.mail.filter((m) => m.at > before && m.at <= now).length;
  return report;
}

/** Move the clock forward. Returns what happened (deliveries, mail, closing time). */
export function advance(s: GameState, minutes: number): WorkshopEvent[] {
  const events: WorkshopEvent[] = [];
  const before = nowAbs(s);
  s.minute = Math.min(1439, s.minute + Math.max(0, Math.round(minutes)));
  for (const sh of receiveShipments(s)) events.push({ kind: "delivery", shipment: sh });
  const now = nowAbs(s);
  for (const m of s.mail) if (m.at > before && m.at <= now) events.push({ kind: "mail", mail: m });
  if (s.minute >= DAY_END) events.push({ kind: "closing" });
  return events;
}

export const isClosingTime = (s: GameState) => s.minute >= DAY_END;

function receiveShipments(s: GameState): Shipment[] {
  const now = nowAbs(s);
  const arrived = s.shipments.filter((sh) => sh.arrives <= now);
  s.shipments = s.shipments.filter((sh) => sh.arrives > now);
  for (const sh of arrived) for (const [sku, n] of Object.entries(sh.items)) give(s.inventory, sku, n);
  return arrived;
}

// ---------------------------------------------------------------- orders
export function acceptOrder(s: GameState, id: string): boolean {
  const o = s.offers.find((x) => x.id === id);
  if (!o || o.kind !== "build" || s.accepted.length >= ACCEPTED_MAX) return false;
  s.offers = s.offers.filter((x) => x.id !== id);
  s.accepted.push(o);
  return true;
}

export function declineOrder(s: GameState, id: string) {
  const o = s.offers.find((x) => x.id === id);
  if (!o) return;
  s.offers = s.offers.filter((x) => x.id !== id);
  if (o.kind === "build") s.stats.ordersDeclined++;
}

/** Explain to a membrane customer why it can't be done. reply: 0 polite, 1 technical, 2 honest. */
export function explainMembrane(s: GameState, id: string, reply: number) {
  const o = s.offers.find((x) => x.id === id);
  if (!o || o.kind !== "membrane") return;
  s.offers = s.offers.filter((x) => x.id !== id);
  s.stats.membraneExplained++;
  s.reputation = Math.min(500, s.reputation + 2);
  const rng = derive(s.seed, "membraneReply", o.index, reply);
  addMail(s, { at: nowAbs(s) + rng.int(20, 90), kind: "reply", from: o.customer.name, key: `membrane.reply.${reply}.${rng.int(0, 2)}`, params: { name: o.customer.name.split(" ")[0] } });
}

/** Offer the membrane customer a real mechanical keyboard instead: becomes a build order. */
export function pitchMechanical(s: GameState, id: string, cat: Catalog): Order | null {
  const i = s.offers.findIndex((x) => x.id === id);
  if (i < 0 || s.offers[i].kind !== "membrane") return null;
  const o = convertMembrane(s.seed, s.offers[i], cat, s.day, s.stats.keyboardsBuilt);
  s.stats.membraneExplained++;
  s.offers[i] = o;
  return o;
}

// ---------------------------------------------------------------- suppliers
export interface CartLine {
  sku: string;
  qty: number; // units
}

export function cartTotal(cart: CartLine[], cat: Catalog, shipping: Shipping): { items: number; fee: number; total: number } | null {
  let items = 0;
  for (const l of cart) {
    const u = unitPrice(l.sku, cat);
    if (u === null || l.qty <= 0) return null;
    items += parseSku(l.sku)?.kind === "sw" ? packPrice(u, l.qty) : u * l.qty;
  }
  const fee = cart.length ? SHIPPING_FEE[shipping](items) : 0;
  return { items, fee, total: items + fee };
}

/** Pay and schedule the delivery. Standard: next morning; express: in two workshop hours. */
export function placeSupplierOrder(s: GameState, cart: CartLine[], shipping: Shipping, cat: Catalog): Shipment | null {
  const t = cartTotal(cart, cat, shipping);
  if (!t || !cart.length || t.total > s.money) return null;
  s.money -= t.total;
  s.today.expenses += t.total;
  const items: Record<string, number> = {};
  for (const l of cart) items[l.sku] = (items[l.sku] ?? 0) + l.qty;
  const arrives = shipping === "express" ? nowAbs(s) + EXPRESS_MINUTES : absMinute(s.day + 1, DAY_START);
  const sh: Shipment = { id: `po${s.day}.${s.minute}.${s.shipments.length}`, items, arrives, express: shipping === "express", cost: t.total };
  s.shipments.push(sh);
  return sh;
}

// ---------------------------------------------------------------- the bench
export function startBuild(s: GameState, orderId: string): BuildSession | null {
  if (s.activeBuild) return null;
  const o = s.accepted.find((x) => x.id === orderId);
  if (!o) return null;
  s.accepted = s.accepted.filter((x) => x.id !== orderId);
  s.activeBuild = newSession(o);
  return s.activeBuild;
}

/** Take a part from stock for the build (false if there isn't enough). */
export function reserve(s: GameState, sku: string, n = 1): boolean {
  const b = s.activeBuild;
  if (!b || !take(s.inventory, sku, n)) return false;
  b.reserved[sku] = (b.reserved[sku] ?? 0) + n;
  return true;
}

/** Put a part back on the shelf. */
export function release(s: GameState, sku: string, n = 1) {
  const b = s.activeBuild;
  if (!b) return;
  const have = b.reserved[sku] ?? 0;
  const k = Math.min(have, n);
  if (k <= 0) return;
  b.reserved[sku] = have - k;
  if (!b.reserved[sku]) delete b.reserved[sku];
  give(s.inventory, sku, k);
}

/** Swap the reserved part of one slot (e.g. the case) for another. */
export function swapReserved(s: GameState, oldSku: string | null, newSku: string, n = 1): boolean {
  if (oldSku === newSku) return true;
  if ((s.inventory[newSku] ?? 0) < n) return false;
  if (oldSku) release(s, oldSku, n);
  return reserve(s, newSku, n);
}

/** Put the keyboard aside: parts go back on the shelf (used lube is gone), the order goes back to the queue. */
export function abandonBuild(s: GameState) {
  const b = s.activeBuild;
  if (!b) return;
  for (const [sku, n] of Object.entries(b.reserved)) if (sku !== SKU_LUBE) give(s.inventory, sku, n);
  s.accepted.unshift(b.job);
  s.activeBuild = null;
}

export interface ShipOutcome {
  late: number; // days late
  pay: number;
  tip: number;
  stars: number;
  repDelta: number;
}

/** Ship the finished keyboard: the client pays now, the review arrives later. */
export function shipBuild(s: GameState, r: BuildResult): ShipOutcome {
  const b = s.activeBuild!;
  const late = Math.max(0, s.day - b.job.due);
  const lateFactor = Math.max(0.5, 1 - 0.15 * late);
  const stars = Math.max(1, r.stars - (late >= 3 ? 2 : late >= 1 ? 1 : 0));
  const pay = Math.round((r.pay * lateFactor) / 100) * 100;
  const tip = late ? 0 : r.tip;
  const repDelta = [0, -12, -6, 1, 6, 12][stars] - (late ? 3 : 0) + (hasTool(s, "packingStation") && stars >= 3 ? 2 : 0);
  s.money += pay + tip;
  s.today.income += pay + tip;
  s.today.shipped++;
  s.reputation = Math.max(0, Math.min(500, s.reputation + repDelta));
  s.stats.keyboardsBuilt++;
  s.stats.customersServed++;
  if (late) s.stats.lateDeliveries++;
  if (stars === 5) s.stats.perfectBuilds++;
  if (stars <= 2) s.stats.angryCustomers++;
  const profit = pay + tip - r.partsCost;
  s.stats.totalProfit += profit;
  s.history.unshift({ jobId: b.job.id, customer: b.job.customer.name, layout: b.layout!, stars, profit, day: s.day, late: late || undefined });
  s.history = s.history.slice(0, HISTORY_MAX);
  const rng = derive(s.seed, "review", b.job.index);
  const kind: MailKind = stars <= 2 ? "complaint" : "review";
  addMail(s, {
    at: nowAbs(s) + rng.int(90, 600),
    kind,
    from: b.job.customer.name,
    key: late && stars <= 3 ? `review.late.${rng.int(0, 2)}` : `review.${["", "furious", "annoyed", "meh", "happy", "ecstatic"][stars]}.${rng.int(0, 2)}`,
    params: { name: b.job.customer.name.split(" ")[0], days: late },
    stars,
  });
  s.activeBuild = null;
  return { late, pay, tip, stars, repDelta };
}
