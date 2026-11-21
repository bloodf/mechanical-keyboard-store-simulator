/** All build steps as StepViews: parts drawer tiles + the 3D minigames where they belong. */
import type { Control } from "@babylonjs/gui";
import { play } from "../../audio/engine";
import { computeProfile, findSwitch, soundMatch, stabCount, targetRanges } from "../../build/profile";
import { applyInstall, applySolder, isHotswap, unresolvedFaults } from "../../build/session";
import { Rng } from "../../core/rng";
import { CUSTOM_COLOR_MATERIALS, CUSTOM_KEYCAPS_ID, CUSTOM_KEYCAPS_PRICE, randomCaseColor } from "../../data/catalog";
import { randomColorway } from "../../data/colorway";
import { classifyColor, toneOf } from "../../data/color";
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
import { allKeys, formatMoney, t, tx, type MessageKey } from "../../i18n";
import { C, S, T } from "../../gui/theme";
import { button, drawBox, group, H_RIGHT, label, stack, V_BOTTOM } from "../../gui/widgets";
import { tileRow, type Pager } from "./drawer";
import { caseIcon, diceIcon, foamIcon, keycapsIcon, layoutIcon, modIcon, pcbIcon, plateIcon, stabIcon, switchIcon } from "./icons";
import { radarPainter } from "./radar";
import { syncBoard } from "./sync";
import type { DrawerArea, StepCtx, StepView, TileSpec } from "./types";
import { LubeGame } from "./games/lube";
import { ScrewGame } from "./games/screws";
import { SOLDER_BEATS, SolderGame } from "./games/solder";
import { TapeGame } from "./games/tape";
import { WireGame } from "./games/wire";
import { burst, puffs } from "./games/common";

const KNOWN = new Set<string>(allKeys());
const lockedAt = (req: { builds?: number } | undefined, builds: number) => (isUnlocked(req, builds) ? null : (req?.builds ?? null));
const scaled = (ctx: StepCtx, cents: number) => Math.round((cents * (ctx.session.layout ? LAYOUT_PRICE_FACTOR[ctx.session.layout] : 1)) / 100) * 100;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function colorName(c: { id: string; hex: string }): string {
  if (KNOWN.has(`part.color.${c.id}`)) return t(`part.color.${c.id}` as MessageKey);
  return cap(tx("color.named", { tone: `@color.tone.${toneOf(c.hex)}`, hue: `@color.hue.${classifyColor(c.hex)}` }).trim());
}

function merge(...ms: (SoundMods | undefined)[]): SoundMods {
  const out: SoundMods = {};
  for (const m of ms) for (const [k, v] of Object.entries(m ?? {})) out[k as keyof SoundMods] = (out[k as keyof SoundMods] ?? 0) + (v as number);
  return out;
}

/** Sub-tab row + tiles (for steps with several choice groups). */
function tabbed(area: DrawerArea, tabs: { id: string; label: string }[], current: string, onTab: (id: string) => void, body: (a: DrawerArea) => Control): Control {
  const root = group({ w: area.w, h: area.h });
  const row = stack({ horizontal: true, h: 36, spacing: S.xs });
  for (const tb of tabs) row.addControl(button(tb.label, { w: Math.min(150, (area.w - 20) / tabs.length), h: 36, size: "sm", variant: tb.id === current ? "dark" : "secondary", testId: `subtab-${tb.id}`, onClick: () => onTab(tb.id) }));
  root.addControl(row);
  const inner = group({ w: area.w, h: area.h - 44, y: 44 });
  inner.addControl(body({ ...area, h: area.h - 44 }));
  root.addControl(inner);
  return root;
}

