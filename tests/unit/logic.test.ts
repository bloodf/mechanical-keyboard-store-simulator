/** Branch-level tests for the framework-free game rules (session, stock, scoring, tools, days, colors, rng, i18n). */
import { describe, expect, it } from "vitest";
import { derive, newWorldSeed, Rng } from "../../src/core/rng";
import { absMinute, createNewGame, DAY_END, migrateState, nowAbs, validateState, type GameState } from "../../src/core/state";
import { generateCatalog, getCatalog, randomCaseColor, CUSTOM_COLOR_MATERIALS } from "../../src/data/catalog";
import { classifyColor, hexToHsl, hslToHex, hueName, luminance, mixHex, toneOf } from "../../src/data/color";
import { randomColorway, COLOR_FAMILIES } from "../../src/data/colorway";
import { getLayout, LAYOUT_IDS, needsStab } from "../../src/data/layouts";
import { cleanName, NAME_MAX } from "../../src/data/names";
import { CASE_MATERIALS, isUnlocked, PCBS } from "../../src/data/parts";
import { FAMILY_GEO, KEYCAP_PROFILES, MOUNT_OF_FAMILY, profileRow, PROFILE_GEO } from "../../src/data/profiles";
import { convertMembrane, generateJob, generateOrder, referenceCost } from "../../src/build/jobs";
import { computeProfile, feelMatch, findSwitch, keycapSetOf, layoutMatches, partsCost, soundMatch, stabCount, targetRanges, axisScore } from "../../src/build/profile";
import { evaluateBuild, specMatch, themeMatch } from "../../src/build/scoring";
import { ALL_STEPS, applyInstall, applySolder, canGoBack, isHotswap, newSession, nextStep, prevStep, stepDone, stepsFor, unresolvedFaults } from "../../src/build/session";
import {
  footprintOf,
  give,
  have,
  missingFor,
  packPrice,
  parseSku,
  SHIPPING_FEE,
  skuCase,
  skuFoam,
  skuKeycaps,
  skuPcb,
  skuPlate,
  skuStab,
  skuSwitch,
  SKU_LUBE,
  starterKit,
  stockValue,
  switchesNeeded,
  take,
  unitPrice,
} from "../../src/build/stock";
import { buyTool, canBendPins, hasTool, lubeZoneBonus, screwZone, solderSlowdown, TOOLS } from "../../src/build/tools";
import {
  abandonBuild,
  acceptOrder,
  addMail,
  advance,
  cartTotal,
  declineOrder,
  explainMembrane,
  formatClock,
  inbox,
  isClosingTime,
  nextDay,
  pitchMechanical,
  placeSupplierOrder,
  release,
  RENT,
  RESCUE,
  reserve,
  shipBuild,
  startBuild,
  startGame,
  stepMinutes,
  swapReserved,
  unreadCount,
} from "../../src/build/workshop";
import type { BuildSession, JobRequest, Order } from "../../src/build/types";
import { allKeys, formatMoney, formatNumber, getLocale, names, setLocale, t, tx, variantCount } from "../../src/i18n";

const cat = generateCatalog("LOGIC1");
const asOrder = (j: JobRequest, over: Partial<Order> = {}): Order => ({ ...j, kind: "build", received: 1, expires: 2, due: 4, ...over });
const job = generateJob("LOGIC1", 3, cat, 5);

function fullBuild(o: Order = asOrder(job)): BuildSession {
  const b = newSession(o);
  b.layout = "65";
  b.caseMaterial = "aluminum";
  b.caseColor = { id: "silver", hex: "#c9ccd1" };
  b.pcb = "hotswap";
  b.family = "mx";
  b.damp = ["caseFoam", "tape"];
  b.tapeQuality = 0.9;
  b.plate = "pom";
  b.stabs = "premium";
  b.stabMods = ["clip", "bandaid"];
  b.stabLube = 1;
  b.switchId = cat.switches[0].id;
  b.lube = { quality: 1, over: 0, skipped: false };
  b.installed = true;
  b.screws = { quality: 1, loose: 0, stripped: 0 };
  b.keycapsId = cat.keycaps[1].id;
  b.tested = true;
  b.soundChecked = true;
  return b;
}

