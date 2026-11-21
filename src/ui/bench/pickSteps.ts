/** Step views where the player picks parts (with embedded minigames where they belong). */
import { play } from "../../audio/engine";
import { stabCount } from "../../build/profile";
import { LAYOUT_IDS, getLayout } from "../../data/layouts";
import {
  CASE_MATERIALS,
  DAMPENING,
  HOUSING_SOUND,
  KEYCAP_MATERIAL_SOUND,
  KEYCAP_PROFILE_SOUND,
  LAYOUT_PRICE_FACTOR,
  PCBS,
  PLATES,
  STABS,
  STAB_MODS,
  SWITCH_TYPE_SOUND,
  isUnlocked,
  type SoundMods,
} from "../../data/parts";
import { formatMoney, t, tx, type MessageKey } from "../../i18n";
import { h, nodes } from "../dom";
import type { BenchCtx, StepView } from "./context";
import { LubeGame } from "./games/lubeGame";
import { ScrewGame } from "./games/screwGame";
import { TapeGame } from "./games/tapeGame";
import { WireGame } from "./games/wireGame";
import { syncBoard, tapeStrips } from "./sync";
import { effectTags, partCard, pill, section } from "./widgets";

const lockedAt = (req: { builds?: number } | undefined, builds: number) => (isUnlocked(req, builds) ? null : (req?.builds ?? null));
const scaled = (ctx: BenchCtx, cents: number) => Math.round((cents * (ctx.session.layout ? LAYOUT_PRICE_FACTOR[ctx.session.layout] : 1)) / 100) * 100;

function mergeMods(...ms: (SoundMods | undefined)[]): SoundMods {
  const out: SoundMods = {};
  for (const m of ms) for (const [k, v] of Object.entries(m ?? {})) out[k as keyof SoundMods] = (out[k as keyof SoundMods] ?? 0) + (v as number);
  return out;
}

/** The bench scene, so re-renders can tell it when a 2D minigame is on screen. */
let activeScene: BenchCtx["scene"] | null = null;
export function setActiveScene(s: BenchCtx["scene"] | null) {
  activeScene = s;
}

/** Re-render helper: step views rebuild their content in place when a choice changes. */
function rerenderable(build: (root: HTMLElement) => void): HTMLElement {
  const root = h("div", { class: "step-body" });
  const render = () => {
    const scroll = root.parentElement?.scrollTop ?? 0;
    root.replaceChildren();
    build(root);
    if (root.parentElement) root.parentElement.scrollTop = scroll;
    // A minigame just appeared: make sure it's fully visible inside the sheet.
    requestAnimationFrame(() => {
      const canvas = root.querySelector("canvas");
      root.closest(".sheet")?.classList.toggle("sheet-game", !!canvas);
      activeScene && (activeScene.minigame2D = !!canvas);
      canvas?.scrollIntoView({ block: "nearest" });
    });
  };
  (root as HTMLElement & { rerender?: () => void }).rerender = render;
  render();
  return root;
}
const rerender = (el: HTMLElement) => (el as HTMLElement & { rerender?: () => void }).rerender?.();

