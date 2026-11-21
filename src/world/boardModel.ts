/**
 * Procedural keyboard that is assembled layer by layer at the workbench:
 * case → foams → PCB (+tape on the back) → plate → stabilizers → switches → keycaps.
 * Works for every layout. 1 unit = 1u (19.05 mm); the bench scales the group down.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { KeycapSet, SwitchProduct } from "../data/catalog";
import { getLayout, needsStab, type KeyGeom, type Layout, type LayoutId } from "../data/layouts";
import { KEYCAP_PROFILE_SHAPE, type CaseMaterialDef, type PcbDef, type PlateDef, type StabDef } from "../data/parts";

// Vertical stack (u)
const Y = {
  floorTop: 0,
  silicone: 0.04,
  caseFoam: 0.2,
  pcb: 0.46,
  peFoam: 0.515,
  plateFoam: 0.6,
  plate: 0.73,
  switchTop: 0.92,
  capBase: 1.08,
  wallTop: 0.98,
};
const BEZEL = 0.55;

interface Tween {
  obj: THREE.Object3D;
  from: number;
  to: number;
  t: number;
  dur: number;
  prop: "y" | "rotX";
  done?: () => void;
}

const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

function woodTexture(hex: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d")!;
  const base = new THREE.Color(hex);
  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 70; i++) {
    const y = Math.random() * 128;
    const dark = base.clone().multiplyScalar(0.7 + Math.random() * 0.2);
    g.strokeStyle = `#${dark.getHexString()}`;
    g.globalAlpha = 0.25 + Math.random() * 0.35;
    g.lineWidth = 0.6 + Math.random() * 2;
    g.beginPath();
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + Math.sin(x / 60 + i) * 3 + Math.sin(x / 13 + i * 3) * 0.8);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function pcbTexture(layout: Layout, def: PcbDef, side: "top" | "bottom"): THREE.CanvasTexture {
  const ppu = 48;
  const c = document.createElement("canvas");
  c.width = Math.ceil(layout.width * ppu);
  c.height = Math.ceil(layout.depth * ppu);
  const g = c.getContext("2d")!;
  g.fillStyle = def.color;
  g.fillRect(0, 0, c.width, c.height);
  // traces
  g.strokeStyle = "rgba(255,255,255,0.08)";
  g.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    const y = Math.random() * c.height;
    g.moveTo(0, y);
    g.lineTo(c.width * 0.3 + Math.random() * c.width * 0.7, y + (Math.random() - 0.5) * 30);
    g.stroke();
  }
  for (const k of layout.keys) {
    const cx = (k.x + k.w / 2) * ppu;
    const cy = (k.y + k.h / 2) * ppu;
    if (side === "top") {
      g.fillStyle = "#d9b458";
      g.beginPath();
      g.arc(cx - 0.2 * ppu, cy - 0.13 * ppu, 4, 0, Math.PI * 2);
      g.arc(cx + 0.13 * ppu, cy - 0.26 * ppu, 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.beginPath();
      g.arc(cx, cy, 6, 0, Math.PI * 2);
      g.fill();
      if (def.rgb) {
        g.fillStyle = "#f4f4f4";
        g.fillRect(cx - 5, cy + 0.25 * ppu, 10, 6);
      }
    } else {
      if (def.hotswap) {
        g.fillStyle = "#151515";
        g.fillRect(cx - 0.28 * ppu, cy - 0.3 * ppu, 0.52 * ppu, 0.24 * ppu);
      }
      g.fillStyle = "#d9b458";
      g.fillRect(cx - 0.36 * ppu, cy - 0.28 * ppu, 4, 6);
      g.fillRect(cx + 0.28 * ppu, cy - 0.28 * ppu, 4, 6);
    }
  }
  if (def.flex) {
    g.fillStyle = "rgba(0,0,0,0.6)";
    for (let x = 3; x < layout.width - 2; x += 4) g.fillRect(x * ppu, 0.4 * ppu, 0.12 * ppu, (layout.depth - 0.8) * ppu);
  }
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.font = "bold 16px monospace";
  g.fillText(side === "top" ? "MKSS-PCB rev.2  ♥ thock responsibly" : "DO NOT LICK", 8, c.height - 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function plateGeometry(layout: Layout, thickness = 0.06): THREE.BufferGeometry {
  const W = layout.width + 0.1;
  const D = layout.depth + 0.1;
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, -D / 2);
  shape.lineTo(W / 2, -D / 2);
  shape.lineTo(W / 2, D / 2);
  shape.lineTo(-W / 2, D / 2);
  shape.lineTo(-W / 2, -D / 2);
  const s = 0.74 / 2;
  for (const k of layout.keys) {
    const cx = k.x + k.w / 2 - layout.width / 2;
    const cy = -(k.y + k.h / 2 - layout.depth / 2);
    const hole = new THREE.Path();
    hole.moveTo(cx - s, cy - s);
    hole.lineTo(cx - s, cy + s);
    hole.lineTo(cx + s, cy + s);
    hole.lineTo(cx + s, cy - s);
    hole.lineTo(cx - s, cy - s);
    shape.holes.push(hole);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function keycapGeometry(w: number, h: number, shape: (typeof KEYCAP_PROFILE_SHAPE)["low"]): THREE.BufferGeometry {
  const bw = w - 0.07;
  const bd = h - 0.07;
  const H = shape.height;
  const geo = new RoundedBoxGeometry(bw, H, bd, 3, 0.08);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = (v.y + H / 2) / H;
    const shrink = shape.taper * t;
    v.x *= (bw / 2 - shrink) / (bw / 2);
    v.z *= (bd / 2 - shrink) / (bd / 2);
    if (t > 0.95) v.y -= shape.dish * (1 - Math.min(1, (v.x * v.x) / ((bw / 2) ** 2)));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function luminance(hex: string): number {
  const c = new THREE.Color(hex); // linear RGB
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
/** Keep the legend color if it contrasts enough with the keycap, else use near-black/white. */
function readableOn(legend: string, cap: string): string {
  const a = luminance(legend) + 0.05;
  const b = luminance(cap) + 0.05;
  if (Math.max(a, b) / Math.min(a, b) >= 3.2) return legend;
  return luminance(cap) > 0.25 ? "#1e1b18" : "#f7f4ee";
}

