/**
 * Procedural keyboard, assembled layer by layer: case → foams → PCB (+tape on the back) → plate →
 * stabilizers → switches → keycaps. Real scale: 1u = 19.05 mm. Babylon port of the Phase-4 model.
 */
import {
  Color3,
  DynamicTexture,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  type Ray,
  type Scene,
  type ShadowGenerator,
} from "@babylonjs/core";
import earcut from "earcut";
import type { KeycapSet, SwitchProduct } from "../../data/catalog";
import { luminance } from "../../data/color";
import { getLayout, needsStab, type KeyGeom, type Layout, type LayoutId } from "../../data/layouts";
import { KEYCAP_PROFILE_SHAPE, type CaseMaterialDef, type PcbDef, type PlateDef, type StabDef } from "../../data/parts";
import { roundedBox, roundedBoxData } from "../geometry";

export const U = 0.01905; // meters per key unit
const Y = { silicone: 0.04, caseFoam: 0.2, pcb: 0.46, peFoam: 0.515, plateFoam: 0.54, plate: 0.73, switchTop: 0.92, capBase: 1.08, wallTop: 0.98 };
const BEZEL = 0.55;
const ROW_TILT = [0.1, 0.06, 0, -0.05, -0.12, -0.14, -0.14];
const ROW_LIFT = [0.04, 0.02, 0, 0.04, 0.1, 0.12, 0.12];

interface Tween {
  node: TransformNode;
  prop: "y" | "rotX";
  from: number;
  to: number;
  t: number;
  dur: number;
  done?: () => void;
}
const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

function readableOn(legend: string, cap: string): string {
  const a = luminance(legend) + 0.05;
  const b = luminance(cap) + 0.05;
  if (Math.max(a, b) / Math.min(a, b) >= 3.2) return legend;
  return luminance(cap) > 0.25 ? "#1e1b18" : "#f7f4ee";
}

export class Board {
  readonly root: TransformNode;
  readonly layout: Layout;
  private owned: { dispose(): void }[] = [];
  private tweens: Tween[] = [];
  private caseNode: TransformNode;
  private pcbNode: TransformNode;
  /** Child of the PCB, on its back side (tape strips, minigame lane guides). */
  readonly tapeNode: TransformNode;
  private stabNode: TransformNode;
  private capNode: TransformNode;
  private foams: Record<string, Mesh> = {};
  private plateMesh: Mesh | null = null;
  private housings: Mesh;
  private stems: Mesh;
  private housingMat: StandardMaterial;
  private stemMat: StandardMaterial;
  private switchIn: number[];
  private switchTarget: number[];
  private caps: (Mesh | null)[];
  private capRest: number[];
  private capIn: number[];
  private capTarget: number[];
  private press: number[];
  private markerMeshes: Record<string, Mesh> = {};
  private markerOf: (string | null)[];
  private hit: Mesh;
  capSetKey: string | null = null;

