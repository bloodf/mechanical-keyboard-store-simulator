/**
 * The keyboard, modeled to real dimensions (mm) and assembled layer by layer:
 * case → bottom foams → PCB (+ tape on the back) → plate foam → plate → stabilizers → switches → keycaps.
 *
 * Spaces:
 *  - `base`: desk level; parent it to the bench.
 *  - `root`: tilted to the case's typing angle, 1 unit = 1u = 19.05 mm (the minigames work in these units).
 *  - `mmNode`: child of root in millimeters, plate top at y = 0. All part geometry lives here.
 * Babylon is left-handed: the typist looks toward −Z, so the number row is at −Z and +X is the typist's left.
 */
import {
  Color3,
  DynamicTexture,
  Matrix,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Quaternion,
  Texture,
  TransformNode,
  Vector3,
  VertexData,
  type Ray,
  type Scene,
  type ShadowGenerator,
} from "@babylonjs/core";
import earcut from "earcut";
import type { KeycapSet, SwitchProduct } from "../../data/catalog";
import { luminance } from "../../data/color";
import { getLayout, needsStab, type KeyGeom, type Layout, type LayoutId } from "../../data/layouts";
import type { CaseMaterial, CaseMaterialDef, PcbDef, PlateDef, StabDef } from "../../data/parts";
import { FAMILY_GEO, PROFILE_GEO, profileRow, type SwitchFamily } from "../../data/profiles";
import { Geo, rrect, type Pt } from "./geo";
import { buildKeycap, PITCH } from "./keycapGeo";
import { switchParts, whenSwitchModels } from "./switchModels";

export const U = 0.01905; // meters per key unit
const MM_U = 1 / PITCH; // units per mm

interface CaseStyle {
  bezel: number;
  radius: number;
  edge: "fillet" | "chamfer";
  edgeSize: number;
  wallTop: number; // above the plate top (MX-height boards)
  tilt: number; // degrees
  metal: number;
  rough: number;
  alpha?: number;
  texture?: "wood" | "layers";
}
export const CASE_STYLE: Record<CaseMaterial, CaseStyle> = {
  plastic: { bezel: 7, radius: 6, edge: "fillet", edgeSize: 2.5, wallTop: 5.5, tilt: 5, metal: 0, rough: 0.55 },
  acrylic: { bezel: 8, radius: 3, edge: "chamfer", edgeSize: 0.4, wallTop: 5, tilt: 2, metal: 0, rough: 0.08, alpha: 0.55, texture: "layers" },
  aluminum: { bezel: 10, radius: 3, edge: "chamfer", edgeSize: 1.6, wallTop: 6.5, tilt: 7, metal: 0.85, rough: 0.38 },
  polycarbonate: { bezel: 9, radius: 8, edge: "fillet", edgeSize: 3.5, wallTop: 6, tilt: 6, metal: 0, rough: 0.22, alpha: 0.62 },
  wood: { bezel: 12, radius: 2, edge: "chamfer", edgeSize: 1.0, wallTop: 6, tilt: 6, metal: 0, rough: 0.55, texture: "wood" },
  brass: { bezel: 9, radius: 4, edge: "chamfer", edgeSize: 1.2, wallTop: 6.5, tilt: 7, metal: 1, rough: 0.25 },
};

/** Vertical stack (mm, plate top = 0) per switch family. */
function stackOf(f: SwitchFamily) {
  return f === "choc"
    ? { plateT: 1.2, pcbTop: -2.2, pcbT: 1.6, floor: -7.5, wallAdj: -4.5, tiltAdj: -3 }
    : { plateT: 1.5, pcbTop: -5.0, pcbT: 1.6, floor: -11.5, wallAdj: 0, tiltAdj: 0 };
}

interface Tween {
  node: TransformNode;
  prop: "y" | "rotX";
  from: number;
  to: number;
  t: number;
  dur: number;
  done?: () => void;
}
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

function readableOn(legend: string, cap: string): string {
  const a = luminance(legend) + 0.05;
  const b = luminance(cap) + 0.05;
  if (Math.max(a, b) / Math.min(a, b) >= 3.2) return legend;
  return luminance(cap) > 0.25 ? "#1e1b18" : "#f7f4ee";
}

export class Board {
  readonly base: TransformNode;
  readonly root: TransformNode;
  private mmNode: TransformNode;
  readonly layout: Layout;
  family: SwitchFamily = "mx";
  private owned: { dispose(): void }[] = [];
  private tweens: Tween[] = [];
  private caseNode: TransformNode;
  private pcbNode: TransformNode;
  /** Child of the PCB, on its back side, in key units (tape strips, minigame lane guides). */
  readonly tapeNode: TransformNode;
  private stabNode: TransformNode;
  private capNode: TransformNode;
  private switchNode: TransformNode;
  private foams: Record<string, Mesh | null> = { silicone: null, caseFoam: null, peFoam: null, plateFoam: null };
  private foamOn: string[] = [];
  private plateMesh: Mesh | null = null;
  private plateDef: PlateDef | null = null;
  private pcbDef: PcbDef | null = null;
  private caseDef: CaseMaterialDef | null = null;
  private caseHex: string | null = null;
  private stabDef: StabDef | null = null;
  private stabLubed = false;
  private sw: SwitchProduct | null = null;
  private swMeshes: Mesh[] = [];
  private switchIn: number[];
  private switchTarget: number[];
  private caps: (Mesh | null)[];
  private capSet: KeycapSet | null = null;
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
    const n = this.layout.keys.length;
    this.base = new TransformNode("board-base", scene);
    this.root = new TransformNode("board", scene);
    this.root.parent = this.base;
    this.root.scaling.setAll(U);
    this.mmNode = new TransformNode("board-mm", scene);
    this.mmNode.parent = this.root;
    this.mmNode.scaling.setAll(MM_U);
    const child = (name: string) => {
      const t = new TransformNode(name, scene);
      t.parent = this.mmNode;
      return t;
    };
    this.caseNode = child("case");
    this.pcbNode = child("pcb");
    this.tapeNode = new TransformNode("tape", scene);
    this.tapeNode.parent = this.pcbNode;
    this.tapeNode.scaling.setAll(PITCH);
    this.stabNode = child("stabs");
    this.switchNode = child("switches");
    this.capNode = child("caps");
    this.switchIn = new Array(n).fill(0);
    this.switchTarget = new Array(n).fill(0);
    this.caps = new Array(n).fill(null);
    this.capIn = new Array(n).fill(0);
    this.capTarget = new Array(n).fill(0);
    this.press = new Array(n).fill(0);
    this.markerOf = new Array(n).fill(null);

