/**
 * Tape mod (3D): the PCB flips over on the bench; drag across each row of its back to lay a strip
 * of tape. Straight, full-width strips score best.
 */
import { Matrix, Mesh, MeshBuilder, Vector3 } from "@babylonjs/core";
import type { Control } from "@babylonjs/gui";
import { play } from "../../../audio/engine";
import { t } from "../../../i18n";
import { C, S, T } from "../../../gui/theme";
import { label, stack } from "../../../gui/widgets";
import type { DrawerArea, StepCtx } from "../types";
import { hitY, mat, minigameRegistry } from "./common";
import { tapeStrips } from "../sync";

export class TapeGame {
  private lanes: number;
  private strips: { row: number; quality: number; from: number; to: number }[] = [];
  private guides: Mesh[] = [];
  private preview: Mesh;
  private drag: { row: number; x0: number; x1: number; zs: number[] } | null = null;
  private status = label("", { size: T.h3, weight: 700 });
  private finished = false;

  constructor(
    private ctx: StepCtx,
    private onDone: (quality: number) => void,
  ) {
    const board = ctx.board()!;
    const L = board.layout;
    this.lanes = Math.ceil(L.depth);
    board.flipPcb(true);
    const scene = ctx.store.scene;
    const guideMat = mat(scene, "#ffd24a", { alpha: 0.28, emissive: "#332200" });
    guideMat.backFaceCulling = false;
    for (let r = 0; r < this.lanes; r++) {
      const g = MeshBuilder.CreatePlane("laneGuide", { width: L.width - 0.2, height: (L.depth / this.lanes) * 0.35 }, scene);
      g.material = guideMat;
      g.parent = board.tapeNode;
      g.rotation.x = -Math.PI / 2;
      g.position.set(0, -0.052, this.laneZ(r));
      g.isPickable = false;
      this.guides.push(g);
    }
    this.preview = MeshBuilder.CreatePlane("tapePreview", { width: 1, height: (L.depth / this.lanes) * 0.7 }, scene);
    const pm = mat(scene, "#cfe3ff", { alpha: 0.75, spec: 0.6 });
    pm.backFaceCulling = false;
    this.preview.material = pm;
    this.preview.parent = board.tapeNode;
    this.preview.rotation.x = -Math.PI / 2;
    this.preview.setEnabled(false);
    this.updateStatus();
    setTimeout(() => ctx.view("top"), 50);
    minigameRegistry.current = this;
  }

  /** Dev/test: screen start/end points of each unfinished lane. */
  debugPoints() {
    const board = this.ctx.board()!;
    const L = board.layout;
    const w = board.tapeNode.getWorldMatrix();
    return Array.from({ length: this.lanes }, (_, row) => {
      const z = this.laneZ(row);
      const a = Vector3.TransformCoordinates(new Vector3((L.width - 0.2) / 2 - 0.1, -0.05, z), w);
      const b = Vector3.TransformCoordinates(new Vector3(-(L.width - 0.2) / 2 + 0.1, -0.05, z), w);
      return { row, done: this.strips.some((s) => s.row === row), a: this.ctx.store.toScreen(a), b: this.ctx.store.toScreen(b) };
    });
  }

  private laneZ(row: number) {
    const L = this.ctx.board()!.layout;
    // tape strips sit at z = -((row+0.5)*(depth/rows) - depth/2) in tapeNode space (see Board.setTape)
    return -((row + 0.5) * (L.depth / this.lanes) - L.depth / 2);
  }

  /** Pointer → tapeNode-local point on the PCB back. */
  private local(x: number, y: number): Vector3 | null {
    const board = this.ctx.board()!;
    const ray = this.ctx.store.rayAt(x, y);
    const world = hitY(ray, board.tapeNode.getAbsolutePosition().y);
    if (!world) return null;
    return Vector3.TransformCoordinates(world, Matrix.Invert(board.tapeNode.getWorldMatrix()));
  }

  private updateStatus() {
    this.status.text = t("tape.count", { n: this.strips.length, total: this.lanes });
  }

  render(area: DrawerArea): Control {
    const col = stack({ w: area.w, spacing: S.sm });
    col.addControl(label(t("tape.hint"), { size: T.body, weight: 600, color: C.inkSoft, wrap: true }));
    col.addControl(this.status);
    return col;
  }

  onPointer(type: "down" | "move" | "up", x: number, y: number) {
    if (this.finished) return;
    const L = this.ctx.board()!.layout;
    const p = this.local(x, y);
    if (type === "down") {
      if (!p) return;
      // invert laneZ(): z = D/2 - (row + 0.5) * laneH
      const row = Math.floor((L.depth / 2 - p.z) / (L.depth / this.lanes));
      if (row < 0 || row >= this.lanes || this.strips.some((s) => s.row === row)) return;
      this.drag = { row, x0: p.x, x1: p.x, zs: [p.z] };
    } else if (type === "move" && this.drag && p) {
      this.drag.x1 = p.x;
      this.drag.zs.push(p.z);
      const w = Math.abs(this.drag.x1 - this.drag.x0);
      this.preview.setEnabled(w > 0.05);
      this.preview.scaling.x = Math.max(0.05, w);
      this.preview.position.set((this.drag.x0 + this.drag.x1) / 2, -0.056, this.laneZ(this.drag.row));
    } else if (type === "up" && this.drag) {
      const d = this.drag;
      this.drag = null;
      this.preview.setEnabled(false);
      const full = L.width - 0.2;
      const span = Math.abs(d.x1 - d.x0) / full;
      if (span < 0.7) return;
      const laneH = L.depth / this.lanes;
      const dev = d.zs.reduce((s, z) => s + Math.abs(z - this.laneZ(d.row)), 0) / d.zs.length;
      const quality = Math.max(0, Math.min(1, (1 - dev / (laneH * 0.5)) * 0.8 + Math.min(1, span) * 0.2));
      const a = (Math.min(d.x0, d.x1) + full / 2) / full;
      const b = (Math.max(d.x0, d.x1) + full / 2) / full;
      this.strips.push({ row: d.row, quality, from: Math.max(0, 1 - b), to: Math.min(1, 1 - a) });
      this.guides[d.row].setEnabled(false);
      this.ctx.board()!.setTape(this.strips.map((s) => ({ row: s.row, offset: (1 - s.quality) * (s.row % 2 ? 1 : -1), from: s.from, to: s.to })));
      play("bench.tape");
      this.updateStatus();
      this.ctx.wake();
      if (this.strips.length >= this.lanes) this.finish();
    }
  }

  private finish() {
    this.finished = true;
    const q = this.strips.reduce((s, x) => s + x.quality, 0) / this.strips.length;
    setTimeout(() => {
      const board = this.ctx.board();
      board?.setTape(tapeStrips(q, this.lanes));
      board?.flipPcb(false);
      this.ctx.view("overview");
      this.onDone(q);
    }, 400);
  }

  auto() {
    for (let r = 0; r < this.lanes; r++) if (!this.strips.some((s) => s.row === r)) this.strips.push({ row: r, quality: 1, from: 0, to: 1 });
    this.finish();
  }

  dispose() {
    if (minigameRegistry.current === this) minigameRegistry.current = null;
    this.guides.forEach((g) => g.dispose());
    this.preview.dispose();
  }
}
