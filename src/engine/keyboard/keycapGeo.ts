/**
 * Keycap mesh generator (port of art/blender/keycap.py). Built like a real keycap:
 *  - lofted shell from the 18 mm base outline to the smaller sculpted top (slightly convex walls),
 *  - a 0.6 mm rounded lip rolling into a cylindrical (Cherry/OEM) or spherical (SA/DSA/XDA/MT3/KAT/LP) dish,
 *  - row sculpt (height + tilt per row),
 *  - a hollow interior with the stem socket (hidden in play, but the caps read as real from below),
 *  - legend UVs: the top is projected onto an atlas cell, everything else samples the plain cap color.
 *
 * Works in cap space (mm): x = typist's right, y = away from the typist, z = up; base center at the origin.
 * Output is converted to Babylon's left-handed board space: X = −x, Y = z, Z = −y.
 */
import { PROFILE_GEO, type KeycapProfile, type ProfileRow } from "../../data/profiles";

export const PITCH = 19.05;
const GAP = 0.525; // 19.05 − 18.0 = 1.05 mm between caps
const CORNER = 6; // points per rounded corner

export interface CapGeoOpts {
  profile: KeycapProfile;
  row: ProfileRow;
  w: number; // units
  h: number; // units
  /** Atlas cell for the legend (u0, v0, u1, v1; v1 = top of the legend). */
  cell?: [number, number, number, number];
  /** UV of the plain cap color (walls, inside). */
  solid?: [number, number];
  /** Put the legend on the left part of the top (wide modifiers). */
  legendLeft?: boolean;
}

export interface CapGeo {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Height of the highest point of the top above the base (mm). */
  top: number;
}

function rrect(cx: number, cy: number, w: number, d: number, r: number): [number, number][] {
  r = Math.max(0.01, Math.min(r, w / 2 - 0.01, d / 2 - 0.01));
  const pts: [number, number][] = [];
  const corners: [number, number, number][] = [
    [cx + w / 2 - r, cy - d / 2 + r, -90],
    [cx + w / 2 - r, cy + d / 2 - r, 0],
    [cx - w / 2 + r, cy + d / 2 - r, 90],
    [cx - w / 2 + r, cy - d / 2 + r, 180],
  ];
  for (const [ox, oy, a0] of corners) {
    for (let i = 0; i < CORNER; i++) {
      const a = ((a0 + (90 * i) / (CORNER - 1)) * Math.PI) / 180;
      pts.push([ox + r * Math.cos(a), oy + r * Math.sin(a)]);
    }
  }
  return pts;
}

