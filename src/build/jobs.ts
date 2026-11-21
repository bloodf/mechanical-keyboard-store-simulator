/**
 * Customer job generator. Everything comes from the world seed + job index, so the job board
 * is different every run but reproducible (good for debugging and fair saves).
 */
import { randomVoiceParams } from "../audio/voice";
import { derive, type Rng } from "../core/rng";
import type { Catalog } from "../data/catalog";
import { CASE_MATERIALS, LAYOUT_PRICE_FACTOR, isUnlocked } from "../data/parts";
import type { KeycapProfile } from "../data/profiles";
import { getLayout, type LayoutId } from "../data/layouts";
import { names, variantCount } from "../i18n";
import { SOUND_COMBOS } from "./profile";
import type { FeelReq, JobRequest, LayoutReq, Order, Persona, QuoteLine, SoundWord, ThemeReq, Wants } from "./types";

const PERSONAS: Persona[] = ["gamer", "programmer", "writer", "streamer", "office", "student", "grandparent", "audiophile", "collector", "artist"];

const PERSONA_PREFS: Record<Persona, { sound: SoundWord[]; feel: FeelReq[]; budget: number; picky: number; layouts: LayoutId[] }> = {
  gamer: { sound: ["clacky", "loud", "poppy"], feel: ["light", "linear"], budget: 1.0, picky: 0.4, layouts: ["60", "65", "tkl"] },
  programmer: { sound: ["thocky", "deep", "creamy"], feel: ["tactile", "smooth"], budget: 1.15, picky: 0.5, layouts: ["65", "75", "tkl"] },
  writer: { sound: ["creamy", "thocky", "marbly"], feel: ["tactile", "smooth"], budget: 1.05, picky: 0.45, layouts: ["65", "75", "full"] },
  streamer: { sound: ["thocky", "creamy", "marbly"], feel: ["linear", "smooth"], budget: 1.3, picky: 0.6, layouts: ["65", "75", "tkl"] },
  office: { sound: ["quiet"], feel: ["any", "linear", "tactile"], budget: 0.95, picky: 0.3, layouts: ["full", "tkl", "75"] },
  student: { sound: ["clacky", "thocky", "poppy"], feel: ["any", "light"], budget: 0.8, picky: 0.25, layouts: ["60", "65", "40"] },
  grandparent: { sound: ["clicky", "loud"], feel: ["clicky", "heavy"], budget: 1.0, picky: 0.3, layouts: ["full", "tkl"] },
  audiophile: { sound: ["marbly", "poppy", "thocky", "creamy"], feel: ["smooth", "linear"], budget: 1.45, picky: 0.9, layouts: ["65", "75"] },
  collector: { sound: ["thocky", "marbly", "creamy"], feel: ["any", "smooth"], budget: 1.5, picky: 0.8, layouts: ["65", "75", "40", "tkl"] },
  artist: { sound: ["poppy", "marbly", "creamy"], feel: ["any", "light"], budget: 1.15, picky: 0.55, layouts: ["60", "65", "75"] },
};

/** Feel requests that contradict a sound request are never generated. */
function feelCompatible(feel: FeelReq, sound: SoundWord[]): boolean {
  const hasClicky = sound.includes("clicky");
  if (hasClicky) return feel === "any" || feel === "clicky" || feel === "heavy" || feel === "light";
  if (feel === "clicky") return false;
  if (sound.includes("creamy") && feel === "tactile") return true;
  return true;
}

function pickVariant(rng: Rng, prefix: string): string {
  const n = variantCount(prefix);
  return `${prefix}.${n ? rng.int(0, n - 1) : 0}`;
}

/** Rough cost of a sensible build, used to set believable budgets. */
export function referenceCost(layout: LayoutId): number {
  const f = LAYOUT_PRICE_FACTOR[layout];
  const keys = getLayout(layout).keys.length;
  return Math.round((57_00 + 25_00 + 12_00 + 60_00) * f + 35_00 + 14_00 + 28 * keys);
}

function layoutReqFor(rng: Rng, prefs: LayoutId[]): { req: LayoutReq; buildAs: LayoutId } {
  const roll = rng.next();
  const exact = rng.pick(prefs);
  if (roll < 0.6) return { req: { kind: "exact", id: exact }, buildAs: exact };
  if (roll < 0.72) return { req: { kind: "compact" }, buildAs: "65" };
  if (roll < 0.82) return { req: { kind: "arrows" }, buildAs: "65" };
  if (roll < 0.9) return { req: { kind: "frow" }, buildAs: "75" };
  if (roll < 0.95) return { req: { kind: "numpad" }, buildAs: "full" };
  return { req: { kind: "any" }, buildAs: "65" };
}

