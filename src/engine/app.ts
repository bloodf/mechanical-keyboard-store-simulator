/**
 * Babylon.js application shell: one Engine, swappable game scenes, a frame-rate governor
 * (cap / idle when nothing moves / dynamic resolution) and quality presets.
 */
import { Engine, type Scene } from "@babylonjs/core";

export interface GameScene {
  readonly scene: Scene;
  /** Frame-rate cap (default 60). */
  maxFps?: number;
  /** Frame rate when the scene reports it's not busy and the player isn't touching anything. */
  idleFps?: number;
  isBusy?(): boolean;
  update(dt: number): void;
  resize?(): void;
  dispose(): void;
}

export type Quality = "low" | "medium" | "high";
const QUALITY_KEY = "mkss.settings.quality";

export class GameApp {
  readonly engine: Engine;
  readonly canvas: HTMLCanvasElement;
  private current: GameScene | null = null;
  private lastFrame = 0;
  private lastInput = 0;
  private running = true;
  private maxDpr = Math.min(window.devicePixelRatio || 1, 2);
  private scale = 1; // dynamic resolution (fraction of maxDpr)
  private winStart = 0;
  private winFrames = 0;
  quality: Quality;
  readonly onQualityChange: ((q: Quality) => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false, powerPreference: "high-performance" }, false);
    this.quality = (localStorage.getItem(QUALITY_KEY) as Quality | null) ?? (matchMedia("(pointer: coarse)").matches ? "medium" : "high");
    this.applyScaling();
    window.addEventListener("resize", () => this.resize());
    const poke = () => (this.lastInput = performance.now());
    for (const ev of ["pointermove", "pointerdown", "keydown", "wheel", "touchmove"]) window.addEventListener(ev, poke, { passive: true });
    this.engine.runRenderLoop(() => this.frame());
  }

  setQuality(q: Quality) {
    this.quality = q;
    try {
      localStorage.setItem(QUALITY_KEY, q);
    } catch {
      /* ignore */
    }
    this.onQualityChange.forEach((f) => f(q));
  }

  set(scene: GameScene) {
    const old = this.current;
    this.current = scene;
    this.winStart = 0;
    old?.dispose();
    this.resize();
  }

  get scene(): GameScene | null {
    return this.current;
  }

  /** Full frame rate for a moment (something is about to move). */
  wake() {
    this.lastInput = performance.now();
  }

  stop() {
    this.running = false;
    this.engine.stopRenderLoop();
  }

  private applyScaling() {
    const minScale = this.quality === "low" ? 0.6 : 0.75;
    this.scale = Math.max(minScale, Math.min(1, this.scale));
    const qualityCap = this.quality === "low" ? 1 : this.maxDpr;
    this.engine.setHardwareScalingLevel(1 / (qualityCap * this.scale));
  }

  private resize() {
    this.engine.resize();
    this.current?.resize?.();
  }

  private adapt(now: number, target: number) {
    if (!this.winStart) {
      this.winStart = now;
      this.winFrames = 0;
      return;
    }
    this.winFrames++;
    const el = now - this.winStart;
    if (el < 1000) return;
    const fps = (this.winFrames * 1000) / el;
    this.winStart = now;
    this.winFrames = 0;
    let next = this.scale;
    if (fps < target * 0.6) next = this.scale * 0.88;
    else if (fps > target * 0.95 && this.scale < 1) next = Math.min(1, this.scale * 1.06);
    if (Math.abs(next - this.scale) > 0.01) {
      this.scale = next;
      this.applyScaling();
      this.engine.resize();
    }
  }

  private frame() {
    const c = this.current;
    if (!this.running || !c) return;
    const now = performance.now();
    const quiet = !(c.isBusy?.() ?? false) && now - this.lastInput > 1500;
    const idle = c.idleFps !== undefined && quiet;
    const target = idle ? c.idleFps! : (c.maxFps ?? 60);
    if (now - this.lastFrame < 1000 / target - 2) return;
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;
    c.update(dt);
    c.scene.render();
    if (!idle) this.adapt(now, target);
  }
}
