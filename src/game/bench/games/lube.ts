/**
 * Switch lubing (3D): an exploded switch on the bench next to a lube gauge. Hold to brush lube on,
 * release in the green zone. The zone depends on the switch type (tactiles/clickies want little).
 */
import { Color3, Mesh, MeshBuilder, PBRMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import type { Control } from "@babylonjs/gui";
import { play } from "../../../audio/engine";
import type { SwitchProduct } from "../../../data/catalog";
import type { SwitchType } from "../../../data/parts";
import { t } from "../../../i18n";
import { C, S, T } from "../../../gui/theme";
import { button, label, stack } from "../../../gui/widgets";
import { switchParts } from "../../../engine/keyboard/switchModels";
import type { DrawerArea, StepCtx } from "../types";
import { mat } from "./common";

export const LUBE_ZONES: Record<SwitchType, [number, number]> = { linear: [0.55, 0.8], tactile: [0.3, 0.48], clicky: [0.08, 0.22], silent: [0.42, 0.62] };
export const LUBE_ROUNDS = 5;
const GAUGE_H = 0.11;

export class LubeGame {
  private root: TransformNode;
  /** The switch at 4× scale (mm → m × 4), parts by name: top, bottom, stem, spring, jacket, leaf, pins. */
  private parts: Record<string, Mesh> = {};
  private stemMat: PBRMaterial;
  private fillMesh: Mesh;
  private brush: TransformNode;
  private round = 0;
  private holding = false;
  private holdStart = 0;
  private fill = 0;
  private phase: "idle" | "closing" | "done" = "idle";
  private phaseStart = 0;
  private results: { q: number; over: boolean }[] = [];
  private lastBrush = 0;
  private zone: [number, number];
  private counter = label("", { size: T.h3, weight: 700 });

  constructor(
    private ctx: StepCtx,
    private sw: SwitchProduct,
    private onDone: (r: { quality: number; over: number }) => void,
  ) {
    const scene = ctx.store.scene;
    this.zone = LUBE_ZONES[sw.type];
    const anchor = ctx.store.layout.benchAnchor.getAbsolutePosition();
    this.root = new TransformNode("lubeGame", scene);
    // in front of the keyboard, on the mat (the typist is at +Z)
    this.root.position = anchor.add(new Vector3(0.02, 0.002, 0.15));
    // The real switch model, magnified 4×, opened up on the bench
    const fam = sw.family;
    const models = switchParts(fam);
    const sw4 = new TransformNode("switch4x", scene);
    sw4.parent = this.root;
    sw4.scaling.setAll(0.004);
    sw4.position.y = (fam === "choc" ? 5.2 : 8.4) * 0.004;
    const clear = sw.housingOpacity < 1;
    const pm = (hex: string, rough: number, metal = 0, alpha?: number) => {
      const m = new PBRMaterial(`lube-${hex}`, scene);
      m.albedoColor = Color3.FromHexString(hex).toLinearSpace();
      m.roughness = rough;
      m.metallic = metal;
      if (alpha !== undefined && alpha < 1) {
        m.alpha = alpha;
        m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      }
      return m;
    };
    const housing = pm(sw.housingColor, clear ? 0.08 : 0.42, 0, clear ? Math.max(0.45, sw.housingOpacity) : undefined);
    const bottomM = pm(sw.bottomColor ?? sw.housingColor, clear ? 0.1 : 0.45, 0, clear ? 0.6 : undefined);
    this.stemMat = pm(sw.stemColor, 0.5);
    const steel = pm("#c9ccd1", 0.18, 1);
    const gold = pm("#d9b458", 0.25, 1);
    const kind = fam === "choc" && sw.type === "silent" ? "linear" : sw.type;
    const want: [string, string, PBRMaterial][] = [
      ["top", "top", housing],
      ["bottom", fam === "choc" ? "bottom" : "bottom5", bottomM],
      ["stem", `stem_${kind}`, this.stemMat],
      ["spring", "spring", steel],
      ["pins", "pins", gold],
    ];
    if (fam !== "choc") want.push(["leaf", "leaf", steel]);
    if (fam === "box") want.push(["box", "box", this.stemMat]);
    if (kind === "clicky" && fam !== "choc") want.push(["jacket", "jacket", pm("#f6f6f6", 0.4)]);
    for (const [key, name, m] of want) {
      const vd = models?.[name];
      if (!vd) continue;
      const mesh = new Mesh(`lube-${key}`, scene);
      vd.applyToMesh(mesh);
      mesh.material = m;
      mesh.parent = sw4;
      mesh.isPickable = false;
      this.parts[key] = mesh;
    }
    // Gauge (glass tube + fill + green zone)
    const gx = -0.085;
    const glass = MeshBuilder.CreateCylinder("gaugeGlass", { diameter: 0.018, height: GAUGE_H, tessellation: 24 }, scene);
    glass.material = mat(scene, "#ffffff", { alpha: 0.22, spec: 1 });
    glass.parent = this.root;
    glass.position.set(gx, GAUGE_H / 2, 0);
    const [z0, z1] = this.zone;
    const band = MeshBuilder.CreateCylinder("gaugeZone", { diameter: 0.0205, height: (z1 - z0) * GAUGE_H, tessellation: 24 }, scene);
    band.material = mat(scene, "#2ea05a", { alpha: 0.55, emissive: "#0c4a22" });
    band.parent = this.root;
    band.position.set(gx, ((z0 + z1) / 2) * GAUGE_H, 0);
    this.fillMesh = MeshBuilder.CreateCylinder("gaugeFill", { diameter: 0.012, height: GAUGE_H, tessellation: 16 }, scene);
    this.fillMesh.material = mat(scene, "#ff7a45", { spec: 0.6, emissive: "#331000" });
    this.fillMesh.parent = this.root;
    this.fillMesh.position.x = gx;
    const cap = MeshBuilder.CreateCylinder("gaugeCap", { diameter: 0.022, height: 0.006 }, scene);
    cap.material = mat(scene, "#3b3028");
    cap.parent = this.root;
    cap.position.set(gx, GAUGE_H + 0.003, 0);
    // Brush
    this.brush = new TransformNode("lubeBrush", scene);
    this.brush.parent = this.root;
    const handle = MeshBuilder.CreateCylinder("bh", { diameter: 0.006, height: 0.08 }, scene);
    handle.material = mat(scene, "#8b5a2b", { spec: 0.2 });
    handle.parent = this.brush;
    handle.position.y = 0.045;
    const tip = MeshBuilder.CreateCylinder("bt", { diameterTop: 0.008, diameterBottom: 0.003, height: 0.014 }, scene);
    tip.material = mat(scene, "#f2e6c9", { spec: 0.1 });
    tip.parent = this.brush;
    tip.position.y = 0.006;
    this.brush.rotation.z = -0.9;
    this.layoutParts(1);
    this.setFill(0);
    play("bench.switchOpen");
    setTimeout(() => ctx.view({ target: this.root.position.add(new Vector3(-0.02, 0.05, 0)), w: 0.2, d: 0.15, beta: 1.05 }), 50);
    this.updateCounter();
  }

  private speed() {
    return 0.42 * (1 + this.round * 0.16);
  }

  /** spread 1 = opened (exploded view), 0 = closed. Offsets in real mm. */
  private layoutParts(spread: number) {
    const off: Record<string, number> = { spring: 4, stem: 9, jacket: 9, box: 16, top: 16 };
    for (const [k, m] of Object.entries(this.parts)) m.position.y = (off[k] ?? 0) * spread;
  }

  private setFill(f: number) {
    this.fill = f;
    this.fillMesh.scaling.y = Math.max(0.01, f);
    this.fillMesh.position.y = (f * GAUGE_H) / 2;
    (this.fillMesh.material as PBRMaterial).albedoColor = Color3.FromHexString(f > this.zone[1] ? "#e23b4e" : "#ff7a45").toLinearSpace();
    // lube makes the stem glossy
    this.stemMat.roughness = Math.max(0.08, 0.5 - f * 0.45);
    this.stemMat.clearCoat.isEnabled = f > 0.05;
    this.stemMat.clearCoat.intensity = Math.min(1, f * 1.5);
  }

  private updateCounter() {
    this.counter.text = t("lube.counter", { n: Math.min(this.round + 1, LUBE_ROUNDS), total: LUBE_ROUNDS });
  }

  render(area: DrawerArea): Control {
    if (area.portrait) {
      const col = stack({ w: area.w, spacing: S.xs });
      col.addControl(this.counter);
      col.addControl(label(t(`lube.tip.${this.sw.type}`), { size: T.small, weight: 600, color: C.inkSoft, wrap: true }));
      const hold = button(`🖌️ ${t("lube.hold")}`, { w: area.w - 130, h: 60, size: "md", variant: "primary", testId: "lube-hold", sound: false });
      hold.onPointerDownObservable.add(() => this.press(true));
      hold.onPointerUpObservable.add(() => this.press(false));
      col.addControl(hold);
      return col;
    }
    const row = stack({ horizontal: true, h: Math.min(area.h, 120), spacing: S.lg });
    const info = stack({ w: Math.max(200, area.w - 360), spacing: S.xs });
    info.addControl(this.counter);
    info.addControl(label(t(`lube.tip.${this.sw.type}`), { size: T.body, weight: 600, color: C.inkSoft, wrap: true }));
    row.addControl(info);
    const hold = button(`🖌️ ${t("lube.hold")}`, { w: 190, h: 80, size: "lg", variant: "primary", testId: "lube-hold", sound: false });
    hold.onPointerDownObservable.add(() => this.press(true));
    hold.onPointerUpObservable.add(() => this.press(false));
    row.addControl(hold);
    return row;
  }

  private press(down: boolean) {
    if (down && !this.holding && this.phase === "idle") {
      this.holding = true;
      this.holdStart = performance.now();
    } else if (!down && this.holding) this.judge();
  }

  onPointer(type: "down" | "move" | "up") {
    if (type === "down") this.press(true);
    if (type === "up") this.press(false);
  }

  onKey(e: KeyboardEvent) {
    if (e.code !== "Space") return;
    e.preventDefault();
    if (e.type === "keydown" && !e.repeat) this.press(true);
    if (e.type === "keyup") this.press(false);
  }

  private current() {
    return Math.min(1, ((performance.now() - this.holdStart) / 1000) * this.speed());
  }

  private judge() {
    const f = this.current();
    this.setFill(f);
    this.holding = false;
    const [z0, z1] = this.zone;
    let q: number;
    let over = false;
    let text: string;
    let kind: "good" | "info" | "error" = "good";
    if (f < z0) {
      q = Math.max(0, (f / z0) * 0.6);
      text = t("lube.under");
      kind = "info";
    } else if (f > z1) {
      q = 0.55;
      over = true;
      text = t("lube.over");
      kind = "error";
    } else {
      const mid = (z0 + z1) / 2;
      q = 1 - Math.abs(f - mid) / ((z1 - z0) / 2) > 0.5 ? 1 : 0.85;
      text = q === 1 ? t("lube.perfect") : t("lube.good");
    }
    this.results.push({ q, over });
    this.ctx.ui.toast(text, kind);
    play(over ? "ui.error" : q >= 0.85 ? "bench.spring" : "bench.keycapPlace");
    this.phase = "closing";
    this.phaseStart = performance.now();
    this.ctx.update();
  }

  update() {
    if (this.holding) {
      this.setFill(this.current());
      this.brush.position.set(0.012 + Math.sin(performance.now() / 40) * 0.006, 0.085, 0.014);
      this.brush.setEnabled(true);
      if (performance.now() - this.lastBrush > 140) {
        this.lastBrush = performance.now();
        play("bench.lubeBrush", { volume: 0.6 });
      }
      if (this.fill >= 1) this.judge();
      this.ctx.wake();
    } else this.brush.setEnabled(false);
    if (this.phase === "closing") {
      const p = Math.min(1, (performance.now() - this.phaseStart) / 400);
      this.layoutParts(1 - p);
      this.ctx.wake();
      if (performance.now() - this.phaseStart > 650) {
        this.round++;
        this.setFill(0);
        this.layoutParts(1);
        if (this.round >= LUBE_ROUNDS) {
          this.phase = "done";
          this.finish();
        } else {
          this.phase = "idle";
          play("bench.switchOpen");
          this.updateCounter();
        }
      }
    }
  }

  private finish() {
    const n = this.results.length || 1;
    this.onDone({ quality: this.results.reduce((s, r) => s + r.q, 0) / n, over: this.results.filter((r) => r.over).length / n });
  }

  auto() {
    while (this.results.length < LUBE_ROUNDS) this.results.push({ q: 1, over: false });
    this.phase = "done";
    this.finish();
  }

  dispose() {
    this.root.dispose(false, true);
  }
}
