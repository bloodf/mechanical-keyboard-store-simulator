/**
 * Procedural human: believable proportions (head ≈ 1/7.5 of height), a joint hierarchy,
 * a face with expressions, hair styles, clothes, accessories, and procedural animations.
 * Built entirely from code from an AvatarParams description.
 */
import {
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  Vector3,
  type Scene,
  type ShadowGenerator,
} from "@babylonjs/core";
import type { AvatarParams } from "../../data/avatar";
import { mixHex } from "../../data/color";
import { roundedBox } from "../geometry";

export type Expression = "neutral" | "happy" | "sad" | "angry" | "surprised";
export type Action = "idle" | "walk" | "talk" | "wave" | "happy" | "angry";

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

interface Joints {
  root: TransformNode; // on the floor, faces +Z
  hips: TransformNode;
  spine: TransformNode;
  chest: TransformNode;
  neck: TransformNode;
  head: TransformNode;
  shoulderL: TransformNode;
  shoulderR: TransformNode;
  elbowL: TransformNode;
  elbowR: TransformNode;
  hipL: TransformNode;
  hipR: TransformNode;
  kneeL: TransformNode;
  kneeR: TransformNode;
}

export class Human {
  readonly root: TransformNode;
  private j!: Joints;
  private meshes: Mesh[] = [];
  private mats = new Map<string, StandardMaterial>();
  private mouths: Record<"smile" | "grin" | "frown" | "open" | "flat", Mesh> = {} as never;
  private eyes: TransformNode[] = [];
  private brows: TransformNode[] = [];
  private t = 0;
  private phase = 0;
  private blinkIn = 2 + Math.random() * 3;
  private blink = 0;
  action: Action = "idle";
  expression: Expression = "neutral";
  /** Walking speed in m/s (drives the walk cycle). */
  speed = 0;
  private actionT = 0;

  constructor(
    private scene: Scene,
    public params: AvatarParams,
    private shadows?: ShadowGenerator | null,
    name = "human",
  ) {
    this.root = new TransformNode(name, scene);
    this.build();
  }

