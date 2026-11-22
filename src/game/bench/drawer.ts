/** Parts drawer tiles: one paged row of big item tiles (no scrolling). */
import { Rectangle, type Control } from "@babylonjs/gui";
import { play } from "../../audio/engine";
import type { SoundMods } from "../../data/parts";
import { formatMoney, t, type MessageKey } from "../../i18n";
import { C, R, S, T } from "../../gui/theme";
import { button, drawBox, group, H_CENTER, H_RIGHT, label, V_CENTER } from "../../gui/widgets";
import type { DrawerArea, TileSpec } from "./types";

export function effectWords(m: SoundMods | undefined): string[] {
  if (!m) return [];
  const out: string[] = [];
  for (const axis of ["depth", "brightness", "hollow", "volume", "scratch", "click"] as const) {
    const v = m[axis] ?? 0;
    if (Math.abs(v) < 0.035) continue;
    const key = `effect.${axis}.${v > 0 ? "up" : "down"}`;
    if (key === "effect.scratch.up" || key === "effect.click.down") continue;
    out.push(t(key as MessageKey));
  }
  return out.slice(0, 2);
}

export interface Pager {
  page: number;
}

/**
 * Lay tiles in a single row sized to the area; ◀ ▶ page when they don't all fit.
 * `pager` keeps the current page across re-renders.
 */
export function tileRow(tiles: TileSpec[], area: DrawerArea, pager: Pager, rerender: () => void, opts: { tileW?: number; testPrefix?: string } = {}): Control {
  const box = group({ w: area.w, h: area.h });
  const arrowW = 40;
  const gap = S.md;
  const tileW = opts.tileW ?? (area.portrait ? 132 : 168);
  const avail = area.w - 2 * (arrowW + S.sm);
  const per = Math.max(1, Math.floor((avail + gap) / (tileW + gap)));
  const pages = Math.max(1, Math.ceil(tiles.length / per));
  // keep the selected tile visible the first time
  if (pager.page >= pages) pager.page = pages - 1;
  const shown = tiles.slice(pager.page * per, pager.page * per + per);
  const rowW = shown.length * tileW + (shown.length - 1) * gap;
  const tileH = Math.min(area.h, area.portrait ? 190 : 196);
  const row = group({ w: rowW, h: tileH, ha: H_CENTER, va: V_CENTER });
  shown.forEach((tile, i) => {
    const c = tileControl(tile, tileW, tileH, opts.testPrefix);
    c.left = `${i * (tileW + gap)}px`;
    row.addControl(c);
  });
  box.addControl(row);
  if (pages > 1) {
    const prev = button("◀", { w: arrowW, h: 64, size: "sm", va: V_CENTER, testId: "drawer-prev", onClick: () => ((pager.page = (pager.page - 1 + pages) % pages), rerender()) });
    const next = button("▶", { w: arrowW, h: 64, size: "sm", va: V_CENTER, ha: H_RIGHT, testId: "drawer-next", onClick: () => ((pager.page = (pager.page + 1) % pages), rerender()) });
    box.addControl(prev);
    box.addControl(next);
    box.addControl(label(`${pager.page + 1}/${pages}`, { size: T.tiny, weight: 700, color: C.inkFaint, align: H_CENTER, ha: H_RIGHT, va: V_CENTER, w: arrowW, h: 16, y: 44 }));
  }
  return box;
}

function tileControl(t0: TileSpec, w: number, h: number, prefix = "tile"): Control {
  const r = new Rectangle(`${prefix}-${t0.id}`);
  r.width = `${w}px`;
  r.height = `${h}px`;
  r.horizontalAlignment = 0;
  r.verticalAlignment = 0;
  r.cornerRadius = R.md;
  r.thickness = t0.selected ? 4 : 2;
  r.color = t0.selected ? C.accent : C.line;
  r.background = t0.selected ? "#fff3ea" : C.white;
  r.shadowColor = t0.selected ? "rgba(207,84,32,0.35)" : "rgba(40,25,10,0.12)";
  r.shadowBlur = t0.selected ? 14 : 8;
  r.shadowOffsetY = 3;
  r.isPointerBlocker = true;
  r.hoverCursor = "pointer";
  if (t0.dim) r.alpha = 0.7;
  const iconH = Math.round(h * 0.34);
  const iconBg = new Rectangle();
  iconBg.thickness = 0;
  iconBg.cornerRadius = R.sm;
  iconBg.background = t0.selected ? "#ffe6d6" : C.paper2;
  iconBg.width = `${w - 12}px`;
  iconBg.height = `${iconH}px`;
  iconBg.top = "6px";
  iconBg.verticalAlignment = 0;
  iconBg.isPointerBlocker = false;
  iconBg.isHitTestVisible = false;
  iconBg.addControl(drawBox(t0.icon, { w: "100%", h: "100%" }));
  r.addControl(iconBg);
  // Fixed slots (no overlaps): title ≤2 lines, sub ≤2 lines, effect line, price line.
  const words = effectWords(t0.effects);
  const priceY = h - 26;
  const fxY = priceY - 18;
  let y = iconH + 10;
  r.addControl(label(t0.title, { size: T.small + 1, weight: 700, x: 10, y, w: w - 20, h: 42, ellipsis: true, valign: 0, lineSpacing: -2 }));
  y += 40;
  const subH = (words.length ? fxY : priceY) - y - 2;
  if (t0.sub && subH > 12) r.addControl(label(t0.sub, { size: T.tiny, weight: 500, color: C.inkSoft, x: 10, y, w: w - 20, h: subH, ellipsis: true, valign: 0 }));
  if (words.length) r.addControl(label(words.join(" · "), { size: T.tiny, weight: 700, color: C.blue, x: 10, y: fxY, w: w - 20, h: 16 }));
  const price = t0.priceText ?? (t0.price ? formatMoney(t0.price) : t("bench.free"));
  r.addControl(label(price, { size: T.small, weight: 700, color: t0.dim ? C.inkSoft : C.good, x: 10, y: priceY, w: w - 20, h: 20 }));
  if (t0.selected) {
    const check = new Rectangle();
    check.width = check.height = "26px";
    check.cornerRadius = 13;
    check.thickness = 0;
    check.background = C.accent;
    check.horizontalAlignment = 1;
    check.verticalAlignment = 0;
    check.left = "-8px";
    check.top = "10px";
    check.addControl(label("✓", { size: T.body, weight: 700, color: C.white, align: H_CENTER, h: 26 }));
    r.addControl(check);
  }
  r.onPointerEnterObservable.add(() => {
    if (!t0.selected) r.color = "#f3b58f";
    play("ui.hover");
  });
  r.onPointerOutObservable.add(() => (r.color = t0.selected ? C.accent : C.line));
  r.onPointerDownObservable.add(() => (r.scaleX = r.scaleY = 0.97));
  r.onPointerUpObservable.add(() => (r.scaleX = r.scaleY = 1));
  r.onPointerClickObservable.add(() => t0.onClick());
  return r;
}
