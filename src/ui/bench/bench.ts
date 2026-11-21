/**
 * The workbench screen: job board → build steps → delivery. Owns the bench 3D scene,
 * routes input to the active step, keeps the ticket/bill live, and saves after every change.
 */
import * as THREE from "three";
import { play } from "../../audio/engine";
import { KEY_PRESETS } from "../../audio/keyPress";
import { generateJob } from "../../build/jobs";
import { computeProfile, partsCost, soundMatch, targetRanges } from "../../build/profile";
import { evaluateBuild, type BuildResult, type ScoreComponent } from "../../build/scoring";
import { canGoBack, newSession, nextStep, prevStep, stepDone, stepsFor } from "../../build/session";
import type { BuildSession, JobRequest, StepId } from "../../build/types";
import { HISTORY_MAX, type GameState } from "../../core/state";
import { getCatalog, type Catalog } from "../../data/catalog";
import { needsStab } from "../../data/layouts";
import { formatMoney, formatNumber, t, tx, type MessageKey } from "../../i18n";
import { BenchScene } from "../../world/benchScene";
import type { Stage } from "../../world/stage";
import { h, nodes, uiRoot } from "../dom";
import { openSettings } from "../audioPanels";
import type { BenchCtx, StepView } from "./context";
import { installStep, solderStep, soundStep, testStep } from "./interactSteps";
import { caseStep, dampStep, keycapStep, lubeStep, pcbStep, plateStep, screwStep, setActiveScene, stabStep, switchStep } from "./pickSteps";
import { drawRadar } from "./radar";
import { syncBoard } from "./sync";

