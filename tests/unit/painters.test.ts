/** 2D painters (part icons, radar chart) and item names, drawn on a real canvas (@napi-rs/canvas). */
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { computeProfile, targetRanges } from "../../src/build/profile";
import { newSession } from "../../src/build/session";
import { generateJob } from "../../src/build/jobs";
import { skuCase, skuFoam, skuKeycaps, skuPcb, skuPlate, skuStab, skuSwitch, SKU_LUBE } from "../../src/build/stock";
import { TOOLS } from "../../src/build/tools";
import { generateCatalog } from "../../src/data/catalog";
import { LAYOUT_IDS } from "../../src/data/layouts";
import { CASE_MATERIALS, DAMPENING, PCBS, PLATES, STABS } from "../../src/data/parts";
import { caseIcon, diceIcon, foamIcon, keycapsIcon, layoutIcon, modIcon, pcbIcon, plateIcon, stabIcon, swatchIcon, switchIcon } from "../../src/game/bench/icons";
import { radarPainter } from "../../src/game/bench/radar";
import { cartIcon, colorName, fpName, layoutName, lubeIcon, skuView, toolIcon } from "../../src/game/skuText";
import type { Painter } from "../../src/gui/widgets";

const cat = generateCatalog("PAINT1");

/** Paint and return how many pixels were touched (not transparent). */
function paint(p: Painter, w = 160, h = 110): number {
  const c = createCanvas(w, h);
  const g = c.getContext("2d") as unknown as Parameters<Painter>[0];
  p(g, 0, 0, w, h, 1);
  const data = c.getContext("2d").getImageData(0, 0, w, h).data;
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
  return n;
}

describe("icons", () => {
  it("every part icon draws something", () => {
    for (const l of LAYOUT_IDS) expect(paint(layoutIcon(l))).toBeGreaterThan(500);
    for (const m of CASE_MATERIALS) expect(paint(caseIcon(m.colors[0].hex, m.id))).toBeGreaterThan(500);
    for (const p of PCBS) expect(paint(pcbIcon(p.color, p.rgb, p.flex))).toBeGreaterThan(500);
    for (const p of PLATES) expect(paint(plateIcon(p.color, p.id === "none"))).toBeGreaterThan(100);
    for (const d of DAMPENING) expect(paint(foamIcon("#888888", d.id))).toBeGreaterThan(100);
    expect(paint(stabIcon("#222222"))).toBeGreaterThan(100);
    for (const s of cat.switches) expect(paint(switchIcon(s.housingColor, s.housingOpacity, s.stemColor))).toBeGreaterThan(100);
    for (const k of cat.keycaps) expect(paint(keycapsIcon(k.colorway))).toBeGreaterThan(500);
    expect(paint(swatchIcon("#ff0000"))).toBeGreaterThan(100);
    for (const p of [diceIcon, modIcon("clip"), modIcon("bandaid"), cartIcon, lubeIcon, ...TOOLS.map((x) => toolIcon(x.id)), toolIcon("nope")]) paint(p);
  });
  it("the radar chart draws a build against a request (with and without labels, with no build yet)", () => {
    const job = generateJob("PAINT1", 1, cat, 3);
    const b = newSession({ ...job, kind: "build", received: 1, expires: 2, due: 3 });
    b.switchId = cat.switches[0].id;
    const profile = computeProfile(b, cat).sound;
    expect(paint(radarPainter(() => ({ profile, target: targetRanges(job.sound) })), 260, 220)).toBeGreaterThan(2000);
    expect(paint(radarPainter(() => ({ profile: null, target: targetRanges(["quiet", "clicky"]) }), false), 200, 200)).toBeGreaterThan(200);
  });
});

describe("item names", () => {
  it("every kind of stock item has a title, description and icon", () => {
    const skus = [
      skuCase("aluminum", "65", cat.caseColors.aluminum[0].id),
      skuCase("plastic", "tkl", cat.caseColors.plastic.at(-1)!.id),
      ...PCBS.map((p) => skuPcb(p.id, "75", "choc")),
      ...PLATES.filter((p) => p.id !== "none").map((p) => skuPlate(p.id, "40", "mx")),
      ...STABS.map((s) => skuStab(s.id, "mx")),
      ...cat.switches.map((s) => skuSwitch(s.id)),
      ...cat.keycaps.map((k) => skuKeycaps(k.id)),
      ...DAMPENING.map((d) => skuFoam(d.id)),
      SKU_LUBE,
    ];
    for (const sku of skus) {
      const v = skuView(sku, cat);
      expect(v.title, sku).not.toBe(sku);
      expect(v.title).not.toMatch(/⟦/);
      expect(paint(v.icon)).toBeGreaterThan(0);
    }
    for (const bad of ["nope", "case/nope/65/x", "pcb/nope/65/mx", "plate/nope/65/mx", "stab/nope/mx", "sw/nope", "kc/nope", "foam/nope"]) expect(skuView(bad, cat).title).toBe(bad);
    expect(colorName({ id: "navy", hex: "#2c3e66" })).toBe("Navy");
    expect(colorName({ id: "g3", hex: "#3355dd" })).toMatch(/blue/i);
    expect(layoutName("tkl")).toBe("TKL");
    expect(fpName("choc")).toBe("Choc");
    expect(fpName(undefined)).toBe("MX");
  });
});
