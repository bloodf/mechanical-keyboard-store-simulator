/**
 * Soldering rhythm game: a ring shrinks onto the pad; tap (or Space) when it lines up.
 * Each beat solders a group of switches; misses leave cold joints (dead/chattering keys).
 */
import { play } from "../../../audio/engine";
import { t } from "../../../i18n";
import { CanvasGame } from "./canvasGame";

export const SOLDER_BEATS = 16;
const PAD_R = 16;
const START_R = 70;

export interface SolderResult {
  quality: number;
  missed: number[];
}

export class SolderGame extends CanvasGame {
  private beat = 0;
  private beatStart = 0; // performance.now() when the current ring started shrinking
  private gapUntil = 0;
  private scores: number[] = [];
  private missed: number[] = [];
  private started = false;
  private finished = false;
  private smoke: { x: number; y: number; t: number }[] = [];

  constructor(private onBeat: (beat: number, ok: boolean) => void, private onDone: (r: SolderResult) => void, private onProgress: (text: string) => void) {
    super("mg-canvas mg-solder");
    onProgress(t("solder.count", { n: 0, total: SOLDER_BEATS }));
  }

  private get dur() {
    return Math.max(0.55, 1.0 - this.beat * 0.025);
  }
  /** Ring radius from real time, so timing is fair at any frame rate. */
  private radiusAt(now: number) {
    const t = (now - this.beatStart) / 1000;
    return START_R * (1 - Math.min(1, t / this.dur));
  }

  start() {
    this.started = true;
    this.beatStart = performance.now() + 350;
    this.gapUntil = this.beatStart;
  }

  protected onDown() {
    if (!this.started) {
      this.start();
      return;
    }
    this.hit();
  }
  key() {
    if (!this.started) this.start();
    else this.hit();
  }

  private hit() {
    const now = performance.now();
    if (this.finished || now < this.gapUntil) return;
    const d = Math.abs(this.radiusAt(now) - PAD_R);
    if (d <= 6) this.score(1, t("solder.perfect"), "#2ea05a");
    else if (d <= 13) this.score(0.75, t("solder.good"), "#c07a1a");
    else this.score(0, t("solder.miss"), "#e23b4e");
  }

  private score(q: number, label: string, color: string) {
    this.scores.push(q);
    if (q === 0) this.missed.push(this.beat);
    this.pop(label, this.w / 2, this.hgt / 2 - 40, color);
    if (q > 0) {
      play("bench.solder", { volume: 0.7 });
      this.smoke.push({ x: this.w / 2, y: this.hgt / 2, t: 0 });
    } else {
      play("bench.deadKey");
    }
    this.onBeat(this.beat, q > 0);
    this.beat++;
    this.gapUntil = performance.now() + 300;
    this.beatStart = this.gapUntil;
    this.onProgress(t("solder.count", { n: this.beat, total: SOLDER_BEATS }));
    if (this.beat >= SOLDER_BEATS) {
      this.finished = true;
      setTimeout(() => this.onDone(this.result()), 400);
    }
  }

  result(): SolderResult {
    return { quality: this.scores.reduce((a, b) => a + b, 0) / Math.max(1, this.scores.length), missed: this.missed };
  }

  autoComplete() {
    while (this.beat < SOLDER_BEATS) {
      this.scores.push(1);
      this.onBeat(this.beat, true);
      this.beat++;
    }
    this.finished = true;
    this.onDone(this.result());
  }

  protected tick(dt: number) {
    this.smoke = this.smoke.filter((s) => (s.t += dt) < 1);
    if (!this.started || this.finished) return;
    const now = performance.now();
    if (now < this.gapUntil) return;
    if ((now - this.beatStart) / 1000 > this.dur + 0.12) this.score(0, t("solder.miss"), "#e23b4e");
  }

  protected draw() {
    const g = this.g;
    const cx = this.w / 2;
    const cy = this.hgt / 2;
    // Board + pad
    g.fillStyle = "#1d4fa0";
    g.fillRect(0, 0, this.w, this.hgt);
    g.fillStyle = "rgba(255,255,255,0.06)";
    for (let x = 20; x < this.w; x += 40) g.fillRect(x, 0, 2, this.hgt);
    g.fillStyle = "#d9b458";
    g.beginPath();
    g.arc(cx, cy, PAD_R, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#333";
    g.beginPath();
    g.arc(cx, cy, 5, 0, Math.PI * 2);
    g.fill();
    // Ring
    if (this.started && !this.finished && performance.now() >= this.gapUntil) {
      const r = this.radiusAt(performance.now());
      const near = Math.abs(r - PAD_R) <= 6;
      g.strokeStyle = near ? "#7CFC9A" : "#ffffff";
      g.lineWidth = 4;
      g.beginPath();
      g.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
      g.stroke();
    }
    // Smoke puffs
    for (const s of this.smoke) {
      g.fillStyle = `rgba(240,240,240,${0.5 * (1 - s.t)})`;
      g.beginPath();
      g.arc(s.x + Math.sin(s.t * 6) * 10, s.y - s.t * 60, 8 + s.t * 14, 0, Math.PI * 2);
      g.fill();
    }
    if (!this.started) {
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(0, 0, this.w, this.hgt);
      g.fillStyle = "#fff";
      g.font = "800 18px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText(t("solder.start"), cx, cy + 6);
    }
    this.drawPops();
  }
}
