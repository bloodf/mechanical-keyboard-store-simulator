import { formatMoney, formatNumber, t } from "../i18n";
import type { GameState } from "../core/state";
import { h, uiRoot, clearUi } from "./dom";
import { play, unlockAudio } from "../audio/engine";
import { openSettings, openSoundBoard } from "./audioPanels";

export function showTitle(opts: {
  save: GameState | null;
  persistent: boolean;
  onContinue: () => void;
  onNew: () => void;
}) {
  clearUi();
  const { save } = opts;
  const menu = h(
    "div",
    { class: "menu" },
    save &&
      h(
        "button",
        { class: "btn btn-primary", id: "btn-continue", onclick: opts.onContinue },
        h("span", {}, t("title.continue")),
        h("small", {}, t("title.saveInfo", { day: save.day, money: formatMoney(save.money) })),
      ),
    h(
      "button",
      {
        class: save ? "btn" : "btn btn-primary",
        id: "btn-new",
        onclick: () => (save ? confirmNew(opts.onNew) : opts.onNew()),
      },
      t("title.newGame"),
    ),
    h("button", { class: "btn", id: "btn-settings", onclick: () => openSettings() }, t("settings.open")),
  );
  uiRoot().append(
    h(
      "div",
      { class: "screen title-screen" },
      h("h1", { class: "logo" }, t("game.title")),
      h("p", { class: "tagline" }, t("game.tagline")),
      menu,
      !opts.persistent && h("p", { class: "warn" }, t("title.noStorage")),
      h("p", { class: "version" }, t("title.version", { version: __APP_VERSION__ })),
    ),
  );
}

function confirmNew(onYes: () => void) {
  play("ui.open");
  const dlg = h(
    "div",
    { class: "modal-backdrop", id: "confirm-new" },
    h(
      "div",
      { class: "modal", role: "dialog", "aria-modal": "true" },
      h("p", {}, t("title.confirmNew")),
      h(
        "div",
        { class: "row" },
        h("button", { class: "btn", onclick: () => (play("ui.close"), dlg.remove()) }, t("title.confirmNo")),
        h("button", { class: "btn btn-danger", id: "btn-confirm-new", onclick: () => (dlg.remove(), onYes()) }, t("title.confirmYes")),
      ),
    ),
  );
  document.body.append(dlg);
}

export interface Hud {
  update(state: GameState): void;
}

export function showShop(state: GameState, onMenu: () => void): Hud {
  clearUi();
  const day = h("span", { class: "chip", id: "hud-day" });
  const money = h("span", { class: "chip chip-money", id: "hud-money" });
  const rep = h("span", { class: "chip", id: "hud-rep" });
  const badge = h("span", { class: "chip chip-badge", id: "hud-badge" }, t("hud.cheaterBadge"));
  const hud = h(
    "div",
    { class: "hud" },
    h("div", { class: "hud-left" }, day, money, rep, badge),
    h(
      "div",
      { class: "hud-right" },
      h("button", { class: "btn btn-small", id: "btn-hud-settings", "aria-label": t("settings.open"), title: t("settings.open"), onclick: () => openSettings() }, "⚙"),
      h("button", { class: "btn btn-small", id: "btn-menu", onclick: () => (play("ui.back"), onMenu()) }, t("hud.backToTitle")),
    ),
  );
  const card = h(
    "div",
    { class: "card placeholder" },
    h("h2", {}, t("shop.placeholder.title")),
    h("p", {}, t("shop.placeholder.body")),
  );
  uiRoot().append(hud, card);
  const api: Hud = {
    update(s) {
      day.textContent = t("hud.day", { day: s.day });
      money.textContent = formatMoney(s.money);
      rep.textContent = t("hud.reputation", { stars: formatNumber(s.reputation / 100, 1) });
      badge.hidden = !s.flags.knownCheater;
      badge.title = t("hud.cheaterBadge.tooltip", { count: s.flags.cheatCount });
    },
  };
  api.update(state);
  return api;
}

