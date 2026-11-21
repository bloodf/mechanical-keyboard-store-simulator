/**
 * Turns a build into a sound profile + feel, and measures how well it matches a request.
 * The same profile drives the synthesized typing sound (audio/keyPress.ts), so what the
 * radar chart says is what you hear.
 */
import type { KeySoundProfile } from "../audio/keyPress";
import { CUSTOM_KEYCAPS_ID, CUSTOM_KEYCAPS_PRICE, type Catalog, type KeycapSet, type SwitchProduct } from "../data/catalog";
import { getLayout, needsStab, type LayoutId } from "../data/layouts";
import {
  CASE_MATERIALS,
  DAMPENING,
  HOUSING_SOUND,
  KEYCAP_MATERIAL_SOUND,
  KEYCAP_PROFILE_SOUND,
  LAYOUT_PRICE_FACTOR,
  PCBS,
  PLATES,
  STABS,
  SWITCH_TYPE_SOUND,
  type SoundMods,
} from "../data/parts";
import type { BuildSession, FeelReq, LayoutReq, SoundWord } from "./types";

export type Axis = "depth" | "brightness" | "hollow" | "volume" | "scratch" | "rattle" | "click";
export const AXES: Axis[] = ["depth", "brightness", "hollow", "scratch", "rattle", "volume", "click"];

export interface Feel {
  weight: number; // spring grams (0 = unknown yet)
  tactility: number; // 0 linear … 1 strong bump
  clicky: boolean;
  smoothness: number; // 0 scratchy … 1 glassy
  linear: boolean;
}

