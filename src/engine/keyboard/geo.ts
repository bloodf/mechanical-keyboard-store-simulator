/**
 * Small mesh builder for the keyboard parts, in "cap space" millimeters: x = typist's right,
 * y = away from the typist, z = up; faces counter-clockwise seen from outside (right-handed).
 * toVertexData() converts to Babylon's left-handed board space: X = −x, Y = z, Z = −y.
 */
import { VertexData } from "@babylonjs/core";

export type Pt = [number, number];

/** Rounded rectangle outline, CCW seen from above, starting at the front-right corner. */
export function rrect(w: number, d: number, r: number, per = 6, cx = 0, cy = 0): Pt[] {
  r = Math.max(0.01, Math.min(r, w / 2 - 0.01, d / 2 - 0.01));
  const pts: Pt[] = [];
  const corners: [number, number, number][] = [
    [cx + w / 2 - r, cy - d / 2 + r, -90],
    [cx + w / 2 - r, cy + d / 2 - r, 0],
    [cx - w / 2 + r, cy + d / 2 - r, 90],
    [cx - w / 2 + r, cy - d / 2 + r, 180],
  ];
  for (const [ox, oy, a0] of corners) {
    for (let i = 0; i < per; i++) {
      const a = ((a0 + (90 * i) / (per - 1)) * Math.PI) / 180;
      pts.push([ox + r * Math.cos(a), oy + r * Math.sin(a)]);
    }
  }
  return pts;
}

export class Geo {
  pos: number[] = [];
  uv: number[] = [];
  idx: number[] = [];

  v(x: number, y: number, z: number, u = 0, w = 0): number {
    this.pos.push(x, y, z);
    this.uv.push(u, w);
    return this.pos.length / 3 - 1;
  }

