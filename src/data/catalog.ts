/**
 * The per-run parts catalog: brands, switches and keycap sets are generated from the world seed,
 * so every new game has different products (names, specs, colorways, prices).
 * Base materials (cases, plates, PCBs, foams, stabs) are fixed in parts.ts.
 */
import { derive, type Rng } from "../core/rng";
import { names } from "../i18n";
import { COLOR_FAMILIES, randomColorway, type Colorway } from "../data/colorway";
import { CASE_MATERIALS, type CaseColor, type CaseMaterial, type KeycapMaterial, type Requires, type SwitchHousing, type SwitchType } from "./parts";
import type { KeycapProfile, SwitchFamily } from "./profiles";
import { classifyColor, hslToHex, mixHex } from "./color";

export interface SwitchProduct {
  id: string;
  brand: string;
  name: string;
  family: SwitchFamily; // mx / box fit MX PCBs & keycaps; choc needs a Choc PCB, plate and low-profile caps
  type: SwitchType;
  springG: number;
  housing: SwitchHousing;
  factoryLubed: boolean;
  longPole: boolean;
  stemColor: string;
  housingColor: string;
  bottomColor?: string;
  housingOpacity: number;
  pricePerSwitch: number; // cents
  requires?: Requires;
}

export interface KeycapSet {
  id: string;
  brand: string;
  name: string;
  material: KeycapMaterial;
  profile: KeycapProfile;
  colorway: Colorway;
  price: number; // cents, for a 65% (scaled by layout)
  requires?: Requires;
}

export interface Catalog {
  switches: SwitchProduct[];
  keycaps: KeycapSet[];
  /** Per-run case colors: a few classics + generated ones. */
  caseColors: Record<CaseMaterial, CaseColor[]>;
}

/** The "custom printed" keycap set: its colorway is rolled by the player (stored in the build). */
export const CUSTOM_KEYCAPS_ID = "kc.custom";
export const CUSTOM_KEYCAPS_PRICE = 120_00;

/** A random case color suited to the material (for generated palettes and the 🎲 button). */
export function randomCaseColor(material: CaseMaterial, rnd: () => number): string {
  const h = rnd();
  switch (material) {
    case "plastic":
      return rnd() < 0.5 ? hslToHex(h, 0.35 + rnd() * 0.3, 0.72 + rnd() * 0.14) : hslToHex(h, 0.55 + rnd() * 0.3, 0.45 + rnd() * 0.15);
    case "aluminum":
      return hslToHex(h, 0.2 + rnd() * 0.45, 0.3 + rnd() * 0.4);
    case "acrylic":
    case "polycarbonate":
      return hslToHex(h, 0.45 + rnd() * 0.4, 0.6 + rnd() * 0.25);
    case "wood":
      return mixHex(["#6b4a33", "#c49a6c", "#e3c99a"][Math.floor(rnd() * 3)], hslToHex(h, 0.6, 0.4), 0.25 + rnd() * 0.2);
    case "brass":
      return mixHex("#d4a94a", hslToHex(h, 0.5, 0.55), rnd() * 0.25);
  }
}

/** Materials where the player can roll a custom color. */
export const CUSTOM_COLOR_MATERIALS: CaseMaterial[] = ["plastic", "aluminum", "acrylic", "polycarbonate"];

interface SwitchArchetype {
  family?: SwitchFamily;
  type: SwitchType;
  housing: SwitchHousing;
  spring: number;
  lubed: boolean;
  longPole?: boolean;
  price: number; // cents per switch
  builds?: number;
}