// ---------------- Case ----------------
export function caseStep(ctx: StepCtx): StepView {
  const b = () => ctx.session;
  let tab: "layout" | "material" | "color" = b().layout ? (b().caseMaterial ? "color" : "material") : "layout";
  const pagers: Record<string, Pager> = { layout: { page: 0 }, material: { page: 0 }, color: { page: 0 } };
  return {
    render(area) {
      const s = b();
      return tabbed(
        area,
        [
          { id: "layout", label: t("bench.tab.layout") },
          { id: "material", label: t("bench.tab.material") },
          { id: "color", label: t("bench.tab.color") },
        ],
        tab,
        (id) => ((tab = id as typeof tab), ctx.rerender()),
        (a) => {
          if (tab === "layout") {
            return tileRow(
              LAYOUT_IDS.map((id) => ({
                id,
                title: t(`layout.name.${id}` as MessageKey),
                sub: t(`layout.desc.${id}` as MessageKey),
                icon: layoutIcon(id),
                selected: s.layout === id,
                onClick: () => {
                  if (s.layout !== id) {
                    s.layout = id;
                    ctx.setLayoutBoard();
                    play("shop.boxDrop");
                  }
                  tab = "material";
                  ctx.update();
                  ctx.rerender();
                },
              })),
              a,
              pagers.layout,
              ctx.rerender,
              { testPrefix: "layout" },
            );
          }
          if (tab === "material") {
            return tileRow(
              CASE_MATERIALS.map((m) => ({
                id: m.id,
                title: t(`part.case.${m.id}` as MessageKey),
                sub: t("bench.mount", { mount: t(`part.mount.${m.mount}` as MessageKey) }),
                price: scaled(ctx, m.price),
                effects: m.sound,
                icon: caseIcon(ctx.catalog.caseColors[m.id][0].hex, m.id),
                selected: s.caseMaterial === m.id,
                lockedAt: lockedAt(m.requires, ctx.builds),
                onClick: () => {
                  if (!s.layout) {
                    tab = "layout";
                    ctx.rerender();
                    return;
                  }
                  s.caseMaterial = m.id;
                  const colors = ctx.catalog.caseColors[m.id];
                  if (!s.caseColor || !colors.some((c) => c.id === s.caseColor!.id)) s.caseColor = { id: colors[0].id, hex: colors[0].hex };
                  ctx.board()?.setCase(m, s.caseColor.hex);
                  play("shop.boxDrop");
                  tab = "color";
                  ctx.update();
                  ctx.rerender();
                },
              })),
              a,
              pagers.material,
              ctx.rerender,
              { testPrefix: "case" },
            );
          }
          const m = CASE_MATERIALS.find((x) => x.id === s.caseMaterial);
          if (!m) return label(t("step.case.hint"), { size: T.body, color: C.inkSoft });
          const tiles: TileSpec[] = ctx.catalog.caseColors[m.id].map((c) => ({
            id: c.id,
            title: colorName(c),
            icon: caseIcon(c.hex, m.id),
            selected: s.caseColor?.id === c.id,
            priceText: " ",
            onClick: () => {
              s.caseColor = { id: c.id, hex: c.hex };
              ctx.board()?.setCase(m, c.hex, false);
              play("ui.toggle");
              ctx.update();
              ctx.rerender();
            },
          }));
          if (CUSTOM_COLOR_MATERIALS.includes(m.id)) {
            const custom = s.caseColor?.id === "custom" ? s.caseColor : null;
            tiles.unshift({
              id: "custom",
              title: custom ? colorName(custom) : t("color.custom"),
              sub: t("color.roll"),
              icon: custom ? caseIcon(custom.hex, m.id) : diceIcon,
              selected: !!custom,
              priceText: t("bench.free"),
              badge: "🎲",
              onClick: () => {
                const hex = randomCaseColor(m.id, Math.random);
                s.caseColor = { id: "custom", hex };
                ctx.board()?.setCase(m, hex, false);
                play("ui.confirm");
                ctx.update();
                ctx.rerender();
              },
            });
          }
          return tileRow(tiles, a, pagers.color, ctx.rerender, { testPrefix: "color", tileW: area.portrait ? 110 : 132 });
        },
      );
    },
    auto() {
      const s = b();
      const want = s.job.layout.kind === "exact" ? s.job.layout.id : s.job.layout.kind === "numpad" ? "full" : s.job.layout.kind === "frow" ? "75" : "65";
      s.layout = want;
      s.caseMaterial = "aluminum";
      const c = ctx.catalog.caseColors.aluminum[0];
      s.caseColor = { id: c.id, hex: c.hex };
      const board = ctx.setLayoutBoard();
      if (board) syncBoard(board, s, ctx.catalog);
      ctx.update();
    },
  };
}

// ---------------- Simple pickers ----------------
function simplePicker(ctx: StepCtx, tiles: () => TileSpec[], prefix: string, auto: () => void): StepView {
  const pager: Pager = { page: 0 };
  return { render: (a) => tileRow(tiles(), a, pager, ctx.rerender, { testPrefix: prefix }), auto };
}

