/**
 * The workshop: one Babylon scene, always looking at the workbench.
 *  - background + image-based lighting come from a Cycles-rendered 360° panorama of the room
 *    (public/assets/env/workshop_bg.jpg and workshop.env, see art/blender/workshop.py),
 *  - the bench top and the props on it are real meshes (bench.glb) so the keyboard casts shadows on them,
 *  - a desk mat with the store's name, a key light (window) with shadows and the desk lamp.
 * The camera frames the keyboard in the part of the screen that isn't covered by UI panels.
 */
import {
  ArcRotateCamera,
  Color3,
  Color4,
  CubeTexture,
  DefaultRenderingPipeline,
  DirectionalLight,
  DynamicTexture,
  Effect,
  ImageProcessingConfiguration,
  Matrix,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Ray,
  Scene,
  ShadowGenerator,
  ShaderMaterial,
  SpotLight,
  Texture,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { Ui } from "../../gui/ui";
import type { GameApp, GameScene, Quality } from "../app";
import { instantiateGlb, loadGlb } from "../glb";
import { Geo, rrect } from "../keyboard/geo";

export type BenchView = "overview" | "top" | "low" | "front";
export interface BenchFocus {
  target: Vector3;
  w: number;
  d: number;
  beta: number;
}

export const BENCH_TOP = 0.76;

/**
 * Background: exact equirectangular lookup per pixel (no seams, no UV distortion).
 * The panorama camera looked along Blender +y (the back wall = Babylon −Z); Babylon (X, Y, Z) = Blender (−x, z, −y).
 */
Effect.ShadersStore["roomVertexShader"] = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = viewProjection * world * vec4(position, 1.0);
}`;
Effect.ShadersStore["roomFragmentShader"] = `
precision highp float;
varying vec3 vDir;
uniform sampler2D pano;
void main() {
  vec3 d = normalize(vDir);
  vec3 b = vec3(-d.x, -d.z, d.y); // Blender axes
  float u = 0.5 + atan(b.x, b.y) / 6.2831853;
  float v = 0.5 - asin(clamp(b.z, -1.0, 1.0)) / 3.14159265;
  vec3 c = texture2D(pano, vec2(u, v)).rgb;
  gl_FragColor = vec4(pow(c, vec3(2.2)), 1.0); // sRGB → linear (the pipeline tone-maps and encodes)
}`;

function roomMaterial(scene: Scene, url: string): ShaderMaterial {
  const m = new ShaderMaterial("room", scene, { vertex: "room", fragment: "room" }, { attributes: ["position"], uniforms: ["world", "viewProjection"], samplers: ["pano"] });
  const t = new Texture(url, scene, true, false, Texture.BILINEAR_SAMPLINGMODE);
  t.wrapU = Texture.WRAP_ADDRESSMODE;
  t.wrapV = Texture.CLAMP_ADDRESSMODE;
  m.setTexture("pano", t);
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  return m;
}
/** Where the panorama was rendered from (Babylon space): the usual camera spot. */
const PANO_ORIGIN = new Vector3(0, 1.16, 0.42);

const ASSETS = `${import.meta.env.BASE_URL}assets`;

export class WorkshopScene implements GameScene {
  readonly scene: Scene;
  readonly ui: Ui;
  readonly camera: ArcRotateCamera;
  readonly shadows: ShadowGenerator | null;
  /** Where the keyboard sits (desk mat surface). */
  readonly benchAnchor: TransformNode;
  /** Compatibility with the minigames (they read layout.benchAnchor). */
  readonly layout: { benchAnchor: TransformNode };
  maxFps = 60;
  idleFps = 20;
  private pipeline: DefaultRenderingPipeline | null = null;
  private camTarget = new Vector3(0, BENCH_TOP, 0);
  private want = { alpha: Math.PI / 2, beta: 0.9, radius: 0.6, target: new Vector3(0, BENCH_TOP, 0) };
  private benchView: BenchView | BenchFocus = "overview";
  private benchSize = { w: 0.33, d: 0.12 };
  private insets = { left: 0, top: 0, bottom: 0, right: 0 };
  private busyT = 0;
  private attract = false;
  private t = 0;
  private matTex: DynamicTexture;
  private dome: Mesh;
  /** Resolves when the environment and the bench are loaded. */
  readonly ready: Promise<void>;

  constructor(
    private app: GameApp,
    storeName: string,
  ) {
    const scene = (this.scene = new Scene(app.engine));
    scene.clearColor = new Color4(0.55, 0.5, 0.45, 1);
    scene.skipPointerMovePicking = true;

    // Image-based lighting (prefiltered from the panorama) + the background dome
    const env = CubeTexture.CreateFromPrefilteredData(`${ASSETS}/env/workshop.env`, scene);
    scene.environmentTexture = env;
    scene.environmentIntensity = 1.0;
    this.dome = MeshBuilder.CreateSphere("room", { diameter: 40, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
    this.dome.material = roomMaterial(scene, `${ASSETS}/env/workshop_bg.jpg`);
    this.dome.position.copyFrom(PANO_ORIGIN);
    this.dome.isPickable = false;
    this.dome.infiniteDistance = false;
    this.dome.renderingGroupId = 0;
    this.dome.alphaIndex = -1;

    // Key light from the window (typist's left), warm desk lamp over the work area
    const sun = new DirectionalLight("window", new Vector3(-0.62, -0.62, -0.48).normalize(), scene);
    sun.position = new Vector3(1.2, 2.0, 0.9);
    sun.intensity = 1.6;
    sun.diffuse = Color3.FromHexString("#fff1dc");
    const lamp = new SpotLight("lamp", new Vector3(0.23, BENCH_TOP + 0.41, -0.27), new Vector3(-0.35, -1, 0.45).normalize(), 1.3, 3, scene);
    lamp.intensity = 1.1;
    lamp.diffuse = Color3.FromHexString("#ffdcae");
    lamp.range = 2;

    this.shadows = app.quality === "low" ? null : new ShadowGenerator(app.quality === "high" ? 2048 : 1024, sun);
    if (this.shadows) {
      this.shadows.usePercentageCloserFiltering = true;
      this.shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      this.shadows.bias = 0.0015;
      this.shadows.normalBias = 0.004;
      sun.autoUpdateExtends = false;
      sun.shadowMinZ = 0.5;
      sun.shadowMaxZ = 4;
      sun.orthoLeft = -0.45;
      sun.orthoRight = 0.45;
      sun.orthoTop = 0.35;
      sun.orthoBottom = -0.35;
    }

    // Desk mat (real mesh: the keyboard sits on it)
    this.benchAnchor = new TransformNode("benchAnchor", scene);
    this.benchAnchor.position.set(0, BENCH_TOP + 0.004, 0.02);
    this.layout = { benchAnchor: this.benchAnchor };
    const g = new Geo();
    g.prism(rrect(900, 400, 12, 8), 0, 4);
    const vd = g.toVertexData("box", 1 / 900, [0.5, 0.5]);
    // the mat is 900 × 400: stretch v so the whole texture covers it
    const uv = vd.uvs as Float32Array;
    for (let i = 1; i < uv.length; i += 2) uv[i] = 0.5 + (uv[i] - 0.5) * (900 / 400);
    const deskMat = new Mesh("deskMat", scene);
    vd.applyToMesh(deskMat);
    deskMat.scaling.setAll(0.001);
    deskMat.position.set(0, BENCH_TOP, 0.02);
    this.matTex = new DynamicTexture("matTex", { width: 2048, height: 1024 }, scene, true);
    const mm = new PBRMaterial("deskMat", scene);
    mm.albedoTexture = this.matTex;
    mm.roughness = 0.95;
    mm.metallic = 0;
    deskMat.material = mm;
    deskMat.receiveShadows = true;
    deskMat.isPickable = false;
    this.setStoreName(storeName);

    // Camera
    const cam = (this.camera = new ArcRotateCamera("cam", Math.PI / 2, 0.9, 0.6, new Vector3(0, BENCH_TOP, 0), scene));
    cam.minZ = 0.01;
    cam.maxZ = 60;
    cam.fov = 0.75;
    cam.inputs.clear();
    scene.activeCamera = cam;

    this.setupPipeline(app.quality);
    app.onQualityChange.push((q) => this.setupPipeline(q));
    this.ui = new Ui(scene);

    this.ready = loadGlb(`${ASSETS}/models/bench.glb`)
      .then((file) => {
        for (const m of instantiateGlb(file, scene, "bench")) {
          m.receiveShadows = true;
          m.isPickable = false;
          this.shadows?.addShadowCaster(m);
          m.freezeWorldMatrix();
        }
      })
      .catch((e) => console.warn("[workshop] bench failed to load", e));
    this.snapCamera();
  }

  private setupPipeline(q: Quality) {
    this.pipeline?.dispose();
    this.pipeline = null;
    const scene = this.scene;
    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
    ip.exposure = 1.0;
    ip.contrast = 1.05;
    if (q === "low") return;
    const p = new DefaultRenderingPipeline("pipe", true, scene, [this.camera]);
    p.samples = q === "high" ? 4 : 1;
    p.fxaaEnabled = q !== "high";
    p.bloomEnabled = q === "high";
    p.bloomThreshold = 0.9;
    p.bloomWeight = 0.15;
    p.bloomKernel = 32;
    p.imageProcessingEnabled = true;
    p.imageProcessing.toneMappingEnabled = true;
    p.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
    p.imageProcessing.exposure = 1.0;
    p.imageProcessing.contrast = 1.05;
    p.imageProcessing.vignetteEnabled = true;
    p.imageProcessing.vignetteWeight = 0.8;
    p.imageProcessing.vignetteColor = new Color4(0.1, 0.06, 0.02, 0);
    this.pipeline = p;
  }

  /** The store name is printed on the desk mat. */
  setStoreName(name: string) {
    const t = this.matTex;
    const g = t.getContext() as unknown as CanvasRenderingContext2D;
    const W = 2048, H = 1024;
    g.fillStyle = "#2f3a45";
    g.fillRect(0, 0, W, H);
    // felt texture
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? "255,255,255" : "0,0,0"},${0.02 + rnd() * 0.03})`;
      g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 3);
    }
    // stitched edge
    g.strokeStyle = "rgba(235,230,220,0.35)";
    g.lineWidth = 3;
    g.setLineDash([14, 10]);
    g.strokeRect(22, 22, W - 44, H - 44);
    g.setLineDash([]);
    // store name, bottom right corner (the canvas maps onto the mat as the typist sees it)
    g.save();
    g.fillStyle = "rgba(240,232,215,0.55)";
    g.font = "700 44px Inter, system-ui, sans-serif";
    g.textAlign = "right";
    g.fillText((name || "Keyboard Workshop").toUpperCase(), W - 70, H - 64);
    g.font = "500 22px Inter, system-ui, sans-serif";
    g.fillText("custom mechanical keyboards", W - 70, H - 34);
    g.restore();
    t.update();
  }

  // ---------------- Camera ----------------
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

  private fitDistance(w: number, d: number) {
    const canvas = this.app.canvas;
    const W = canvas.clientWidth || 1;
    const H = canvas.clientHeight || 1;
    const freeW = Math.max(0.3, (W - this.insets.left - this.insets.right) / W);
    const freeH = Math.max(0.25, (H - this.insets.top - this.insets.bottom) / H);
    const vfov = this.camera.fov;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (W / H));
    return Math.max(((w / 2) / Math.tan(hfov / 2)) * 1.1 / freeW, ((d / 2) / Math.tan(vfov / 2)) * 1.25 / freeH);
  }

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

  /** Title screen: a slow look around the workshop. */
  setAttract(on: boolean) {
    this.attract = on;
    this.busyT = 2;
  }

  private updateCameraWants() {
    const w = this.want;
    if (this.attract) {
      w.alpha = Math.PI / 2 + Math.sin(this.t * 0.08) * 0.35;
      w.beta = 1.12;
      w.radius = 0.95;
      w.target = new Vector3(0.12, BENCH_TOP + 0.2, 0.05);
      return;
    }
    const anchor = this.benchAnchor.getAbsolutePosition();
    const view = this.benchView;
    w.alpha = Math.PI / 2;
    if (typeof view === "object") {
      w.beta = view.beta;
      const dist = this.fitDistance(view.w, view.d);
      w.radius = dist;
      w.target = this.offsetTarget(view.target, dist);
    } else {
      w.beta = view === "top" ? 0.3 : view === "low" ? 1.05 : view === "front" ? 1.2 : 0.78;
      const depth = this.benchSize.d * Math.cos(w.beta) + 0.03 * Math.sin(w.beta) + 0.03;
      const dist = this.fitDistance(this.benchSize.w + 0.04, depth);
      w.radius = dist;
      w.target = this.offsetTarget(anchor.add(new Vector3(0, 0.015, 0)), dist);
    }
  }

  private snapCamera() {
    this.updateCameraWants();
    const c = this.camera;
    c.alpha = this.want.alpha;
    c.beta = this.want.beta;
    c.radius = this.want.radius;
    this.camTarget.copyFrom(this.want.target);
    c.setTarget(this.camTarget.clone());
    c.alpha = this.want.alpha;
    c.beta = this.want.beta;
    c.radius = this.want.radius;
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

  // ---------------- Frame ----------------
  isBusy() {
    return this.attract || this.busyT > 0 || !this.cameraSettled();
  }

  update(dt: number) {
    this.t += dt;
    if (this.busyT > 0) this.busyT -= dt;
    this.updateCameraWants();
    const cam = this.camera;
    const k = 1 - Math.exp(-dt * 4);
    this.camTarget.addInPlace(this.want.target.subtract(this.camTarget).scale(k));
    cam.target.copyFrom(this.camTarget);
    cam.alpha += (this.want.alpha - cam.alpha) * k;
    cam.beta += (this.want.beta - cam.beta) * k;
    cam.radius += (this.want.radius - cam.radius) * k;
  }

  resize() {
    this.ui.fit();
    const c = this.app.canvas;
    this.camera.fov = c.clientHeight > c.clientWidth ? 1.0 : 0.75;
  }

  dispose() {
    this.ui.dispose();
    this.scene.dispose();
  }
}
