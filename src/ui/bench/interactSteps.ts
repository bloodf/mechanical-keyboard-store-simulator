/** Steps where you work directly on the 3D board: install, solder, key test, sound check. */
import { play } from "../../audio/engine";
import { computeProfile, soundMatch, targetRanges } from "../../build/profile";
import { applyInstall, applySolder, isHotswap, unresolvedFaults } from "../../build/session";
import { DAMPENING, isUnlocked, LAYOUT_PRICE_FACTOR } from "../../data/parts";
import { formatMoney, t, type MessageKey } from "../../i18n";
import { h, toast } from "../dom";
import type { BenchCtx, StepView } from "./context";
import { SOLDER_BEATS, SolderGame } from "./games/solderGame";
import { drawRadar } from "./radar";

// ---------------- Install switches ----------------
const BEND_SPEED = 1.6; // px per ms — faster drags risk bent pins on hot-swap boards

export function installStep(ctx: BenchCtx): StepView {
  const board = ctx.board()!;
  const total = board.layout.keys.length;
  const bent: number[] = [];
  let last = { x: 0, y: 0, t: 0 };
  const status = h("p", { class: "mg-status", "data-test": "install-status" });
  const refresh = () => {
    const n = board.layout.keys.filter((k) => board.isSwitchInstalled(k.id)).length;
    status.textContent = t("install.count", { n, total });
    return n;
  };
  board.setAllSwitches(false, true);
  board.clearMarkers();
  ctx.scene.setView("top");
  refresh();

  const insert = (key: number, speed: number) => {
    if (board.isSwitchInstalled(key)) return;
    board.setSwitchInstalled(key, true);
    ctx.wake();
    const risky = isHotswap(ctx.session) && speed > BEND_SPEED;
    if (risky && Math.random() < 0.4) {
      bent.push(key);
      play("bench.deadKey", { volume: 0.5 });
      board.setMarker(key, "#e23b4e");
      setTimeout(() => board.setMarker(key, null), 900);
      toast(t("install.bent"), "error");
    } else {
      play("bench.pcbSnap", { volume: 0.55 });
    }
    if (refresh() === total) finish();
  };
  const finish = () => {
    applyInstall(ctx.session, bent);
    ctx.update();
    ctx.complete();
  };
  return {
    el: h("div", { class: "step-body" }, status),
    compact: true,
    onPointer(type, e, key) {
      const now = performance.now();
      const speed = last.t ? Math.hypot(e.clientX - last.x, e.clientY - last.y) / Math.max(1, now - last.t) : 0;
      last = { x: e.clientX, y: e.clientY, t: now };
      if (type === "up") {
        last.t = 0;
        return;
      }
      if ((type === "down" || e.buttons) && key !== null) insert(key, type === "down" ? 0 : speed);
    },
    auto() {
      board.setAllSwitches(true);
      refresh();
      finish();
    },
  };
}

// ---------------- Solder ----------------
export function solderStep(ctx: BenchCtx): StepView {
  const board = ctx.board()!;
  const keys = board.layout.keys;
  const per = Math.ceil(keys.length / SOLDER_BEATS);
  ctx.scene.setView("top");
  board.clearMarkers();
  const status = h("p", { class: "mg-status" });
  let game: SolderGame | null = new SolderGame(
    (beat, ok) => {
      keys.slice(beat * per, (beat + 1) * per).forEach((k) => board.setMarker(k.id, ok ? "#7ed69a" : "#e23b4e"));
      ctx.wake();
    },
    (r) => {
      applySolder(ctx.session, r.quality, r.missed, SOLDER_BEATS);
      setTimeout(() => board.clearMarkers(), 600);
      game?.destroy();
      game = null;
      el.replaceChildren(h("p", { class: "result-line" }, `✓ ${Math.round(r.quality * 100)}%`));
      ctx.update();
      ctx.complete();
    },
    (text) => (status.textContent = text),
  );
  const el = h("div", { class: "step-body" }, status, game.canvas);
  requestAnimationFrame(() => el.closest(".sheet")?.classList.add("sheet-game"));
  // Soldering shows progress on the 3D board too, so the 3D view keeps full frame rate.
  return {
    el,
    compact: true,
    onKey(e) {
      if (e.code === "Space" && e.type === "keydown" && game) {
        e.preventDefault();
        if (!e.repeat) game.key();
      }
    },
    auto() {
      game?.autoComplete();
    },
    dispose: () => game?.destroy(),
  };
}