export interface BuildProfile {
  sound: KeySoundProfile;
  feel: Feel;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function apply(p: Record<Axis, number>, m: SoundMods | undefined, scale = 1) {
  if (!m) return;
  for (const k of Object.keys(m) as Axis[]) p[k] += (m[k] ?? 0) * scale;
}

export function findSwitch(cat: Catalog, id: string | null): SwitchProduct | undefined {
  return id ? cat.switches.find((s) => s.id === id) : undefined;
}

/** The keycap set in this build (the custom printed set carries the player's rolled colorway). */
export function keycapSetOf(b: BuildSession, cat: Catalog): KeycapSet | undefined {
  if (!b.keycapsId) return undefined;
  if (b.keycapsId === CUSTOM_KEYCAPS_ID) {
    if (!b.customColorway) return undefined;
    return { id: CUSTOM_KEYCAPS_ID, brand: "", name: "", material: "pbt", profile: "cherry", colorway: b.customColorway, price: CUSTOM_KEYCAPS_PRICE };
  }
  return cat.keycaps.find((k) => k.id === b.keycapsId);
}

export function computeProfile(b: BuildSession, cat: Catalog): BuildProfile {
  const p: Record<Axis, number> = { depth: 0.4, brightness: 0.5, hollow: 0.45, volume: 0.7, scratch: 0, rattle: 0, click: 0 };

  const cm = CASE_MATERIALS.find((c) => c.id === b.caseMaterial);
  apply(p, cm?.sound);
  if (cm?.mount === "gasket") apply(p, { depth: 0.04, brightness: -0.03 });
  apply(p, PCBS.find((x) => x.id === b.pcb)?.sound);
  apply(p, PLATES.find((x) => x.id === b.plate)?.sound);
  for (const d of b.damp) {
    const def = DAMPENING.find((x) => x.id === d);
    apply(p, def?.sound, d === "tape" ? 0.4 + 0.6 * (b.tapeQuality ?? 0.5) : 1);
  }
  if (b.damp.length >= 4) apply(p, { brightness: -0.08, volume: -0.05 }); // over-dampened = muffled

  // Switches + lubing
  const sw = findSwitch(cat, b.switchId);
  let tactility = 0;
  let over = 0;
  if (sw) {
    apply(p, SWITCH_TYPE_SOUND[sw.type]);
    apply(p, HOUSING_SOUND[sw.housing]);
    if (sw.longPole) apply(p, { brightness: 0.15, depth: -0.08, volume: 0.05 });
    if (sw.springG >= 65) apply(p, { depth: 0.05, volume: 0.05 });
    if (sw.springG <= 47) apply(p, { volume: -0.05 });
    const base = sw.factoryLubed ? 0.35 : 0.75;
    const q = b.lube && !b.lube.skipped ? b.lube.quality : 0;
    over = b.lube && !b.lube.skipped ? b.lube.over : 0;
    p.scratch += base * (1 - q) + 0.05;
    if (over > 0) apply(p, { volume: -0.12 * over, depth: 0.04 * over, brightness: -0.06 * over });
    tactility = sw.type === "tactile" ? 0.75 : sw.type === "clicky" ? 0.8 : 0;
    tactility *= 1 - 0.45 * over; // lubed-out bump
    if (sw.type === "clicky") p.click = 1 - 0.4 * over; // lube kills the click jacket
  }

  // Stabilizers (only if the layout has stabilized keys — every layout does)
  const stab = STABS.find((s) => s.id === b.stabs);
  if (stab) {
    let r = stab.rattle;
    if (b.stabMods.includes("clip")) r -= 0.1;
    if (b.stabMods.includes("bandaid")) r -= 0.1;
    r *= 1 - 0.75 * (b.stabLube ?? 0);
    p.rattle = r;
  }
  if (b.screws) apply(p, { rattle: 0.12 * b.screws.loose, hollow: 0.05 * b.screws.loose });

  // Keycaps
  const kc = keycapSetOf(b, cat);
  if (kc) {
    apply(p, KEYCAP_MATERIAL_SOUND[kc.material]);
    apply(p, KEYCAP_PROFILE_SOUND[kc.profile]);
  }

  const sound: KeySoundProfile = {
    depth: clamp01(p.depth),
    brightness: clamp01(p.brightness),
    hollow: clamp01(p.hollow),
    volume: clamp01(p.volume),
    scratch: clamp01(p.scratch),
    rattle: clamp01(p.rattle),
    click: clamp01(p.click),
  };
  return {
    sound,
    feel: {
      weight: sw?.springG ?? 0,
      tactility,
      clicky: sw?.type === "clicky",
      smoothness: clamp01(1 - sound.scratch),
      linear: sw ? sw.type === "linear" || sw.type === "silent" : false,
    },
  };
}

// ---------- Targets ----------

export type Range = [number, number];
export const SOUND_TARGETS: Record<SoundWord, Partial<Record<Axis, Range>>> = {
  thocky: { depth: [0.66, 1], brightness: [0, 0.48] },
  clacky: { depth: [0, 0.45], brightness: [0.58, 1] },
  creamy: { scratch: [0, 0.2], depth: [0.55, 1], brightness: [0.2, 0.6] },
  marbly: { depth: [0.45, 0.8], brightness: [0.5, 0.8], hollow: [0, 0.25] },
  poppy: { brightness: [0.55, 0.9], hollow: [0, 0.3], depth: [0.3, 0.65] },
  quiet: { volume: [0, 0.5], click: [0, 0.1] },
  loud: { volume: [0.72, 1] },
  clicky: { click: [0.8, 1] },
  deep: { depth: [0.65, 1] },
  crisp: { brightness: [0.62, 1] },
};

/** Pairs that make sense together (and are physically achievable). */
export const SOUND_COMBOS: SoundWord[][] = [
  ["thocky"],
  ["clacky"],
  ["creamy"],
  ["marbly"],
  ["poppy"],
  ["quiet"],
  ["clicky"],
  ["thocky", "creamy"],
  ["thocky", "quiet"],
  ["clacky", "loud"],
  ["clacky", "crisp"],
  ["deep", "creamy"],
  ["marbly", "poppy"],
  ["clicky", "loud"],
  ["quiet", "creamy"],
  ["poppy", "crisp"],
];

/** Merged target ranges (intersection per axis). */
export function targetRanges(words: SoundWord[]): Partial<Record<Axis, Range>> {
  const out: Partial<Record<Axis, Range>> = {};
  for (const w of words) {
    for (const [axis, r] of Object.entries(SOUND_TARGETS[w]) as [Axis, Range][]) {
      const prev = out[axis];
      out[axis] = prev ? [Math.max(prev[0], r[0]), Math.min(prev[1], r[1])] : [...r];
    }
  }
  return out;
}

/** 1 inside the range, falling off linearly outside (0 at 0.33 away). */
export function axisScore(v: number, r: Range): number {
  const d = v < r[0] ? r[0] - v : v > r[1] ? v - r[1] : 0;
  return Math.max(0, 1 - d * 3);
}

export function soundMatch(sound: KeySoundProfile, words: SoundWord[]): number {
  const ranges = targetRanges(words);
  const entries = Object.entries(ranges) as [Axis, Range][];
  if (!entries.length) return 1;
  return entries.reduce((s, [axis, r]) => s + axisScore(sound[axis], r), 0) / entries.length;
}

export function feelMatch(feel: Feel, req: FeelReq): number {
  switch (req) {
    case "any":
      return 1;
    case "light":
      return feel.weight <= 50 ? 1 : Math.max(0, 1 - (feel.weight - 50) / 20);
    case "heavy":
      return feel.weight >= 65 ? 1 : Math.max(0, 1 - (65 - feel.weight) / 20);
    case "linear":
      return feel.linear ? 1 : 0.2;
    case "tactile":
      return feel.clicky ? 0.5 : Math.min(1, feel.tactility / 0.6);
    case "clicky":
      return feel.clicky ? 1 : 0.1;
    case "smooth":
      return Math.min(1, feel.smoothness / 0.85);
  }
}

export function layoutMatches(req: LayoutReq, id: LayoutId | null): boolean {
  if (!id) return false;
  switch (req.kind) {
    case "exact":
      return req.id === id;
    case "compact":
      return id === "40" || id === "60" || id === "65";
    case "arrows":
      return id !== "40" && id !== "60";
    case "frow":
      return id === "75" || id === "tkl" || id === "full";
    case "numpad":
      return id === "full";
    case "any":
      return true;
  }
}

// ---------- Cost ----------

export interface CostLine {
  part: "case" | "pcb" | "damp" | "plate" | "stabs" | "switches" | "keycaps";
  cents: number;
}

export function partsCost(b: BuildSession, cat: Catalog): { total: number; lines: CostLine[] } {
  const lines: CostLine[] = [];
  const f = b.layout ? LAYOUT_PRICE_FACTOR[b.layout] : 1;
  const keys = b.layout ? getLayout(b.layout).keys.length : 0;
  const scale = (c: number) => Math.round((c * f) / 100) * 100;
  const cm = CASE_MATERIALS.find((c) => c.id === b.caseMaterial);
  if (cm) lines.push({ part: "case", cents: scale(cm.price) });
  const pcb = PCBS.find((x) => x.id === b.pcb);
  if (pcb) lines.push({ part: "pcb", cents: scale(pcb.price) });
  const damp = b.damp.reduce((s, d) => s + (DAMPENING.find((x) => x.id === d)?.price ?? 0), 0);
  if (damp) lines.push({ part: "damp", cents: scale(damp) });
  const plate = PLATES.find((x) => x.id === b.plate);
  if (plate && plate.price) lines.push({ part: "plate", cents: scale(plate.price) });
  const stab = STABS.find((x) => x.id === b.stabs);
  if (stab) lines.push({ part: "stabs", cents: stab.price + (b.stabMods.includes("bandaid") ? 1_00 : 0) });
  const sw = findSwitch(cat, b.switchId);
  if (sw) lines.push({ part: "switches", cents: sw.pricePerSwitch * keys });
  const kc = keycapSetOf(b, cat);
  if (kc) lines.push({ part: "keycaps", cents: scale(kc.price) });
  return { total: lines.reduce((s, l) => s + l.cents, 0), lines };
}

/** Number of stabilizers a layout needs. */
export function stabCount(layout: LayoutId): number {
  return getLayout(layout).keys.filter(needsStab).length;
}
