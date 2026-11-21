/**
 * Switch lubing: hold to brush, release in the green zone. The zone depends on the switch type
 * (tactiles and clickies want much less lube). Five switches stand in for the whole batch.
 */
import { play } from "../../../audio/engine";
import type { SwitchProduct } from "../../../data/catalog";
import type { SwitchType } from "../../../data/parts";
import { t } from "../../../i18n";
import { CanvasGame, roundRect } from "./canvasGame";

export const LUBE_ZONES: Record<SwitchType, [number, number]> = {
  linear: [0.55, 0.8],
  tactile: [0.3, 0.48],
  clicky: [0.08, 0.22],
  silent: [0.42, 0.62],
};
export const LUBE_ROUNDS = 5;

export interface LubeResult {
  quality: number;
  over: number;
}

export class LubeGame extends CanvasGame {
  private round = 0;
  private fill = 0;
  private holding = false;
  private holdStart = 0;
  private brushT = 0;
  private results: { q: number; over: boolean }[] = [];
  private phase: "idle" | "closing" | "done" = "idle";
  private phaseStart = 0;
  private get phaseT() {
    return (performance.now() - this.phaseStart) / 1000;
  }
  private zone: [number, number];

  constructor(private sw: SwitchProduct, private onDone: (r: LubeResult) => void, private onProgress: (n: number) => void) {
    super("mg-canvas mg-lube");
    this.zone = LUBE_ZONES[sw.type];
    play("bench.switchOpen");
  }

  get speed() {
    return 0.42 * (1 + this.round * 0.16);
  }

  protected onDown() {
    if (this.phase !== "idle") return;
    this.beginHold();
  }
  private beginHold() {
    this.holding = true;
    this.holdStart = performance.now();
  }
  /** Fill is based on real time held, so it behaves the same at any frame rate. */
  private currentFill() {
    return Math.min(1, ((performance.now() - this.holdStart) / 1000) * this.speed);
  }
  protected onUp() {
    if (this.holding) this.judge();
  }
  /** Space bar support */
  key(down: boolean) {
    if (down && !this.holding && this.phase === "idle") this.beginHold();
    else if (!down && this.holding) this.judge();
  }

  private judge() {
    this.fill = this.currentFill();
    this.holding = false;
    const [z0, z1] = this.zone;
    const f = this.fill;
    let q: number;
    let label: string;
    let color = "#2ea05a";
    let over = false;
    if (f < z0) {
      q = Math.max(0, (f / z0) * 0.6);
      label = t("lube.under");
      color = "#c07a1a";
    } else if (f > z1) {
      q = 0.55;
      over = true;
      label = t("lube.over");
      color = "#e23b4e";
    } else {
      const mid = (z0 + z1) / 2;
      const closeness = 1 - Math.abs(f - mid) / ((z1 - z0) / 2);
      q = closeness > 0.5 ? 1 : 0.85;
      label = q === 1 ? t("lube.perfect") : t("lube.good");
    }
    this.results.push({ q, over });
    this.pop(label, this.w / 2, this.hgt * 0.35, color);
    play(over ? "ui.error" : q >= 0.85 ? "bench.spring" : "bench.keycapPlace");
    this.phase = "closing";
    this.phaseStart = performance.now();
    this.onProgress(this.results.length);
  }

  protected tick(dt: number) {
    if (this.holding) {
      this.fill = this.currentFill();
      this.brushT += dt;
      if (this.brushT > 0.14) {
        this.brushT = 0;
        play("bench.lubeBrush", { volume: 0.6 });
      }
      if (this.fill >= 1) this.judge();
    }
    if (this.phase === "closing") {
      if (this.phaseT > 0.55) {
        this.round++;
        this.fill = 0;
        if (this.round >= LUBE_ROUNDS) {
          this.phase = "done";
          this.onDone(this.result());
        } else {
          this.phase = "idle";
          play("bench.switchOpen");
        }
      }
    }
  }

  result(): LubeResult {
    const n = this.results.length || 1;
    return {
      quality: this.results.reduce((s, r) => s + r.q, 0) / n,
      over: this.results.filter((r) => r.over).length / n,
    };
  }

