/**
 * The workbench: the keyboard being built, the step bar, the order ticket and the parts drawer.
 * When nothing is on the bench it shows the accepted orders you can start.
 * Routes 3D pointer + keyboard input to the active step and saves after every change.
 */
import { PointerEventTypes, type Observer, type PointerInfo, type Scene } from "@babylonjs/core";
import { play } from "../../audio/engine";
import { KEY_PRESETS } from "../../audio/keyPress";
import { computeProfile } from "../../build/profile";
import { evaluateBuild, type BuildResult } from "../../build/scoring";
import { canGoBack, nextStep, prevStep, stepDone, stepsFor } from "../../build/session";
import { give } from "../../build/stock";
import type { BuildSession, StepId } from "../../build/types";
import { abandonBuild, formatClock, release, reserve, shipBuild, startBuild, stepMinutes, swapReserved, type ShipOutcome } from "../../build/workshop";
import { nowAbs, type GameState } from "../../core/state";
import type { Catalog } from "../../data/catalog";
import { needsStab } from "../../data/layouts";
import { Board } from "../../engine/keyboard/board";
import type { WorkshopScene } from "../../engine/workshop/workshopScene";
import { t, type MessageKey } from "../../i18n";
import { C, R, S, T } from "../../gui/theme";
import type { Ui } from "../../gui/ui";
import { button, chip, group, H_CENTER, H_RIGHT, label, panel, stack, V_BOTTOM } from "../../gui/widgets";
import { orderCard } from "../orderCard";
import { caseStep, dampStep, installStep, keycapStep, lubeStep, pcbStep, plateStep, screwStep, solderStep, soundStep, stabStep, switchStep, testStep } from "./steps";
import { syncBoard } from "./sync";
import { ticketPanel } from "./ticket";
import type { StepCtx, StepView, SupplierPreset } from "./types";

const ICON: Record<StepId, string> = {
  case: "🧱",
  pcb: "🟩",
  damp: "🧽",
  plate: "▦",
  stabs: "➖",
  switches: "🔴",
  lube: "🖌️",
  install: "⬇️",
  solder: "🔥",
  screws: "🪛",
  keycaps: "⌨️",
  test: "✅",
  sound: "🔊",
  deliver: "📦",
};

export interface BenchOpts {
  ws: WorkshopScene;
  state: GameState;
  catalog: Catalog;
  builds: () => number;
  /** Height of the HUD bar (ideal px) so the bench UI starts below it. */
  hudHeight: () => number;
  persist: () => void;
  wake: () => void;
  /** Time passes while you work. */
  onWork: (minutes: number) => void;
  /** Skip ahead until the next express delivery arrives. */
  onWaitCourier: () => void;
  onShipped: (b: BuildSession, r: BuildResult, o: ShipOutcome) => void;
  openSuppliers: (p: SupplierPreset) => void;
  openOrders: () => void;
}

export class BenchMode {
  private ui: Ui;
  board: Board | null = null;
  private view: StepView | null = null;
  private ticketOpen: boolean;
  private pointerObs: Observer<PointerInfo> | null = null;
  private keyFn = (e: KeyboardEvent) => this.onKey(e);
  private offResize: () => void;
  private beforeRender: Observer<Scene> | null = null;
  private flashNext = false;
  /** Hidden while a full-screen panel (orders, suppliers…) is open. */
  private hidden = false;

  constructor(private o: BenchOpts) {
    this.ui = o.ws.ui;
    this.ticketOpen = !this.ui.portrait;
    const s = o.state.activeBuild;
    if (s?.layout) this.makeBoard(s);
    this.pointerObs = o.ws.scene.onPointerObservable.add((pi) => {
      const e = pi.event as PointerEvent;
      const type = pi.type === PointerEventTypes.POINTERDOWN ? "down" : pi.type === PointerEventTypes.POINTERMOVE ? "move" : pi.type === PointerEventTypes.POINTERUP ? "up" : null;
      if (!type || !this.view?.onPointer || this.hidden) return;
      const rect = o.ws.scene.getEngine().getRenderingCanvas()!.getBoundingClientRect();
      this.view.onPointer(type, e.clientX - rect.left, e.clientY - rect.top, e);
    });
    window.addEventListener("keydown", this.keyFn);
    window.addEventListener("keyup", this.keyFn);
    this.beforeRender = o.ws.scene.onBeforeRenderObservable.add(() => {
      const dt = o.ws.scene.getEngine().getDeltaTime() / 1000;
      this.board?.update(dt);
      this.view?.update?.(dt);
    });
    this.offResize = this.ui.onResize(() => this.render());
    if (s) this.openStep(s.step);
    else this.render();
  }