export function pcbStep(ctx: StepCtx): StepView {
  return simplePicker(
    ctx,
    () =>
      PCBS.map((p) => ({
        id: p.id,
        title: t(`part.pcb.${p.id}` as MessageKey),
        sub: t(`part.pcbDesc.${p.id}` as MessageKey),
        price: scaled(ctx, p.price),
        effects: p.sound,
        icon: pcbIcon(p.color, p.rgb, p.flex),
        selected: ctx.session.pcb === p.id,
        lockedAt: lockedAt(p.requires, ctx.builds),
        onClick: () => {
          ctx.session.pcb = p.id;
          ctx.board()?.setPcb(p);
          play("bench.pcbSnap");
          ctx.update();
          ctx.rerender();
        },
      })),
    "pcb",
    () => {
      ctx.session.pcb = "hotswap";
      ctx.board()?.setPcb(PCBS[0]);
      ctx.update();
    },
  );
}

export function plateStep(ctx: StepCtx): StepView {
  return simplePicker(
    ctx,
    () =>
      PLATES.map((p) => ({
        id: p.id,
        title: t(`part.plate.${p.id}` as MessageKey),
        price: scaled(ctx, p.price),
        effects: p.sound,
        icon: plateIcon(p.color, p.id === "none"),
        selected: ctx.session.plate === p.id,
        lockedAt: lockedAt(p.requires, ctx.builds),
        onClick: () => {
          ctx.session.plate = p.id;
          ctx.board()?.setPlate(p);
          play(p.id === "none" ? "ui.toggle" : "bench.pcbSnap");
          ctx.update();
          ctx.rerender();
        },
      })),
    "plate",
    () => {
      ctx.session.plate = "aluminum";
      ctx.board()?.setPlate(PLATES[0]);
      ctx.update();
    },
  );
}

// ---------------- Dampening (+ 3D tape minigame) ----------------
export function dampStep(ctx: StepCtx): StepView {
  const pager: Pager = { page: 0 };
  let game: TapeGame | null = null;
  const finish = (q: number) => {
    ctx.session.tapeQuality = q;
    game?.dispose();
    game = null;
    ctx.update();
    ctx.complete();
    ctx.rerender();
  };
  const view: StepView = {
    get compact() {
      return !!game;
    },
    render(a) {
      if (game) return game.render(a);
      const s = ctx.session;
      const body = group({ w: a.w, h: a.h });
      const needsTape = s.damp.includes("tape") && s.tapeQuality === null;
      const tilesArea = { ...a, h: needsTape ? a.h - 56 : a.h };
      body.addControl(
        tileRow(
          DAMPENING.map((d) => ({
            id: d.id,
            title: t(`part.damp.${d.id}` as MessageKey),
            sub: t(`part.dampDesc.${d.id}` as MessageKey),
            price: scaled(ctx, d.price),
            effects: d.sound,
            icon: foamIcon(d.id === "caseFoam" ? "#3d4148" : d.id === "plateFoam" ? "#d8d1bd" : d.id === "silicone" ? "#dfe8ee" : "#fafafa", d.id),
            selected: s.damp.includes(d.id),
            lockedAt: lockedAt(d.requires, ctx.builds),
            onClick: () => {
              if (s.damp.includes(d.id)) {
                s.damp = s.damp.filter((x) => x !== d.id);
                if (d.id === "tape") {
                  s.tapeQuality = null;
                  ctx.board()?.setTape([]);
                }
                play("ui.toggle");
              } else {
                s.damp = [...s.damp, d.id];
                play(d.id === "tape" ? "bench.tape" : "bench.foam");
              }
              ctx.board()?.setDampening(s.damp);
              ctx.update();
              ctx.rerender();
            },
          })),
          tilesArea,
          pager,
          ctx.rerender,
          { testPrefix: "damp" },
        ),
      );
      if (needsTape)
        body.addControl(
          button(`🩹 ${t("bench.applyTape")}`, {
            w: 240,
            variant: "primary",
            ha: H_RIGHT,
            va: V_BOTTOM,
            testId: "tape-start",
            onClick: () => {
              game = new TapeGame(ctx, finish);
              play("ui.open");
              ctx.rerender();
            },
          }),
        );
      return body;
    },
    onPointer: (type, x, y) => game?.onPointer(type, x, y),
    auto() {
      if (game) game.auto();
      else if (ctx.session.damp.includes("tape") && ctx.session.tapeQuality === null) finish(1);
      else {
        ctx.session.damp = ["caseFoam", "plateFoam"];
        ctx.board()?.setDampening(ctx.session.damp);
        ctx.update();
      }
    },
    dispose: () => game?.dispose(),
  };
  return view;
}

