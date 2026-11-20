/**
 * Seeded random numbers. Every run has a world seed. Days, customers, etc. derive
 * their own sub-seeds from it, so the game is always new but reproducible for debugging.
 */

/** 32-bit FNV-1a + avalanche hash of a string, used to turn seeds/labels into numbers. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string | number) {
    const s = String(seed);
    this.a = hashString(s + "#a");
    this.b = hashString(s + "#b");
    this.c = hashString(s + "#c");
    this.d = hashString(s + "#d");
    for (let i = 0; i < 12; i++) this.next(); // warm up
  }

  /** sfc32: float in [0, 1). */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick: empty list");
    return items[Math.floor(this.next() * items.length)];
  }

  weighted<T>(items: readonly { item: T; weight: number }[]): T {
    const total = items.reduce((s, i) => s + i.weight, 0);
    let r = this.next() * total;
    for (const i of items) {
      r -= i.weight;
      if (r < 0) return i.item;
    }
    return items[items.length - 1].item;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

/** Deterministic child generator, e.g. derive(worldSeed, "day", 12, "customer", 3). */
export function derive(seed: string, ...labels: (string | number)[]): Rng {
  return new Rng([seed, ...labels].join("/"));
}

/** A fresh random world seed (not deterministic — only used when starting a new game). */
export function newWorldSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12).toUpperCase();
}
