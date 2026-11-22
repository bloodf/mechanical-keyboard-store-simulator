/**
 * Owner of the in-canvas UI for a scene: scaling to the screen, screen/overlay layers,
 * toasts, modals, and a test hook to locate named controls on screen.
 */
import { AdvancedDynamicTexture, Container, Control, Rectangle, StackPanel } from "@babylonjs/gui";
import type { Scene } from "@babylonjs/core";
import { play } from "../audio/engine";
import { C, R, S, T } from "./theme";
import { button, H_CENTER, label, panel, stack, V_BOTTOM, V_CENTER, V_TOP } from "./widgets";

export class Ui {
  readonly adt: AdvancedDynamicTexture;
  /** Current screen content (title, HUD, bench panels…). */
  readonly screen: Container;
  /** Persistent bar above the screen layer (the workshop HUD). */
  readonly hud: Container;
  /** Always-on-top layer for modals. */
  readonly overlay: Container;
  private toasts: StackPanel;
  private resizeFns = new Set<() => void>();
  /** Close functions of open dismissable modals (Esc closes the top one). */
  private dismiss: (() => void)[] = [];
  private onEsc = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !this.dismiss.length) return;
    e.preventDefault();
    this.dismiss[this.dismiss.length - 1]();
  };
  W = 1280;
  H = 800;
  portrait = false;
  compact = false; // small landscape (phones on their side)

  constructor(private scene: Scene) {
    this.adt = AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
    this.adt.useInvalidateRectOptimization = false;
    // UI must not go through tone mapping / bloom: keep its colors exact.
    if (this.adt.layer) this.adt.layer.applyPostProcess = false;
    this.screen = new Container("screen");
    this.hud = new Container("hud-layer");
    this.hud.isHitTestVisible = false;
    this.overlay = new Container("overlay");
    this.overlay.isPointerBlocker = false;
    // Layout layers must not swallow pointer events (Babylon containers do when hit-testable).
    this.screen.isHitTestVisible = false;
    this.overlay.isHitTestVisible = false;
    this.toasts = new StackPanel("toasts");
    this.toasts.isVertical = true;
    this.toasts.spacing = S.sm;
    this.toasts.verticalAlignment = V_TOP;
    this.toasts.top = "90px";
    this.toasts.isPointerBlocker = false;
    this.toasts.isHitTestVisible = false;
    this.adt.addControl(this.screen);
    this.adt.addControl(this.hud);
    this.adt.addControl(this.overlay);
    this.adt.addControl(this.toasts);
    window.addEventListener("keydown", this.onEsc);
    this.fit();
  }

  /** Recompute ideal size from the canvas; call on window resize. */
  fit() {
    const canvas = this.scene.getEngine().getRenderingCanvas()!;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.portrait = h > w * 1.05;
    this.compact = !this.portrait && h < 560;
    if (this.portrait) {
      this.adt.idealWidth = 440;
      this.adt.idealHeight = 0;
      this.W = 440;
      this.H = (440 * h) / w;
    } else {
      const ideal = this.compact ? 540 : 800;
      this.adt.idealHeight = ideal;
      this.adt.idealWidth = 0;
      this.H = ideal;
      this.W = (ideal * w) / h;
    }
    this.resizeFns.forEach((f) => f());
  }

  onResize(fn: () => void): () => void {
    this.resizeFns.add(fn);
    return () => this.resizeFns.delete(fn);
  }

  /** Replace the screen layer's content. */
  setScreen(...controls: Control[]) {
    this.screen.clearControls();
    for (const c of controls) this.screen.addControl(c);
  }

  clearOverlay() {
    this.overlay.clearControls();
  }

  toast(text: string, kind: "info" | "error" | "good" = "info") {
    play(kind === "error" ? "ui.error" : "ui.toast");
    const r = new Rectangle();
    r.thickness = 0;
    r.cornerRadius = 999;
    r.background = kind === "error" ? C.bad : kind === "good" ? C.good : C.dark;
    r.adaptWidthToChildren = true;
    r.height = "46px";
    r.isPointerBlocker = false;
    r.isHitTestVisible = false;
    r.shadowColor = C.shadow;
    r.shadowBlur = 12;
    r.shadowOffsetY = 4;
    const t = label(text, { size: T.body, weight: 600, color: C.white, align: H_CENTER });
    t.resizeToFit = true;
    t.paddingLeft = "22px";
    t.paddingRight = "22px";
    t.width = "";
    r.addControl(t);
    this.toasts.addControl(r);
    let a = 0;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      a += this.scene.getEngine().getDeltaTime() / 1000;
      r.alpha = a < 0.2 ? a / 0.2 : a > 2.1 ? Math.max(0, 1 - (a - 2.1) / 0.4) : 1;
      if (a > 2.5) {
        this.toasts.removeControl(r);
        this.scene.onBeforeRenderObservable.remove(obs);
      }
    });
  }

  /**
   * Show a centered modal. `build` fills the panel; returns a close function.
   * Clicking the dimmed background closes it when `dismissable`.
   */
  modal(o: { w: number; h: number; name: string; dismissable?: boolean; onClose?: () => void }, build: (p: Rectangle, close: () => void) => void): () => void {
    play("ui.open");
    const scrim = new Rectangle(`${o.name}-scrim`);
    scrim.thickness = 0;
    scrim.background = C.scrim;
    scrim.isPointerBlocker = true;
    const w = Math.min(o.w, this.W - 24);
    const h = Math.min(o.h, this.H - 24);
    const p = panel({ w, h, name: o.name, radius: R.xl, ha: H_CENTER, va: V_CENTER });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      play("ui.close");
      this.overlay.removeControl(scrim);
      this.dismiss = this.dismiss.filter((f) => f !== close);
      o.onClose?.();
    };
    if (o.dismissable) {
      scrim.onPointerClickObservable.add((_, s) => s.target === scrim && close());
      this.dismiss.push(close);
    }
    scrim.addControl(p);
    build(p, close);
    this.overlay.addControl(scrim);
    return close;
  }

  /** Yes/no confirmation dialog. */
  confirm(text: string, yes: string, no: string, onYes: () => void, name = "confirm") {
    this.modal({ w: 480, h: 240, name, dismissable: true }, (p, close) => {
      p.addControl(label(text, { size: T.h3, weight: 600, wrap: true, w: "86%", y: S.xl, ha: H_CENTER, align: H_CENTER }));
      const row = stack({ horizontal: true, spacing: S.md, h: 58, y: -S.xl, ha: H_CENTER, va: V_BOTTOM });
      row.addControl(button(no, { w: 180, testId: `${name}-no`, onClick: close }));
      row.addControl(button(yes, { w: 180, variant: "danger", testId: `${name}-yes`, onClick: () => (close(), onYes()) }));
      p.addControl(row);
    });
  }

  /** Test hook: where is a named control on screen (CSS px)? null if missing or hidden. */
  find(name: string): { x: number; y: number; w: number; h: number } | null {
    const c = this.adt.getControlByName(name);
    if (!c) return null;
    for (let n: Control | null = c; n; n = n.parent) if (!n.isVisible || n.alpha === 0) return null;
    const m = c._currentMeasure;
    if (m.width <= 0 || m.height <= 0) return null; // not laid out yet
    const canvas = this.scene.getEngine().getRenderingCanvas()!;
    const sx = canvas.clientWidth / this.scene.getEngine().getRenderWidth();
    const sy = canvas.clientHeight / this.scene.getEngine().getRenderHeight();
    return { x: (m.left + m.width / 2) * sx, y: (m.top + m.height / 2) * sy, w: m.width * sx, h: m.height * sy };
  }

  dispose() {
    window.removeEventListener("keydown", this.onEsc);
    this.adt.dispose();
  }
}
