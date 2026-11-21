/** Tape mod: swipe across each lane to lay a strip of tape on the PCB back. Straighter = better. */
import { play } from "../../../audio/engine";
import { t } from "../../../i18n";
import { CanvasGame } from "./canvasGame";

export class TapeGame extends CanvasGame {
  private lane = -1;
  private path: [number, number][] = [];
  private strips: { lane: number; quality: number }[] = [];
  private finished = false;

  constructor(private lanes: number, private onDone: (quality: number) => void, private onProgress: (text: string) => void) {
    super("mg-canvas mg-tape");
    onProgress(t("tape.count", { n: 0, total: lanes }));
  }

  private laneY(i: number) {
    const top = this.hgt * 0.12;
    const span = this.hgt * 0.76;
    return top + ((i + 0.5) / this.lanes) * span;
  }
  private laneH() {
    return (this.hgt * 0.76) / this.lanes;
  }

  protected onDown() {
    if (this.finished) return;
    const i = Math.floor(((this.pointer.y - this.hgt * 0.12) / (this.hgt * 0.76)) * this.lanes);
    if (i < 0 || i >= this.lanes || this.strips.some((s) => s.lane === i)) return;
    this.lane = i;
    this.path = [[this.pointer.x, this.pointer.y]];
  }
  protected onMove() {
    if (this.lane >= 0 && this.pointer.down) this.path.push([this.pointer.x, this.pointer.y]);
  }
  protected onUp() {
    if (this.lane < 0) return;
    const xs = this.path.map((p) => p[0]);
    const span = (Math.max(...xs) - Math.min(...xs)) / (this.w * 0.84);
    if (span >= 0.7) {
      const ly = this.laneY(this.lane);
      const dev = this.path.reduce((s, p) => s + Math.abs(p[1] - ly), 0) / this.path.length;
      const straight = Math.max(0, 1 - dev / (this.laneH() * 0.5));
      const quality = Math.min(1, straight * 0.8 + span * 0.2);
      this.strips.push({ lane: this.lane, quality });
      play("bench.tape");
      this.pop(quality > 0.8 ? "✓" : "~", this.w / 2, ly, quality > 0.8 ? "#2ea05a" : "#c07a1a");
      this.onProgress(t("tape.count", { n: this.strips.length, total: this.lanes }));
      if (this.strips.length >= this.lanes) {
        this.finished = true;
        setTimeout(() => this.onDone(this.quality()), 350);
      }
    }
    this.lane = -1;
    this.path = [];
  }

  quality() {
    return this.strips.reduce((s, x) => s + x.quality, 0) / Math.max(1, this.strips.length);
  }

  autoComplete() {
    for (let i = 0; i < this.lanes; i++) if (!this.strips.some((s) => s.lane === i)) this.strips.push({ lane: i, quality: 1 });
    this.finished = true;
    this.onDone(this.quality());
  }

  protected tick() {}

  protected draw() {
    const g = this.g;
    const x0 = this.w * 0.08;
    const x1 = this.w * 0.92;
    // PCB back
    g.fillStyle = "#1f6b3a";
    g.fillRect(x0, this.hgt * 0.1, x1 - x0, this.hgt * 0.8);
    for (let i = 0; i < this.lanes; i++) {
      const y = this.laneY(i);
      g.strokeStyle = "rgba(255,255,255,0.18)";
      g.setLineDash([6, 6]);
      g.beginPath();
      g.moveTo(x0 + 8, y);
      g.lineTo(x1 - 8, y);
      g.stroke();
      g.setLineDash([]);
      const s = this.strips.find((x) => x.lane === i);
      if (s) {
        g.fillStyle = "rgba(207,227,255,0.85)";
        const hgt = this.laneH() * 0.7;
        g.save();
        g.translate(this.w / 2, y);
        g.rotate((1 - s.quality) * 0.05 * (i % 2 ? 1 : -1));
        g.fillRect(-(x1 - x0) / 2 + 4, -hgt / 2, x1 - x0 - 8, hgt);
        g.restore();
      }
    }
    if (this.path.length > 1) {
      g.strokeStyle = "rgba(207,227,255,0.9)";
      g.lineWidth = this.laneH() * 0.6;
      g.lineCap = "round";
      g.beginPath();
      this.path.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
    this.drawPops();
  }
}