  /** Dev/test: finish with perfect results. */
  autoComplete() {
    while (this.results.length < LUBE_ROUNDS) this.results.push({ q: 1, over: false });
    this.phase = "done";
    this.onDone(this.result());
  }

  protected draw() {
    const g = this.g;
    const W = this.w;
    const H = this.hgt;
    const u = Math.min(H / 260, W / 380); // drawing unit, scales with the canvas
    const cx = W * 0.45;
    const cy = H * 0.66;
    const closing = this.phase === "closing" ? Math.min(1, this.phaseT / 0.4) : 0;
    const spread = 1 - closing;
    // Housing bottom
    g.fillStyle = this.sw.housingColor;
    g.globalAlpha = Math.max(0.5, this.sw.housingOpacity);
    roundRect(g, cx - 48 * u, cy + 14 * u * spread + 8 * u, 96 * u, 38 * u, 8 * u);
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = "rgba(0,0,0,0.25)";
    g.stroke();
    // Spring
    g.strokeStyle = "#b8bcc4";
    g.lineWidth = 3 * u;
    g.beginPath();
    for (let i = 0; i <= 10; i++) g.lineTo(cx + (i % 2 ? -14 : 14) * u, cy + (6 - i * 3.5 * spread) * u);
    g.stroke();
    // Stem (gets glossy with lube)
    const sy = cy - (28 + 20 * spread) * u;
    g.fillStyle = this.sw.stemColor;
    roundRect(g, cx - 22 * u, sy, 44 * u, 32 * u, 5 * u);
    g.fill();
    g.fillRect(cx - 5 * u, sy - 16 * u, 10 * u, 18 * u);
    g.fillRect(cx - 14 * u, sy - 11 * u, 28 * u, 7 * u);
    g.fillStyle = `rgba(255,255,255,${0.55 * this.fill})`;
    roundRect(g, cx - 18 * u, sy + 3 * u, 10 * u, 24 * u, 4 * u);
    g.fill();
    // Housing top
    g.fillStyle = this.sw.housingColor;
    g.globalAlpha = Math.max(0.45, this.sw.housingOpacity * 0.9);
    roundRect(g, cx - 50 * u, sy - (34 + 18 * spread) * u, 100 * u, 28 * u, 8 * u);
    g.fill();
    g.globalAlpha = 1;
    // Brush
    if (this.holding) {
      const bx = cx + (30 + Math.sin(this.brushT * 40) * 6) * u;
      const by = sy + 10 * u;
      g.fillStyle = "#8b5a2b";
      g.fillRect(bx, by - 4 * u, 46 * u, 8 * u);
      g.fillStyle = "#f2e6c9";
      g.fillRect(bx - 12 * u, by - 6 * u, 14 * u, 12 * u);
    }
    // Meter
    const mx = W * 0.78;
    const mh = H * 0.7;
    const my = H * 0.15;
    g.fillStyle = "#efe5d6";
    roundRect(g, mx, my, 26, mh, 10);
    g.fill();
    const [z0, z1] = this.zone;
    g.fillStyle = "rgba(46,160,90,0.45)";
    g.fillRect(mx, my + mh * (1 - z1), 26, mh * (z1 - z0));
    g.fillStyle = this.fill > z1 ? "#e23b4e" : "#ff7a45";
    roundRect(g, mx + 5, my + mh * (1 - this.fill), 16, Math.max(4, mh * this.fill), 6);
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.2)";
    g.lineWidth = 1.5;
    roundRect(g, mx, my, 26, mh, 10);
    g.stroke();
    // Labels
    g.fillStyle = "#2b2118";
    g.font = "800 14px system-ui, sans-serif";
    g.textAlign = "left";
    g.fillText(t("lube.counter", { n: Math.min(this.round + 1, LUBE_ROUNDS), total: LUBE_ROUNDS }), 12, 22);
    g.font = "600 12px system-ui, sans-serif";
    g.fillText(t(`lube.tip.${this.sw.type}`), 12, 40);
    if (this.phase === "idle" && !this.holding) {
      g.textAlign = "center";
      g.font = "800 15px system-ui, sans-serif";
      g.fillStyle = "rgba(43,33,24,0.7)";
      g.fillText(t("lube.hold"), cx, H - 10);
    }
    this.drawPops();
  }
}