// Coverage matters: these guarantee every sound/feel request can be satisfied at some point.
const ARCHETYPES: SwitchArchetype[] = [
  { type: "linear", housing: "nylon", spring: 45, lubed: true, price: 22 },
  { type: "linear", housing: "pc", spring: 62, lubed: false, price: 18 },
  { type: "tactile", housing: "nylon", spring: 62, lubed: false, price: 25 },
  { type: "clicky", housing: "pc", spring: 60, lubed: false, price: 20 },
  { type: "silent", housing: "nylon", spring: 50, lubed: true, price: 35 },
  { type: "linear", housing: "pom", spring: 55, lubed: true, price: 45, builds: 1 },
  { type: "tactile", housing: "pom", spring: 67, lubed: true, price: 55, builds: 2 },
  { type: "linear", housing: "pc", spring: 63, lubed: true, longPole: true, price: 48, builds: 2 },
  { type: "linear", housing: "nylon", spring: 78, lubed: false, price: 38, builds: 3 },
  { type: "silent", housing: "pom", spring: 62, lubed: true, price: 60, builds: 3 },
  { type: "clicky", housing: "nylon", spring: 70, lubed: false, price: 40, builds: 4 },
  { type: "linear", housing: "pom", spring: 50, lubed: true, longPole: true, price: 70, builds: 5 },
  { type: "tactile", housing: "pc", spring: 45, lubed: false, price: 42, builds: 6 },
  { type: "linear", housing: "nylon", spring: 60, lubed: true, price: 95, builds: 8 },
  { family: "box", type: "clicky", housing: "pc", spring: 65, lubed: false, price: 30, builds: 1 },
  { family: "box", type: "tactile", housing: "pc", spring: 62, lubed: false, price: 34, builds: 2 },
  { family: "box", type: "linear", housing: "pom", spring: 55, lubed: true, price: 52, builds: 4 },
  { family: "choc", type: "linear", housing: "nylon", spring: 50, lubed: false, price: 28, builds: 1 },
  { family: "choc", type: "tactile", housing: "nylon", spring: 55, lubed: false, price: 30, builds: 2 },
  { family: "choc", type: "clicky", housing: "pc", spring: 50, lubed: false, price: 30, builds: 3 },
];

const STEM_COLORS: Record<SwitchType, string[]> = {
  linear: ["#e23b3b", "#f2c230", "#ff7eb6", "#2b2b2b", "#ff8a3d"],
  tactile: ["#8b5a2b", "#c06a2b", "#7d4bc9", "#b0713f"],
  clicky: ["#2f6fe0", "#2fae5a", "#f0f0f0", "#1fb5c9"],
  silent: ["#7d8a96", "#3fb5a0", "#9aa7ff"],
};
const HOUSING_LOOK: Record<SwitchHousing, { colors: string[]; opacity: number }> = {
  nylon: { colors: ["#222326", "#f1efe9", "#e9e4d8"], opacity: 1 },
  pc: { colors: ["#dff1ff", "#cfd6de", "#ffe2f0"], opacity: 0.55 },
  pom: { colors: ["#ffd6e0", "#d6f5e3", "#e0dcff", "#fff1c9"], opacity: 1 },
};

interface CapArchetype {
  material: KeycapMaterial;
  profile: KeycapProfile;
  builds?: number;
}
const CAP_ARCHETYPES: CapArchetype[] = [
  { material: "abs", profile: "oem" },
  { material: "pbt", profile: "oem" },
  { material: "pbt", profile: "cherry" },
  { material: "abs", profile: "cherry" },
  { material: "pbt", profile: "xda" },
  { material: "pbt", profile: "dsa" },
  { material: "abs", profile: "sa", builds: 2 },
  { material: "pbt", profile: "cherry", builds: 2 },
  { material: "pbt", profile: "lp", builds: 1 },
  { material: "pbt", profile: "kat", builds: 3 },
  { material: "pbt", profile: "sa", builds: 3 },
  { material: "pom", profile: "cherry", builds: 4 },
  { material: "pbt", profile: "mt3", builds: 5 },
  { material: "abs", profile: "mt3", builds: 6 },
  { material: "abs", profile: "lp", builds: 6 },
  { material: "pom", profile: "xda", builds: 8 },
];
const CAP_MATERIAL_PRICE: Record<KeycapMaterial, number> = { abs: 35_00, pbt: 60_00, pom: 90_00 };
const CAP_PROFILE_PRICE: Record<KeycapProfile, number> = { oem: 0, cherry: 10_00, xda: 5_00, dsa: 5_00, sa: 30_00, mt3: 25_00, kat: 25_00, lp: 0 };