  constructor(
    private scene: Scene,
    layoutId: LayoutId,
    private shadows?: ShadowGenerator | null,
  ) {
    this.layout = getLayout(layoutId);
    const L = this.layout;
    const n = L.keys.length;
    this.root = new TransformNode("board", scene);
    this.root.scaling.setAll(U);
    const child = (name: string) => {
      const t = new TransformNode(name, scene);
      t.parent = this.root;
      return t;
    };
    this.caseNode = child("case");
    this.pcbNode = child("pcb");
    this.tapeNode = new TransformNode("tape", scene);
    this.tapeNode.parent = this.pcbNode;
    this.stabNode = child("stabs");
    this.capNode = child("caps");

    const slab = (key: string, w: number, h: number, d: number, color: string, y: number, alpha = 1) => {
      const m = roundedBox(`foam-${key}`, { w, h, d, r: Math.min(0.05, h / 2.2), seg: 2 }, scene);
      m.material = this.mat(`foam-${key}`, color, { spec: 0.02, alpha });
      m.parent = this.root;
      m.position.y = y;
      m.setEnabled(false);
      m.receiveShadows = true;
      this.foams[key] = m;
    };
    slab("silicone", L.width - 0.2, 0.08, L.depth - 0.2, "#eef2f5", Y.silicone, 0.85);
    slab("caseFoam", L.width - 0.15, 0.22, L.depth - 0.15, "#3d4148", Y.caseFoam);
    slab("peFoam", L.width, 0.02, L.depth, "#fafafa", Y.peFoam);
    const pf = this.platePoly(0.12, "plateFoam");
    pf.material = this.mat("plateFoam", "#d8d1bd", { spec: 0.02 });
    pf.position.y = Y.plateFoam;
    pf.setEnabled(false);
    this.foams.plateFoam = pf;

    // Switches: two thin-instanced meshes (housing + stem)
    this.housingMat = this.mat("housing", "#222222", { spec: 0.3 });
    this.stemMat = this.mat("stem", "#e23b3b", { spec: 0.3 });
    this.housings = roundedBox("housings", { w: 0.74, h: 0.26, d: 0.74, r: 0.06, seg: 2 }, scene);
    this.housings.material = this.housingMat;
    this.housings.parent = this.root;
    const stemA = MeshBuilder.CreateBox("stemA", { width: 0.3, height: 0.2, depth: 0.09 }, scene);
    const stemB = MeshBuilder.CreateBox("stemB", { width: 0.09, height: 0.2, depth: 0.3 }, scene);
    this.stems = Mesh.MergeMeshes([stemA, stemB], true)!;
    this.stems.name = "stems";
    this.stems.material = this.stemMat;
    this.stems.parent = this.root;
    const zeros = new Float32Array(16 * n);
    this.housings.thinInstanceSetBuffer("matrix", zeros.slice(), 16, false);
    this.stems.thinInstanceSetBuffer("matrix", zeros.slice(), 16, false);
    this.housings.isPickable = this.stems.isPickable = false;
    shadows?.addShadowCaster(this.housings);
    this.switchIn = new Array(n).fill(0);
    this.switchTarget = new Array(n).fill(0);

    this.caps = new Array(n).fill(null);
    this.capRest = new Array(n).fill(0);
    this.capIn = new Array(n).fill(0);
    this.capTarget = new Array(n).fill(0);
    this.press = new Array(n).fill(0);

    // Markers: one thin-instanced disc per color
    this.markerOf = new Array(n).fill(null);
    for (const [key, hex] of [["green", "#3ecf6e"], ["red", "#e23b4e"], ["orange", "#ff9f1c"], ["yellow", "#ffd24a"]] as const) {
      const m = MeshBuilder.CreateDisc(`marker-${key}`, { radius: 0.17, tessellation: 20 }, scene);
      m.rotation.x = Math.PI / 2;
      m.bakeCurrentTransformIntoVertices();
      const mat = this.mat(`marker-${key}`, hex, { emissive: true });
      m.material = mat;
      m.parent = this.root;
      m.isPickable = false;
      m.thinInstanceSetBuffer("matrix", zeros.slice(), 16, false);
      this.markerMeshes[key] = m;
    }
    // Invisible hit boxes for picking keys
    this.hit = MeshBuilder.CreateBox("keyhit", { size: 1 }, scene);
    this.hit.parent = this.root;
    this.hit.visibility = 0;
    this.hit.thinInstanceEnablePicking = true;
    const hm = new Float32Array(16 * n);
    L.keys.forEach((k, i) => {
      const [x, z] = this.keyXZ(k);
      Matrix.Compose(new Vector3(k.w - 0.05, 0.8, k.h - 0.05), Quaternion.Identity(), new Vector3(x, Y.capBase, z)).copyToArray(hm, i * 16);
    });
    this.hit.thinInstanceSetBuffer("matrix", hm, 16, true);
    this.refreshSwitches();
    this.refreshMarkers();
  }

  private mat(name: string, hex: string, o: { spec?: number; alpha?: number; emissive?: boolean; texture?: Texture } = {}): StandardMaterial {
    const m = new StandardMaterial(`kb-${name}`, this.scene);
    m.diffuseColor = Color3.FromHexString(hex);
    const sp = o.spec ?? 0.15;
    m.specularColor = new Color3(sp, sp, sp);
    m.specularPower = 48;
    if (o.alpha !== undefined && o.alpha < 1) {
      m.alpha = o.alpha;
    }
    if (o.emissive) {
      m.emissiveColor = Color3.FromHexString(hex);
      m.disableLighting = true;
    }
    if (o.texture) m.diffuseTexture = o.texture;
    this.owned.push(m);
    return m;
  }