const ROW_TILT = [0.1, 0.06, 0, -0.05, -0.12, -0.14, -0.14];
const ROW_LIFT = [0.04, 0.02, 0, 0.04, 0.1, 0.12, 0.12];

export class BoardModel {
  readonly group = new THREE.Group();
  readonly layout: Layout;
  private disposables: { dispose(): void }[] = [];
  private tweens: Tween[] = [];

  private caseGroup = new THREE.Group();
  private caseFoam: THREE.Mesh;
  private silicone: THREE.Mesh;
  private pcbGroup = new THREE.Group();
  private pcbMesh: THREE.Mesh | null = null;
  private tapeStrips: THREE.Mesh[] = [];
  private peFoam: THREE.Mesh;
  private plateFoam: THREE.Mesh;
  private plateMesh: THREE.Mesh | null = null;
  private plateGeo: THREE.BufferGeometry | null = null;
  private stabGroup = new THREE.Group();

  private housings: THREE.InstancedMesh;
  private stems: THREE.InstancedMesh;
  private housingMat: THREE.MeshStandardMaterial;
  private stemMat: THREE.MeshStandardMaterial;
  private switchIn: number[]; // 0..1 install animation per key
  private switchTarget: number[];

  private capGroup = new THREE.Group();
  private caps: (THREE.Group | null)[];
  private capIn: number[];
  private capTarget: number[];
  private press: number[];
  private capSetId: string | null = null;

  private markers: THREE.InstancedMesh;
  private markerOn: boolean[];
  private hit: THREE.InstancedMesh;
  private tmp = new THREE.Object3D();
  private tmpColor = new THREE.Color();