  get session(): BuildSession | null {
    return this.o.state.activeBuild;
  }

  private makeBoard(s: BuildSession) {
    this.board?.dispose();
    this.board = new Board(this.o.ws.scene, s.layout!, this.o.ws.shadows);
    this.board.base.parent = this.o.ws.benchAnchor;
    syncBoard(this.board, s, this.o.catalog);
    this.o.ws.setBenchView("overview", { w: this.board.outerWidth, d: this.board.outerDepth });
    return this.board;
  }

  private ctx(): StepCtx {
    const self = this;
    const st = this.o.state;
    return {
      state: st,
      catalog: this.o.catalog,
      store: this.o.ws,
      ui: this.ui,
      get session() {
        return self.session!;
      },
      builds: this.o.builds(),
      board: () => this.board,
      setLayoutBoard: () => this.makeBoard(this.session!),
      update: () => this.changed(),
      complete: () => {
        this.flashNext = true;
        this.render();
      },
      rerender: () => this.render(),
      keySound: (id, animate = true) => this.keySound(id, animate),
      view: (v) => {
        if (typeof v === "string") this.o.ws.setBenchView(v, this.board ? { w: this.board.outerWidth, d: this.board.outerDepth } : undefined);
        else this.o.ws.setBenchView(v);
      },
      wake: this.o.wake,
      stock: (sku) => st.inventory[sku] ?? 0,
      skus: (prefix) => Object.keys(st.inventory).filter((k) => k.startsWith(prefix) && st.inventory[k] > 0),
      reserve: (sku, n = 1) => reserve(st, sku, n),
      release: (sku, n = 1) => release(st, sku, n),
      swap: (a, b, n = 1) => swapReserved(st, a, b, n),
      openSuppliers: (p) => this.o.openSuppliers(p),
      devGive: (sku, n = 1) => give(st.inventory, sku, n),
    };
  }

  private keySound(id: number, animate: boolean) {
    const b = this.session;
    const board = this.board;
    if (!b || !board) return;
    const k = board.layout.keys[id];
    const { sound } = computeProfile(b, this.o.catalog);
    if (animate) {
      board.pressKey(id);
      this.o.wake();
    }
    const pan = -((k.x + k.w / 2) / board.layout.width - 0.5) * 0.8;
    play(needsStab(k) ? "kb.spacebar" : "kb.thock", { params: { profile: sound ?? KEY_PRESETS.thock }, pan });
  }

  private onKey(e: KeyboardEvent) {
    if (this.ui.adt.focusedControl || this.hidden) return;
    this.view?.onKey?.(e);
  }

  private openStep(step: StepId) {
    const b = this.session!;
    this.view?.dispose?.();
    this.view = null;
    b.step = step;
    if (step === "deliver") {
      this.render();
      this.o.persist();
      return;
    }
    const ctx = this.ctx();
    const f: Record<Exclude<StepId, "deliver">, () => StepView> = {
      case: () => caseStep(ctx),
      pcb: () => pcbStep(ctx),
      damp: () => dampStep(ctx),
      plate: () => plateStep(ctx),
      stabs: () => stabStep(ctx),
      switches: () => switchStep(ctx),
      lube: () => lubeStep(ctx),
      install: () => installStep(ctx),
      solder: () => solderStep(ctx),
      screws: () => screwStep(ctx),
      keycaps: () => keycapStep(ctx),
      test: () => testStep(ctx),
      sound: () => soundStep(ctx),
    };
    if (!["install", "solder", "test", "sound", "lube"].includes(step)) this.ctx().view("overview");
    this.flashNext = false;
    this.view = f[step]();
    this.render();
    this.o.persist();
    this.o.wake();
  }

  private changed() {
    this.render();
    this.o.persist();
  }

  /** Hide the bench UI while a full panel covers the screen. */
  setHidden(h: boolean) {
    this.hidden = h;
    this.render();
  }

