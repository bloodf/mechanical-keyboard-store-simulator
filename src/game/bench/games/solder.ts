/**
 * Soldering (3D): the iron hovers over each group of switches; a glowing ring shrinks onto the pad.
 * Tap (or Space) when it lines up. Misses leave cold joints (dead/chattering keys).
 */
import { Mesh, MeshBuilder, TransformNode, Vector3, type ParticleSystem } from "@babylonjs/core";
import type { Control } from "@babylonjs/gui";
import { play } from "../../../audio/engine";
import { t } from "../../../i18n";
import { S, T } from "../../../gui/theme";
import { button, label, stack } from "../../../gui/widgets";
import type { DrawerArea, StepCtx } from "../types";
import { burst, mat, puffs } from "./common";

export const SOLDER_BEATS = 16;
const PAD = 1; // ring scale that matches the pad

export class SolderGame {
  private iron: TransformNode;
  private ring: Mesh;
  private pad: Mesh;
  private smoke: ParticleSystem;
  private sparks: ParticleSystem;
  private beat = 0;
  private beatStart = 0;
  private gapUntil = 0;
  private started = false;
  private finished = false;
  private scores: number[] = [];
  private missed: number[] = [];
  private groups: number[][] = [];
  private status = label("", { size: T.h3, weight: 700 });
  private startBtn: ReturnType<typeof button> | null = null;

  constructor(
    private ctx: StepCtx,
    private onDone: (r: { quality: number; missed: number[] }) => void,
  ) {
    const scene = ctx.store.scene;
    const board = ctx.board()!;
    const keys = board.layout.keys;
    const per = Math.ceil(keys.length / SOLDER_BEATS);
    for (let g = 0; g < SOLDER_BEATS; g++) this.groups.push(keys.slice(g * per, (g + 1) * per).map((k) => k.id));
    this.iron = new TransformNode("iron", scene);
    const handle = MeshBuilder.CreateCylinder("ironHandle", { diameter: 0.018, height: 0.09 }, scene);
    handle.material = mat(scene, "#f26b3a", { spec: 0.3 });
    handle.parent = this.iron;
    handle.position.y = 0.11;
    const shaft = MeshBuilder.CreateCylinder("ironShaft", { diameter: 0.006, height: 0.06 }, scene);
    shaft.material = mat(scene, "#c9ccd1", { spec: 0.9 });
    shaft.parent = this.iron;
    shaft.position.y = 0.04;
    const tip = MeshBuilder.CreateCylinder("ironTip", { diameterTop: 0.006, diameterBottom: 0.0005, height: 0.012 }, scene);
    tip.material = mat(scene, "#ff9f40", { emissive: "#ff5500" });
    tip.parent = this.iron;
    tip.position.y = 0.006;
    this.iron.rotation.z = 0.3;
    this.pad = MeshBuilder.CreateCylinder("pad", { diameter: 0.008, height: 0.0008, tessellation: 20 }, scene);
    this.pad.material = mat(scene, "#d9b458", { spec: 1, emissive: "#2a1f00" });
    this.ring = MeshBuilder.CreateTorus("ring", { diameter: 0.009, thickness: 0.0012, tessellation: 32 }, scene);
    this.ring.material = mat(scene, "#ffffff", { emissive: "#ffffff" });
    this.smoke = puffs(scene, "smoke");
    this.sparks = puffs(scene, "sparks");
    this.moveTo(0);
    this.ring.setEnabled(false);
    ctx.view("top");
    this.updateStatus();
  }

  private groupCenter(g: number): Vector3 {
    const board = this.ctx.board()!;
    const pts = this.groups[g].map((id) => board.keyWorld(id, 1.0));
    return pts.reduce((a, b) => a.add(b), Vector3.Zero()).scale(1 / Math.max(1, pts.length));
  }

  private moveTo(g: number) {
    const c = this.groupCenter(Math.min(g, SOLDER_BEATS - 1));
    this.iron.position.copyFrom(c.add(new Vector3(0, 0.004, 0)));
    this.pad.position.copyFrom(c);
    this.ring.position.copyFrom(c.add(new Vector3(0, 0.001, 0)));
  }

