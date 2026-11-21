/**
 * Customer job generator. Everything comes from the world seed + job index, so the job board
 * is different every run but reproducible (good for debugging and fair saves).
 */
import { randomVoiceParams } from "../audio/voice";
import { derive, type Rng } from "../core/rng";
import type { Catalog } from "../data/catalog";
import { LAYOUT_PRICE_FACTOR, isUnlocked } from "../data/parts";
import { getLayout, type LayoutId } from "../data/layouts";
import { names, variantCount } from "../i18n";
import { SOUND_COMBOS } from "./profile";
import type { FeelReq, JobRequest, LayoutReq, Persona, QuoteLine, SoundWord, ThemeReq } from "./types";

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
