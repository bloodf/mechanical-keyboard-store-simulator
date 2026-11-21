/** After shipping: payment, your own QA check of the build; the client's stars arrive later by mail. */
import type { BuildResult, ScoreComponent } from "../build/scoring";
import type { Order } from "../build/types";
import type { ShipOutcome } from "../build/workshop";
import { formatMoney, t, type MessageKey } from "../i18n";
import { C, S, T } from "../gui/theme";
import type { Ui } from "../gui/ui";
import { bar, button, group, H_CENTER, label, stack, V_BOTTOM } from "../gui/widgets";

export function showShipped(ui: Ui, job: Order, r: BuildResult, o: ShipOutcome, onOk: () => void) {
  ui.modal({ w: 540, h: 600, name: "results" }, (p, close) => {
    const cw = Math.min(450, ui.W - 70);
    const col = stack({ w: cw, y: S.xl, ha: H_CENTER, spacing: S.sm });
    col.addControl(label(`📦 ${t("result.shipped", { name: job.customer.name })}`, { size: T.h2, weight: 700, align: H_CENTER, wrap: true }));
    if (o.late) col.addControl(label(`⏰ ${t("result.late", { count: o.late })}`, { size: T.body, weight: 700, color: C.bad, align: H_CENTER }));
    col.addControl(label(t("result.reviewSoon"), { size: T.small, color: C.inkSoft, align: H_CENTER, wrap: true }));
    col.addControl(label("", { h: 4 }));
    for (const c of Object.keys(r.scores) as ScoreComponent[]) {
      const row = group({ w: cw, h: 24, name: `qa-${c}` });
      row.addControl(label(t(`result.component.${c}` as MessageKey), { size: T.small, weight: 700, w: 120 }));
      row.addControl(bar(r.scores[c], { w: cw - 180, x: 124, y: 7, thickness: 10, color: r.scores[c] > 0.8 ? C.good : r.scores[c] > 0.5 ? C.gold : C.bad }));
      row.addControl(label(`${Math.round(r.scores[c] * 100)}%`, { size: T.small, weight: 700, align: 1 }));
      col.addControl(row);
    }
    const money = (k: MessageKey, v: number, color?: string) => {
      const row = group({ w: cw, h: 26 });
      row.addControl(label(t(k), { size: T.body, weight: 600, color: C.inkSoft }));
      row.addControl(label((v >= 0 ? "+" : "−") + formatMoney(Math.abs(v)), { size: T.body, weight: 700, align: 1, color: color ?? C.ink }));
      col.addControl(row);
    };
    col.addControl(label("", { h: 6 }));
    money("result.pay", o.pay, C.good);
    if (o.tip) money("result.tip", o.tip, C.good);
    p.addControl(col);
    p.addControl(button(t("result.ok"), { w: 280, variant: "primary", size: "lg", y: -S.xl, ha: H_CENTER, va: V_BOTTOM, testId: "btn-next-customer", onClick: () => (close(), onOk()) }));
  });
}
