/** Procedural geometry helpers (Babylon has no rounded box builder). */
import { Mesh, VertexData, type Scene } from "@babylonjs/core";

export interface RoundedBoxOpts {
  w: number;
  h: number;
  d: number;
  r: number;
  seg?: number; // subdivisions per face edge (more = smoother corners)
  /** UV rect [u0,v0,u1,v1] for the top (+Y) face; other faces map to `sideUv`. */
  topUv?: [number, number, number, number];
  sideUv?: [number, number];
  /** Post-process each vertex (taper, dish…). Receives normalized height t (0 bottom → 1 top). */
  shape?: (p: { x: number; y: number; z: number }, t: number) => void;
}

/**
 * Rounded box: a subdivided cube whose vertices are pulled onto a rounded shell
 * (inner box + radius along the normal). Smooth normals, optional UV regions.
 */
export function roundedBoxData(o: RoundedBoxOpts): VertexData {
  const seg = o.seg ?? 6;
  const hw = o.w / 2;
  const hh = o.h / 2;
  const hd = o.d / 2;
  const r = Math.min(o.r, hw, hh, hd);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  // face: normal axis, and two tangent axes
  const faces: { n: [number, number, number]; u: [number, number, number]; v: [number, number, number] }[] = [
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }, // top
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] }, // bottom
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  ];
  const half = [hw, hh, hd];
  const inner = [hw - r, hh - r, hd - r];
  for (const f of faces) {
    const base = positions.length / 3;
    for (let j = 0; j <= seg; j++) {
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * 2 - 1;
        const b = (j / seg) * 2 - 1;
        // point on the cube surface
        const p = [0, 1, 2].map((k) => f.n[k] * half[k] + f.u[k] * a * half[k] + f.v[k] * b * half[k]);
        // pull onto rounded shell
        const c = p.map((v, k) => Math.max(-inner[k], Math.min(inner[k], v)));
        let nx = p[0] - c[0];
        let ny = p[1] - c[1];
        let nz = p[2] - c[2];
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        if (len < 1e-6) [nx, ny, nz] = f.n;
        const pos = { x: c[0] + nx * r, y: c[1] + ny * r, z: c[2] + nz * r };
        if (o.shape) o.shape(pos, (pos.y + hh) / o.h);
        positions.push(pos.x, pos.y, pos.z);
        normals.push(nx, ny, nz);
        if (o.topUv && ny > 0.6) {
          const [u0, v0, u1, v1] = o.topUv;
          uvs.push(u0 + ((pos.x + hw) / o.w) * (u1 - u0), v0 + ((hd - pos.z) / o.d) * (v1 - v0));
        } else if (o.sideUv) {
          uvs.push(o.sideUv[0], o.sideUv[1]);
        } else {
          uvs.push(i / seg, j / seg);
        }
      }
    }
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = base + j * (seg + 1) + i;
        const b = a + 1;
        const c = a + seg + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.uvs = uvs;
  if (o.shape) {
    VertexData.ComputeNormals(positions, indices, normals);
  }
  vd.normals = normals;
  return vd;
}

export function roundedBox(name: string, o: RoundedBoxOpts, scene: Scene): Mesh {
  const m = new Mesh(name, scene);
  roundedBoxData(o).applyToMesh(m);
  return m;
}
