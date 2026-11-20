/**
 * Procedural mechanical keyboard (65% layout) built from code: case, plate, tapered
 * sculpted keycaps with legends (single canvas atlas), and animatable keys.
 * 1 unit = 1u key pitch (19.05 mm). Scale the returned group to taste.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Colorway } from "./colorway";

type KeyKind = "alpha" | "mod" | "accent";
interface KeyDef {
  label: string;
  w: number;
  kind: KeyKind;
}

const A = (label: string): KeyDef => ({ label, w: 1, kind: "alpha" });
const M = (label: string, w = 1): KeyDef => ({ label, w, kind: "mod" });
const X = (label: string, w = 1): KeyDef => ({ label, w, kind: "accent" });

const LAYOUT_65: KeyDef[][] = [
  [X("Esc"), ..."1234567890-=".split("").map(A), M("⌫", 2), M("Del")],
  [M("Tab", 1.5), ..."QWERTYUIOP[]".split("").map(A), M("\\", 1.5), M("PgUp")],
  [M("Caps", 1.75), ..."ASDFGHJKL;'".split("").map(A), X("Enter", 2.25), M("PgDn")],
  [M("Shift", 2.25), ..."ZXCVBNM,./".split("").map(A), M("Shift", 1.75), X("↑"), M("End")],
  [M("Ctrl", 1.25), M("Win", 1.25), M("Alt", 1.25), A("") /* space */, M("Alt"), M("Fn"), M("Ctrl"), X("←"), X("↓"), X("→")],
];
LAYOUT_65[4][3] = { label: "", w: 6.25, kind: "alpha" };

/** Cherry-ish sculpt: per-row height offset and tilt (radians), row 0 = number row. */
const ROW_SCULPT = [
  { h: 0.1, tilt: -0.12 },
  { h: 0.04, tilt: -0.05 },
  { h: 0.0, tilt: 0.0 },
  { h: 0.02, tilt: 0.06 },
  { h: 0.04, tilt: 0.1 },
];

export interface KeyboardModel {
  group: THREE.Group;
  keys: { mesh: THREE.Object3D; restY: number; label: string; press: number }[];
  width: number;
  depth: number;
  dispose(): void;
}

function keycapGeometry(w: number, cache: Map<number, THREE.BufferGeometry>): THREE.BufferGeometry {
  const hit = cache.get(w);
  if (hit) return hit;
  const bw = w - 0.06;
  const geo = new RoundedBoxGeometry(bw, 0.42, 0.94, 3, 0.09);
  // Taper the top so it looks like a real sculpted keycap.
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = (v.y + 0.21) / 0.42; // 0 bottom -> 1 top
    const shrink = 0.16 * t;
    const sx = (bw / 2 - shrink) / (bw / 2);
    const sz = (0.47 - shrink) / 0.47;
    v.x *= sx;
    v.z *= sz;
    // slight concave dish on top
    if (t > 0.95) v.y -= 0.025 * (1 - Math.min(1, (v.x * v.x) / ((bw / 2) ** 2)));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  cache.set(w, geo);
  return geo;
}

