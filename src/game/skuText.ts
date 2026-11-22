/** Names, descriptions and icons for stock items (shared by the drawer, Stock and Suppliers). */
import { parseSku } from "../build/stock";
import type { Catalog } from "../data/catalog";
import { classifyColor, toneOf } from "../data/color";
import { CASE_MATERIALS, DAMPENING, PCBS, PLATES, STABS, type SoundMods } from "../data/parts";
import { allKeys, t, tx, type MessageKey } from "../i18n";
import type { Painter } from "../gui/widgets";
import { caseIcon, foamIcon, keycapsIcon, pcbIcon, plateIcon, stabIcon, switchIcon } from "./bench/icons";

const KNOWN = new Set<string>(allKeys());
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function colorName(c: { id: string; hex: string }): string {
  if (KNOWN.has(`part.color.${c.id}`)) return t(`part.color.${c.id}` as MessageKey);
  return cap(tx("color.named", { tone: `@color.tone.${toneOf(c.hex)}`, hue: `@color.hue.${classifyColor(c.hex)}` }).trim());
}

export const layoutName = (id: string) => t(`layout.name.${id}` as MessageKey);
export const fpName = (fp: string | undefined) => (fp === "choc" ? "Choc" : "MX");

export interface SkuView {
  title: string;
  sub: string;
  icon: Painter;
  effects?: SoundMods;
}

export function caseColorOf(cat: Catalog, material: string, colorId: string) {
  return cat.caseColors[material as keyof Catalog["caseColors"]]?.find((c) => c.id === colorId);
}

export function skuView(sku: string, cat: Catalog): SkuView {
  const s = parseSku(sku);
  const unknown: SkuView = { title: sku, sub: "", icon: () => {} };
  if (!s) return unknown;
  switch (s.kind) {
    case "case": {
      const m = CASE_MATERIALS.find((x) => x.id === s.id);
      const c = caseColorOf(cat, s.id, s.color!);
      if (!m || !c) return unknown;
      return {
        title: `${layoutName(s.layout!)} ${t(`part.case.${m.id}` as MessageKey)}`,
        sub: `${colorName(c)} · ${t("bench.mount", { mount: t(`part.mount.${m.mount}` as MessageKey) })}`,
        icon: caseIcon(c.hex, m.id),
        effects: m.sound,
      };
    }
    case "pcb": {
      const p = PCBS.find((x) => x.id === s.id);
      if (!p) return unknown;
      return { title: `${layoutName(s.layout!)} ${t(`part.pcb.${p.id}` as MessageKey)}`, sub: `${fpName(s.fp)} · ${t(`part.pcbDesc.${p.id}` as MessageKey)}`, icon: pcbIcon(p.color, p.rgb, p.flex), effects: p.sound };
    }
    case "plate": {
      const p = PLATES.find((x) => x.id === s.id);
      if (!p) return unknown;
      return { title: `${layoutName(s.layout!)} ${t(`part.plate.${p.id}` as MessageKey)}`, sub: `${fpName(s.fp)} ${t("step.plate.title").toLowerCase()}`, icon: plateIcon(p.color, false), effects: p.sound };
    }
    case "stab": {
      const st = STABS.find((x) => x.id === s.id);
      if (!st) return unknown;
      return { title: t(`part.stabs.${st.id}` as MessageKey), sub: fpName(s.fp), icon: stabIcon(st.id === "premium" ? "#f1f1f1" : st.id === "standard" ? "#2a2a2a" : "#8a8a8a") };
    }
    case "sw": {
      const sw = cat.switches.find((x) => x.id === s.id);
      if (!sw) return unknown;
      return {
        title: `${sw.brand} ${sw.name}`,
        sub: [
          `${sw.family === "choc" ? "Choc" : sw.family === "box" ? "Box" : "MX"} · ${t("part.switch.spec", { type: t(`part.switchType.${sw.type}` as MessageKey), weight: sw.springG, housing: t(`part.housing.${sw.housing}` as MessageKey) })}`,
          sw.factoryLubed ? t("part.switch.lubed") : null,
          sw.longPole ? t("part.switch.longPole") : null,
        ]
          .filter(Boolean)
          .join(" · "),
        icon: switchIcon(sw.housingColor, sw.housingOpacity, sw.stemColor),
      };
    }
    case "kc": {
      const k = cat.keycaps.find((x) => x.id === s.id);
      if (!k) return unknown;
      return {
        title: `${k.brand} “${k.name}”`,
        sub: `${t(`part.keycap.profile.${k.profile}` as MessageKey)} · ${t(`part.keycap.material.${k.material}` as MessageKey)} · ${tx(`color.family.${k.colorway.family}`)}`,
        icon: keycapsIcon(k.colorway),
      };
    }
    case "foam": {
      const d = DAMPENING.find((x) => x.id === s.id);
      if (!d) return unknown;
      return { title: t(`part.damp.${d.id}` as MessageKey), sub: t(`part.dampDesc.${d.id}` as MessageKey), icon: foamIcon(d.id === "caseFoam" ? "#3d4148" : d.id === "plateFoam" ? "#d8d1bd" : d.id === "silicone" ? "#dfe8ee" : "#fafafa", d.id), effects: d.sound };
    }
    case "lube":
      return { title: t("stock.lube"), sub: "", icon: lubeIcon };
  }
}

export const lubeIcon: Painter = (g, x, y, w, h, r) => {
  const jw = Math.min(w, h) * 0.5;
  const cx = x + w / 2;
  const cy = y + h / 2;
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.strokeStyle = "rgba(0,0,0,0.25)";
  g.lineWidth = 2 * r;
  g.beginPath();
  g.roundRect(cx - jw / 2, cy - jw * 0.35, jw, jw * 0.8, 6 * r);
  g.fill();
  g.stroke();
  g.fillStyle = "#f0dfa8";
  g.fillRect(cx - jw / 2 + 3 * r, cy, jw - 6 * r, jw * 0.4);
  g.fillStyle = "#2d6fd6";
  g.beginPath();
  g.roundRect(cx - jw / 2 - 2 * r, cy - jw * 0.5, jw + 4 * r, jw * 0.2, 4 * r);
  g.fill();
};

export const cartIcon: Painter = (g, x, y, w, h, r) => {
  g.font = `${36 * r}px sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("🛒", x + w / 2, y + h / 2);
};

const TOOL_EMOJI: Record<string, string> = { lubeStation: "🧴", switchPress: "🗜️", solderStation: "🔥", torqueDriver: "🪛", keyTester: "🧪", packingStation: "📦" };
export const toolIcon = (id: string): Painter => (g, x, y, w, h, r) => {
  g.font = `${34 * r}px sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(TOOL_EMOJI[id] ?? "🛠", x + w / 2, y + h / 2);
};