// ---------------- Case ----------------
export function caseStep(ctx: BenchCtx): StepView {
  const el = rerenderable((root) => {
    const b = ctx.session;
    const layoutPills = LAYOUT_IDS.map((id) =>
      pill(t(`layout.name.${id}` as MessageKey), b.layout === id, () => {
        if (b.layout === id) return;
        b.layout = id;
        const board = ctx.scene.setBoard(id);
        if (board) syncBoard(board, b, ctx.catalog);
        play("shop.boxDrop");
        ctx.update();
        rerender(el);
      }, `layout-${id}`),
    );
    const mats = CASE_MATERIALS.map((m) =>
      partCard({
        title: t(`part.case.${m.id}` as MessageKey),
        sub: t("bench.mount", { mount: t(`part.mount.${m.mount}` as MessageKey) }),
        price: scaled(ctx, m.price),
        tags: effectTags(m.sound),
        selected: b.caseMaterial === m.id,
        lockedAt: lockedAt(m.requires, ctx.builds),
        testId: `case-${m.id}`,
        onClick: () => {
          b.caseMaterial = m.id;
          if (!m.colors.some((c) => c.id === b.caseColor)) b.caseColor = m.colors[0].id;
          ctx.board()?.setCase(m, m.colors.find((c) => c.id === b.caseColor)!.hex);
          play("shop.boxDrop");
          ctx.update();
          rerender(el);
        },
      }),
    );
    const mat = CASE_MATERIALS.find((m) => m.id === b.caseMaterial);
    const colors = mat
      ? mat.colors.map((c) =>
          h(
            "button",
            {
              class: `swatch-btn${b.caseColor === c.id ? " selected" : ""}`,
              "data-test": `color-${c.id}`,
              onclick: () => {
                b.caseColor = c.id;
                ctx.board()?.setCase(mat, c.hex);
                play("ui.toggle");
                ctx.update();
                rerender(el);
              },
            },
            h("span", { class: "sw big", style: `background:${c.hex}` }),
            t(`part.color.${c.id}` as MessageKey),
          ),
        )
      : [];
    root.append(...nodes(
      h("div", { class: "psection" }, h("h4", {}, t("bench.layout")), h("div", { class: "pills" }, ...layoutPills)),
      b.layout ? h("p", { class: "muted small" }, t(`layout.desc.${b.layout}` as MessageKey)) : null,
      section("bench.material", ...mats),
      mat ? h("div", { class: "psection" }, h("h4", {}, t("bench.color")), h("div", { class: "pills" }, ...colors)) : null,
    ));
  });
  return {
    el,
    auto() {
      const b = ctx.session;
      const want = b.job.layout.kind === "exact" ? b.job.layout.id : b.job.layout.kind === "numpad" ? "full" : b.job.layout.kind === "frow" ? "75" : "65";
      b.layout = want;
      const board = ctx.scene.setBoard(want);
      b.caseMaterial = "aluminum";
      b.caseColor = "silver";
      if (board) syncBoard(board, b, ctx.catalog);
      ctx.update();
    },
  };
}

// ---------------- PCB ----------------
export function pcbStep(ctx: BenchCtx): StepView {
  const el = rerenderable((root) => {
    const b = ctx.session;
    root.append(
      section(
        null,
        ...PCBS.map((p) =>
          partCard({
            title: t(`part.pcb.${p.id}` as MessageKey),
            sub: t(`part.pcbDesc.${p.id}` as MessageKey),
            price: scaled(ctx, p.price),
            tags: effectTags(p.sound),
            selected: b.pcb === p.id,
            lockedAt: lockedAt(p.requires, ctx.builds),
            swatch: [p.color],
            testId: `pcb-${p.id}`,
            onClick: () => {
              b.pcb = p.id;
              ctx.board()?.setPcb(p);
              if (b.tapeQuality !== null && b.damp.includes("tape")) ctx.board()?.setTape(tapeStrips(b.tapeQuality, Math.ceil(getLayout(b.layout!).depth)));
              play("bench.pcbSnap");
              ctx.update();
              rerender(el);
            },
          }),
        ),
      ),
    );
  });
  return {
    el,
    auto() {
      ctx.session.pcb = "hotswap";
      ctx.board()?.setPcb(PCBS[0]);
      ctx.update();
    },
  };
}