export function generateJob(seed: string, index: number, catalog: Catalog, buildsDone: number): JobRequest {
  const rng = derive(seed, "job", index);
  const n = names();
  const persona = rng.pick(PERSONAS);
  const prefs = PERSONA_PREFS[persona];
  const useHandle = persona === "gamer" || persona === "streamer" ? rng.chance(0.4) : false;
  const name = useHandle ? rng.pick(n.handles) : `${rng.pick(n.firstNames)} ${rng.pick(n.lastNames)}`;

  // Sound: prefer combos containing a word this persona likes.
  const liked = SOUND_COMBOS.filter((c) => c.some((w) => prefs.sound.includes(w)));
  const sound = rng.pick(liked.length ? liked : SOUND_COMBOS);
  const feelOptions = [...prefs.feel, "any" as FeelReq].filter((f) => feelCompatible(f, sound));
  const feel = rng.pick(feelOptions.length ? feelOptions : (["any"] as FeelReq[]));

  const { req: layout, buildAs } = layoutReqFor(rng, prefs.layouts);

  // Theme: usually something available in the (unlocked) catalog, so it's always achievable.
  let theme: ThemeReq = { kind: "any" };
  const sets = catalog.keycaps.filter((k) => isUnlocked(k.requires, buildsDone));
  if (sets.length && rng.chance(persona === "artist" || persona === "collector" ? 0.95 : 0.75)) {
    const cw = rng.pick(sets).colorway;
    const r = rng.next();
    theme = r < 0.4 ? { kind: "both", family: cw.family, hue: cw.hue } : r < 0.65 ? { kind: "family", family: cw.family } : { kind: "hue", hue: cw.hue };
  }

  const budget = Math.round((referenceCost(buildAs) * prefs.budget * rng.range(1.1, 1.7)) / 5_00) * 5_00;
  const picky = Math.max(0, Math.min(1, prefs.picky + rng.range(-0.15, 0.15)));

  // Quote: assembled from translatable phrase variants. "@key" params are translated when shown.
  const quote: QuoteLine[] = [];
  quote.push({ key: pickVariant(rng, "job.greet"), params: { name: name.split(" ")[0] } });
  quote.push({ key: pickVariant(rng, `job.intro.${persona}`), params: {} });
  const layoutParam: Record<string, string> = layout.kind === "exact" ? { layout: `@layout.name.${layout.id}` } : {};
  quote.push({ key: pickVariant(rng, `job.layout.${layout.kind}`), params: layoutParam });
  if (sound.length === 1) quote.push({ key: pickVariant(rng, "job.sound.one"), params: { a: `@sound.word.${sound[0]}` } });
  else quote.push({ key: pickVariant(rng, "job.sound.two"), params: { a: `@sound.word.${sound[0]}`, b: `@sound.word.${sound[1]}` } });
  if (feel !== "any") quote.push({ key: pickVariant(rng, `job.feel.${feel}`), params: {} });
  if (theme.kind !== "any") {
    const params: Record<string, string> = {};
    if (theme.kind !== "hue") params.family = `@color.family.${theme.family}`;
    if (theme.kind !== "family") params.hue = `@color.hue.${theme.hue}`;
    quote.push({ key: pickVariant(rng, `job.theme.${theme.kind}`), params });
  } else {
    quote.push({ key: pickVariant(rng, "job.theme.any"), params: {} });
  }
  quote.push({ key: pickVariant(rng, "job.budget"), params: { money: budget } });

  return {
    id: `job.${index}`,
    index,
    customer: { name, persona, voice: randomVoiceParams(() => rng.next()) },
    layout,
    sound,
    feel,
    theme,
    budget,
    picky,
    quote,
  };
}

// ---------------------------------------------------------------- orders (workshop inbox)

const PROFILE_FANS: Partial<Record<Persona, KeycapProfile[]>> = {
  gamer: ["oem", "cherry", "xda"],
  programmer: ["cherry", "mt3", "sa"],
  writer: ["sa", "mt3", "kat"],
  collector: ["mt3", "sa", "kat", "dsa"],
  artist: ["xda", "dsa", "kat"],
  audiophile: ["cherry", "sa", "mt3"],
  streamer: ["cherry", "kat", "xda"],
};
const LOW_PROFILE_FANS: Persona[] = ["office", "student", "programmer", "writer"];

/** Days to build & ship, by keyboard size. */
const LEAD_DAYS: Record<LayoutId, number> = { "40": 2, "60": 2, "65": 3, "75": 3, tkl: 3, full: 4 };

export interface OrderContext {
  day: number;
  builds: number;
  /** The very first order of a new game: a simple 65% that the starter stock can build. */
  tutorial?: boolean;
}

