import { describe, expect, it } from "vitest";
import { derive, Rng } from "../../src/core/rng";

describe("Rng", () => {
  it("is deterministic for the same seed", () => {
    const a = new Rng("ABC");
    const b = new Rng("ABC");
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it("differs between seeds and derived labels", () => {
    expect(new Rng("A").next()).not.toBe(new Rng("B").next());
    expect(derive("S", "day", 1).next()).not.toBe(derive("S", "day", 2).next());
  });
  it("int() stays in range and hits both ends", () => {
    const r = new Rng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });
  it("is roughly uniform", () => {
    const r = new Rng("uniform");
    let sum = 0;
    for (let i = 0; i < 20000; i++) sum += r.next();
    expect(sum / 20000).toBeGreaterThan(0.48);
    expect(sum / 20000).toBeLessThan(0.52);
  });
});