// ---------------- Dampening (+ tape minigame) ----------------
export function dampStep(ctx: BenchCtx): StepView {
  let game: TapeGame | null = null;
  const el = rerenderable((root) => {
    const b = ctx.session;
    if (game) {
      root.append(h("p", { class: "muted small" }, t("tape.hint")), h("p", { class: "mg-status" }), game.canvas);
      return;
    }
    const cards = DAMPENING.map((d) =>
      partCard({
        title: t(`part.damp.${d.id}` as MessageKey),
        sub: t(`part.dampDesc.${d.id}` as MessageKey),
        price: scaled(ctx, d.price),
        tags: effectTags(d.sound),
        selected: b.damp.includes(d.id),
        lockedAt: lockedAt(d.requires, ctx.builds),
        testId: `damp-${d.id}`,
        onClick: () => {
          if (b.damp.includes(d.id)) {
            b.damp = b.damp.filter((x) => x !== d.id);
            if (d.id === "tape") {
              b.tapeQuality = null;
              ctx.board()?.setTape([]);
            }
            play("ui.toggle");
          } else {
            b.damp = [...b.damp, d.id];
            play(d.id === "tape" ? "bench.tape" : "bench.foam");
          }
          ctx.board()?.setDampening(b.damp);
          ctx.update();
          rerender(el);
        },
      }),
    );
    const needsTape = b.damp.includes("tape") && b.tapeQuality === null;
    root.append(...nodes(
      section(null, ...cards),
      needsTape ? h("div", { class: "row" }, h("button", { class: "btn btn-primary", "data-test": "tape-start", onclick: startTape }, t("tape.start"))) : null,
    ));
  });

  function startTape() {
    const board = ctx.board();
    const lanes = Math.ceil(getLayout(ctx.session.layout!).depth);
    board?.flipPcb(true);
    ctx.scene.setView("top");
    ctx.wake();
    play("ui.open");
    game = new TapeGame(
      lanes,
      (q) => finishTape(q),
      (text) => {
        const s = el.querySelector(".mg-status");
        if (s) s.textContent = text;
      },
    );
    rerender(el);
  }
  function finishTape(q: number) {
    const b = ctx.session;
    b.tapeQuality = q;
    const board = ctx.board();
    board?.setTape(tapeStrips(q, Math.ceil(getLayout(b.layout!).depth)));
    board?.flipPcb(false);
    ctx.scene.setView("overview");
    ctx.wake();
    game?.destroy();
    game = null;
    ctx.update();
    ctx.complete();
    rerender(el);
  }
  return {
    el,
    compact: false,
    auto() {
      if (game) game.autoComplete();
      else if (ctx.session.damp.includes("tape") && ctx.session.tapeQuality === null) finishTape(1);
      else {
        ctx.session.damp = ["caseFoam", "plateFoam"];
        ctx.board()?.setDampening(ctx.session.damp);
        ctx.update();
      }
    },
    dispose: () => game?.destroy(),
  };
}

// ---------------- Plate ----------------
export function plateStep(ctx: BenchCtx): StepView {
  const el = rerenderable((root) => {
    const b = ctx.session;
    root.append(
      section(
        null,
        ...PLATES.map((p) =>
          partCard({
            title: t(`part.plate.${p.id}` as MessageKey),
            price: scaled(ctx, p.price),
            tags: effectTags(p.sound),
            selected: b.plate === p.id,
            lockedAt: lockedAt(p.requires, ctx.builds),
            swatch: p.id === "none" ? undefined : [p.color],
            testId: `plate-${p.id}`,
            onClick: () => {
              b.plate = p.id;
              ctx.board()?.setPlate(p);
              play(p.id === "none" ? "ui.toggle" : "bench.pcbSnap");
              ctx.update();
              rerender(el);
            },
          }),
        ),
      ),
    );
  });
  return {
    el,
    auto() {
      ctx.session.plate = "aluminum";
      ctx.board()?.setPlate(PLATES[0]);
      ctx.update();
    },
  };
}

// ---------------- Stabilizers (+ wire lube minigame) ----------------
export function stabStep(ctx: BenchCtx): StepView {
  let game: WireGame | null = null;
  const el = rerenderable((root) => {
    const b = ctx.session;
    if (game) {
      root.append(h("p", { class: "muted small" }, t("stab.lubeHint")), h("p", { class: "mg-status" }), game.canvas);
      return;
    }
    const tiers = STABS.map((s) =>
      partCard({
        title: t(`part.stabs.${s.id}` as MessageKey),
        price: s.price,
        selected: b.stabs === s.id,
        lockedAt: lockedAt(s.requires, ctx.builds),
        testId: `stabs-${s.id}`,
        onClick: () => {
          b.stabs = s.id;
          ctx.board()?.setStabs(s, (b.stabLube ?? 0) > 0.3);
          play("bench.keycapPlace");
          ctx.update();
          rerender(el);
        },
      }),
    );
    const mods = STAB_MODS.map((m) =>
      partCard({
        title: t(`part.stabMod.${m}` as MessageKey),
        sub: t(`part.stabModDesc.${m}` as MessageKey),
        price: m === "bandaid" ? 1_00 : 0,
        selected: b.stabMods.includes(m),
        testId: `stabmod-${m}`,
        onClick: () => {
          b.stabMods = b.stabMods.includes(m) ? b.stabMods.filter((x) => x !== m) : [...b.stabMods, m];
          play(m === "clip" ? "bench.switchOpen" : "bench.tape");
          ctx.update();
          rerender(el);
        },
      }),
    );
    root.append(...nodes(
      section(null, ...tiers),
      section(null, ...mods),
      b.stabs
        ? h(
            "div",
            { class: "row" },
            b.stabLube !== null ? h("span", { class: "chip-inline" }, t("stab.lubed", { pct: Math.round(b.stabLube * 100) })) : null,
            h("button", { class: "btn btn-primary", "data-test": "stab-lube", onclick: startLube }, t("stab.lube")),
            b.stabLube === null ? h("button", { class: "btn", "data-test": "stab-skip", onclick: () => finish(0) }, t("lube.skip")) : null,
          )
        : null,
    ));
  });
  function startLube() {
    const wires = Math.min(4, stabCount(ctx.session.layout!));
    play("ui.open");
    game = new WireGame(wires, finish, (text) => {
      const s = el.querySelector(".mg-status");
      if (s) s.textContent = text;
    });
    rerender(el);
  }
  function finish(cov: number) {
    const b = ctx.session;
    b.stabLube = cov;
    ctx.board()?.setStabs(STABS.find((s) => s.id === b.stabs) ?? null, cov > 0.3);
    game?.destroy();
    game = null;
    ctx.update();
    ctx.complete();
    rerender(el);
  }
  return {
    el,
    auto() {
      if (!ctx.session.stabs) {
        ctx.session.stabs = "standard";
        ctx.session.stabMods = ["clip", "bandaid"];
      }
      if (game) game.autoComplete();
      else finish(1);
    },
    dispose: () => game?.destroy(),
  };
}

