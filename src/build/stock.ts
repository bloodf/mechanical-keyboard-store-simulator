/**
 * Workshop stock: every part is a SKU string, the inventory counts units per SKU.
 *   case/<material>/<layout>/<colorId>   one case
 *   pcb/<id>/<layout>/<mx|choc>          one PCB (footprint: MX & Box switches use "mx")
 *   plate/<id>/<layout>/<mx|choc>        one plate
 *   stab/<id>/<mx|choc>                  a stabilizer kit for one board
 *   sw/<switchId>                        one switch (sold in packs)
 *   kc/<setId>                           one keycap set (covers every layout)
 *   foam/<dampId>                        one sheet / roll, enough for one board
 *   lube                                 one portion: enough to lube one board's switches
 * Prices are integer cents (unit price). Framework-free: used by the UI and by tests.
 */
import type { Catalog } from "../data/catalog";
import { getLayout, LAYOUT_IDS, type LayoutId } from "../data/layouts";
import { PROFILE_GEO } from "../data/profiles";
import type { JobRequest } from "./types";
import { CASE_MATERIALS, DAMPENING, LAYOUT_PRICE_FACTOR, PCBS, PLATES, STABS, type CaseMaterial } from "../data/parts";
import type { CapMount, SwitchFamily } from "../data/profiles";
import { MOUNT_OF_FAMILY } from "../data/profiles";

export type Footprint = CapMount;
export type SkuKind = "case" | "pcb" | "plate" | "stab" | "sw" | "kc" | "foam" | "lube";

export interface SkuInfo {
  kind: SkuKind;
  id: string; // material / pcb id / plate id / stab id / switch id / set id / damp id / ""
  layout?: LayoutId;
  fp?: Footprint;
  color?: string;
}

export const skuCase = (m: CaseMaterial, layout: LayoutId, color: string) => `case/${m}/${layout}/${color}`;
export const skuPcb = (id: string, layout: LayoutId, fp: Footprint) => `pcb/${id}/${layout}/${fp}`;
export const skuPlate = (id: string, layout: LayoutId, fp: Footprint) => `plate/${id}/${layout}/${fp}`;
export const skuStab = (id: string, fp: Footprint) => `stab/${id}/${fp}`;
export const skuSwitch = (id: string) => `sw/${id}`;
export const skuKeycaps = (id: string) => `kc/${id}`;
export const skuFoam = (id: string) => `foam/${id}`;
export const SKU_LUBE = "lube";

export function parseSku(sku: string): SkuInfo | null {
  const p = sku.split("/");
  switch (p[0]) {
    case "case":
      return p.length === 4 ? { kind: "case", id: p[1], layout: p[2] as LayoutId, color: p[3] } : null;
    case "pcb":
    case "plate":
      return p.length === 4 ? { kind: p[0], id: p[1], layout: p[2] as LayoutId, fp: p[3] as Footprint } : null;
    case "stab":
      return p.length === 3 ? { kind: "stab", id: p[1], fp: p[2] as Footprint } : null;
    case "sw":
    case "kc":
    case "foam":
      return p.length === 2 ? { kind: p[0], id: p[1] } : null;
    case "lube":
      return p.length === 1 ? { kind: "lube", id: "" } : null;
  }
  return null;
}

const scaled = (cents: number, layout: LayoutId) => Math.round((cents * LAYOUT_PRICE_FACTOR[layout]) / 100) * 100;
/** Choc (low-profile) PCBs and plates are a little pricier. */
const fpFactor = (fp: Footprint | undefined) => (fp === "choc" ? 1.15 : 1);

/** Unit price of a SKU (what the supplier charges), or null if the SKU doesn't exist. */
export function unitPrice(sku: string, cat: Catalog): number | null {
  const s = parseSku(sku);
  if (!s) return null;
  switch (s.kind) {
    case "case": {
      const m = CASE_MATERIALS.find((c) => c.id === s.id);
      if (!m || !s.layout || !cat.caseColors[m.id]?.some((c) => c.id === s.color)) return null;
      return scaled(m.price, s.layout);
    }
    case "pcb": {
      const p = PCBS.find((x) => x.id === s.id);
      return p && s.layout ? Math.round((scaled(p.price, s.layout) * fpFactor(s.fp)) / 100) * 100 : null;
    }
    case "plate": {
      const p = PLATES.find((x) => x.id === s.id);
      return p && p.id !== "none" && s.layout ? Math.round((scaled(p.price, s.layout) * fpFactor(s.fp)) / 100) * 100 : null;
    }
    case "stab": {
      const st = STABS.find((x) => x.id === s.id);
      return st ? st.price : null;
    }
    case "sw": {
      const sw = cat.switches.find((x) => x.id === s.id);
      return sw ? sw.pricePerSwitch : null;
    }
    case "kc": {
      const kc = cat.keycaps.find((x) => x.id === s.id);
      return kc ? kc.price : null;
    }
    case "foam": {
      const d = DAMPENING.find((x) => x.id === s.id);
      return d ? d.price : null;
    }
    case "lube":
      return 4_00;
  }
}

/** Switch pack sizes with bulk discounts. */
export const SWITCH_PACKS: { n: number; discount: number }[] = [
  { n: 10, discount: 0 },
  { n: 35, discount: 0.05 },
  { n: 70, discount: 0.1 },
  { n: 110, discount: 0.15 },
];
export const LUBE_JAR = 3; // portions per jar