function game(seed = "LOGIC1"): GameState {
  const s = createNewGame({ seed });
  startGame(s, getCatalog(seed));
  return s;
}

describe("rng", () => {
  it("is deterministic, and covers weighted/shuffle/pick/int/range/chance", () => {
    const a = new Rng("x");
    const b = new Rng("x");
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
    const r = derive("S", "a", 1);
    expect(r.int(3, 3)).toBe(3);
    const v = r.range(2, 4);
    expect(v).toBeGreaterThanOrEqual(2);
    expect(v).toBeLessThan(4);
    expect(typeof r.chance(0.5)).toBe("boolean");
    expect(() => r.pick([])).toThrow();
    expect(r.weighted([{ item: "only", weight: 1 }])).toBe("only");
    expect(r.weighted([{ item: "a", weight: 0 }, { item: "b", weight: 0 }])).toBe("b");
    const counts: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 400; i++) counts[r.weighted([{ item: "a", weight: 3 }, { item: "b", weight: 1 }])]++;
    expect(counts.a).toBeGreaterThan(counts.b);
    const sh = r.shuffle([1, 2, 3, 4, 5]);
    expect(sh.slice().sort()).toEqual([1, 2, 3, 4, 5]);
    expect(newWorldSeed()).toMatch(/^[0-9A-Z]{12}$/);
  });
});

