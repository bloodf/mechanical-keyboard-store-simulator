/**
 * The per-run parts catalog: brands, switches and keycap sets are generated from the world seed,
 * so every new game has different products (names, specs, colorways, prices).
 * Base materials (cases, plates, PCBs, foams, stabs) are fixed in parts.ts.
 */
import { derive, type Rng } from "../core/rng";
import { names } from "../i18n";
import { COLOR_FAMILIES, randomColorway, type Colorway } from "../world/colorway";
import type { KeycapMaterial, KeycapProfile, Requires, SwitchHousing, SwitchType } from "./parts";

export interface SwitchProduct {
  id: string;
  brand: string;
  name: string;
  type: SwitchType;
  springG: number;
  housing: SwitchHousing;
  factoryLubed: boolean;
  longPole: boolean;
  stemColor: string;
  housingColor: string;
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
}

interface SwitchArchetype {
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
  { material: "abs", profile: "standard" },
  { material: "pbt", profile: "standard" },
  { material: "pbt", profile: "low" },
  { material: "abs", profile: "low" },
  { material: "pbt", profile: "flat" },
  { material: "abs", profile: "sphere", builds: 2 },
  { material: "pbt", profile: "low", builds: 2 },
  { material: "pbt", profile: "sphere", builds: 3 },
  { material: "pom", profile: "low", builds: 4 },
  { material: "pbt", profile: "deep", builds: 5 },
  { material: "abs", profile: "deep", builds: 6 },
  { material: "pom", profile: "flat", builds: 8 },
];
const CAP_MATERIAL_PRICE: Record<KeycapMaterial, number> = { abs: 35_00, pbt: 60_00, pom: 90_00 };
const CAP_PROFILE_PRICE: Record<KeycapProfile, number> = { standard: 0, low: 10_00, flat: 5_00, sphere: 30_00, deep: 25_00 };

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
      brand: rng.pick(brands.switch),
      name: uniqueName(() => `${rng.pick(n.switchAdj)} ${rng.pick(n.switchNoun)}`),
      type: a.type,
      springG: a.spring + rng.int(-3, 3),
      housing: a.housing,
      factoryLubed: a.lubed,
      longPole: !!a.longPole,
      stemColor: rng.pick(STEM_COLORS[a.type]),
      housingColor: rng.pick(look.colors),
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

  return { switches, keycaps };
}

const catalogCache = new Map<string, Catalog>();
export function getCatalog(seed: string): Catalog {
  let c = catalogCache.get(seed);
  if (!c) catalogCache.set(seed, (c = generateCatalog(seed)));
  return c;
}
