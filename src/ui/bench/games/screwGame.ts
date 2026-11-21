/** Closing the case: hold each screw until the torque needle is in the green, then release. */
import { play } from "../../../audio/engine";
import { t } from "../../../i18n";
import { CanvasGame, roundRect } from "./canvasGame";

const ZONE: [number, number] = [0.6, 0.82];

export interface ScrewResult {
  quality: number;
  loose: number;
  stripped: number;
}

export class ScrewGame extends CanvasGame {
  private screws: { x: number; y: number; state: "open" | "tight" | "loose" | "stripped" }[];
  private active = -1;
  private torque = 0;
  private holdStart = 0;
  private tickT = 0;
  private finished = false;

  constructor(private count: number, private caseColor: string, private onDone: (r: ScrewResult) => void, private onProgress: (text: string) => void) {
    super("mg-canvas mg-screws");
    this.screws = Array.from({ length: count }, (_, i) => {
      const cols = count / 2;
      return { x: (i % cols + 0.5) / cols, y: i < cols ? 0.28 : 0.72, state: "open" as const };
    });
    onProgress(t("screws.count", { n: 0, total: count }));
  }

  private pos(i: number): [number, number] {
    const s = this.screws[i];
    return [this.w * 0.12 + s.x * this.w * 0.62, this.hgt * 0.1 + s.y * this.hgt * 0.8];
  }

  protected onDown() {
    if (this.finished) return;
    this.screws.forEach((s, i) => {
      const [x, y] = this.pos(i);
      if (s.state === "open" && Math.hypot(x - this.pointer.x, y - this.pointer.y) < 30) {
        this.active = i;
        this.torque = 0;
        this.holdStart = performance.now();
      }
    });
  }
  protected onUp() {
    if (this.active >= 0) this.release();
  }

  private release() {
    this.torque = Math.min(1, ((performance.now() - this.holdStart) / 1000) * 0.75);
    const s = this.screws[this.active];
    const [x, y] = this.pos(this.active);
    if (this.torque > 0.97) {
      s.state = "stripped";
      this.pop(t("screws.stripped"), x, y - 20, "#e23b4e");
      play("ui.error");
    } else if (this.torque >= ZONE[0] && this.torque <= ZONE[1]) {
      s.state = "tight";
      this.pop(t("screws.tight"), x, y - 20, "#2ea05a");
      play("ui.confirm");
    } else {
      s.state = "loose";
      this.pop(t("screws.loose"), x, y - 20, "#c07a1a");
      play("ui.toggle");
    }
    this.active = -1;
    this.torque = 0;
    const done = this.screws.filter((x) => x.state !== "open").length;
    this.onProgress(t("screws.count", { n: done, total: this.count }));
    if (done === this.count) {
      this.finished = true;
      setTimeout(() => this.onDone(this.result()), 350);
    }
  }

  result(): ScrewResult {
    const n = this.count;
    const tight = this.screws.filter((s) => s.state === "tight").length;
    const loose = this.screws.filter((s) => s.state === "loose").length;
    const stripped = this.screws.filter((s) => s.state === "stripped").length;
    return { quality: (tight + loose * 0.6 + stripped * 0.3) / n, loose: loose / n, stripped: stripped / n };
  }

  autoComplete() {
    this.screws.forEach((s) => s.state === "open" && (s.state = "tight"));
    this.finished = true;
    this.onDone(this.result());
  }

  protected tick(dt: number) {
    if (this.active < 0) return;
    this.torque = Math.min(1, ((performance.now() - this.holdStart) / 1000) * 0.75);
    this.tickT -= dt;
    if (this.tickT <= 0) {
      play("bench.screw", { volume: 0.5 });
      this.tickT = 0.3;
    }
    if (this.torque >= 1) this.release();
  }

  protected draw() {
    const g = this.g;
    // Case bottom (top-down)
    g.fillStyle = this.caseColor;
    roundRect(g, this.w * 0.06, this.hgt * 0.08, this.w * 0.74, this.hgt * 0.84, 16);
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.2)";
    g.lineWidth = 2;
    g.stroke();
    this.screws.forEach((s, i) => {
      const [x, y] = this.pos(i);
      g.fillStyle = s.state === "open" ? "#c9ccd1" : s.state === "tight" ? "#7ed69a" : s.state === "loose" ? "#f0c060" : "#e87a86";
      g.beginPath();
      g.arc(x, y, 16, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#555";
      g.lineWidth = 3;
      const rot = i === this.active ? this.torque * 12 : s.state === "open" ? 0.3 : 0.8;
      g.beginPath();
      g.moveTo(x + Math.cos(rot) * 9, y + Math.sin(rot) * 9);
      g.lineTo(x - Math.cos(rot) * 9, y - Math.sin(rot) * 9);
      g.moveTo(x + Math.cos(rot + Math.PI / 2) * 9, y + Math.sin(rot + Math.PI / 2) * 9);
      g.lineTo(x - Math.cos(rot + Math.PI / 2) * 9, y - Math.sin(rot + Math.PI / 2) * 9);
      g.stroke();
    });
    // Torque gauge
    const gx = this.w * 0.88;
    const gy = this.hgt * 0.62;
    const R = Math.min(this.w * 0.09, this.hgt * 0.32);
    const a0 = Math.PI;
    const arc = (from: number, to: number, color: string) => {
      g.strokeStyle = color;
      g.lineWidth = 10;
      g.beginPath();
      g.arc(gx, gy, R, a0 + from * Math.PI, a0 + to * Math.PI);
      g.stroke();
    };
    arc(0, 1, "#e9dfcf");
    arc(ZONE[0], ZONE[1], "#2ea05a");
    arc(0.97, 1, "#e23b4e");
    const a = a0 + this.torque * Math.PI;
    g.strokeStyle = "#2b2118";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(gx, gy);
    g.lineTo(gx + Math.cos(a) * R, gy + Math.sin(a) * R);
    g.stroke();
    this.drawPops();
  }
}