const STEP_ICON: Record<StepId, string> = {
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

const VIEW_FOR: Partial<Record<StepId, "overview" | "top" | "low">> = { install: "top", solder: "top", test: "top", sound: "low" };

export interface BenchOpts {
  stage: Stage;
  state: GameState;
  persist: () => void;
  onMenu: () => void;
  unlockAll: () => boolean;
}

export class Bench {
  readonly scene: BenchScene;
  private catalog: Catalog;
  private view: StepView | null = null;
  private root = h("div", { class: "bench" });
  private hud = h("div", { class: "hud" });
  private stepper = h("div", { class: "stepper" });
  private ticket = h("aside", { class: "ticket" });
  private sheet = h("section", { class: "sheet" });
  private ticketOpen = window.innerWidth > 760;
  private listeners: (() => void)[] = [];
  private ndc = new THREE.Vector2();

  constructor(private o: BenchOpts) {
    this.scene = new BenchScene(o.stage.renderer);
    o.stage.set(this.scene);
    setActiveScene(this.scene);
    this.catalog = getCatalog(o.state.seed);
    this.root.append(this.hud, this.stepper, this.ticket, this.sheet);
    uiRoot().replaceChildren(this.root);
    this.bindInput();
    this.renderHud();
    // Keep the 3D board centered in the space the UI leaves free.
    const ro = new ResizeObserver(() => this.updateInsets());
    [this.sheet, this.ticket, this.stepper, this.hud].forEach((el) => ro.observe(el));
    this.listeners.push(() => ro.disconnect());
    if (o.state.activeBuild) this.resume(o.state.activeBuild);
    else this.showBoard();
  }

  get state() {
    return this.o.state;
  }
  private get builds() {
    return this.o.unlockAll() ? 999 : this.state.stats.keyboardsBuilt;
  }
  get session(): BuildSession | null {
    return this.state.activeBuild;
  }

  // ---------- Input ----------
  private bindInput() {
    const canvas = this.o.stage.renderer.domElement;
    const toNdc = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const on = <K extends keyof WindowEventMap>(target: EventTarget, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.listeners.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    on(canvas, "pointerdown", (e) => {
      toNdc(e);
      canvas.setPointerCapture(e.pointerId);
      this.view?.onPointer?.("down", e, this.scene.pickKey(this.ndc));
    });
    on(canvas, "pointermove", (e) => {
      toNdc(e);
      if (e.pointerType === "mouse" && !e.buttons) this.scene.setParallax(this.ndc.x, this.ndc.y);
      if (e.buttons) this.view?.onPointer?.("move", e, this.scene.pickKey(this.ndc));
    });
    on(canvas, "pointerup", (e) => {
      toNdc(e);
      this.view?.onPointer?.("up", e, null);
    });
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      this.view?.onKey?.(e);
    };
    on(window, "keydown", key);
    on(window, "keyup", key);
  }

  private updateInsets() {
    const wide = window.innerWidth > 760;
    const tr = this.ticket.getBoundingClientRect();
    const left = wide && !this.ticket.hidden && this.ticketOpen ? tr.right : 0;
    const top = Math.max(this.stepper.getBoundingClientRect().bottom, this.hud.getBoundingClientRect().bottom);
    const bottom = window.innerHeight - this.sheet.getBoundingClientRect().top;
    this.scene.setInsets(left, top, Math.max(0, bottom));
    this.o.stage.wake();
  }

  // ---------- HUD ----------
  renderHud() {
    const s = this.state;
    this.hud.replaceChildren(
      h(
        "div",
        { class: "hud-left" },
        h("span", { class: "chip", id: "hud-day" }, t("hud.day", { day: s.day })),
        h("span", { class: "chip chip-money", id: "hud-money" }, formatMoney(s.money)),
        h("span", { class: "chip", id: "hud-rep" }, t("hud.reputation", { stars: formatNumber(s.reputation / 100, 1) })),
        s.flags.knownCheater
          ? h("span", { class: "chip chip-badge", id: "hud-badge", title: t("hud.cheaterBadge.tooltip", { count: s.flags.cheatCount }) }, t("hud.cheaterBadge"))
          : null,
      ),
      h(
        "div",
        { class: "hud-right" },
        h("button", { class: "btn btn-small", id: "btn-hud-settings", "aria-label": t("settings.open"), onclick: () => openSettings() }, "⚙"),
        h("button", { class: "btn btn-small", id: "btn-menu", onclick: () => (play("ui.back"), this.o.onMenu()) }, t("hud.backToTitle")),
      ),
    );
  }

  // ---------- Job board ----------
  private ensureBoard() {
    const s = this.state;
    while (s.jobBoard.length < 3) s.jobBoard.push(generateJob(s.seed, s.jobsIssued++, this.catalog, this.builds));
  }

  showBoard() {
    this.disposeView();
    this.ensureBoard();
    this.o.persist();
    this.scene.setBoard(null);
    this.scene.setView("idle");
    this.stepper.replaceChildren();
    this.ticket.replaceChildren();
    this.ticket.hidden = true;
    const s = this.state;
    const cards = s.jobBoard.map((job, i) =>
      h(
        "article",
        { class: "job-card", "data-test": `job-${i}` },
        h("header", {}, h("strong", {}, job.customer.name), h("span", { class: "chip-inline" }, t(`persona.${job.customer.persona}` as MessageKey))),
        h("p", { class: "quote" }, this.quoteText(job)),
        this.wantsChips(job),
        h(
          "footer",
          {},
          h("span", { class: "pays" }, `${t("ticket.budget")} ${formatMoney(job.budget)}`),
          h("button", { class: "btn btn-small", "data-test": `skip-${i}`, onclick: () => this.skipJob(i) }, t("board.skip")),
          h("button", { class: "btn btn-primary btn-small", "data-test": `take-${i}`, onclick: () => this.takeJob(i) }, t("board.take")),
        ),
      ),
    );
    const st = s.stats;
    this.sheet.className = "sheet sheet-board";
    this.sheet.replaceChildren(
      h("header", { class: "sheet-head" }, h("h2", {}, t("board.title")), h("p", { class: "muted small" }, t("board.subtitle"))),
      h("div", { class: "job-grid" }, ...cards),
      h("p", { class: "muted small center" }, t("board.stats", { built: st.keyboardsBuilt, perfect: st.perfectBuilds, profit: formatMoney(st.totalProfit) })),
    );
  }

  private skipJob(i: number) {
    play("ui.back");
    this.state.jobBoard.splice(i, 1);
    this.showBoard();
  }

  private takeJob(i: number) {
    const [job] = this.state.jobBoard.splice(i, 1);
    this.state.activeBuild = newSession(job);
    play("ui.confirm");
    play("voice.talk", { params: { voice: job.customer.voice }, delay: 0.2 });
    this.ensureBoard();
    this.o.persist();
    this.resume(this.state.activeBuild);
  }

  // ---------- Build ----------
  private resume(b: BuildSession) {
    this.ticket.hidden = false;
    if (b.layout) {
      const board = this.scene.setBoard(b.layout);
      if (board) syncBoard(board, b, this.catalog);
    } else {
      this.scene.setBoard(null);
    }
    this.openStep(b.step);
  }

  private ctx(): BenchCtx {
    const self = this;
    return {
      state: this.state,
      catalog: this.catalog,
      scene: this.scene,
      get session() {
        return self.session!;
      },
      builds: this.builds,
      board: () => this.scene.board,
      update: () => this.changed(),
      complete: () => this.renderFooter(true),
      keySound: (id, animate = true) => this.keySound(id, animate),
      wake: () => this.o.stage.wake(),
    };
  }

  private keySound(id: number, animate: boolean) {
    const b = this.session;
    const board = this.scene.board;
    if (!b || !board) return;
    const k = board.layout.keys[id];
    const { sound } = computeProfile(b, this.catalog);
    if (animate) {
      board.pressKey(id);
      this.o.stage.wake();
    }
    const pan = ((k.x + k.w / 2) / board.layout.width - 0.5) * 0.8;
    play(needsStab(k) ? "kb.spacebar" : "kb.thock", { params: { profile: sound ?? KEY_PRESETS.thock }, pan });
  }

  private openStep(step: StepId) {
    const b = this.session!;
    this.disposeView();
    b.step = step;
    const ctx = this.ctx();
    const factory: Record<StepId, (() => StepView) | null> = {
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
      deliver: null,
    };
    if (step === "deliver") {
      this.deliver();
      return;
    }
    this.view = factory[step]!();
    this.scene.setView(VIEW_FOR[step] ?? "overview");
    this.o.stage.wake();
    this.sheet.className = `sheet${this.view.compact ? " sheet-compact" : ""}`;
    this.sheet.dataset.step = step;
    this.sheet.replaceChildren(
      h("header", { class: "sheet-head" }, h("h2", {}, `${STEP_ICON[step]} ${t(`step.${step}.title` as MessageKey)}`), h("p", { class: "muted small" }, t(`step.${step}.hint` as MessageKey))),
      h("div", { class: "sheet-body" }, this.view.el),
      h("footer", { class: "sheet-foot" }),
    );
    this.renderStepper();
    this.renderTicket();
    this.renderFooter();
    this.o.persist();
  }

  private changed() {
    this.renderTicket();
    this.renderFooter();
    this.renderStepper();
    this.o.persist();
  }

  private renderStepper() {
    const b = this.session;
    if (!b) return;
    const steps = stepsFor(b);
    const cur = steps.indexOf(b.step);
    this.stepper.replaceChildren(
      ...steps.map((s, i) =>
        h(
          "span",
          { class: `step-pill${i < cur ? " done" : ""}${i === cur ? " current" : ""}`, title: t(`step.${s}.title` as MessageKey) },
          h("span", { class: "ico" }, i < cur ? "✓" : STEP_ICON[s]),
          h("span", { class: "lbl" }, t(`step.${s}.title` as MessageKey)),
        ),
      ),
    );
    this.stepper.querySelector(".current")?.scrollIntoView({ inline: "center", block: "nearest" });
  }

  private renderFooter(flash = false) {
    const b = this.session;
    const foot = this.sheet.querySelector(".sheet-foot");
    if (!b || !foot) return;
    const done = stepDone(b, b.step);
    const next = nextStep(b);
    const isLast = next === "deliver";
    const nextBtn = h(
      "button",
      {
        class: `btn btn-primary${flash && done ? " pulse" : ""}`,
        id: "btn-next",
        disabled: !done,
        onclick: () => {
          play(isLast ? "money.register" : "ui.confirm");
          this.openStep(next);
        },
      },
      isLast ? t("bench.deliver", { name: b.job.customer.name.split(" ")[0] }) : `${t("bench.next")} →`,
    );
    const prev = prevStep(b);
    foot.replaceChildren(
      ...nodes(
        h("button", { class: "btn btn-small btn-ghost", id: "btn-abandon", onclick: () => this.confirmAbandon() }, t("bench.abandon")),
        h("span", { class: "spacer" }),
        prev && canGoBack(b) ? h("button", { class: "btn", id: "btn-back", onclick: () => (play("ui.back"), this.openStep(prev)) }, `← ${t("bench.back")}`) : null,
        nextBtn,
      ),
    );
  }

  private confirmAbandon() {
    play("ui.open");
    const dlg = h(
      "div",
      { class: "modal-backdrop", id: "confirm-abandon" },
      h(
        "div",
        { class: "modal", role: "dialog", "aria-modal": "true" },
        h("p", {}, t("bench.confirmAbandon")),
        h(
          "div",
          { class: "row" },
          h("button", { class: "btn", onclick: () => (play("ui.close"), dlg.remove()) }, t("bench.confirmAbandonNo")),
          h(
            "button",
            {
              class: "btn btn-danger",
              id: "btn-confirm-abandon",
              onclick: () => {
                dlg.remove();
                const job = this.session?.job;
                this.state.activeBuild = null;
                if (job) this.state.jobBoard.unshift(job);
                this.state.jobBoard = this.state.jobBoard.slice(0, 3);
                play("ui.back");
                this.showBoard();
              },
            },
            t("bench.confirmAbandonYes"),
          ),
        ),
      ),
    );
    document.body.append(dlg);
  }

  // ---------- Ticket ----------
  private quoteText(job: JobRequest) {
    return job.quote.map((q) => tx(q.key, q.params)).join(" ");
  }

  private wantsChips(job: JobRequest): HTMLElement {
    const chips: string[] = [];
    chips.push(job.layout.kind === "exact" ? t(`layout.name.${job.layout.id}` as MessageKey) : t(`req.layout.${job.layout.kind}` as MessageKey));
    chips.push(job.sound.map((w) => t(`sound.word.${w}` as MessageKey)).join(" + "));
    if (job.feel !== "any") chips.push(t(`feel.${job.feel}` as MessageKey));
    const th = job.theme;
    chips.push(
      th.kind === "any"
        ? t("req.theme.any")
        : tx(`req.theme.${th.kind}`, {
            ...(th.kind !== "hue" ? { family: `@color.family.${th.family}` } : {}),
            ...(th.kind !== "family" ? { hue: `@color.hue.${th.hue}` } : {}),
          }),
    );
    if (job.picky > 0.7) chips.push(`⚠ ${t("req.picky")}`);
    return h("div", { class: "wants" }, ...chips.map((c) => h("span", { class: "want" }, c)));
  }

  private renderTicket() {
    const b = this.session;
    if (!b) return;
    const job = b.job;
    const cost = partsCost(b, this.catalog).total;
    const profit = job.budget - cost;
    const radar = h("canvas", { class: "radar" });
    const match = b.layout ? Math.round(soundMatch(computeProfile(b, this.catalog).sound, job.sound) * 100) : null;
    this.ticket.className = `ticket${this.ticketOpen ? "" : " collapsed"}`;
    this.ticket.replaceChildren(
      ...nodes(
      h(
        "button",
        { class: "ticket-toggle", "data-test": "ticket-toggle", onclick: () => ((this.ticketOpen = !this.ticketOpen), this.renderTicket()) },
        this.ticketOpen ? `✕ ${t("ticket.hide")}` : `📋 ${t("ticket.show")} · ${formatMoney(profit)}`,
      ),
      this.ticketOpen
        ? h(
            "div",
            { class: "ticket-body" },
            h(
              "header",
              {},
              h("strong", {}, job.customer.name),
              h("span", { class: "chip-inline" }, t(`persona.${job.customer.persona}` as MessageKey)),
              h("button", { class: "icon-btn", title: t("ticket.listen"), onclick: () => play("voice.talk", { params: { voice: job.customer.voice } }) }, "🔊"),
            ),
            h("p", { class: "quote" }, this.quoteText(job)),
            this.wantsChips(job),
            h(
              "div",
              { class: "bill" },
              h("span", {}, t("ticket.budget")),
              h("b", {}, formatMoney(job.budget)),
              h("span", {}, t("ticket.parts")),
              h("b", {}, `−${formatMoney(cost)}`),
              h("span", {}, t("ticket.profit")),
              h("b", { class: profit >= 0 ? "pos" : "neg", id: "ticket-profit" }, formatMoney(profit)),
            ),
            h("div", { class: "ticket-radar" }, h("span", { class: "muted small" }, `${t("ticket.sound")}${match !== null ? ` · ${match}%` : ""}`), radar),
          )
        : null,
      ),
    );
    if (this.ticketOpen) requestAnimationFrame(() => drawRadar(radar, b.layout ? computeProfile(b, this.catalog).sound : null, targetRanges(job.sound), { labels: true }));
  }

  // ---------- Delivery ----------
  private deliver() {
    const b = this.session!;
    const r = evaluateBuild(b, this.catalog);
    const s = this.state;
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
    this.renderHud();
    this.showResult(b, r);
  }

  private showResult(b: BuildSession, r: BuildResult) {
    this.disposeView();
    this.stepper.replaceChildren();
    this.ticket.hidden = true;
    this.scene.setView("overview");
    const voice = b.job.customer.voice;
    const mood = r.mood;
    play(r.stars >= 4 ? "progress.goal" : r.stars === 3 ? "ui.confirm" : "progress.reviewBad");
    if (mood === "ecstatic") play("voice.laugh", { params: { voice }, delay: 0.6 });
    else play(mood === "furious" || mood === "annoyed" ? "voice.angry" : mood === "meh" ? "voice.talk" : "voice.happy", { params: { voice }, delay: 0.6 });
    const reaction = tx(`result.reaction.${mood}.${Math.floor(Math.random() * 3)}`);
    const complaint = r.stars <= 3 ? tx(`result.complaint.${r.worst}`) : "";
    const comps = (Object.keys(r.scores) as ScoreComponent[]).map((c) =>
      h(
        "div",
        { class: "score-row" },
        h("span", {}, t(`result.component.${c}` as MessageKey)),
        h("span", { class: "bar" }, h("span", { class: "bar-in", style: `width:${Math.round(r.scores[c] * 100)}%` })),
        h("b", {}, `${Math.round(r.scores[c] * 100)}%`),
      ),
    );
    const money = (label: MessageKey, v: number, cls = "") => [h("span", {}, t(label)), h("b", { class: cls }, (v >= 0 ? "+" : "−") + formatMoney(Math.abs(v)))];
    this.sheet.className = "sheet sheet-result";
    this.sheet.replaceChildren(
      h("header", { class: "sheet-head" }, h("h2", {}, t("result.title", { name: b.job.customer.name }))),
      h(
        "div",
        { class: "result" },
        h("div", { class: "stars", "data-test": "result-stars", "data-stars": String(r.stars) }, ...[1, 2, 3, 4, 5].map((i) => h("span", { class: i <= r.stars ? "on" : "" }, "★"))),
        h("p", { class: "quote big" }, `“${reaction}${complaint ? " " + complaint : ""}”`),
        h("div", { class: "scores" }, ...comps),
        h(
          "div",
          { class: "bill" },
          ...money("result.pay", r.pay),
          ...money("result.tip", r.tip),
          ...money("result.parts", -r.partsCost),
          ...money("result.profit", r.profit, r.profit >= 0 ? "pos" : "neg"),
          h("span", {}, t("result.rep")),
          h("b", { class: r.repDelta >= 0 ? "pos" : "neg" }, `${r.repDelta >= 0 ? "+" : "−"}${formatNumber(Math.abs(r.repDelta) / 100, 2)} ★`),
        ),
      ),
      h("footer", { class: "sheet-foot" }, h("span", { class: "spacer" }), h("button", { class: "btn btn-primary", id: "btn-next-customer", onclick: () => (play("shop.doorBell"), this.showBoard()) }, t("result.next"))),
    );
    // little celebration on the board
    const board = this.scene.board;
    if (board && r.stars >= 4) board.layout.keys.forEach((k, i) => setTimeout(() => (board.pressKey(k.id), this.o.stage.wake()), i * 15));
  }

  // ---------- Dev ----------
  /** Finish the current step with a good result (dev tools + automated tests). */
  autoStep() {
    const b = this.session;
    if (!b || !this.view) return;
    this.view.auto?.();
    if (stepDone(b, b.step)) {
      this.openStep(nextStep(b));
    }
  }

  private disposeView() {
    this.view?.dispose?.();
    this.view = null;
    this.scene.minigame2D = false;
  }

  dispose() {
    this.disposeView();
    this.listeners.forEach((off) => off());
    this.root.remove();
  }
}