  keyXZ(k: KeyGeom): [number, number] {
    // Viewer stands at +z looking toward -z (Babylon is left-handed, so +x is on the viewer's left):
    // the number row is far (-z), the spacebar row near (+z), Esc on the viewer's left (+x).
    return [-(k.x + k.w / 2 - this.layout.width / 2), k.y + k.h / 2 - this.layout.depth / 2];
  }
  get outerWidth() {
    return (this.layout.width + BEZEL * 2) * U;
  }
  get outerDepth() {
    return (this.layout.depth + BEZEL * 2) * U;
  }

  private platePoly(thickness: number, name: string): Mesh {
    const L = this.layout;
    const W = L.width / 2 + 0.05;
    const D = L.depth / 2 + 0.05;
    const shape = [new Vector3(-W, 0, -D), new Vector3(W, 0, -D), new Vector3(W, 0, D), new Vector3(-W, 0, D)];
    const s = 0.37;
    const holes = L.keys.map((k) => {
      const [x, z] = this.keyXZ(k);
      return [new Vector3(x - s, 0, z - s), new Vector3(x + s, 0, z - s), new Vector3(x + s, 0, z + s), new Vector3(x - s, 0, z + s)];
    });
    const m = MeshBuilder.CreatePolygon(name, { shape, holes, depth: thickness, sideOrientation: Mesh.DOUBLESIDE }, this.scene, earcut);
    m.parent = this.root;
    m.receiveShadows = true;
    this.owned.push(m);
    return m;
  }

