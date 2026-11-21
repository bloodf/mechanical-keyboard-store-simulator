/** Stabilizer wire lubing: drag along the wire to coat it before the timer runs out. */
import { play } from "../../../audio/engine";
import { t } from "../../../i18n";
import { CanvasGame } from "./canvasGame";

const SEGMENTS = 48;
const TIME_PER_WIRE = 5;

export class WireGame extends CanvasGame {
  private wire = 0;
  private coated: boolean[] = new Array(SEGMENTS).fill(false);
  private time = TIME_PER_WIRE;
  private coverages: number[] = [];
  private brushT = 0;
  private started = false;
  private finished = false;

  constructor(private wires: number, private onDone: (coverage: number) => void, private onProgress: (text: string) => void) {
    super("mg-canvas mg-wire");
  }

  /** Wire shape: a long bar with bent ends, in canvas coordinates. */
  private points(): [number, number][] {
    const W = this.w;
    const H = this.hgt;
    const x0 = W * 0.1;
    const x1 = W * 0.9;
    const y = H * 0.5;
    const bend = H * 0.22;
    const pts: [number, number][] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const u = i / (SEGMENTS - 1);
      // 0..0.1 left leg, 0.1..0.9 bar, 0.9..1 right leg
      if (u < 0.1) pts.push([x0, y + bend * (1 - u / 0.1)]);
      else if (u > 0.9) pts.push([x1, y + bend * ((u - 0.9) / 0.1)]);
      else pts.push([x0 + ((u - 0.1) / 0.8) * (x1 - x0), y]);
    }
    return pts;
  }

  protected onDown() {
    this.started = true;
    this.paint();
  }
  protected onMove() {
    if (this.pointer.down) this.paint();
  }

  private paint() {
    if (this.finished) return;
    const r = Math.max(18, this.hgt * 0.09);
    let any = false;
    this.points().forEach(([x, y], i) => {
      if (!this.coated[i] && Math.hypot(x - this.pointer.x, y - this.pointer.y) < r) {
        this.coated[i] = true;
        any = true;
      }
    });
    if (any && this.brushT <= 0) {
      play("bench.lubeBrush", { volume: 0.5 });
      this.brushT = 0.12;
    }
    if (this.coated.every(Boolean)) this.nextWire();
  }

  private coverage() {
    return this.coated.filter(Boolean).length / SEGMENTS;
  }

  private nextWire() {
    const c = this.coverage();
    this.coverages.push(c);
    this.pop(`${Math.round(c * 100)}%`, this.w / 2, this.hgt * 0.3, c > 0.85 ? "#2ea05a" : "#c07a1a");
    play(c > 0.85 ? "ui.confirm" : "ui.toggle");
    this.wire++;
    this.coated.fill(false);
    this.time = TIME_PER_WIRE;
    this.started = false;
    if (this.wire >= this.wires) {
      this.finished = true;
      this.onDone(this.coverages.reduce((a, b) => a + b, 0) / this.coverages.length);
    }
  }

  autoComplete() {
    while (this.coverages.length < this.wires) this.coverages.push(1);
    this.finished = true;
    this.onDone(1);
  }

  protected tick(dt: number) {
    this.brushT -= dt;
    if (this.finished) return;
    if (this.started) {
      this.time -= dt;
      if (this.time <= 0) this.nextWire();
    }
    this.onProgress(`${t("stab.wire", { n: Math.min(this.wire + 1, this.wires), total: this.wires })} · ${t("stab.coverage", { pct: Math.round(this.coverage() * 100) })}`);
  }

  protected draw() {
    const g = this.g;
    const pts = this.points();
    g.lineCap = "round";
    g.lineJoin = "round";
    // Wire
    g.strokeStyle = "#aeb4bd";
    g.lineWidth = 8;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    // Lube coat
    g.strokeStyle = "#e8c84f";
    g.lineWidth = 12;
    for (let i = 1; i < SEGMENTS; i++) {
      if (this.coated[i] && this.coated[i - 1]) {
        g.beginPath();
        g.moveTo(...pts[i - 1]);
        g.lineTo(...pts[i]);
        g.stroke();
      }
    }
    // Stab housings at both ends
    g.fillStyle = "#2a2a2a";
    for (const i of [0, SEGMENTS - 1]) g.fillRect(pts[i][0] - 14, pts[i][1] - 10, 28, 22);
    // Timer bar
    if (!this.finished) {
      g.fillStyle = "rgba(0,0,0,0.08)";
      g.fillRect(12, this.hgt - 14, this.w - 24, 6);
      g.fillStyle = this.time < 1.5 ? "#e23b4e" : "#ff7a45";
      g.fillRect(12, this.hgt - 14, (this.w - 24) * (this.time / TIME_PER_WIRE), 6);
    }
    if (this.pointer.down) {
      g.fillStyle = "rgba(232,200,79,0.5)";
      g.beginPath();
      g.arc(this.pointer.x, this.pointer.y, Math.max(18, this.hgt * 0.09), 0, Math.PI * 2);
      g.fill();
    }
    this.drawPops();
  }
}