// ---------------- Key test ----------------
export function testStep(ctx: BenchCtx): StepView {
  const board = ctx.board()!;
  const b = ctx.session;
  const keys = board.layout.keys;
  const ok = new Set<number>();
  const revealed = new Set<number>();
  const fixing = new Set<number>();
  const codeMap = new Map(keys.filter((k) => k.code).map((k) => [k.code, k.id]));
  ctx.scene.setView("top");
  board.clearMarkers();
  const status = h("p", { class: "mg-status", "data-test": "test-status" });
  const faultInfo = h("p", { class: "muted small" });
  const faultOf = (id: number) => unresolvedFaults(b).find((f) => f.key === id);

  const refresh = () => {
    status.textContent = `${t("test.count", { n: ok.size, total: keys.length })}${revealed.size ? " · " + t("test.faults", { n: [...revealed].filter((k) => faultOf(k)).length }) : ""}`;
    faultInfo.textContent = [...revealed].some((k) => faultOf(k)) ? t("test.fixPrompt") : "";
    if (ok.size === keys.length && !b.tested) {
      b.tested = true;
      toast(t("test.allGood"));
      play("progress.reviewGood");
      ctx.update();
      ctx.complete();
    }
  };

  const fix = (id: number) => {
    const f = faultOf(id);
    if (!f || fixing.has(id)) return;
    fixing.add(id);
    play(f.cause === "bentPin" ? "bench.keycapPull" : "bench.solder");
    setTimeout(() => {
      if (f.cause === "bentPin") play("bench.pcbSnap");
      b.fixed.push(id);
      fixing.delete(id);
      revealed.delete(id);
      board.setMarker(id, "#ffd24a");
      toast(t(f.cause === "bentPin" ? "test.fixed.bentPin" : "test.fixed.coldJoint"));
      ctx.update();
      refresh();
    }, 650);
  };

  const press = (id: number, fromSweep = false) => {
    board.pressKey(id);
    if (!fromSweep) ctx.keySound(id, false);
    ctx.wake();
    const f = faultOf(id);
    if (f) {
      if (revealed.has(id) && !fromSweep) return fix(id);
      revealed.add(id);
      board.setMarker(id, f.kind === "dead" ? "#e23b4e" : "#ff9f1c");
      if (f.kind === "chatter" && !fromSweep) toast(t("test.chatter"), "error");
      if (!fromSweep) play("bench.deadKey", { volume: 0.5 });
    } else {
      if (!ok.has(id)) play("bench.testerBeep", { volume: 0.5 });
      ok.add(id);
      board.setMarker(id, "#3ecf6e");
    }
    refresh();
  };

  let sweeping = false;
  const sweep = () => {
    if (sweeping) return;
    sweeping = true;
    const order = [...keys].sort((a, c) => a.y - c.y || a.x - c.x);
    order.forEach((k, i) =>
      setTimeout(() => {
        press(k.id, true);
        if (i % 4 === 0) ctx.keySound(k.id, false);
        if (i === order.length - 1) sweeping = false;
      }, i * 22),
    );
  };
  refresh();

  return {
    el: h(
      "div",
      { class: "step-body" },
      h("div", { class: "row left" }, status, h("button", { class: "btn btn-small", "data-test": "test-sweep", onclick: sweep }, t("test.sweep"))),
      faultInfo,
    ),
    compact: true,
    onPointer(type, _e, key) {
      if (type === "down" && key !== null) press(key);
    },
    onKey(e) {
      if (e.type !== "keydown" || e.repeat) return;
      const id = codeMap.get(e.code);
      if (id === undefined) return;
      if (!e.ctrlKey && !e.metaKey && !/^F(5|11|12)$/.test(e.code)) e.preventDefault();
      press(id);
    },
    auto() {
      for (const f of unresolvedFaults(b)) b.fixed.push(f.key);
      keys.forEach((k) => ok.add(k.id));
      refresh();
    },
  };
}

// ---------------- Sound check ----------------
const AUTOTYPE = "the quick brown fox jumps over the lazy dog";

