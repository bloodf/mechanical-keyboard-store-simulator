/** All build steps as StepViews: parts drawer tiles + the 3D minigames where they belong. */
import type { Control } from "@babylonjs/gui";
import { play } from "../../audio/engine";
import { computeProfile, findSwitch, layoutMatches, soundMatch, stabCount, targetRanges } from "../../build/profile";
import { applyInstall, applySolder, isHotswap, unresolvedFaults } from "../../build/session";
import { canBendPins } from "../../build/tools";
import { footprintOf, parseSku, skuCase, skuFoam, skuKeycaps, skuPcb, skuPlate, skuStab, skuSwitch, SKU_LUBE, type Footprint } from "../../build/stock";
import type { BuildSession } from "../../build/types";
import { getLayout, type LayoutId } from "../../data/layouts";
import {
  CASE_MATERIALS,
  DAMPENING,
  HOUSING_SOUND,
  KEYCAP_MATERIAL_SOUND,
  KEYCAP_PROFILE_SOUND,
  PCBS,
  PLATES,
  STABS,
  STAB_MODS,
  SWITCH_TYPE_SOUND,
  type CaseMaterial,
  type DampDef,
  type SoundMods,
} from "../../data/parts";
import { PROFILE_GEO } from "../../data/profiles";
import { t, type MessageKey } from "../../i18n";
import { C, S, T } from "../../gui/theme";
import { button, drawBox, group, H_RIGHT, label, stack, V_BOTTOM } from "../../gui/widgets";
import { caseColorOf, cartIcon, skuView } from "../skuText";
import { tileRow, type Pager } from "./drawer";
import { modIcon, plateIcon } from "./icons";
import { radarPainter } from "./radar";
import type { DrawerArea, StepCtx, StepView, SupplierPreset, TileSpec } from "./types";
import { LubeGame } from "./games/lube";
import { ScrewGame } from "./games/screws";
import { SOLDER_BEATS, SolderGame } from "./games/solder";
import { TapeGame } from "./games/tape";
import { WireGame } from "./games/wire";
import { burst, puffs } from "./games/common";

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

function merge(...ms: (SoundMods | undefined)[]): SoundMods {
  const out: SoundMods = {};
  for (const m of ms) for (const [k, v] of Object.entries(m ?? {})) out[k as keyof SoundMods] = (out[k as keyof SoundMods] ?? 0) + (v as number);
  return out;
}

/** Footprint of the build so far (from the PCB / switch family). */
export const fpOf = (b: BuildSession): Footprint => (b.family === "choc" ? "choc" : "mx");

/** The SKU currently used by each slot of the build (derived from the session). */
export function slotSkus(b: BuildSession) {
  const fp = fpOf(b);
  return {
    case: b.layout && b.caseMaterial && b.caseColor ? skuCase(b.caseMaterial, b.layout, b.caseColor.id) : null,
    pcb: b.layout && b.pcb ? skuPcb(b.pcb, b.layout, fp) : null,
    plate: b.layout && b.plate && b.plate !== "none" ? skuPlate(b.plate, b.layout, fp) : null,
    stab: b.stabs ? skuStab(b.stabs, fp) : null,
    sw: b.switchId ? skuSwitch(b.switchId) : null,
    kc: b.keycapsId ? skuKeycaps(b.keycapsId) : null,
  };
}

/** The layout the order most likely wants (for supplier filters). */
export function preferredLayout(b: BuildSession): LayoutId {
  const l = b.job.layout;
  return b.layout ?? (l.kind === "exact" ? l.id : l.kind === "numpad" ? "full" : l.kind === "frow" ? "75" : "65");
}

function buyTile(ctx: StepCtx, preset: SupplierPreset): TileSpec {
  return { id: "buy", title: t("bench.buyMore"), sub: t("sup.title"), icon: cartIcon, priceText: " ", onClick: () => ctx.openSuppliers(preset) };
}

const stockText = (n: number) => t("bench.stock", { count: n });

