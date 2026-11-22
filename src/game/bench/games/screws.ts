/** Closing the case (3D): click & hold a screw — the driver turns it; release with the needle in the green. */
import { Mesh, MeshBuilder, TransformNode, Vector3, type Scene } from "@babylonjs/core";
import type { Control } from "@babylonjs/gui";
import { play } from "../../../audio/engine";
import { t } from "../../../i18n";
import { S, T } from "../../../gui/theme";
import { drawBox, label, stack, type DrawBox } from "../../../gui/widgets";
import type { DrawerArea, StepCtx } from "../types";
import { mat, minigameRegistry } from "./common";
import { screwZone } from "../../../build/tools";


export class ScrewGame {
  private screws: { node: TransformNode; head: Mesh; state: "open" | "tight" | "loose" | "stripped" }[] = [];
  private driver: TransformNode;
  private active = -1;
  private holdStart = 0;
  private torque = 0;
  private lastTick = 0;
  private finished = false;
  private gauge: DrawBox;
  private status = label("", { size: T.h3, weight: 700 });
  private zone: [number, number];

  constructor(
    private ctx: StepCtx,
    private onDone: (r: { quality: number; loose: number; stripped: number }) => void,
  ) {
    this.zone = screwZone(ctx.state);
    const scene = ctx.store.scene;
    const board = ctx.board()!;
    const n = board.layout.id === "tkl" || board.layout.id === "full" ? 8 : 6;
    const headMat = mat(scene, "#c9ccd1", { spec: 0.9 });
    const slotMat = mat(scene, "#3a3d42", { spec: 0.2 });
    for (const p of board.screwPoints(n)) {
      const node = new TransformNode("screw", scene);
      node.parent = board.root;
      node.position = p.add(new Vector3(0, 0.25, 0)); // sticks out until tightened
      const head = MeshBuilder.CreateCylinder("screwHead", { diameter: 0.5, height: 0.14, tessellation: 24 }, scene);
      head.material = mat(scene, "#d8dbe0", { spec: 0.9, emissive: "#6a4a00" }); // glows until tightened
      head.parent = node;
      head.isPickable = true;
      const shaft = MeshBuilder.CreateCylinder("screwShaft", { diameter: 0.16, height: 0.3 }, scene);
      shaft.material = headMat;
      shaft.parent = node;
      shaft.position.y = -0.2;
      for (const rot of [0, Math.PI / 2]) {
        const slot = MeshBuilder.CreateBox("slot", { width: 0.36, height: 0.03, depth: 0.06 }, scene);
        slot.material = slotMat;
        slot.parent = node;
        slot.position.y = 0.06;
        slot.rotation.y = rot;
      }
      this.screws.push({ node, head, state: "open" });
    }
    this.driver = this.makeDriver(scene);
    this.driver.setEnabled(false);
    this.gauge = drawBox((g, x, y, w, h, k) => this.paintGauge(g, x, y, w, h, k), { w: 150, h: 90 });
    ctx.view("overview");
    this.updateStatus();
    minigameRegistry.current = this;
  }

  /** Dev/test: screen position of each screw that still needs tightening. */
  debugPoints() {
    return this.screws.map((s, i) => ({ i, open: s.state === "open", p: this.ctx.store.toScreen(s.head.getAbsolutePosition()) }));
  }

  private makeDriver(scene: Scene) {
    const d = new TransformNode("driver", scene);
    const handle = MeshBuilder.CreateCapsule("drvHandle", { radius: 0.011, height: 0.07 }, scene);
    handle.material = mat(scene, "#e23b3b", { spec: 0.4 });
    handle.parent = d;
    handle.position.y = 0.09;
    const shaft = MeshBuilder.CreateCylinder("drvShaft", { diameter: 0.004, height: 0.06 }, scene);
    shaft.material = mat(scene, "#c9ccd1", { spec: 0.9 });
    shaft.parent = d;
    shaft.position.y = 0.03;
    return d;
  }