// ---------------- Stabilizers (+ 3D wire lube) ----------------
export function stabStep(ctx: StepCtx): StepView {
  let tab: "tiers" | "mods" = "tiers";
  const pagers = { tiers: { page: 0 }, mods: { page: 0 } };
  let game: WireGame | null = null;
  const finish = (cov: number) => {
    ctx.session.stabLube = cov;
    ctx.board()?.setStabs(STABS.find((s) => s.id === ctx.session.stabs) ?? null, cov > 0.3);
    game?.dispose();
    game = null;
    ctx.view("overview");
    ctx.update();
    ctx.complete();
    ctx.rerender();
  };
  return {
    get compact() {
      return !!game;
    },
    render(a) {
      if (game) return game.render(a);
      const s = ctx.session;
      const body = group({ w: a.w, h: a.h });
      const bottomRow = s.stabs ? 56 : 0;
      body.addControl(
        tabbed(
          { ...a, h: a.h - bottomRow },
          [
            { id: "tiers", label: t("bench.tab.tiers") },
            { id: "mods", label: t("bench.tab.mods") },
          ],
          tab,
          (id) => ((tab = id as typeof tab), ctx.rerender()),
          (area) =>
            tab === "tiers"
              ? tileRow(
                  STABS.map((st) => ({
                    id: st.id,
                    title: t(`part.stabs.${st.id}` as MessageKey),
                    price: st.price,
                    icon: stabIcon(st.id === "premium" ? "#f1f1f1" : st.id === "standard" ? "#2a2a2a" : "#8a8a8a"),
                    selected: s.stabs === st.id,
                    lockedAt: lockedAt(st.requires, ctx.builds),
                    onClick: () => {
                      s.stabs = st.id;
                      ctx.board()?.setStabs(st, (s.stabLube ?? 0) > 0.3);
                      play("bench.keycapPlace");
                      tab = "mods";
                      ctx.update();
                      ctx.rerender();
                    },
                  })),
                  area,
                  pagers.tiers,
                  ctx.rerender,
                  { testPrefix: "stabs" },
                )
              : tileRow(
                  STAB_MODS.map((m) => ({
                    id: m,
                    title: t(`part.stabMod.${m}` as MessageKey),
                    sub: t(`part.stabModDesc.${m}` as MessageKey),
                    price: m === "bandaid" ? 1_00 : 0,
                    icon: modIcon(m),
                    selected: s.stabMods.includes(m),
                    onClick: () => {
                      s.stabMods = s.stabMods.includes(m) ? s.stabMods.filter((x) => x !== m) : [...s.stabMods, m];
                      play(m === "clip" ? "bench.switchOpen" : "bench.tape");
                      ctx.update();
                      ctx.rerender();
                    },
                  })),
                  area,
                  pagers.mods,
                  ctx.rerender,
                  { testPrefix: "stabmod" },
                ),
        ),
      );
      if (s.stabs) {
        const row = stack({ horizontal: true, h: 50, spacing: S.md, ha: H_RIGHT, va: V_BOTTOM });
        if (s.stabLube !== null) row.addControl(label(t("stab.lubed", { pct: Math.round(s.stabLube * 100) }), { w: 190, size: T.body, weight: 700, color: C.good }));
        if (s.stabLube === null) row.addControl(button(t("lube.skip"), { w: 160, size: "sm", h: 46, testId: "stab-skip", onClick: () => finish(0) }));
        row.addControl(
          button(`🖌️ ${t("bench.lubeWires")}`, {
            w: 220,
            h: 50,
            variant: "primary",
            testId: "stab-lube",
            onClick: () => {
              game = new WireGame(ctx, Math.min(4, stabCount(s.layout!)), finish);
              play("ui.open");
              ctx.rerender();
            },
          }),
        );
        body.addControl(row);
      }
      return body;
    },
    onPointer: (type, x, y) => game?.onPointer(type, x, y),
    update: (dt) => game?.update(dt),
    auto() {
      if (!ctx.session.stabs) {
        ctx.session.stabs = "standard";
        ctx.session.stabMods = ["clip", "bandaid"];
      }
      if (game) game.auto();
      else finish(1);
    },
    dispose: () => game?.dispose(),
  };
}