describe("colors", () => {
  it("converts, names and mixes colors", () => {
    expect(hslToHex(0, 1, 0.5)).toBe("#ff0000");
    expect(hslToHex(-1, 0, 1)).toBe("#ffffff");
    expect(hexToHsl("#808080")[1]).toBe(0);
    expect(hexToHsl("#00ff00")[0]).toBeCloseTo(1 / 3);
    expect(hexToHsl("#0000ff")[0]).toBeCloseTo(2 / 3);
    expect(hexToHsl("#ff00ff")[0]).toBeCloseTo(5 / 6);
    expect(hexToHsl("#3a0000")[2]).toBeLessThan(0.5);
    expect(luminance("#ffffff")).toBeCloseTo(1);
    expect(luminance("#000000")).toBe(0);
    const names = [0, 0.05, 0.13, 0.3, 0.48, 0.6, 0.75, 0.9, 0.97, -0.02].map(hueName);
    expect(new Set(names)).toEqual(new Set(["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"]));
    expect(classifyColor("#ffffff")).toBe("white");
    expect(classifyColor("#111111")).toBe("black");
    expect(classifyColor("#e6e6e6")).toBe("white");
    expect(classifyColor("#333333")).toBe("black");
    expect(classifyColor("#888888")).toBe("grey");
    expect(classifyColor("#d8cfb8")).toBe("beige");
    expect(classifyColor("#2f66c9")).toBe("blue");
    expect(["pale", "light", "mid", "deep", "dark"].map((_, i) => toneOf(["#f5f5f5", "#c0c0c0", "#808080", "#3a3a3a", "#101010"][i]))).toEqual(["pale", "light", "mid", "deep", "dark"]);
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
  it("every case material gets plausible random colors; colorways for every family", () => {
    const rng = new Rng("c");
    for (const m of CASE_MATERIALS) for (let i = 0; i < 5; i++) expect(randomCaseColor(m.id, () => rng.next())).toMatch(/^#[0-9a-f]{6}$/);
    expect(CUSTOM_COLOR_MATERIALS.length).toBeGreaterThan(0);
    for (const f of COLOR_FAMILIES) {
      const cw = randomColorway(rng, f);
      expect(cw.family).toBe(f);
      for (const k of ["alpha", "mod", "accent", "legendOnAlpha", "legendOnMod", "legendOnAccent"] as const) expect(cw[k]).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(COLOR_FAMILIES).toContain(randomColorway(rng).family);
  });
});

describe("names, profiles, layouts", () => {
  it("cleans player names", () => {
    expect(cleanName("  Ada\u0000   Lovelace  ", NAME_MAX)).toBe("Ada Lovelace");
    expect(cleanName("x".repeat(50), NAME_MAX).length).toBe(NAME_MAX);
  });
  it("profile rows and families", () => {
    expect([0, 1, 2, 3, 4, 5].map(profileRow)).toEqual([4, 4, 3, 2, 1, 1]);
    for (const p of KEYCAP_PROFILES) expect(PROFILE_GEO[p].rows[3][0]).toBeGreaterThan(3);
    expect(MOUNT_OF_FAMILY.box).toBe("mx");
    expect(FAMILY_GEO.choc.travel).toBeLessThan(FAMILY_GEO.mx.travel);
    for (const l of LAYOUT_IDS) expect(getLayout(l).keys.some(needsStab)).toBe(true);
  });
});

describe("i18n", () => {
  it("translates, pluralizes, formats and falls back", () => {
    setLocale("en-US");
    expect(getLocale()).toBe("en");
    expect(t("orders.dueIn", { count: 0 })).toBe("Due today");
    expect(t("orders.dueIn", { count: 1 })).toBe("Due tomorrow");
    expect(t("orders.dueIn", { count: 3 })).toBe("Due in 3 days");
    expect(t("does.not.exist" as never)).toBe("⟦does.not.exist⟧");
    expect(t("ws.clock", { day: 2 })).toBe("Day 2 · {time}");
    expect(tx("orders.pays", { money: 12345 })).toBe("Pays $123.45");
    expect(tx("orders.want.case", { material: "@part.case.wood" })).toBe("Wood case");
    expect(formatMoney(-500)).toBe("-$5.00");
    expect(formatNumber(3.14159, 2)).toBe("3.14");
    expect(variantCount("review.happy")).toBe(3);
    expect(variantCount("nope")).toBe(0);
    expect(allKeys().length).toBeGreaterThan(400);
    expect(names().firstNames.length).toBeGreaterThan(10);
    setLocale("xx");
    expect(getLocale()).toBe("en");
  });
});

describe("catalog & jobs", () => {
  it("the catalog is cached per seed and stable", () => {
    expect(getCatalog("LOGIC1")).toBe(getCatalog("LOGIC1"));
    expect(generateCatalog("LOGIC1").switches.map((s) => s.name)).toEqual(cat.switches.map((s) => s.name));
    expect(findSwitch(cat, null)).toBeUndefined();
    expect(findSwitch(cat, cat.switches[2].id)).toBe(cat.switches[2]);
  });
  it("reference costs grow with size; converted membrane orders are real orders", () => {
    expect(referenceCost("full")).toBeGreaterThan(referenceCost("40"));
    let m: Order | null = null;
    for (let i = 2; i < 100 && !m; i++) {
      const o = generateOrder("LOGIC1", i, cat, { day: 2, builds: 3 });
      if (o.kind === "membrane") m = o;
    }
    expect(m).not.toBeNull();
    const c = convertMembrane("LOGIC1", m!, cat, 3, 3);
    expect(c.kind).toBe("build");
    expect(c.customer.name).toBe(m!.customer.name);
    expect(c.due).toBe(7);
  });
});

describe("session", () => {
  it("steps, completion rules, going back, faults", () => {
    const b = newSession(asOrder(job));
    for (const st of ALL_STEPS) expect(stepDone(b, st)).toBe(st === "damp");
    expect(isHotswap(b)).toBe(true); // unknown PCB counts as hot-swap
    expect(stepsFor(b)).not.toContain("solder");
    expect(prevStep(b)).toBeNull();
    expect(nextStep(b)).toBe("pcb");
    expect(canGoBack(b)).toBe(false);
    const f = fullBuild();
    f.pcb = "solder";
    f.solderQuality = 0.8;
    for (const st of ALL_STEPS) expect(stepDone(f, st)).toBe(st !== "deliver");
    f.step = "deliver";
    expect(nextStep(f)).toBe("deliver");
    f.step = "solder";
    expect(prevStep(f)).toBe("install");
    f.installed = false;
    expect(canGoBack(f)).toBe(true);
    applyInstall(f, [3, 3, 5]);
    expect(f.installed).toBe(true);
    expect(f.faults.map((x) => x.key)).toEqual([3, 5]);
    const n0 = f.faults.length;
    applySolder(f, 0.5, [0, 1], 16);
    expect(f.faults.length).toBe(n0 + 2);
    f.fixed.push(3);
    expect(unresolvedFaults(f).some((x) => x.key === 3)).toBe(false);
    const noLayout = newSession(asOrder(job));
    applySolder(noLayout, 0.2, [0], 16);
    expect(noLayout.faults).toEqual([]);
    // a group whose keys are all already faulty adds nothing
    const all = fullBuild();
    all.faults = getLayout("65").keys.map((k) => ({ key: k.id, kind: "dead" as const, cause: "bentPin" as const }));
    applySolder(all, 0.1, [0, 1, 2], 16);
    expect(all.faults.length).toBe(getLayout("65").keys.length);
  });
});

describe("profile & scoring", () => {
  it("sound profile reacts to every kind of part", () => {
    const base = computeProfile(fullBuild(), cat).sound;
    const over = fullBuild();
    over.lube = { quality: 1, over: 1, skipped: false };
    over.damp = ["caseFoam", "plateFoam", "peFoam", "silicone"];
    const p2 = computeProfile(over, cat);
    expect(p2.sound.volume).toBeLessThan(base.volume);
    const clicky = fullBuild();
    clicky.switchId = cat.switches.find((s) => s.type === "clicky")!.id;
    expect(computeProfile(clicky, cat).feel.clicky).toBe(true);
    const tactile = fullBuild();
    tactile.switchId = cat.switches.find((s) => s.type === "tactile")!.id;
    expect(computeProfile(tactile, cat).feel.tactility).toBeGreaterThan(0);
    const loose = fullBuild();
    loose.screws = { quality: 0.3, loose: 3, stripped: 1 };
    expect(computeProfile(loose, cat).sound.rattle).toBeGreaterThan(base.rattle);
    const heavy = fullBuild();
    heavy.switchId = cat.switches.find((s) => s.springG >= 65)!.id;
    computeProfile(heavy, cat);
    const longPole = fullBuild();
    longPole.switchId = cat.switches.find((s) => s.longPole)!.id;
    expect(computeProfile(longPole, cat).sound.brightness).toBeGreaterThan(0);
    const gasket = fullBuild();
    gasket.caseMaterial = "polycarbonate";
    computeProfile(gasket, cat);
    const empty = newSession(asOrder(job));
    expect(computeProfile(empty, cat).feel.weight).toBe(0);
  });
  it("targets, axis scores and feel matching", () => {
    expect(targetRanges(["thocky", "deep"]).depth![0]).toBeGreaterThanOrEqual(0.66);
    expect(axisScore(0.5, [0.4, 0.6])).toBe(1);
    expect(axisScore(0, [0.4, 0.6])).toBeLessThan(1);
    expect(soundMatch(computeProfile(fullBuild(), cat).sound, [])).toBe(1);
    const feel = { weight: 45, tactility: 0, clicky: false, smoothness: 0.9, linear: true };
    for (const req of ["any", "light", "heavy", "linear", "tactile", "clicky", "smooth"] as const) expect(feelMatch(feel, req)).toBeGreaterThanOrEqual(0);
    expect(feelMatch({ ...feel, weight: 80 }, "heavy")).toBe(1);
    expect(feelMatch({ ...feel, weight: 80 }, "light")).toBe(0);
    expect(feelMatch({ ...feel, clicky: true }, "tactile")).toBe(0.5);
    expect(feelMatch({ ...feel, clicky: true }, "clicky")).toBe(1);
    expect(feelMatch({ ...feel, linear: false }, "linear")).toBe(0.2);
    for (const l of LAYOUT_IDS) for (const kind of ["compact", "arrows", "frow", "numpad", "any"] as const) layoutMatches({ kind }, l);
    expect(layoutMatches({ kind: "exact", id: "65" }, null)).toBe(false);
    expect(layoutMatches({ kind: "numpad" }, "full")).toBe(true);
    expect(stabCount("full")).toBeGreaterThan(stabCount("40") - 1);
  });
  it("themes, wishes, parts cost and the final rating", () => {
    const cw = cat.keycaps[0].colorway;
    expect(themeMatch({ kind: "any" }, undefined, undefined)).toBe(1);
    expect(themeMatch({ kind: "hue", hue: "red" }, undefined, undefined)).toBe(0);
    expect(themeMatch({ kind: "both", family: cw.family, hue: cw.hue }, cw, "neutral")).toBe(1);
    for (const hue of ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "beige", "white", "black", "grey"] as const) {
      expect(themeMatch({ kind: "hue", hue }, { ...cw, hue: "beige" }, hue)).toBeGreaterThan(0);
      themeMatch({ kind: "family", family: "dark" }, { ...cw, hue }, undefined);
      themeMatch({ kind: "hue", hue }, { ...cw, hue: "white" }, undefined);
      themeMatch({ kind: "hue", hue }, { ...cw, hue: "red" }, undefined);
    }
    const b = fullBuild();
    expect(specMatch(undefined, b, undefined)).toBe(1);
    expect(specMatch({}, b, undefined)).toBe(1);
    const kc = keycapSetOf(b, cat)!;
    expect(specMatch({ profile: kc.profile, hotswap: true, caseMaterial: "aluminum", lowProfile: false }, b, kc)).toBe(1);
    expect(specMatch({ lowProfile: true }, b, kc)).toBe(0);
    expect(keycapSetOf(newSession(asOrder(job)), cat)).toBeUndefined();
    const custom = fullBuild();
    custom.keycapsId = "kc.custom";
    expect(keycapSetOf(custom, cat)).toBeUndefined();
    custom.customColorway = cw;
    expect(keycapSetOf(custom, cat)!.colorway).toBe(cw);
    // cost: catalog list prices without stock records, supplier prices with them
    const listCost = partsCost(b, cat);
    expect(listCost.lines.length).toBeGreaterThan(5);
    b.reserved = { [skuCase("aluminum", "65", "silver")]: 1, [skuSwitch(cat.switches[0].id)]: 68, [SKU_LUBE]: 1, [skuFoam("tape")]: 1, [skuStab("premium", "mx")]: 1, [skuKeycaps(cat.keycaps[1].id)]: 1, [skuPcb("hotswap", "65", "mx")]: 1, [skuPlate("pom", "65", "mx")]: 1 };
    const stockCost = partsCost(b, cat);
    expect(stockCost.total).toBeGreaterThan(0);
    expect(new Set(stockCost.lines.map((l) => l.part))).toEqual(new Set(["case", "switches", "damp", "stabs", "keycaps", "pcb", "plate"]));
    const r = evaluateBuild(b, cat);
    expect(r.stars).toBeGreaterThanOrEqual(1);
    expect(r.partsCost).toBe(stockCost.total);
    // wrong layout caps at 2 stars, unresolved faults at 3, missed wishes at 3
    const wrong = fullBuild(asOrder({ ...job, layout: { kind: "exact", id: "full" } }));
    expect(evaluateBuild(wrong, cat).stars).toBeLessThanOrEqual(2);
    const faulty = fullBuild();
    faulty.faults = [{ key: 1, kind: "dead", cause: "bentPin" }];
    expect(evaluateBuild(faulty, cat).stars).toBeLessThanOrEqual(3);
    const wish = fullBuild(asOrder({ ...job, wants: { lowProfile: true } }));
    expect(evaluateBuild(wish, cat).stars).toBeLessThanOrEqual(3);
    // a terrible build
    const bad = newSession(asOrder({ ...job, picky: 1 }));
    bad.layout = "40";
    const rb = evaluateBuild(bad, cat);
    expect(rb.stars).toBe(1);
    expect(rb.mood).toBe("furious");
    expect(rb.tip).toBe(0);
  });
});

describe("stock", () => {
  it("SKUs, prices, packs, inventory helpers", () => {
    expect(parseSku("bogus/x")).toBeNull();
    expect(parseSku("case/x")).toBeNull();
    expect(parseSku("pcb/x/65")).toBeNull();
    expect(parseSku("stab/x")).toBeNull();
    expect(parseSku("sw")).toBeNull();
    expect(parseSku("lube/x")).toBeNull();
    expect(unitPrice("nonsense", cat)).toBeNull();
    expect(unitPrice("pcb/nope/65/mx", cat)).toBeNull();
    expect(unitPrice("plate/none/65/mx", cat)).toBeNull();
    expect(unitPrice("stab/nope/mx", cat)).toBeNull();
    expect(unitPrice("sw/nope", cat)).toBeNull();
    expect(unitPrice("kc/nope", cat)).toBeNull();
    expect(unitPrice("foam/nope", cat)).toBeNull();
    expect(unitPrice("case/plastic/65/nope", cat)).toBeNull();
    expect(unitPrice(skuPcb("hotswap", "65", "choc"), cat)!).toBeGreaterThan(unitPrice(skuPcb("hotswap", "65", "mx"), cat)!);
    expect(packPrice(100, 10)).toBe(1000);
    expect(packPrice(100, 110)).toBe(9350);
    expect(packPrice(100, 7)).toBe(700);
    expect(SHIPPING_FEE.standard(200_00)).toBe(0);
    expect(SHIPPING_FEE.standard(20_00)).toBe(8_00);
    expect(SHIPPING_FEE.express(100_00)).toBe(25_00);
    const inv: Record<string, number> = {};
    expect(take(inv, "x")).toBe(false);
    give(inv, "x", 2);
    give(inv, "x", 0);
    expect(have(inv, "x")).toBe(2);
    expect(take(inv, "x", 2)).toBe(true);
    expect(inv.x).toBeUndefined();
    expect(have(inv, "x")).toBe(0);
    expect(switchesNeeded("full")).toBe(getLayout("full").keys.length);
    expect(footprintOf("box")).toBe("mx");
    expect(footprintOf("choc")).toBe("choc");
    expect(stockValue(starterKit(cat), cat)).toBeGreaterThan(100_00);
  });
  it("tells what's missing to build an order from the shelf", () => {
    const kit = starterKit(cat);
    const o = asOrder({ ...job, layout: { kind: "exact", id: "65" }, wants: undefined });
    expect(missingFor(o, kit, cat)).toEqual([]);
    expect(missingFor(o, {}, cat)).toEqual(["case", "pcb", "stab", "sw", "kc"]);
    expect(missingFor(asOrder({ ...job, layout: { kind: "exact", id: "tkl" } }), kit, cat)).toContain("case");
    expect(missingFor(asOrder({ ...o, wants: { lowProfile: true } }), kit, cat)).toEqual(expect.arrayContaining(["pcb", "stab", "sw", "kc"]));
    expect(missingFor(asOrder({ ...o, wants: { caseMaterial: "wood" } }), kit, cat)).toContain("case");
    expect(missingFor(asOrder({ ...o, wants: { hotswap: true } }), kit, cat)).toEqual([]);
    expect(missingFor(asOrder({ ...o, wants: { profile: "sa" } }), kit, cat)).toContain("kc");
    for (const kind of ["compact", "arrows", "frow", "numpad", "any"] as const) missingFor(asOrder({ ...job, layout: { kind } }), kit, cat);
  });
});

describe("tools", () => {
  it("are bought once, gated by builds and money, and change the minigames", () => {
    const s = game();
    for (const x of [lubeZoneBonus(s), solderSlowdown(s), canBendPins(s), screwZone(s)[0]]) expect(x).toBeDefined();
    expect(canBendPins(s)).toBe(true);
    expect(buyTool(s, "lubeStation")).toBe(false); // needs 1 build
    expect(buyTool(s, "nope" as never)).toBe(false);
    s.money = 10;
    expect(buyTool(s, "switchPress")).toBe(false);
    s.money = 10_000_00;
    s.stats.keyboardsBuilt = 10;
    for (const tl of TOOLS) expect(buyTool(s, tl.id)).toBe(true);
    expect(buyTool(s, "switchPress")).toBe(false); // owned
    expect(hasTool(s, "keyTester")).toBe(true);
    expect(canBendPins(s)).toBe(false);
    expect(lubeZoneBonus(s)).toBeGreaterThan(0);
    expect(solderSlowdown(s)).toBeGreaterThan(1);
    expect(screwZone(s)[1]).toBeGreaterThan(0.82);
    const b = fullBuild();
    expect(stepMinutes(b, "test", s)).toBeLessThan(stepMinutes(b, "test"));
    expect(stepMinutes(b, "deliver", s)).toBeLessThan(stepMinutes(b, "deliver"));
    expect(stepMinutes(b, "lube", s)).toBeLessThan(stepMinutes(b, "lube"));
    expect(stepMinutes(b, "solder", s)).toBeLessThan(stepMinutes(b, "solder"));
    expect(validateState(s)).toBe(true);
  });
});

describe("workshop days", () => {
  it("clock, mail, rent and Grandma's rescue", () => {
    expect(formatClock(9 * 60 + 5)).toBe("09:05");
    expect(formatClock(25 * 60)).toBe("01:00");
    const s = game();
    expect(isClosingTime(s)).toBe(false);
    expect(advance(s, -5)).toEqual([]);
    const far = addMail(s, { at: nowAbs(s) + 10_000, kind: "review", from: "x", key: "review.happy.0", params: {} });
    expect(inbox(s).includes(far)).toBe(false);
    for (let i = 0; i < 60; i++) addMail(s, { at: nowAbs(s) - i, kind: "reply", from: "x", key: "membrane.reply.0.0", params: { name: "x" } }).read = i % 2 === 0;
    expect(s.mail.length).toBeLessThanOrEqual(40);
    expect(unreadCount(s)).toBeGreaterThan(0);
    advance(s, DAY_END - s.minute);
    expect(isClosingTime(s)).toBe(true);
    // broke & nothing to build → rent is waived down to $0 and Grandma helps
    s.money = 10_00;
    s.inventory = {};
    const r = nextDay(s, cat);
    expect(r.rent).toBe(10_00);
    expect(r.rescue).toBe(RESCUE);
    expect(s.money).toBe(RESCUE);
    expect(s.rescueDay).toBe(s.day);
    expect(validateState(s)).toBe(true);
    // not again the next day (once a week)
    s.money = 0;
    expect(nextDay(s, cat).rescue).toBe(0);
    // normal days pay full rent
    s.money = 1_000_00;
    expect(nextDay(s, cat).rent).toBe(RENT);
    expect(absMinute(2, 60)).toBe(1500);
  });
  it("orders can't be accepted twice or when the queue is full; unknown ids are ignored", () => {
    const s = game();
    expect(acceptOrder(s, "nope")).toBe(false);
    declineOrder(s, "nope");
    explainMembrane(s, "nope", 0);
    expect(pitchMechanical(s, "nope", cat)).toBeNull();
    expect(pitchMechanical(s, s.offers[0].id, cat)).toBeNull(); // not a membrane order
    explainMembrane(s, s.offers[0].id, 0); // not a membrane order
    for (let i = 0; i < 8; i++) s.offers.push(generateOrder(s.seed, 50 + i, cat, { day: 1, builds: 0 }));
    const builds = s.offers.filter((o) => o.kind === "build");
    for (const o of builds) acceptOrder(s, o.id);
    expect(s.accepted.length).toBe(4);
    expect(startBuild(s, "nope")).toBeNull();
    expect(startBuild(s, s.accepted[0].id)).not.toBeNull();
    expect(startBuild(s, s.accepted[0].id)).toBeNull(); // bench busy
    release(s, "nothing");
    expect(reserve(s, "nothing")).toBe(false);
    expect(swapReserved(s, null, "nothing")).toBe(false);
    expect(swapReserved(s, "a", "a")).toBe(true);
    const sk = Object.keys(s.inventory)[0];
    expect(swapReserved(s, null, sk)).toBe(true);
    abandonBuild(s);
    abandonBuild(s); // nothing on the bench: no-op
    const none = createNewGame();
    release(none, "x");
    expect(reserve(none, "x")).toBe(false);
  });
  it("supplier carts: invalid lines, empty cart, money", () => {
    const s = game();
    expect(cartTotal([], cat, "standard")).toEqual({ items: 0, fee: 0, total: 0 });
    expect(cartTotal([{ sku: "nope", qty: 1 }], cat, "standard")).toBeNull();
    expect(cartTotal([{ sku: SKU_LUBE, qty: 0 }], cat, "standard")).toBeNull();
    expect(placeSupplierOrder(s, [], "standard", cat)).toBeNull();
    const sh = placeSupplierOrder(s, [{ sku: SKU_LUBE, qty: 3 }, { sku: SKU_LUBE, qty: 3 }], "standard", cat)!;
    expect(sh.items[SKU_LUBE]).toBe(6);
  });
  it("packing station bonus and late reviews", () => {
    const s = game();
    s.unlocks.push("tool.packingStation");
    acceptOrder(s, s.offers[0].id);
    const b = startBuild(s, s.accepted[0].id)!;
    Object.assign(b, { ...fullBuild(b.job), job: b.job, reserved: {} });
    s.day = b.job.due + 4;
    const out = shipBuild(s, evaluateBuild(b, cat));
    expect(out.late).toBe(4);
    expect(out.stars).toBeLessThanOrEqual(3);
    expect(s.mail.some((m) => m.key.startsWith("review.late") || m.kind === "complaint")).toBe(true);
  });
});

describe("state", () => {
  it("validation rejects broken fields", () => {
    const s = game();
    expect(validateState(s)).toBe(true);
    const bad: [string, unknown][] = [
      ["version", 3],
      ["seed", "lower"],
      ["createdAt", -1],
      ["minute", 2000],
      ["reputation", 600],
      ["playTimeSec", -1],
      ["stats", null],
      ["stats", { ...s.stats, keyboardsBuilt: -1 }],
      ["stats", { ...s.stats, totalProfit: 1.5 }],
      ["ordersIssued", -1],
      ["today", { income: -1, expenses: 0, shipped: 0 }],
      ["offers", [{ id: 1 }]],
      ["accepted", "x"],
      ["activeBuild", { job: s.offers[0], step: "case" }],
      ["shipments", [{ id: "x", items: { a: 0 }, arrives: 1, cost: 1 }]],
      ["shipments", [{ id: "x" }]],
      ["mail", [{ id: "x", at: -1, key: "k", read: false }]],
      ["history", [{ jobId: "x", stars: 9, profit: 0 }]],
      ["inventory", { a: -1 }],
      ["inventory", null],
      ["unlocks", [1]],
      ["rescueDay", 0],
      ["profile", { name: "", storeName: "", created: "no" }],
      ["flags", { knownCheater: true, cheatCount: 0 }],
      ["flags", null],
    ];
    for (const [k, v] of bad) expect(validateState({ ...s, [k]: v }), k).toBe(false);
    expect(validateState(null)).toBe(false);
    expect(migrateState(null)).toBeNull();
    expect(migrateState("x")).toBe("x");
  });
  it("migrates v2 saves all the way to v4", () => {
    const v2 = { version: 2, seed: "ABCD1234", createdAt: 1, day: 2, money: 100, reputation: 300, playTimeSec: 1, stats: { customersServed: 0, keyboardsBuilt: 0, membraneExplained: 0, angryCustomers: 0, perfectBuilds: 0, totalProfit: 0 }, jobsIssued: 3, jobBoard: [], activeBuild: { job: { ...job } }, history: [], inventory: {}, goalsCompleted: [], unlocks: [], flags: { knownCheater: false, cheatCount: 0 } };
    const m = migrateState(v2) as GameState;
    expect(m.version).toBe(4);
    expect(m.accepted.length).toBe(0);
    expect(m.offers.length).toBe(1);
    expect(validateState(m)).toBe(true);
  });
});

describe("every step has a time cost", () => {
  it("stepMinutes covers all steps (with and without a layout)", () => {
    const b = fullBuild();
    for (const st of ALL_STEPS) expect(stepMinutes(b, st)).toBeGreaterThanOrEqual(0);
    const n = newSession(asOrder(job));
    expect(stepMinutes(n, "install")).toBe(15);
    expect(stepMinutes(n, "lube")).toBe(0);
    expect(PCBS.length).toBe(5);
    expect(isUnlocked(undefined, 0)).toBe(true);
  });
});