  ring(pts: Pt[], z: number | ((x: number, y: number) => number)): number[] {
    return pts.map(([x, y]) => this.v(x, y, typeof z === "number" ? z : z(x, y)));
  }

  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }

  /** Wall between two rings (a below b); outward unless inward = true. */
  bridge(a: number[], b: number[], inward = false) {
    const n = a.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (inward) this.quad(a[j], a[i], b[i], b[j]);
      else this.quad(a[i], a[j], b[j], b[i]);
    }
  }

  /** Close a ring with a fan: up = facing +z. */
  fan(ring: number[], up: boolean) {
    let cx = 0, cy = 0, cz = 0;
    for (const i of ring) {
      cx += this.pos[i * 3];
      cy += this.pos[i * 3 + 1];
      cz += this.pos[i * 3 + 2];
    }
    const n = ring.length;
    const c = this.v(cx / n, cy / n, cz / n);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (up) this.tri(ring[i], ring[j], c);
      else this.tri(ring[j], ring[i], c);
    }
  }

  /** Closed vertical prism (hard edges) from an outline, z0..z1. */
  prism(pts: Pt[], z0: number, z1: number) {
    const b = this.ring(pts, z0);
    const t = this.ring(pts, z1);
    this.bridge(b, t);
    this.fan(this.ring(pts, z1), true);
    this.fan(this.ring(pts, z0), false);
  }

  box(cx: number, cy: number, z0: number, w: number, d: number, h: number) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - d / 2, y1 = cy + d / 2, z1 = z0 + h;
    const f = (a: number[], b: number[], c: number[], d: number[]) => this.quad(this.v(a[0], a[1], a[2]), this.v(b[0], b[1], b[2]), this.v(c[0], c[1], c[2]), this.v(d[0], d[1], d[2]));
    f([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]); // bottom
    f([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); // top
    f([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]); // front (−y)
    f([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]); // back
    f([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]); // right
    f([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]); // left
  }

  /** Cylinder along z. */
  cylinder(cx: number, cy: number, z0: number, r: number, h: number, seg = 16) {
    const pts: Pt[] = Array.from({ length: seg }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / seg), cy + r * Math.sin((2 * Math.PI * i) / seg)]);
    const b = this.ring(pts, z0);
    const t = this.ring(pts, z0 + h);
    this.bridge(b, t);
    this.fan(t, true);
    this.fan(b, false);
  }

  /** Tube through points (cap space) with a round section. */
  tube(path: [number, number, number][], r: number, seg = 8) {
    let prevRing: number[] | null = null;
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const a = path[Math.max(0, i - 1)];
      const b = path[Math.min(path.length - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      // any vector not parallel to t
      let ux = 0, uy = 0, uz = 1;
      if (Math.abs(tz) > 0.9) { ux = 1; uz = 0; }
      // n1 = normalize(u × t), n2 = t × n1
      let n1x = uy * tz - uz * ty, n1y = uz * tx - ux * tz, n1z = ux * ty - uy * tx;
      const nl = Math.hypot(n1x, n1y, n1z) || 1;
      n1x /= nl; n1y /= nl; n1z /= nl;
      const n2x = ty * n1z - tz * n1y, n2y = tz * n1x - tx * n1z, n2z = tx * n1y - ty * n1x;
      const ring: number[] = [];
      for (let k = 0; k < seg; k++) {
        const ang = (2 * Math.PI * k) / seg;
        const c = Math.cos(ang) * r, s = Math.sin(ang) * r;
        ring.push(this.v(p[0] + n1x * c + n2x * s, p[1] + n1y * c + n2y * s, p[2] + n1z * c + n2z * s));
      }
      if (prevRing) {
        for (let k = 0; k < seg; k++) {
          const j = (k + 1) % seg;
          this.quad(prevRing[k], prevRing[j], ring[j], ring[k]);
        }
      }
      prevRing = ring;
    }
  }

  /**
   * Babylon vertex data. uvMode "box": world-space box projection (mm × uvScale) by dominant normal;
   * "keep": the uvs given to v().
   */
  toVertexData(uvMode: "box" | "keep" = "keep", uvScale = 0.01, uvOffset: [number, number] = [0, 0]): VertexData {
    const P = this.pos;
    const nv = P.length / 3;
    const nrm = new Float32Array(nv * 3);
    const I = this.idx;
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const p of [a, b, c]) {
        nrm[p] += nx;
        nrm[p + 1] += ny;
        nrm[p + 2] += nz;
      }
    }
    const positions = new Float32Array(nv * 3);
    const normals = new Float32Array(nv * 3);
    const uvs = new Float32Array(nv * 2);
    for (let v = 0; v < nv; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      const l = Math.hypot(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]) || 1;
      const nx = nrm[v * 3] / l, ny = nrm[v * 3 + 1] / l, nz = nrm[v * 3 + 2] / l;
      positions[v * 3] = -x;
      positions[v * 3 + 1] = z;
      positions[v * 3 + 2] = -y;
      normals[v * 3] = -nx;
      normals[v * 3 + 1] = nz;
      normals[v * 3 + 2] = -ny;
      if (uvMode === "box") {
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        if (az >= ax && az >= ay) {
          uvs[v * 2] = x * uvScale + uvOffset[0];
          uvs[v * 2 + 1] = y * uvScale + uvOffset[1];
        } else if (ay >= ax) {
          uvs[v * 2] = x * uvScale + uvOffset[0];
          uvs[v * 2 + 1] = z * uvScale + uvOffset[1];
        } else {
          uvs[v * 2] = y * uvScale + uvOffset[0];
          uvs[v * 2 + 1] = z * uvScale + uvOffset[1];
        }
      } else {
        uvs[v * 2] = this.uv[v * 2];
        uvs[v * 2 + 1] = this.uv[v * 2 + 1];
      }
    }
    const vd = new VertexData();
    vd.positions = positions;
    vd.normals = normals;
    vd.uvs = uvs;
    vd.indices = new Uint32Array(I);
    return vd;
  }
}