const round5 = (cents: number) => Math.max(5_00, Math.round(cents / 5_00) * 5_00);

function pickBrands(rng: Rng): { switch: string[]; caps: string[] } {
  const pool = rng.shuffle(names().brands);
  return { switch: pool.slice(0, 3), caps: pool.slice(3, 6) };
}

export function generateCatalog(seed: string): Catalog {
  const rng = derive(seed, "catalog");
  const brands = pickBrands(rng);
  const n = names();
  const usedNames = new Set<string>();
  const uniqueName = (make: () => string) => {
    for (let i = 0; i < 20; i++) {
      const s = make();
      if (!usedNames.has(s)) {
        usedNames.add(s);
        return s;
      }
    }
    return make();
  };

  const switches: SwitchProduct[] = ARCHETYPES.map((a, i) => {
    const look = HOUSING_LOOK[a.housing];
    return {
      id: `sw.${i}`,
      family: a.family ?? "mx",
      brand: rng.pick(brands.switch),
      name: uniqueName(() => `${rng.pick(n.switchAdj)} ${rng.pick(n.switchNoun)}`),
      type: a.type,
      springG: a.spring + rng.int(-3, 3),
      housing: a.housing,
      factoryLubed: a.lubed,
      longPole: !!a.longPole,
      stemColor: rng.pick(STEM_COLORS[a.type]),
      housingColor: rng.pick(look.colors),
      bottomColor: a.housing === "pc" ? rng.pick(["#222326", "#f1efe9", "#dff1ff"]) : undefined,
      housingOpacity: look.opacity,
      pricePerSwitch: Math.max(10, Math.round(a.price * rng.range(0.85, 1.15))),
      requires: a.builds ? { builds: a.builds } : undefined,
    };
  });

  // Make sure the starting keycap sets span several color families.
  const families = rng.shuffle(COLOR_FAMILIES);
  const keycaps: KeycapSet[] = CAP_ARCHETYPES.map((a, i) => {
    const cw = randomColorway(rng, families[i % families.length]);
    return {
      id: `kc.${i}`,
      brand: rng.pick(brands.caps),
      name: uniqueName(() => `${rng.pick(n.setAdj[cw.family])} ${rng.pick(n.setNoun[cw.hue])}`),
      material: a.material,
      profile: a.profile,
      colorway: cw,
      price: round5((CAP_MATERIAL_PRICE[a.material] + CAP_PROFILE_PRICE[a.profile]) * rng.range(0.9, 1.15)),
      requires: a.builds ? { builds: a.builds } : undefined,
    };
  });

  const extra: Record<CaseMaterial, number> = { plastic: 6, aluminum: 6, acrylic: 3, polycarbonate: 2, wood: 2, brass: 0 };
  const caseColors = Object.fromEntries(
    CASE_MATERIALS.map((m) => {
      const generated: CaseColor[] = Array.from({ length: extra[m.id] }, (_, i) => {
        const hex = randomCaseColor(m.id, () => rng.next());
        return { id: `g${i}`, hex, hue: classifyColor(hex) };
      });
      return [m.id, [...m.colors, ...generated]];
    }),
  ) as Record<CaseMaterial, CaseColor[]>;

  return { switches, keycaps, caseColors };
}

const catalogCache = new Map<string, Catalog>();
export function getCatalog(seed: string): Catalog {
  let c = catalogCache.get(seed);
  if (!c) catalogCache.set(seed, (c = generateCatalog(seed)));
  return c;
}