    const zeros = new Float32Array(16 * n);
    for (const [key, hex] of [["green", "#3ecf6e"], ["red", "#e23b4e"], ["orange", "#ff9f1c"], ["yellow", "#ffd24a"]] as const) {
      const m = MeshBuilder.CreateDisc(`marker-${key}`, { radius: 4.2, tessellation: 24 }, scene);
      m.rotation.x = Math.PI / 2;
      m.bakeCurrentTransformIntoVertices();
      const mat = this.pbr(`marker-${key}`, hex, { rough: 0.6 });
      mat.emissiveColor = Color3.FromHexString(hex);
      mat.unlit = true;
      m.material = mat;
      m.parent = this.mmNode;
      m.isPickable = false;
      m.thinInstanceSetBuffer("matrix", zeros.slice(), 16, false);
      this.markerMeshes[key] = m;
    }
    this.hit = MeshBuilder.CreateBox("keyhit", { size: 1 }, scene);
    this.hit.parent = this.mmNode;
    this.hit.visibility = 0;
    this.hit.thinInstanceEnablePicking = true;
    this.refreshHit();
    this.applyPlacement();
    this.refreshMarkers();
  }

  // ---------------------------------------------------------------- helpers
  private pbr(name: string, hex: string, o: { metal?: number; rough?: number; alpha?: number; tex?: Texture } = {}): PBRMaterial {
    const m = new PBRMaterial(`kb-${name}`, this.scene);
    m.albedoColor = Color3.FromHexString(hex).toLinearSpace();
    m.metallic = o.metal ?? 0;
    m.roughness = o.rough ?? 0.5;
    if (o.alpha !== undefined && o.alpha < 1) {
      m.alpha = o.alpha;
      m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      m.backFaceCulling = false;
    }
    if (o.tex) {
      m.albedoTexture = o.tex;
    }
    this.owned.push(m);
    return m;
  }

  private meshFrom(name: string, vd: VertexData, parent: TransformNode, mat: PBRMaterial, shadow = true): Mesh {
    const m = new Mesh(name, this.scene);
    vd.applyToMesh(m);
    m.parent = parent;
    m.material = mat;
    m.receiveShadows = true;
    m.isPickable = false;
    if (shadow && (mat.alpha ?? 1) >= 1) this.shadows?.addShadowCaster(m);
    return m;
  }

  private get stack() {
    return stackOf(this.family);
  }
  private get style(): CaseStyle {
    return CASE_STYLE[this.caseDef?.id ?? "plastic"];
  }
  private get geo() {
    return FAMILY_GEO[this.family];
  }
  private get W() {
    return this.layout.width * PITCH;
  }
  private get D() {
    return this.layout.depth * PITCH;
  }
  private get bezel() {
    return this.caseDef ? this.style.bezel : 2;
  }

  /** Key center in cap space (x right, y away from the typist), mm. */
  private keyCap(k: KeyGeom): Pt {
    return [(k.x + k.w / 2) * PITCH - this.W / 2, -((k.y + k.h / 2) * PITCH - this.D / 2)];
  }
  /** Key center in Babylon board space (U), kept for the minigames. */
  keyXZ(k: KeyGeom): [number, number] {
    return [-(k.x + k.w / 2 - this.layout.width / 2), k.y + k.h / 2 - this.layout.depth / 2];
  }
  get outerWidth() {
    return (this.W + 2 * this.bezel) / 1000;
  }
  get outerDepth() {
    return (this.D + 2 * this.bezel) / 1000;
  }

  // ---------------------------------------------------------------- placement (typing angle)
  private tiltDeg() {
    return this.caseDef ? Math.max(1.5, this.style.tilt + this.stack.tiltAdj) : 0;
  }
  /** Desk plane in tilted cap space: z = zb(y). The case's front bottom edge touches the desk. */
  private deskPlane() {
    const a = (this.tiltDeg() * Math.PI) / 180;
    const Do = this.D + 2 * this.bezel;
    const zFront = this.stack.floor - 3;
    const c = zFront * Math.cos(a) + (-Do / 2) * Math.sin(a);
    return { a, c, zb: (y: number) => (c - y * Math.sin(a)) / Math.cos(a) };
  }
  private applyPlacement() {
    const { a, c } = this.deskPlane();
    this.root.rotation.x = a;
    this.root.position.y = -c / 1000;
  }

  // ---------------------------------------------------------------- family (MX / Box / Choc footprint)
  setFamily(f: SwitchFamily) {
    if (f === this.family) return;
    this.family = f;
    this.rebuildAll();
  }

  private rebuildAll() {
    this.buildCase(false);
    this.buildFoams();
    this.buildPcb(false);
    this.buildPlate(false);
    this.buildStabs(false);
    this.buildSwitchMeshes();
    if (this.capSet) this.setKeycaps(this.capSet);
    this.refreshHit();
    this.applyPlacement();
  }

  // ---------------------------------------------------------------- case
  setCase(def: CaseMaterialDef | null, hex: string | null, animate = true) {
    this.caseDef = def && hex ? def : null;
    this.caseHex = hex;
    this.buildCase(animate);
    this.buildFoams();
    this.refreshHit();
    this.applyPlacement();
  }

  private buildCase(animate: boolean) {
    this.caseNode.getChildMeshes().forEach((m) => {
      this.shadows?.removeShadowCaster(m);
      m.dispose();
    });
    const def = this.caseDef;
    const hex = this.caseHex;
    if (!def || !hex) return;
    const st = this.style;
    const S = this.stack;
    const W = this.W, D = this.D;
    const Wo = W + 2 * st.bezel, Do = D + 2 * st.bezel;
    const R = st.radius;
    const zt = st.wallTop + S.wallAdj;
    const zf = S.floor;
    const { zb } = this.deskPlane();
    const g = new Geo();
    const P = 7;
    const out = (inset: number, z: number | ((x: number, y: number) => number)) => g.ring(rrect(Wo - 2 * inset, Do - 2 * inset, Math.max(0.3, R - inset), P), z);
    const eb = 0.8; // bottom edge round-over
    // bottom face + outer wall
    const bottom = out(eb, (_x, y) => zb(y));
    g.fan(out(eb, (_x, y) => zb(y)), false);
    const r1 = out(0, (_x, y) => zb(y) + eb);
    g.bridge(bottom, r1);
    const es = st.edgeSize;
    let top: number[];
    if (st.edge === "fillet") {
      let prev = r1;
      const r2 = out(0, zt - es);
      g.bridge(prev, r2);
      prev = r2;
      for (let k = 1; k <= 5; k++) {
        const th = (k / 5) * (Math.PI / 2);
        const ring = out(es * (1 - Math.cos(th)), zt - es + es * Math.sin(th));
        g.bridge(prev, ring);
        prev = ring;
      }
      top = out(es, zt); // duplicate ring: hard edge into the flat rim
    } else {
      const r2 = out(0, zt - es);
      g.bridge(r1, r2);
      const c0 = out(0, zt - es);
      const c1 = out(es, zt);
      g.bridge(c0, c1);
      top = out(es, zt);
    }
    // top rim → inner opening (plate outline + clearance)
    const inner = (z: number) => g.ring(rrect(W + 1.2, D + 1.2, 1.0, P), z);
    const innerTop = inner(zt);
    g.bridge(top, innerTop);
    const iw0 = inner(zt);
    const iw1 = inner(zf);
    g.bridge(iw1, iw0, true);
    g.fan(inner(zf), true);
    const vd = g.toVertexData("box", st.texture === "layers" ? 1 / 3 : 1 / 60);
    let tex: Texture | undefined;
    if (st.texture === "wood") tex = this.woodTexture();
    if (st.texture === "layers") tex = this.layerTexture();
    const color = st.texture === "wood" ? Color3.FromHexString(hex).scale(1.25).toHexString() : hex;
    const mat = this.pbr(`case-${def.id}`, color, { metal: st.metal, rough: st.rough, alpha: st.alpha, tex });
    if (st.metal > 0.5) {
      mat.metallicF0Factor = 0.9;
    }
    if (def.id === "polycarbonate" || def.id === "acrylic") {
      mat.subSurface.isTranslucencyEnabled = false;
      mat.indexOfRefraction = 1.5;
    }
    const m = this.meshFrom("case", vd, this.caseNode, mat, !st.alpha);
    m.alphaIndex = 10;
    // USB-C port on the back wall
    const port = new Geo();
    port.box(0, Do / 2 - 0.6, S.pcbTop - S.pcbT - 3.4, 9, 1.6, 3.4);
    this.meshFrom("usb", port.toVertexData(), this.caseNode, this.pbr("usb", "#1a1a1c", { rough: 0.4, metal: 0.6 }), false);
    if (animate) this.drop(this.caseNode, 0);
  }

  private woodTexture(): DynamicTexture {
    const t = new DynamicTexture("wood", { width: 1024, height: 256 }, this.scene, true);
    const g = t.getContext() as unknown as CanvasRenderingContext2D;
    g.fillStyle = "#b89268";
    g.fillRect(0, 0, 1024, 256);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 140; i++) {
      const y = rnd() * 256;
      g.strokeStyle = `rgba(70,40,15,${0.08 + rnd() * 0.22})`;
      g.lineWidth = 0.5 + rnd() * 2.2;
      g.beginPath();
      for (let x = 0; x <= 1024; x += 16) g.lineTo(x, y + Math.sin(x / 140 + i) * 4 + Math.sin(x / 37 + i * 3) * 1.2);
      g.stroke();
    }
    t.update();
    t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
    this.owned.push(t);
    return t;
  }

  private layerTexture(): DynamicTexture {
    const t = new DynamicTexture("layers", { width: 8, height: 64 }, this.scene, true);
    const g = t.getContext() as unknown as CanvasRenderingContext2D;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 8, 64);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0, 0, 8, 3);
    t.update();
    t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
    this.owned.push(t);
    return t;
  }

  // ---------------------------------------------------------------- foams
  setDampening(ids: string[], animate = true) {
    const added = ids.filter((i) => !this.foamOn.includes(i));
    this.foamOn = [...ids];
    this.buildFoams();
    if (animate) for (const id of added) if (this.foams[id]) this.drop(this.foams[id]!, this.foams[id]!.position.y);
  }

  private buildFoams() {
    for (const k of Object.keys(this.foams)) {
      this.foams[k]?.dispose();
      this.foams[k] = null;
    }
    const S = this.stack;
    const W = this.W, D = this.D;
    const on = (k: string) => this.foamOn.includes(k);
    let z = S.floor;
    if (on("silicone")) {
      const g = new Geo();
      g.prism(rrect(W - 1, D - 1, 1, 4), z, z + 2.5);
      this.foams.silicone = this.meshFrom("silicone", g.toVertexData(), this.mmNode, this.pbr("silicone", "#eef2f5", { rough: 0.35, alpha: 0.8 }), false);
      z += 2.5;
    }
    if (on("caseFoam")) {
      const g = new Geo();
      g.prism(rrect(W - 1, D - 1, 1, 4), z, S.pcbTop - S.pcbT - 0.2);
      this.foams.caseFoam = this.meshFrom("caseFoam", g.toVertexData(), this.mmNode, this.pbr("caseFoam", "#34373c", { rough: 0.95 }));
    }
    if (on("peFoam")) {
      const m = this.holePlate("peFoam", 0.4, 0.6);
      m.position.y = S.pcbTop + 0.4;
      m.material = this.pbr("peFoam", "#fbfbfa", { rough: 0.9 });
      this.foams.peFoam = m;
    }
    if (on("plateFoam")) {
      const th = -S.plateT - S.pcbTop - (on("peFoam") ? 0.4 : 0) - 0.1;
      const m = this.holePlate("plateFoam", th, 1.0);
      m.position.y = -S.plateT - 0.05;
      m.material = this.pbr("plateFoam", "#e6d6ae", { rough: 0.95 });
      this.foams.plateFoam = m;
    }
  }

  /**
   * A sheet with switch (and stabilizer) cutouts, top at y = 0, in Babylon mm space.
   * grow: extra clearance around cutouts.
   */
  private holePlate(name: string, thickness: number, grow = 0, withStabs = true): Mesh {
    const W = this.W / 2 + 0.2;
    const D = this.D / 2 + 0.2;
    const c = this.geo.cutout / 2 + grow / 2;
    const shape = [new Vector3(-W, 0, -D), new Vector3(W, 0, -D), new Vector3(W, 0, D), new Vector3(-W, 0, D)];
    const rect = (x: number, z: number, hw: number, hd: number) => [new Vector3(x - hw, 0, z - hd), new Vector3(x + hw, 0, z - hd), new Vector3(x + hw, 0, z + hd), new Vector3(x - hw, 0, z + hd)];
    const holes: Vector3[][] = [];
    for (const k of this.layout.keys) {
      const [cx, cy] = this.keyCap(k);
      const X = -cx, Z = -cy;
      holes.push(rect(X, Z, c, c));
      if (withStabs && needsStab(k)) {
        const off = Math.max(k.w, k.h) >= 6 ? 50 : 11.9;
        const vertical = k.h > k.w;
        for (const s of [-1, 1]) {
          if (vertical) holes.push(rect(X, Z + s * off, 7 + grow / 2, 3.375 + grow / 2));
          else holes.push(rect(X + s * off, Z - 0.5, 3.375 + grow / 2, 7 + grow / 2));
        }
      }
    }
    const m = MeshBuilder.CreatePolygon(name, { shape, holes, depth: thickness }, this.scene, earcut);
    m.parent = this.mmNode;
    m.receiveShadows = true;
    m.isPickable = false;
    return m;
  }

  // ---------------------------------------------------------------- PCB
  setPcb(def: PcbDef | null, animate = true) {
    this.pcbDef = def;
    this.buildPcb(animate);
  }

  private buildPcb(animate: boolean) {
    this.pcbNode.getChildMeshes(true).forEach((m) => m.dispose());
    const def = this.pcbDef;
    if (!def) return;
    const S = this.stack;
    const W = this.W, D = this.D;
    const mk = (name: string, side: "top" | "bottom", y: number) => {
      const p = MeshBuilder.CreateGround(name, { width: W, height: D }, this.scene);
      const tex = this.pcbTexture(def, side);
      const mat = this.pbr(name, "#ffffff", { rough: 0.42, tex });
      mat.albedoColor = Color3.White();
      p.material = mat;
      p.parent = this.pcbNode;
      p.position.y = y;
      p.receiveShadows = true;
      p.isPickable = false;
      if (side === "bottom") p.rotation.z = Math.PI; // face down, keep x mirrored
      return p;
    };
    mk("pcbTop", "top", 0.01);
    mk("pcbBot", "bottom", -S.pcbT - 0.01);
    const body = new Geo();
    body.box(0, 0, -S.pcbT, W - 0.05, D - 0.05, S.pcbT - 0.02);
    this.meshFrom("pcbBody", body.toVertexData(), this.pcbNode, this.pbr("pcbSide", def.color, { rough: 0.5 }));
    this.pcbNode.position.y = S.pcbTop;
    this.tapeNode.position.y = -S.pcbT + 0.9;
    if (animate) this.drop(this.pcbNode, S.pcbTop);
  }

  private pcbTexture(def: PcbDef, side: "top" | "bottom"): DynamicTexture {
    const L = this.layout;
    const ppm = 4; // px per mm
    const w = Math.ceil(this.W * ppm);
    const h = Math.ceil(this.D * ppm);
    const t = new DynamicTexture(`pcb-${side}`, { width: w, height: h }, this.scene, true);
    const g = t.getContext() as unknown as CanvasRenderingContext2D;
    // The ground's +x is the typist's left: draw mirrored so the artwork reads left → right.
    g.save();
    if (side === "top") {
      g.translate(w, 0);
      g.scale(-1, 1);
    }
    g.fillStyle = def.color;
    g.fillRect(0, 0, w, h);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const trace = Color3.FromHexString(def.color).scale(1.35).toHexString();
    g.strokeStyle = trace;
    g.lineWidth = 1.2;
    for (let i = 0; i < 90; i++) {
      let x = rnd() * w, y = rnd() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        if (rnd() < 0.5) x += (rnd() - 0.5) * 160;
        else y += (rnd() - 0.5) * 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    const choc = this.family === "choc";
    for (const k of L.keys) {
      const cx = (k.x + k.w / 2) * PITCH * ppm;
      const cy = (k.y + k.h / 2) * PITCH * ppm;
      const mmx = (v: number) => cx + v * ppm;
      const mmy = (v: number) => cy + v * ppm;
      if (side === "top") {
        g.strokeStyle = "rgba(240,240,240,0.85)";
        g.lineWidth = 1;
        g.strokeRect(mmx(-7), mmy(-7), 14 * ppm, 14 * ppm);
        g.fillStyle = "#0d1a12";
        g.beginPath();
        g.arc(mmx(0), mmy(0), (choc ? 1.7 : 2.0) * ppm, 0, Math.PI * 2);
        g.fill();
        const pins: Pt[] = choc ? [[0, -5.9], [5, -3.8]] : [[-3.81, -2.54], [2.54, -5.08]];
        for (const [px, py] of pins) {
          g.fillStyle = "#d9b458";
          g.beginPath();
          g.arc(mmx(px), mmy(py), 1.25 * ppm, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#111";
          g.beginPath();
          g.arc(mmx(px), mmy(py), 0.7 * ppm, 0, Math.PI * 2);
          g.fill();
        }
        if (!choc)
          for (const px of [-5.08, 5.08]) {
            g.fillStyle = "#0d1a12";
            g.beginPath();
            g.arc(mmx(px), mmy(0), 0.9 * ppm, 0, Math.PI * 2);
            g.fill();
          }
        if (def.rgb) {
          g.fillStyle = "#f4f4f4";
          g.fillRect(mmx(-1.6), mmy(4.2), 3.2 * ppm, 2.4 * ppm);
        }
      } else {
        // back side: hot-swap sockets + diodes (mirror x because we look from below)
        const bx = (v: number) => cx - v * ppm;
        if (def.hotswap) {
          g.fillStyle = "#141414";
          g.fillRect(bx(2.6), mmy(-6.6), 9.5 * ppm, 4.6 * ppm);
          g.fillStyle = "#c9a550";
          g.fillRect(bx(-4.6), mmy(-5.4), 1.6 * ppm, 2.2 * ppm);
          g.fillRect(bx(7.4), mmy(-7.4), 1.6 * ppm, 2.2 * ppm);
        } else {
          g.fillStyle = "#d9b458";
          for (const [px, py] of [[-3.81, -2.54], [2.54, -5.08]]) {
            g.beginPath();
            g.arc(bx(px), mmy(py), 1.3 * ppm, 0, Math.PI * 2);
            g.fill();
          }
        }
        g.fillStyle = "#1b1b1b";
        g.fillRect(bx(6.5), mmy(2.5), 1.6 * ppm, 3.4 * ppm);
      }
    }
    if (def.flex && side === "top") {
      g.fillStyle = "rgba(0,0,0,0.55)";
      for (let x = 3; x < L.width - 2; x += 4) g.fillRect(x * PITCH * ppm, 6 * ppm, 0.8 * ppm, (this.D - 12) * ppm);
    }
    g.restore();
    g.save();
    g.fillStyle = "rgba(245,245,245,0.85)";
    g.font = `600 ${Math.round(3 * ppm)}px monospace`;
    const text = side === "top" ? `MKSS-${L.id.toUpperCase()} ${this.family.toUpperCase()} rev.4` : "thock responsibly";
    if (side === "top") {
      g.translate(w, 0);
      g.scale(-1, 1);
    }
    g.fillText(text, 6 * ppm, h - 2 * ppm);
    g.restore();
    t.update();
    this.owned.push(t);
    return t;
  }

  /** Flip the PCB upside-down (tape mod) or back. */
  flipPcb(flipped: boolean, done?: () => void) {
    const n = this.pcbNode;
    const y0 = this.stack.pcbTop;
    this.tweens.push({ node: n, prop: "y", from: n.position.y, to: flipped ? y0 + 45 : y0, t: 0, dur: 0.45 });
    this.tweens.push({ node: n, prop: "rotX", from: n.rotation.x, to: flipped ? Math.PI : 0, t: 0, dur: 0.6, done });
  }

  /** Points on top of the case rim where screws go (key units, root space), n = 6 or 8. */
  screwPoints(n: number): Vector3[] {
    const st = this.style;
    const Wo = this.W + 2 * st.bezel;
    const Do = this.D + 2 * st.bezel;
    const y = (st.wallTop + this.stack.wallAdj) * MM_U;
    const xs = n === 8 ? [-0.42, -0.14, 0.14, 0.42] : [-0.4, 0, 0.4];
    const pts: Vector3[] = [];
    for (const zs of [-1, 1]) for (const fx of xs) pts.push(new Vector3(fx * Wo * MM_U, y, zs * (Do / 2 - st.bezel / 2) * MM_U));
    return pts;
  }

  setTape(strips: { row: number; offset: number; from?: number; to?: number }[]) {
    this.tapeNode.getChildMeshes().forEach((m) => m.dispose());
    const L = this.layout;
    const rows = Math.ceil(L.depth);
    const mat = this.pbr("tape", "#cfe3ff", { alpha: 0.9, rough: 0.35 });
    for (const s of strips) {
      const from = s.from ?? 0;
      const to = s.to ?? 1;
      const w = (L.width - 0.2) * (to - from);
      const m = MeshBuilder.CreatePlane("tapeStrip", { width: w, height: 0.8 / Math.max(1, rows / 6), sideOrientation: Mesh.DOUBLESIDE }, this.scene);
      m.material = mat;
      m.parent = this.tapeNode;
      m.rotation.x = -Math.PI / 2;
      m.rotation.y = s.offset * 0.05;
      const cx = -(L.width - 0.2) / 2 + ((L.width - 0.2) * (from + to)) / 2;
      m.position.set(cx, -0.05, -((s.row + 0.5) * (L.depth / rows) - L.depth / 2) + s.offset * 0.2);
    }
  }

  // ---------------------------------------------------------------- plate
  setPlate(def: PlateDef | null, animate = true) {
    this.plateDef = def;
    this.buildPlate(animate);
  }

  private buildPlate(animate: boolean) {
    if (this.plateMesh) this.shadows?.removeShadowCaster(this.plateMesh);
    this.plateMesh?.dispose();
    this.plateMesh = null;
    const def = this.plateDef;
    if (!def || def.id === "none") return;
    const m = this.holePlate("plate", this.stack.plateT);
    let tex: Texture | undefined;
    if (def.id === "carbon") tex = this.carbonTexture();
    const metal = def.metalness > 0.5;
    const hex = metal ? Color3.FromHexString(def.color).scale(0.82).toHexString() : def.color;
    m.material = this.pbr(`plate-${def.id}`, hex, { metal: def.metalness, rough: metal ? Math.max(0.42, def.roughness) : def.roughness, alpha: def.id === "pc" ? 0.7 : undefined, tex });
    this.shadows?.addShadowCaster(m);
    this.plateMesh = m;
    if (animate) this.drop(m, 0);
  }

  private carbonTexture(): DynamicTexture {
    const t = new DynamicTexture("carbon", { width: 64, height: 64 }, this.scene, true);
    const g = t.getContext() as unknown as CanvasRenderingContext2D;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const on = (x + y) % 2 === 0;
        const grd = on ? g.createLinearGradient(x * 8, 0, x * 8 + 8, 0) : g.createLinearGradient(0, y * 8, 0, y * 8 + 8);
        grd.addColorStop(0, "#2a2a2e");
        grd.addColorStop(0.5, "#4a4a50");
        grd.addColorStop(1, "#2a2a2e");
        g.fillStyle = grd;
        g.fillRect(x * 8, y * 8, 8, 8);
      }
    t.update();
    t.uScale = t.vScale = 40;
    this.owned.push(t);
    return t;
  }

  // ---------------------------------------------------------------- stabilizers
  setStabs(def: StabDef | null, lubed = false, animate = true) {
    this.stabDef = def;
    this.stabLubed = lubed;
    this.buildStabs(animate);
  }

  private buildStabs(animate: boolean) {
    this.stabNode.getChildMeshes().forEach((m) => m.dispose());
    const def = this.stabDef;
    if (!def) return;
    const S = this.stack;
    const color = def.id === "premium" ? "#f1f1f1" : def.id === "standard" ? "#2a2a2a" : "#8a8a8a";
    const hg = new Geo();
    const wg = new Geo();
    const sg = new Geo();
    const hBot = S.pcbTop;
    const hTop = this.family === "choc" ? 2.2 : 4.6;
    for (const k of this.layout.keys.filter(needsStab)) {
      const [x, y] = this.keyCap(k);
      const off = Math.max(k.w, k.h) >= 6 ? 50 : 11.9;
      const vertical = k.h > k.w;
      for (const s of [-1, 1]) {
        const hx = vertical ? x : x + s * off;
        const hy = vertical ? y + s * off : y - 0.5;
        hg.box(hx, hy, hBot, vertical ? 12 : 6.3, vertical ? 6.3 : 12, hTop - hBot);
        // slider with a cross stem for the keycap
        sg.box(hx, hy, hTop, 4.2, 4.2, 1.2);
        sg.box(hx, hy, hTop + 1.2, 4.0, 1.17, 3.0);
        sg.box(hx, hy, hTop + 1.2, 1.27, 4.0, 3.0);
      }
      const wz = S.pcbTop + 1.6;
      if (vertical) wg.tube([[x + 4, y - off, wz + 3], [x + 6.5, y - off, wz], [x + 6.5, y + off, wz], [x + 4, y + off, wz + 3]], 0.55, 8);
      else wg.tube([[x - off, y - 4, wz + 3], [x - off, y - 6.5, wz], [x + off, y - 6.5, wz], [x + off, y - 4, wz + 3]], 0.55, 8);
    }
    this.meshFrom("stabHousings", hg.toVertexData(), this.stabNode, this.pbr("stabH", color, { rough: 0.45 }));
    this.meshFrom("stabStems", sg.toVertexData(), this.stabNode, this.pbr("stabS", def.id === "premium" ? "#e6e6e6" : "#f1efe9", { rough: 0.4 }));
    this.meshFrom("stabWires", wg.toVertexData(), this.stabNode, this.pbr("stabW", this.stabLubed ? "#e3d296" : "#d0d3d8", { metal: 1, rough: this.stabLubed ? 0.12 : 0.28 }));
    if (animate) this.drop(this.stabNode, 0);
  }

  // ---------------------------------------------------------------- switches
  setSwitchLook(sw: SwitchProduct | null | undefined) {
    this.sw = sw ?? null;
    if (sw && sw.family !== this.family) {
      this.setFamily(sw.family);
      return;
    }
    this.buildSwitchMeshes();
  }

  private buildSwitchMeshes() {
    this.swMeshes.forEach((m) => {
      this.shadows?.removeShadowCaster(m);
      m.dispose();
    });
    this.swMeshes = [];
    const sw = this.sw;
    if (!sw) return;
    const parts = switchParts(this.family);
    if (!parts) {
      whenSwitchModels(() => this.buildSwitchMeshes());
      return;
    }
    const clear = sw.housingOpacity < 1;
    const mats = {
      housing: this.pbr("sw-housing", sw.housingColor, { rough: clear ? 0.08 : 0.42, alpha: clear ? Math.max(0.35, sw.housingOpacity) : undefined }),
      bottom: this.pbr("sw-bottom", sw.bottomColor ?? sw.housingColor, { rough: clear ? 0.1 : 0.45, alpha: clear ? Math.max(0.4, sw.housingOpacity) : undefined }),
      stem: this.pbr("sw-stem", sw.stemColor, { rough: 0.35 }),
      spring: this.pbr("sw-spring", "#c9ccd1", { metal: 1, rough: 0.2 }),
    };
    const kind = this.family === "choc" && sw.type === "silent" ? "linear" : sw.type;
    const want: [string, PBRMaterial, boolean][] = [
      ["top", mats.housing, false],
      [this.family === "choc" ? "bottom" : "bottom5", mats.bottom, false],
      [`stem_${kind}`, mats.stem, true],
    ];
    if (this.family === "box") want.push(["box", mats.stem, true]);
    if (clear) want.push(["spring_lo", mats.spring, false]);
    for (const [name, mat, moves] of want) {
      const vd = parts[name];
      if (!vd) continue;
      const m = new Mesh(`sw-${name}`, this.scene);
      vd.applyToMesh(m);
      m.parent = this.switchNode;
      m.material = mat;
      m.isPickable = false;
      m.receiveShadows = true;
      m.metadata = { moves };
      m.alphaIndex = 20;
      if (!clear || moves) this.shadows?.addShadowCaster(m);
      this.swMeshes.push(m);
    }
    this.refreshSwitches();
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
    if (!this.swMeshes.length) return;
    const keys = this.layout.keys;
    const n = keys.length;
    const fixed = new Float32Array(16 * n);
    const moving = new Float32Array(16 * n);
    const q = Quaternion.Identity();
    const travel = this.geo.travel;
    keys.forEach((k, i) => {
      const a = this.switchIn[i];
      const s = a <= 0.001 ? 0 : 1;
      const [cx, cy] = this.keyCap(k);
      const drop = (1 - easeOutCubic(a)) * 30;
      const p = Math.min(1, this.press[i]) * travel;
      Matrix.Compose(new Vector3(s, s, s), q, new Vector3(-cx, drop, -cy)).copyToArray(fixed, i * 16);
      Matrix.Compose(new Vector3(s, s, s), q, new Vector3(-cx, drop - p, -cy)).copyToArray(moving, i * 16);
    });
    for (const m of this.swMeshes) m.thinInstanceSetBuffer("matrix", m.metadata.moves ? moving.slice() : fixed.slice(), 16, false);
  }

  // ---------------------------------------------------------------- keycaps
  /** Build keycaps for a set; one atlas texture holds every legend and the plain cap colors. */
  setKeycaps(set: KeycapSet | null) {
    this.capNode.getChildMeshes().forEach((m) => {
      this.shadows?.removeShadowCaster(m);
      m.dispose();
    });
    this.caps.fill(null);
    this.capSet = set;
    this.capSetKey = set ? `${set.id}:${set.colorway.alpha}${set.colorway.accent}:${this.family}` : null;
    if (!set) return;
    const cw = set.colorway;
    const keys = this.layout.keys;
    const labels = Array.from(new Set(keys.map((k) => `${k.kind}|${k.label}`)));
    const cols = 16;
    const cell = 128;
    const rows = Math.ceil((labels.length + 3) / cols);
    const tex = new DynamicTexture("capAtlas", { width: cols * cell, height: rows * cell }, this.scene, true);
    tex.anisotropicFilteringLevel = 8;
    const g = tex.getContext() as unknown as CanvasRenderingContext2D;
    const colorOf = (kind: string) => (kind === "alpha" ? cw.alpha : kind === "mod" ? cw.mod : cw.accent);
    const legendOf = (kind: string) => (kind === "alpha" ? cw.legendOnAlpha : kind === "mod" ? cw.legendOnMod : cw.legendOnAccent);
    const cellUv = (i: number): [number, number, number, number] => {
      const cx = (i % cols) * cell;
      const cy = Math.floor(i / cols) * cell;
      const W = cols * cell;
      const H = rows * cell;
      return [(cx + 6) / W, 1 - (cy + cell - 6) / H, (cx + cell - 6) / W, 1 - (cy + 6) / H];
    };
    labels.forEach((key, i) => {
      const [kind, label] = key.split("|");
      const cx = (i % cols) * cell;
      const cy = Math.floor(i / cols) * cell;
      g.fillStyle = colorOf(kind);
      g.fillRect(cx, cy, cell, cell);
      if (!label) return;
      g.fillStyle = readableOn(legendOf(kind), colorOf(kind));
      const single = label.length === 1;
      const size = single ? 46 : label.length <= 3 ? 28 : 22;
      g.font = `600 ${size}px Inter, system-ui, sans-serif`;
      if (single && /[A-Za-z0-9]/.test(label)) {
        g.textAlign = "left";
        g.textBaseline = "top";
        g.fillText(label, cx + cell * 0.2, cy + cell * 0.17);
      } else {
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(label, cx + cell / 2, cy + cell / 2);
      }
    });
    const solid: Record<string, [number, number]> = {};
    ["alpha", "mod", "accent"].forEach((kind, j) => {
      const i = labels.length + j;
      g.fillStyle = colorOf(kind);
      g.fillRect((i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
      const [u0, v0, u1, v1] = cellUv(i);
      solid[kind] = [(u0 + u1) / 2, (v0 + v1) / 2];
    });
    tex.update();
    this.owned.push(tex);
    const rough = set.material === "pbt" ? 0.7 : set.material === "abs" ? 0.4 : 0.52;
    const mat = this.pbr(`caps-${set.id}`, "#ffffff", { rough, tex });
    mat.albedoColor = Color3.White();
    mat.environmentIntensity = 0.85;
    const profile = PROFILE_GEO[set.profile] ? set.profile : "cherry";
    const capZ = this.geo.capZ;
    const cache = new Map<string, VertexData>();
    keys.forEach((k, i) => {
      const li = labels.indexOf(`${k.kind}|${k.label}`);
      const row = PROFILE_GEO[profile].sculpted ? profileRow(k.rowFromBottom) : 3;
      const legendLeft = k.w > 1.3 && k.h === 1 && k.label !== "" && k.label !== "Enter";
      const key = `${row}|${k.w}|${k.h}|${legendLeft}|${li}`;
      let vd = cache.get(key);
      if (!vd) {
        const geo = buildKeycap({ profile, row, w: k.w, h: k.h, cell: cellUv(li), solid: solid[k.kind], legendLeft });
        vd = new VertexData();
        vd.positions = geo.positions;
        vd.normals = geo.normals;
        vd.uvs = geo.uvs;
        vd.indices = geo.indices;
        cache.set(key, vd);
      }
      const m = new Mesh(`cap${i}`, this.scene);
      vd.applyToMesh(m);
      m.material = mat;
      m.parent = this.capNode;
      const [cx, cy] = this.keyCap(k);
      m.position.set(-cx, capZ, -cy);
      m.isPickable = false;
      m.receiveShadows = true;
      this.shadows?.addShadowCaster(m);
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
    const capZ = this.geo.capZ;
    const travel = this.geo.travel;
    this.caps.forEach((m, i) => {
      if (!m) return;
      const a = this.capIn[i];
      m.setEnabled(a > 0.001);
      const p = Math.min(1, this.press[i]);
      m.position.y = capZ + (1 - easeOutCubic(a)) * 35 - p * travel;
    });
  }

  // ---------------------------------------------------------------- interaction
  pressKey(i: number) {
    this.press[i] = 1;
  }

  private refreshHit() {
    const keys = this.layout.keys;
    const hm = new Float32Array(16 * keys.length);
    const y = this.geo.capZ + 4;
    keys.forEach((k, i) => {
      const [cx, cy] = this.keyCap(k);
      Matrix.Compose(new Vector3(k.w * PITCH - 1, 22, k.h * PITCH - 1), Quaternion.Identity(), new Vector3(-cx, y, -cy)).copyToArray(hm, i * 16);
    });
    this.hit.thinInstanceSetBuffer("matrix", hm, 16, true);
  }

  /** Key under a world-space ray (thin-instance picking on invisible hit boxes). */
  pickKey(ray: Ray): number | null {
    const info = this.scene.pickWithRay(ray, (m) => m === this.hit);
    return info?.hit && info.thinInstanceIndex !== undefined && info.thinInstanceIndex >= 0 ? info.thinInstanceIndex : null;
  }

  /** World position above a key; `aboveMm` = height over the plate (default: just above the keycap). */
  keyWorld(i: number, aboveMm?: number): Vector3 {
    const [cx, cy] = this.keyCap(this.layout.keys[i]);
    const y = aboveMm ?? this.geo.capZ + 12;
    return Vector3.TransformCoordinates(new Vector3(-cx, y, -cy), this.mmNode.getWorldMatrix());
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
    const y = hasCaps ? this.geo.capZ + 16 : this.geo.housingTop + 5;
    for (const [key, mesh] of Object.entries(this.markerMeshes)) {
      const buf = new Float32Array(16 * n);
      this.layout.keys.forEach((k, i) => {
        const s = this.markerOf[i] === key ? 1 : 0;
        const [cx, cy] = this.keyCap(k);
        Matrix.Compose(new Vector3(s, s, s), Quaternion.Identity(), new Vector3(-cx, y, -cy)).copyToArray(buf, i * 16);
      });
      mesh.thinInstanceSetBuffer("matrix", buf, 16, false);
    }
  }

  // ---------------------------------------------------------------- animation
  private drop(node: TransformNode, toY: number) {
    node.position.y = toY + 40;
    this.tweens.push({ node, prop: "y", from: toY + 40, to: toY, t: 0, dur: 0.5 });
  }

  get animating(): boolean {
    return this.tweens.length > 0 || this.press.some((p) => p > 0) || this.switchIn.some((v, i) => v !== this.switchTarget[i]) || this.capIn.some((v, i) => v !== this.capTarget[i]);
  }

  update(dt: number) {
    this.tweens = this.tweens.filter((tw) => {
      tw.t += dt;
      const x = Math.min(1, tw.t / tw.dur);
      if (tw.prop === "y") tw.node.position.y = tw.from + (tw.to - tw.from) * easeOutCubic(x);
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
        this.switchIn[i] = this.switchTarget[i] > this.switchIn[i] ? Math.min(1, this.switchIn[i] + dt * 5) : 0;
        sw = true;
      }
      if (this.capIn[i] !== this.capTarget[i]) {
        this.capIn[i] = this.capTarget[i] > this.capIn[i] ? Math.min(1, this.capIn[i] + dt * 4) : 0;
        cap = true;
      }
      if (this.press[i] > 0) {
        this.press[i] = Math.max(0, this.press[i] - dt * 6);
        sw = cap = true;
      }
    }
    if (sw) this.refreshSwitches();
    if (cap) {
      this.applyCaps();
      this.refreshMarkers();
    }
  }

  dispose() {
    this.base.getChildMeshes().forEach((m) => {
      this.shadows?.removeShadowCaster(m);
      m.dispose();
    });
    this.base.dispose();
    this.owned.forEach((o) => o.dispose());
  }
}