  // ---------- Case ----------
  setCase(def: CaseMaterialDef | null, hex: string | null, animate = true) {
    this.caseNode.getChildMeshes().forEach((m) => m.dispose());
    if (!def || !hex) return;
    const W = this.layout.width + BEZEL * 2;
    const D = this.layout.depth + BEZEL * 2;
    const wallH = Y.wallTop + 0.35;
    const m = this.mat(`case-${def.id}`, hex, { spec: def.look.metalness > 0.5 ? 0.6 : 0.12, alpha: def.look.opacity });
    if (def.look.metalness > 0.5) m.specularPower = 90;
    if (def.id === "wood") {
      m.diffuseTexture = this.woodTex(hex);
      m.diffuseColor = Color3.White();
    }
    if (def.look.opacity !== undefined) m.backFaceCulling = false;
    const add = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const b = roundedBox("casepart", { w, h, d, r: 0.16, seg: 3 }, this.scene);
      b.material = m;
      b.parent = this.caseNode;
      b.position.set(x, y, z);
      b.receiveShadows = true;
      if (def.look.opacity === undefined) this.shadows?.addShadowCaster(b);
    };
    add(W, 0.35, D, 0, -0.175, 0);
    const cy = -0.35 + wallH / 2;
    add(W, wallH, BEZEL, 0, cy, -D / 2 + BEZEL / 2);
    add(W, wallH, BEZEL, 0, cy, D / 2 - BEZEL / 2);
    add(BEZEL, wallH, D - BEZEL * 2 + 0.3, -W / 2 + BEZEL / 2, cy, 0);
    add(BEZEL, wallH, D - BEZEL * 2 + 0.3, W / 2 - BEZEL / 2, cy, 0);
    const footMat = this.mat("foot", "#1a1a1a", { spec: 0.05 });
    for (const [fx, fz] of [[-W / 2 + 1, -D / 2 + 0.8], [W / 2 - 1, -D / 2 + 0.8], [-W / 2 + 1, D / 2 - 0.8], [W / 2 - 1, D / 2 - 0.8]]) {
      const f = MeshBuilder.CreateCylinder("foot", { diameter: 0.6, height: 0.1, tessellation: 16 }, this.scene);
      f.material = footMat;
      f.parent = this.caseNode;
      f.position.set(fx, -0.4, fz);
    }
    if (animate) this.drop(this.caseNode, 0);
  }

  private woodTex(hex: string): DynamicTexture {
    const t = new DynamicTexture("wood", { width: 512, height: 128 }, this.scene, true);
    const g = t.getContext() as unknown as CanvasRenderingContext2D;
    g.fillStyle = hex;
    g.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(40,20,5,${0.1 + Math.random() * 0.2})`;
      g.lineWidth = 0.6 + Math.random() * 2;
      g.beginPath();
      const y = Math.random() * 128;
      for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + Math.sin(x / 60 + i) * 3);
      g.stroke();
    }
    t.update();
    this.owned.push(t);
    return t;
  }

  // ---------- Dampening ----------
  setDampening(ids: string[], animate = true) {
    for (const [key, m] of Object.entries(this.foams)) {
      const on = ids.includes(key);
      if (on && !m.isEnabled() && animate) this.drop(m, m.position.y);
      m.setEnabled(on);
    }
  }

  // ---------- PCB ----------
  setPcb(def: PcbDef | null, animate = true) {
    this.pcbNode.getChildMeshes(true).forEach((m) => m !== this.tapeNode && m.dispose());
    if (!def) return;
    const L = this.layout;
    const top = MeshBuilder.CreatePlane("pcbTop", { width: L.width, height: L.depth }, this.scene);
    top.rotation.x = Math.PI / 2;
    top.scaling = new Vector3(-1, -1, 1); // rotate the texture 180° in-plane to match key positions
    top.position.y = 0.041;
    top.material = this.mat("pcbTop", "#ffffff", { texture: this.pcbTexture(def, "top"), spec: 0.2 });
    const bottom = MeshBuilder.CreatePlane("pcbBot", { width: L.width, height: L.depth }, this.scene);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = -0.041;
    bottom.material = this.mat("pcbBot", "#ffffff", { texture: this.pcbTexture(def, "bottom"), spec: 0.2 });
    const body = MeshBuilder.CreateBox("pcbBody", { width: L.width, height: 0.08, depth: L.depth }, this.scene);
    body.material = this.mat("pcbSide", def.color, { spec: 0.1 });
    for (const m of [top, bottom, body]) {
      m.parent = this.pcbNode;
      m.receiveShadows = true;
    }
    this.pcbNode.position.y = Y.pcb;
    if (animate) this.drop(this.pcbNode, Y.pcb);
  }

  private pcbTexture(def: PcbDef, side: "top" | "bottom"): DynamicTexture {
    const L = this.layout;
    const ppu = 40;
    const w = Math.ceil(L.width * ppu);
    const h = Math.ceil(L.depth * ppu);
    const t = new DynamicTexture(`pcb-${side}`, { width: w, height: h }, this.scene, true);
    const g = t.getContext() as unknown as CanvasRenderingContext2D;
    g.fillStyle = def.color;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,0.08)";
    g.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      g.beginPath();
      const y = Math.random() * h;
      g.moveTo(0, y);
      g.lineTo(w * (0.3 + Math.random() * 0.7), y + (Math.random() - 0.5) * 30);
      g.stroke();
    }
    for (const k of L.keys) {
      const cx = (k.x + k.w / 2) * ppu;
      const cy = (k.y + k.h / 2) * ppu;
      if (side === "top") {
        g.fillStyle = "#d9b458";
        g.beginPath();
        g.arc(cx - 0.2 * ppu, cy - 0.13 * ppu, 3.5, 0, Math.PI * 2);
        g.arc(cx + 0.13 * ppu, cy - 0.26 * ppu, 3.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "rgba(0,0,0,0.55)";
        g.beginPath();
        g.arc(cx, cy, 5, 0, Math.PI * 2);
        g.fill();
        if (def.rgb) {
          g.fillStyle = "#f4f4f4";
          g.fillRect(cx - 4, cy + 0.25 * ppu, 8, 5);
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
    if (def.flex && side === "top") {
      g.fillStyle = "rgba(0,0,0,0.6)";
      for (let x = 3; x < L.width - 2; x += 4) g.fillRect(x * ppu, 0.4 * ppu, 0.12 * ppu, (L.depth - 0.8) * ppu);
    }
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.font = "bold 14px monospace";
    g.fillText(side === "top" ? "MKSS-PCB rev.3  ♥ thock responsibly" : "DO NOT LICK", 8, h - 8);
    t.update();
    this.owned.push(t);
    return t;
  }

  /** Flip the PCB upside-down (tape mod) or back. */
  flipPcb(flipped: boolean, done?: () => void) {
    const n = this.pcbNode;
    this.tweens.push({ node: n, prop: "y", from: n.position.y, to: flipped ? Y.pcb + 2.4 : Y.pcb, t: 0, dur: 0.45 });
    this.tweens.push({ node: n, prop: "rotX", from: n.rotation.x, to: flipped ? Math.PI : 0, t: 0, dur: 0.6, done });
  }

  /** Points on top of the case bezel where screws go (board units), n = 6 or 8. */
  screwPoints(n: number): Vector3[] {
    const W = this.layout.width + BEZEL * 2;
    const D = this.layout.depth + BEZEL * 2;
    const y = Y.wallTop + 0.36 - 0.35 + 0.01;
    const xs = n === 8 ? [-0.42, -0.14, 0.14, 0.42] : [-0.4, 0, 0.4];
    const pts: Vector3[] = [];
    for (const zs of [-1, 1]) for (const fx of xs) pts.push(new Vector3(fx * W, y, zs * (D / 2 - BEZEL / 2)));
    return pts;
  }

  setTape(strips: { row: number; offset: number; from?: number; to?: number }[]) {
    this.tapeNode.getChildMeshes().forEach((m) => m.dispose());
    const L = this.layout;
    const rows = Math.ceil(L.depth);
    const mat = this.mat("tape", "#cfe3ff", { alpha: 0.88, spec: 0.5 });
    mat.backFaceCulling = false;
    for (const s of strips) {
      const from = s.from ?? 0;
      const to = s.to ?? 1;
      const w = (L.width - 0.2) * (to - from);
      const m = MeshBuilder.CreatePlane("tapeStrip", { width: w, height: 0.8 / Math.max(1, rows / 6) }, this.scene);
      m.material = mat;
      m.parent = this.tapeNode;
      m.rotation.x = -Math.PI / 2;
      m.rotation.y = s.offset * 0.05;
      const cx = -(L.width - 0.2) / 2 + (L.width - 0.2) * (from + to) / 2;
      m.position.set(cx, -0.05, -((s.row + 0.5) * (L.depth / rows) - L.depth / 2) + s.offset * 0.2);
    }
  }

  // ---------- Plate ----------
  setPlate(def: PlateDef | null, animate = true) {
    this.plateMesh?.dispose();
    this.plateMesh = null;
    if (!def || def.id === "none") return;
    const m = this.platePoly(0.06, "plate");
    m.material = this.mat(`plate-${def.id}`, def.color, { spec: def.metalness > 0.5 ? 0.7 : 0.15, alpha: def.id === "pc" ? 0.75 : undefined });
    m.position.y = Y.plate;
    this.shadows?.addShadowCaster(m);
    this.plateMesh = m;
    if (animate) this.drop(m, Y.plate);
  }

  // ---------- Stabilizers ----------
  setStabs(def: StabDef | null, lubed = false) {
    this.stabNode.getChildMeshes().forEach((m) => m.dispose());
    if (!def) return;
    const color = def.id === "premium" ? "#f1f1f1" : def.id === "standard" ? "#2a2a2a" : "#8a8a8a";
    const hMat = this.mat("stabH", color, { spec: 0.2 });
    const wMat = this.mat("stabW", lubed ? "#e6d27a" : "#c9ccd1", { spec: lubed ? 0.9 : 0.5 });
    for (const k of this.layout.keys.filter(needsStab)) {
      const [x, z] = this.keyXZ(k);
      const vertical = k.h > k.w;
      const span = vertical ? k.h : k.w;
      const off = span >= 6 ? 2.5 : 0.6;
      for (const s of [-off, off]) {
        const hs = roundedBox("stabH", { w: vertical ? 0.5 : 0.32, h: 0.3, d: vertical ? 0.32 : 0.5, r: 0.05, seg: 2 }, this.scene);
        hs.material = hMat;
        hs.parent = this.stabNode;
        hs.position.set(x + (vertical ? 0 : s), Y.plate + 0.15, z + (vertical ? s : 0));
      }
      const wire = MeshBuilder.CreateCylinder("stabW", { diameter: 0.05, height: off * 2, tessellation: 8 }, this.scene);
      wire.material = wMat;
      wire.parent = this.stabNode;
      if (vertical) wire.rotation.x = Math.PI / 2;
      else wire.rotation.z = Math.PI / 2;
      wire.position.set(x + (vertical ? 0.2 : 0), Y.plate + 0.08, z + (vertical ? 0 : 0.2));
    }
    this.drop(this.stabNode, 0);
  }

  // ---------- Switches ----------
  setSwitchLook(sw: SwitchProduct | null | undefined) {
    if (!sw) return;
    this.housingMat.diffuseColor = Color3.FromHexString(sw.housingColor);
    this.housingMat.alpha = sw.housingOpacity;
    this.stemMat.diffuseColor = Color3.FromHexString(sw.stemColor);
  }

  setSwitchInstalled(i: number, on: boolean, instant = false) {
    this.switchTarget[i] = on ? 1 : 0;
    if (instant) this.switchIn[i] = this.switchTarget[i];
    this.refreshSwitches();
  }
  setAllSwitches(on: boolean, instant = false) {
    for (let i = 0; i < this.layout.keys.length; i++) {
      this.switchTarget[i] = on ? 1 : 0;
      if (instant) this.switchIn[i] = this.switchTarget[i];
    }
    this.refreshSwitches();
  }
  isSwitchInstalled(i: number) {
    return this.switchTarget[i] === 1;
  }

  private refreshSwitches() {
    const n = this.layout.keys.length;
    const hb = new Float32Array(16 * n);
    const sb = new Float32Array(16 * n);
    const q = Quaternion.Identity();
    this.layout.keys.forEach((k, i) => {
      const a = this.switchIn[i];
      const s = a <= 0.001 ? 0 : 1;
      const [x, z] = this.keyXZ(k);
      const drop = (1 - a) * 1.6;
      const p = Math.min(1, this.press[i]) * 0.12;
      Matrix.Compose(new Vector3(s, s, s), q, new Vector3(x, Y.switchTop - 0.13 + drop, z)).copyToArray(hb, i * 16);
      Matrix.Compose(new Vector3(s, s, s), q, new Vector3(x, Y.switchTop + 0.08 + drop - p, z)).copyToArray(sb, i * 16);
    });
    this.housings.thinInstanceSetBuffer("matrix", hb, 16, false);
    this.stems.thinInstanceSetBuffer("matrix", sb, 16, false);
  }

  // ---------- Keycaps ----------
  /** Build keycaps for a set; a single atlas texture holds every cap's color + legend. */
  setKeycaps(set: KeycapSet | null) {
    this.capNode.getChildMeshes().forEach((m) => m.dispose());
    this.caps.fill(null);
    this.capSetKey = set ? `${set.id}:${set.colorway.alpha}${set.colorway.accent}` : null;
    if (!set) return;
    const shape = KEYCAP_PROFILE_SHAPE[set.profile];
    const cw = set.colorway;
    const keys = this.layout.keys;
    const labels = Array.from(new Set(keys.map((k) => `${k.kind}|${k.label}`)));
    const cols = 16;
    const cell = 96;
    const rows = Math.ceil((labels.length + 3) / cols);
    const tex = new DynamicTexture("capAtlas", { width: cols * cell, height: rows * cell }, this.scene, true);
    const g = tex.getContext() as unknown as CanvasRenderingContext2D;
    const colorOf = (kind: string) => (kind === "alpha" ? cw.alpha : kind === "mod" ? cw.mod : cw.accent);
    const legendOf = (kind: string) => (kind === "alpha" ? cw.legendOnAlpha : kind === "mod" ? cw.legendOnMod : cw.legendOnAccent);
    const cellUv = (i: number): [number, number, number, number] => {
      const cx = (i % cols) * cell;
      const cy = Math.floor(i / cols) * cell;
      const W = cols * cell;
      const H = rows * cell;
      // DynamicTexture v is flipped (invertY): canvas top = v 1
      return [(cx + 4) / W, 1 - (cy + cell - 4) / H, (cx + cell - 4) / W, 1 - (cy + 4) / H];
    };
    g.textAlign = "center";
    g.textBaseline = "middle";
    labels.forEach((key, i) => {
      const [kind, label] = key.split("|");
      const cx = (i % cols) * cell;
      const cy = Math.floor(i / cols) * cell;
      g.fillStyle = colorOf(kind);
      g.fillRect(cx, cy, cell, cell);
      if (label) {
        g.fillStyle = readableOn(legendOf(kind), colorOf(kind));
        const size = label.length === 1 ? 50 : label.length <= 3 ? 30 : 22;
        g.font = `700 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
        g.fillText(label, cx + cell / 2, cy + cell / 2 + 2);
      }
    });
    // solid side colors
    const solidIndex: Record<string, number> = {};
    ["alpha", "mod", "accent"].forEach((kind, j) => {
      const i = labels.length + j;
      solidIndex[kind] = i;
      g.fillStyle = colorOf(kind);
      g.fillRect((i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
    });
    tex.update();
    this.owned.push(tex);
    const spec = set.material === "pbt" ? 0.06 : set.material === "abs" ? 0.35 : 0.2;
    const mat = this.mat(`caps-${set.id}`, "#ffffff", { texture: tex, spec });
    mat.specularPower = set.material === "abs" ? 64 : 20;

    keys.forEach((k, i) => {
      const li = labels.indexOf(`${k.kind}|${k.label}`);
      const [u0, v0, u1, v1] = cellUv(li);
      const si = solidIndex[k.kind];
      const [su0, sv0, su1, sv1] = cellUv(si);
      const bw = k.w - 0.07;
      const bd = k.h - 0.07;
      // legend area: a square in the middle (left-aligned on wide modifiers)
      const sq = Math.min(bw, bd) * 0.9;
      const data = roundedBoxData({
        w: bw,
        h: shape.height,
        d: bd,
        r: 0.08,
        seg: 4,
        sideUv: [(su0 + su1) / 2, (sv0 + sv1) / 2],
        shape: (q, t) => {
          const shrink = shape.taper * t;
          q.x *= (bw / 2 - shrink) / (bw / 2);
          q.z *= (bd / 2 - shrink) / (bd / 2);
          if (t > 0.95) q.y -= shape.dish * (1 - Math.min(1, (q.x * q.x) / ((bw / 2) ** 2)));
        },
      });
      // remap top-face UVs so the legend square sits in the cell
      const pos = data.positions!;
      const nrm = data.normals!;
      const uvs = data.uvs!;
      // +x is the viewer's left: wide modifiers get their legend on the left (+x) side
      const offX = k.w > 1.3 && k.h === 1 ? (bw - sq) / 2 - 0.3 : 0;
      for (let v = 0; v < pos.length / 3; v++) {
        if (nrm[v * 3 + 1] > 0.6) {
          const lx = -(pos[v * 3] - offX) / sq + 0.5;
          const lz = -pos[v * 3 + 2] / sq + 0.5;
          if (lx >= 0 && lx <= 1 && lz >= 0 && lz <= 1) {
            uvs[v * 2] = u0 + lx * (u1 - u0);
            uvs[v * 2 + 1] = v0 + lz * (v1 - v0);
          } else {
            // outside the legend square: plain cap color (the cell's corner)
            uvs[v * 2] = u0 + 0.02 * (u1 - u0);
            uvs[v * 2 + 1] = v0 + 0.02 * (v1 - v0);
          }
        }
      }
      const m = new Mesh(`cap${i}`, this.scene);
      data.applyToMesh(m);
      m.material = mat;
      m.parent = this.capNode;
      const [x, z] = this.keyXZ(k);
      const r = Math.min(k.rowFromBottom, ROW_TILT.length - 1);
      const rest = Y.capBase + shape.height / 2 + ROW_LIFT[r] * shape.sculpt;
      m.position.set(x, rest, z);
      m.rotation.x = -ROW_TILT[r] * shape.sculpt;
      m.isPickable = false;
      m.receiveShadows = true;
      this.shadows?.addShadowCaster(m);
      this.capRest[i] = rest;
      this.caps[i] = m;
    });
    this.applyCaps();
  }

  setCapInstalled(i: number, on: boolean, instant = false) {
    this.capTarget[i] = on ? 1 : 0;
    if (instant) this.capIn[i] = this.capTarget[i];
    this.applyCaps();
  }
  setAllCaps(on: boolean, instant = false) {
    for (let i = 0; i < this.layout.keys.length; i++) {
      this.capTarget[i] = on ? 1 : 0;
      if (instant) this.capIn[i] = this.capTarget[i];
    }
    this.applyCaps();
  }

  private applyCaps() {
    this.caps.forEach((m, i) => {
      if (!m) return;
      const a = this.capIn[i];
      m.setEnabled(a > 0.001);
      const p = Math.min(1, this.press[i]);
      m.position.y = this.capRest[i] + (1 - a) * 1.8 - Math.sin(p * Math.PI * 0.5) * 0.16;
    });
  }

  // ---------- Interaction ----------
  pressKey(i: number) {
    this.press[i] = 1;
  }

  /** Key under a world-space ray (thin-instance picking on invisible hit boxes). */
  pickKey(ray: Ray): number | null {
    const info = this.scene.pickWithRay(ray, (m) => m === this.hit);
    return info?.hit && info.thinInstanceIndex !== undefined && info.thinInstanceIndex >= 0 ? info.thinInstanceIndex : null;
  }

  /** World position of a key's top (for screen projection, particles…). */
  keyWorld(i: number, yU = 1.1): Vector3 {
    const [x, z] = this.keyXZ(this.layout.keys[i]);
    return Vector3.TransformCoordinates(new Vector3(x, yU, z), this.root.getWorldMatrix());
  }

  setMarker(i: number, color: "green" | "red" | "orange" | "yellow" | null) {
    this.markerOf[i] = color;
    this.refreshMarkers();
  }
  clearMarkers() {
    this.markerOf.fill(null);
    this.refreshMarkers();
  }
  private refreshMarkers() {
    const n = this.layout.keys.length;
    const hasCaps = this.caps.some((c, i) => c && this.capIn[i] > 0.5);
    const y = hasCaps ? Y.capBase + 0.75 : Y.switchTop + 0.25;
    for (const [key, mesh] of Object.entries(this.markerMeshes)) {
      const buf = new Float32Array(16 * n);
      this.layout.keys.forEach((k, i) => {
        const s = this.markerOf[i] === key ? 1 : 0;
        const [x, z] = this.keyXZ(k);
        Matrix.Compose(new Vector3(s, s, s), Quaternion.Identity(), new Vector3(x, y, z)).copyToArray(buf, i * 16);
      });
      mesh.thinInstanceSetBuffer("matrix", buf, 16, false);
    }
  }

  // ---------- Animation ----------
  private drop(node: TransformNode, toY: number) {
    node.position.y = toY + 3;
    this.tweens.push({ node, prop: "y", from: toY + 3, to: toY, t: 0, dur: 0.45 });
  }

  get animating(): boolean {
    return this.tweens.length > 0 || this.press.some((p) => p > 0) || this.switchIn.some((v, i) => v !== this.switchTarget[i]) || this.capIn.some((v, i) => v !== this.capTarget[i]);
  }

  update(dt: number) {
    this.tweens = this.tweens.filter((tw) => {
      tw.t += dt;
      const x = Math.min(1, tw.t / tw.dur);
      if (tw.prop === "y") tw.node.position.y = tw.from + (tw.to - tw.from) * easeOutBack(x);
      else tw.node.rotation.x = tw.from + (tw.to - tw.from) * easeInOut(x);
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
    if (sw) this.refreshSwitches();
    if (cap) {
      this.applyCaps();
      this.refreshMarkers();
    }
  }

  /** For display pieces that never animate: merge keycaps into one mesh (hundreds of draw calls → one). */
  bakeStatic() {
    const caps = this.caps.filter((c): c is Mesh => !!c && c.isEnabled());
    if (caps.length > 1) {
      caps.forEach((c) => this.shadows?.removeShadowCaster(c));
      const merged = Mesh.MergeMeshes(caps, true, true);
      if (merged) {
        merged.parent = this.capNode;
        merged.receiveShadows = true;
        this.shadows?.addShadowCaster(merged);
      }
      this.caps.fill(null);
    }
    this.hit.setEnabled(false);
    Object.values(this.markerMeshes).forEach((m) => m.setEnabled(false));
    this.root.getChildMeshes().forEach((m) => m.freezeWorldMatrix());
  }

  dispose() {
    this.root.getChildMeshes().forEach((m) => {
      this.shadows?.removeShadowCaster(m);
      m.dispose();
    });
    this.root.dispose();
    this.owned.forEach((o) => o.dispose());
  }
}