/** Release the parts that no longer fit after an earlier choice changed. */
function invalidate(ctx: StepCtx, what: { layout?: boolean; fp?: boolean }) {
  const b = ctx.session;
  const cur = slotSkus(b);
  if (what.layout || what.fp) {
    if (cur.pcb && what.layout) (ctx.release(cur.pcb), (b.pcb = null));
    if (cur.plate) (ctx.release(cur.plate), (b.plate = null));
    if (b.plate === "none" && what.layout) b.plate = null;
  }
  // (keycaps come after the switches are installed, when earlier steps can't change anymore)
  if (what.fp && cur.stab) (ctx.release(cur.stab), (b.stabs = null), (b.stabLube = null));
  if ((what.layout || what.fp) && cur.sw) {
    ctx.release(cur.sw, b.reserved[cur.sw] ?? 0);
    b.switchId = null;
    b.lube = null;
  }
}

// ---------------- Case ----------------
export function caseStep(ctx: StepCtx): StepView {
  const pager: Pager = { page: 0 };
  const pick = (sku: string) => {
    const s = ctx.session;
    const info = parseSku(sku)!;
    const cur = slotSkus(s).case;
    if (cur === sku) return;
    if (!ctx.swap(cur, sku)) return;
    const layoutChanged = s.layout !== info.layout;
    if (layoutChanged && s.layout) invalidate(ctx, { layout: true });
    const c = caseColorOf(ctx.catalog, info.id, info.color!)!;
    s.layout = info.layout!;
    s.caseMaterial = info.id as CaseMaterial;
    s.caseColor = { id: c.id, hex: c.hex };
    if (layoutChanged || !ctx.board()) ctx.setLayoutBoard();
    else ctx.board()?.setCase(CASE_MATERIALS.find((m) => m.id === info.id)!, c.hex);
    play("shop.boxDrop");
    ctx.update();
    ctx.complete();
    ctx.rerender();
  };
  const candidates = () => {
    const s = ctx.session;
    const own = slotSkus(s).case;
    const list = ctx.skus("case/");
    if (own && !list.includes(own)) list.unshift(own);
    // cases that fit the order first
    return list.sort((a, b) => Number(layoutMatches(s.job.layout, parseSku(b)!.layout!)) - Number(layoutMatches(s.job.layout, parseSku(a)!.layout!)));
  };
  return {
    render(a) {
      const s = ctx.session;
      const own = slotSkus(s).case;
      const tiles: TileSpec[] = candidates().map((sku) => {
        const v = skuView(sku, ctx.catalog);
        const info = parseSku(sku)!;
        const fits = layoutMatches(s.job.layout, info.layout!);
        return {
          id: sku.replace(/\//g, "_"),
          title: v.title,
          sub: v.sub,
          icon: v.icon,
          effects: v.effects,
          selected: own === sku,
          dim: !fits,
          priceText: own === sku ? t("bench.stock", { count: ctx.stock(sku) + 1 }) : stockText(ctx.stock(sku)),
          onClick: () => pick(sku),
        };
      });
      tiles.push(buyTile(ctx, { tab: "case", layout: preferredLayout(s) }));
      if (tiles.length === 1) tiles.unshift({ id: "none", title: t("bench.noMatch"), icon: () => {}, priceText: " ", onClick: () => ctx.openSuppliers({ tab: "case", layout: preferredLayout(s) }) });
      return tileRow(tiles, a, pager, ctx.rerender, { testPrefix: "case" });
    },
    auto() {
      const s = ctx.session;
      const want = preferredLayout(s);
      let sku = candidates().find((k) => parseSku(k)!.layout === want);
      if (!sku) {
        sku = skuCase("aluminum", want, ctx.catalog.caseColors.aluminum[0].id);
        ctx.devGive(sku);
      }
      pick(sku);
    },
  };
}

// ---------------- PCB ----------------
export function pcbStep(ctx: StepCtx): StepView {
  const pager: Pager = { page: 0 };
  const pick = (sku: string) => {
    const s = ctx.session;
    const info = parseSku(sku)!;
    const cur = slotSkus(s).pcb;
    if (cur === sku) return;
    if (!ctx.swap(cur, sku)) return;
    const newFp = info.fp!;
    if (fpOf(s) !== newFp || s.family === null) {
      if (s.family !== null && fpOf(s) !== newFp) invalidate(ctx, { fp: true });
      s.family = newFp === "choc" ? "choc" : "mx";
      ctx.board()?.setFamily(s.family);
    }
    s.pcb = info.id as BuildSession["pcb"];
    ctx.board()?.setPcb(PCBS.find((p) => p.id === info.id)!);
    play("bench.pcbSnap");
    ctx.update();
    ctx.complete();
    ctx.rerender();
  };
  const candidates = () => {
    const s = ctx.session;
    const own = slotSkus(s).pcb;
    const list = ctx.skus("pcb/").filter((k) => parseSku(k)!.layout === s.layout);
    if (own && !list.includes(own)) list.unshift(own);
    return list;
  };
  return {
    render(a) {
      const s = ctx.session;
      const own = slotSkus(s).pcb;
      const tiles: TileSpec[] = candidates().map((sku) => {
        const v = skuView(sku, ctx.catalog);
        return { id: sku.replace(/\//g, "_"), title: v.title, sub: v.sub, icon: v.icon, effects: v.effects, selected: own === sku, priceText: stockText(ctx.stock(sku) + (own === sku ? 1 : 0)), onClick: () => pick(sku) };
      });
      tiles.push(buyTile(ctx, { tab: "pcb", layout: s.layout ?? undefined }));
      return tileRow(tiles, a, pager, ctx.rerender, { testPrefix: "pcb" });
    },
    auto() {
      const s = ctx.session;
      const want = s.job.wants?.lowProfile ? "choc" : "mx";
      let sku = candidates().find((k) => parseSku(k)!.fp === want);
      if (!sku) {
        sku = skuPcb("hotswap", s.layout!, want);
        ctx.devGive(sku);
      }
      pick(sku);
    },
  };
}

// ---------------- Plate ----------------
export function plateStep(ctx: StepCtx): StepView {
  const pager: Pager = { page: 0 };
  const pick = (sku: string | "none") => {
    const s = ctx.session;
    const cur = slotSkus(s).plate;
    if (sku === "none") {
      if (cur) ctx.release(cur);
      s.plate = "none";
      ctx.board()?.setPlate(PLATES.find((p) => p.id === "none")!);
      play("ui.toggle");
    } else {
      if (cur !== sku && !ctx.swap(cur, sku)) return;
      const info = parseSku(sku)!;
      s.plate = info.id as BuildSession["plate"];
      ctx.board()?.setPlate(PLATES.find((p) => p.id === info.id)!);
      play("bench.pcbSnap");
    }
    ctx.update();
    ctx.complete();
    ctx.rerender();
  };
  const candidates = () => {
    const s = ctx.session;
    const own = slotSkus(s).plate;
    const list = ctx.skus("plate/").filter((k) => {
      const i = parseSku(k)!;
      return i.layout === s.layout && i.fp === fpOf(s);
    });
    if (own && !list.includes(own)) list.unshift(own);
    return list;
  };
  return {
    render(a) {
      const s = ctx.session;
      const own = slotSkus(s).plate;
      const tiles: TileSpec[] = candidates().map((sku) => {
        const v = skuView(sku, ctx.catalog);
        return { id: sku.replace(/\//g, "_"), title: v.title, sub: v.sub, icon: v.icon, effects: v.effects, selected: own === sku, priceText: stockText(ctx.stock(sku) + (own === sku ? 1 : 0)), onClick: () => pick(sku) };
      });
      const none = PLATES.find((p) => p.id === "none")!;
      tiles.push({ id: "none", title: t("part.plate.none"), icon: plateIcon(none.color, true), effects: none.sound, selected: s.plate === "none", priceText: t("bench.free"), onClick: () => pick("none") });
      tiles.push(buyTile(ctx, { tab: "plate", layout: s.layout ?? undefined, fp: fpOf(s) }));
      return tileRow(tiles, a, pager, ctx.rerender, { testPrefix: "plate" });
    },
    auto() {
      const s = ctx.session;
      let sku = candidates()[0];
      if (!sku) {
        sku = skuPlate("aluminum", s.layout!, fpOf(s));
        ctx.devGive(sku);
      }
      pick(sku);
    },
  };
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
  const toggle = (id: DampDef["id"]) => {
    const s = ctx.session;
    const sku = skuFoam(id);
    if (s.damp.includes(id)) {
      ctx.release(sku);
      s.damp = s.damp.filter((x) => x !== id);
      if (id === "tape") {
        s.tapeQuality = null;
        ctx.board()?.setTape([]);
      }
      play("ui.toggle");
    } else {
      if (!ctx.reserve(sku)) return ctx.openSuppliers({ tab: "foam" });
      s.damp = [...s.damp, id];
      play(id === "tape" ? "bench.tape" : "bench.foam");
    }
    ctx.board()?.setDampening(s.damp);
    ctx.update();
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
      const tiles: TileSpec[] = DAMPENING.filter((d) => s.damp.includes(d.id) || ctx.stock(skuFoam(d.id)) > 0).map((d) => {
        const v = skuView(skuFoam(d.id), ctx.catalog);
        const n = ctx.stock(skuFoam(d.id));
        return { id: d.id, title: v.title, sub: v.sub, icon: v.icon, effects: d.sound, selected: s.damp.includes(d.id), priceText: stockText(n + (s.damp.includes(d.id) ? 1 : 0)), onClick: () => toggle(d.id) };
      });
      tiles.push(buyTile(ctx, { tab: "foam" }));
      body.addControl(tileRow(tiles, tilesArea, pager, ctx.rerender, { testPrefix: "damp" }));
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
      const s = ctx.session;
      if (game) game.auto();
      else if (s.damp.includes("tape") && s.tapeQuality === null) finish(1);
      else {
        if (!s.damp.includes("caseFoam")) {
          if (ctx.stock(skuFoam("caseFoam")) === 0) ctx.devGive(skuFoam("caseFoam"));
          toggle("caseFoam");
        }
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
  const pick = (sku: string) => {
    const s = ctx.session;
    const cur = slotSkus(s).stab;
    if (cur !== sku && !ctx.swap(cur, sku)) return;
    const st = STABS.find((x) => x.id === parseSku(sku)!.id)!;
    s.stabs = st.id;
    ctx.board()?.setStabs(st, (s.stabLube ?? 0) > 0.3);
    play("bench.keycapPlace");
    tab = "mods";
    ctx.update();
    ctx.rerender();
  };
  const candidates = () => {
    const s = ctx.session;
    const own = slotSkus(s).stab;
    const list = ctx.skus("stab/").filter((k) => parseSku(k)!.fp === fpOf(s));
    if (own && !list.includes(own)) list.unshift(own);
    return list;
  };
  return {
    get compact() {
      return !!game;
    },
    render(a) {
      if (game) return game.render(a);
      const s = ctx.session;
      const own = slotSkus(s).stab;
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
          (area) => {
            if (tab === "tiers") {
              const tiles: TileSpec[] = candidates().map((sku) => {
                const v = skuView(sku, ctx.catalog);
                return { id: sku.replace(/\//g, "_"), title: v.title, sub: v.sub, icon: v.icon, selected: own === sku, priceText: stockText(ctx.stock(sku) + (own === sku ? 1 : 0)), onClick: () => pick(sku) };
              });
              tiles.push(buyTile(ctx, { tab: "stab", fp: fpOf(s) }));
              return tileRow(tiles, area, pagers.tiers, ctx.rerender, { testPrefix: "stabs" });
            }
            return tileRow(
              STAB_MODS.map((m) => ({
                id: m,
                title: t(`part.stabMod.${m}` as MessageKey),
                sub: t(`part.stabModDesc.${m}` as MessageKey),
                priceText: t("bench.free"),
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
            );
          },
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
      const s = ctx.session;
      if (!s.stabs) {
        let sku = candidates()[0];
        if (!sku) {
          sku = skuStab("standard", fpOf(s));
          ctx.devGive(sku);
        }
        pick(sku);
        s.stabMods = ["clip", "bandaid"];
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
  const need = () => getLayout(ctx.session.layout!).keys.length;
  const pick = (sku: string) => {
    const s = ctx.session;
    const n = need();
    const cur = slotSkus(s).sw;
    if (cur === sku) return;
    if (ctx.stock(sku) < n) return ctx.openSuppliers({ tab: "sw", fp: fpOf(s) });
    if (cur) ctx.release(cur, s.reserved[cur] ?? 0);
    if (!ctx.reserve(sku, n)) return;
    const sw = ctx.catalog.switches.find((x) => x.id === parseSku(sku)!.id)!;
    s.switchId = sw.id;
    s.lube = null;
    s.family = sw.family;
    ctx.board()?.setSwitchLook(sw);
    ctx.update();
    const keys = getLayout(s.layout!).keys;
    for (let i = 0; i < 3; i++) setTimeout(() => ctx.keySound(keys[Math.floor(Math.random() * keys.length)].id, false), i * 130);
    ctx.complete();
    ctx.rerender();
  };
  const fits = (sku: string) => {
    const sw = ctx.catalog.switches.find((x) => x.id === parseSku(sku)!.id);
    return !!sw && footprintOf(sw.family) === fpOf(ctx.session);
  };
  const candidates = () => {
    const s = ctx.session;
    const own = slotSkus(s).sw;
    const list = ctx.skus("sw/").filter(fits);
    if (own && !list.includes(own)) list.unshift(own);
    return list;
  };
  return {
    render(a) {
      const s = ctx.session;
      const own = slotSkus(s).sw;
      const n = need();
      const tiles: TileSpec[] = candidates().map((sku) => {
        const v = skuView(sku, ctx.catalog);
        const sw = ctx.catalog.switches.find((x) => x.id === parseSku(sku)!.id)!;
        const have = ctx.stock(sku) + (own === sku ? (s.reserved[sku] ?? 0) : 0);
        return {
          id: sw.id,
          title: v.title,
          sub: v.sub,
          icon: v.icon,
          effects: merge(SWITCH_TYPE_SOUND[sw.type], HOUSING_SOUND[sw.housing], sw.longPole ? { brightness: 0.15, depth: -0.08 } : undefined),
          selected: own === sku,
          dim: have < n,
          priceText: have < n ? t("bench.need", { need: n, have }) : stockText(have),
          onClick: () => pick(sku),
        };
      });
      tiles.push(buyTile(ctx, { tab: "sw", fp: fpOf(s) }));
      return tileRow(tiles, a, pager, ctx.rerender, { testPrefix: "switch", tileW: a.portrait ? 140 : 180 });
    },
    auto() {
      const s = ctx.session;
      const n = need();
      let sku = candidates().find((k) => ctx.stock(k) >= n);
      if (!sku) {
        const sw = ctx.catalog.switches.find((x) => footprintOf(x.family) === fpOf(s))!;
        sku = skuSwitch(sw.id);
        ctx.devGive(sku, n);
      }
      pick(sku);
    },
  };
}

// ---------------- Lube (3D minigame) ----------------
export function lubeStep(ctx: StepCtx): StepView {
  const sw = findSwitch(ctx.catalog, ctx.session.switchId)!;
  const hasLube = () => (ctx.session.reserved[SKU_LUBE] ?? 0) > 0 || ctx.reserve(SKU_LUBE);
  let game: LubeGame | null = ctx.session.lube || !hasLube() ? null : new LubeGame(ctx, sw, done);
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
      if (!game && !s.lube) {
        // no lube on the shelf: skip, or order some
        const row = stack({ horizontal: true, h: 56, spacing: S.md });
        row.addControl(label(t("bench.noLube"), { w: 240, size: T.h3, weight: 700 }));
        row.addControl(button(t("lube.skip"), { w: 170, testId: "lube-skip", onClick: skip }));
        row.addControl(button(t("bench.buyMore"), { w: 190, testId: "lube-buy", onClick: () => ctx.openSuppliers({ tab: "lube" }) }));
        row.addControl(
          button("↺", {
            w: 60,
            testId: "lube-retry",
            onClick: () => {
              if (hasLube()) game = new LubeGame(ctx, sw, done);
              ctx.rerender();
            },
          }),
        );
        return row;
      }
      if (!game) {
        const row = stack({ horizontal: true, h: 56, spacing: S.md });
        row.addControl(label(s.lube?.skipped ? t("lube.skip") : t("lube.result", { pct: Math.round((s.lube?.quality ?? 0) * 100) }), { w: 280, size: T.h3, weight: 700 }));
        row.addControl(
          button("↺", {
            w: 60,
            testId: "lube-redo",
            onClick: () => {
              s.lube = null;
              if (hasLube()) game = new LubeGame(ctx, sw, done);
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
      else if (!ctx.session.lube) {
        if (!hasLube()) ctx.devGive(SKU_LUBE);
        hasLube();
        done({ quality: 1, over: 0 });
      }
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
    if (isHotswap(ctx.session) && canBendPins(ctx.state) && speed > BEND_SPEED && Math.random() < 0.4) {
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
    const set = ctx.catalog.keycaps.find((k) => k.id === ctx.session.keycapsId);
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
  const pick = (sku: string) => {
    const s = ctx.session;
    const cur = slotSkus(s).kc;
    if (cur === sku) return;
    if (!ctx.swap(cur, sku)) return;
    s.keycapsId = parseSku(sku)!.id;
    install();
    ctx.update();
    ctx.complete();
    ctx.rerender();
  };
  const fits = (sku: string) => {
    const k = ctx.catalog.keycaps.find((x) => x.id === parseSku(sku)!.id);
    return !!k && PROFILE_GEO[k.profile].mount === fpOf(ctx.session);
  };
  const candidates = () => {
    const own = slotSkus(ctx.session).kc;
    const list = ctx.skus("kc/").filter(fits);
    if (own && !list.includes(own)) list.unshift(own);
    return list;
  };
  return {
    render(a) {
      const s = ctx.session;
      const own = slotSkus(s).kc;
      const tiles: TileSpec[] = candidates().map((sku) => {
        const k = ctx.catalog.keycaps.find((x) => x.id === parseSku(sku)!.id)!;
        const v = skuView(sku, ctx.catalog);
        return {
          id: k.id,
          title: v.title,
          sub: v.sub,
          icon: v.icon,
          effects: merge(KEYCAP_MATERIAL_SOUND[k.material], KEYCAP_PROFILE_SOUND[k.profile]),
          selected: own === sku,
          priceText: stockText(ctx.stock(sku) + (own === sku ? 1 : 0)),
          onClick: () => pick(sku),
        };
      });
      tiles.push(buyTile(ctx, { tab: "kc", fp: fpOf(s) }));
      return tileRow(tiles, a, pager, ctx.rerender, { testPrefix: "keycaps", tileW: a.portrait ? 140 : 176 });
    },
    auto() {
      let sku = candidates()[0];
      if (!sku) {
        const k = ctx.catalog.keycaps.find((x) => PROFILE_GEO[x.profile].mount === fpOf(ctx.session))!;
        sku = skuKeycaps(k.id);
        ctx.devGive(sku);
      }
      pick(sku);
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
      for (const d of DAMPENING.filter((x) => s.damp.includes(x.id) || ctx.stock(skuFoam(x.id)) > 0).slice(0, a.portrait ? 2 : 5)) {
        tw.addControl(
          button(`${t(`part.damp.${d.id}` as MessageKey)}`, {
            w: a.portrait ? 92 : 128,
            h: 38,
            size: "sm",
            variant: s.damp.includes(d.id) ? "dark" : "secondary",
            testId: `tweak-${d.id}`,
            sub: s.damp.includes(d.id) ? "✓" : stockText(ctx.stock(skuFoam(d.id))),
            onClick: () => {
              if (s.damp.includes(d.id)) {
                s.damp = s.damp.filter((x) => x !== d.id);
                ctx.release(skuFoam(d.id));
              } else {
                if (!ctx.reserve(skuFoam(d.id))) return;
                s.damp = [...s.damp, d.id];
                if (d.id === "tape" && s.tapeQuality === null) s.tapeQuality = 0.6;
              }
              ctx.board()?.setDampening(s.damp, false);
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