// ---------------- Switches ----------------
export function switchStep(ctx: BenchCtx): StepView {
  const el = rerenderable((root) => {
    const b = ctx.session;
    const count = b.layout ? getLayout(b.layout).keys.length : 0;
    root.append(...nodes(
      section(
        null,
        ...ctx.catalog.switches.map((sw) =>
          partCard({
            title: `${sw.brand} ${sw.name}`,
            sub: [
              t("part.switch.spec", { type: t(`part.switchType.${sw.type}` as MessageKey), weight: sw.springG, housing: t(`part.housing.${sw.housing}` as MessageKey) }),
              sw.factoryLubed ? t("part.switch.lubed") : null,
              sw.longPole ? t("part.switch.longPole") : null,
            ]
              .filter(Boolean)
              .join(" · "),
            priceText: t("bench.perSwitch", { price: formatMoney(sw.pricePerSwitch), count }),
            tags: effectTags(mergeMods(SWITCH_TYPE_SOUND[sw.type], HOUSING_SOUND[sw.housing], sw.longPole ? { brightness: 0.15, depth: -0.08 } : undefined)),
            selected: b.switchId === sw.id,
            lockedAt: lockedAt(sw.requires, ctx.builds),
            swatch: [sw.housingColor, sw.stemColor],
            testId: `switch-${sw.id}`,
            onClick: () => {
              if (b.switchId !== sw.id) b.lube = null; // new switches need lubing again
              b.switchId = sw.id;
              ctx.board()?.setSwitchLook(sw);
              ctx.update();
              // Preview: how a key would sound with this switch in this build so far.
              const keys = getLayout(b.layout!).keys;
              for (let i = 0; i < 3; i++) setTimeout(() => ctx.keySound(keys[Math.floor(Math.random() * keys.length)].id, false), i * 130);
              rerender(el);
            },
          }),
        ),
      ),
    ));
  });
  return {
    el,
    auto() {
      ctx.session.switchId = ctx.catalog.switches[0].id;
      ctx.board()?.setSwitchLook(ctx.catalog.switches[0]);
      ctx.update();
    },
  };
}

