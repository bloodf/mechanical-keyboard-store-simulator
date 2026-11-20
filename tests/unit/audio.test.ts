import { describe, expect, it } from "vitest";
import { SFX, SFX_CATEGORIES, SFX_IDS } from "../../src/audio/library";
import { allKeys } from "../../src/i18n";

describe("sound library", () => {
  const keys = new Set<string>(allKeys());
  it("every sound and category has a translatable name", () => {
    for (const id of SFX_IDS) expect(keys.has(`sfx.${id}`), id).toBe(true);
    for (const c of SFX_CATEGORIES) expect(keys.has(`sfx.cat.${c}`), c).toBe(true);
  });
  it("every sound belongs to a known category; every category has sounds", () => {
    for (const id of SFX_IDS) expect(SFX_CATEGORIES).toContain(SFX[id].category);
    for (const c of SFX_CATEGORIES) expect(SFX_IDS.some((id) => SFX[id].category === c), c).toBe(true);
  });
  it("has no music entries (design rule: sound effects only)", () => {
    expect(SFX_IDS.filter((id) => /music|bgm|theme|song/i.test(id))).toEqual([]);
  });
});
