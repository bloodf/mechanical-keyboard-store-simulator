/** Stabilizer wire lubing (3D): drag the brush along a big wire on the bench before time runs out. */
import { Mesh, MeshBuilder, TransformNode, Vector3 } from "@babylonjs/core";
import type { Control, Rectangle } from "@babylonjs/gui";
import { play } from "../../../audio/engine";
import { t } from "../../../i18n";
import { C, S, T } from "../../../gui/theme";
import { bar, label, stack } from "../../../gui/widgets";
import type { DrawerArea, StepCtx } from "../types";
import { hitY, mat, minigameRegistry } from "./common";
import { roundedBox } from "../../../engine/geometry";

const SEGMENTS = 44;
const TIME = 5;

export class WireGame {
  private root: TransformNode;
  private segs: Mesh[] = [];
  private pts: Vector3[] = [];
  private coated: boolean[] = new Array(SEGMENTS).fill(false);
  private brush: TransformNode;
  private wire = 0;
  private started = 0;
  private results: number[] = [];
  private brushT = 0;
  private down = false;
  private finished = false;
  private dry;
  private wet;
  private status = label("", { size: T.h3, weight: 700 });
  private timer: Rectangle = bar(1, { thickness: 10, color: C.accent });

  constructor(
    private ctx: StepCtx,
    private wires: number,
    private onDone: (coverage: number) => void,
  ) {
    const scene = ctx.store.scene;
    const anchor = ctx.store.layout.benchAnchor.getAbsolutePosition();
    this.root = new TransformNode("wireGame", scene);
    this.root.position = anchor.add(new Vector3(0, 0.03, 0.0));
    this.dry = mat(scene, "#b9bec6", { spec: 0.6 });
    this.wet = mat(scene, "#f2d06b", { spec: 1, emissive: "#3a2c00" });
    // U-shaped wire: long bar with legs bending back into the housings
    const half = 0.12;
    for (let i = 0; i <= SEGMENTS; i++) {
      const u = i / SEGMENTS;
      let p: Vector3;
      if (u < 0.1) p = new Vector3(half, 0.0, -0.035 * (1 - u / 0.1));
      else if (u > 0.9) p = new Vector3(-half, 0.0, -0.035 * ((u - 0.9) / 0.1));
      else p = new Vector3(half - ((u - 0.1) / 0.8) * half * 2, 0, 0);
      this.pts.push(p);
    }
    for (let i = 0; i < SEGMENTS; i++) {
      const s = MeshBuilder.CreateTube("wireSeg", { path: [this.pts[i], this.pts[i + 1]], radius: 0.0035, tessellation: 10, cap: Mesh.CAP_ALL }, scene);
      s.material = this.dry;
      s.parent = this.root;
      s.isPickable = false;
      this.segs.push(s);
    }
    const hm = mat(scene, "#2a2a2a", { spec: 0.2 });
    for (const x of [half, -half]) {
      const h = roundedBox("stabHousing", { w: 0.022, h: 0.02, d: 0.03, r: 0.004 }, scene);
      h.material = hm;
      h.parent = this.root;
      h.position.set(x, 0.0, -0.045);
    }
    // Brush
    this.brush = new TransformNode("brush", scene);
    const handle = MeshBuilder.CreateCylinder("brushHandle", { diameter: 0.006, height: 0.08 }, scene);
    handle.material = mat(scene, "#8b5a2b", { spec: 0.2 });
    handle.parent = this.brush;
    handle.position.y = 0.045;
    const tip = MeshBuilder.CreateCylinder("brushTip", { diameterTop: 0.008, diameterBottom: 0.004, height: 0.014 }, scene);
    tip.material = mat(scene, "#f2e6c9", { spec: 0.1 });
    tip.parent = this.brush;
    tip.position.y = 0.006;
    this.brush.rotation.z = 0.35;
    this.brush.setEnabled(false);
    setTimeout(() => ctx.view({ target: this.root.position.clone(), w: 0.3, d: 0.12, beta: 0.55 }), 50);
    this.updateStatus();
    minigameRegistry.current = this;
  }

  /** Dev/test: the wire path on screen. */
  debugPoints() {
    return { wire: this.wire, path: this.pts.map((p) => this.ctx.store.toScreen(p.add(this.root.position))) };
  }

  private coverage() {
    return this.coated.filter(Boolean).length / SEGMENTS;
  }
  private updateStatus() {
    this.status.text = `${t("stab.wire", { n: Math.min(this.wire + 1, this.wires), total: this.wires })} · ${t("stab.coverage", { pct: Math.round(this.coverage() * 100) })}`;
  }

  render(area: DrawerArea): Control {
    const col = stack({ w: area.w, spacing: S.sm });
    col.addControl(label(t("stab.lubeHint"), { size: T.body, weight: 600, color: C.inkSoft, wrap: true }));
    col.addControl(this.status);
    col.addControl(this.timer);
    return col;
  }

  onPointer(type: "down" | "move" | "up", x: number, y: number) {
    if (this.finished) return;
    if (type === "down") {
      this.down = true;
      if (!this.started) this.started = performance.now();
    }
    if (type === "up") {
      this.down = false;
      this.brush.setEnabled(false);
      return;
    }
    const p = hitY(this.ctx.store.rayAt(x, y), this.root.position.y);
    if (!p) return;
    this.brush.setEnabled(true);
    this.brush.position.copyFrom(p);
    if (!this.down) return;
    const local = p.subtract(this.root.position);
    let any = false;
    this.segs.forEach((s, i) => {
      if (this.coated[i]) return;
      const mid = this.pts[i].add(this.pts[i + 1]).scale(0.5);
      if (Math.hypot(mid.x - local.x, mid.z - local.z) < 0.016) {
        this.coated[i] = true;
        s.material = this.wet;
        any = true;
      }
    });
    if (any) {
      this.ctx.wake();
      if (this.brushT <= 0) {
        play("bench.lubeBrush", { volume: 0.5 });
        this.brushT = 0.12;
      }
      this.updateStatus();
      if (this.coated.every(Boolean)) this.nextWire();
    }
  }

  update(dt: number) {
    this.brushT -= dt;
    if (this.finished || !this.started) return;
    const left = Math.max(0, TIME - (performance.now() - this.started) / 1000);
    (this.timer.children[0] as Rectangle).width = `${(left / TIME) * 100}%`;
    (this.timer.children[0] as Rectangle).background = left < 1.5 ? C.bad : C.accent;
    if (left <= 0) this.nextWire();
  }

  private nextWire() {
    const c = this.coverage();
    this.results.push(c);
    play(c > 0.85 ? "ui.confirm" : "ui.toggle");
    this.ctx.ui.toast(`${Math.round(c * 100)}%`, c > 0.85 ? "good" : "info");
    this.wire++;
    this.started = 0;
    this.coated.fill(false);
    this.segs.forEach((s) => (s.material = this.dry));
    (this.timer.children[0] as Rectangle).width = "100%";
    if (this.wire >= this.wires) {
      this.finished = true;
      this.onDone(this.results.reduce((a, b) => a + b, 0) / this.results.length);
    } else this.updateStatus();
  }

  auto() {
    while (this.results.length < this.wires) this.results.push(1);
    this.finished = true;
    this.onDone(1);
  }

  dispose() {
    if (minigameRegistry.current === this) minigameRegistry.current = null;
    this.root.dispose(false, true);
    this.brush.dispose(false, true);
  }
}