export function packPrice(unit: number, n: number): number {
  const d = SWITCH_PACKS.find((p) => p.n === n)?.discount ?? 0;
  return Math.round(unit * n * (1 - d));
}

// ---------------------------------------------------------------- shipping
export type Shipping = "standard" | "express";
export const SHIPPING_FEE: Record<Shipping, (subtotal: number) => number> = {
  standard: (sub) => (sub >= 150_00 ? 0 : 8_00),
  express: (sub) => 15_00 + Math.round(sub * 0.1),
};
/** Express arrives this many workshop minutes after ordering; standard arrives the next morning. */
export const EXPRESS_MINUTES = 120;

// ---------------------------------------------------------------- inventory helpers
export type Inventory = Record<string, number>;

export function have(inv: Inventory, sku: string): number {
  return inv[sku] ?? 0;
}

export function take(inv: Inventory, sku: string, n = 1): boolean {
  if ((inv[sku] ?? 0) < n) return false;
  inv[sku] -= n;
  if (inv[sku] === 0) delete inv[sku];
  return true;
}

export function give(inv: Inventory, sku: string, n = 1) {
  if (n <= 0) return;
  inv[sku] = (inv[sku] ?? 0) + n;
}

/** How many switches a layout needs. */
export function switchesNeeded(layout: LayoutId): number {
  return getLayout(layout).keys.length;
}

export function footprintOf(f: SwitchFamily): Footprint {
  return MOUNT_OF_FAMILY[f];
}

/** Everything a typical first build needs (the starter kit in a new game). */
export function starterKit(cat: Catalog): Inventory {
  const inv: Inventory = {};
  const black = cat.caseColors.plastic.find((c) => c.id === "black") ?? cat.caseColors.plastic[0];
  give(inv, skuCase("plastic", "65", black.id), 1);
  give(inv, skuPcb("hotswap", "65", "mx"), 1);
  give(inv, skuPlate("aluminum", "65", "mx"), 1);
  give(inv, skuStab("standard", "mx"), 1);
  const linear = cat.switches.find((s) => s.family === "mx" && s.type === "linear" && !s.requires) ?? cat.switches[0];
  give(inv, skuSwitch(linear.id), 70);
  const caps = cat.keycaps.find((k) => !k.requires && k.profile !== "lp") ?? cat.keycaps[0];
  give(inv, skuKeycaps(caps.id), 1);
  give(inv, skuFoam("caseFoam"), 2);
  give(inv, skuFoam("tape"), 1);
  give(inv, SKU_LUBE, 2);
  return inv;
}

/** Value of the stock at supplier prices (for the stock panel). */
export function stockValue(inv: Inventory, cat: Catalog): number {
  let v = 0;
  for (const [sku, n] of Object.entries(inv)) v += (unitPrice(sku, cat) ?? 0) * n;
  return v;
}

// ---------------------------------------------------------------- can this order be built from the shelf?
export type SlotKind = "case" | "pcb" | "stab" | "sw" | "kc";

/**
 * Parts still missing to build an order from the current stock (best layout/footprint option).
 * Plates and foams are optional (plateless builds exist), lube can be skipped.
 */
export function missingFor(o: JobRequest, inv: Inventory, cat: Catalog): SlotKind[] {
  const layouts = LAYOUT_IDS.filter((l) => layoutFits(o.layout, l));
  const fps: Footprint[] = o.wants?.lowProfile ? ["choc"] : ["mx", "choc"];
  const skus = Object.keys(inv).filter((k) => inv[k] > 0);
  let best: SlotKind[] | null = null;
  for (const l of layouts) {
    for (const fp of fps) {
      const miss: SlotKind[] = [];
      const hasCase = skus.some((k) => {
        const s = parseSku(k)!;
        return s.kind === "case" && s.layout === l && (!o.wants?.caseMaterial || s.id === o.wants.caseMaterial);
      });
      if (!hasCase) miss.push("case");
      const hasPcb = skus.some((k) => {
        const s = parseSku(k)!;
        return s.kind === "pcb" && s.layout === l && s.fp === fp && (!o.wants?.hotswap || PCBS.find((p) => p.id === s.id)?.hotswap);
      });
      if (!hasPcb) miss.push("pcb");
      if (!skus.some((k) => k.startsWith("stab/") && k.endsWith(`/${fp}`))) miss.push("stab");
      const need = switchesNeeded(l);
      const hasSw = skus.some((k) => {
        if (!k.startsWith("sw/")) return false;
        const sw = cat.switches.find((x) => x.id === k.slice(3));
        return !!sw && MOUNT_OF_FAMILY[sw.family] === fp && inv[k] >= need;
      });
      if (!hasSw) miss.push("sw");
      const hasKc = skus.some((k) => {
        if (!k.startsWith("kc/")) return false;
        const kc = cat.keycaps.find((x) => x.id === k.slice(3));
        return !!kc && PROFILE_GEO[kc.profile].mount === fp && (!o.wants?.profile || kc.profile === o.wants.profile);
      });
      if (!hasKc) miss.push("kc");
      if (!best || miss.length < best.length) best = miss;
      if (!miss.length) return [];
    }
  }
  return best ?? ["case", "pcb", "stab", "sw", "kc"];
}

function layoutFits(req: JobRequest["layout"], id: LayoutId): boolean {
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
