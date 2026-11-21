/**
 * Part definitions and how each part changes the sound and feel of a keyboard.
 * Numbers are "arcade physics": readable, consistent, and tuned so every request is achievable.
 * Prices are integer cents. `requires.builds` = keyboards delivered before the part unlocks.
 */
import type { LayoutId } from "./layouts";

export interface SoundMods {
  depth?: number;
  brightness?: number;
  hollow?: number;
  volume?: number;
  scratch?: number;
  rattle?: number;
  click?: number;
}

export interface Requires {
  builds?: number;
}

export const LAYOUT_PRICE_FACTOR: Record<LayoutId, number> = { "40": 0.8, "60": 0.9, "65": 1, "75": 1.1, tkl: 1.2, full: 1.4 };

// ---------- Cases ----------
export type CaseMaterial = "plastic" | "acrylic" | "aluminum" | "polycarbonate" | "wood" | "brass";
export interface CaseColor {
  id: string; // named classics have i18n names (part.color.<id>); generated ones are described by tone + hue
  hex: string;
  hue: HueName | "neutral";
}
export interface CaseMaterialDef {
  id: CaseMaterial;
  price: number; // for a 65%, scaled by layout
  mount: "tray" | "sandwich" | "top" | "gasket";
  sound: SoundMods;
  requires?: Requires;
  look: { metalness: number; roughness: number; opacity?: number };
  colors: CaseColor[];
}

export type HueName = "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink" | "beige" | "white" | "black" | "grey";

const c = (id: string, hex: string, hue: CaseColor["hue"]): CaseColor => ({ id, hex, hue });

export const CASE_MATERIALS: CaseMaterialDef[] = [
  {
    id: "plastic",
    price: 30_00,
    mount: "tray",
    sound: { depth: -0.06, brightness: 0.02, hollow: 0.25 },
    look: { metalness: 0, roughness: 0.55 },
    colors: [c("white", "#f2f0ea", "white"), c("black", "#26262a", "black"), c("beige", "#d8cfb8", "beige"), c("pink", "#f4b6c8", "pink"), c("mint", "#aee3cf", "green"), c("sky", "#a9cdf2", "blue")],
  },
  {
    id: "acrylic",
    price: 45_00,
    mount: "sandwich",
    sound: { depth: 0.02, brightness: 0.08, hollow: 0.05 },
    look: { metalness: 0, roughness: 0.08, opacity: 0.45 },
    colors: [c("clear", "#e8f4ff", "white"), c("smoke", "#5b6068", "grey"), c("frost", "#f3f3f6", "white"), c("rose", "#ffc2d4", "pink")],
  },
  {
    id: "aluminum",
    price: 85_00,
    mount: "top",
    sound: { depth: 0.06, brightness: 0.1, hollow: 0.08 },
    look: { metalness: 0.75, roughness: 0.35 },
    colors: [c("silver", "#c9ccd1", "grey"), c("spacegrey", "#4d5057", "black"), c("navy", "#2c3e66", "blue"), c("lavender", "#b7a8de", "purple"), c("crimson", "#a8323e", "red"), c("gold", "#d9b45b", "yellow")],
  },
  {
    id: "polycarbonate",
    price: 70_00,
    mount: "gasket",
    sound: { depth: 0.1, brightness: -0.05, hollow: -0.02 },
    requires: { builds: 2 },
    look: { metalness: 0, roughness: 0.3, opacity: 0.6 },
    colors: [c("frosted", "#f5f7fa", "white"), c("smoke", "#4b4f57", "black"), c("ice", "#bfe6ff", "blue"), c("amber", "#ffb347", "orange")],
  },
  {
    id: "wood",
    price: 95_00,
    mount: "tray",
    sound: { depth: 0.2, brightness: -0.1, hollow: 0.0 },
    requires: { builds: 4 },
    look: { metalness: 0, roughness: 0.7 },
    colors: [c("walnut", "#6b4a33", "beige"), c("oak", "#c49a6c", "beige"), c("maple", "#e3c99a", "beige"), c("ebony", "#2e2420", "black")],
  },
  {
    id: "brass",
    price: 160_00,
    mount: "gasket",
    sound: { depth: 0.22, brightness: 0.06, hollow: -0.12, volume: 0.04 },
    requires: { builds: 7 },
    look: { metalness: 0.9, roughness: 0.28 },
    colors: [c("polished", "#d4a94a", "yellow"), c("aged", "#9c7a3c", "orange"), c("rosegold", "#d99a86", "pink")],
  },
];

// ---------- PCBs ----------
export interface PcbDef {
  id: "hotswap" | "hotswap_rgb" | "hotswap_flex" | "solder" | "solder_flex";
  price: number;
  hotswap: boolean;
  flex: boolean;
  rgb: boolean;
  color: string;
  sound: SoundMods;
  requires?: Requires;
}
export const PCBS: PcbDef[] = [
  { id: "hotswap", price: 35_00, hotswap: true, flex: false, rgb: false, color: "#1f6b3a", sound: { hollow: 0.04 } },
  { id: "hotswap_rgb", price: 45_00, hotswap: true, flex: false, rgb: true, color: "#1b1f24", sound: { hollow: 0.04 } },
  { id: "solder", price: 22_00, hotswap: false, flex: false, rgb: false, color: "#1d4fa0", sound: { hollow: -0.03, depth: 0.02 } },
  { id: "hotswap_flex", price: 52_00, hotswap: true, flex: true, rgb: false, color: "#4a2a7a", sound: { depth: 0.06, brightness: -0.04, hollow: 0.02 }, requires: { builds: 2 } },
  { id: "solder_flex", price: 38_00, hotswap: false, flex: true, rgb: false, color: "#7a1f2b", sound: { depth: 0.08, brightness: -0.04, hollow: -0.03 }, requires: { builds: 3 } },
];

