/**
 * Game orchestrator: boot → title → workshop setup → the workshop (bench + orders, stock, suppliers, mail)
 * → end of day → next morning. Owns the save (tamper checks), the single-tab rule, autosave, the
 * workshop clock and dev hooks.
 */
import { play, unlockAudio } from "../audio/engine";
import type { BuildResult } from "../build/scoring";
import { give, starterKit } from "../build/stock";
import type { BuildSession } from "../build/types";
import { advance, isClosingTime, nextDay, startGame, type DayReport, type ShipOutcome, type WorkshopEvent } from "../build/workshop";
import { DAY_END, nowAbs, type GameState } from "../core/state";
import { getCatalog } from "../data/catalog";
import { CASE_MATERIALS, PCBS, PLATES, STABS } from "../data/parts";
import { GameApp } from "../engine/app";
import { Board } from "../engine/keyboard/board";
import { CheaterScene } from "../engine/cheaterScene";
import { loadSwitchModels } from "../engine/keyboard/switchModels";
import { WorkshopScene } from "../engine/workshop/workshopScene";
import { showCheater } from "../gui/screens/cheater";
import { showProfileForm } from "../gui/screens/profile";
import { openSettings } from "../gui/screens/settings";
import { openSoundBoard } from "../gui/screens/soundBoard";
import { confirmNewGame, showTitle } from "../gui/screens/title";
import { createWorkshopHud, type WorkshopHud } from "../gui/screens/workshopHud";
import { C, S, T } from "../gui/theme";
import { button, group, H_CENTER, label, stack, V_BOTTOM } from "../gui/widgets";
import { formatMoney, t } from "../i18n";
import { defaultStorage, KEYS, SaveManager } from "../save/saveManager";
import { BenchMode } from "./bench/bench";
import { minigameRegistry } from "./bench/games/common";
import type { SupplierPreset } from "./bench/types";
import { openMail, mailFrom } from "./panels/mail";
import { openOrders } from "./panels/orders";
import { openStock } from "./panels/stock";
import { openSuppliers } from "./panels/suppliers";
import { showShipped } from "./results";