// ---------------- Lube (minigame) ----------------
export function lubeStep(ctx: BenchCtx): StepView {
  const sw = ctx.catalog.switches.find((s) => s.id === ctx.session.switchId)!;
  let game: LubeGame | null = null;
  const el = rerenderable((root) => {
    const b = ctx.session;
    if (b.lube) {
      root.append(
        h("p", { class: "result-line" }, b.lube.skipped ? t("lube.skip") : t("lube.result", { pct: Math.round(b.lube.quality * 100) })),
        h("div", { class: "row" }, h("button", { class: "btn", "data-test": "lube-redo", onclick: () => ((b.lube = null), ctx.update(), start()) }, "↺")),
      );
      return;
    }
    if (!game) start(false);
    root.append(game!.canvas, h("div", { class: "row" }, h("button", { class: "btn", "data-test": "lube-skip", onclick: skip }, t("lube.skip"))));
  });
  function start(render = true) {
    game?.destroy();
    game = new LubeGame(sw, done, () => ctx.update());
    if (render) rerender(el);
  }
  function done(r: { quality: number; over: number }) {
    ctx.session.lube = { quality: r.quality, over: r.over, skipped: false };
    game?.destroy();
    game = null;
    ctx.update();
    ctx.complete();
    rerender(el);
  }
  function skip() {
    ctx.session.lube = { quality: 0, over: 0, skipped: true };
    game?.destroy();
    game = null;
    ctx.update();
    ctx.complete();
    rerender(el);
  }
  return {
    el,
    onKey(e) {
      if (e.code === "Space" && game) {
        e.preventDefault();
        game.key(e.type === "keydown");
      }
    },
    auto() {
      if (game) game.autoComplete();
      else if (!ctx.session.lube) done({ quality: 1, over: 0 });
    },
    dispose: () => game?.destroy(),
  };
}

// ---------------- Screws (minigame) ----------------
export function screwStep(ctx: BenchCtx): StepView {
  let game: ScrewGame | null = null;
  const status = h("p", { class: "mg-status" });
  const el = rerenderable((root) => {
    const b = ctx.session;
    if (b.screws) {
      root.append(h("p", { class: "result-line" }, `✓ ${Math.round(b.screws.quality * 100)}%`));
      return;
    }
    const mat = CASE_MATERIALS.find((m) => m.id === b.caseMaterial);
    const color = mat?.colors.find((c) => c.id === b.caseColor)?.hex ?? "#ccc";
    if (!game) {
      const count = b.layout === "tkl" || b.layout === "full" ? 8 : 6;
      game = new ScrewGame(count, color, done, (text) => (status.textContent = text));
    }
    root.append(status, game.canvas);
  });
  function done(r: { quality: number; loose: number; stripped: number }) {
    ctx.session.screws = r;
    game?.destroy();
    game = null;
    ctx.update();
    ctx.complete();
    rerender(el);
  }
  return {
    el,
    auto() {
      if (game) game.autoComplete();
    },
    dispose: () => game?.destroy(),
  };
}

// ---------------- Keycaps ----------------
export function keycapStep(ctx: BenchCtx): StepView {
  let cascade = 0;
  const install = (id: string) => {
    const set = ctx.catalog.keycaps.find((k) => k.id === id)!;
    const board = ctx.board();
    if (!board) return;
    board.setKeycaps(set);
    board.setAllCaps(false, true);
    const keys = [...board.layout.keys].sort((a, c) => a.x + a.y * 0.3 - (c.x + c.y * 0.3));
    const my = ++cascade;
    keys.forEach((k, i) =>
      setTimeout(() => {
        if (my !== cascade) return;
        board.setCapInstalled(k.id, true);
        if (i % 6 === 0) play("bench.keycapPlace", { volume: 0.6 });
        ctx.wake();
      }, 200 + i * 12),
    );
  };
  const el = rerenderable((root) => {
    const b = ctx.session;
    root.append(
      section(
        null,
        ...ctx.catalog.keycaps.map((k) =>
          partCard({
            title: `${k.brand} “${k.name}”`,
            sub: `${t(`part.keycap.material.${k.material}` as MessageKey)} · ${t(`part.keycap.profile.${k.profile}` as MessageKey)} · ${tx(`color.family.${k.colorway.family}`)}`,
            price: scaled(ctx, k.price),
            tags: effectTags(mergeMods(KEYCAP_MATERIAL_SOUND[k.material], KEYCAP_PROFILE_SOUND[k.profile])),
            selected: b.keycapsId === k.id,
            lockedAt: lockedAt(k.requires, ctx.builds),
            swatch: [k.colorway.alpha, k.colorway.mod, k.colorway.accent],
            testId: `keycaps-${k.id}`,
            onClick: () => {
              b.keycapsId = k.id;
              install(k.id);
              ctx.update();
              ctx.complete();
              rerender(el);
            },
          }),
        ),
      ),
    );
  });
  return {
    el,
    auto() {
      const id = ctx.catalog.keycaps[0].id;
      ctx.session.keycapsId = id;
      install(id);
      ctx.update();
    },
  };
}