  private dur() {
    return Math.max(0.55, 1.0 - this.beat * 0.025);
  }
  private scaleAt(now: number) {
    const tt = (now - this.beatStart) / 1000;
    return 4 * (1 - Math.min(1, tt / this.dur()));
  }

  private updateStatus() {
    this.status.text = t("solder.count", { n: this.beat, total: SOLDER_BEATS });
  }

  render(area: DrawerArea): Control {
    const row = stack({ horizontal: true, h: Math.min(area.h, 110), spacing: S.lg });
    const info = stack({ w: Math.max(200, area.w - 300), spacing: S.xs });
    info.addControl(this.status);
    row.addControl(info);
    this.startBtn = button(this.started ? `🔥 ${t("solder.tap")}` : t("solder.start"), { w: 190, h: 80, size: "lg", variant: "primary", testId: "solder-tap", sound: false, onClick: () => this.tap() });
    row.addControl(this.startBtn);
    return row;
  }

  private tap() {
    if (!this.started) {
      this.started = true;
      this.beatStart = performance.now() + 350;
      this.gapUntil = this.beatStart;
      this.ring.setEnabled(true);
      this.startBtn?.setLabel(`🔥 ${t("solder.tap")}`);
      return;
    }
    const now = performance.now();
    if (this.finished || now < this.gapUntil) return;
    const d = Math.abs(this.scaleAt(now) - PAD);
    if (d <= 0.35) this.score(1, t("solder.perfect"));
    else if (d <= 0.8) this.score(0.75, t("solder.good"));
    else this.score(0, t("solder.miss"));
  }

  onPointer(type: "down" | "move" | "up") {
    if (type === "down") this.tap();
  }
  onKey(e: KeyboardEvent) {
    if (e.code === "Space" && e.type === "keydown" && !e.repeat) {
      e.preventDefault();
      this.tap();
    }
  }

  private score(q: number, text: string) {
    this.scores.push(q);
    const board = this.ctx.board()!;
    const at = this.groupCenter(this.beat);
    if (q === 0) {
      this.missed.push(this.beat);
      play("bench.deadKey");
      burst(this.sparks, at, 20);
    } else {
      play("bench.solder", { volume: 0.7 });
      burst(this.smoke, at.add(new Vector3(0, 0.006, 0)), 14);
    }
    for (const id of this.groups[this.beat]) board.setMarker(id, q > 0 ? "green" : "red");
    this.ctx.ui.toast(text, q === 1 ? "good" : q > 0 ? "info" : "error");
    this.beat++;
    this.updateStatus();
    this.gapUntil = performance.now() + 300;
    this.beatStart = this.gapUntil;
    this.ctx.wake();
    if (this.beat >= SOLDER_BEATS) {
      this.finished = true;
      this.ring.setEnabled(false);
      setTimeout(() => {
        board.clearMarkers();
        this.onDone({ quality: this.scores.reduce((a, b) => a + b, 0) / this.scores.length, missed: this.missed });
      }, 500);
    } else this.moveTo(this.beat);
  }

  update() {
    if (!this.started || this.finished) return;
    const now = performance.now();
    if (now < this.gapUntil) {
      this.ring.setEnabled(false);
      return;
    }
    this.ring.setEnabled(true);
    const sc = this.scaleAt(now);
    this.ring.scaling.set(Math.max(0.05, sc), 1, Math.max(0.05, sc));
    const near = Math.abs(sc - PAD) <= 0.35;
    (this.ring.material as import("@babylonjs/core").StandardMaterial).emissiveColor.set(near ? 0.5 : 1, 1, near ? 0.6 : 1);
    this.ctx.wake();
    if ((now - this.beatStart) / 1000 > this.dur() + 0.12) this.score(0, t("solder.miss"));
  }

  auto() {
    while (this.beat < SOLDER_BEATS) {
      this.scores.push(1);
      this.beat++;
    }
    this.finished = true;
    this.onDone({ quality: 1, missed: [] });
  }

  dispose() {
    this.iron.dispose(false, true);
    this.ring.dispose();
    this.pad.dispose();
    this.smoke.dispose();
    this.sparks.dispose();
  }
}
