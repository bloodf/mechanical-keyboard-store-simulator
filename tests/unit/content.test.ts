import { describe, expect, it } from "vitest";
import { allKeys, variantCount, tx } from "../../src/i18n";
import { LAYOUT_IDS } from "../../src/data/layouts";
import { CASE_MATERIALS, DAMPENING, PCBS, PLATES, STABS, STAB_MODS } from "../../src/data/parts";
import { generateCatalog } from "../../src/data/catalog";
import { generateJob, generateOrder } from "../../src/build/jobs";
import { KEYCAP_PROFILES } from "../../src/data/profiles";
import { ALL_STEPS } from "../../src/build/session";
import { AXES } from "../../src/build/profile";
import { COLOR_FAMILIES } from "../../src/data/colorway";

const keys = new Set<string>(allKeys());
const has = (k: string) => expect(keys.has(k), k).toBe(true);

describe("every generated/dynamic text has a translation", () => {
  it("parts, layouts, steps, axes", () => {
    for (const id of LAYOUT_IDS) (has(`layout.name.${id}`), has(`layout.desc.${id}`));
    for (const m of CASE_MATERIALS) {
      has(`part.case.${m.id}`);
      has(`part.mount.${m.mount}`);
      for (const c of m.colors) has(`part.color.${c.id}`);
    }
    for (const p of PCBS) (has(`part.pcb.${p.id}`), has(`part.pcbDesc.${p.id}`));
    for (const p of PLATES) has(`part.plate.${p.id}`);
    for (const d of DAMPENING) (has(`part.damp.${d.id}`), has(`part.dampDesc.${d.id}`));
    for (const s of STABS) has(`part.stabs.${s.id}`);
    for (const m of STAB_MODS) (has(`part.stabMod.${m}`), has(`part.stabModDesc.${m}`));
    for (const s of ALL_STEPS) (has(`step.${s}.title`), s === "deliver" || has(`step.${s}.hint`));
    for (const a of AXES) has(`axis.${a}`);
    for (const f of COLOR_FAMILIES) has(`color.family.${f}`);
  });
  it("catalog products use known switch/keycap vocab", () => {
    const cat = generateCatalog("TEXT");
    for (const s of cat.switches) (has(`part.switchType.${s.type}`), has(`part.housing.${s.housing}`));
    for (const k of cat.keycaps) {
      has(`part.keycap.material.${k.material}`);
      has(`part.keycap.profile.${k.profile}`);
      has(`color.hue.${k.colorway.hue}`);
    }
  });
  it("200 generated jobs render their quotes without missing keys", () => {
    const cat = generateCatalog("QUOTES");
    for (let i = 0; i < 200; i++) {
      const j = generateJob("QUOTES", i, cat, i % 10);
      has(`persona.${j.customer.persona}`);
      has(`feel.${j.feel}`);
      for (const w of j.sound) has(`sound.word.${w}`);
      for (const q of j.quote) {
        has(q.key);
        const text = tx(q.key, q.params);
        expect(text, q.key).not.toMatch(/⟦|\{\w+\}|@/);
      }
    }
  });
  it("result reactions have 3 variants per mood, complaints for every score part", () => {
    for (const mood of ["ecstatic", "happy", "meh", "annoyed", "furious"]) expect(variantCount(`result.reaction.${mood}`)).toBe(3);
    for (const c of ["layout", "sound", "feel", "theme", "quality", "spec"]) (has(`result.complaint.${c}`), has(`result.component.${c}`));
  });
  it("workshop orders (incl. membrane requests and wishes) render without missing keys", () => {
    const cat = generateCatalog("ORDERS");
    let membrane = 0;
    for (let i = 0; i < 300; i++) {
      const o = generateOrder("ORDERS", i, cat, { day: 1 + (i % 9), builds: i % 12, tutorial: i === 0 });
      if (o.kind === "membrane") membrane++;
      for (const q of o.quote) {
        has(q.key);
        expect(tx(q.key, q.params), q.key).not.toMatch(/⟦|\{\w+\}|@/);
      }
    }
    expect(membrane).toBeGreaterThan(10);
  });
  it("mail, reviews and membrane replies have their variants", () => {
    for (const mood of ["ecstatic", "happy", "meh", "annoyed", "furious", "late"]) expect(variantCount(`review.${mood}`)).toBe(3);
    for (const r of [0, 1, 2]) (expect(variantCount(`membrane.reply.${r}`)).toBe(3), has(`orders.reply.${r}`));
    for (const k of ["welcome", "review", "complaint", "reply", "cancelled", "membrane", "delivery"]) has(`mail.subject.${k}`);
    for (const p of KEYCAP_PROFILES) has(`part.keycap.profile.${p}`);
    for (const c of ["all", "case", "pcb", "plate", "stab", "sw", "kc", "foam", "lube"]) has(`stock.cat.${c}`);
  });
});
