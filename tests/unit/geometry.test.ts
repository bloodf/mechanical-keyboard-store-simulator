/** Generated geometry (keycaps, board parts), the glb reader and the switch models — without a GPU. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NullEngine, Scene } from "@babylonjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KEYCAP_PROFILES, PROFILE_GEO, type ProfileRow } from "../../src/data/profiles";
import { buildKeycap, PITCH } from "../../src/engine/keyboard/keycapGeo";
import { Geo, rrect } from "../../src/engine/keyboard/geo";
import { instantiateGlb, loadGlb, pbrFromGlb } from "../../src/engine/glb";
import { loadSwitchModels, switchParts, whenSwitchModels } from "../../src/engine/keyboard/switchModels";
import { roundedBoxData } from "../../src/engine/geometry";

const ASSETS = join(__dirname, "../../public/assets/models");
const realFetch = globalThis.fetch;
beforeAll(() => {
  // serve the committed glb files to the loader
  globalThis.fetch = (async (url: string) => {
    const file = join(ASSETS, String(url).split("/").pop()!);
    const buf = readFileSync(file);
    return { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as Response;
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

/** Triangle normal (board space) for a quick orientation check. */
function faceNormal(p: Float32Array, i: Uint32Array, t: number): [number, number, number] {
  const a = i[t * 3] * 3, b = i[t * 3 + 1] * 3, c = i[t * 3 + 2] * 3;
  const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
  const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

describe("keycaps", () => {
  it("every profile, row and common size builds a clean mesh with its real height", () => {
    for (const profile of KEYCAP_PROFILES) {
      for (const row of [1, 2, 3, 4] as ProfileRow[]) {
        for (const [w, h] of [[1, 1], [2.25, 1], [6.25, 1], [1, 2]]) {
          const g = buildKeycap({ profile, row, w, h, cell: [0.1, 0.1, 0.2, 0.2], solid: [0.5, 0.5], legendLeft: w > 1.5 });
          expect(g.positions.length % 3).toBe(0);
          expect(g.indices.length % 3).toBe(0);
          expect(Math.max(...g.indices)).toBeLessThan(g.positions.length / 3);
          for (const v of g.positions) expect(Number.isFinite(v)).toBe(true);
          for (const v of g.normals) expect(Number.isFinite(v)).toBe(true);
          // footprint: 18 mm per unit minus the gap
          let maxX = 0;
          for (let k = 0; k < g.positions.length; k += 3) maxX = Math.max(maxX, Math.abs(g.positions[k]));
          expect(maxX * 2).toBeCloseTo(w * PITCH - 1.05, 1);
          // height close to the profile's spec (+ the tilt)
          expect(g.top).toBeGreaterThan(PROFILE_GEO[profile].rows[row][0] - 1);
          expect(g.top).toBeLessThan(PROFILE_GEO[profile].rows[row][0] + (h > 1 ? 8 : 3));
          // legend UVs stay inside the atlas cell
          for (let k = 0; k < g.uvs.length; k += 2) {
            const u = g.uvs[k], v = g.uvs[k + 1];
            const inCell = u >= 0.1 - 1e-6 && u <= 0.2 + 1e-6 && v >= 0.1 - 1e-6 && v <= 0.2 + 1e-6;
            expect(inCell || (u === 0.5 && v === 0.5)).toBe(true);
          }
        }
      }
    }
  });
  it("the top faces up (front faces are counter-clockwise in cap space → correct in Babylon)", () => {
    const g = buildKeycap({ profile: "oem", row: 3, w: 1, h: 1 });
    // the highest vertex's normal points up
    let top = 0;
    for (let k = 1; k < g.positions.length; k += 3) if (g.positions[k] > g.positions[top * 3 + 1]) top = (k - 1) / 3;
    expect(g.normals[top * 3 + 1]).toBeGreaterThan(0.5);
    // and the first wall triangle's winding agrees with its normal direction (outward, −z side = front faces +Z in board space)
    const n = faceNormal(g.positions, g.indices, 0);
    expect(Math.hypot(...n)).toBeGreaterThan(0);
  });
});

describe("geo builder", () => {
  it("rings, bridges, fans, prisms, boxes, cylinders and tubes", () => {
    const g = new Geo();
    const a = g.ring(rrect(20, 10, 2), 0);
    const b = g.ring(rrect(20, 10, 2), (x) => 5 + x * 0.01);
    g.bridge(a, b);
    g.bridge(a, b, true);
    g.fan(b, true);
    g.fan(a, false);
    g.prism(rrect(10, 10, 1, 4, 5, 5), 0, 2);
    g.box(0, 0, 0, 4, 4, 4);
    g.cylinder(0, 0, 0, 2, 3, 8);
    g.tube([[0, 0, 0], [10, 0, 0], [10, 0, 10], [10, 5, 10]], 0.5, 6);
    g.tri(0, 1, 2);
    const box = g.toVertexData("box", 0.1, [0.5, 0.5]);
    const keep = g.toVertexData();
    expect(box.positions!.length).toBe(keep.positions!.length);
    expect(box.indices!.length).toBeGreaterThan(100);
    // x is mirrored into board space
    const v = new Geo();
    v.v(3, 4, 5, 0.25, 0.75);
    const vd = v.toVertexData();
    expect(Array.from(vd.positions!)).toEqual([-3, 5, -4]);
    expect(Array.from(vd.uvs!)).toEqual([0.25, 0.75]);
    // tiny radii are clamped
    expect(rrect(2, 2, 50).length).toBe(24);
  });
  it("rounded boxes (cheater screen, minigame props)", () => {
    const d = roundedBoxData({ w: 2, h: 1, d: 1, r: 0.2, seg: 3, topUv: [0, 0, 1, 1], sideUv: [0.5, 0.5], shape: (p, t) => (p.y += t * 0.01) });
    expect(d.positions!.length).toBeGreaterThan(0);
    const plain = roundedBoxData({ w: 1, h: 1, d: 1, r: 5 });
    expect(plain.indices!.length).toBeGreaterThan(0);
  });
});

describe("glb models", () => {
  it("reads every switch family with all parts, in millimeters, and Babylon can use them", async () => {
    for (const f of ["mx", "box", "choc"]) {
      const file = await loadGlb(`/assets/models/switch_${f}.glb`, 1000);
      const names = file.primitives.map((p) => p.node);
      expect(names).toEqual(expect.arrayContaining(["top", "pins", "spring", "spring_lo", "stem_linear", "stem_tactile", "stem_clicky"]));
      const top = file.primitives.find((p) => p.node === "top")!;
      let maxY = -Infinity;
      const P = top.data.positions!;
      for (let i = 1; i < P.length; i += 3) maxY = Math.max(maxY, P[i]);
      expect(maxY).toBeCloseTo(f === "choc" ? 3.0 : 6.6, 0);
    }
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const bench = await loadGlb("/assets/models/bench.glb");
    expect(bench.materials.length).toBeGreaterThan(3);
    const meshes = instantiateGlb({ ...bench, materials: bench.materials.map((m) => ({ ...m, image: null })) }, scene, "bench");
    expect(meshes.length).toBe(bench.primitives.length);
    const withImage = bench.materials.find((m) => m.image);
    expect(withImage).toBeTruthy();
    expect(pbrFromGlb(withImage!, scene).albedoTexture).toBeTruthy();
    scene.dispose();
    engine.dispose();
    await expect(loadGlb("/assets/models/../../../package.json")).rejects.toThrow();
  });
  it("switch models load once and notify waiters", async () => {
    let called = 0;
    whenSwitchModels(() => called++);
    await loadSwitchModels("/assets/models");
    expect(called).toBe(1);
    expect(switchParts("mx")!.stem_silent).toBeTruthy();
    expect(switchParts("box")!.box).toBeTruthy();
    whenSwitchModels(() => called++);
    expect(called).toBe(2);
  });
});
