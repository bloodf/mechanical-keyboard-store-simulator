/**
 * Workbench mode (first person): top bar with steps, the job ticket, and a bottom parts drawer.
 * Routes 3D pointer + keyboard input to the active step and saves after every change.
 */
import { PointerEventTypes, type Observer, type PointerInfo } from "@babylonjs/core";
import { play } from "../../audio/engine";
import { KEY_PRESETS } from "../../audio/keyPress";
import { computeProfile } from "../../build/profile";
import { evaluateBuild, type BuildResult } from "../../build/scoring";
import { canGoBack, nextStep, prevStep, stepDone, stepsFor } from "../../build/session";
import type { BuildSession, StepId } from "../../build/types";
import { HISTORY_MAX, type GameState } from "../../core/state";
import type { Catalog } from "../../data/catalog";
import { needsStab } from "../../data/layouts";
import { Board } from "../../engine/keyboard/board";
import type { StoreScene } from "../../engine/store/storeScene";
import { formatMoney, t, type MessageKey } from "../../i18n";
import { C, R, S, T } from "../../gui/theme";
import type { Ui } from "../../gui/ui";
import { button, chip, group, H_CENTER, H_RIGHT, label, panel, stack, V_BOTTOM } from "../../gui/widgets";
import { caseStep, dampStep, installStep, keycapStep, lubeStep, pcbStep, plateStep, screwStep, solderStep, soundStep, stabStep, switchStep, testStep } from "./steps";
import { syncBoard } from "./sync";
import { ticketPanel } from "./ticket";
import type { StepCtx, StepView } from "./types";

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
  store: StoreScene;
  state: GameState;
  catalog: Catalog;
  builds: () => number;
  persist: () => void;
  wake: () => void;
  onExit: () => void;
  onDelivered: (b: BuildSession, r: BuildResult) => void;
  onNeedJob: () => void;
}

export class BenchMode {
  private ui: Ui;
  private board: Board | null = null;
  private view: StepView | null = null;
  private ticketOpen: boolean;
  private pointerObs: Observer<PointerInfo> | null = null;
  private keyFn = (e: KeyboardEvent) => this.onKey(e);
  private offResize: () => void;
  private beforeRender: Observer<import("@babylonjs/core").Scene> | null = null;
  private flashNext = false;

  constructor(private o: BenchOpts) {
    this.ui = o.store.ui;
    this.ticketOpen = !this.ui.portrait;
    o.store.setMode("bench");
    const s = o.state.activeBuild;
    if (s?.layout) this.makeBoard(s);
    this.pointerObs = o.store.scene.onPointerObservable.add((pi) => {
      const e = pi.event as PointerEvent;
      const type = pi.type === PointerEventTypes.POINTERDOWN ? "down" : pi.type === PointerEventTypes.POINTERMOVE ? "move" : pi.type === PointerEventTypes.POINTERUP ? "up" : null;
      if (!type || !this.view?.onPointer) return;
      const rect = o.store.scene.getEngine().getRenderingCanvas()!.getBoundingClientRect();
      this.view.onPointer(type, e.clientX - rect.left, e.clientY - rect.top, e);
    });
    window.addEventListener("keydown", this.keyFn);
    window.addEventListener("keyup", this.keyFn);
    this.beforeRender = o.store.scene.onBeforeRenderObservable.add(() => {
      const dt = o.store.scene.getEngine().getDeltaTime() / 1000;
      this.board?.update(dt);
      this.view?.update?.(dt);
    });
    this.offResize = this.ui.onResize(() => this.render());
    if (s) this.openStep(s.step);
    else this.renderNoJob();
  }

  get session(): BuildSession | null {
    return this.o.state.activeBuild;
  }

  private makeBoard(s: BuildSession) {
    this.board?.dispose();
    this.board = new Board(this.o.store.scene, s.layout!, this.o.store.shadows);
    this.board.root.parent = this.o.store.layout.benchAnchor;
    syncBoard(this.board, s, this.o.catalog);
    this.o.store.setBenchView("overview", { w: this.board.outerWidth, d: this.board.outerDepth });
    return this.board;
  }

  private ctx(): StepCtx {
    const self = this;
    return {
      state: this.o.state,
      catalog: this.o.catalog,
      store: this.o.store,
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
        if (typeof v === "string") this.o.store.setBenchView(v, this.board ? { w: this.board.outerWidth, d: this.board.outerDepth } : undefined);
        else this.o.store.setBenchView(v);
      },
      wake: this.o.wake,
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
    if (this.ui.adt.focusedControl) return;
    this.view?.onKey?.(e);
  }

