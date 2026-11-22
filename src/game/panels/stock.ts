/** Stock: what's on the shelves, grouped by category, and what's on the way. */
import { parseSku, stockValue, type SkuKind } from "../../build/stock";
import { formatClock } from "../../build/workshop";
import type { GameState } from "../../core/state";
import type { Catalog } from "../../data/catalog";
import { formatMoney, t, type MessageKey } from "../../i18n";
import { buttonGrid, openSheet, scrollList } from "../../gui/sheet";
import { C, R, S, T } from "../../gui/theme";
import type { Ui } from "../../gui/ui";
import { button, drawBox, H_CENTER, H_RIGHT, label, panel } from "../../gui/widgets";
import { skuView } from "../skuText";

const CATS: (SkuKind | "all")[] = ["all", "case", "pcb", "plate", "stab", "sw", "kc", "foam", "lube"];

export function openStock(ui: Ui, o: { state: GameState; catalog: Catalog; onBuy: () => void }) {
  let cat: SkuKind | "all" = "all";
  const s = o.state;
  return openSheet(ui, { name: "stock", title: () => `📦 ${t("stock.title")} · ${t("stock.value", { money: formatMoney(stockValue(s.inventory, o.catalog)) })}` }, (body, area, rerender) => {
    const grid = buttonGrid(
      CATS.map((c) => {
        const n = c === "all" ? Object.keys(s.inventory).length : Object.keys(s.inventory).filter((k) => parseSku(k)?.kind === c).length;
        return { text: `${t(`stock.cat.${c}` as MessageKey)}${n ? ` (${n})` : ""}`, active: cat === c, testId: `stockcat-${c}`, onClick: () => ((cat = c), rerender()) };
      }),
      area.w,
      { minW: 110, maxW: 130 },
    );
    body.addControl(grid.control);
    const top = grid.height + 12;
    const { viewer, content } = scrollList(area.w, area.h - top, "stock-list");
    viewer.top = `${top}px`;
    body.addControl(viewer);
    const w = area.w - 24;
    const skus = Object.keys(s.inventory)
      .filter((k) => s.inventory[k] > 0 && (cat === "all" || parseSku(k)?.kind === cat))
      .sort((a, b) => CATS.indexOf(parseSku(a)!.kind) - CATS.indexOf(parseSku(b)!.kind) || a.localeCompare(b));
    if (!skus.length) {
      content.addControl(label(t("stock.empty"), { size: T.body, color: C.inkSoft, align: H_CENTER, h: 60, w }));
      content.addControl(button(`🛒 ${t("sup.title")}`, { w: 220, ha: H_CENTER, testId: "stock-buy", onClick: o.onBuy }));
    }
    for (const sku of skus) {
      const v = skuView(sku, o.catalog);
      const countW = w < 600 ? 70 : 160;
      const r = panel({ w, h: 64, radius: R.sm, bg: C.white, shadow: false, border: C.line, thickness: 1, name: `stock-${sku}` });
      r.addControl(drawBox(v.icon, { w: 72, h: 52, x: 8, y: 6 }));
      r.addControl(label(v.title, { size: T.body, weight: 700, x: 92, y: 8, h: 24, w: w - 100 - countW, ellipsis: true }));
      r.addControl(label(v.sub, { size: T.tiny + 1, color: C.inkSoft, x: 92, y: 33, h: 20, w: w - 100 - countW, ellipsis: true }));
      r.addControl(label(t("stock.count", { count: s.inventory[sku] }), { size: T.h3, weight: 700, x: -S.md, y: 0, w: countW, h: 64, align: 1, ha: H_RIGHT }));
      content.addControl(r);
    }
    // on the way
    if (s.shipments.length) {
      content.addControl(label(`🚚 ${t("stock.onTheWay")}`, { size: T.h3, weight: 700, h: 40, w }));
      for (const sh of s.shipments) {
        const items = Object.entries(sh.items).map(([k, n]) => `${n}× ${skuView(k, o.catalog).title}`).join(", ");
        const when = sh.express ? t("sup.whenAt", { time: formatClock(sh.arrives % 1440) }) : t("sup.whenTomorrow");
        content.addControl(label(`${t("sup.arrives", { when })}: ${items}`, { size: T.small, color: C.inkSoft, wrap: true, w }));
      }
    }
  });
}