  // ---------- materials ----------
  private mat(key: string, hex: string, spec = 0.08, alpha = 1): StandardMaterial {
    const id = `${key}:${hex}:${alpha}`;
    let m = this.mats.get(id);
    if (!m) {
      m = new StandardMaterial(`hm-${id}`, this.scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.specularColor = new Color3(spec, spec, spec);
      m.specularPower = 24;
      if (alpha < 1) m.alpha = alpha;
      this.mats.set(id, m);
    }
    return m;
  }

  private add<T extends Mesh>(m: T, parent: TransformNode, mat: StandardMaterial, shadow = true): T {
    m.parent = parent;
    m.material = mat;
    m.isPickable = false;
    if (shadow) this.shadows?.addShadowCaster(m, false);
    m.receiveShadows = true;
    this.meshes.push(m);
    return m;
  }

  private capsule(name: string, radius: number, height: number, parent: TransformNode, mat: StandardMaterial, pos: Vector3, rot?: Vector3): Mesh {
    const m = MeshBuilder.CreateCapsule(name, { radius, height: Math.max(height, radius * 2 + 0.001), tessellation: 16, subdivisions: 2, capSubdivisions: 6 }, this.scene);
    m.position = pos;
    if (rot) m.rotation = rot;
    return this.add(m, parent, mat);
  }

  private sphere(name: string, d: number, parent: TransformNode, mat: StandardMaterial, pos: Vector3, scale?: Vector3, opts: { slice?: number; segments?: number } = {}): Mesh {
    const m = MeshBuilder.CreateSphere(name, { diameter: d, segments: opts.segments ?? 20, slice: opts.slice }, this.scene);
    m.position = pos;
    if (scale) m.scaling = scale;
    return this.add(m, parent, mat);
  }

  private node(name: string, parent: TransformNode | null, pos: Vector3): TransformNode {
    const n = new TransformNode(name, this.scene);
    n.parent = parent;
    n.position = pos;
    return n;
  }

  // ---------- build ----------
  rebuild(params: AvatarParams) {
    this.params = params;
    this.disposeMeshes();
    this.build();
  }

  private build() {
    const p = this.params;
    const s = p.height;
    const b = p.build;
    const wide = 0.9 + b * 0.32; // torso/limb width multiplier
    const skin = this.mat("skin", p.skin, 0.12);
    const skinDark = this.mat("skin2", mixHex(p.skin, "#5a2e1a", 0.18), 0.1);
    const top = this.mat("top", p.topColor, 0.05);
    const topDark = this.mat("top2", mixHex(p.topColor, "#000000", 0.25), 0.05);
    const pants = this.mat("pants", p.pantsColor, 0.05);
    const shoes = this.mat("shoes", p.shoeColor, 0.2);
    const sole = this.mat("sole", mixHex(p.shoeColor, "#ffffff", 0.6), 0.1);
    const hair = this.mat("hair", p.hairColor, 0.25);
    const longSleeves = p.top !== "tshirt";

    // Joint hierarchy (meters, before the height scale)
    const root = this.root;
    const hips = this.node("hips", root, V(0, 0.93, 0));
    const spine = this.node("spine", hips, V(0, 0.06, 0));
    const chest = this.node("chest", spine, V(0, 0.2, 0));
    const neck = this.node("neck", chest, V(0, 0.25, 0));
    const head = this.node("head", neck, V(0, 0.135, 0.012));
    const sw = 0.178 * (0.94 + b * 0.14);
    const shoulderL = this.node("shoulderL", chest, V(-sw, 0.115, -0.005));
    const shoulderR = this.node("shoulderR", chest, V(sw, 0.115, -0.005));
    const elbowL = this.node("elbowL", shoulderL, V(0, -0.29, 0));
    const elbowR = this.node("elbowR", shoulderR, V(0, -0.29, 0));
    const hipL = this.node("hipL", hips, V(-0.082 * wide, -0.05, 0));
    const hipR = this.node("hipR", hips, V(0.082 * wide, -0.05, 0));
    const kneeL = this.node("kneeL", hipL, V(0, -0.43, 0));
    const kneeR = this.node("kneeR", hipR, V(0, -0.43, 0));
    this.j = { root, hips, spine, chest, neck, head, shoulderL, shoulderR, elbowL, elbowR, hipL, hipR, kneeL, kneeR };
    root.scaling.setAll(s);

    // Torso: one continuous body shape (crotch → hips → waist → chest → shoulders → neck),
    // split into pants (bottom) and shirt (top) with a hem overlap.
    const belly = 1 + b * 0.22;
    const shape = (pts: [number, number][], zScale: number, name: string, parent: TransformNode, mat: StandardMaterial) => {
      const m = MeshBuilder.CreateLathe(name, { shape: pts.map(([r, y]) => V(r, y, 0)), tessellation: 40, cap: Mesh.CAP_ALL }, this.scene);
      m.scaling = V(1, 1, zScale);
      return this.add(m, parent, mat);
    };
    const hipW = 0.146 * wide;
    shape(
      [
        [0.0, -0.075],
        [hipW * 0.8, -0.07],
        [hipW * 0.97, -0.045],
        [hipW, -0.02],
        [0.148 * wide * belly, 0.05],
        [0.146 * wide * belly, 0.08],
      ],
      0.66 + b * 0.08,
      "pantsTop",
      hips,
      pants,
    );
    const chestW = 0.158 * (0.94 + b * 0.16);
    shape(
      [
        [hipW * 1.01, -0.03],
        [0.15 * wide * belly, 0.02],
        [0.145 * wide * belly, 0.08],
        [chestW, 0.19],
        [chestW * 1.06, 0.28],
        [chestW * 1.1, 0.335],
        [chestW * 1.02, 0.38],
        [0.1, 0.415],
        [0.055, 0.43],
        [0.0, 0.432],
      ],
      0.62 + b * 0.08,
      "shirt",
      hips,
      top,
    ).position.y = 0.02;
    // Shoulder caps that blend the arm into the torso
    for (const [sh, side] of [[shoulderL, -1], [shoulderR, 1]] as const) {
      this.sphere(`delt${side}`, 0.1 * (0.95 + b * 0.25), sh, top, V(-0.006 * side, -0.01, 0), V(1, 0.9, 0.9));
    }
    // Neck
    this.capsule("neckm", 0.047 * (0.95 + b * 0.15), 0.15, neck, skin, V(0, 0.01, 0.005));

    // Clothing details
    const frontZ = (y: number) => (y > 0.18 ? chestW * 1.06 : 0.148 * wide * belly) * (0.62 + b * 0.08);
    if (p.top === "hoodie") {
      const hood = MeshBuilder.CreateTorus("hood", { diameter: 0.2, thickness: 0.075, tessellation: 28 }, this.scene);
      hood.position = V(0, 0.43, -0.06);
      hood.rotation = V(1.15, 0, 0);
      hood.scaling = V(1.08, 1, 0.85);
      this.add(hood, hips, top);
      const pocket = roundedBox("pocket", { w: 0.21 * wide, h: 0.09, d: 0.02, r: 0.02, shape: (q) => (q.z -= q.x * q.x * 1.6) }, this.scene);
      pocket.position = V(0, 0.1, frontZ(0.1) + 0.006);
      this.add(pocket, hips, topDark);
      for (const x of [-0.03, 0.03]) this.capsule(`string${x}`, 0.0045, 0.11, hips, this.mat("string", "#f2f2f2"), V(x, 0.33, frontZ(0.3) + 0.004));
    } else if (p.top === "shirt") {
      for (const side of [-1, 1]) {
        const collar = roundedBox(`collar${side}`, { w: 0.075, h: 0.045, d: 0.012, r: 0.008 }, this.scene);
        collar.position = V(0.035 * side, 0.42, 0.055);
        collar.rotation = V(-0.55, 0.3 * side, 0.7 * side);
        this.add(collar, hips, this.mat("collar", mixHex(p.topColor, "#ffffff", 0.35)));
      }
      for (let i = 0; i < 4; i++) this.sphere(`button${i}`, 0.012, hips, this.mat("button", "#f4f1ea", 0.4), V(0, 0.36 - i * 0.085, frontZ(0.36 - i * 0.085) + 0.004), V(1, 1, 0.5));
    } else if (p.top === "sweater") {
      const collar = MeshBuilder.CreateTorus("rib", { diameter: 0.12, thickness: 0.03, tessellation: 24 }, this.scene);
      collar.position = V(0, 0.43, 0);
      collar.scaling = V(1, 1, 0.85);
      this.add(collar, hips, topDark);
    } else {
      const collar = MeshBuilder.CreateTorus("tcollar", { diameter: 0.115, thickness: 0.014, tessellation: 24 }, this.scene);
      collar.position = V(0, 0.437, 0.0);
      collar.scaling = V(1, 1, 0.9);
      this.add(collar, hips, topDark);
    }
    if (p.apron) {
      const apronMat = this.mat("apron", p.apronColor, 0.05);
      // Curved bib + skirt that wraps the front of the body.
      const ap = roundedBox("apron", { w: 0.32 * wide, h: 0.6, d: 0.01, r: 0.004, seg: 10, shape: (q, t) => {
          const k = Math.min(1, Math.max(0, (t - 0.45) / 0.17));
          q.x *= 1 - 0.36 * k * k * (3 - 2 * k); // narrower bib above the waist
          q.z -= q.x * q.x * 2.4;
        } }, this.scene);
      ap.position = V(0, 0.06, frontZ(0.05) + 0.014);
      this.add(ap, hips, apronMat);
      for (const side of [-1, 1]) this.capsule(`strap${side}`, 0.008, 0.2, hips, apronMat, V(0.07 * side, 0.38, frontZ(0.3) - 0.01), V(0.25, 0, -0.35 * side));
      const pocket = roundedBox("apocket", { w: 0.19 * wide, h: 0.1, d: 0.012, r: 0.008, seg: 6, shape: (q) => (q.z -= q.x * q.x * 2.2) }, this.scene);
      pocket.position = V(0, -0.08, frontZ(0.05) + 0.024);
      this.add(pocket, hips, this.mat("apron2", mixHex(p.apronColor, "#000000", 0.2)));
      const logo = roundedBox("alogo", { w: 0.045, h: 0.04, d: 0.014, r: 0.008 }, this.scene);
      logo.position = V(0.06, 0.27, frontZ(0.27) + 0.02);
      this.add(logo, hips, this.mat("logo", "#ffb400", 0.2));
    }

    // Arms (tapered)
    for (const [sh, el, side] of [[shoulderL, elbowL, -1], [shoulderR, elbowR, 1]] as const) {
      const a = 0.92 + b * 0.3;
      sh.rotation.z = 0.09 * side;
      const upper = MeshBuilder.CreateCapsule(`upper${side}`, { height: 0.32, radiusTop: 0.046 * a, radiusBottom: 0.037 * a, tessellation: 18, capSubdivisions: 6 }, this.scene);
      upper.position = V(0, -0.145, 0);
      this.add(upper, sh, longSleeves ? top : skin);
      if (!longSleeves) {
        const sleeve = MeshBuilder.CreateCylinder(`sleeve${side}`, { height: 0.14, diameterTop: 0.1 * a, diameterBottom: 0.098 * a, tessellation: 20 }, this.scene);
        sleeve.position = V(0, -0.06, 0);
        this.add(sleeve, sh, top);
      }
      this.sphere(`elbowJ${side}`, 0.074 * a, el, longSleeves ? top : skin, V(0, 0, 0), undefined, { segments: 12 });
      const fore = MeshBuilder.CreateCapsule(`fore${side}`, { height: 0.28, radiusTop: 0.036 * a, radiusBottom: 0.027 * a, tessellation: 18, capSubdivisions: 6 }, this.scene);
      fore.position = V(0, -0.125, 0);
      this.add(fore, el, longSleeves ? top : skin);
      if (longSleeves) {
        const cuff = MeshBuilder.CreateCylinder(`cuff${side}`, { height: 0.03, diameter: 0.062 * a, tessellation: 16 }, this.scene);
        cuff.position = V(0, -0.24, 0);
        this.add(cuff, el, topDark);
      }
      // Hand: palm, finger block, thumb
      const hand = this.node(`hand${side}`, el, V(0, -0.265, 0));
      const palm = roundedBox(`palm${side}`, { w: 0.028, h: 0.085, d: 0.075, r: 0.013 }, this.scene);
      palm.position = V(0, -0.04, 0.003);
      this.add(palm, hand, skin);
      const fingers = roundedBox(`fingers${side}`, { w: 0.024, h: 0.07, d: 0.07, r: 0.011 }, this.scene);
      fingers.position = V(0.002 * side, -0.1, 0.006);
      fingers.rotation.x = 0.12;
      this.add(fingers, hand, skin);
      this.capsule(`thumb${side}`, 0.011, 0.05, hand, skin, V(0.008 * side, -0.045, 0.042), V(0.5, 0, 0.25 * side));
    }

    // Legs (tapered), shoes
    for (const [hp, kn, side] of [[hipL, kneeL, -1], [hipR, kneeR, 1]] as const) {
      const l = 0.9 + b * 0.3;
      const thigh = MeshBuilder.CreateCapsule(`thigh${side}`, { height: 0.5, radiusTop: 0.076 * l, radiusBottom: 0.055 * l, tessellation: 20, capSubdivisions: 6 }, this.scene);
      thigh.position = V(0, -0.2, 0);
      this.add(thigh, hp, pants);
      this.sphere(`knee${side}`, 0.112 * l, kn, pants, V(0, 0, 0.004), undefined, { segments: 14 });
      const shin = MeshBuilder.CreateCapsule(`shin${side}`, { height: 0.46, radiusTop: 0.056 * l, radiusBottom: 0.045 * l, tessellation: 20, capSubdivisions: 6 }, this.scene);
      shin.position = V(0, -0.21, 0);
      this.add(shin, kn, pants);
      const ankle = this.node(`ankle${side}`, kn, V(0, -0.43, 0));
      const shoe = roundedBox(`shoe${side}`, { w: 0.1, h: 0.09, d: 0.27, r: 0.04, shape: (q) => (q.x *= q.z > 0.05 ? 1 - (q.z - 0.05) * 1.2 : 1) }, this.scene);
      shoe.position = V(0, -0.04, 0.045);
      this.add(shoe, ankle, shoes);
      const so = roundedBox(`sole${side}`, { w: 0.104, h: 0.024, d: 0.275, r: 0.011 }, this.scene);
      so.position = V(0, -0.082, 0.045);
      this.add(so, ankle, sole);
    }

    this.buildHead(head, skin, skinDark, hair);
    this.setExpression(this.expression);
  }

  private buildHead(head: TransformNode, skin: StandardMaterial, skinDark: StandardMaterial, hair: StandardMaterial) {
    const p = this.params;
    // Egg-shaped head from a lathe (chin → crown), slightly deeper than wide.
    const prof = [V(0, -0.118, 0), V(0.04, -0.115, 0), V(0.066, -0.092, 0), V(0.077, -0.055, 0), V(0.082, -0.01, 0), V(0.085, 0.035, 0), V(0.08, 0.075, 0), V(0.064, 0.105, 0), V(0.035, 0.124, 0), V(0, 0.13, 0)];
    const skull = MeshBuilder.CreateLathe("skull", { shape: prof, tessellation: 36 }, this.scene);
    skull.scaling = V(0.97, 1, 1.13);
    this.add(skull, head, skin);
    // Ears
    for (const side of [-1, 1]) this.sphere(`ear${side}`, 0.055, head, skin, V(0.08 * side, 0.0, -0.005), V(0.35, 0.95, 0.6));
    // Nose
    this.capsule("nose", 0.013, 0.045, head, skinDark, V(0, -0.005, 0.093), V(0.35, 0, 0));
    // Eyes (white, iris, pupil, highlight)
    this.eyes = [];
    const white = this.mat("eyew", "#fbfbf8", 0.4);
    const iris = this.mat("iris", p.eyeColor, 0.3);
    const pupil = this.mat("pupil", "#101010", 0.6);
    for (const side of [-1, 1]) {
      const e = this.node(`eye${side}`, head, V(0.033 * side, 0.02, 0.079));
      this.sphere(`eyeW${side}`, 0.03, e, white, V(0, 0, 0), V(1, 0.9, 0.55), { segments: 12 });
      const ir = MeshBuilder.CreateCylinder(`iris${side}`, { diameter: 0.017, height: 0.003, tessellation: 16 }, this.scene);
      ir.rotation.x = Math.PI / 2;
      ir.position = V(0, 0, 0.0078);
      this.add(ir, e, iris, false);
      const pu = MeshBuilder.CreateCylinder(`pupil${side}`, { diameter: 0.008, height: 0.003, tessellation: 12 }, this.scene);
      pu.rotation.x = Math.PI / 2;
      pu.position = V(0, 0, 0.0092);
      this.add(pu, e, pupil, false);
      const hl = MeshBuilder.CreateSphere(`hl${side}`, { diameter: 0.004, segments: 6 }, this.scene);
      hl.position = V(0.003, 0.003, 0.0105);
      this.add(hl, e, this.mat("hl", "#ffffff", 1), false);
      this.eyes.push(e);
    }
    // Brows
    this.brows = [];
    const browMat = this.mat("brow", mixHex(p.hairColor, "#000000", 0.15), 0.1);
    const thick = p.brows === "thick" ? 0.0065 : p.brows === "thin" ? 0.0032 : 0.0048;
    for (const side of [-1, 1]) {
      const bn = this.node(`brow${side}`, head, V(0.034 * side, 0.05, 0.088));
      const m = this.capsule(`browm${side}`, thick, 0.036, bn, browMat, V(0, 0, 0), V(0, 0, Math.PI / 2 + (p.brows === "arched" ? 0.18 * side : 0.06 * side)));
      m.receiveShadows = false;
      this.brows.push(bn);
    }
    // Mouths (one visible at a time)
    const lip = this.mat("lip", mixHex(p.skin, "#8a2f2f", 0.45), 0.2);
    const dark = this.mat("mouth", "#4a1f1f", 0.1);
    const arc = (name: string, curve: number, width: number, radius: number) => {
      const path: Vector3[] = [];
      for (let i = 0; i <= 12; i++) {
        const u = i / 12 - 0.5;
        path.push(V(u * width, curve * (1 - 4 * u * u) * -1 + curve, 0));
      }
      const m = MeshBuilder.CreateTube(name, { path, radius, tessellation: 8, cap: Mesh.CAP_ALL }, this.scene);
      m.position = V(0, -0.052, 0.086);
      return this.add(m, head, lip, false);
    };
    this.mouths.smile = arc("smile", 0.006, 0.036, 0.0035);
    this.mouths.grin = arc("grin", 0.012, 0.044, 0.005);
    this.mouths.frown = arc("frown", -0.007, 0.034, 0.0035);
    this.mouths.flat = arc("flat", 0.0005, 0.03, 0.0032);
    const open = MeshBuilder.CreateSphere("open", { diameter: 0.028, segments: 10 }, this.scene);
    open.scaling = V(1, 0.75, 0.3);
    open.position = V(0, -0.055, 0.088);
    this.mouths.open = this.add(open, head, dark, false);

    // Facial hair
    if (p.facialHair !== "none") {
      const fh = this.mat("fh", p.hairColor, 0.15, p.facialHair === "stubble" ? 0.35 : 1);
      if (p.facialHair === "mustache") {
        this.capsule("stache", 0.008, 0.05, head, fh, V(0, -0.036, 0.094), V(0, 0, Math.PI / 2));
      } else {
        const beard = this.sphere("beard", 0.17, head, fh, V(0, -0.06, 0.012), V(0.96, 0.72, 1.06), { slice: 0.55 });
        beard.rotation.x = Math.PI;
        if (p.facialHair === "beard") this.capsule("stache", 0.009, 0.052, head, fh, V(0, -0.036, 0.094), V(0, 0, Math.PI / 2));
      }
    }

    // Hair & hats. The cap is the skull's own shape scaled up (always fits); fuller styles are
    // volumes shifted backward so the part in front sits inside the face and stays hidden.
    const hat = p.hat;
    const headProf = prof;
    const capMesh = (grow: number, hairline: number, name = "haircap") => {
      const pts = headProf.filter((v) => v.y >= hairline).map((v) => V(v.x * grow + 0.004, v.y * grow + 0.006, 0));
      pts.unshift(V(pts[0].x * 0.98, hairline - 0.004, 0));
      const m = MeshBuilder.CreateLathe(name, { shape: pts, tessellation: 36, cap: Mesh.CAP_END }, this.scene);
      m.scaling = V(0.97, 1, 1.13);
      m.rotation.x = -0.38; // lower at the back, hairline higher at the front
      m.position = V(0, 0.0, -0.012);
      return this.add(m, head, hair);
    };
    const volume = (name: string, size: Vector3, pos: Vector3) => this.sphere(name, 1, head, hair, pos, size, { segments: 20 });
    const style = p.hairStyle;
    if (style !== "bald" && hat === "none") {
      if (style === "buzz") capMesh(1.025, 0.0);
      else if (style === "afro") {
        const afro = volume("afro", V(0.27, 0.25, 0.27), V(0, 0.06, -0.025));
        const pos = afro.getVerticesData("position")!;
        for (let i = 0; i < pos.length; i += 3) {
          const k = 1 + (Math.sin(pos[i] * 60) * Math.cos(pos[i + 2] * 55) + Math.sin(pos[i + 1] * 50)) * 0.035;
          pos[i] *= k;
          pos[i + 1] *= k;
          pos[i + 2] *= k;
        }
        afro.updateVerticesData("position", pos);
      } else if (style === "curly") {
        capMesh(1.06, -0.01);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          this.sphere(`curl${i}`, 0.055, head, hair, V(Math.cos(a) * 0.07, 0.095 + Math.sin(i * 1.7) * 0.015, Math.sin(a) * 0.08 - 0.025), V(1, 0.85, 1), { segments: 10 });
        }
      } else {
        capMesh(1.07, -0.012);
        if (style === "short" || style === "spiky") this.sphere("fringe", 0.12, head, hair, V(0.015, 0.092, 0.055), V(1.05, 0.42, 0.62), { segments: 14 });
      }
      if (style === "bob") volume("bobvol", V(0.2, 0.22, 0.21), V(0, -0.01, -0.03));
      if (style === "long") {
        volume("longvol", V(0.205, 0.25, 0.215), V(0, -0.02, -0.032));
        volume("longback", V(0.19, 0.36, 0.09), V(0, -0.17, -0.075));
      }
      if (style === "bun") this.sphere("bun", 0.075, head, hair, V(0, 0.12, -0.085), undefined, { segments: 14 });
      if (style === "ponytail") {
        this.capsule("pony", 0.028, 0.18, head, hair, V(0, -0.02, -0.13), V(-0.45, 0, 0));
        const tie = MeshBuilder.CreateTorus("tie", { diameter: 0.045, thickness: 0.013, tessellation: 16 }, this.scene);
        tie.position = V(0, 0.05, -0.11);
        tie.rotation.x = 1.1;
        this.add(tie, head, this.mat("tie", "#e84393"));
      }
      if (style === "spiky") {
        for (let i = 0; i < 8; i++) {
          const c = MeshBuilder.CreateCylinder(`spike${i}`, { height: 0.075, diameterTop: 0, diameterBottom: 0.045, tessellation: 8 }, this.scene);
          const a = -1 + (i / 7) * 2;
          c.position = V(Math.sin(a) * 0.055, 0.125 - Math.abs(a) * 0.02, -0.03 + Math.cos(a * 1.4) * 0.03);
          c.rotation = V(-0.55, 0, -a * 0.55);
          this.add(c, head, hair);
        }
      }
    } else if (hat !== "none" && (style === "long" || style === "ponytail" || style === "bob")) {
      if (style === "long") volume("longback", V(0.19, 0.36, 0.09), V(0, -0.17, -0.075));
      if (style === "bob") volume("bobvol", V(0.2, 0.2, 0.21), V(0, -0.02, -0.03));
      if (style === "ponytail") this.capsule("pony", 0.028, 0.18, head, hair, V(0, -0.02, -0.13), V(-0.45, 0, 0));
    }
    if (hat !== "none") {
      const hm = this.mat("hat", p.hatColor, 0.08);
      const dome = capMesh(hat === "beanie" ? 1.11 : 1.09, hat === "beanie" ? 0.0 : 0.02, "hatdome");
      dome.material = hm;
      dome.rotation.x = -0.18;
      if (hat === "cap") {
        const brim = MeshBuilder.CreateCylinder("brim", { height: 0.008, diameter: 0.17, tessellation: 24, arc: 0.5 }, this.scene);
        brim.position = V(0, 0.07, 0.088);
        brim.rotation = V(-0.12, -Math.PI / 2, 0);
        brim.scaling = V(0.95, 1, 1);
        this.add(brim, head, hm);
        this.sphere("button", 0.018, head, hm, V(0, 0.148, -0.01));
      } else {
        const fold = MeshBuilder.CreateTorus("fold", { diameter: 0.178, thickness: 0.032, tessellation: 28 }, this.scene);
        fold.position = V(0, 0.028, -0.01);
        fold.rotation.x = -0.18;
        fold.scaling = V(0.98, 1, 1.13);
        this.add(fold, head, this.mat("hat2", mixHex(p.hatColor, "#000000", 0.15)));
        this.sphere("pompom", 0.055, head, this.mat("pom", mixHex(p.hatColor, "#ffffff", 0.5)), V(0, 0.17, -0.03), undefined, { segments: 10 });
      }
    }
    // Glasses
    if (p.glasses !== "none") {
      const frame = this.mat("frame", "#222222", 0.5);
      const lens = this.mat("lens", "#cfe8ff", 0.9, 0.25);
      for (const side of [-1, 1]) {
        const ring = MeshBuilder.CreateTorus(`lensring${side}`, { diameter: 0.038, thickness: 0.004, tessellation: p.glasses === "square" ? 4 : 20 }, this.scene);
        ring.rotation = V(Math.PI / 2, p.glasses === "square" ? Math.PI / 4 : 0, 0);
        ring.position = V(0.033 * side, 0.02, 0.1);
        if (p.glasses === "square") ring.scaling = V(1.25, 1, 1);
        this.add(ring, head, frame, false);
        const l = MeshBuilder.CreateDisc(`lens${side}`, { radius: 0.018, tessellation: p.glasses === "square" ? 4 : 20 }, this.scene);
        l.position = V(0.033 * side, 0.02, 0.101);
        if (p.glasses === "square") l.rotation.z = Math.PI / 4;
        this.add(l, head, lens, false);
        const arm = MeshBuilder.CreateCylinder(`temple${side}`, { height: 0.1, diameter: 0.004, tessellation: 6 }, this.scene);
        arm.rotation.x = Math.PI / 2;
        arm.position = V(0.079 * side, 0.022, 0.05);
        this.add(arm, head, frame, false);
      }
      const bridge = MeshBuilder.CreateCylinder("bridge", { height: 0.03, diameter: 0.004, tessellation: 6 }, this.scene);
      bridge.rotation.z = Math.PI / 2;
      bridge.position = V(0, 0.026, 0.1);
      this.add(bridge, head, frame, false);
    }
    if (p.headphones) {
      const hp = this.mat("hp", "#2b2b2f", 0.4);
      const band = MeshBuilder.CreateTorus("band", { diameter: 0.19, thickness: 0.014, tessellation: 30 }, this.scene);
      band.rotation.z = Math.PI / 2;
      band.position = V(0, 0.04, -0.005);
      band.scaling = V(1, 1.12, 1);
      this.add(band, head, hp);
      for (const side of [-1, 1]) {
        const cup = MeshBuilder.CreateCylinder(`cup${side}`, { height: 0.03, diameter: 0.07, tessellation: 20 }, this.scene);
        cup.rotation.z = Math.PI / 2;
        cup.position = V(0.092 * side, 0.0, 0);
        this.add(cup, head, this.mat("cup", p.topColor, 0.3));
      }
    }
  }