  private openStep(step: StepId) {
    const b = this.session!;
    this.view?.dispose?.();
    this.view = null;
    b.step = step;
    if (step === "deliver") return this.deliver();
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

  // ---------------- Layout ----------------
  private render() {
    const ui = this.ui;
    const b = this.session;
    if (!b) return this.renderNoJob();
    const portrait = ui.portrait;
    const root = group({ name: "bench-ui" });
    root.isPointerBlocker = false;
    // Top bar
    root.addControl(button(`← ${t("bench.leave")}`, { w: portrait ? 110 : 170, h: 44, size: "sm", x: S.lg, y: S.lg, testId: "bench-leave", onClick: () => this.exit() }));
    const money = chip(formatMoney(this.o.state.money), { ha: H_RIGHT, x: -S.lg, y: S.lg + 4, bg: C.paper, color: C.good, size: T.h3, h: 40, name: "bench-money" });
    root.addControl(money);
    const steps = stepsFor(b);
    const cur = steps.indexOf(b.step);
    const stepBar = stack({ horizontal: true, h: 34, spacing: 4, y: portrait ? S.lg + 52 : S.lg + 5, ha: H_CENTER });
    // On phones show a window of steps around the current one.
    const lo = portrait ? Math.max(0, Math.min(cur - 3, steps.length - 8)) : 0;
    const hi = portrait ? lo + 8 : steps.length;
    steps.forEach((st, i) => {
      if (i < lo || i >= hi) return;
      const done = i < cur;
      const now = i === cur;
      const text = now || !portrait ? `${done ? "✓" : ICON[st]}${now || !portrait ? " " + t(`step.${st}.title` as MessageKey) : ""}` : done ? "✓" : ICON[st];
      const showText = now || (!portrait && ui.W > 1500);
      stepBar.addControl(chip(showText ? text : done ? "✓" : ICON[st], { bg: now ? C.accent : done ? C.goodSoft : "rgba(255,250,242,0.85)", color: now ? C.white : done ? C.good : C.inkSoft, size: T.tiny + 1, h: 30, pad: 10 }));
    });
    root.addControl(stepBar);
    const topInset = portrait ? S.lg + 92 : S.lg + 56;
    // Drawer
    const compact = !!this.view?.compact;
    const dw = Math.min(ui.W - 2 * S.md, 1180);
    const dh = portrait ? (compact ? 260 : 360) : compact ? 220 : 300;
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
    const isLast = next === "deliver";
    const prev = prevStep(b);
    const foot = stack({ horizontal: true, h: 52, spacing: S.sm, x: -pad, y: -S.md, ha: H_RIGHT, va: V_BOTTOM });
    if (prev && canGoBack(b)) foot.addControl(button(`← ${t("bench.back")}`, { w: portrait ? 100 : 140, testId: "btn-back", onClick: () => (play("ui.back"), this.openStep(prev)) }));
    const nextBtn = button(isLast ? (portrait ? `📦 ${t("step.deliver.title")}` : t("bench.deliver", { name: b.job.customer.name.split(" ")[0] })) : `${t("bench.next")} →`, {
      w: portrait ? 170 : 230,
      variant: "primary",
      disabled: !done,
      testId: "btn-next",
      onClick: () => {
        play(isLast ? "money.register" : "ui.confirm");
        this.openStep(next);
      },
    });
    if (this.flashNext && done) nextBtn.scaleX = nextBtn.scaleY = 1.06;
    foot.addControl(nextBtn);
    drawer.addControl(foot);
    drawer.addControl(button(portrait ? "✕" : t("bench.abandon"), { w: portrait ? 44 : 140, h: 40, size: "sm", variant: "ghost", x: pad - 8, y: -S.md - 6, va: V_BOTTOM, testId: "btn-abandon", onClick: () => this.confirmAbandon() }));
    root.addControl(drawer);
    // Ticket (left) or a chip that opens it
    let left = 0;
    if (this.ticketOpen && !portrait) {
      const tw = 300;
      const th = Math.min(ui.H - topInset - dh - 3 * S.md, 600);
      if (th > 220) {
        const tp = ticketPanel(b.job, b, this.o.catalog, { w: tw, h: th, onHide: () => ((this.ticketOpen = false), this.render()) });
        tp.left = `${S.lg}px`;
        tp.top = `${topInset}px`;
        tp.horizontalAlignment = 0;
        tp.verticalAlignment = 0;
        root.addControl(tp);
        left = tw + S.lg;
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
              const tp = ticketPanel(b.job, b, this.o.catalog, { w: Math.min(420, ui.W - 24), h: Math.min(640, ui.H - 24), onHide: close });
              tp.shadowBlur = 0;
              p.addControl(tp);
            });
          },
        }),
      );
    }
    ui.setScreen(root);
    // Tell the camera what's covered (CSS px)
    const canvas = this.o.store.scene.getEngine().getRenderingCanvas()!;
    const k = canvas.clientHeight / ui.H;
    this.o.store.setInsets(left * k, topInset * k, (dh + S.md) * k, 0);
    this.o.wake();
  }

  private renderNoJob() {
    const ui = this.ui;
    const root = group({ name: "bench-ui" });
    root.isPointerBlocker = false;
    const p = panel({ w: Math.min(520, ui.W - 32), h: 230, y: -S.xl, ha: H_CENTER, va: V_BOTTOM, radius: R.xl, name: "bench-nojob" });
    const col = stack({ w: "86%", y: S.xl, ha: H_CENTER, spacing: S.sm });
    col.addControl(label(t("bench.noJobTitle"), { size: T.h2, weight: 700, align: H_CENTER }));
    col.addControl(label(t("bench.noJobBody"), { size: T.body, color: C.inkSoft, wrap: true, align: H_CENTER }));
    p.addControl(col);
    const row = stack({ horizontal: true, h: 56, spacing: S.md, y: -S.lg, ha: H_CENTER, va: V_BOTTOM });
    row.addControl(button(t("bench.leave"), { w: 180, testId: "bench-leave", onClick: () => this.exit() }));
    row.addControl(button(t("bench.openJobs"), { w: 220, variant: "primary", testId: "bench-jobs", onClick: () => this.o.onNeedJob() }));
    p.addControl(row);
    root.addControl(p);
    ui.setScreen(root);
    this.o.store.setInsets(0, 0, 260 * ((this.o.store.scene.getEngine().getRenderingCanvas()!.clientHeight || 800) / ui.H), 0);
  }

  private confirmAbandon() {
    this.ui.confirm(t("bench.confirmAbandon"), t("bench.confirmAbandonYes"), t("bench.confirmAbandonNo"), () => {
      const s = this.o.state;
      const job = s.activeBuild?.job;
      s.activeBuild = null;
      if (job) s.jobBoard.unshift(job);
      s.jobBoard = s.jobBoard.slice(0, 3);
      this.o.store.customerLeave("sad", "idle");
      this.board?.dispose();
      this.board = null;
      play("ui.back");
      this.o.persist();
      this.exit();
    }, "confirm-abandon");
  }

  private deliver() {
    const b = this.session!;
    const r = evaluateBuild(b, this.o.catalog);
    const s = this.o.state;
    s.money += r.pay + r.tip - r.partsCost;
    s.reputation = Math.max(0, Math.min(500, s.reputation + r.repDelta));
    s.stats.keyboardsBuilt++;
    s.stats.customersServed++;
    if (r.stars === 5) s.stats.perfectBuilds++;
    if (r.stars <= 2) s.stats.angryCustomers++;
    s.stats.totalProfit += r.profit;
    s.history.unshift({ jobId: b.job.id, customer: b.job.customer.name, layout: b.layout!, stars: r.stars, profit: r.profit, day: s.day });
    s.history = s.history.slice(0, HISTORY_MAX);
    s.activeBuild = null;
    this.o.persist();
    // celebration wave on the finished board
    const board = this.board;
    if (board && r.stars >= 4) board.layout.keys.forEach((k, i) => setTimeout(() => (board.pressKey(k.id), this.o.wake()), i * 15));
    this.ui.setScreen(group({ name: "bench-ui" }));
    this.o.onDelivered(b, r);
  }

  /** Dev/test: finish the current step with a good result. */
  autoStep() {
    const b = this.session;
    if (!b || !this.view) return;
    this.view.auto?.();
    if (stepDone(b, b.step)) this.openStep(nextStep(b));
  }

  exit() {
    this.dispose();
    this.o.onExit();
  }

  dispose() {
    this.view?.dispose?.();
    this.view = null;
    if (this.pointerObs) this.o.store.scene.onPointerObservable.remove(this.pointerObs);
    if (this.beforeRender) this.o.store.scene.onBeforeRenderObservable.remove(this.beforeRender);
    window.removeEventListener("keydown", this.keyFn);
    window.removeEventListener("keyup", this.keyFn);
    this.offResize();
    this.o.store.setInsets(0, 0, 0, 0);
  }

  /** Keep the finished board on the bench for a moment after delivery; then clear it. */
  clearBoard() {
    this.board?.dispose();
    this.board = null;
  }
}