  constructor(layoutId: LayoutId) {
    this.layout = getLayout(layoutId);
    const L = this.layout;
    const n = L.keys.length;
    this.group.add(this.caseGroup, this.pcbGroup, this.stabGroup, this.capGroup);

    const slab = (w: number, h: number, d: number, color: string, opts: THREE.MeshStandardMaterialParameters = {}) => {
      const m = new THREE.Mesh(this.track(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.05, h / 2.2))), this.track(new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...opts })));
      m.receiveShadow = true;
      m.visible = false;
      this.group.add(m);
      return m;
    };
    this.silicone = slab(L.width - 0.2, 0.08, L.depth - 0.2, "#eef2f5", { transparent: true, opacity: 0.8, roughness: 0.6 });
    this.silicone.position.y = Y.silicone;
    this.caseFoam = slab(L.width - 0.15, 0.22, L.depth - 0.15, "#3d4148");
    this.caseFoam.position.y = Y.caseFoam;
    this.peFoam = slab(L.width, 0.02, L.depth, "#fafafa", { roughness: 0.7 });
    this.peFoam.position.y = Y.peFoam;
    // Plate foam has the same switch cutouts as the plate.
    this.plateFoam = new THREE.Mesh(this.track(plateGeometry(L, 0.12)), this.track(new THREE.MeshStandardMaterial({ color: "#d8d1bd", roughness: 0.95 })));
    this.plateFoam.visible = false;
    this.plateFoam.position.y = Y.plateFoam - 0.06;
    this.group.add(this.plateFoam);

    // Switches (instanced)
    this.housingMat = this.track(new THREE.MeshStandardMaterial({ color: "#222", roughness: 0.4, transparent: true }));
    this.stemMat = this.track(new THREE.MeshStandardMaterial({ color: "#e23b3b", roughness: 0.45 }));
    const housingGeo = this.track(new RoundedBoxGeometry(0.74, 0.26, 0.74, 2, 0.06));
    const stemGeo = this.track(mergeGeometries([new THREE.BoxGeometry(0.3, 0.2, 0.09), new THREE.BoxGeometry(0.09, 0.2, 0.3)])!);
    this.housings = new THREE.InstancedMesh(housingGeo, this.housingMat, n);
    this.stems = new THREE.InstancedMesh(stemGeo, this.stemMat, n);
    this.housings.castShadow = true;
    this.group.add(this.housings, this.stems);
    this.switchIn = new Array(n).fill(0);
    this.switchTarget = new Array(n).fill(0);

    this.caps = new Array(n).fill(null);
    this.capIn = new Array(n).fill(0);
    this.capTarget = new Array(n).fill(0);
    this.press = new Array(n).fill(0);

    // Markers (tester / faults) and invisible hit boxes for picking keys.
    this.markers = new THREE.InstancedMesh(
      this.track(new THREE.CircleGeometry(0.16, 20).rotateX(-Math.PI / 2)),
      this.track(new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false })),
      n,
    );
    this.markers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.markerOn = new Array(n).fill(false);
    this.hit = new THREE.InstancedMesh(this.track(new THREE.BoxGeometry(1, 0.8, 1)), this.track(new THREE.MeshBasicMaterial({ visible: false })), n);
    L.keys.forEach((k, i) => {
      const [x, z] = this.keyXZ(k);
      this.tmp.position.set(x, Y.capBase, z);
      this.tmp.rotation.set(0, 0, 0);
      this.tmp.scale.set(k.w - 0.05, 1, k.h - 0.05);
      this.tmp.updateMatrix();
      this.hit.setMatrixAt(i, this.tmp.matrix);
    });
    this.group.add(this.markers, this.hit);
    this.refreshSwitchMatrices();
    this.refreshMarkers();
  }

  private track<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  keyXZ(k: KeyGeom): [number, number] {
    return [k.x + k.w / 2 - this.layout.width / 2, k.y + k.h / 2 - this.layout.depth / 2];
  }

  /** World-space width of the case (before group scale). */
  get outerWidth() {
    return this.layout.width + BEZEL * 2;
  }
  get outerDepth() {
    return this.layout.depth + BEZEL * 2;
  }

  // ---------- Case ----------
  setCase(def: CaseMaterialDef | null, colorHex: string | null, animate = true) {
    this.caseGroup.clear();
    if (!def || !colorHex) return;
    const W = this.outerWidth;
    const D = this.outerDepth;
    const wallH = Y.wallTop + 0.35;
    const params: THREE.MeshStandardMaterialParameters = { color: colorHex, metalness: def.look.metalness, roughness: def.look.roughness };
    if (def.look.opacity !== undefined) Object.assign(params, { transparent: true, opacity: def.look.opacity, depthWrite: false });
    if (def.id === "wood") params.map = this.track(woodTexture(colorHex));
    if (def.id === "wood") params.color = "#ffffff";
    const mat = this.track(new THREE.MeshStandardMaterial(params));
    const add = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(this.track(new RoundedBoxGeometry(w, h, d, 3, 0.16)), mat);
      m.position.set(x, y, z);
      m.castShadow = !params.transparent;
      m.receiveShadow = true;
      this.caseGroup.add(m);
    };
    add(W, 0.35, D, 0, -0.175, 0); // floor
    const cy = -0.35 + wallH / 2;
    add(W, wallH, BEZEL, 0, cy, -D / 2 + BEZEL / 2);
    add(W, wallH, BEZEL, 0, cy, D / 2 - BEZEL / 2);
    add(BEZEL, wallH, D - BEZEL * 2 + 0.3, -W / 2 + BEZEL / 2, cy, 0);
    add(BEZEL, wallH, D - BEZEL * 2 + 0.3, W / 2 - BEZEL / 2, cy, 0);
    // Feet
    const foot = this.track(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16));
    const footMat = this.track(new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.9 }));
    for (const [fx, fz] of [[-W / 2 + 1, -D / 2 + 0.8], [W / 2 - 1, -D / 2 + 0.8], [-W / 2 + 1, D / 2 - 0.8], [W / 2 - 1, D / 2 - 0.8]]) {
      const f = new THREE.Mesh(foot, footMat);
      f.position.set(fx, -0.4, fz);
      this.caseGroup.add(f);
    }
    if (animate) this.drop(this.caseGroup, 0);
  }

  // ---------- Dampening ----------
  setDampening(ids: string[], animate = true) {
    const set = (m: THREE.Mesh, on: boolean, y: number) => {
      if (on && !m.visible && animate) this.drop(m, y);
      m.visible = on;
    };
    set(this.silicone, ids.includes("silicone"), Y.silicone);
    set(this.caseFoam, ids.includes("caseFoam"), Y.caseFoam);
    set(this.peFoam, ids.includes("peFoam"), Y.peFoam);
    set(this.plateFoam, ids.includes("plateFoam"), Y.plateFoam - 0.06);
  }

  // ---------- PCB ----------
  setPcb(def: PcbDef | null, animate = true) {
    this.pcbGroup.clear();
    this.pcbMesh = null;
    this.tapeStrips = [];
    if (!def) return;
    const L = this.layout;
    const top = this.track(pcbTexture(L, def, "top"));
    const bottom = this.track(pcbTexture(L, def, "bottom"));
    const side = this.track(new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.6 }));
    const mats = [
      side,
      side,
      this.track(new THREE.MeshStandardMaterial({ map: top, roughness: 0.55, metalness: 0.1 })),
      this.track(new THREE.MeshStandardMaterial({ map: bottom, roughness: 0.55, metalness: 0.1 })),
      side,
      side,
    ];
    const geo = this.track(new THREE.BoxGeometry(L.width, 0.08, L.depth));
    // Box UVs on the bottom face are mirrored; flip so the back texture reads correctly when flipped.
    this.pcbMesh = new THREE.Mesh(geo, mats);
    this.pcbMesh.receiveShadow = true;
    this.pcbGroup.add(this.pcbMesh);
    this.pcbGroup.position.y = Y.pcb;
    if (animate) this.drop(this.pcbGroup, Y.pcb);
  }

  /** Flip the PCB upside-down (for the tape mod) or back. */
  flipPcb(flipped: boolean, done?: () => void) {
    const g = this.pcbGroup;
    const lift = flipped ? Y.pcb + 2.2 : Y.pcb;
    this.tweens.push({ obj: g, prop: "y", from: g.position.y, to: lift, t: 0, dur: 0.45 });
    this.tweens.push({ obj: g, prop: "rotX", from: g.rotation.x, to: flipped ? Math.PI : 0, t: 0, dur: 0.6, done });
  }

  /** Tape strips on the PCB back, one per row; quality 0..1 affects how straight they look. */
  setTape(strips: { row: number; offset: number }[]) {
    for (const s of this.tapeStrips) this.pcbGroup.remove(s);
    this.tapeStrips = [];
    const L = this.layout;
    const mat = this.track(new THREE.MeshStandardMaterial({ color: "#cfe3ff", roughness: 0.35, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    const rows = Math.ceil(L.depth);
    for (const s of strips) {
      const m = new THREE.Mesh(this.track(new THREE.PlaneGeometry(L.width - 0.2, 0.8 / Math.max(1, rows / 6))), mat);
      m.rotation.x = Math.PI / 2; // faces down (the back of the PCB)
      m.rotation.z = s.offset * 0.05;
      m.position.set(0, -0.045, (s.row + 0.5) * (L.depth / rows) - L.depth / 2 + s.offset * 0.2);
      this.tapeStrips.push(m);
      this.pcbGroup.add(m);
    }
  }

  // ---------- Plate ----------
  setPlate(def: PlateDef | null, animate = true) {
    if (this.plateMesh) this.group.remove(this.plateMesh);
    this.plateMesh = null;
    if (!def || def.id === "none") return;
    if (!this.plateGeo) this.plateGeo = this.track(plateGeometry(this.layout));
    const mat = this.track(new THREE.MeshStandardMaterial({ color: def.color, metalness: def.metalness, roughness: def.roughness, transparent: def.id === "pc", opacity: def.id === "pc" ? 0.7 : 1 }));
    this.plateMesh = new THREE.Mesh(this.plateGeo, mat);
    this.plateMesh.position.y = Y.plate - 0.03;
    this.plateMesh.castShadow = true;
    this.plateMesh.receiveShadow = true;
    this.group.add(this.plateMesh);
    if (animate) this.drop(this.plateMesh, Y.plate - 0.03);
  }

  // ---------- Stabilizers ----------
  setStabs(def: StabDef | null, lubed = false) {
    this.stabGroup.clear();
    if (!def) return;
    const color = def.id === "premium" ? "#f1f1f1" : def.id === "standard" ? "#2a2a2a" : "#8a8a8a";
    const hMat = this.track(new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
    const wMat = this.track(new THREE.MeshStandardMaterial({ color: lubed ? "#e6d27a" : "#c9ccd1", metalness: 0.9, roughness: lubed ? 0.15 : 0.35 }));
    const hGeo = this.track(new RoundedBoxGeometry(0.32, 0.3, 0.5, 2, 0.05));
    for (const k of this.layout.keys.filter(needsStab)) {
      const [x, z] = this.keyXZ(k);
      const vertical = k.h > k.w;
      const span = vertical ? k.h : k.w;
      const off = span >= 6 ? 2.5 : 0.6;
      const g = new THREE.Group();
      for (const s of [-off, off]) {
        const hs = new THREE.Mesh(hGeo, hMat);
        hs.position.set(vertical ? 0 : s, 0, vertical ? s : 0);
        if (vertical) hs.rotation.y = Math.PI / 2;
        g.add(hs);
      }
      const wire = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.025, 0.025, off * 2, 8)), wMat);
      wire.rotation.z = Math.PI / 2;
      if (vertical) wire.rotation.set(Math.PI / 2, 0, 0);
      wire.position.set(vertical ? -0.2 : 0, -0.05, vertical ? 0 : -0.2);
      g.add(wire);
      g.position.set(x, Y.plate + 0.12, z);
      this.stabGroup.add(g);
    }
    this.drop(this.stabGroup, 0);
  }

  // ---------- Switches ----------
  setSwitchLook(sw: SwitchProduct | null) {
    if (!sw) return;
    this.housingMat.color.set(sw.housingColor);
    this.housingMat.opacity = sw.housingOpacity;
    this.housingMat.depthWrite = sw.housingOpacity >= 1;
    this.stemMat.color.set(sw.stemColor);
  }

  setSwitchInstalled(i: number, on: boolean, instant = false) {
    this.switchTarget[i] = on ? 1 : 0;
    if (instant) this.switchIn[i] = this.switchTarget[i];
    this.refreshSwitchMatrices();
  }

  setAllSwitches(on: boolean, instant = false) {
    for (let i = 0; i < this.layout.keys.length; i++) this.setSwitchInstalled(i, on, instant);
  }

  isSwitchInstalled(i: number) {
    return this.switchTarget[i] === 1;
  }

  private refreshSwitchMatrices() {
    this.layout.keys.forEach((k, i) => {
      const a = this.switchIn[i];
      const [x, z] = this.keyXZ(k);
      const s = a <= 0.001 ? 0 : 1;
      const drop = (1 - a) * 1.6;
      const p = Math.min(1, this.press[i]) * 0.12;
      this.tmp.rotation.set(0, 0, 0);
      this.tmp.scale.setScalar(s);
      this.tmp.position.set(x, Y.switchTop - 0.13 + drop, z);
      this.tmp.updateMatrix();
      this.housings.setMatrixAt(i, this.tmp.matrix);
      this.tmp.position.set(x, Y.switchTop + 0.08 + drop - p, z);
      this.tmp.updateMatrix();
      this.stems.setMatrixAt(i, this.tmp.matrix);
    });
    this.housings.instanceMatrix.needsUpdate = true;
    this.stems.instanceMatrix.needsUpdate = true;
  }

  // ---------- Keycaps ----------
  setKeycaps(set: KeycapSet | null) {
    this.capGroup.clear();
    this.caps.fill(null);
    this.capSetId = set?.id ?? null;
    if (!set) return;
    const shape = KEYCAP_PROFILE_SHAPE[set.profile];
    const cw = set.colorway;
    const rough = set.material === "pbt" ? 0.82 : set.material === "abs" ? 0.35 : 0.5;
    const mats = {
      alpha: this.track(new THREE.MeshStandardMaterial({ color: cw.alpha, roughness: rough })),
      mod: this.track(new THREE.MeshStandardMaterial({ color: cw.mod, roughness: rough })),
      accent: this.track(new THREE.MeshStandardMaterial({ color: cw.accent, roughness: rough })),
    };
    const atlas = this.legendAtlas(set);
    const legendMat = this.track(new THREE.MeshBasicMaterial({ map: atlas.tex, transparent: true, premultipliedAlpha: true, depthWrite: false, toneMapped: false }));
    const geoCache = new Map<string, THREE.BufferGeometry>();
    this.layout.keys.forEach((k, i) => {
      const gk = `${k.w}x${k.h}`;
      let geo = geoCache.get(gk);
      if (!geo) geoCache.set(gk, (geo = this.track(keycapGeometry(k.w, k.h, shape))));
      const pivot = new THREE.Group();
      const [x, z] = this.keyXZ(k);
      const r = Math.min(k.rowFromBottom, ROW_TILT.length - 1);
      pivot.position.set(x, Y.capBase + shape.height / 2 + ROW_LIFT[r] * shape.sculpt, z);
      pivot.rotation.x = ROW_TILT[r] * shape.sculpt;
      pivot.userData.restY = pivot.position.y;
      const cap = new THREE.Mesh(geo, mats[k.kind]);
      cap.castShadow = true;
      cap.receiveShadow = true;
      pivot.add(cap);
      if (k.label) {
        const uv = atlas.uv.get(`${k.kind}|${k.label}`)!;
        const size = 0.66;
        const lg = this.track(new THREE.PlaneGeometry(size, size));
        const uvs = lg.attributes.uv;
        uvs.setXY(0, uv[0], uv[3]);
        uvs.setXY(1, uv[2], uv[3]);
        uvs.setXY(2, uv[0], uv[1]);
        uvs.setXY(3, uv[2], uv[1]);
        const legend = new THREE.Mesh(lg, legendMat);
        legend.rotation.x = -Math.PI / 2;
        legend.position.y = shape.height / 2 - shape.dish * 0.6 + 0.004;
        if (k.w > 1.3 && k.h === 1) legend.position.x = -(k.w - 1) / 2 + 0.15;
        pivot.add(legend);
      }
      pivot.visible = this.capIn[i] > 0;
      this.caps[i] = pivot;
      this.capGroup.add(pivot);
    });
    this.applyCapTransforms();
  }

  get keycapSetId() {
    return this.capSetId;
  }

  setCapInstalled(i: number, on: boolean, instant = false) {
    this.capTarget[i] = on ? 1 : 0;
    if (instant) this.capIn[i] = this.capTarget[i];
    this.applyCapTransforms();
  }

  setAllCaps(on: boolean, instant = false) {
    for (let i = 0; i < this.layout.keys.length; i++) this.setCapInstalled(i, on, instant);
  }

  private legendAtlas(set: KeycapSet) {
    const cw = set.colorway;
    const labels = Array.from(new Set(this.layout.keys.filter((k) => k.label).map((k) => `${k.kind}|${k.label}`)));
    const cell = 128;
    const cols = 16;
    const rows = Math.ceil(labels.length / cols);
    const canvas = document.createElement("canvas");
    canvas.width = cell * cols;
    canvas.height = cell * rows;
    const ctx = canvas.getContext("2d")!;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const uv = new Map<string, [number, number, number, number]>();
    labels.forEach((key, i) => {
      const [kind, label] = key.split("|");
      const cx = (i % cols) * cell;
      const cy = Math.floor(i / cols) * cell;
      const legend = kind === "alpha" ? cw.legendOnAlpha : kind === "mod" ? cw.legendOnMod : cw.legendOnAccent;
      const cap = kind === "alpha" ? cw.alpha : kind === "mod" ? cw.mod : cw.accent;
      ctx.fillStyle = readableOn(legend, cap);
      const size = label.length === 1 ? 76 : label.length <= 3 ? 44 : 32;
      ctx.font = `700 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
      ctx.fillText(label, cx + cell / 2, cy + cell / 2 + 2);
      uv.set(key, [cx / canvas.width, 1 - (cy + cell) / canvas.height, (cx + cell) / canvas.width, 1 - cy / canvas.height]);
    });
    const tex = this.track(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.premultiplyAlpha = true;
    tex.anisotropy = 4;
    return { tex, uv };
  }

  private applyCapTransforms() {
    this.caps.forEach((pivot, i) => {
      if (!pivot) return;
      const a = this.capIn[i];
      pivot.visible = a > 0.001;
      const rest = pivot.userData.restY as number;
      const p = Math.min(1, this.press[i]);
      pivot.position.y = rest + (1 - a) * 1.8 - Math.sin(p * Math.PI * 0.5) * 0.16;
    });
  }

  // ---------- Interaction ----------
  pressKey(i: number) {
    this.press[i] = 1;
  }

  /** Key under a ray, or null. */
  pickKey(ray: THREE.Raycaster): number | null {
    const hits = ray.intersectObject(this.hit, false);
    return hits.length && hits[0].instanceId !== undefined ? hits[0].instanceId : null;
  }

  setMarker(i: number, color: string | null) {
    this.markerOn[i] = color !== null;
    if (color) this.markers.setColorAt(i, this.tmpColor.set(color));
    this.refreshMarkers();
  }

  clearMarkers() {
    this.markerOn.fill(false);
    this.refreshMarkers();
  }

  private refreshMarkers() {
    const hasCaps = this.caps.some((c, i) => c && this.capIn[i] > 0.5);
    this.layout.keys.forEach((k, i) => {
      const [x, z] = this.keyXZ(k);
      this.tmp.rotation.set(0, 0, 0);
      this.tmp.scale.setScalar(this.markerOn[i] ? 1 : 0);
      this.tmp.position.set(x, hasCaps ? Y.capBase + 0.75 : Y.switchTop + 0.25, z);
      this.tmp.updateMatrix();
      this.markers.setMatrixAt(i, this.tmp.matrix);
    });
    this.markers.instanceMatrix.needsUpdate = true;
    if (this.markers.instanceColor) this.markers.instanceColor.needsUpdate = true;
  }

  // ---------- Animation ----------
  private drop(obj: THREE.Object3D, toY: number) {
    this.tweens.push({ obj, prop: "y", from: toY + 3, to: toY, t: 0, dur: 0.45 });
    obj.position.y = toY + 3;
  }

  /** True while something is moving (lets the renderer idle when nothing changes). */
  get animating(): boolean {
    return this.tweens.length > 0 || this.press.some((p) => p > 0) || this.switchIn.some((v, i) => v !== this.switchTarget[i]) || this.capIn.some((v, i) => v !== this.capTarget[i]);
  }

  update(dt: number) {
    this.tweens = this.tweens.filter((tw) => {
      tw.t += dt;
      const x = Math.min(1, tw.t / tw.dur);
      if (tw.prop === "y") tw.obj.position.y = tw.from + (tw.to - tw.from) * easeOutBack(x);
      else tw.obj.rotation.x = tw.from + (tw.to - tw.from) * easeInOut(x);
      if (x >= 1) {
        tw.done?.();
        return false;
      }
      return true;
    });
    let sw = false;
    let cap = false;
    for (let i = 0; i < this.switchIn.length; i++) {
      if (this.switchIn[i] !== this.switchTarget[i]) {
        this.switchIn[i] = this.switchTarget[i] > this.switchIn[i] ? Math.min(1, this.switchIn[i] + dt * 6) : 0;
        sw = true;
      }
      if (this.capIn[i] !== this.capTarget[i]) {
        this.capIn[i] = this.capTarget[i] > this.capIn[i] ? Math.min(1, this.capIn[i] + dt * 5) : 0;
        cap = true;
      }
      if (this.press[i] > 0) {
        this.press[i] = Math.max(0, this.press[i] - dt * 7);
        sw = cap = true;
      }
    }
    if (sw) this.refreshSwitchMatrices();
    if (cap) {
      this.applyCapTransforms();
      this.refreshMarkers();
    }
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
  }
}