export function generateOrder(seed: string, index: number, cat: Catalog, o: OrderContext): Order {
  const rng = derive(seed, "order", index);
  if (!o.tutorial && index >= 2 && rng.chance(0.12)) return membraneOrder(seed, index, o.day);
  const job = generateJob(seed, index, cat, o.builds);
  if (o.tutorial) {
    job.layout = { kind: "exact", id: "65" };
    job.feel = "any";
    job.theme = { kind: "any" };
    job.sound = ["creamy"]; // what the starter kit does well
    job.picky = 0.2;
    job.budget = Math.max(job.budget, 320_00);
    job.quote = [
      { key: "job.greet.0", params: { name: job.customer.name.split(" ")[0] } },
      { key: "job.tutorial.0", params: {} },
      { key: "job.budget.0", params: { money: job.budget } },
    ];
  }
  // Explicit wishes (more of them once the player has some experience)
  const wants: Wants = {};
  const exp = Math.min(1, o.builds / 6);
  const sets = cat.keycaps.filter((k) => isUnlocked(k.requires, o.builds));
  const fans = PROFILE_FANS[job.customer.persona];
  if (!o.tutorial && fans && rng.chance(0.15 + 0.25 * exp)) {
    const options = fans.filter((p) => sets.some((s) => s.profile === p));
    if (options.length) wants.profile = rng.pick(options);
  }
  const chocOk = cat.switches.some((s) => s.family === "choc" && isUnlocked(s.requires, o.builds)) && sets.some((s) => s.profile === "lp");
  if (!o.tutorial && !wants.profile && chocOk && LOW_PROFILE_FANS.includes(job.customer.persona) && rng.chance(0.3)) wants.lowProfile = true;
  if (!o.tutorial && rng.chance(0.12 + 0.1 * exp)) wants.hotswap = true;
  if (!o.tutorial && rng.chance(0.1 * exp)) {
    const mats = CASE_MATERIALS.filter((m) => isUnlocked(m.requires, o.builds));
    wants.caseMaterial = rng.pick(mats).id;
  }
  const extra: QuoteLine[] = [];
  if (wants.profile) extra.push({ key: pickVariant(rng, "job.wants.profile"), params: { profile: `@part.keycap.profile.${wants.profile}` } });
  if (wants.lowProfile) extra.push({ key: pickVariant(rng, "job.wants.lowProfile"), params: {} });
  if (wants.hotswap) extra.push({ key: pickVariant(rng, "job.wants.hotswap"), params: {} });
  if (wants.caseMaterial) extra.push({ key: pickVariant(rng, "job.wants.case"), params: { material: `@part.case.${wants.caseMaterial}` } });
  // wishes go before the budget line
  job.quote.splice(job.quote.length - 1, 0, ...extra);
  if (Object.keys(wants).length) {
    job.wants = wants;
    job.budget = Math.round((job.budget * 1.08) / 5_00) * 5_00;
    job.quote[job.quote.length - 1].params.money = job.budget;
  }
  const size: LayoutId = job.layout.kind === "exact" ? job.layout.id : job.layout.kind === "numpad" ? "full" : job.layout.kind === "frow" ? "75" : "65";
  const lead = LEAD_DAYS[size] + (o.tutorial ? 1 : rng.int(0, 2));
  return { ...job, id: `order.${index}`, kind: "build", received: o.day, expires: o.day + 1, due: o.day + lead };
}

/** Someone wants their membrane keyboard "converted". (You can't. You explain. Politely.) */
function membraneOrder(seed: string, index: number, day: number): Order {
  const job = generateJob(seed, index, { switches: [], keycaps: [], caseColors: {} as Catalog["caseColors"] }, 0);
  const rng = derive(seed, "membrane", index);
  const first = job.customer.name.split(" ")[0];
  const quote: QuoteLine[] = [
    { key: pickVariant(rng, "job.greet"), params: { name: first } },
    { key: pickVariant(rng, "membrane.ask"), params: {} },
    { key: pickVariant(rng, "membrane.detail"), params: {} },
  ];
  const offer = Math.round(rng.range(15, 60)) * 100;
  quote.push({ key: pickVariant(rng, "membrane.offer"), params: { money: offer } });
  return { ...job, id: `order.${index}`, kind: "membrane", quote, budget: offer, wants: undefined, received: day, expires: day + 1, due: day + 1 };
}

/** A membrane customer who listened: they now want a real mechanical keyboard. */
export function convertMembrane(seed: string, o: Order, cat: Catalog, day: number, builds: number): Order {
  const job = generateJob(seed, o.index, cat, builds);
  const first = o.customer.name.split(" ")[0];
  job.customer = o.customer;
  job.quote[0] = { key: "job.greet.0", params: { name: first } };
  job.quote.splice(1, 1, { key: "membrane.converted.0", params: {} });
  return { ...job, id: o.id, kind: "build", received: day, expires: day + 1, due: day + 4 };
}