export class Game {
  readonly app: GameApp;
  private saves: SaveManager;
  private kv;
  private persistent: boolean;
  state: GameState | null = null;
  ws: WorkshopScene | null = null;
  private hud: WorkshopHud | null = null;
  bench: BenchMode | null = null;
  private offTitle: (() => void) | null = null;
  private suspended = false;
  private lastSave = performance.now();
  private unlockAll = false;
  private panelOpen = false;
  private pendingDone: (() => void) | null = null;
  private showcase: Board | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.app = new GameApp(canvas);
    const { kv, persistent } = defaultStorage();
    this.kv = kv;
    this.persistent = persistent;
    this.saves = new SaveManager(kv);
    setInterval(() => {
      if (!this.state || document.hidden || this.suspended) return;
      this.state.playTimeSec += 1;
      if (performance.now() - this.lastSave > 30_000) this.persist();
    }, 1000);
    document.addEventListener("visibilitychange", () => document.hidden && this.persist());
    window.addEventListener("pagehide", () => this.persist());
    this.singleTab();
    if (import.meta.env.DEV) this.devHooks();
    void loadSwitchModels();
  }

  private get builds() {
    return this.unlockAll ? 999 : (this.state?.stats.keyboardsBuilt ?? 0);
  }
  private get catalog() {
    return getCatalog(this.state!.seed);
  }
  private get ui() {
    return this.ws!.ui;
  }

  // ---------------- Save ----------------
  /** Returns false if the session can't continue (cheating / other tab / wiped). */
  persist(): boolean {
    if (!this.state || this.suspended) return true;
    const res = this.saves.save(this.state);
    this.lastSave = performance.now();
    if (res === "tampered") {
      const r = this.saves.load();
      this.goCheater(r.kind === "tampered" ? r.cheatCount : 1);
      return false;
    }
    if (res === "conflict") {
      this.suspend();
      return false;
    }
    if (res === "wiped") {
      this.state = null;
      location.reload();
      return false;
    }
    if (res === "failed") this.ws?.ui.toast(t("hud.saveFailed"), "error");
    this.hud?.update();
    return true;
  }

  private singleTab() {
    if (!("BroadcastChannel" in window)) return;
    const ch = new BroadcastChannel("mkss");
    ch.onmessage = (e) => e.data === "hello" && this.suspend();
    let claimed = false;
    const claim = () => {
      if (claimed || document.hidden) return;
      claimed = true;
      ch.postMessage("hello");
    };
    claim();
    document.addEventListener("visibilitychange", claim);
  }

  private suspend() {
    if (this.suspended) return;
    this.suspended = true;
    const ui = this.ws?.ui;
    if (ui)
      ui.modal({ w: 520, h: 260, name: "other-tab" }, (p) => {
        const col = stack({ w: "86%", y: S.xl, ha: H_CENTER, spacing: S.sm });
        col.addControl(label(t("tabs.title"), { size: T.h2, weight: 700, align: H_CENTER, wrap: true }));
        col.addControl(label(t("tabs.body"), { size: T.body, color: C.inkSoft, align: H_CENTER, wrap: true }));
        p.addControl(col);
        p.addControl(button(t("tabs.useHere"), { w: 260, variant: "primary", y: -S.xl, ha: H_CENTER, va: V_BOTTOM, onClick: () => location.reload() }));
      });
    const scene = this.app.scene?.scene;
    let frames = 0;
    const obs = scene?.onAfterRenderObservable.add(() => {
      if (++frames >= 3) {
        scene.onAfterRenderObservable.remove(obs!);
        this.app.stop();
      }
    });
    if (!scene) this.app.stop();
  }

  // ---------------- Boot & title ----------------
  boot() {
    const res = this.saves.load();
    if (res.kind === "tampered") {
      console.warn("[save] tamper detected:", res.reason);
      this.goCheater(res.cheatCount);
      return;
    }
    this.state = res.kind === "ok" ? res.state : null;
    this.makeWorkshop();
    this.goTitle();
  }

  private makeWorkshop() {
    const s = this.state;
    this.ws = new WorkshopScene(this.app, s?.profile.storeName || t("profile.defaultStore"));
    this.app.set(this.ws);
    if (import.meta.env.DEV) this.devButton();
  }

  goTitle() {
    if (!this.persist()) return;
    const ws = this.ws!;
    this.leaveWorkshop();
    ws.setAttract(true);
    this.makeShowcase();
    this.offTitle = showTitle(ws.ui, {
      save: this.state,
      persistent: this.persistent,
      version: __APP_VERSION__,
      onContinue: () => this.continueGame(),
      onNew: () => (this.state ? confirmNewGame(ws.ui, () => this.newGame()) : this.newGame()),
      onSettings: () => openSettings(ws.ui, this.app),
    });
  }

  /** A finished keyboard on the bench behind the title screen (different every time). */
  private makeShowcase() {
    this.showcase?.dispose();
    const ws = this.ws!;
    const cat = getCatalog(this.state?.seed ?? "TITLE");
    const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
    const layout = pick(["60", "65", "75", "tkl"] as const);
    const b = new Board(ws.scene, layout, ws.shadows);
    b.base.parent = ws.benchAnchor;
    const sw = pick(cat.switches.filter((x) => x.family !== "choc"));
    b.setSwitchLook(sw);
    const m = pick(CASE_MATERIALS);
    b.setCase(m, pick(cat.caseColors[m.id]).hex, false);
    b.setPcb(PCBS[0], false);
    b.setPlate(PLATES[0], false);
    b.setStabs(STABS[1], true, false);
    b.setAllSwitches(true, true);
    b.setKeycaps(pick(cat.keycaps.filter((k) => k.profile !== "lp")));
    b.setAllCaps(true, true);
    b.base.rotation.y = (Math.random() - 0.5) * 0.3;
    this.showcase = b;
    const obs = ws.scene.onBeforeRenderObservable.add(() => {
      if (this.showcase !== b) return ws.scene.onBeforeRenderObservable.remove(obs);
      b.update(ws.scene.getEngine().getDeltaTime() / 1000);
    });
  }

  private leaveWorkshop() {
    this.showcase?.dispose();
    this.showcase = null;
    this.offTitle?.();
    this.offTitle = null;
    this.bench?.dispose();
    this.bench = null;
    this.hud?.dispose();
    this.hud = null;
    this.ws?.ui.clearOverlay();
    this.ws?.ui.setScreen();
  }

  private newGame() {
    unlockAudio();
    this.state = this.saves.newGame();
    startGame(this.state, this.catalog);
    this.ws!.setStoreName(t("profile.defaultStore"));
    play("progress.dayStart");
    this.openProfile(true);
  }

  private continueGame() {
    unlockAudio();
    const s = this.state;
    if (!s) return;
    if (s.needsStarterKit) {
      // saves from the shop-floor version: hand out the starter stock once
      for (const [sku, n] of Object.entries(starterKit(this.catalog))) give(s.inventory, sku, n);
      delete s.needsStarterKit;
      this.persist();
    }
    if (!s.profile.created) this.openProfile(true);
    else this.enterWorkshop();
  }

  // ---------------- Profile ----------------
  openProfile(first: boolean) {
    const s = this.state!;
    if (first) this.leaveWorkshop();
    showProfileForm(this.ui, {
      first,
      name: s.profile.name,
      storeName: s.profile.storeName,
      onStoreName: (n) => this.ws!.setStoreName(n),
      onDone: (p) => {
        s.profile = { ...p, created: true };
        this.ws!.setStoreName(p.storeName);
        this.persist();
        play("progress.unlock");
        if (first) {
          this.ui.toast(t("profile.welcome", { store: p.storeName, name: p.name }), "good");
          this.enterWorkshop();
        } else this.hud?.update();
      },
    });
  }

  // ---------------- The workshop ----------------
  enterWorkshop() {
    const ws = this.ws!;
    const s = this.state!;
    this.leaveWorkshop();
    ws.setAttract(false);
    this.hud = createWorkshopHud(ws.ui, {
      state: s,
      onOrders: () => this.openOrdersPanel(),
      onStock: () => this.openStockPanel(),
      onSuppliers: () => this.openSuppliersPanel(),
      onMail: () => this.openMailPanel(),
      onCloseDay: () => this.confirmCloseDay(),
      onMenu: () => this.openMenu(),
    });
    this.bench = new BenchMode({
      ws,
      state: s,
      catalog: this.catalog,
      builds: () => this.builds,
      hudHeight: () => this.hud?.height ?? 70,
      persist: () => this.persist(),
      wake: () => this.app.wake(),
      onWork: (m) => this.work(m),
      onWaitCourier: () => this.waitCourier(),
      onShipped: (b, r, o) => this.shipped(b, r, o),
      openSuppliers: (p) => this.openSuppliersPanel(p),
      openOrders: () => this.openOrdersPanel(),
    });
    if (isClosingTime(s)) this.dayOver();
  }

  /** Hide the bench UI under a panel; restore when it closes. */
  private panel(open: (onClose: () => void) => void) {
    if (this.panelOpen) {
      // a sheet closed but the frame that notices it hasn't run yet: finish that first
      const sheetOpen = this.ui.overlay.children.some((c) => /^(orders|stock|suppliers|mail)-scrim$/.test(c.name ?? ""));
      if (sheetOpen) return;
      this.pendingDone?.();
    }
    this.panelOpen = true;
    this.bench?.setHidden(true);
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      this.pendingDone = null;
      this.panelOpen = false;
      this.bench?.setHidden(false);
      this.hud?.update();
    };
    this.pendingDone = done;
    open(done);
  }

  private openOrdersPanel(tab?: "new" | "accepted") {
    const s = this.state!;
    this.panel((done) => {
      const sheet = openOrders(this.ui, {
        state: s,
        catalog: this.catalog,
        tab,
        persist: () => this.persist(),
        onChanged: () => this.hud?.update(),
        onStart: (id) => {
          done();
          this.bench?.start(id);
        },
      });
      this.onSheetClose("orders", done, sheet.close);
    });
  }

  private openStockPanel() {
    this.panel((done) => {
      const sheet = openStock(this.ui, { state: this.state!, catalog: this.catalog, onBuy: () => (sheet.close(), setTimeout(() => this.openSuppliersPanel(), 0)) });
      this.onSheetClose("stock", done, sheet.close);
    });
  }

  private openSuppliersPanel(preset?: SupplierPreset) {
    this.panel((done) => {
      const sheet = openSuppliers(this.ui, {
        state: this.state!,
        catalog: this.catalog,
        builds: this.builds,
        preset,
        persist: () => this.persist(),
        onOrdered: () => this.hud?.update(),
        onWait: () => this.waitCourier(),
      });
      this.onSheetClose("suppliers", done, sheet.close);
    });
  }

  private openMailPanel() {
    this.panel((done) => {
      const sheet = openMail(this.ui, { state: this.state!, persist: () => this.persist(), onChanged: () => this.hud?.update() });
      this.onSheetClose("mail", done, sheet.close);
    });
  }

  /** Call `done` when the sheet's modal leaves the overlay (closed by ✕, backdrop or code). */
  private onSheetClose(name: string, done: () => void, _close: () => void) {
    const ui = this.ui;
    const scene = this.ws!.scene;
    const obs = scene.onBeforeRenderObservable.add(() => {
      if (!ui.overlay.children.some((c) => c.name === `${name}-scrim`)) {
        scene.onBeforeRenderObservable.remove(obs);
        done();
        this.bench?.render();
      }
    });
  }

  // ---------------- Time ----------------
  /** Work took `minutes`: move the clock, report deliveries and mail, close at 18:00. */
  private work(minutes: number) {
    const s = this.state!;
    if (minutes <= 0) return;
    const events = advance(s, minutes);
    this.persist();
    this.report(events);
  }

  private report(events: WorkshopEvent[]) {
    for (const e of events) {
      if (e.kind === "delivery") {
        play("shop.boxDrop");
        this.ui.toast(t("ws.delivered"), "good");
      } else if (e.kind === "mail") {
        play("shop.notification");
        this.ui.toast(t("ws.newMail", { from: mailFrom(e.mail) }));
      }
    }
    this.hud?.update();
    this.bench?.render();
    if (events.some((e) => e.kind === "closing")) this.dayOver();
  }

  /** Skip ahead to the next express delivery (the courier). */
  private waitCourier() {
    const s = this.state!;
    const now = nowAbs(s);
    const next = s.shipments.filter((x) => x.express && x.arrives > now).map((x) => x.arrives);
    if (!next.length) return;
    const target = Math.min(...next);
    const endOfDay = (s.day - 1) * 1440 + DAY_END;
    this.work(Math.min(target, endOfDay) - now);
  }

  private confirmCloseDay() {
    this.ui.confirm(t("ws.closeConfirm"), t("ws.closeYes"), t("ws.closeNo"), () => this.endDay(), "confirm-closeday");
  }

  private dayOver() {
    this.ui.toast(t("day.closing"));
    this.endDay();
  }

  private endDay() {
    const s = this.state!;
    play("progress.dayEnd");
    const report = nextDay(s, this.catalog);
    this.persist();
    this.showDayReport(report);
  }

  private showDayReport(r: DayReport) {
    const s = this.state!;
    this.ui.modal({ w: 480, h: 430, name: "day-report" }, (p, close) => {
      const col = stack({ w: "84%", y: S.xl, ha: H_CENTER, spacing: S.sm });
      col.addControl(label(`🌙 ${t("day.overTitle", { day: r.day })}`, { size: T.h2, weight: 700, align: H_CENTER }));
      const line = (k: string, v: string, color: string = C.ink) => {
        const g = group({ w: "100%", h: 28 });
        g.addControl(label(k, { size: T.body, weight: 600, color: C.inkSoft }));
        g.addControl(label(v, { size: T.body, weight: 700, align: 1, color }));
        col.addControl(g);
      };
      line(t("day.shipped"), String(r.shipped));
      line(t("day.income"), `+${formatMoney(r.income)}`, C.good);
      line(t("day.expenses"), `−${formatMoney(r.expenses)}`, r.expenses ? C.bad : C.ink);
      col.addControl(label("", { h: 6 }));
      col.addControl(label(t("day.tomorrow"), { size: T.h3, weight: 700 }));
      col.addControl(label(`📋 ${t("ws.newOffers", { count: r.newOffers })}`, { size: T.body }));
      col.addControl(label(`📦 ${t("day.deliveries", { count: r.deliveries })}`, { size: T.body }));
      p.addControl(col);
      p.addControl(
        button(t("day.open", { day: s.day }), {
          w: 320,
          size: "lg",
          variant: "primary",
          y: -S.xl,
          ha: H_CENTER,
          va: V_BOTTOM,
          testId: "day-open",
          onClick: () => {
            close();
            play("progress.dayStart");
            this.ui.toast(t("day.morning", { day: s.day }), "good");
            this.hud?.update();
            this.bench?.render();
          },
        }),
      );
    });
  }

  // ---------------- Shipping ----------------
  private shipped(b: BuildSession, r: BuildResult, o: ShipOutcome) {
    this.hud?.update();
    showShipped(this.ui, b.job, r, o, () => {
      this.bench?.clearBoard();
      this.bench?.render();
    });
  }

  private openMenu() {
    const ui = this.ui;
    ui.modal({ w: 420, h: 460, name: "pause", dismissable: true }, (p, close) => {
      const col = stack({ w: "80%", y: S.xl, ha: H_CENTER, spacing: S.md });
      col.addControl(label(t("menu.title"), { size: T.h1, weight: 700, align: H_CENTER }));
      col.addControl(button(t("menu.resume"), { w: "100%", variant: "primary", testId: "menu-resume", onClick: close }));
      col.addControl(button(t("profile.editTitle"), { w: "100%", testId: "menu-profile", onClick: () => (close(), this.openProfile(false)) }));
      col.addControl(button(t("settings.open"), { w: "100%", testId: "menu-settings", onClick: () => (close(), openSettings(ui, this.app)) }));
      col.addControl(button(t("menu.quit"), { w: "100%", testId: "menu-quit", onClick: () => (close(), this.goTitle()) }));
      p.addControl(col);
    });
  }

  // ---------------- Cheater ----------------
  private goCheater(count: number) {
    this.leaveWorkshop();
    this.state = null;
    this.ws = null;
    const scene = new CheaterScene(this.app);
    this.app.set(scene);
    showCheater(scene.ui, count, () => {
      this.state = this.saves.acceptShame();
      startGame(this.state, this.catalog);
      this.makeWorkshop();
      this.openProfile(true);
    });
  }

  // ---------------- Dev tools (npm run dev only) ----------------
  private devButton() {
    const ui = this.ws!.ui;
    const btn = button("🛠", { w: 44, h: 44, size: "sm", variant: "dark", x: 8, y: -8, va: V_BOTTOM, testId: "dev-tools" });
    btn.onClick = () =>
      ui.modal({ w: 420, h: 520, name: "dev", dismissable: true }, (p, close) => {
        const col = stack({ w: "84%", y: S.lg, ha: H_CENTER, spacing: S.sm });
        col.addControl(label(t("debug.title"), { size: T.h2, weight: 700, align: H_CENTER }));
        const act = (k: Parameters<typeof t>[0], id: string, f: () => void) => col.addControl(button(t(k), { w: "100%", size: "sm", testId: id, onClick: () => (close(), f()) }));
        act("debug.autoStep", "dbg-auto", () => this.bench?.autoStep());
        act("debug.unlockAll", "dbg-unlock", () => ((this.unlockAll = !this.unlockAll), ui.toast(`${t("debug.unlockAll")}: ${this.unlockAll ? "ON" : "OFF"}`)));
        act("debug.addMoney", "dbg-money", () => this.state && ((this.state.money += 100_00), this.persist(), play("money.register")));
        act("debug.nextDay", "dbg-day", () => this.state && this.endDay());
        act("debug.soundBoard", "dbg-sounds", () => openSoundBoard(ui));
        act("debug.tamper", "dbg-tamper", () => {
          for (const key of [KEYS.a, KEYS.b]) {
            const raw = this.kv.getItem(key);
            if (!raw) continue;
            const i = Math.floor(raw.length / 2);
            this.kv.setItem(key, raw.slice(0, i) + (raw[i] === "A" ? "B" : "A") + raw.slice(i + 1));
            break;
          }
          this.state = null;
          location.reload();
        });
        act("debug.wipe", "dbg-wipe", () => {
          this.state = null;
          Object.values(KEYS).forEach((k) => this.kv.removeItem(k));
          location.reload();
        });
        p.addControl(col);
      });
    ui.adt.addControl(btn);
  }

  /** Test/dev hooks (window.__mkss): locate UI controls, inspect state, drive minigames. */
  private devHooks() {
    (window as unknown as Record<string, unknown>).__mkss = {
      game: this,
      find: (name: string) => this.ws?.ui.find(name) ?? (this.app.scene as unknown as { ui?: { find(n: string): unknown } })?.ui?.find(name) ?? null,
      step: () => this.state?.activeBuild?.step ?? null,
      state: () => this.state,
      autoStep: () => this.bench?.autoStep(),
      keyScreen: (id: number) => {
        const b = this.bench?.board;
        return b && this.ws ? this.ws.toScreen(b.keyWorld(id)) : null;
      },
      keyCount: () => this.bench?.board?.layout.keys.length ?? 0,
      faults: () => this.state?.activeBuild?.faults ?? [],
      mode: () => (this.hud ? "workshop" : "title"),
      settled: () => this.ws?.cameraSettled() ?? true,
      minigame: () => minigameRegistry.current?.debugPoints() ?? null,
      minigameObj: () => minigameRegistry.current,
    };
    void import("../audio/engine").then((engine) =>
      import("../audio/library").then((lib) => ((window as unknown as Record<string, unknown>).__mkssAudio = { renderOffline: engine.renderOffline, ids: lib.SFX_IDS })),
    );
  }
}