export function soundStep(ctx: BenchCtx): StepView {
  const board = ctx.board()!;
  const b = ctx.session;
  const keys = board.layout.keys;
  const codeMap = new Map(keys.filter((k) => k.code).map((k) => [k.code, k.id]));
  const byLabel = new Map(keys.map((k) => [k.label.toLowerCase(), k.id]));
  const spaceId = keys.find((k) => k.code === "Space")?.id;
  ctx.scene.setView("low");
  board.clearMarkers();
  let presses = 0;
  const radar = h("canvas", { class: "radar big" });
  const matchEl = h("p", { class: "match" });
  const descEl = h("p", { class: "muted small" });
  const tweaks = h("div", { class: "pills" });

  const describe = () => {
    const s = computeProfile(b, ctx.catalog).sound;
    const words: string[] = [];
    words.push(t(s.depth > 0.62 ? "desc.deep" : s.depth < 0.42 ? "desc.high" : "desc.balanced"));
    if (s.brightness > 0.62) words.push(t("desc.bright"));
    if (s.brightness < 0.3) words.push(t("desc.muffled"));
    if (s.hollow > 0.4) words.push(t("desc.hollow"));
    else if (s.hollow < 0.15) words.push(t("desc.dampened"));
    words.push(t(s.scratch > 0.4 ? "desc.scratchy" : "desc.smooth"));
    if (s.rattle > 0.4) words.push(t("desc.rattly"));
    if (s.volume < 0.45) words.push(t("desc.quiet"));
    if (s.volume > 0.78) words.push(t("desc.loud"));
    if (s.click > 0.5) words.push(t("desc.clicky"));
    return words.join(", ");
  };
  const refresh = () => {
    const { sound } = computeProfile(b, ctx.catalog);
    drawRadar(radar, sound, targetRanges(b.job.sound));
    matchEl.textContent = t("sound.match", { pct: Math.round(soundMatch(sound, b.job.sound) * 100) });
    descEl.textContent = t("sound.describe", { words: describe() });
    const f = b.layout ? LAYOUT_PRICE_FACTOR[b.layout] : 1;
    tweaks.replaceChildren(
      ...DAMPENING.filter((d) => isUnlocked(d.requires, ctx.builds)).map((d) =>
        h(
          "button",
          {
            class: `pill${b.damp.includes(d.id) ? " selected" : ""}`,
            "data-test": `tweak-${d.id}`,
            onclick: () => {
              if (b.damp.includes(d.id)) b.damp = b.damp.filter((x) => x !== d.id);
              else {
                b.damp = [...b.damp, d.id];
                if (d.id === "tape" && b.tapeQuality === null) b.tapeQuality = 0.6;
              }
              play("bench.foam");
              ctx.update();
              refresh();
            },
          },
          `${t(`part.damp.${d.id}` as MessageKey)} · ${formatMoney(Math.round((d.price * f) / 100) * 100)}`,
        ),
      ),
    );
  };
  const hit = (id: number) => {
    ctx.keySound(id, true);
    presses++;
    if (presses >= 6 && !b.soundChecked) {
      b.soundChecked = true;
      ctx.update();
      ctx.complete();
    }
  };
  let typing = false;
  const autoType = () => {
    if (typing) return;
    typing = true;
    let time = 0;
    for (const ch of AUTOTYPE) {
      const id = ch === " " ? spaceId : byLabel.get(ch);
      time += 70 + Math.random() * 90;
      if (id !== undefined) setTimeout(() => hit(id), time);
    }
    setTimeout(() => (typing = false), time + 100);
  };
  requestAnimationFrame(refresh);
  return {
    el: h(
      "div",
      { class: "step-body sound-body" },
      h("div", { class: "sound-left" }, radar, h("p", { class: "legend" }, h("span", { class: "lg-target" }, t("sound.legendTarget")), h("span", { class: "lg-build" }, t("sound.legendBuild")))),
      h(
        "div",
        { class: "sound-right" },
        matchEl,
        descEl,
        h("div", { class: "row left" }, h("button", { class: "btn btn-primary btn-small", "data-test": "autotype", onclick: autoType }, t("sound.autotype"))),
        h("h4", {}, t("sound.tweak")),
        tweaks,
      ),
    ),
    onPointer(type, _e, key) {
      if (type === "down" && key !== null) hit(key);
    },
    onKey(e) {
      if (e.type !== "keydown" || e.repeat) return;
      const id = codeMap.get(e.code);
      if (id === undefined) return;
      if (!e.ctrlKey && !e.metaKey && !/^F(5|11|12)$/.test(e.code)) e.preventDefault();
      hit(id);
    },
    auto() {
      b.soundChecked = true;
      ctx.update();
    },
  };
}