export function buildKeycap(o: CapGeoOpts): CapGeo {
  const P = PROFILE_GEO[o.profile];
  const [height, angle] = P.rows[o.row];
  const W = o.w * PITCH - 2 * GAP;
  const D = o.h * PITCH - 2 * GAP;
  const w1 = W - 2 * P.side;
  const d1 = D - P.front - P.back;
  const yc = (P.front - P.back) / 2; // the top center sits toward the back
  const tilt = Math.tan((angle * Math.PI) / 180);

  const pos: number[] = []; // cap space
  const uv: number[] = [];
  const top: boolean[] = [];
  const idx: number[] = [];
  const solid = o.solid ?? [0, 0];
  const vert = (x: number, y: number, z: number, isTop = false) => {
    pos.push(x, y, z);
    top.push(isTop);
    uv.push(solid[0], solid[1]);
    return pos.length / 3 - 1;
  };
  const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d); // CCW seen from outside (RH, z up)
  const bridge = (a: number[], b: number[]) => {
    const n = a.length;
    for (let i = 0; i < n; i++) quad(a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]);
  };

  const planeZ = (_x: number, y: number, t: number) => t * height + (y - yc) * tilt * t;
  const dish = (x: number, y: number) => {
    const hx = w1 / 2;
    const hy = d1 / 2;
    if (P.dish === "cyl") {
      const u = Math.min(1, Math.abs(x) / hx);
      return P.depth * (1 - u * u);
    }
    const u = (x / hx) ** 2 + ((y - yc) / hy) ** 2;
    return P.depth * Math.max(0, 1 - u);
  };

  // --- walls: base → outer top edge (convex), then a rounded lip (fillet FR) rolling onto the dish
  const FR = Math.min(0.6, height * 0.15);
  const wt = w1 + 2 * FR;
  const dt = d1 + 2 * FR;
  const rings: number[][] = [];
  for (const t of [0, 0.06, 0.2, 0.38, 0.56, 0.72, 0.85, 0.95, 1]) {
    const e = 1 - (1 - t) ** 1.55;
    const w = W + (wt - W) * e;
    const d = D + (dt - D) * e;
    const cy = yc * e;
    const r = P.baseR + (P.topR + FR - P.baseR) * e;
    rings.push(rrect(0, cy, w, d, r).map(([x, y]) => vert(x, y, t > 0 ? planeZ(x, y, t) - FR * t : 0)));
  }
  for (const a of [30, 60, 90]) {
    const ca = Math.cos((a * Math.PI) / 180);
    const sa = Math.sin((a * Math.PI) / 180);
    const grow = FR * (1 - ca);
    rings.push(rrect(0, yc, wt - 2 * grow, dt - 2 * grow, P.topR + FR - grow).map(([x, y]) => vert(x, y, planeZ(x, y, 1) - FR * (1 - sa) - dish(x, y) * (a / 90), a === 90)));
  }
  for (let i = 0; i < rings.length - 1; i++) bridge(rings[i], rings[i + 1]);
  // --- dish: concentric rings toward the center
  const K = 6;
  let prev = rings[rings.length - 1];
  for (let k = 1; k < K; k++) {
    const s = 1 - k / K;
    const ring = rrect(0, yc, w1 * s, d1 * s, Math.max(0.05, P.topR * s)).map(([x, y]) => vert(x, y, planeZ(x, y, 1) - dish(x, y), true));
    bridge(prev, ring);
    prev = ring;
  }
  const center = vert(0, yc, planeZ(0, yc, 1) - dish(0, yc), true);
  for (let i = 0; i < prev.length; i++) idx.push(prev[i], prev[(i + 1) % prev.length], center);

  // --- interior: bottom rim (own verts for a crisp edge), inner walls, ceiling, stem socket
  const tw = Math.min(1.3, height * 0.3);
  const innerH = Math.max(0.8, Math.min(planeZ(0, -d1 / 2, 1), planeZ(0, d1 / 2, 1)) - P.depth - Math.min(1.4, height * 0.3));
  const n = rings[0].length;
  const rimOuter = rrect(0, 0, W, D, P.baseR).map(([x, y]) => vert(x, y, 0));
  const innerBase = rrect(0, 0, W - 2 * tw, D - 2 * tw, Math.max(0.2, P.baseR - 0.5)).map(([x, y]) => vert(x, y, 0));
  const innerTop = rrect(0, yc * 0.6, Math.max(2, w1 - 0.6), Math.max(2, d1 - 0.6), Math.max(0.2, P.topR - 0.6)).map(([x, y]) => vert(x, y, innerH));
  for (let i = 0; i < n; i++) quad(rimOuter[(i + 1) % n], rimOuter[i], innerBase[i], innerBase[(i + 1) % n]);
  for (let i = 0; i < n; i++) quad(innerBase[(i + 1) % n], innerBase[i], innerTop[i], innerTop[(i + 1) % n]);
  const ceil = vert(0, yc * 0.6, innerH);
  for (let i = 0; i < n; i++) idx.push(innerTop[(i + 1) % n], innerTop[i], ceil);
  if (P.mount === "mx") {
    // Ø5.5 stem socket down to 1 mm above the skirt
    const seg = 16;
    const sb: number[] = [];
    const st: number[] = [];
    for (let i = 0; i < seg; i++) {
      const a = (2 * Math.PI * i) / seg;
      sb.push(vert(2.75 * Math.cos(a), 2.75 * Math.sin(a), 1));
      st.push(vert(2.75 * Math.cos(a), 2.75 * Math.sin(a), innerH));
    }
    for (let i = 0; i < seg; i++) quad(sb[i], sb[(i + 1) % seg], st[(i + 1) % seg], st[i]);
    const sc = vert(0, 0, 1);
    for (let i = 0; i < seg; i++) idx.push(sb[(i + 1) % seg], sb[i], sc);
  }

  // --- legend UVs on the top (clamped to the cell: its border is plain cap color)
  if (o.cell) {
    const [u0, v0, u1, v1] = o.cell;
    const sq = Math.min(w1, d1) * 0.92;
    const off = o.legendLeft ? -(w1 - sq) / 2 + 1.2 : 0;
    for (let v = 0; v < top.length; v++) {
      if (!top[v]) continue;
      const lx = Math.min(1, Math.max(0, (pos[v * 3] - off) / sq + 0.5));
      const ly = Math.min(1, Math.max(0, (pos[v * 3 + 1] - yc) / sq + 0.5));
      uv[v * 2] = u0 + lx * (u1 - u0);
      uv[v * 2 + 1] = v0 + ly * (v1 - v0);
    }
  }

  // --- smooth normals (area weighted) in cap space, then convert to board space
  const nv = pos.length / 3;
  const nrm = new Float32Array(nv * 3);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3;
    const b = idx[i + 1] * 3;
    const c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const p of [a, b, c]) {
      nrm[p] += nx;
      nrm[p + 1] += ny;
      nrm[p + 2] += nz;
    }
  }
  const positions = new Float32Array(nv * 3);
  const normals = new Float32Array(nv * 3);
  let maxZ = 0;
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    maxZ = Math.max(maxZ, z);
    positions[v * 3] = -x;
    positions[v * 3 + 1] = z;
    positions[v * 3 + 2] = -y;
    const l = Math.hypot(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]) || 1;
    normals[v * 3] = -nrm[v * 3] / l;
    normals[v * 3 + 1] = nrm[v * 3 + 2] / l;
    normals[v * 3 + 2] = -nrm[v * 3 + 1] / l;
  }
  // The axis swap mirrors the mesh; Babylon's left-handed front faces take the original (CCW) order as is.
  const indices = new Uint32Array(idx);
  return { positions, normals, uvs: new Float32Array(uv), indices, top: maxZ };
}
