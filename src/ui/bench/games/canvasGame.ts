/** Base for small 2D canvas minigames: sizing (DPR aware), frame loop, pointer + key input. */
import { h } from "../../dom";

export abstract class CanvasGame {
  readonly canvas: HTMLCanvasElement;
  protected g: CanvasRenderingContext2D;
  protected w = 0;
  protected hgt = 0;
  protected pointer = { x: 0, y: 0, down: false };
  protected dt = 0;
  private raf = 0;
  private last = 0;
  private alive = true;
  private ro: ResizeObserver;

  constructor(className = "mg-canvas") {
    this.canvas = h("canvas", { class: className });
    this.g = this.canvas.getContext("2d")!;
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.canvas);
    const pos = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      this.pointer.x = e.clientX - r.left;
      this.pointer.y = e.clientY - r.top;
    };
    this.canvas.addEventListener("pointerdown", (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      pos(e);
      this.pointer.down = true;
      this.onDown();
      e.preventDefault();
    });
    this.canvas.addEventListener("pointermove", (e) => {
      pos(e);
      this.onMove();
    });
    const up = (e: PointerEvent) => {
      pos(e);
      if (!this.pointer.down) return;
      this.pointer.down = false;
      this.onUp();
    };
    this.canvas.addEventListener("pointerup", up);
    this.canvas.addEventListener("pointercancel", up);
    const loop = (ts: number) => {
      if (!this.alive) return;
      const dt = this.last ? Math.min(0.12, (ts - this.last) / 1000) : 0;
      this.last = ts;
      this.dt = dt;
      if (!this.w) this.fit();
      this.g.clearRect(0, 0, this.w, this.hgt);
      this.tick(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = this.canvas.clientWidth;
    this.hgt = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.hgt * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  protected onDown() {}
  protected onMove() {}
  protected onUp() {}
  protected abstract tick(dt: number): void;
  protected abstract draw(): void;

  /** Floating feedback text ("Perfect!") */
  protected pops: { text: string; x: number; y: number; t: number; color: string }[] = [];
  protected pop(text: string, x: number, y: number, color = "#2b2118") {
    this.pops.push({ text, x, y, t: 0, color });
  }
  protected drawPops() {
    const dt = this.dt;
    const g = this.g;
    this.pops = this.pops.filter((p) => {
      p.t += dt;
      g.globalAlpha = Math.max(0, 1 - p.t / 0.9);
      g.fillStyle = p.color;
      g.font = "900 20px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText(p.text, p.x, p.y - p.t * 40);
      g.globalAlpha = 1;
      return p.t < 0.9;
    });
  }

  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
  }
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