function buildLegendAtlas(labels: string[], cw: Colorway) {
  const cell = 128;
  const cols = 16;
  const rows = Math.ceil(labels.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cell * cols;
  canvas.height = cell * rows;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const uv = new Map<string, [number, number, number, number]>();
  labels.forEach((key, i) => {
    const [kind, label] = key.split("|");
    const cx = (i % cols) * cell;
    const cy = Math.floor(i / cols) * cell;
    ctx.fillStyle = kind === "alpha" ? cw.legendOnAlpha : kind === "mod" ? cw.legendOnMod : cw.legendOnAccent;
    const size = label.length === 1 ? 78 : label.length <= 3 ? 44 : 34;
    ctx.font = `700 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(label, cx + cell / 2, cy + cell / 2 + 2);
    uv.set(key, [cx / canvas.width, 1 - (cy + cell) / canvas.height, (cx + cell) / canvas.width, 1 - cy / canvas.height]);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = true; // no dark fringes around glyphs when mip-mapped
  tex.anisotropy = 4;
  return { tex, uv };
}

export function buildKeyboard(cw: Colorway): KeyboardModel {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  const width = 16;
  const depth = 5;
  const bezel = 0.55;

  // Case
  const caseMat = track(new THREE.MeshStandardMaterial({ color: cw.case, roughness: 0.45, metalness: 0.15 }));
  const caseGeo = track(new RoundedBoxGeometry(width + bezel * 2, 1.0, depth + bezel * 2, 4, 0.28));
  const caseMesh = new THREE.Mesh(caseGeo, caseMat);
  caseMesh.position.y = -0.35;
  caseMesh.castShadow = caseMesh.receiveShadow = true;
  group.add(caseMesh);

  // Plate (dark, slightly visible between keys)
  const plate = new THREE.Mesh(
    track(new THREE.BoxGeometry(width + 0.05, 0.05, depth + 0.05)),
    track(new THREE.MeshStandardMaterial({ color: "#2a2a2e", roughness: 0.6, metalness: 0.5 })),
  );
  plate.position.y = 0.16;
  plate.receiveShadow = true;
  group.add(plate);

  // Rubber feet
  const footMat = track(new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.9 }));
  const footGeo = track(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 16));
  for (const [x, z] of [[-7.5, -2.4], [7.5, -2.4], [-7.5, 2.4], [7.5, 2.4]]) {
    const f = new THREE.Mesh(footGeo, footMat);
    f.position.set(x, -0.9, z);
    group.add(f);
  }

  const matFor = {
    alpha: track(new THREE.MeshStandardMaterial({ color: cw.alpha, roughness: 0.62 })),
    mod: track(new THREE.MeshStandardMaterial({ color: cw.mod, roughness: 0.62 })),
    accent: track(new THREE.MeshStandardMaterial({ color: cw.accent, roughness: 0.55 })),
  };

  const labelKeys = Array.from(new Set(LAYOUT_65.flat().filter((k) => k.label).map((k) => `${k.kind}|${k.label}`)));
  const atlas = buildLegendAtlas(labelKeys, cw);
  track(atlas.tex);
  const legendMat = track(
    new THREE.MeshBasicMaterial({ map: atlas.tex, transparent: true, premultipliedAlpha: true, depthWrite: false, toneMapped: false }),
  );
  const geoCache = new Map<number, THREE.BufferGeometry>();

  const keys: KeyboardModel["keys"] = [];
  LAYOUT_65.forEach((row, r) => {
    let x = -width / 2;
    const z = -depth / 2 + r + 0.5;
    for (const k of row) {
      const cx = x + k.w / 2;
      x += k.w;
      const pivot = new THREE.Group();
      const restY = 0.42 + ROW_SCULPT[r].h;
      pivot.position.set(cx, restY, z);
      pivot.rotation.x = ROW_SCULPT[r].tilt;
      const cap = new THREE.Mesh(keycapGeometry(k.w, geoCache), matFor[k.kind]);
      cap.castShadow = true;
      cap.receiveShadow = true;
      pivot.add(cap);
      if (k.label) {
        const [u0, v0, u1, v1] = atlas.uv.get(`${k.kind}|${k.label}`)!;
        const size = 0.7;
        const lg = track(new THREE.PlaneGeometry(size, size));
        const uvs = lg.attributes.uv;
        uvs.setXY(0, u0, v1);
        uvs.setXY(1, u1, v1);
        uvs.setXY(2, u0, v0);
        uvs.setXY(3, u1, v0);
        const legend = new THREE.Mesh(lg, legendMat);
        legend.rotation.x = -Math.PI / 2;
        legend.position.y = 0.196;
        if (k.w > 1.3) legend.position.x = -(k.w - 1) / 2 + 0.15; // left-aligned on wide mods, like real boards
        pivot.add(legend);
      }
      group.add(pivot);
      keys.push({ mesh: pivot, restY, label: k.label || "Space", press: 0 });
    }
  });
  geoCache.forEach((g) => disposables.push(g));

  return {
    group,
    keys,
    width: width + bezel * 2,
    depth: depth + bezel * 2,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

/** Call every frame: animates key presses (press = 1 → key fully down, decays back). */
export function animateKeys(model: KeyboardModel, dt: number) {
  for (const k of model.keys) {
    if (k.press > 0) {
      k.press = Math.max(0, k.press - dt * 7);
      const travel = Math.sin(Math.min(1, k.press) * Math.PI * 0.5) * 0.2;
      k.mesh.position.y = k.restY - travel;
    }
  }
}