// ---------------- Switches ----------------
export function switchStep(ctx: StepCtx): StepView {
  const pager: Pager = { page: 0 };
  return {
    render(a) {
      const s = ctx.session;
      const count = s.layout ? getLayout(s.layout).keys.length : 0;
      return tileRow(
        ctx.catalog.switches.map((sw) => ({
          id: sw.id,
          title: `${sw.brand} ${sw.name}`,
          sub: [t("part.switch.spec", { type: t(`part.switchType.${sw.type}` as MessageKey), weight: sw.springG, housing: t(`part.housing.${sw.housing}` as MessageKey) }), sw.factoryLubed ? t("part.switch.lubed") : null, sw.longPole ? t("part.switch.longPole") : null].filter(Boolean).join(" · "),
          priceText: t("bench.perSwitch", { price: formatMoney(sw.pricePerSwitch), count }),
          effects: merge(SWITCH_TYPE_SOUND[sw.type], HOUSING_SOUND[sw.housing], sw.longPole ? { brightness: 0.15, depth: -0.08 } : undefined),
          icon: switchIcon(sw.housingColor, sw.housingOpacity, sw.stemColor),
          selected: s.switchId === sw.id,
          lockedAt: lockedAt(sw.requires, ctx.builds),
          onClick: () => {
            if (s.switchId !== sw.id) s.lube = null;
            s.switchId = sw.id;
            ctx.board()?.setSwitchLook(sw);
            ctx.update();
            const keys = getLayout(s.layout!).keys;
            for (let i = 0; i < 3; i++) setTimeout(() => ctx.keySound(keys[Math.floor(Math.random() * keys.length)].id, false), i * 130);
            ctx.rerender();
          },
        })),
        a,
        pager,
        ctx.rerender,
        { testPrefix: "switch", tileW: a.portrait ? 140 : 180 },
      );
    },
    auto() {
      ctx.session.switchId = ctx.catalog.switches[0].id;
      ctx.board()?.setSwitchLook(ctx.catalog.switches[0]);
      ctx.update();
    },
  };
}

// ---------------- Lube (3D minigame) ----------------
export function lubeStep(ctx: StepCtx): StepView {
  const sw = findSwitch(ctx.catalog, ctx.session.switchId)!;
  let game: LubeGame | null = ctx.session.lube ? null : new LubeGame(ctx, sw, done);
  function done(r: { quality: number; over: number }) {
    ctx.session.lube = { ...r, skipped: false };
    game?.dispose();
    game = null;
    ctx.view("overview");
    ctx.update();
    ctx.complete();
    ctx.rerender();
  }
  const skip = () => {
    ctx.session.lube = { quality: 0, over: 0, skipped: true };
    game?.dispose();
    game = null;
    ctx.view("overview");
    ctx.update();
    ctx.complete();
    ctx.rerender();
  };
  return {
    compact: true,
    render(a) {
      const s = ctx.session;
      if (!game) {
        const row = stack({ horizontal: true, h: 56, spacing: S.md });
        row.addControl(label(s.lube?.skipped ? t("lube.skip") : t("lube.result", { pct: Math.round((s.lube?.quality ?? 0) * 100) }), { w: 280, size: T.h3, weight: 700 }));
        row.addControl(
          button("↺", {
            w: 60,
            testId: "lube-redo",
            onClick: () => {
              s.lube = null;
              game = new LubeGame(ctx, sw, done);
              ctx.update();
              ctx.rerender();
            },
          }),
        );
        return row;
      }
      const box = group({ w: a.w, h: a.h });
      box.addControl(game.render({ ...a, w: a.portrait ? a.w : a.w - 170 }));
      box.addControl(button(t("lube.skip"), { w: a.portrait ? 120 : 150, h: 40, size: "sm", ha: H_RIGHT, va: a.portrait ? V_BOTTOM : undefined, testId: "lube-skip", onClick: skip }));
      return box;
    },
    onPointer: (type) => game?.onPointer(type),
    onKey: (e) => game?.onKey(e),
    update: () => game?.update(),
    auto() {
      if (game) game.auto();
      else if (!ctx.session.lube) done({ quality: 1, over: 0 });
    },
    dispose: () => game?.dispose(),
  };
}

// ---------------- Install (3D) ----------------
const BEND_SPEED = 1.6; // px/ms

