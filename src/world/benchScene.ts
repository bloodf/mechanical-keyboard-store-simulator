/**
 * First-person workbench. The keyboard is assembled on a cutting mat; the camera frames it
 * per step (overview / top-down / low "listening" angle) and adapts to portrait screens.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { BoardModel } from "./boardModel";
import type { SceneController } from "./stage";
import type { LayoutId } from "../data/layouts";

export type BenchView = "overview" | "top" | "low" | "idle";

const BOARD_SCALE = 0.1;

function matTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2f6e57";
  g.fillRect(0, 0, 1024, 1024);
  g.strokeStyle = "rgba(255,255,255,0.18)";
  g.lineWidth = 1;
  for (let i = 0; i <= 1024; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 1024);
    g.moveTo(0, i);
    g.lineTo(1024, i);
    g.stroke();
  }
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.lineWidth = 2;
  for (let i = 0; i <= 1024; i += 160) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 1024);
    g.moveTo(0, i);
    g.lineTo(1024, i);
    g.stroke();
  }
  g.fillStyle = "rgba(255,255,255,0.4)";
  g.font = "bold 22px monospace";
  g.fillText("MKSS CUTTING MAT · 45° · 60° · THOCK", 24, 1000);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class BenchScene implements SceneController {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
  maxFps = 60;
  idleFps = 20;
  board: BoardModel | null = null;
  private boardHolder = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private view: BenchView = "idle";
  private camPos = new THREE.Vector3(0, 3, 3);
  private camLook = new THREE.Vector3();
  private wantPos = new THREE.Vector3(0, 3, 3);
  private wantLook = new THREE.Vector3();
  private aspect = 1;
  private screen = { w: 1, h: 1 };
  private insets = { left: 0, top: 0, bottom: 0 };
  private parallax = new THREE.Vector2();
  private parallaxTarget = new THREE.Vector2();
  private moving = 0;
  private lamp: THREE.SpotLight;
  readonly raycaster = new THREE.Raycaster();

  constructor(renderer: THREE.WebGLRenderer) {
    const s = this.scene;
    s.background = new THREE.Color("#e9dcc8");
    s.fog = new THREE.Fog("#e9dcc8", 7, 16);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environment = env;
    s.environmentIntensity = 0.5;
    this.disposables.push(env, pmrem);

    s.add(new THREE.HemisphereLight("#fff4e6", "#7d6c5a", 0.55));
    const sun = new THREE.DirectionalLight("#fff1dc", 1.6);
    sun.position.set(2.5, 6, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
    sun.shadow.bias = -0.0004;
    s.add(sun);
    this.lamp = new THREE.SpotLight("#ffe2b8", 14, 8, 0.7, 0.6, 1.2);
    this.lamp.position.set(-1.8, 3.2, -0.8);
    this.lamp.target.position.set(0, 0, 0.2);
    s.add(this.lamp, this.lamp.target);

    // Desk + mat
    const desk = new THREE.Mesh(this.geo(new RoundedBoxGeometry(7, 0.12, 3.6, 3, 0.03)), this.mat({ color: "#b5804e", roughness: 0.7 }));
    desk.position.y = -0.06;
    desk.receiveShadow = true;
    s.add(desk);
    const matTex = matTexture();
    this.disposables.push(matTex);
    const cutMat = new THREE.Mesh(this.geo(new RoundedBoxGeometry(4.2, 0.012, 2.4, 2, 0.005)), this.mat({ map: matTex, roughness: 0.9 }));
    cutMat.position.set(0, 0.006, 0.2);
    cutMat.receiveShadow = true;
    s.add(cutMat);
    const wall = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(14, 7)), this.mat({ color: "#e6d6bf", roughness: 0.95 }));
    wall.position.set(0, 2.5, -1.8);
    s.add(wall);

    this.addProps();
    this.boardHolder.scale.setScalar(BOARD_SCALE);
    this.boardHolder.position.set(0, 0.055, 0.25);
    s.add(this.boardHolder);
    this.setView("idle", true);
  }

  private mat(p: THREE.MeshStandardMaterialParameters) {
    const m = new THREE.MeshStandardMaterial(p);
    this.disposables.push(m);
    return m;
  }
  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.disposables.push(g);
    return g;
  }

  private addProps() {
    const s = this.scene;
    // Pegboard with tools
    const peg = new THREE.Mesh(this.geo(new THREE.BoxGeometry(3.2, 1.3, 0.03)), this.mat({ color: "#d4b485", roughness: 0.9 }));
    peg.position.set(0.4, 1.5, -1.77);
    s.add(peg);
    const holeMat = this.mat({ color: "#8d7350" });
    const holeGeo = this.geo(new THREE.CircleGeometry(0.012, 8));
    for (let x = -1.4; x <= 1.4; x += 0.12)
      for (let y = -0.55; y <= 0.55; y += 0.12) {
        const h = new THREE.Mesh(holeGeo, holeMat);
        h.position.set(0.4 + x, 1.5 + y, -1.754);
        s.add(h);
      }
    ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71", "#9b59b6"].forEach((c, i) => {
      const handle = new THREE.Mesh(this.geo(new THREE.CapsuleGeometry(0.035, 0.26, 4, 10)), this.mat({ color: c, roughness: 0.45 }));
      handle.position.set(-0.7 + i * 0.5, 1.75, -1.72);
      handle.castShadow = true;
      s.add(handle);
      const tip = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.008, 0.008, 0.24)), this.mat({ color: "#c9c9c9", metalness: 0.9, roughness: 0.3 }));
      tip.position.set(-0.7 + i * 0.5, 1.48, -1.72);
      s.add(tip);
    });
    // Switch jars on the left
    ["#e23b3b", "#8b5a2b", "#2f6fe0", "#f2c230"].forEach((c, i) => {
      const jar = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.13, 0.13, 0.26, 24)), this.mat({ color: "#ffffff", transparent: true, opacity: 0.3, roughness: 0.05 }));
      jar.position.set(-2.9 + (i % 2) * 0.32, 0.13, -0.9 + Math.floor(i / 2) * 0.34);
      s.add(jar);
      const fill = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.12, 0.12, 0.15, 24)), this.mat({ color: c, roughness: 0.6 }));
      fill.position.set(jar.position.x, 0.08, jar.position.z);
      s.add(fill);
    });
    // Desk lamp
    const lampMat = this.mat({ color: "#f26b3a", roughness: 0.4, metalness: 0.2 });
    const base = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 24)), lampMat);
    base.position.set(-2.3, 0.03, -1.1);
    s.add(base);
    const arm1 = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.025, 0.025, 1.4)), lampMat);
    arm1.position.set(-2.2, 0.7, -1.15);
    arm1.rotation.z = -0.25;
    s.add(arm1);
    const arm2 = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.025, 0.025, 1.0)), lampMat);
    arm2.position.set(-1.85, 1.45, -0.95);
    arm2.rotation.set(0.4, 0, -1.1);
    s.add(arm2);
    const shade = new THREE.Mesh(this.geo(new THREE.ConeGeometry(0.22, 0.3, 24, 1, true)), this.mat({ color: "#f26b3a", side: THREE.DoubleSide, roughness: 0.4 }));
    shade.position.set(-1.45, 1.6, -0.8);
    shade.rotation.z = 0.6;
    s.add(shade);
    const bulb = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.07, 16, 8)), new THREE.MeshBasicMaterial({ color: "#fff3d6" }));
    bulb.position.set(-1.5, 1.52, -0.8);
    s.add(bulb);
    // Monitor (off to the right, shows the shop logo)
    const mon = new THREE.Mesh(this.geo(new RoundedBoxGeometry(1.5, 0.9, 0.06, 2, 0.03)), this.mat({ color: "#202226", roughness: 0.4 }));
    mon.position.set(2.4, 1.0, -1.3);
    mon.rotation.y = -0.35;
    s.add(mon);
    const screen = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(1.38, 0.78)), this.mat({ color: "#17324a", emissive: "#1d4f7a", emissiveIntensity: 0.6 }));
    screen.position.set(2.4, 1.0, -1.265);
    screen.rotation.y = -0.35;
    s.add(screen);
    const stand = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.08, 0.55, 0.08)), this.mat({ color: "#2a2c30" }));
    stand.position.set(2.45, 0.3, -1.4);
    s.add(stand);
    // Switch tester board (right)
    const tester = new THREE.Mesh(this.geo(new RoundedBoxGeometry(0.7, 0.08, 0.4, 2, 0.02)), this.mat({ color: "#3a3f47", roughness: 0.5 }));
    tester.position.set(2.6, 0.04, 0.4);
    tester.rotation.y = 0.2;
    s.add(tester);
    for (let i = 0; i < 8; i++) {
      const cap = new THREE.Mesh(this.geo(new RoundedBoxGeometry(0.13, 0.09, 0.13, 2, 0.02)), this.mat({ color: ["#ffd1dc", "#c9f2e3", "#fff1b8", "#d7d0ff"][i % 4], roughness: 0.6 }));
      cap.position.set(2.6 - 0.25 + (i % 4) * 0.16, 0.13, 0.4 - 0.08 + Math.floor(i / 4) * 0.16);
      s.add(cap);
    }
  }

  /** Replace the board being worked on (null = empty mat). */
  setBoard(layout: LayoutId | null): BoardModel | null {
    if (this.board) {
      this.boardHolder.remove(this.board.group);
      this.board.dispose();
      this.board = null;
    }
    if (layout) {
      this.board = new BoardModel(layout);
      this.boardHolder.add(this.board.group);
    }
    this.setView(this.view, false);
    return this.board;
  }

  /**
   * Screen areas covered by UI (px). The camera shifts its projection so the board is centered
   * in the free area, and frames it to fit that area.
   */
  setInsets(left: number, top: number, bottom: number) {
    const changed = Math.abs(left - this.insets.left) + Math.abs(top - this.insets.top) + Math.abs(bottom - this.insets.bottom) > 4;
    this.insets = { left, top, bottom };
    if (changed) {
      this.applyViewOffset();
      this.setView(this.view, false);
    }
  }

  private applyViewOffset() {
    const { w, h } = this.screen;
    const { left, top, bottom } = this.insets;
    this.camera.setViewOffset(w, h, -left / 2, (bottom - top) / 2, w, h);
    this.camera.updateProjectionMatrix();
  }

  setView(v: BenchView, instant = false) {
    this.view = v;
    const w = (this.board?.outerWidth ?? 16) * BOARD_SCALE;
    const d = (this.board?.outerDepth ?? 6) * BOARD_SCALE;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.aspect);
    const freeW = Math.max(0.3, (this.screen.w - this.insets.left) / this.screen.w);
    const freeH = Math.max(0.25, (this.screen.h - this.insets.top - this.insets.bottom) / this.screen.h);
    // Distance so the board fills ~90% of the free width and fits the free height.
    const fitW = (w / 2 / Math.tan(hfov / 2)) * 1.1 / freeW;
    const fitD = (d / 2 / Math.tan(vfov / 2)) * 1.35 / freeH;
    const dist = Math.max(fitW, fitD, 1.0);
    const c = this.boardHolder.position;
    const lookOffsetZ = 0;
    switch (v) {
      case "top":
        this.wantLook.set(c.x, 0.08, c.z + lookOffsetZ);
        this.wantPos.set(c.x, dist * 0.96, c.z + lookOffsetZ + dist * 0.28);
        break;
      case "low":
        this.wantLook.set(c.x, 0.1, c.z + lookOffsetZ * 0.6);
        this.wantPos.set(c.x, dist * 0.45, c.z + dist * 0.85);
        break;
      case "idle":
        this.wantLook.set(c.x, 0.3, c.z - 0.2);
        this.wantPos.set(c.x + 0.2, 2.4, c.z + 3.4);
        break;
      default:
        this.wantLook.set(c.x, 0.08, c.z + lookOffsetZ);
        this.wantPos.set(c.x, dist * 0.78, c.z + lookOffsetZ + dist * 0.62);
    }
    if (instant) {
      this.camPos.copy(this.wantPos);
      this.camLook.copy(this.wantLook);
    }
    this.moving = 1.5;
  }

  resize(w: number, h: number) {
    this.aspect = w / h;
    this.screen = { w, h };
    this.camera.fov = this.aspect < 1 ? 50 : 38;
    this.applyViewOffset();
    this.setView(this.view, true);
  }

  /** Pointer in normalized device coordinates → key under it. */
  pickKey(ndc: THREE.Vector2): number | null {
    if (!this.board) return null;
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.board.pickKey(this.raycaster);
  }

  /** Screen position (CSS px) of a key's top (used by automated tests). */
  keyScreen(id: number): { x: number; y: number } | null {
    const b = this.board;
    if (!b) return null;
    const k = b.layout.keys[id];
    const [x, z] = b.keyXZ(k);
    const v = b.group.localToWorld(new THREE.Vector3(x, 1.1, z)).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.screen.w, y: ((1 - v.y) / 2) * this.screen.h };
  }

  setParallax(nx: number, ny: number) {
    this.parallaxTarget.set(nx, ny);
  }

  /** Set while a 2D canvas minigame runs, so the 3D view idles and the minigame stays smooth. */
  minigame2D = false;
  forceIdle(): boolean {
    return this.minigame2D;
  }

  /** Lets the stage drop to idleFps when nothing is happening. */
  isBusy(): boolean {
    return this.moving > 0 || !!this.board?.animating;
  }

  update(dt: number) {
    const k = 1 - Math.exp(-dt * 5);
    this.camPos.lerp(this.wantPos, k);
    this.camLook.lerp(this.wantLook, k);
    this.parallax.lerp(this.parallaxTarget, 1 - Math.exp(-dt * 3));
    if (this.moving > 0) this.moving -= dt;
    this.camera.position.copy(this.camPos);
    // Subtle mouse parallax, off in precision views (you're aiming at keys there).
    const pk = this.view === "top" ? 0 : this.view === "low" ? 0.5 : 1;
    this.camera.position.x += this.parallax.x * 0.08 * pk;
    this.camera.position.y += this.parallax.y * 0.05 * pk;
    this.camera.lookAt(this.camLook);
    this.board?.update(dt);
  }

  dispose() {
    this.board?.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