  // ---------------- Layout ----------------
  render() {
    const ui = this.ui;
    if (this.hidden) {
      ui.setScreen(group({ name: "bench-ui" }));
      return;
    }
    const b = this.session;
    if (!b) return this.renderIdle();
    if (b.step === "deliver") return this.renderShip();
    const portrait = ui.portrait;
    const root = group({ name: "bench-ui" });
    const top0 = this.o.hudHeight();
    const steps = stepsFor(b);
    const cur = steps.indexOf(b.step);
    const stepBar = stack({ horizontal: true, h: 32, spacing: 4, y: top0 + S.sm, ha: H_CENTER });
    const lo = portrait ? Math.max(0, Math.min(cur - 3, steps.length - 8)) : 0;
    const hi = portrait ? lo + 8 : steps.length;
    steps.forEach((st, i) => {
      if (i < lo || i >= hi) return;
      const done = i < cur;
      const now = i === cur;
      const showText = now || (!portrait && ui.W > 1500);
      const text = showText ? `${done ? "✓" : ICON[st]} ${t(`step.${st}.title` as MessageKey)}` : done ? "✓" : ICON[st];
      stepBar.addControl(chip(text, { bg: now ? C.accent : done ? C.goodSoft : "rgba(255,250,242,0.88)", color: now ? C.white : done ? C.good : C.inkSoft, size: T.tiny + 1, h: 28, pad: 10 }));
    });
    root.addControl(stepBar);
    const topInset = top0 + S.sm + 40;
    // Drawer
    const compact = !!this.view?.compact;
    const dw = Math.min(ui.W - 2 * S.md, 1180);
    const dh = portrait ? (compact ? 260 : 360) : compact ? 210 : 300;
    const drawer = panel({ w: dw, h: dh, y: -S.md, ha: H_CENTER, va: V_BOTTOM, radius: R.xl, name: "drawer" });
    const pad = portrait ? S.md : S.xl;
    const inner = dw - 2 * pad;
    drawer.addControl(label(`${ICON[b.step]} ${t(`step.${b.step}.title` as MessageKey)}`, { size: portrait ? T.h3 : T.h2, weight: 700, x: pad, y: S.md, w: inner * 0.5, h: 34 }));
    drawer.addControl(label(t(`step.${b.step}.hint` as MessageKey), { size: portrait ? T.tiny + 1 : T.small, weight: 500, color: C.inkSoft, x: pad + (portrait ? 0 : inner * 0.28), y: portrait ? S.md + 32 : S.md + 8, w: portrait ? inner : inner * 0.72, h: portrait ? 34 : 22, align: portrait ? 0 : 1, wrap: portrait, valign: 0 }));
    const headH = portrait ? 72 : 52;
    const footH = 60;
    const bodyH = dh - headH - footH - S.sm;
    const body = group({ w: inner, h: bodyH, x: pad, y: headH });
    if (this.view) body.addControl(this.view.render({ w: inner, h: bodyH, portrait }));
    drawer.addControl(body);
    // footer
    const done = stepDone(b, b.step);
    const next = nextStep(b);
    const prev = prevStep(b);
    void next;
    const foot = stack({ horizontal: true, h: 52, spacing: S.sm, x: -pad, y: -S.md, ha: H_RIGHT, va: V_BOTTOM });
    if (prev && canGoBack(b)) foot.addControl(button(`← ${t("bench.back")}`, { w: portrait ? 100 : 140, testId: "btn-back", onClick: () => (play("ui.back"), this.openStep(prev)) }));
    const mins = stepMinutes(b, b.step);
    const nextBtn = button(`${t("bench.next")} →`, {
      w: portrait ? 170 : 230,
      variant: "primary",
      disabled: !done,
      testId: "btn-next",
      sub: mins ? `⏱ ${t("bench.minutes", { min: mins })}` : undefined,
      onClick: () => this.finishStep(),
    });
    if (this.flashNext && done) nextBtn.scaleX = nextBtn.scaleY = 1.06;
    foot.addControl(nextBtn);
    drawer.addControl(foot);
    const left = stack({ horizontal: true, h: 44, spacing: S.sm, x: pad - 8, y: -S.md - 6, va: V_BOTTOM });
    left.addControl(button(portrait ? "⏸" : t("bench.putAside"), { w: portrait ? 44 : 140, h: 40, size: "sm", variant: "ghost", testId: "btn-abandon", onClick: () => this.confirmAside() }));
    const courier = this.nextCourier();
    if (courier !== null && !portrait)
      left.addControl(button(`⏳ ${t("bench.waitCourier", { time: formatClock(courier % 1440) })}`, { w: 260, h: 40, size: "sm", variant: "secondary", testId: "btn-wait", onClick: () => this.o.onWaitCourier() }));
    drawer.addControl(left);
    root.addControl(drawer);
    // Ticket (left) or a chip that opens it
    let leftInset = 0;
    if (this.ticketOpen && !portrait) {
      const tw = 300;
      const th = Math.min(ui.H - topInset - dh - 3 * S.md, 600);
      if (th > 220) {
        const tp = ticketPanel(b.job, b, this.o.catalog, { w: tw, h: th, day: this.o.state.day, onHide: () => ((this.ticketOpen = false), this.render()) });
        tp.left = `${S.lg}px`;
        tp.top = `${topInset}px`;
        tp.horizontalAlignment = 0;
        tp.verticalAlignment = 0;
        root.addControl(tp);
        leftInset = tw + S.lg;
      }
    } else {
      root.addControl(
        button(`📋 ${b.job.customer.name.split(" ")[0]}`, {
          w: 150,
          h: 44,
          size: "sm",
          x: S.lg,
          y: topInset,
          testId: "ticket-open",
          onClick: () => {
            if (!portrait) {
              this.ticketOpen = true;
              this.render();
              return;
            }
            this.ui.modal({ w: 420, h: 640, name: "ticket-modal", dismissable: true }, (p, close) => {
              const tp = ticketPanel(b.job, b, this.o.catalog, { w: Math.min(420, ui.W - 24), h: Math.min(640, ui.H - 24), day: this.o.state.day, onHide: close });
              tp.shadowBlur = 0;
              p.addControl(tp);
            });
          },
        }),
      );
    }
    ui.setScreen(root);
    this.setInsets(leftInset, topInset, dh + S.md);
    this.o.wake();
  }

