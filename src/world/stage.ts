/** Owns the WebGL renderer and swaps between scene controllers (title, cheater, shop…). */
import * as THREE from "three";

export interface SceneController {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Frame-rate cap. Menus use 30 to save battery; gameplay uses 60. */
  maxFps?: number;
  /** If set, the frame rate drops to this when the scene isn't busy and there's no input. */
  idleFps?: number;
  isBusy?(): boolean;
  /** Drop to idleFps even with input (e.g. a 2D minigame has the player's attention). */
  forceIdle?(): boolean;
  update(dt: number, time: number): void;
  resize?(w: number, h: number): void;
  dispose(): void;
}

/**
 * Dynamic resolution: if frames arrive slower than the target, render fewer pixels;
 * if there's headroom, go back up. Keeps weak laptops/phones smooth and cool.
 */
const MIN_SCALE = 0.7; // below this the image gets too blurry; a graphics setting can go lower later
const ADAPT_WINDOW_MS = 1000;

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  private current: SceneController | null = null;
  private timer = new THREE.Timer();
  private running = true;
  private maxRatio = Math.min(window.devicePixelRatio || 1, 2);
  private scale = 1; // fraction of maxRatio currently used
  private lastRender = 0;
  private windowStart = 0;
  private windowFrames = 0;
  private lastInput = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.maxRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.id = "gl";
    container.appendChild(this.renderer.domElement);
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.timer.connect(document); // pauses time while the tab is hidden
    this.renderer.setAnimationLoop((ts) => this.frame(ts));
    const poke = () => (this.lastInput = performance.now());
    for (const ev of ["pointermove", "pointerdown", "keydown", "wheel", "touchmove"]) window.addEventListener(ev, poke, { passive: true });
  }

  /** Ask for full frame rate for a moment (e.g. after a UI change that moves 3D things). */
  wake() {
    this.lastInput = performance.now();
  }

  /** Stop rendering entirely (e.g. another tab took over the store). */
  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  set(ctrl: SceneController) {
    this.current?.dispose();
    this.current = ctrl;
    this.windowFrames = 0;
    this.windowStart = 0;
    this.resize();
  }

  /** Current resolution scale (for a future graphics/debug panel). */
  get resolutionScale() {
    return this.scale;
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(this.maxRatio * this.scale);
    this.renderer.setSize(w, h);
    if (this.current) {
      this.current.camera.aspect = w / h;
      this.current.camera.updateProjectionMatrix();
      this.current.resize?.(w, h);
    }
  }

  private adapt(now: number, targetFps: number) {
    if (this.windowStart === 0) {
      this.windowStart = now;
      this.windowFrames = 0;
      return;
    }
    this.windowFrames++;
    const elapsed = now - this.windowStart;
    if (elapsed < ADAPT_WINDOW_MS) return;
    const fps = (this.windowFrames * 1000) / elapsed;
    this.windowStart = now;
    this.windowFrames = 0;
    let next = this.scale;
    if (fps < targetFps * 0.6) next = Math.max(MIN_SCALE, this.scale * 0.85);
    else if (fps > targetFps * 0.95 && this.scale < 1) next = Math.min(1, this.scale * 1.08);
    if (Math.abs(next - this.scale) > 0.01) {
      this.scale = next;
      this.resize();
    }
  }

  private frame(ts: number) {
    if (!this.running || !this.current) return;
    const c = this.current;
    const quiet = !(c.isBusy?.() ?? false) && (ts - this.lastInput > 1500 || (c.forceIdle?.() ?? false));
    const idle = c.idleFps !== undefined && quiet;
    const targetFps = idle ? c.idleFps! : (c.maxFps ?? 60);
    // Frame cap (small tolerance so 60 Hz displays don't drop to 30 when capped at 60).
    if (ts - this.lastRender < 1000 / targetFps - 2) return;
    this.lastRender = ts;
    this.timer.update(ts);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    this.current.update(dt, this.timer.getElapsed());
    this.renderer.render(this.current.scene, this.current.camera);
    if (!idle) this.adapt(ts, targetFps);
  }
}
