/**
 * The shop: one Babylon scene used for the title (attract camera), walking around (third person),
 * the workbench (first person) and the avatar editor. Owns lighting, post-processing, the player,
 * customers, interactables and the in-canvas UI (Ui).
 */
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  GlowLayer,
  HemisphericLight,
  HighlightLayer,
  ImageProcessingConfiguration,
  KeyboardEventTypes,
  Matrix,
  PointLight,
  Ray,
  Scene,
  ShadowGenerator,
  SpotLight,
  Vector3,
  type Mesh,
} from "@babylonjs/core";
import type { AvatarParams } from "../../data/avatar";
import type { GameApp, GameScene, Quality } from "../app";
import { Human, type Action, type Expression } from "../human/human";
import { PlayerController, type MoveInput } from "./player";
import { buildStore, ROOM, type InteractId, type StoreLayout } from "./storeBuilder";
import { Ui } from "../../gui/ui";

export type StoreMode = "attract" | "play" | "bench" | "editor";
export type BenchView = "overview" | "top" | "low";
export interface BenchFocus {
  target: Vector3;
  w: number;
  d: number;
  beta: number;
}

interface Walker {
  human: Human;
  path: Vector3[];
  onArrive?: () => void;
  speed: number;
}

export class StoreScene implements GameScene {
  readonly scene: Scene;
  readonly ui: Ui;
  readonly camera: ArcRotateCamera;
  readonly layout: StoreLayout;
  readonly shadows: ShadowGenerator | null;
  maxFps = 60;
  idleFps = 24;
  mode: StoreMode = "attract";
  readonly player: Human;
  readonly controller: PlayerController;
  private pipeline: DefaultRenderingPipeline | null = null;
  private glow: GlowLayer;
  private highlight: HighlightLayer;
  private keys = new Set<string>();
  /** Joystick input from the HUD (mobile). */
  stick: MoveInput = { x: 0, y: 0, run: false };
  nearby: InteractId | null = null;
  onNearbyChange: ((id: InteractId | null) => void) | null = null;
  onInteract: ((id: InteractId) => void) | null = null;
  private walkers: Walker[] = [];
  customer: Human | null = null;
  private t = 0;
  // camera targets (smoothly approached)
  private camTarget = new Vector3(0, 1.4, 0);
  private want = { alpha: Math.PI / 2, beta: 1.15, radius: 4.2, target: new Vector3(0, 1.4, 2) };
  private benchView: BenchView | BenchFocus = "overview";
  private benchSize = { w: 0.33, d: 0.12 };
  private insets = { left: 0, top: 0, bottom: 0, right: 0 };
  private busyT = 0;

