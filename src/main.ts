import "./styles.css";
import { setLocale } from "./i18n";
import { t } from "./i18n";
import type { GameState } from "./core/state";
import { defaultStorage, KEYS, SaveManager } from "./save/saveManager";
import { Stage } from "./world/stage";
import { TitleScene } from "./world/titleScene";
import { CheaterScene } from "./world/cheaterScene";
import { showCheater, showDebug, showOtherTab, showShop, showTitle, type Hud } from "./ui/screens";
import { toast } from "./ui/dom";
import { unlockAudio } from "./audio/synth";

setLocale(navigator.language || "en");
document.title = t("game.title");

const { kv, persistent } = defaultStorage();
const saves = new SaveManager(kv);
const stage = new Stage(document.getElementById("app")!);

let state: GameState | null = null;
let hud: Hud | null = null;
let lastSaveAt = performance.now();
let suspended = false; // another tab took over the store

// Browsers only allow sound after a gesture.
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);

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
  channel.postMessage("hello");
}

function goTitle() {
  if (!persist()) return;
  stage.set(new TitleScene(stage.renderer));
  showTitle({
    save: state,
    persistent,
    onContinue: () => state && goShop(state),
    onNew: () => goShop(saves.newGame()),
  });
}

function goShop(s: GameState) {
  state = s;
  hud = showShop(s, goTitle);
}

function goCheater(count: number) {
  state = null;
  hud = null;
  stage.set(new CheaterScene());
  showCheater(count, () => {
    state = saves.acceptShame();
    stage.set(new TitleScene(stage.renderer));
    goShop(state);
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
  if (!state || !hud || document.hidden) return;
  state.playTimeSec += 1;
  if (performance.now() - lastSaveAt > 30_000) persist();
}, 1000);

// Save when the tab is hidden or closed (crypto is synchronous, so this completes).
document.addEventListener("visibilitychange", () => document.hidden && persist());
window.addEventListener("pagehide", () => persist());

// Developer tools (only in `npm run dev`, never in the production build).
if (import.meta.env.DEV) {
  showDebug({
    addMoney: () => {
      if (!state) return;
      state.money += 100_00;
      persist(true);
      hud?.update(state);
    },
    nextDay: () => {
      if (!state) return;
      state.day += 1;
      persist(true);
      hud?.update(state);
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
