/**
 * Game orchestrator: boot → title → character creation → walking around the shop → bench / job board
 * → delivery. Owns the save (tamper checks), the single-tab rule, autosave and dev hooks.
 */
import { play, unlockAudio } from "../audio/engine";
import { newSession } from "../build/session";
import type { JobRequest } from "../build/types";
import { Rng } from "../core/rng";
import type { GameState } from "../core/state";
import { randomAvatar, type AvatarParams } from "../data/avatar";
import { getCatalog } from "../data/catalog";
import { GameApp } from "../engine/app";
import { CheaterScene } from "../engine/cheaterScene";
import { StoreScene } from "../engine/store/storeScene";
import type { InteractId } from "../engine/store/storeBuilder";
import { showCheater } from "../gui/screens/cheater";
import { createHud, type Hud } from "../gui/screens/hud";
import { showProfileEditor } from "../gui/screens/profile";
import { openSettings } from "../gui/screens/settings";
import { openSoundBoard } from "../gui/screens/soundBoard";
import { confirmNewGame, showTitle } from "../gui/screens/title";
import { C, S, T } from "../gui/theme";
import { button, H_CENTER, label, stack, V_BOTTOM } from "../gui/widgets";
import { t } from "../i18n";
import { defaultStorage, KEYS, SaveManager } from "../save/saveManager";
import { BenchMode } from "./bench/bench";
import { openJobBoard } from "./jobBoard";
import { showResults } from "./results";
import { minigameRegistry } from "./bench/games/common";

const touch = matchMedia("(pointer: coarse)").matches;

export function avatarForJob(job: JobRequest): AvatarParams {
  const r = new Rng(`customer/${job.id}/${job.customer.name}`);
  return randomAvatar(() => r.next());
}