export function installStep(ctx: StepCtx): StepView {
  const board = ctx.board()!;
  const total = board.layout.keys.length;
  const bent: number[] = [];
  let last = { x: 0, y: 0, t: 0 };
  let downNow = false;
  const sparks = puffs(ctx.store.scene, "sparks");
  const status = label("", { size: T.h3, weight: 700, name: "install-status" });
  const refresh = () => {
    const n = board.layout.keys.filter((k) => board.isSwitchInstalled(k.id)).length;
    status.text = t("install.count", { n, total });
    return n;
  };
  board.setAllSwitches(false, true);
  board.clearMarkers();
  ctx.view("top");
  refresh();
  const finish = () => {
    applyInstall(ctx.session, bent);
    ctx.update();
    ctx.complete();
  };
  const insert = (key: number, speed: number) => {
    if (board.isSwitchInstalled(key)) return;
    board.setSwitchInstalled(key, true);
    ctx.wake();
    if (isHotswap(ctx.session) && speed > BEND_SPEED && Math.random() < 0.4) {
      bent.push(key);
      play("bench.deadKey", { volume: 0.5 });
      burst(sparks, board.keyWorld(key), 18);
      board.setMarker(key, "red");
      setTimeout(() => board.setMarker(key, null), 900);
      ctx.ui.toast(t("install.bent"), "error");
    } else play("bench.pcbSnap", { volume: 0.55 });
    if (refresh() === total) finish();
  };
  return {
    compact: true,
    render(a) {
      const col = stack({ w: a.w, spacing: S.xs });
      col.addControl(status);
      return col;
    },
    onPointer(type, x, y) {
      const now = performance.now();
      const speed = last.t ? Math.hypot(x - last.x, y - last.y) / Math.max(1, now - last.t) : 0;
      last = { x, y, t: now };
      if (type === "up") {
        downNow = false;
        last.t = 0;
        return;
      }
      if (type === "down") downNow = true;
      if (!downNow) return;
      const key = board.pickKey(ctx.store.rayAt(x, y));
      if (key !== null) insert(key, type === "down" ? 0 : speed);
    },
    auto() {
      board.setAllSwitches(true);
      refresh();
      finish();
    },
    dispose: () => sparks.dispose(),
  };
}

// ---------------- Solder (3D) ----------------
export function solderStep(ctx: StepCtx): StepView {
  let game: SolderGame | null = new SolderGame(ctx, (r) => {
    applySolder(ctx.session, r.quality, r.missed, SOLDER_BEATS);
    game?.dispose();
    game = null;
    ctx.update();
    ctx.complete();
    ctx.rerender();
  });
  return {
    compact: true,
    render(a) {
      if (!game) return label(`✓ ${Math.round((ctx.session.solderQuality ?? 0) * 100)}%`, { size: T.h2, weight: 700 });
      return game.render(a);
    },
    onPointer: (type) => game?.onPointer(type),
    onKey: (e) => game?.onKey(e),
    update: () => game?.update(),
    auto: () => game?.auto(),
    dispose: () => game?.dispose(),
  };
}

// ---------------- Screws (3D) ----------------
export function screwStep(ctx: StepCtx): StepView {
  let game: ScrewGame | null = ctx.session.screws ? null : new ScrewGame(ctx, (r) => {
    ctx.session.screws = r;
    game?.dispose();
    game = null;
    ctx.update();
    ctx.complete();
    ctx.rerender();
  });
  return {
    compact: true,
    render(a) {
      if (!game) return label(`✓ ${Math.round((ctx.session.screws?.quality ?? 0) * 100)}%`, { size: T.h2, weight: 700 });
      return game.render(a);
    },
    onPointer: (type, x, y) => game?.onPointer(type, x, y),
    update: () => game?.update(),
    auto: () => game?.auto(),
    dispose: () => game?.dispose(),
  };
}

