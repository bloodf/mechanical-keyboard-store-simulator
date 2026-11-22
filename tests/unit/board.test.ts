/**
 * The 3D keyboard with Babylon's NullEngine (no GPU): every part, family and case style, animations, picking,
 * markers. Canvas-drawn textures (PCB artwork, legends) use @napi-rs/canvas as OffscreenCanvas.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { NullEngine, Ray, Scene, Vector3 } from "@babylonjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateCatalog } from "../../src/data/catalog";
import { LAYOUT_IDS } from "../../src/data/layouts";
import { CASE_MATERIALS, DAMPENING, PCBS, PLATES, STABS } from "../../src/data/parts";
import { KEYCAP_PROFILES } from "../../src/data/profiles";
import { Board, CASE_STYLE } from "../../src/engine/keyboard/board";
import { loadSwitchModels } from "../../src/engine/keyboard/switchModels";
import { particleDot } from "../../src/engine/textures";

const cat = generateCatalog("BOARD1");
let engine: NullEngine;
let scene: Scene;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    constructor(w: number, h: number) {
      return createCanvas(w, h);
    }
  };
  globalThis.fetch = (async (url: string) => {
    const buf = readFileSync(join(__dirname, "../../public/assets/models", String(url).split("/").pop()!));
    return { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as Response;
  }) as typeof fetch;
  await loadSwitchModels("/assets/models");
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  globalThis.fetch = realFetch;
  scene.dispose();
  engine.dispose();
});

const step = (b: Board, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.05) b.update(0.05);
};

describe("Board", () => {
  it("assembles a full keyboard layer by layer (every layout)", () => {
    for (const id of LAYOUT_IDS) {
      const b = new Board(scene, id, null);
      b.setCase(CASE_MATERIALS[2], "#445566");
      b.setDampening(DAMPENING.map((d) => d.id));
      b.setPcb(PCBS[0]);
      b.setPlate(PLATES[0]);
      b.setStabs(STABS[1], true);
      b.setSwitchLook(cat.switches[0]);
      b.setAllSwitches(true);
      b.setKeycaps(cat.keycaps[0]);
      b.setAllCaps(true);
      expect(b.animating).toBe(true);
      step(b, 3);
      expect(b.animating).toBe(false);
      expect(b.outerWidth).toBeGreaterThan(0.2);
      expect(b.outerDepth).toBeGreaterThan(0.08);
      expect(b.capSetKey).toContain(cat.keycaps[0].id);
      expect(b.root.getChildMeshes().length).toBeGreaterThan(b.layout.keys.length);
      b.dispose();
    }
  });
  it("every case style, plate and PCB; MX, Box and Choc families; every keycap profile", () => {
    const b = new Board(scene, "65", null);
    for (const m of CASE_MATERIALS) {
      expect(CASE_STYLE[m.id]).toBeTruthy();
      b.setCase(m, m.colors[0].hex, false);
    }
    b.setCase(null, null);
    for (const p of PCBS) b.setPcb(p, false);
    for (const p of PLATES) b.setPlate(p, false);
    b.setPlate(null);
    for (const s of STABS) b.setStabs(s, false, false);
    const families = ["mx", "box", "choc"] as const;
    for (const f of families) {
      const sw = cat.switches.find((s) => s.family === f)!;
      b.setSwitchLook(sw);
      expect(b.family).toBe(f);
    }
    const clear = cat.switches.find((s) => s.housingOpacity < 1 && s.family === "mx")!;
    b.setSwitchLook(clear);
    const silentChoc = { ...cat.switches.find((s) => s.family === "choc")!, type: "silent" as const };
    b.setSwitchLook(silentChoc);
    b.setSwitchLook(null);
    for (const p of KEYCAP_PROFILES) b.setKeycaps({ ...cat.keycaps[0], profile: p });
    b.setKeycaps({ ...cat.keycaps[0], profile: "nope" as never }); // unknown profile falls back to Cherry
    b.setKeycaps(null);
    b.setFamily("choc");
    b.setFamily("choc"); // no-op
    b.dispose();
  });
  it("switch & cap install animations, key presses, picking, markers, tape, PCB flip, screws", () => {
    const b = new Board(scene, "60", null);
    b.setCase(CASE_MATERIALS[0], "#ffffff", false);
    b.setPcb(PCBS[3], false);
    b.setPlate(PLATES[0], false);
    b.setSwitchLook(cat.switches[1]);
    b.setSwitchInstalled(3, true);
    expect(b.isSwitchInstalled(3)).toBe(true);
    b.setSwitchInstalled(3, false, true);
    expect(b.isSwitchInstalled(3)).toBe(false);
    b.setAllSwitches(true, true);
    b.setKeycaps(cat.keycaps[2]);
    b.setCapInstalled(0, true);
    b.setCapInstalled(0, false, true);
    b.setAllCaps(true, true);
    b.pressKey(5);
    expect(b.animating).toBe(true);
    step(b, 1);
    // a ray straight down through key 5 picks key 5
    const top = b.keyWorld(5, 40);
    const hit = b.pickKey(new Ray(top, new Vector3(0, -1, 0), 1));
    expect(hit).toBe(5);
    expect(b.pickKey(new Ray(new Vector3(5, 5, 5), new Vector3(0, 1, 0), 1))).toBeNull();
    for (const c of ["green", "red", "orange", "yellow", null] as const) b.setMarker(2, c);
    b.clearMarkers();
    b.setTape([{ row: 0, offset: 0 }, { row: 1, offset: 0.5, from: 0.2, to: 0.8 }]);
    let flipped = false;
    b.flipPcb(true, () => (flipped = true));
    step(b, 1);
    expect(flipped).toBe(true);
    b.flipPcb(false);
    step(b, 1);
    expect(b.screwPoints(6).length).toBe(6);
    expect(b.screwPoints(8).length).toBe(8);
    const [x, z] = b.keyXZ(b.layout.keys[0]);
    expect(Number.isFinite(x + z)).toBe(true);
    b.dispose();
  });
  it("particles sprite", () => {
    expect(particleDot(scene).hasAlpha).toBe(true);
  });
});
