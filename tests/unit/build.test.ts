import { describe, expect, it } from "vitest";
import { Rng } from "../../src/core/rng";
import { generateCatalog, type Catalog } from "../../src/data/catalog";
import { CASE_MATERIALS, DAMPENING, isUnlocked, PCBS, PLATES, STABS } from "../../src/data/parts";
import { generateJob } from "../../src/build/jobs";
import { computeProfile, SOUND_COMBOS, soundMatch, partsCost } from "../../src/build/profile";
import { evaluateBuild } from "../../src/build/scoring";
import { newSession, applySolder, stepsFor } from "../../src/build/session";
import type { BuildSession, JobRequest, Order } from "../../src/build/types";

const asOrder = (j: JobRequest): Order => ({ ...j, kind: "build", received: 1, expires: 2, due: 4 });

function randomBuild(job: JobRequest, cat: Catalog, rng: Rng, builds: number): BuildSession {
  const b = newSession(asOrder(job));
  const ok = <T extends { requires?: { builds?: number } }>(xs: T[]) => xs.filter((x) => isUnlocked(x.requires, builds));
  b.layout = "65";
  const cm = rng.pick(ok(CASE_MATERIALS));
  b.caseMaterial = cm.id;
  b.caseColor = { id: cm.colors[0].id, hex: cm.colors[0].hex };
  b.pcb = rng.pick(ok(PCBS)).id;
  b.damp = ok(DAMPENING).filter(() => rng.chance(0.5)).map((d) => d.id);
  b.tapeQuality = 1;
  b.plate = rng.pick(ok(PLATES)).id;
  b.stabs = rng.pick(ok(STABS)).id;
  b.stabMods = ["clip", "bandaid"];
  b.stabLube = 1;
  b.switchId = rng.pick(ok(cat.switches)).id;
  const skip = rng.chance(0.3);
  b.lube = { quality: skip ? 0 : 1, over: 0, skipped: skip };
  b.keycapsId = rng.pick(ok(cat.keycaps)).id;
  b.screws = { quality: 1, loose: 0, stripped: 0 };
  return b;
}

function bestSoundMatch(words: (typeof SOUND_COMBOS)[number], builds: number, seed = "BALANCE1") {
  const cat = generateCatalog(seed);
  const job = generateJob(seed, 0, cat, builds);
  const rng = new Rng("search" + words.join());
  let best = 0;
  for (let i = 0; i < 4000 && best < 0.999; i++) {
    const b = randomBuild(job, cat, rng, builds);
    best = Math.max(best, soundMatch(computeProfile(b, cat).sound, words));
  }
  return best;
}

describe("balance: every sound request is achievable", () => {
  for (const combo of SOUND_COMBOS) {
    it(`${combo.join(" + ")} with starting parts (≥ 85%) and with everything (100%)`, () => {
      expect(bestSoundMatch(combo, 0)).toBeGreaterThanOrEqual(0.85);
      expect(bestSoundMatch(combo, 99)).toBeGreaterThanOrEqual(0.999);
    });
  }
});

describe("catalog & jobs", () => {
  it("are deterministic per seed and different across seeds", () => {
    expect(generateCatalog("AAAA")).toEqual(generateCatalog("AAAA"));
    expect(generateCatalog("AAAA").switches[0].name).not.toEqual(generateCatalog("BBBB").switches[0].name);
    const cat = generateCatalog("AAAA");
    expect(generateJob("AAAA", 3, cat, 0)).toEqual(generateJob("AAAA", 3, cat, 0));
  });
  it("starting catalog covers every switch type and several color families", () => {
    const cat = generateCatalog("COVER");
    const unlocked = cat.switches.filter((s) => isUnlocked(s.requires, 0));
    expect(new Set(unlocked.map((s) => s.type))).toEqual(new Set(["linear", "tactile", "clicky", "silent"]));
    expect(new Set(cat.keycaps.filter((k) => isUnlocked(k.requires, 0)).map((k) => k.colorway.family)).size).toBeGreaterThanOrEqual(4);
  });
  it("jobs have believable budgets (a sensible build makes a profit)", () => {
    const cat = generateCatalog("MONEY");
    for (let i = 0; i < 50; i++) {
      const j = generateJob("MONEY", i, cat, 0);
      expect(j.budget).toBeGreaterThan(100_00);
      expect(j.budget).toBeLessThan(900_00);
      expect(j.quote.length).toBeGreaterThanOrEqual(5);
    }
  });
  it("generated theme requests can be matched by an unlocked keycap set", () => {
    const cat = generateCatalog("THEME");
    for (let i = 0; i < 40; i++) {
      const j = generateJob("THEME", i, cat, 0);
      if (j.theme.kind === "any") continue;
      const t = j.theme;
      const ok = cat.keycaps.filter((k) => isUnlocked(k.requires, 0)).some((k) =>
        (t.kind === "hue" || k.colorway.family === (t as { family: string }).family) && (t.kind === "family" || k.colorway.hue === (t as { hue: string }).hue));
      expect(ok, JSON.stringify(t)).toBe(true);
    }
  });
});

describe("build flow & scoring", () => {
  const cat = generateCatalog("FLOW");
  const job = generateJob("FLOW", 1, cat, 0);
  it("solder step only appears for solder PCBs", () => {
    const b = newSession(asOrder(job));
    b.pcb = "hotswap";
    expect(stepsFor(b)).not.toContain("solder");
    b.pcb = "solder";
    expect(stepsFor(b)).toContain("solder");
  });
  it("missed solder beats create faulty keys, deterministically", () => {
    const a = newSession(asOrder(job));
    a.layout = "65";
    applySolder(a, 0.5, [0, 3, 7], 16);
    const b = newSession(asOrder(job));
    b.layout = "65";
    applySolder(b, 0.5, [0, 3, 7], 16);
    expect(a.faults.length).toBe(3);
    expect(a.faults).toEqual(b.faults);
  });
  it("wrong layout caps the rating; unfixed faults cost stars", () => {
    const rng = new Rng("x");
    const b = randomBuild(job, cat, rng, 0);
    b.layout = job.layout.kind === "exact" && job.layout.id === "40" ? "full" : "40";
    if (job.layout.kind !== "any") expect(evaluateBuild(b, cat).stars).toBeLessThanOrEqual(2);
    const good = randomBuild(job, cat, rng, 0);
    good.faults = [{ key: 1, kind: "dead", cause: "bentPin" }];
    expect(evaluateBuild(good, cat).stars).toBeLessThanOrEqual(3);
  });
  it("cost adds up and profit = pay + tip − parts", () => {
    const b = randomBuild(job, cat, new Rng("y"), 0);
    const r = evaluateBuild(b, cat);
    expect(r.partsCost).toBe(partsCost(b, cat).total);
    expect(r.profit).toBe(r.pay + r.tip - r.partsCost);
  });
});
