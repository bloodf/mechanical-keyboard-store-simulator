/** Orders: new requests (accept / decline / membrane replies) and the accepted queue. */
import { play } from "../../audio/engine";
import { acceptOrder, declineOrder, explainMembrane, pitchMechanical } from "../../build/workshop";
import { ACCEPTED_MAX, type GameState } from "../../core/state";
import type { Catalog } from "../../data/catalog";
import { t } from "../../i18n";
import { openSheet, scrollList } from "../../gui/sheet";
import { C, S, T } from "../../gui/theme";
import type { Ui } from "../../gui/ui";
import { button, H_CENTER, label, stack } from "../../gui/widgets";
import { orderCard } from "../orderCard";

export interface OrdersOpts {
  state: GameState;
  catalog: Catalog;
  persist: () => void;
  onChanged: () => void;
  /** Start building an accepted order (only when the bench is free). */
  onStart: (id: string) => void;
  tab?: "new" | "accepted";
}

export function openOrders(ui: Ui, o: OrdersOpts) {
  let tab: "new" | "accepted" = o.tab ?? (o.state.offers.length ? "new" : "accepted");
  const s = o.state;
  const changed = () => {
    o.persist();
    o.onChanged();
  };
  const sheet = openSheet(ui, { name: "orders", title: () => `📋 ${t("orders.title")}` }, (body, area, rerender, close) => {
    const tabs = stack({ horizontal: true, h: 40, spacing: S.sm });
    const tw = Math.min(220, (area.w - S.sm) / 2);
    tabs.addControl(button(t("orders.tab.new", { count: s.offers.length }), { w: tw, h: 40, size: "sm", variant: tab === "new" ? "dark" : "secondary", testId: "orders-tab-new", onClick: () => ((tab = "new"), rerender()) }));
    tabs.addControl(button(t("orders.tab.accepted", { count: s.accepted.length + (s.activeBuild ? 1 : 0) }), { w: tw, h: 40, size: "sm", variant: tab === "accepted" ? "dark" : "secondary", testId: "orders-tab-accepted", onClick: () => ((tab = "accepted"), rerender()) }));
    body.addControl(tabs);
    const listH = area.h - 52;
    const { viewer, content } = scrollList(area.w, listH, "orders-list");
    viewer.top = "52px";
    body.addControl(viewer);
    const cw = area.w - 24;
    const ch = ui.portrait ? 296 : 188;
    const empty = (text: string) => content.addControl(label(text, { size: T.body, color: C.inkSoft, align: H_CENTER, h: 80, w: cw }));
    if (tab === "new") {
      if (!s.offers.length) empty(t("orders.emptyNew"));
      s.offers.forEach((ord, i) => {
        const full = s.accepted.length >= ACCEPTED_MAX;
        const actions =
          ord.kind === "membrane"
            ? [
                { text: t("orders.explain"), testId: `explain-${i}`, w: 170, onClick: () => replyDialog(ord.id) },
                {
                  text: t("orders.pitch"),
                  variant: "primary" as const,
                  testId: `pitch-${i}`,
                  w: 290,
                  onClick: () => {
                    pitchMechanical(s, ord.id, o.catalog);
                    play("ui.confirm");
                    changed();
                    rerender();
                  },
                },
              ]
            : [
                {
                  text: t("orders.decline"),
                  testId: `decline-${i}`,
                  onClick: () => {
                    declineOrder(s, ord.id);
                    play("ui.back");
                    changed();
                    rerender();
                  },
                },
                {
                  text: t("orders.accept"),
                  variant: "primary" as const,
                  testId: `accept-${i}`,
                  disabled: full,
                  onClick: () => {
                    if (!acceptOrder(s, ord.id)) return ui.toast(t("orders.full", { max: ACCEPTED_MAX }), "error");
                    play("ui.confirm");
                    changed();
                    rerender();
                  },
                },
              ];
        content.addControl(orderCard(ord, { w: cw, h: ch, state: s, catalog: o.catalog, actions, name: `offer-${i}` }));
      });
    } else {
      if (!s.accepted.length && !s.activeBuild) empty(t("orders.emptyAccepted"));
      if (s.activeBuild) content.addControl(orderCard(s.activeBuild.job, { w: cw, h: ch, state: s, catalog: o.catalog, actions: [{ text: `🛠 ${t("orders.onBench")}`, testId: "on-bench", disabled: true, w: 170, onClick: () => {} }] }));
      s.accepted.forEach((ord, i) => {
        content.addControl(
          orderCard(ord, {
            w: cw,
            h: ch,
            state: s,
            catalog: o.catalog,
            name: `accepted-${i}`,
            actions: [
              {
                text: `▶ ${t("ws.start")}`,
                variant: "primary",
                testId: `start-${i}`,
                disabled: !!s.activeBuild,
                w: 170,
                onClick: () => {
                  close();
                  o.onStart(ord.id);
                },
              },
            ],
          }),
        );
      });
    }
  });

  function replyDialog(id: string) {
    ui.modal({ w: 640, h: 420, name: "membrane-reply", dismissable: true }, (p, close) => {
      const col = stack({ w: "88%", y: S.xl, ha: H_CENTER, spacing: S.md });
      col.addControl(label(t("orders.replyTitle"), { size: T.h2, weight: 700, align: H_CENTER }));
      for (const r of [0, 1, 2]) {
        col.addControl(
          button(t(`orders.reply.${r}` as "orders.reply.0"), {
            w: "100%",
            h: 64,
            size: "sm",
            testId: `reply-${r}`,
            onClick: () => {
              explainMembrane(s, id, r);
              play("progress.reviewGood");
              close();
              changed();
              sheet.render();
            },
          }),
        );
      }
      p.addControl(col);
    });
  }
  return sheet;
}