  constructor(
    private app: GameApp,
    avatar: AvatarParams,
    storeName: string,
  ) {
    const scene = (this.scene = new Scene(app.engine));
    scene.clearColor = new Color4(0.93, 0.88, 0.8, 1);
    scene.ambientColor = new Color3(0.3, 0.27, 0.24);
    scene.skipPointerMovePicking = true;

    // Lights
    const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), scene);
    hemi.intensity = 0.5;
    hemi.diffuse = Color3.FromHexString("#fff1df");
    hemi.groundColor = Color3.FromHexString("#6d5a48");
    hemi.specular = new Color3(0.1, 0.1, 0.1);
    const sun = new DirectionalLight("sun", new Vector3(-0.35, -0.85, -0.55), scene);
    sun.position = new Vector3(3, 8, 9);
    sun.intensity = 1.15;
    sun.diffuse = Color3.FromHexString("#fff0d8");
    for (const [x, z] of [[-3, -1.5], [2, -1.5], [-3, 2], [2, 2]]) {
      const p = new PointLight(`ceil${x}${z}`, new Vector3(x, 2.9, z), scene);
      p.intensity = 0.22;
      p.range = 6;
      p.diffuse = Color3.FromHexString("#ffe8c8");
      p.specular = new Color3(0.05, 0.05, 0.05);
    }
    const mirrorLight = new PointLight("mirrorLight", new Vector3(-3.2, 1.9, 0.6), scene);
    mirrorLight.intensity = 0.35;
    mirrorLight.range = 3.2;
    mirrorLight.diffuse = Color3.FromHexString("#fff4e6");
    const lamp = new SpotLight("benchLamp", new Vector3(-4.2, 1.6, -3.8), new Vector3(0.5, -1, 0.35), 1.1, 2, scene);
    lamp.intensity = 0.9;
    lamp.diffuse = Color3.FromHexString("#ffe2b8");
    lamp.range = 4;

    this.shadows = app.quality === "low" ? null : new ShadowGenerator(app.quality === "high" ? 2048 : 1024, sun);
    if (this.shadows) {
      this.shadows.usePercentageCloserFiltering = true;
      this.shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      this.shadows.bias = 0.0008;
      this.shadows.normalBias = 0.01;
      sun.shadowMinZ = 1;
      sun.shadowMaxZ = 30;
      sun.autoUpdateExtends = false;
      sun.orthoLeft = -8;
      sun.orthoRight = 8;
      sun.orthoTop = 7;
      sun.orthoBottom = -7;
    }

    this.layout = buildStore(scene, this.shadows);
    this.layout.setSign(storeName);

    this.glow = new GlowLayer("glow", scene, { mainTextureSamples: 1, blurKernelSize: 32 });
    this.glow.intensity = 0.6;
    this.highlight = new HighlightLayer("hl", scene, { blurHorizontalSize: 0.6, blurVerticalSize: 0.6 });
    this.highlight.innerGlow = false;

    // Camera
    const cam = (this.camera = new ArcRotateCamera("cam", Math.PI / 2, 1.15, 4.2, new Vector3(0, 1.4, 2), scene));
    cam.minZ = 0.03;
    cam.maxZ = 60;
    cam.fov = 0.9;
    cam.lowerRadiusLimit = 0.1;
    cam.upperRadiusLimit = 12;
    cam.wheelDeltaPercentage = 0.01;
    cam.panningSensibility = 0;
    cam.angularSensibilityX = 900;
    cam.angularSensibilityY = 900;
    cam.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
    scene.activeCamera = cam;

    this.setupPipeline(app.quality);
    app.onQualityChange.push((q) => this.setupPipeline(q));

    // Player
    this.player = new Human(scene, avatar, this.shadows, "player");
    this.controller = new PlayerController(this.player, this.layout.obstacles);
    this.controller.place(new Vector3(3.0, 0, 1.1), -Math.PI / 2);

    // Keyboard input (movement + interact)
    scene.onKeyboardObservable.add((kb) => {
      const code = kb.event.code;
      if (kb.type === KeyboardEventTypes.KEYDOWN) {
        this.keys.add(code);
        if ((code === "KeyE" || code === "Enter") && this.mode === "play" && this.nearby) this.onInteract?.(this.nearby);
      } else this.keys.delete(code);
    });
    window.addEventListener("blur", () => this.keys.clear());

    this.ui = new Ui(scene);
    this.setMode("attract", true);
  }

  private setupPipeline(q: Quality) {
    this.pipeline?.dispose();
    this.pipeline = null;
    const scene = this.scene;
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    scene.imageProcessingConfiguration.exposure = 1.15;
    scene.imageProcessingConfiguration.contrast = 1.12;
    if (q === "low") return;
    const p = new DefaultRenderingPipeline("pipe", true, scene, [this.camera]);
    p.samples = q === "high" ? 4 : 1;
    p.fxaaEnabled = q !== "high";
    p.bloomEnabled = true;
    p.bloomThreshold = 0.85;
    p.bloomWeight = 0.25;
    p.bloomKernel = 48;
    p.imageProcessingEnabled = true;
    p.imageProcessing.toneMappingEnabled = true;
    p.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    p.imageProcessing.exposure = 1.15;
    p.imageProcessing.contrast = 1.12;
    p.imageProcessing.vignetteEnabled = true;
    p.imageProcessing.vignetteWeight = 1.2;
    p.imageProcessing.vignetteColor = new Color4(0.15, 0.08, 0.02, 0);
    this.pipeline = p;
  }

  // ---------------- Modes ----------------
  setMode(mode: StoreMode, instant = false) {
    this.mode = mode;
    const canvas = this.app.canvas;
    this.camera.detachControl();
    this.player.setEnabled(mode !== "bench");
    this.setNearby(null);
    if (mode === "play") {
      if (this.controller.pos.x < -4.3) this.controller.place(new Vector3(-3.4, 0, 0.6), Math.PI / 2); // step away from the mirror
      // camera behind the player: offset direction = -(sin h, cos h) = (cos α, sin α)
      const h = this.controller.heading;
      this.want.alpha = Math.atan2(-Math.cos(h), -Math.sin(h));
      this.camera.alpha = this.want.alpha;
      this.camera.attachControl(canvas, true);
      this.camera.lowerRadiusLimit = 2.0;
      this.camera.upperRadiusLimit = 6.5;
      this.camera.lowerBetaLimit = 0.45;
      this.camera.upperBetaLimit = 1.5;
      this.want.radius = Math.min(Math.max(this.camera.radius, 3.2), 5);
      this.want.beta = 1.15;
    } else {
      this.camera.lowerRadiusLimit = 0.05;
      this.camera.upperRadiusLimit = 20;
      this.camera.lowerBetaLimit = 0.01;
      this.camera.upperBetaLimit = Math.PI - 0.01;
    }
    if (mode === "bench") {
      const s = this.layout.benchStand;
      this.controller.place(s, Math.PI);
      this.setBenchView(this.benchView);
    }
    if (mode === "editor") {
      this.controller.place(new Vector3(-4.6, 0, 0.6), Math.PI / 2); // faces the camera (+x)
      this.player.setAction("idle");
    }
    if (mode === "attract") {
      this.controller.place(new Vector3(0.6, 0, -1.7), 0.35);
      this.player.setAction("wave");
    }
    if (instant) this.snapCamera();
    this.busyT = 1.5;
  }

  private snapCamera() {
    this.updateCameraWants(0);
    this.camera.alpha = this.want.alpha;
    this.camera.beta = this.want.beta;
    this.camera.radius = this.want.radius;
    this.camTarget.copyFrom(this.want.target);
    this.camera.setTarget(this.camTarget.clone());
    this.camera.alpha = this.want.alpha;
    this.camera.beta = this.want.beta;
    this.camera.radius = this.want.radius;
  }

  /** Screen areas covered by UI panels (CSS px), so the framed subject stays visible. */
  setInsets(left: number, top: number, bottom: number, right = 0) {
    this.insets = { left, top, bottom, right };
    this.busyT = 1;
  }

  setBenchView(v: BenchView | BenchFocus, boardSize?: { w: number; d: number }) {
    this.benchView = v;
    if (boardSize) this.benchSize = boardSize;
    this.busyT = 1.5;
  }

  /** Distance that fits a w×d area in the free screen region. */
  private fitDistance(w: number, d: number) {
    const canvas = this.app.canvas;
    const W = canvas.clientWidth || 1;
    const H = canvas.clientHeight || 1;
    const freeW = Math.max(0.3, (W - this.insets.left - this.insets.right) / W);
    const freeH = Math.max(0.25, (H - this.insets.top - this.insets.bottom) / H);
    const vfov = this.camera.fov;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (W / H));
    return Math.max(((w / 2) / Math.tan(hfov / 2)) * 1.12 / freeW, ((d / 2) / Math.tan(vfov / 2)) * 1.3 / freeH);
  }

  /** Shift the look-at point so the subject appears in the middle of the free screen area. */
  private offsetTarget(base: Vector3, dist: number): Vector3 {
    const canvas = this.app.canvas;
    const W = canvas.clientWidth || 1;
    const H = canvas.clientHeight || 1;
    const cx = this.insets.left + (W - this.insets.left - this.insets.right) / 2;
    const cy = this.insets.top + (H - this.insets.top - this.insets.bottom) / 2;
    const ox = cx - W / 2;
    const oy = cy - H / 2;
    const upp = (2 * dist * Math.tan(this.camera.fov / 2)) / H;
    const a = this.want.alpha;
    const b = this.want.beta;
    const toCam = new Vector3(Math.cos(a) * Math.sin(b), Math.cos(b), Math.sin(a) * Math.sin(b));
    const fwd = toCam.scale(-1);
    const right = Vector3.Cross(Vector3.Up(), fwd).normalize();
    const up = Vector3.Cross(fwd, right).normalize();
    return base.subtract(right.scale(ox * upp)).add(up.scale(oy * upp));
  }

  private updateCameraWants(dt: number) {
    const w = this.want;
    if (this.mode === "attract") {
      const a = Math.PI / 2 + Math.sin(this.t * 0.07) * 0.45;
      w.alpha = a;
      w.beta = 1.26;
      w.radius = 4.4;
      w.target.set(0.2, 1.15, -0.9);
    } else if (this.mode === "play") {
      w.target.set(this.controller.pos.x, 1.45 * this.player.params.height, this.controller.pos.z);
    } else if (this.mode === "bench") {
      const anchor = this.layout.benchAnchor.getAbsolutePosition();
      const view = this.benchView;
      w.alpha = Math.PI / 2;
      if (typeof view === "object") {
        w.beta = view.beta;
        const dist = this.fitDistance(view.w, view.d);
        w.radius = dist;
        w.target = this.offsetTarget(view.target, dist);
      } else {
        w.beta = view === "top" ? 0.28 : view === "low" ? 1.05 : 0.72;
        // apparent (foreshortened) depth of a flat board seen at this angle
        const depth = this.benchSize.d * Math.cos(w.beta) + 0.035 * Math.sin(w.beta) + 0.03;
        const dist = this.fitDistance(this.benchSize.w + 0.04, depth);
        w.radius = dist;
        w.target = this.offsetTarget(anchor.add(new Vector3(0, 0.02, 0)), dist);
      }
    } else if (this.mode === "editor") {
      const h = this.player.params.height;
      const canvas = this.app.canvas;
      const portrait = canvas.clientHeight > canvas.clientWidth;
      w.alpha = 0.0; // camera on +x side, the avatar faces it
      w.beta = portrait ? 1.35 : 1.42;
      // portrait phones: frame head + torso only so the camera stays inside the shop
      const dist = portrait ? this.fitDistance(0.7, 0.95 * h) : this.fitDistance(1.0, 1.95 * h);
      w.radius = Math.min(dist, 4.6);
      w.target = this.offsetTarget(this.controller.pos.add(new Vector3(0, (portrait ? 1.3 : 0.95) * h, 0)), w.radius);
    }
    void dt;
  }

  /** True when the camera has reached its target view (tests wait for this before aiming). */
  cameraSettled(): boolean {
    const c = this.camera;
    return (
      Math.abs(c.alpha - this.want.alpha) < 0.003 &&
      Math.abs(c.beta - this.want.beta) < 0.003 &&
      Math.abs(c.radius - this.want.radius) < 0.003 &&
      this.camTarget.subtract(this.want.target).length() < 0.002
    );
  }

  // ---------------- Customers ----------------
  /** A customer walks in from the door to the counter. */
  spawnCustomer(avatar: AvatarParams, onArrive?: () => void) {
    this.customer?.dispose();
    const h = new Human(this.scene, avatar, this.shadows, "customer");
    const door = this.layout.door;
    h.root.position.copyFrom(door);
    this.customer = h;
    const spot = this.layout.customerSpot;
    this.walkers.push({ human: h, path: [new Vector3(0, 0, ROOM.maxZ - 1.2), new Vector3(spot.x - 0.4, 0, spot.z + 1.2), spot.clone()], speed: 1.3, onArrive: () => {
      h.root.rotation.y = Math.PI / 2; // face the counter
      onArrive?.();
    } });
  }

  /** Customer reacts, then walks out and disappears. */
  customerLeave(expression: Expression, action: Action) {
    const h = this.customer;
    if (!h) return;
    this.customer = null;
    h.setExpression(expression);
    h.setAction(action);
    setTimeout(() => {
      h.setAction("walk");
      this.walkers.push({ human: h, path: [new Vector3(0, 0, ROOM.maxZ - 1.2), this.layout.door.add(new Vector3(0, 0, 2.5))], speed: action === "angry" ? 2.2 : 1.3, onArrive: () => h.dispose() });
    }, 2200);
  }

  // ---------------- Bench helpers ----------------
  /** Ray from a screen point (CSS px). Babylon applies the hardware scaling level itself. */
  rayAt(x: number, y: number): Ray {
    return this.scene.createPickingRay(x, y, Matrix.Identity(), this.camera);
  }

  /** Project a world point to CSS px. */
  toScreen(p: Vector3): { x: number; y: number } {
    const engine = this.app.engine;
    const v = Vector3.Project(p, Matrix.Identity(), this.scene.getTransformMatrix(), this.camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
    const k = (this.app.canvas.clientWidth || 1) / engine.getRenderWidth();
    return { x: v.x * k, y: v.y * k };
  }

  setAvatar(a: AvatarParams) {
    this.player.rebuild(a);
  }

  setStoreName(name: string) {
    this.layout.setSign(name);
  }

  private setNearby(id: InteractId | null) {
    if (id === this.nearby) return;
    this.nearby = id;
    this.highlight.removeAllMeshes();
    if (id) for (const m of this.layout.interactables.find((i) => i.id === id)!.highlight) this.highlight.addMesh(m as Mesh, Color3.FromHexString("#ffb400"));
    this.onNearbyChange?.(id);
  }

  // ---------------- Frame ----------------
  isBusy() {
    return this.mode === "play" || this.mode === "attract" || this.busyT > 0 || this.walkers.length > 0;
  }

  update(dt: number) {
    this.t += dt;
    if (this.busyT > 0) this.busyT -= dt;
    if (this.mode === "play") {
      const k = this.keys;
      const input: MoveInput = {
        x: (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0) + this.stick.x,
        y: (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) + this.stick.y,
        run: k.has("ShiftLeft") || k.has("ShiftRight") || this.stick.run,
      };
      const fwd = this.camera.getTarget().subtract(this.camera.position);
      this.controller.update(dt, input, fwd);
      // nearest interactable in range
      let best: InteractId | null = null;
      let bestD = Infinity;
      for (const it of this.layout.interactables) {
        const d = Math.hypot(it.spot.x - this.controller.pos.x, it.spot.z - this.controller.pos.z);
        if (d < it.radius && d < bestD) {
          best = it.id;
          bestD = d;
        }
      }
      this.setNearby(best);
    } else {
      this.player.speed = 0;
    }
    this.player.update(dt);
    // walkers (customers)
    this.walkers = this.walkers.filter((w) => {
      const h = w.human;
      const next = w.path[0];
      if (!next) return false;
      const pos = h.root.position;
      const d = next.subtract(pos);
      d.y = 0;
      const dist = d.length();
      if (dist < 0.05) {
        w.path.shift();
        if (!w.path.length) {
          h.speed = 0;
          if (h.action === "walk") h.setAction("idle");
          w.onArrive?.();
          return false;
        }
        return true;
      }
      const step = Math.min(dist, w.speed * dt);
      pos.addInPlace(d.normalize().scale(step));
      h.root.rotation.y = Math.atan2(d.x, d.z);
      h.speed = w.speed;
      h.setAction("walk");
      return true;
    });
    this.customer?.update(dt);
    for (const w of this.walkers) if (w.human !== this.customer) w.human.update(dt);

    // camera
    this.updateCameraWants(dt);
    const cam = this.camera;
    const k = 1 - Math.exp(-dt * (this.mode === "play" ? 10 : 4));
    this.camTarget.addInPlace(this.want.target.subtract(this.camTarget).scale(k));
    cam.target.copyFrom(this.camTarget);
    if (this.mode !== "play") {
      cam.alpha += (this.want.alpha - cam.alpha) * k;
      cam.beta += (this.want.beta - cam.beta) * k;
      cam.radius += (this.want.radius - cam.radius) * k;
    } else {
      // keep the camera inside the room
      let r = cam.radius;
      for (let i = 0; i < 8; i++) {
        const p = new Vector3(Math.cos(cam.alpha) * Math.sin(cam.beta), Math.cos(cam.beta), Math.sin(cam.alpha) * Math.sin(cam.beta)).scale(r).add(this.camTarget);
        if (p.x > ROOM.minX + 0.2 && p.x < ROOM.maxX - 0.2 && p.z > ROOM.minZ + 0.2 && p.z < ROOM.maxZ - 0.1 && p.y < ROOM.height - 0.1 && p.y > 0.2) break;
        r *= 0.85;
      }
      cam.radius = Math.min(cam.radius, Math.max(1.2, r));
    }
  }

  resize() {
    this.ui.fit();
    const c = this.app.canvas;
    this.camera.fov = c.clientHeight > c.clientWidth ? 1.15 : 0.9; // wider view on portrait phones
  }

  dispose() {
    this.ui.dispose();
    this.scene.dispose();
  }
}