  private paintGauge(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number) {
    const cx = x + w / 2;
    const cy = y + h - 10 * k;
    const R = Math.min(w / 2, h) - 12 * k;
    const arc = (a: number, b: number, color: string) => {
      g.strokeStyle = color;
      g.lineWidth = 12 * k;
      g.beginPath();
      g.arc(cx, cy, R, Math.PI + a * Math.PI, Math.PI + b * Math.PI);
      g.stroke();
    };
    arc(0, 1, "#e9dfcf");
    arc(this.zone[0], this.zone[1], "#2ea05a");
    arc(0.97, 1, "#e23b4e");
    const a = Math.PI + this.torque * Math.PI;
    g.strokeStyle = "#2b2118";
    g.lineWidth = 4 * k;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    g.stroke();
  }

  private updateStatus() {
    this.status.text = t("screws.count", { n: this.screws.filter((s) => s.state !== "open").length, total: this.screws.length });
  }

  render(area: DrawerArea): Control {
    const row = stack({ horizontal: true, h: Math.min(area.h, 100), spacing: S.lg });
    const info = stack({ w: Math.max(200, area.w - 200), spacing: S.xs });
    info.addControl(this.status);
    row.addControl(info);
    row.addControl(this.gauge);
    return row;
  }

  onPointer(type: "down" | "move" | "up", x: number, y: number) {
    if (this.finished) return;
    if (type === "down") {
      const ray = this.ctx.store.rayAt(x, y);
      const hit = this.ctx.store.scene.pickWithRay(ray, (m) => this.screws.some((s) => s.head === m && s.state === "open"));
      const i = this.screws.findIndex((s) => s.head === hit?.pickedMesh);
      if (i < 0) return;
      this.active = i;
      this.holdStart = performance.now();
      this.torque = 0;
      this.driver.setEnabled(true);
    } else if (type === "up" && this.active >= 0) this.release();
  }

  private release() {
    this.torque = Math.min(1, ((performance.now() - this.holdStart) / 1000) * 0.75);
    const s = this.screws[this.active];
    const color = (hex: string) => ((s.head.material = mat(this.ctx.store.scene, hex, { spec: 0.8 })), undefined);
    if (this.torque > 0.97) {
      s.state = "stripped";
      color("#e87a86");
      play("ui.error");
      this.ctx.ui.toast(t("screws.stripped"), "error");
    } else if (this.torque >= this.zone[0] && this.torque <= this.zone[1]) {
      s.state = "tight";
      color("#7ed69a");
      play("ui.confirm");
      this.ctx.ui.toast(t("screws.tight"), "good");
    } else {
      s.state = "loose";
      color("#f0c060");
      play("ui.toggle");
      this.ctx.ui.toast(t("screws.loose"));
    }
    this.active = -1;
    this.torque = 0;
    this.driver.setEnabled(false);
    this.gauge.redraw();
    this.updateStatus();
    if (this.screws.every((x) => x.state !== "open")) {
      this.finished = true;
      setTimeout(() => this.onDone(this.result()), 400);
    }
  }

  private result() {
    const n = this.screws.length;
    const c = (st: string) => this.screws.filter((s) => s.state === st).length;
    return { quality: (c("tight") + c("loose") * 0.6 + c("stripped") * 0.3) / n, loose: c("loose") / n, stripped: c("stripped") / n };
  }

  update() {
    if (this.active < 0) return;
    this.torque = Math.min(1, ((performance.now() - this.holdStart) / 1000) * 0.75);
    const s = this.screws[this.active];
    s.node.rotation.y = this.torque * 14;
    const world = s.node.getAbsolutePosition();
    this.driver.position.copyFrom(world.add(new Vector3(0, 0.003 * (1 - this.torque) + 0.0015, 0)));
    this.driver.rotation.y = s.node.rotation.y;
    const baseY = this.ctx.board()!.screwPoints(this.screws.length)[this.active].y + 0.25;
    s.node.position.y = baseY - this.torque * 0.25;
    if (performance.now() - this.lastTick > 300) {
      this.lastTick = performance.now();
      play("bench.screw", { volume: 0.5 });
    }
    this.gauge.redraw();
    this.ctx.wake();
    if (this.torque >= 1) this.release();
  }

  auto() {
    this.screws.forEach((s) => s.state === "open" && (s.state = "tight"));
    this.finished = true;
    this.onDone(this.result());
  }

  dispose() {
    if (minigameRegistry.current === this) minigameRegistry.current = null;
    this.screws.forEach((s) => s.node.dispose(false, true));
    this.driver.dispose(false, true);
  }
}