  private setInsets(left: number, top: number, bottom: number) {
    const canvas = this.o.ws.scene.getEngine().getRenderingCanvas()!;
    const k = canvas.clientHeight / this.ui.H;
    this.o.ws.setInsets(left * k, top * k, bottom * k, 0);
  }

  /** Absolute minute of the next express delivery, if any is on the way. */
  private nextCourier(): number | null {
    const now = nowAbs(this.o.state);
    const t0 = this.o.state.shipments.filter((s) => s.express && s.arrives > now).map((s) => s.arrives);
    return t0.length ? Math.min(...t0) : null;
  }

  private finishStep() {
    const b = this.session!;
    if (!stepDone(b, b.step)) return;
    const mins = stepMinutes(b, b.step);
    const next = nextStep(b);
    play("ui.confirm");
    this.openStep(next);
    this.o.onWork(mins);
  }

  /** Nothing on the bench: accepted orders to start. */
  private renderIdle() {
    const ui = this.ui;
    const root = group({ name: "bench-ui" });
    const acc = this.o.state.accepted;
    const w = Math.min(ui.W - 2 * S.md, 980);
    const cardH = 168;
    const h = acc.length ? Math.min(ui.H - this.o.hudHeight() - 40, 120 + Math.ceil(acc.length / 2) * (cardH + S.md)) : 200;
    const p = panel({ w, h, y: -S.lg, ha: H_CENTER, va: V_BOTTOM, radius: R.xl, name: "bench-idle" });
    p.addControl(label(`🛠 ${t("ws.benchFree")}`, { size: T.h2, weight: 700, x: S.xl, y: S.lg, h: 34 }));
    p.addControl(label(acc.length ? t("ws.benchFreeBody") : t("ws.benchEmptyBody"), { size: T.body, color: C.inkSoft, x: S.xl, y: S.lg + 36, h: 24, w: w - 2 * S.xl - 200 }));
    p.addControl(button(`📋 ${t("ws.openOrders")}`, { w: 190, h: 46, size: "sm", x: -S.xl, y: S.lg, ha: H_RIGHT, testId: "bench-orders", onClick: () => this.o.openOrders() }));
    const cw = ui.portrait ? w - 2 * S.lg : (w - 2 * S.xl - S.md) / 2;
    acc.forEach((o, i) => {
      const c = orderCard(o, {
        w: cw,
        h: cardH,
        state: this.o.state,
        catalog: this.o.catalog,
        compact: true,
        actions: [{ text: `▶ ${t("ws.start")}`, variant: "primary", testId: `start-${o.id}`, onClick: () => this.start(o.id) }],
      });
      c.left = `${S.xl + (ui.portrait ? 0 : (i % 2) * (cw + S.md))}px`;
      c.top = `${100 + (ui.portrait ? i : Math.floor(i / 2)) * (cardH + S.md)}px`;
      p.addControl(c);
    });
    root.addControl(p);
    ui.setScreen(root);
    this.setInsets(0, this.o.hudHeight(), h + S.lg);
    this.o.ws.setBenchView("overview", { w: 0.45, d: 0.16 });
  }

