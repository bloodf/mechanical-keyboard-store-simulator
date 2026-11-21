/**
 * Builds the shop interior from code: room, windows + street, workbench, counter, shelves,
 * display table, job board, mirror, posters, plants, neon sign. Returns collision boxes
 * and the anchors the game needs (bench mat, interactables, customer spot…).
 */
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  Vector3,
  type Scene,
  type ShadowGenerator,
  type Texture,
} from "@babylonjs/core";
import { roundedBox } from "../geometry";
import { cork, cuttingMat, paintedWall, pegboard, poster, signTexture, streetView, woodFloor } from "../textures";

export interface Box2 {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type InteractId = "bench" | "jobs" | "mirror" | "register";
export interface Interactable {
  id: InteractId;
  /** Where the player should stand (xz) and the radius within which the prompt shows. */
  spot: Vector3;
  radius: number;
  highlight: Mesh[];
}

export const ROOM = { minX: -6, maxX: 6, minZ: -4.5, maxZ: 4.5, height: 3.2 };

export interface StoreLayout {
  obstacles: Box2[];
  interactables: Interactable[];
  benchAnchor: TransformNode; // the keyboard sits here (on the cutting mat)
  benchStand: Vector3; // where the technician stands at the bench
  customerSpot: Vector3; // where a customer waits at the counter
  door: Vector3;
  setSign(text: string): void;
  displayAnchors: TransformNode[]; // spots for display keyboards
  monitorScreen: Mesh; // bench monitor (shows charts during the sound check)
}

export function buildStore(scene: Scene, shadows: ShadowGenerator | null): StoreLayout {
  const mats = new Map<string, StandardMaterial>();
  const mat = (key: string, hex: string, o: { spec?: number; tex?: Texture; emissive?: string; alpha?: number; uv?: [number, number] } = {}) => {
    let m = mats.get(key);
    if (m) return m;
    m = new StandardMaterial(`st-${key}`, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    const s = o.spec ?? 0.06;
    m.specularColor = new Color3(s, s, s);
    m.specularPower = 32;
    if (o.tex) {
      m.diffuseTexture = o.tex;
      if (o.uv) {
        (o.tex as unknown as { uScale: number; vScale: number }).uScale = o.uv[0];
        (o.tex as unknown as { uScale: number; vScale: number }).vScale = o.uv[1];
      }
    }
    if (o.emissive) m.emissiveColor = Color3.FromHexString(o.emissive);
    if (o.alpha !== undefined) m.alpha = o.alpha;
    mats.set(key, m);
    return m;
  };
  const statics: { m: Mesh; cast: boolean }[] = [];
  const put = <T extends Mesh>(m: T, material: StandardMaterial, pos: Vector3, o: { cast?: boolean; rotY?: number; parent?: TransformNode } = {}): T => {
    m.material = material;
    m.position = pos;
    if (o.rotY) m.rotation.y = o.rotY;
    if (o.parent) m.parent = o.parent;
    m.receiveShadows = true;
    m.isPickable = false;
    statics.push({ m, cast: o.cast !== false });
    return m;
  };
  const box = (name: string, w: number, h: number, d: number, r = 0.02) => (r > 0 ? roundedBox(name, { w, h, d, r, seg: 2 }, scene) : MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene));
  const obstacles: Box2[] = [];
  const solid = (cx: number, cz: number, w: number, d: number) => obstacles.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });

  const { minX, maxX, minZ, maxZ, height: H } = ROOM;
  const W = maxX - minX;
  const D = maxZ - minZ;

  // ---------- Room shell ----------
  const floor = MeshBuilder.CreateGround("floor", { width: W, height: D }, scene);
  put(floor, mat("floor", "#ffffff", { tex: woodFloor(scene), uv: [W / 1.6, D / 1.6], spec: 0.12 }), new Vector3(0, 0, 0), { cast: false });
  const wallTex = paintedWall(scene, "#efe1cb");
  const wallMat = mat("wall", "#ffffff", { tex: wallTex, uv: [3, 1] });
  const accentWall = mat("wallAccent", "#ffffff", { tex: paintedWall(scene, "#2f6e57", "wallAccent"), uv: [3, 1] });
  const back = MeshBuilder.CreatePlane("backWall", { width: W, height: H }, scene);
  put(back, accentWall, new Vector3(0, H / 2, minZ), { cast: false });
  back.rotation.y = Math.PI;
  const left = MeshBuilder.CreatePlane("leftWall", { width: D, height: H }, scene);
  put(left, wallMat, new Vector3(minX, H / 2, 0), { cast: false });
  left.rotation.y = -Math.PI / 2;
  const right = MeshBuilder.CreatePlane("rightWall", { width: D, height: H }, scene);
  put(right, wallMat, new Vector3(maxX, H / 2, 0), { cast: false });
  right.rotation.y = Math.PI / 2;
  const ceil = MeshBuilder.CreatePlane("ceiling", { width: W, height: D }, scene);
  put(ceil, mat("ceil", "#f7f1e6"), new Vector3(0, H, 0), { cast: false });
  ceil.rotation.x = -Math.PI / 2;
  // skirting boards
  const skirt = mat("skirt", "#7a5a3a");
  put(box("skirtB", W, 0.12, 0.03, 0), skirt, new Vector3(0, 0.06, minZ + 0.015), { cast: false });
  put(box("skirtL", 0.03, 0.12, D, 0), skirt, new Vector3(minX + 0.015, 0.06, 0), { cast: false });
  put(box("skirtR", 0.03, 0.12, D, 0), skirt, new Vector3(maxX - 0.015, 0.06, 0), { cast: false });

  // Front wall: door in the middle, big windows either side, street outside.
  const frontMat = mat("front", "#3b3028", { spec: 0.2 });
  const doorW = 1.5;
  const winH = 2.1;
  for (const side of [-1, 1]) {
    const segW = (W - doorW) / 2;
    const cx = side * (doorW / 2 + segW / 2);
    put(box(`sill${side}`, segW, 0.55, 0.25, 0.01), frontMat, new Vector3(cx, 0.275, maxZ));
    put(box(`lintel${side}`, segW, H - 0.55 - winH, 0.25, 0.01), frontMat, new Vector3(cx, 0.55 + winH + (H - 0.55 - winH) / 2, maxZ), { cast: false });
    for (const f of [0, 0.5, 1]) put(box(`mull${side}${f}`, 0.08, winH, 0.2, 0.01), frontMat, new Vector3(cx - segW / 2 + 0.04 + f * (segW - 0.08), 0.55 + winH / 2, maxZ), { cast: false });
    const glass = MeshBuilder.CreatePlane(`glass${side}`, { width: segW, height: winH }, scene);
    put(glass, mat("glass", "#cfe8ff", { alpha: 0.12, spec: 0.9 }), new Vector3(cx, 0.55 + winH / 2, maxZ), { cast: false });
  }
  put(box("doorTop", doorW, H - 2.3, 0.25, 0.01), frontMat, new Vector3(0, 2.3 + (H - 2.3) / 2, maxZ), { cast: false });
  for (const side of [-1, 1]) put(box(`doorPost${side}`, 0.08, 2.3, 0.25, 0.01), frontMat, new Vector3((side * doorW) / 2, 1.15, maxZ), { cast: false });
  const doorGlass = MeshBuilder.CreatePlane("doorGlass", { width: doorW - 0.16, height: 2.2 }, scene);
  put(doorGlass, mat("glass", "#cfe8ff", { alpha: 0.12 }), new Vector3(0, 1.12, maxZ + 0.02), { cast: false });
  const street = MeshBuilder.CreatePlane("street", { width: 26, height: 13 }, scene);
  const streetMat = mat("street", "#ffffff", { tex: streetView(scene) });
  streetMat.emissiveColor = new Color3(0.85, 0.85, 0.85);
  streetMat.disableLighting = true;
  put(street, streetMat, new Vector3(0, 3.5, maxZ + 9), { cast: false });
  street.rotation.y = Math.PI;
  const sidewalk = MeshBuilder.CreateGround("sidewalk", { width: 26, height: 9 }, scene);
  put(sidewalk, mat("sidewalk", "#b9b4ab"), new Vector3(0, -0.01, maxZ + 4.5), { cast: false });
  // walls block movement
  obstacles.push({ minX: -100, maxX: minX + 0.2, minZ: -100, maxZ: 100 }, { minX: maxX - 0.2, maxX: 100, minZ: -100, maxZ: 100 }, { minX: -100, maxX: 100, minZ: -100, maxZ: minZ + 0.2 });
  obstacles.push({ minX: -100, maxX: -doorW / 2, minZ: maxZ - 0.2, maxZ: 100 }, { minX: doorW / 2, maxX: 100, minZ: maxZ - 0.2, maxZ: 100 });
  obstacles.push({ minX: -100, maxX: 100, minZ: maxZ + 1.2, maxZ: 100 }); // don't wander down the street
  const rug = roundedBox("rug", { w: 2.2, h: 0.02, d: 1.3, r: 0.01, seg: 2 }, scene);
  put(rug, mat("rug", "#c0392b"), new Vector3(0, 0.01, maxZ - 0.9), { cast: false });
  const rugIn = roundedBox("rugIn", { w: 1.9, h: 0.022, d: 1.0, r: 0.01, seg: 2 }, scene);
  put(rugIn, mat("rugIn", "#f2d7a6"), new Vector3(0, 0.012, maxZ - 0.9), { cast: false });

  // Ceiling light panels
  for (const [x, z] of [[-3, -1.5], [2, -1.5], [-3, 2], [2, 2]]) {
    const p = roundedBox("lightPanel", { w: 1.4, h: 0.05, d: 0.5, r: 0.02, seg: 2 }, scene);
    put(p, mat("lightPanel", "#ffffff", { emissive: "#fff6e0" }), new Vector3(x, H - 0.03, z), { cast: false });
  }

  // ---------- Workbench (back-left) ----------
  const bx = -3.4;
  const bz = minZ + 0.6;
  const wood = mat("benchWood", "#b5804e", { spec: 0.1 });
  const metal = mat("metal", "#5b5f66", { spec: 0.5 });
  put(box("benchTop", 2.8, 0.06, 1.0, 0.02), wood, new Vector3(bx, 0.9, bz));
  for (const [lx, lz] of [[-1.3, -0.4], [1.3, -0.4], [-1.3, 0.4], [1.3, 0.4]]) put(box("benchLeg", 0.07, 0.88, 0.07, 0.01), metal, new Vector3(bx + lx, 0.44, bz + lz));
  put(box("benchShelf", 2.7, 0.03, 0.9, 0.01), wood, new Vector3(bx, 0.25, bz));
  const matMesh = roundedBox("cutMat", { w: 1.1, h: 0.006, d: 0.62, r: 0.004, seg: 2 }, scene);
  put(matMesh, mat("cutMat", "#ffffff", { tex: cuttingMat(scene), spec: 0.05 }), new Vector3(bx, 0.933, bz + 0.06), { cast: false });
  const benchAnchor = new TransformNode("benchAnchor", scene);
  benchAnchor.position = new Vector3(bx, 0.936 + 0.008, bz + 0.08);
  solid(bx, bz, 2.9, 1.1);
  // Pegboard + tools above the bench
  const peg = MeshBuilder.CreatePlane("peg", { width: 2.6, height: 1.1 }, scene);
  put(peg, mat("peg", "#ffffff", { tex: pegboard(scene), uv: [2.6, 1.1] }), new Vector3(bx, 1.75, minZ + 0.02), { cast: false });
  peg.rotation.y = Math.PI;
  ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71", "#9b59b6", "#e67e22"].forEach((c, i) => {
    const handle = MeshBuilder.CreateCapsule("tool", { radius: 0.022, height: 0.2, tessellation: 10 }, scene);
    put(handle, mat(`tool${i}`, c, { spec: 0.3 }), new Vector3(bx - 1.0 + i * 0.4, 1.9, minZ + 0.06));
    const tip = MeshBuilder.CreateCylinder("tip", { diameter: 0.01, height: 0.18 }, scene);
    put(tip, mat("steel", "#c9c9c9", { spec: 0.9 }), new Vector3(bx - 1.0 + i * 0.4, 1.71, minZ + 0.06), { cast: false });
  });
  // Lamp
  const lampMat = mat("lamp", "#f26b3a", { spec: 0.3 });
  put(MeshBuilder.CreateCylinder("lampBase", { diameter: 0.22, height: 0.04 }, scene), lampMat, new Vector3(bx - 1.15, 0.95, bz - 0.25));
  const arm = MeshBuilder.CreateCylinder("lampArm", { diameter: 0.025, height: 0.7 }, scene);
  put(arm, lampMat, new Vector3(bx - 1.1, 1.28, bz - 0.2));
  arm.rotation.z = -0.2;
  const shade = MeshBuilder.CreateCylinder("shade", { diameterTop: 0.06, diameterBottom: 0.26, height: 0.18, tessellation: 24 }, scene);
  put(shade, lampMat, new Vector3(bx - 0.9, 1.6, bz - 0.05));
  shade.rotation.z = 0.7;
  // Monitor
  const monitor = box("monitor", 0.75, 0.46, 0.04, 0.02);
  put(monitor, mat("monitorBody", "#202226", { spec: 0.4 }), new Vector3(bx + 0.95, 1.32, bz - 0.28));
  monitor.rotation.y = 0.25;
  const monitorScreen = MeshBuilder.CreatePlane("monitorScreen", { width: 0.69, height: 0.4 }, scene);
  put(monitorScreen, mat("screen", "#17324a", { emissive: "#1d4f7a" }), new Vector3(bx + 0.95 - 0.022 * Math.sin(0.25), 1.32, bz - 0.28 + 0.022 * Math.cos(0.25)), { cast: false });
  monitorScreen.rotation.y = 0.25 + Math.PI;
  put(box("monStand", 0.06, 0.38, 0.06, 0.01), metal, new Vector3(bx + 0.97, 1.11, bz - 0.33));
  // Jars of switches + a stool
  ["#e23b3b", "#8b5a2b", "#2f6fe0", "#f2c230"].forEach((c, i) => {
    put(MeshBuilder.CreateCylinder("jar", { diameter: 0.11, height: 0.14 }, scene), mat("jarGlass", "#ffffff", { alpha: 0.35, spec: 0.8 }), new Vector3(bx + 0.55 + (i % 2) * 0.13, 1.0, bz - 0.32 + Math.floor(i / 2) * 0.13), { cast: false });
    put(MeshBuilder.CreateCylinder("jarFill", { diameter: 0.1, height: 0.08 }, scene), mat(`jar${i}`, c), new Vector3(bx + 0.55 + (i % 2) * 0.13, 0.975, bz - 0.32 + Math.floor(i / 2) * 0.13), { cast: false });
  });
  put(MeshBuilder.CreateCylinder("stoolTop", { diameter: 0.42, height: 0.06 }, scene), mat("stool", "#2d6a4f"), new Vector3(bx + 0.9, 0.62, bz + 0.85));
  put(MeshBuilder.CreateCylinder("stoolLeg", { diameter: 0.06, height: 0.6 }, scene), metal, new Vector3(bx + 0.9, 0.3, bz + 0.85));
  solid(bx + 0.9, bz + 0.85, 0.45, 0.45);

  // ---------- Shelves (back wall, right of the bench) ----------
  const sx = 1.6;
  const sz = minZ + 0.28;
  const shelfMat = mat("shelf", "#f5efe3", { spec: 0.08 });
  for (let i = 0; i < 4; i++) put(box("shelfBoard", 3.6, 0.04, 0.42, 0.01), shelfMat, new Vector3(sx, 0.35 + i * 0.55, sz));
  for (const x of [-1.8, 0, 1.8]) put(box("shelfSide", 0.04, 2.0, 0.42, 0.01), shelfMat, new Vector3(sx + x, 1.0, sz));
  solid(sx, sz, 3.7, 0.5);
  const boxColors = ["#ff7a45", "#2f6fe0", "#f2c230", "#2ea05a", "#e84393", "#8e44ad", "#1b1b1d", "#f5f1e8"];
  let k = 0;
  for (let i = 0; i < 4; i++) {
    let x = sx - 1.7;
    while (x < sx + 1.6) {
      const w = 0.22 + ((k * 37) % 10) / 40;
      const h = 0.16 + ((k * 53) % 10) / 40;
      if (i === 3 && k % 3 === 0) {
        put(MeshBuilder.CreateCylinder("jar", { diameter: 0.14, height: 0.2 }, scene), mat("jarGlass", "#ffffff"), new Vector3(x + 0.08, 0.37 + i * 0.55 + 0.1, sz), { cast: false });
        put(MeshBuilder.CreateCylinder("jarFill", { diameter: 0.13, height: 0.12 }, scene), mat(`box${k % boxColors.length}`, boxColors[k % boxColors.length]), new Vector3(x + 0.08, 0.37 + i * 0.55 + 0.06, sz), { cast: false });
        x += 0.2;
      } else {
        put(box("product", w, h, 0.3, 0.01), mat(`box${k % boxColors.length}`, boxColors[k % boxColors.length], { spec: 0.15 }), new Vector3(x + w / 2, 0.37 + i * 0.55 + h / 2, sz));
        x += w + 0.05;
      }
      k++;
    }
  }
  // Neon store sign above the shelves
  let signTex: DynamicTexture | null = null;
  const sign = MeshBuilder.CreatePlane("storeSign", { width: 4.2, height: 0.66 }, scene);
  const signMat = new StandardMaterial("signMat", scene);
  signMat.disableLighting = true;
  signMat.useAlphaFromDiffuseTexture = true;
  sign.material = signMat;
  sign.position = new Vector3(sx, 2.72, minZ + 0.03);
  sign.rotation.y = Math.PI;
  sign.isPickable = false;
  const setSign = (text: string) => {
    signTex = signTexture(scene, text, "#ff7ab8", signTex ?? undefined);
    signMat.diffuseTexture = signTex;
    signMat.emissiveTexture = signTex;
    signMat.opacityTexture = signTex;
  };

  // ---------- Counter + register (right, near the front) ----------
  const cx = 3.9;
  const cz = 1.3;
  const counterMat = mat("counter", "#2d6a4f", { spec: 0.1 });
  const topMat = mat("counterTop", "#e9dcc7", { spec: 0.2 });
  put(box("counterBody", 0.7, 1.0, 2.6, 0.03), counterMat, new Vector3(cx, 0.5, cz));
  put(box("counterTop", 0.85, 0.06, 2.75, 0.02), topMat, new Vector3(cx, 1.03, cz));
  solid(cx, cz, 0.9, 2.8);
  const register = box("register", 0.42, 0.22, 0.36, 0.03);
  put(register, mat("registerBody", "#3b3f45", { spec: 0.3 }), new Vector3(cx + 0.05, 1.17, cz - 0.6));
  const regScreen = box("regScreen", 0.3, 0.18, 0.03, 0.01);
  put(regScreen, mat("regScreen", "#17324a", { emissive: "#2a6a9a" }), new Vector3(cx - 0.05, 1.36, cz - 0.6));
  regScreen.rotation.y = Math.PI / 2;
  // little display keyboard + bell on the counter
  put(MeshBuilder.CreateSphere("bell", { diameter: 0.1, slice: 0.5 }, scene), mat("bell", "#d9b45b", { spec: 0.8 }), new Vector3(cx - 0.15, 1.06, cz + 0.7));
  const customerSpot = new Vector3(cx - 1.05, 0, cz - 0.2);

  // ---------- Job board (cork) on the right wall ----------
  const jx = maxX - 0.03;
  const jz = -2.1;
  const corkMesh = MeshBuilder.CreatePlane("jobCork", { width: 1.5, height: 1.0 }, scene);
  put(corkMesh, mat("cork", "#ffffff", { tex: cork(scene) }), new Vector3(jx, 1.55, jz), { cast: false });
  corkMesh.rotation.y = Math.PI / 2;
  const frameMat = mat("frame", "#6b4a33");
  put(box("corkFrameT", 0.05, 0.06, 1.6, 0.01), frameMat, new Vector3(jx, 2.08, jz), { cast: false });
  put(box("corkFrameB", 0.05, 0.06, 1.6, 0.01), frameMat, new Vector3(jx, 1.02, jz), { cast: false });
  const tickets: Mesh[] = [corkMesh];
  ["#fff6c9", "#ffd9e6", "#d9f2ff"].forEach((c, i) => {
    const t = MeshBuilder.CreatePlane("ticket", { width: 0.32, height: 0.42 }, scene);
    put(t, mat(`ticket${i}`, c), new Vector3(jx - 0.01, 1.58 + (i % 2) * 0.08, jz - 0.45 + i * 0.45), { cast: false });
    t.rotation.y = Math.PI / 2;
    t.rotation.z = (i - 1) * 0.08;
    tickets.push(t);
    put(MeshBuilder.CreateSphere("pin", { diameter: 0.035 }, scene), mat("pin", "#e23b4e", { spec: 0.6 }), new Vector3(jx - 0.025, 1.76 + (i % 2) * 0.08, jz - 0.45 + i * 0.45), { cast: false });
  });

  // ---------- Mirror (left wall) ----------
  const mz = 0.6;
  const mirrorFrame = box("mirrorFrame", 0.06, 1.9, 0.8, 0.03);
  put(mirrorFrame, mat("mirrorFrame", "#d9b45b", { spec: 0.6 }), new Vector3(minX + 0.04, 1.15, mz), { cast: false });
  const mirror = MeshBuilder.CreatePlane("mirror", { width: 0.68, height: 1.78 }, scene);
  put(mirror, mat("mirrorGlass", "#c9dbe6", { spec: 1, emissive: "#2a3a44" }), new Vector3(minX + 0.075, 1.15, mz), { cast: false });
  mirror.rotation.y = -Math.PI / 2;

  // ---------- Display table with keyboards (center-left) ----------
  const tx = -1.2;
  const tz = 1.2;
  put(box("tableTop", 2.0, 0.06, 1.0, 0.02), mat("table", "#f5efe3", { spec: 0.1 }), new Vector3(tx, 0.82, tz));
  for (const [lx, lz] of [[-0.9, -0.42], [0.9, -0.42], [-0.9, 0.42], [0.9, 0.42]]) put(box("tableLeg", 0.06, 0.8, 0.06, 0.01), metal, new Vector3(tx + lx, 0.4, tz + lz));
  solid(tx, tz, 2.1, 1.1);
  const displayAnchors = [-0.6, 0.55].map((dx, i) => {
    const a = new TransformNode(`display${i}`, scene);
    a.position = new Vector3(tx + dx, 0.86, tz + (i ? 0.05 : -0.05));
    a.rotation.y = (i ? -0.15 : 0.12) + Math.PI;
    return a;
  });
  // price tags
  displayAnchors.forEach((a, i) => {
    const tag = box("tag", 0.14, 0.08, 0.01, 0.005);
    put(tag, mat("tag", "#ffd24a", { emissive: "#332200" }), new Vector3(a.position.x, 0.88, tz + 0.45), { cast: false });
    tag.rotation.x = -0.6 + i * 0;
  });

  // ---------- Posters, plants, boxes ----------
  const posters: [string, string, string, string[], string, number][] = [
    ["p1", "#ff7a45", "#fffaf2", ["THOCK", "LIFE"], "lube responsibly", -2.6],
    ["p2", "#2d6fd6", "#fffaf2", ["CLACK", "ATTACK"], "no membranes allowed", 2.6],
  ];
  for (const [name, bg, fg, lines, sub, z] of posters) {
    const pm = MeshBuilder.CreatePlane(name, { width: 0.8, height: 1.12 }, scene);
    put(pm, mat(name, "#ffffff", { tex: poster(scene, name, bg, fg, lines, sub) }), new Vector3(minX + 0.02, 1.65, z), { cast: false });
    pm.rotation.y = -Math.PI / 2;
  }
  const plant = (x: number, z: number, s = 1) => {
    put(MeshBuilder.CreateCylinder("pot", { diameterTop: 0.42 * s, diameterBottom: 0.32 * s, height: 0.4 * s }, scene), mat("pot", "#c96f4a"), new Vector3(x, 0.2 * s, z));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const leaf = MeshBuilder.CreateSphere("leaf", { diameter: 0.28 * s, segments: 8 }, scene);
      put(leaf, mat("leaf", "#4f9a57", { spec: 0.15 }), new Vector3(x + Math.cos(a) * 0.12 * s, 0.55 * s + (i % 3) * 0.12 * s, z + Math.sin(a) * 0.12 * s));
      leaf.scaling = new Vector3(0.45, 1.5, 0.3);
      leaf.rotation = new Vector3(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
    }
    solid(x, z, 0.45 * s, 0.45 * s);
  };
  plant(minX + 0.45, maxZ - 0.5, 1.2);
  plant(maxX - 0.45, maxZ - 0.5, 1.1);
  plant(maxX - 0.45, minZ + 0.5, 1.3);
  for (let i = 0; i < 3; i++) {
    const c = box("cardboard", 0.5, 0.35, 0.4, 0.01);
    put(c, mat("cardboard", "#c49a6c", { spec: 0.05 }), new Vector3(maxX - 0.6, 0.175 + i * 0.35, 2.9 - (i % 2) * 0.05));
    c.rotation.y = i * 0.2;
  }
  solid(maxX - 0.6, 2.9, 0.6, 0.6);

  // Merge static props that share a material into one mesh each (hundreds of draw calls → a few dozen).
  // Interactables, the sign and screens stay separate (they get outlined or change at runtime).
  const keep = new Set<Mesh>([matMesh, mirrorFrame, register, monitorScreen, ...tickets]);
  const groups = new Map<string, { m: Mesh; cast: boolean }[]>();
  for (const e of statics) {
    if (keep.has(e.m) || e.m.parent) {
      e.m.freezeWorldMatrix();
      if (e.cast) shadows?.addShadowCaster(e.m);
      continue;
    }
    const key = `${e.m.material!.name}|${e.cast}`;
    const g = groups.get(key) ?? [];
    g.push(e);
    groups.set(key, g);
  }
  for (const [key, g] of groups) {
    const merged = g.length > 1 ? Mesh.MergeMeshes(g.map((e) => e.m), true, true) : g[0].m;
    if (!merged) continue;
    merged.name = `static:${key}`;
    merged.receiveShadows = true;
    merged.isPickable = false;
    merged.freezeWorldMatrix();
    if (g[0].cast) shadows?.addShadowCaster(merged);
  }

  const interactables: Interactable[] = [
    { id: "bench", spot: new Vector3(bx, 0, bz + 1.05), radius: 1.3, highlight: [matMesh] },
    { id: "jobs", spot: new Vector3(jx - 1.0, 0, jz), radius: 1.4, highlight: tickets },
    { id: "mirror", spot: new Vector3(minX + 1.0, 0, mz), radius: 1.2, highlight: [mirrorFrame] },
    { id: "register", spot: new Vector3(cx - 0.95, 0, cz - 0.6), radius: 1.0, highlight: [register] },
  ];

  return {
    obstacles,
    interactables,
    benchAnchor,
    benchStand: new Vector3(bx, 0, bz + 0.95),
    customerSpot,
    door: new Vector3(0, 0, maxZ + 0.8),
    setSign,
    displayAnchors,
    monitorScreen,
  };
}
