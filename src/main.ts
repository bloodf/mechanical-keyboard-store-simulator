import "./styles.css";
import { setLocale } from "./i18n";
import { t } from "./i18n";
import type { GameState } from "./core/state";
import { defaultStorage, KEYS, SaveManager } from "./save/saveManager";
import { Stage } from "./world/stage";
import { TitleScene } from "./world/titleScene";
import { CheaterScene } from "./world/cheaterScene";
import { showCheater, showDebug, showOtherTab, showTitle } from "./ui/screens";
import { Bench } from "./ui/bench/bench";
import { toast } from "./ui/dom";
import { play, unlockAudio } from "./audio/engine";

setLocale(navigator.language || "en");
document.title = t("game.title");

const { kv, persistent } = defaultStorage();
const saves = new SaveManager(kv);
const stage = new Stage(document.getElementById("app")!);

let state: GameState | null = null;
let bench: Bench | null = null;
let lastSaveAt = performance.now();
let suspended = false; // another tab took over the store

// Browsers only allow sound after a gesture (capture phase: runs before any click sound).
window.addEventListener("pointerdown", unlockAudio, true);
window.addEventListener("keydown", unlockAudio, true);

// Every keycap-style button clicks; hovering with a mouse gives a soft tick.
document.addEventListener("pointerdown", (e) => {
  const b = (e.target as Element | null)?.closest?.(".btn") as HTMLButtonElement | null;
  if (b && !b.disabled) play("ui.click");
});
document.addEventListener("pointerover", (e) => {
  if (e.pointerType !== "mouse") return;
  const b = (e.target as Element | null)?.closest?.(".btn");
  const from = (e.relatedTarget as Element | null)?.closest?.(".btn");
  if (b && b !== from) play("ui.hover");
});

/** Returns false if the session can't continue (cheater / other tab / wiped). */
function persist(showToast = false): boolean {
  if (!state || suspended) return true;
  const res = saves.save(state);
  lastSaveAt = performance.now();
  switch (res) {
    case "tampered": {
      // The save was edited while the game was running.
      const r = saves.load();
      goCheater(r.kind === "tampered" ? r.cheatCount : 1);
      return false;
    }
    case "conflict":
      suspendForOtherTab();
      return false;
    case "wiped":
      state = null; // player cleared site data: respect it, stop saving this run
      location.reload();
      return false;
    case "failed":
      toast(t("hud.saveFailed"), "error");
      return true;
    default:
      if (showToast) toast(t("hud.saved"));
      return true;
  }
}

function suspendForOtherTab() {
  if (suspended) return;
  suspended = true;
  stage.stop();
  showOtherTab(() => location.reload());
}

// One tab at a time: a newly opened tab takes over; older tabs pause and stop saving.
if ("BroadcastChannel" in window) {
  const channel = new BroadcastChannel("mkss");
  channel.onmessage = (e) => {
    if (e.data === "hello") suspendForOtherTab();
  };
  // The tab you're looking at owns the store. A tab opened/reloaded in the background
  // only claims it once it becomes visible (so dev auto-reloads can't steal it).
  let claimed = false;
  const claim = () => {
    if (claimed || document.hidden) return;
    claimed = true;
    channel.postMessage("hello");
  };
  claim();
  document.addEventListener("visibilitychange", claim);
}

function goTitle() {
  if (!persist()) return;
  bench?.dispose();
  bench = null;
  stage.set(new TitleScene(stage.renderer));
  showTitle({
    save: state,
    persistent,
    onContinue: () => state && goBench(state),
    onNew: () => {
      play("progress.dayStart");
      play("shop.doorBell", { delay: 0.5 });
      goBench(saves.newGame());
    },
  });
}

const DEV_UNLOCK_KEY = "mkss.dev.unlockAll";
const unlockAll = () => import.meta.env.DEV && sessionStorage.getItem(DEV_UNLOCK_KEY) === "1";

function goBench(s: GameState) {
  state = s;
  bench?.dispose();
  bench = new Bench({ stage, state: s, persist: () => void persist(), onMenu: goTitle, unlockAll });
}

function goCheater(count: number) {
  state = null;
  bench?.dispose();
  bench = null;
  stage.set(new CheaterScene());
  showCheater(count, () => {
    state = saves.acceptShame();
    goBench(state);
  });
}

function boot() {
  const res = saves.load();
  if (res.kind === "tampered") {
    console.warn("[save] tamper detected:", res.reason);
    goCheater(res.cheatCount);
    return;
  }
  state = res.kind === "ok" ? res.state : null;
  goTitle();
}

// Play-time clock + periodic autosave while in the shop.
setInterval(() => {
  if (!state || !bench || document.hidden) return;
  state.playTimeSec += 1;
  if (performance.now() - lastSaveAt > 30_000) persist();
}, 1000);

// Save when the tab is hidden or closed (crypto is synchronous, so this completes).
document.addEventListener("visibilitychange", () => document.hidden && persist());
window.addEventListener("pagehide", () => persist());

// Developer tools (only in `npm run dev`, never in the production build).
if (import.meta.env.DEV) {
  // Hook for the automated audio check (tests/e2e/audio.cjs).
  void Promise.all([import("./audio/engine"), import("./audio/library")]).then(([engine, lib]) => {
    (window as unknown as Record<string, unknown>).__mkssAudio = { renderOffline: engine.renderOffline, ids: lib.SFX_IDS };
  });
  (window as unknown as Record<string, unknown>).__mkssBench = {
    autoStep: () => bench?.autoStep(),
    step: () => bench?.session?.step ?? null,
    state: () => state,
    keyScreen: (id: number) => bench?.scene.keyScreen(id) ?? null,
    keyCount: () => bench?.scene.board?.layout.keys.length ?? 0,
    faults: () => bench?.session?.faults ?? [],
    camera: () => bench && { pos: bench.scene.camera.position.toArray(), view: bench.scene.camera.view, aspect: bench.scene.camera.aspect, fov: bench.scene.camera.fov },
  };
  showDebug({
    autoStep: () => bench?.autoStep(),
    unlockAll: () => {
      const on = sessionStorage.getItem(DEV_UNLOCK_KEY) !== "1";
      sessionStorage.setItem(DEV_UNLOCK_KEY, on ? "1" : "0");
      toast(`${t("debug.unlockAll")}: ${on ? "ON" : "OFF"}`);
      if (state) goBench(state);
    },
    addMoney: () => {
      if (!state) return;
      play("money.register");
      state.money += 100_00;
      persist(true);
      bench?.renderHud();
    },
    nextDay: () => {
      if (!state) return;
      play("progress.dayEnd");
      play("progress.dayStart", { delay: 1.5 });
      state.day += 1;
      persist(true);
      bench?.renderHud();
    },
    tamper: () => {
      // Simulates a player editing localStorage: flip one character in the newest slot.
      for (const key of [KEYS.a, KEYS.b]) {
        const raw = kv.getItem(key);
        if (!raw) continue;
        const i = Math.floor(raw.length / 2);
        kv.setItem(key, raw.slice(0, i) + (raw[i] === "A" ? "B" : "A") + raw.slice(i + 1));
        break;
      }
      state = null; // don't let autosave overwrite the tampered data
      location.reload();
    },
    wipe: () => {
      state = null;
      Object.values(KEYS).forEach((k) => kv.removeItem(k));
      location.reload();
    },
  });
}

boot();