  start(orderId: string) {
    if (!startBuild(this.o.state, orderId)) return;
    play("ui.confirm");
    this.o.persist();
    this.openStep("case");
  }

  /** Last step: pack & ship. */
  private renderShip() {
    const ui = this.ui;
    const b = this.session!;
    const root = group({ name: "bench-ui" });
    const w = Math.min(ui.W - 2 * S.md, 560);
    const p = panel({ w, h: 190, y: -S.lg, ha: H_CENTER, va: V_BOTTOM, radius: R.xl, name: "drawer" });
    p.addControl(label(`📦 ${t("step.deliver.title")}`, { size: T.h2, weight: 700, x: S.xl, y: S.lg, h: 34 }));
    p.addControl(label(t("step.deliver.hint"), { size: T.body, color: C.inkSoft, x: S.xl, y: S.lg + 38, h: 24, w: w - 2 * S.xl }));
    const row = stack({ horizontal: true, h: 56, spacing: S.md, y: -S.lg, ha: H_CENTER, va: V_BOTTOM });
    row.addControl(button(`← ${t("bench.back")}`, { w: 130, testId: "btn-back", onClick: () => this.openStep(prevStep(b)!) }));
    row.addControl(button(t("bench.ship", { name: b.job.customer.name.split(" ")[0] }), { w: 300, variant: "primary", testId: "btn-next", sub: `⏱ ${t("bench.minutes", { min: stepMinutes(b, "deliver") })}`, onClick: () => this.ship() }));
    p.addControl(row);
    root.addControl(p);
    ui.setScreen(root);
    this.setInsets(0, this.o.hudHeight(), 190 + S.lg);
    this.o.ws.setBenchView("overview", this.board ? { w: this.board.outerWidth, d: this.board.outerDepth } : undefined);
  }

  private ship() {
    const b = this.session!;
    const r = evaluateBuild(b, this.o.catalog);
    const outcome = shipBuild(this.o.state, r);
    play("money.register");
    this.o.persist();
    const board = this.board;
    if (board && outcome.stars >= 4) board.layout.keys.forEach((k, i) => setTimeout(() => (board.pressKey(k.id), this.o.wake()), i * 15));
    this.ui.setScreen(group({ name: "bench-ui" }));
    this.o.onShipped(b, r, outcome);
    this.o.onWork(stepMinutes(b, "deliver"));
  }

  private confirmAside() {
    this.ui.confirm(t("bench.confirmAside"), t("bench.confirmAsideYes"), t("bench.confirmAbandonNo"), () => {
      abandonBuild(this.o.state);
      this.clearBoard();
      this.view?.dispose?.();
      this.view = null;
      play("ui.back");
      this.o.persist();
      this.render();
    }, "confirm-abandon");
  }

  /** Dev/test: finish the current step with a good result. */
  autoStep() {
    const b = this.session;
    if (!b) return;
    if (b.step === "deliver") return this.ship();
    if (!this.view) return;
    this.view.auto?.();
    if (stepDone(b, b.step)) this.finishStep();
  }

  /** After shipping: clear the bench and show the orders again. */
  clearBoard() {
    this.board?.dispose();
    this.board = null;
  }

  dispose() {
    this.view?.dispose?.();
    this.view = null;
    this.board?.dispose();
    this.board = null;
    if (this.pointerObs) this.o.ws.scene.onPointerObservable.remove(this.pointerObs);
    if (this.beforeRender) this.o.ws.scene.onBeforeRenderObservable.remove(this.beforeRender);
    window.removeEventListener("keydown", this.keyFn);
    window.removeEventListener("keyup", this.keyFn);
    this.offResize();
    this.o.ws.setInsets(0, 0, 0, 0);
  }
}