// ---------------- Keycaps ----------------
export function keycapStep(ctx: StepCtx): StepView {
  const pager: Pager = { page: 0 };
  let cascade = 0;
  const install = () => {
    const board = ctx.board();
    const set = ctx.session.keycapsId === CUSTOM_KEYCAPS_ID ? { id: CUSTOM_KEYCAPS_ID, brand: "", name: "", material: "pbt" as const, profile: "cherry" as const, colorway: ctx.session.customColorway!, price: CUSTOM_KEYCAPS_PRICE } : ctx.catalog.keycaps.find((k) => k.id === ctx.session.keycapsId);
    if (!board || !set) return;
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
      }, 150 + i * 12),
    );
  };
  return {
    render(a) {
      const s = ctx.session;
      const tiles: TileSpec[] = ctx.catalog.keycaps.map((k) => ({
        id: k.id,
        title: `${k.brand} “${k.name}”`,
        sub: `${t(`part.keycap.material.${k.material}` as MessageKey)} · ${t(`part.keycap.profile.${k.profile}` as MessageKey)} · ${tx(`color.family.${k.colorway.family}`)}`,
        price: scaled(ctx, k.price),
        effects: merge(KEYCAP_MATERIAL_SOUND[k.material], KEYCAP_PROFILE_SOUND[k.profile]),
        icon: keycapsIcon(k.colorway),
        selected: s.keycapsId === k.id,
        lockedAt: lockedAt(k.requires, ctx.builds),
        onClick: () => {
          s.keycapsId = k.id;
          install();
          ctx.update();
          ctx.complete();
          ctx.rerender();
        },
      }));
      tiles.unshift({
        id: "custom",
        title: t("keycaps.custom"),
        sub: t("keycaps.customSub"),
        price: scaled(ctx, CUSTOM_KEYCAPS_PRICE),
        icon: s.customColorway ? keycapsIcon(s.customColorway) : diceIcon,
        selected: s.keycapsId === CUSTOM_KEYCAPS_ID,
        badge: "🎲",
        onClick: () => {
          s.customColorway = randomColorway(new Rng(String(Math.random())));
          s.keycapsId = CUSTOM_KEYCAPS_ID;
          install();
          play("ui.confirm");
          ctx.update();
          ctx.complete();
          ctx.rerender();
        },
      });
      return tileRow(tiles, a, pager, ctx.rerender, { testPrefix: "keycaps", tileW: a.portrait ? 140 : 176 });
    },
    auto() {
      ctx.session.keycapsId = ctx.catalog.keycaps[0].id;
      install();
      ctx.update();
    },
  };
}

