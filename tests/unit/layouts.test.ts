import { describe, expect, it } from "vitest";
import { getLayout, LAYOUT_IDS, needsStab } from "../../src/data/layouts";

describe("layouts", () => {
  const expected = { "40": [12.75, 4, 41], "60": [15, 5, 61], "65": [16, 5, 68], "75": [16, 6, 84], tkl: [18.25, 6.25, 87], full: [22.5, 6.25, 104] } as const;
  for (const id of LAYOUT_IDS) {
    it(`${id}% has the right size and key count`, () => {
      const l = getLayout(id);
      const [w, d, n] = expected[id];
      expect(l.width).toBeCloseTo(w, 5);
      expect(l.depth).toBeCloseTo(d, 5);
      expect(l.keys.length).toBe(n);
    });
    it(`${id}% has no overlapping keys and every row fills the width`, () => {
      const l = getLayout(id);
      for (const a of l.keys)
        for (const b of l.keys) {
          if (a.id >= b.id) continue;
          const overlap = a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
          expect(overlap, `${a.label}/${b.label}`).toBe(false);
        }
      for (const k of l.keys) expect(k.x + k.w).toBeLessThanOrEqual(l.width + 1e-6);
    });
    it(`${id}% codes are unique and it has stabilized keys`, () => {
      const codes = getLayout(id).keys.map((k) => k.code).filter(Boolean);
      expect(new Set(codes).size).toBe(codes.length);
      expect(getLayout(id).keys.some(needsStab)).toBe(true);
    });
  }
});
