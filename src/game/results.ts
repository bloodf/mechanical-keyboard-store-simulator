/** Delivery results: stars, the customer's reaction, score bars, money. */
import type { BuildResult, ScoreComponent } from "../build/scoring";
import type { JobRequest } from "../build/types";
import { formatMoney, formatNumber, t, tx, type MessageKey } from "../i18n";
import { C, S, T } from "../gui/theme";
import type { Ui } from "../gui/ui";
import { bar, button, group, H_CENTER, label, stack, V_BOTTOM } from "../gui/widgets";

export function showResults(ui: Ui, job: JobRequest, r: BuildResult, onNext: () => void) {
  const reaction = tx(`result.reaction.${r.mood}.${Math.floor(Math.random() * 3)}`);
  const complaint = r.stars <= 3 ? " " + tx(`result.complaint.${r.worst}`) : "";
  ui.modal({ w: 560, h: 640, name: "results" }, (p, close) => {
    const cw = Math.min(470, ui.W - 70);
    const col = stack({ w: cw, y: S.xl, ha: H_CENTER, spacing: S.sm });
    col.addControl(label(t("result.title", { name: job.customer.name }), { size: T.h2, weight: 700, align: H_CENTER, wrap: true }));
    const stars = label([1, 2, 3, 4, 5].map((i) => (i <= r.stars ? "★" : "☆")).join(" "), { size: 50, weight: 700, color: C.gold, outline: "#c98a00", outlineWidth: 3, align: H_CENTER, h: 64, name: "result-stars" });
    (stars as unknown as { metadata: unknown }).metadata = { stars: r.stars };
    col.addControl(stars);
    col.addControl(label(`“${reaction}${complaint}”`, { size: T.h3, italic: true, weight: 500, align: H_CENTER, wrap: true }));
    for (const c of Object.keys(r.scores) as ScoreComponent[]) {
      const row = group({ w: cw, h: 24 });
      row.addControl(label(t(`result.component.${c}` as MessageKey), { size: T.small, weight: 700, w: 120 }));
      row.addControl(bar(r.scores[c], { w: cw - 180, x: 124, y: 7, thickness: 10, color: r.scores[c] > 0.8 ? C.good : r.scores[c] > 0.5 ? C.gold : C.bad }));
      row.addControl(label(`${Math.round(r.scores[c] * 100)}%`, { size: T.small, weight: 700, align: 1 }));
      col.addControl(row);
    }
    const money = (k: MessageKey, v: number, color?: string) => {
      const row = group({ w: cw, h: 24 });
      row.addControl(label(t(k), { size: T.body, weight: 600, color: C.inkSoft }));
      row.addControl(label((v >= 0 ? "+" : "−") + formatMoney(Math.abs(v)), { size: T.body, weight: 700, align: 1, color: color ?? C.ink }));
      col.addControl(row);
    };
    col.addControl(label("", { h: 4 }));
    money("result.pay", r.pay);
    money("result.tip", r.tip);
    money("result.parts", -r.partsCost);
    money("result.profit", r.profit, r.profit >= 0 ? C.good : C.bad);
    const rep = group({ w: cw, h: 24 });
    rep.addControl(label(t("result.rep"), { size: T.body, weight: 600, color: C.inkSoft }));
    rep.addControl(label(`${r.repDelta >= 0 ? "+" : "−"}${formatNumber(Math.abs(r.repDelta) / 100, 2)} ★`, { size: T.body, weight: 700, align: 1, color: r.repDelta >= 0 ? C.good : C.bad }));
    col.addControl(rep);
    p.addControl(col);
    p.addControl(button(t("result.next"), { w: 260, variant: "primary", size: "lg", y: -S.xl, ha: H_CENTER, va: V_BOTTOM, testId: "btn-next-customer", onClick: () => (close(), onNext()) }));
  });
}