export class Game {
  readonly app: GameApp;
  private saves: SaveManager;
  private kv;
  private persistent: boolean;
  state: GameState | null = null;
  store: StoreScene | null = null;
  private hud: Hud | null = null;
  bench: BenchMode | null = null;
  private offTitle: (() => void) | null = null;
  private closeProfile: (() => void) | null = null;
  private suspended = false;
  private lastSave = performance.now();
  private unlockAll = false;

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
  }

  private get builds() {
    return this.unlockAll ? 999 : (this.state?.stats.keyboardsBuilt ?? 0);
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
    if (res === "failed") this.store?.ui.toast(t("hud.saveFailed"), "error");
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
    const ui = this.store?.ui;
    if (ui)
      ui.modal({ w: 520, h: 260, name: "other-tab" }, (p) => {
        const col = stack({ w: "86%", y: S.xl, ha: H_CENTER, spacing: S.sm });
        col.addControl(label(t("tabs.title"), { size: T.h2, weight: 700, align: H_CENTER, wrap: true }));
        col.addControl(label(t("tabs.body"), { size: T.body, color: C.inkSoft, align: H_CENTER, wrap: true }));
        p.addControl(col);
        p.addControl(button(t("tabs.useHere"), { w: 260, variant: "primary", y: -S.xl, ha: H_CENTER, va: V_BOTTOM, onClick: () => location.reload() }));
      });
    // Stop rendering once the dialog has actually been drawn (a couple of frames later).
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
    this.makeStore();
    this.goTitle();
  }

  private makeStore() {
    const s = this.state;
    const avatar = s?.profile.avatar ?? randomAvatar(Math.random);
    this.store = new StoreScene(this.app, avatar, s?.profile.storeName || t("profile.defaultStore"));
    this.app.set(this.store);
    this.store.onNearbyChange = (id) => this.hud?.setPrompt(id);
    this.store.onInteract = (id) => this.interact(id);
    if (import.meta.env.DEV) this.devButton();
  }

  goTitle() {
    if (!this.persist()) return;
    const store = this.store!;
    this.leaveModes();
    store.setMode("attract");
    this.offTitle = showTitle(store.ui, {
      save: this.state,
      persistent: this.persistent,
      version: __APP_VERSION__,
      onContinue: () => this.continueGame(),
      onNew: () => (this.state ? confirmNewGame(store.ui, () => this.newGame()) : this.newGame()),
      onSettings: () => openSettings(store.ui, this.app),
    });
  }

  private leaveModes() {
    this.offTitle?.();
    this.offTitle = null;
    this.closeProfile?.();
    this.closeProfile = null;
    this.bench?.dispose();
    this.bench = null;
    this.hud?.dispose();
    this.hud = null;
    this.store?.ui.clearOverlay();
  }

  private newGame() {
    unlockAudio();
    this.state = this.saves.newGame();
    const p = this.state.profile;
    this.store!.setAvatar(p.avatar);
    this.store!.setStoreName(t("profile.defaultStore"));
    this.store!.customerLeave("neutral", "idle");
    play("progress.dayStart");
    play("shop.doorBell", { delay: 0.5 });
    this.openProfile(true);
  }

  private continueGame() {
    unlockAudio();
    if (!this.state) return;
    if (!this.state.profile.created) this.openProfile(true);
    else this.enterPlay();
  }

  // ---------------- Profile editor ----------------
  openProfile(first: boolean) {
    const store = this.store!;
    const s = this.state!;
    this.leaveModes();
    store.setMode("editor");
    this.closeProfile = showProfileEditor(store.ui, {
      first,
      name: s.profile.name,
      storeName: s.profile.storeName,
      avatar: s.profile.avatar,
      onAvatar: (a) => store.setAvatar(a),
      onStoreName: (n) => store.setStoreName(n),
      onInsets: (l, tp, b, r) => store.setInsets(l, tp, b, r),
      onDone: (p) => {
        this.closeProfile = null;
        s.profile = { ...p, created: true };
        store.setAvatar(p.avatar);
        store.setStoreName(p.storeName);
        store.setInsets(0, 0, 0, 0);
        this.persist();
        play("progress.unlock");
        if (first) store.ui.toast(t("profile.welcome", { store: p.storeName, name: p.name }), "good");
        this.enterPlay();
      },
    });
  }

  // ---------------- Walking around ----------------
  enterPlay() {
    const store = this.store!;
    const s = this.state!;
    this.leaveModes();
    store.setMode("play");
    this.hud = createHud(store.ui, {
      state: s,
      touch,
      stick: store.stick,
      onProfile: () => this.openProfile(false),
      onSettings: () => openSettings(store.ui, this.app),
      onMenu: () => this.openMenu(),
      onJobs: () => this.openJobs(),
      onInteract: () => store.nearby && this.interact(store.nearby),
    });
    store.ui.setScreen(this.hud.root);
    this.hud.setJob(s.activeBuild ? t("hud.activeJob", { name: s.activeBuild.job.customer.name.split(" ")[0], layout: s.activeBuild.job.layout.kind === "exact" ? t(`layout.name.${s.activeBuild.job.layout.id}` as "layout.name.65") : "…" }) : null);
    this.hud.setPrompt(store.nearby);
    setTimeout(() => this.hud?.showHint(false), 12000);
    // The customer waits at the counter while their job is in progress.
    if (s.activeBuild && !store.customer) store.spawnCustomer(avatarForJob(s.activeBuild.job));
  }

  private interact(id: InteractId) {
    unlockAudio();
    play("ui.open");
    if (id === "bench") this.enterBench();
    else if (id === "jobs") this.openJobs();
    else this.openProfile(false);
  }

  private openMenu() {
    const store = this.store!;
    store.ui.modal({ w: 420, h: 380, name: "pause", dismissable: true }, (p, close) => {
      const col = stack({ w: "80%", y: S.xl, ha: H_CENTER, spacing: S.md });
      col.addControl(label(t("menu.title"), { size: T.h1, weight: 700, align: H_CENTER }));
      col.addControl(button(t("menu.resume"), { w: "100%", variant: "primary", testId: "menu-resume", onClick: close }));
      col.addControl(button(t("settings.open"), { w: "100%", testId: "menu-settings", onClick: () => (close(), openSettings(store.ui, this.app)) }));
      col.addControl(button(t("menu.quit"), { w: "100%", testId: "menu-quit", onClick: () => (close(), this.goTitle()) }));
      p.addControl(col);
    });
  }

  private openJobs() {
    const store = this.store!;
    const s = this.state!;
    openJobBoard(store.ui, {
      state: s,
      catalog: getCatalog(s.seed),
      builds: this.builds,
      persist: () => this.persist(),
      onClose: () => {},
      onTake: (job) => {
        s.activeBuild = newSession(job);
        this.persist();
        play("ui.confirm");
        play("shop.doorBell", { delay: 0.3 });
        store.ui.toast(t("board.customerComing", { name: job.customer.name }), "good");
        store.spawnCustomer(avatarForJob(job), () => play("voice.talk", { params: { voice: job.customer.voice } }));
        if (this.bench) {
          this.bench.dispose();
          this.enterBench();
        } else this.enterPlay();
      },
    });
  }

  // ---------------- Workbench ----------------
  private enterBench() {
    const store = this.store!;
    const s = this.state!;
    this.leaveModes();
    this.bench = new BenchMode({
      store,
      state: s,
      catalog: getCatalog(s.seed),
      builds: () => this.builds,
      persist: () => this.persist(),
      wake: () => this.app.wake(),
      onExit: () => {
        this.bench = null;
        this.enterPlay();
      },
      onNeedJob: () => this.openJobs(),
      onDelivered: (b, r) => {
        const mood = r.mood;
        store.customerLeave(mood === "ecstatic" || mood === "happy" ? "happy" : mood === "meh" ? "neutral" : "angry", mood === "ecstatic" || mood === "happy" ? "happy" : mood === "meh" ? "idle" : "angry");
        play(r.stars >= 4 ? "progress.goal" : r.stars === 3 ? "ui.confirm" : "progress.reviewBad");
        const voice = b.job.customer.voice;
        if (mood === "ecstatic") play("voice.laugh", { params: { voice }, delay: 0.6 });
        else play(mood === "furious" || mood === "annoyed" ? "voice.angry" : mood === "meh" ? "voice.talk" : "voice.happy", { params: { voice }, delay: 0.6 });
        showResults(store.ui, b.job, r, () => {
          play("shop.doorBell");
          this.bench?.clearBoard();
          this.bench?.exit();
        });
      },
    });
  }

  // ---------------- Cheater ----------------
  private goCheater(count: number) {
    this.leaveModes();
    this.state = null;
    this.store = null;
    const scene = new CheaterScene(this.app);
    this.app.set(scene);
    showCheater(scene.ui, count, () => {
      this.state = this.saves.acceptShame();
      this.makeStore();
      this.openProfile(true);
    });
  }

  // ---------------- Dev tools (npm run dev only) ----------------
  private devButton() {
    const ui = this.store!.ui;
    const btn = button("🛠", { w: 44, h: 44, size: "sm", variant: "dark", x: 8, y: -8, va: V_BOTTOM, testId: "dev-tools" });
    btn.onClick = () =>
      ui.modal({ w: 420, h: 520, name: "dev", dismissable: true }, (p, close) => {
        const col = stack({ w: "84%", y: S.lg, ha: H_CENTER, spacing: S.sm });
        col.addControl(label(t("debug.title"), { size: T.h2, weight: 700, align: H_CENTER }));
        const act = (k: Parameters<typeof t>[0], id: string, f: () => void) => col.addControl(button(t(k), { w: "100%", size: "sm", testId: id, onClick: () => (close(), f()) }));
        act("debug.autoStep", "dbg-auto", () => this.bench?.autoStep());
        act("debug.unlockAll", "dbg-unlock", () => ((this.unlockAll = !this.unlockAll), ui.toast(`${t("debug.unlockAll")}: ${this.unlockAll ? "ON" : "OFF"}`)));
        act("debug.addMoney", "dbg-money", () => this.state && ((this.state.money += 100_00), this.persist(), this.hud?.update(), play("money.register")));
        act("debug.nextDay", "dbg-day", () => this.state && ((this.state.day += 1), this.persist(), this.hud?.update()));
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
      find: (name: string) => this.store?.ui.find(name) ?? (this.app.scene as unknown as { ui?: { find(n: string): unknown } })?.ui?.find(name) ?? null,
      step: () => this.state?.activeBuild?.step ?? null,
      state: () => this.state,
      autoStep: () => this.bench?.autoStep(),
      keyScreen: (id: number) => {
        const b = (this.bench as unknown as { board: import("../engine/keyboard/board").Board | null })?.board;
        return b && this.store ? this.store.toScreen(b.keyWorld(id)) : null;
      },
      keyCount: () => (this.bench as unknown as { board: { layout: { keys: unknown[] } } | null })?.board?.layout.keys.length ?? 0,
      faults: () => this.state?.activeBuild?.faults ?? [],
      mode: () => this.store?.mode ?? null,
      settled: () => this.store?.cameraSettled() ?? true,
      minigame: () => minigameRegistry.current?.debugPoints() ?? null,
      minigameObj: () => minigameRegistry.current,
      player: () => this.store?.controller.pos.asArray() ?? null,
    };
    void import("../audio/engine").then((engine) =>
      import("../audio/library").then((lib) => ((window as unknown as Record<string, unknown>).__mkssAudio = { renderOffline: engine.renderOffline, ids: lib.SFX_IDS })),
    );
  }
}