// ---------------- Key test (3D + real keyboard) ----------------
export function testStep(ctx: StepCtx): StepView {
  const board = ctx.board()!;
  const s = ctx.session;
  const keys = board.layout.keys;
  const ok = new Set<number>();
  const revealed = new Set<number>();
  const fixing = new Set<number>();
  const codeMap = new Map(keys.filter((k) => k.code).map((k) => [k.code, k.id]));
  ctx.view("top");
  board.clearMarkers();
  const status = label("", { size: T.h3, weight: 700, name: "test-status" });
  const info = label("", { size: T.body, weight: 600, color: C.bad, h: 24 });
  const faultOf = (id: number) => unresolvedFaults(s).find((f) => f.key === id);
  const refresh = () => {
    const faults = [...revealed].filter((k) => faultOf(k)).length;
    status.text = `${t("test.count", { n: ok.size, total: keys.length })}${faults ? " · " + t("test.faults", { n: faults }) : ""}`;
    info.text = faults ? t("test.fixPrompt") : "";
    if (ok.size === keys.length && !s.tested) {
      s.tested = true;
      ctx.ui.toast(t("test.allGood"), "good");
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
      s.fixed.push(id);
      fixing.delete(id);
      revealed.delete(id);
      board.setMarker(id, "yellow");
      ctx.ui.toast(t(f.cause === "bentPin" ? "test.fixed.bentPin" : "test.fixed.coldJoint"));
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
      board.setMarker(id, f.kind === "dead" ? "red" : "orange");
      if (f.kind === "chatter" && !fromSweep) ctx.ui.toast(t("test.chatter"), "error");
      if (!fromSweep) play("bench.deadKey", { volume: 0.5 });
    } else {
      if (!ok.has(id)) play("bench.testerBeep", { volume: 0.5 });
      ok.add(id);
      board.setMarker(id, "green");
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
    compact: true,
    render(a) {
      const box = group({ w: a.w, h: a.h });
      const col = stack({ w: a.w - 200, spacing: S.xs });
      col.addControl(status);
      col.addControl(info);
      box.addControl(col);
      box.addControl(button(`⚡ ${t("test.sweep")}`, { w: 180, variant: "primary", ha: H_RIGHT, testId: "test-sweep", onClick: sweep }));
      return box;
    },
    onPointer(type, x, y) {
      if (type !== "down") return;
      const key = board.pickKey(ctx.store.rayAt(x, y));
      if (key !== null) press(key);
    },
    onKey(e) {
      if (e.type !== "keydown" || e.repeat) return;
      const id = codeMap.get(e.code);
      if (id === undefined) return;
      if (!e.ctrlKey && !e.metaKey && !/^F(5|11|12)$/.test(e.code)) e.preventDefault();
      press(id);
    },
    auto() {
      for (const f of unresolvedFaults(s)) s.fixed.push(f.key);
      keys.forEach((k) => ok.add(k.id));
      refresh();
    },
  };
}

// ---------------- Sound check (3D typing + radar) ----------------
const AUTOTYPE = "the quick brown fox jumps over the lazy dog";

export function soundStep(ctx: StepCtx): StepView {
  const board = ctx.board()!;
  const s = ctx.session;
  const keys = board.layout.keys;
  const codeMap = new Map(keys.filter((k) => k.code).map((k) => [k.code, k.id]));
  const byLabel = new Map(keys.map((k) => [k.label.toLowerCase(), k.id]));
  const spaceId = keys.find((k) => k.code === "Space")?.id;
  ctx.view("low");
  board.clearMarkers();
  let presses = 0;
  const radar = drawBox(radarPainter(() => ({ profile: computeProfile(s, ctx.catalog).sound, target: targetRanges(s.job.sound) })), { w: 230, h: 200, name: "sound-radar" });
  const describe = () => {
    const p = computeProfile(s, ctx.catalog).sound;
    const w: string[] = [t(p.depth > 0.62 ? "desc.deep" : p.depth < 0.42 ? "desc.high" : "desc.balanced")];
    if (p.brightness > 0.62) w.push(t("desc.bright"));
    if (p.brightness < 0.3) w.push(t("desc.muffled"));
    if (p.hollow > 0.4) w.push(t("desc.hollow"));
    else if (p.hollow < 0.15) w.push(t("desc.dampened"));
    w.push(t(p.scratch > 0.4 ? "desc.scratchy" : "desc.smooth"));
    if (p.rattle > 0.4) w.push(t("desc.rattly"));
    if (p.volume < 0.45) w.push(t("desc.quiet"));
    if (p.volume > 0.78) w.push(t("desc.loud"));
    if (p.click > 0.5) w.push(t("desc.clicky"));
    return w.join(", ");
  };
  const hit = (id: number) => {
    ctx.keySound(id, true);
    presses++;
    if (presses >= 6 && !s.soundChecked) {
      s.soundChecked = true;
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
  return {
    render(a) {
      const row = stack({ horizontal: true, h: a.h, spacing: S.lg });
      const side = a.portrait ? 160 : 230;
      radar.width = `${side}px`;
      radar.height = `${Math.min(a.h, 200)}px`;
      radar.redraw();
      row.addControl(radar);
      const col = stack({ w: a.w - side - S.lg, spacing: S.xs });
      const p = computeProfile(s, ctx.catalog).sound;
      col.addControl(label(t("sound.match", { pct: Math.round(soundMatch(p, s.job.sound) * 100) }), { size: a.portrait ? T.h3 : T.h2, weight: 700, name: "sound-match" }));
      col.addControl(label(t("sound.describe", { words: describe() }), { size: T.small, weight: 600, color: C.inkSoft, wrap: true }));
      col.addControl(button(`⌨️ ${t("sound.autotype")}`, { w: 200, size: "sm", variant: "primary", testId: "autotype", onClick: autoType }));
      col.addControl(label(t("sound.tweak"), { size: T.small, weight: 700, color: C.inkSoft, h: 22 }));
      const tw = stack({ horizontal: true, h: 40, spacing: S.xs });
      const f = s.layout ? LAYOUT_PRICE_FACTOR[s.layout] : 1;
      for (const d of DAMPENING.filter((x) => isUnlocked(x.requires, ctx.builds)).slice(0, a.portrait ? 2 : 5)) {
        tw.addControl(
          button(`${t(`part.damp.${d.id}` as MessageKey)}`, {
            w: a.portrait ? 92 : 128,
            h: 38,
            size: "sm",
            variant: s.damp.includes(d.id) ? "dark" : "secondary",
            testId: `tweak-${d.id}`,
            sub: formatMoney(Math.round((d.price * f) / 100) * 100),
            onClick: () => {
              if (s.damp.includes(d.id)) s.damp = s.damp.filter((x) => x !== d.id);
              else {
                s.damp = [...s.damp, d.id];
                if (d.id === "tape" && s.tapeQuality === null) s.tapeQuality = 0.6;
              }
              play("bench.foam");
              ctx.update();
              ctx.rerender();
            },
          }),
        );
      }
      col.addControl(tw);
      row.addControl(col);
      return row;
    },
    onPointer(type, x, y) {
      if (type !== "down") return;
      const key = board.pickKey(ctx.store.rayAt(x, y));
      if (key !== null) hit(key);
    },
    onKey(e) {
      if (e.type !== "keydown" || e.repeat) return;
      const id = codeMap.get(e.code);
      if (id === undefined) return;
      if (!e.ctrlKey && !e.metaKey && !/^F(5|11|12)$/.test(e.code)) e.preventDefault();
      hit(id);
    },
    auto() {
      s.soundChecked = true;
      ctx.update();
    },
  };
}

