/** A client order as a card: who, what they said, what they want, pay, deadline, stock check, actions. */
import type { Control } from "@babylonjs/gui";
import { missingFor } from "../build/stock";
import type { Order } from "../build/types";
import type { GameState } from "../core/state";
import type { Catalog } from "../data/catalog";
import { formatMoney, t, type MessageKey } from "../i18n";
import { C, R, S, T } from "../gui/theme";
import { button, chip, label, panel, stack, V_BOTTOM, type Variant } from "../gui/widgets";
import { chipsWrap, dueText, quoteText, wantsList } from "./bench/ticket";

export interface CardAction {
  text: string;
  variant?: Variant;
  testId: string;
  disabled?: boolean;
  w?: number;
  onClick: () => void;
}

export function orderCard(o: Order, opt: { w: number; h: number; state: GameState; catalog: Catalog; compact?: boolean; actions: CardAction[]; name?: string }): Control {
  const membrane = o.kind === "membrane";
  const p = panel({ w: opt.w, h: opt.h, radius: R.md, bg: membrane ? "#f3f0ff" : C.white, border: C.line, thickness: 2, shadow: false, name: opt.name ?? `order-${o.id}` });
  const inner = opt.w - 2 * S.md;
  const col = stack({ w: inner, x: S.md, y: S.sm, spacing: 4 });
  const head = stack({ horizontal: true, h: 26, spacing: 6 });
  head.addControl(label(o.customer.name, { size: T.h3 - 2, weight: 700, w: Math.min(inner * 0.5, 9 + o.customer.name.length * 10.5), h: 26 }));
  head.addControl(chip(t(`persona.${o.customer.persona}` as MessageKey), { bg: C.paper3, size: T.tiny, h: 22 }));
  if (membrane) head.addControl(chip(`🫧 ${t("orders.membrane")}`, { bg: "#dcd3ff", size: T.tiny, h: 22 }));
  col.addControl(head);
  // narrow cards (phones) stack the footer: pay & deadline, stock check, then the actions
  const narrow = opt.w < 560;
  const quoteH = opt.compact || narrow ? 38 : Math.max(40, opt.h - 172);
  col.addControl(label(`“${quoteText(o)}”`, { size: T.small, italic: true, color: C.inkSoft, w: inner, h: quoteH, ellipsis: true, valign: 0 }));
  if (!membrane && !opt.compact) col.addControl(chipsWrap(wantsList(o), narrow ? inner : inner - 300));
  p.addControl(col);
  // footer: pay + deadline + stock check, then actions
  const foot = stack({ horizontal: true, h: 40, spacing: S.sm, x: S.md, y: opt.compact || narrow ? -S.sm - 44 : -S.sm, va: V_BOTTOM });
  foot.addControl(label(membrane ? formatMoney(o.budget) : t("orders.pays", { money: formatMoney(o.budget) }), { size: T.body, weight: 700, color: C.good, w: membrane ? 70 : 118, h: 40 }));
  if (!membrane) {
    const due = dueText(o, opt.state.day);
    foot.addControl(chip(`📅 ${due.text}`, { bg: due.late ? C.bad : C.blueSoft, color: due.late ? C.white : C.blue, size: T.tiny + 1, h: 26 }));
    const miss = missingFor(o, opt.state.inventory, opt.catalog);
    const stockRow = narrow ? stack({ horizontal: true, h: 30, spacing: S.sm, x: S.md, y: -S.sm - 84, va: V_BOTTOM }) : foot;
    if (narrow) p.addControl(stockRow);
    stockRow.addControl(
      chip(miss.length ? `🛒 ${t("orders.stockMissing", { parts: miss.map((m) => t(`stock.cat.${m}` as MessageKey)).join(", ") })}` : t("orders.stockOk"), {
        bg: miss.length ? "#fff1d6" : C.goodSoft,
        color: miss.length ? C.ink : C.good,
        size: T.tiny + 1,
        h: 26,
      }),
    );
  }
  p.addControl(foot);
  const acts = stack({ horizontal: true, h: 40, spacing: S.xs, x: -S.sm, y: -S.sm, ha: 1, va: V_BOTTOM });
  const scale = narrow ? Math.min(1, (opt.w - 24) / opt.actions.reduce((t, a) => t + (a.w ?? 132) + S.xs, 0)) : 1;
  for (const a of opt.actions) acts.addControl(button(a.text, { w: Math.floor((a.w ?? 132) * scale), h: 38, size: "sm", variant: a.variant ?? "secondary", testId: a.testId, disabled: a.disabled, onClick: a.onClick }));
  p.addControl(acts);
  return p;
}