// ---------- Plates ----------
export interface PlateDef {
  id: "aluminum" | "brass" | "pom" | "pc" | "fr4" | "carbon" | "none";
  price: number; // for a 65%
  color: string;
  metalness: number;
  roughness: number;
  sound: SoundMods;
  requires?: Requires;
}
export const PLATES: PlateDef[] = [
  { id: "aluminum", price: 25_00, color: "#c8ccd2", metalness: 0.8, roughness: 0.35, sound: { brightness: 0.08 } },
  { id: "fr4", price: 20_00, color: "#2b2f2b", metalness: 0.1, roughness: 0.6, sound: { depth: 0.03 } },
  { id: "pc", price: 28_00, color: "#eef3f7", metalness: 0, roughness: 0.25, sound: { depth: 0.1, brightness: -0.1 } },
  { id: "pom", price: 30_00, color: "#f4f1e8", metalness: 0, roughness: 0.5, sound: { depth: 0.13, brightness: -0.12, scratch: -0.05 } },
  { id: "brass", price: 55_00, color: "#d1a648", metalness: 0.9, roughness: 0.3, sound: { brightness: 0.2, depth: -0.06, volume: 0.05 }, requires: { builds: 3 } },
  { id: "carbon", price: 48_00, color: "#1b1b1d", metalness: 0.3, roughness: 0.4, sound: { brightness: 0.12, depth: 0.02 }, requires: { builds: 5 } },
  { id: "none", price: 0, color: "#000000", metalness: 0, roughness: 1, sound: { depth: 0.1, brightness: -0.04, hollow: 0.1 }, requires: { builds: 1 } },
];

// ---------- Dampening ----------
export interface DampDef {
  id: "caseFoam" | "peFoam" | "plateFoam" | "tape" | "silicone";
  price: number;
  sound: SoundMods;
  requires?: Requires;
}
export const DAMPENING: DampDef[] = [
  { id: "caseFoam", price: 9_00, sound: { hollow: -0.3, depth: 0.04, volume: -0.04 } },
  { id: "plateFoam", price: 8_00, sound: { hollow: -0.12, brightness: -0.05 } },
  { id: "peFoam", price: 6_00, sound: { brightness: 0.12, depth: -0.02, hollow: -0.06 } },
  { id: "tape", price: 3_00, sound: { depth: 0.08, brightness: 0.08, hollow: -0.06 } },
  { id: "silicone", price: 14_00, sound: { hollow: -0.22, depth: 0.07, volume: -0.06 }, requires: { builds: 3 } },
];

// ---------- Stabilizers ----------
export interface StabDef {
  id: "budget" | "standard" | "premium";
  price: number; // for the whole board
  rattle: number;
  requires?: Requires;
}
export const STABS: StabDef[] = [
  { id: "budget", price: 6_00, rattle: 0.75 },
  { id: "standard", price: 14_00, rattle: 0.5 },
  { id: "premium", price: 28_00, rattle: 0.3, requires: { builds: 2 } },
];
export const STAB_MODS = ["clip", "bandaid"] as const;
export type StabMod = (typeof STAB_MODS)[number];

// ---------- Switches ----------
export type SwitchType = "linear" | "tactile" | "clicky" | "silent";
export type SwitchHousing = "nylon" | "pc" | "pom";

export const SWITCH_TYPE_SOUND: Record<SwitchType, SoundMods> = {
  linear: {},
  tactile: { brightness: 0.03, depth: -0.02 },
  clicky: { click: 1, brightness: 0.1, volume: 0.15 },
  silent: { volume: -0.38, depth: 0.05, brightness: -0.2 },
};
export const HOUSING_SOUND: Record<SwitchHousing, SoundMods> = {
  nylon: { depth: 0.1, brightness: -0.07 },
  pc: { brightness: 0.1, depth: -0.06 },
  pom: { depth: 0.05, brightness: 0.03, scratch: -0.1 },
};

// ---------- Keycaps ----------
export type KeycapMaterial = "abs" | "pbt" | "pom";
export const KEYCAP_MATERIAL_SOUND: Record<KeycapMaterial, SoundMods> = {
  abs: { brightness: 0.08, depth: -0.05, volume: 0.03 },
  pbt: { depth: 0.08, brightness: -0.05 },
  pom: { depth: 0.03, brightness: 0.04, scratch: -0.03 },
};
export type { KeycapProfile } from "./profiles";
import type { KeycapProfile } from "./profiles";
export const KEYCAP_PROFILE_SOUND: Record<KeycapProfile, SoundMods> = {
  cherry: { depth: 0.06 },
  oem: {},
  sa: { depth: -0.1, brightness: 0.07, volume: 0.08, hollow: 0.04 },
  dsa: { brightness: 0.05, depth: -0.02 },
  xda: { brightness: 0.04 },
  mt3: { depth: 0.03, volume: 0.05, hollow: 0.02 },
  kat: { depth: 0.02, volume: 0.03 },
  lp: { depth: -0.06, brightness: 0.1, volume: -0.05 },
};

export function isUnlocked(req: Requires | undefined, builds: number): boolean {
  return !req?.builds || builds >= req.builds;
}