export function showCheater(cheatCount: number, onStartOver: () => void) {
  clearUi();
  const jokeIdx = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5).slice(0, 2);
  const bar = h("div", { class: "bar-fill" });
  const status = h("p", { class: "cheat-status" }, t("cheater.reporting"));
  const btn = h(
    "button",
    {
      class: "btn btn-danger btn-big",
      id: "btn-start-over",
      hidden: true,
      onclick: () => {
        unlockAudio();
        play("cheat.trombone");
        btn.disabled = true;
        setTimeout(onStartOver, 600);
      },
    },
    t("cheater.startOver"),
  );
  const screen = h(
    "div",
    { class: "screen cheater-screen", id: "cheater-screen" },
    h("h1", { class: "cheater-title", "data-text": t("cheater.title") }, t("cheater.title")),
    h("p", { class: "cheater-sub" }, t("cheater.subtitle")),
    ...jokeIdx.map((i) => h("p", { class: "cheater-joke" }, "• " + t(`cheater.jokes.${i}` as "cheater.jokes.0"))),
    h("p", { class: "cheater-count" }, t("cheater.count", { count: cheatCount })),
    h("div", { class: "bar" }, bar),
    status,
    btn,
  );
  uiRoot().append(screen);

  // Sound needs a user gesture: play on the first tap/key if we don't have one yet.
  let played = false;
  const playOnce = () => {
    if (played) return;
    played = true;
    unlockAudio();
    play("cheat.siren");
    play("cheat.buzzer", { delay: 1.7 });
  };
  window.addEventListener("pointerdown", playOnce, { once: true });
  window.addEventListener("keydown", playOnce, { once: true });
  playOnce(); // works if audio was already unlocked earlier in this session

  const start = performance.now();
  const duration = 3200;
  const tick = () => {
    const p = Math.min(1, (performance.now() - start) / duration);
    // Stalls at 99% for comedic effect before finishing.
    const shown = p < 0.85 ? p / 0.85 * 0.99 : 0.99;
    bar.style.width = `${(p >= 1 ? 1 : shown) * 100}%`;
    if (p < 1) requestAnimationFrame(tick);
    else {
      status.textContent = t("cheater.reportingDone", { caseNo: 10000 + Math.floor(Math.random() * 89999) });
      btn.hidden = false;
    }
  };
  requestAnimationFrame(tick);
}

export function showDebug(actions: Record<"addMoney" | "nextDay" | "tamper" | "wipe", () => void>) {
  document.getElementById("debug")?.remove();
  const panel = h(
    "details",
    { class: "debug", id: "debug" },
    h("summary", {}, t("debug.title")),
    h("button", { class: "btn btn-small", id: "dbg-money", onclick: actions.addMoney }, t("debug.addMoney")),
    h("button", { class: "btn btn-small", id: "dbg-day", onclick: actions.nextDay }, t("debug.nextDay")),
    h("button", { class: "btn btn-small", id: "dbg-tamper", onclick: actions.tamper }, t("debug.tamper")),
    h("button", { class: "btn btn-small", id: "dbg-sounds", onclick: () => ((panel.open = false), openSoundBoard()) }, t("debug.soundBoard")),
    h("button", { class: "btn btn-small btn-danger", id: "dbg-wipe", onclick: actions.wipe }, t("debug.wipe")),
  );
  document.body.append(panel);
}

export function showOtherTab(onUseHere: () => void) {
  document.getElementById("other-tab")?.remove();
  play("ui.open");
  document.body.append(
    h(
      "div",
      { class: "modal-backdrop", id: "other-tab" },
      h(
        "div",
        { class: "modal", role: "dialog", "aria-modal": "true" },
        h("h2", {}, t("tabs.title")),
        h("p", {}, t("tabs.body")),
        h("button", { class: "btn btn-primary", onclick: onUseHere }, t("tabs.useHere")),
      ),
    ),
  );
}