  // ---------- expressions & animation ----------
  setExpression(e: Expression) {
    this.expression = e;
    const show = e === "happy" ? "grin" : e === "sad" ? "frown" : e === "angry" ? "flat" : e === "surprised" ? "open" : "smile";
    for (const [k, m] of Object.entries(this.mouths)) m.setEnabled(k === show);
    this.brows.forEach((b, i) => {
      const side = i === 0 ? -1 : 1;
      b.position.y = e === "surprised" ? 0.06 : e === "angry" ? 0.045 : 0.05;
      b.rotation.z = e === "angry" ? -0.35 * side : e === "sad" ? 0.3 * side : 0;
    });
  }

  setAction(a: Action) {
    if (this.action !== a) this.actionT = 0;
    this.action = a;
  }

  update(dt: number) {
    const j = this.j;
    this.t += dt;
    this.actionT += dt;
    const t = this.t;
    // reset pose
    for (const n of [j.hips, j.spine, j.chest, j.neck, j.head, j.shoulderL, j.shoulderR, j.elbowL, j.elbowR, j.hipL, j.hipR, j.kneeL, j.kneeR]) n.rotation.set(0, 0, 0);
    j.shoulderL.rotation.z = -0.1;
    j.shoulderR.rotation.z = 0.1;
    j.elbowL.rotation.x = j.elbowR.rotation.x = -0.12;
    j.hips.position.y = 0.93;
    j.chest.scaling.set(1, 1, 1);

    // breathing
    const breath = Math.sin(t * 1.7);
    j.chest.scaling.set(1 + breath * 0.008, 1 + breath * 0.006, 1 + breath * 0.012);
    j.head.rotation.y = Math.sin(t * 0.37) * 0.12;
    j.head.rotation.x = Math.sin(t * 0.23) * 0.04;

    const walkAmp = Math.min(1, this.speed / 1.4);
    if (this.action === "walk" || this.speed > 0.05) {
      this.phase += dt * Math.max(0.6, this.speed) * 5.2;
      const ph = this.phase;
      const swing = 0.55 * walkAmp;
      j.hipL.rotation.x = Math.sin(ph) * swing;
      j.hipR.rotation.x = -Math.sin(ph) * swing;
      j.kneeL.rotation.x = Math.max(0, -Math.cos(ph)) * 0.9 * walkAmp;
      j.kneeR.rotation.x = Math.max(0, Math.cos(ph)) * 0.9 * walkAmp;
      j.shoulderL.rotation.x = -Math.sin(ph) * 0.45 * walkAmp;
      j.shoulderR.rotation.x = Math.sin(ph) * 0.45 * walkAmp;
      j.elbowL.rotation.x = j.elbowR.rotation.x = -0.35 * walkAmp - 0.12;
      j.hips.position.y = 0.93 + Math.abs(Math.cos(ph)) * 0.025 * walkAmp - 0.012 * walkAmp;
      j.spine.rotation.y = Math.sin(ph) * 0.08 * walkAmp;
      j.head.rotation.y *= 1 - walkAmp;
    }
    const at = this.actionT;
    switch (this.action) {
      case "talk":
        j.head.rotation.x = Math.sin(t * 6) * 0.05;
        j.shoulderR.rotation.x = -0.35 + Math.sin(t * 3) * 0.15;
        j.elbowR.rotation.x = -1.1;
        this.mouths.open.setEnabled(Math.sin(t * 18) > 0.2);
        this.mouths.smile.setEnabled(!this.mouths.open.isEnabled());
        break;
      case "wave":
        j.shoulderR.rotation.z = 2.7;
        j.elbowR.rotation.z = Math.sin(t * 10) * 0.5;
        j.elbowR.rotation.x = 0;
        break;
      case "happy":
        j.hips.position.y = 0.93 + Math.max(0, Math.sin(at * 9)) * 0.09;
        j.shoulderL.rotation.z = -2.6;
        j.shoulderR.rotation.z = 2.6;
        j.elbowL.rotation.x = j.elbowR.rotation.x = 0;
        break;
      case "angry":
        // arms crossed, stomping
        j.shoulderL.rotation.set(-0.75, 0.5, -0.25);
        j.shoulderR.rotation.set(-0.75, -0.5, 0.25);
        j.elbowL.rotation.set(-1.9, 0, 0);
        j.elbowR.rotation.set(-1.9, 0, 0);
        j.hipR.rotation.x = -Math.max(0, Math.sin(at * 7)) * 0.35;
        j.kneeR.rotation.x = Math.max(0, Math.sin(at * 7)) * 0.5;
        j.head.rotation.y = Math.sin(at * 5) * 0.2;
        break;
    }
    // blinking
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blink = 0.13;
      this.blinkIn = 2 + Math.random() * 4;
    }
    if (this.blink > 0) this.blink -= dt;
    const lid = this.blink > 0 ? 0.12 : this.expression === "angry" ? 0.7 : 1;
    this.eyes.forEach((e) => (e.scaling.y = lid));
  }

  setEnabled(on: boolean) {
    this.root.setEnabled(on);
  }

  private disposeMeshes() {
    for (const m of this.meshes) {
      this.shadows?.removeShadowCaster(m, false);
      m.dispose();
    }
    this.meshes = [];
    this.mouths = {} as never;
    for (const n of this.root.getChildTransformNodes(true)) n.dispose();
  }

  dispose() {
    this.disposeMeshes();
    this.mats.forEach((m) => m.dispose());
    this.mats.clear();
    this.root.dispose();
  }
}
