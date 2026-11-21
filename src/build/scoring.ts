/** Judges a finished build against the customer's request → stars, money, reputation. */
import type { Catalog } from "../data/catalog";
import { CASE_MATERIALS, type HueName } from "../data/parts";
import { computeProfile, feelMatch, layoutMatches, partsCost, soundMatch } from "./profile";
import type { BuildSession, ThemeReq } from "./types";
import type { Colorway } from "../world/colorway";

export type ScoreComponent = "layout" | "sound" | "feel" | "theme" | "quality";
export const WEIGHTS: Record<ScoreComponent, number> = { layout: 0.2, sound: 0.35, feel: 0.15, theme: 0.15, quality: 0.15 };
export type Mood = "ecstatic" | "happy" | "meh" | "annoyed" | "furious";

export interface BuildResult {
  scores: Record<ScoreComponent, number>;
  total: number;
  stars: number; // 1..5
  mood: Mood;
  worst: ScoreComponent;
  partsCost: number;
  pay: number;
  tip: number;
  profit: number;
  repDelta: number;
}

const HUE_RING: HueName[] = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"];
function hueSimilarity(a: HueName, b: HueName): number {
  if (a === b) return 1;
  const ia = HUE_RING.indexOf(a);
  const ib = HUE_RING.indexOf(b);
  if (ia >= 0 && ib >= 0) {
    const d = Math.min(Math.abs(ia - ib), HUE_RING.length - Math.abs(ia - ib));
    return d === 1 ? 0.55 : d === 2 ? 0.2 : 0.05;
  }
  const warm = new Set<HueName>(["beige", "orange", "yellow"]);
  const neutral = new Set<HueName>(["white", "grey", "black"]);
  if (warm.has(a) && warm.has(b)) return 0.45;
  if (neutral.has(a) && neutral.has(b)) return 0.45;
  return 0.1;
}

export function themeMatch(req: ThemeReq, cw: Colorway | undefined, caseHue: HueName | "neutral" | undefined): number {
  if (req.kind === "any") return 1;
  if (!cw) return 0;
  const fam = req.kind === "hue" ? 1 : cw.family === req.family ? 1 : 0.25;
  let hue = 1;
  if (req.kind !== "family") {
    hue = hueSimilarity(cw.hue, req.hue);
    if (caseHue && caseHue !== "neutral" && caseHue === req.hue) hue = Math.min(1, hue + 0.2);
  }
  return req.kind === "both" ? (fam + hue) / 2 : req.kind === "family" ? fam : hue;
}

export function evaluateBuild(b: BuildSession, cat: Catalog): BuildResult {
  const { sound, feel } = computeProfile(b, cat);
  const kc = b.keycapsId ? cat.keycaps.find((k) => k.id === b.keycapsId) : undefined;
  const caseHue = CASE_MATERIALS.find((m) => m.id === b.caseMaterial)?.colors.find((c) => c.id === b.caseColor)?.hue;

  const unresolved = b.faults.filter((f) => !b.fixed.includes(f.key)).length;
  const rattleQ = sound.rattle <= 0.3 ? 1 : Math.max(0, 1 - (sound.rattle - 0.3) * 2);
  const scratchQ = Math.max(0, 1 - Math.max(0, sound.scratch - 0.4) * 1.5);
  const screwQ = b.screws?.quality ?? 0.7;
  const quality = Math.max(0, (rattleQ + scratchQ + screwQ) / 3 - unresolved * 0.25);

  const scores: Record<ScoreComponent, number> = {
    layout: layoutMatches(b.job.layout, b.layout) ? 1 : 0,
    sound: soundMatch(sound, b.job.sound),
    feel: feelMatch(feel, b.job.feel),
    theme: themeMatch(b.job.theme, kc?.colorway, caseHue),
    quality,
  };
  const total = (Object.keys(WEIGHTS) as ScoreComponent[]).reduce((s, k) => s + WEIGHTS[k] * scores[k], 0);

  // Picky customers are harder to impress.
  const shift = b.job.picky * 0.06;
  let stars = total >= 0.93 + shift ? 5 : total >= 0.8 + shift ? 4 : total >= 0.64 + shift ? 3 : total >= 0.47 + shift ? 2 : 1;
  if (scores.layout === 0) stars = Math.min(stars, 2); // "That's not the keyboard I asked for!"
  if (unresolved > 0) stars = Math.min(stars, 3);

  const worst = (Object.keys(scores) as ScoreComponent[]).reduce((w, k) => (scores[k] * WEIGHTS[k] < scores[w] * WEIGHTS[w] ? k : w), "sound");
  const mood: Mood = stars === 5 ? "ecstatic" : stars === 4 ? "happy" : stars === 3 ? "meh" : stars === 2 ? "annoyed" : "furious";
  const payFactor = stars >= 3 ? 1 : stars === 2 ? 0.8 : 0.5;
  const pay = Math.round(b.job.budget * payFactor);
  const tip = stars === 5 ? Math.round((b.job.budget * 0.2) / 100) * 100 : stars === 4 ? Math.round((b.job.budget * 0.1) / 100) * 100 : 0;
  const cost = partsCost(b, cat).total;
  const repDelta = [0, -12, -6, 1, 6, 12][stars];
  return { scores, total, stars, mood, worst, partsCost: cost, pay, tip, profit: pay + tip - cost, repDelta };
}
