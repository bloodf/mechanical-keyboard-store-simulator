/** Title screen over the live shop (attract camera). */
import type { GameState } from "../../core/state";
import { formatMoney, t } from "../../i18n";
import { C, R, S, T } from "../theme";
import type { Ui } from "../ui";
import { button, H_CENTER, label, panel, stack, V_BOTTOM, V_CENTER } from "../widgets";

export interface TitleOpts {
  save: GameState | null;
  persistent: boolean;
  version: string;
  onContinue: () => void;
  onNew: () => void;
  onSettings: () => void;
}

export function showTitle(ui: Ui, o: TitleOpts) {
  const render = () => {
    const portrait = ui.portrait;
    const w = portrait ? ui.W - 2 * S.lg : 460;
    const btnH = 64;
    const rows = (o.save ? 1 : 0) + 2;
    const h = (portrait ? 150 : 230) + rows * (btnH + S.md) + 70 + (o.persistent ? 0 : 40);
    const p = panel({ w, h, x: portrait ? 0 : 56, y: portrait ? -S.lg : 0, ha: portrait ? H_CENTER : undefined, va: portrait ? V_BOTTOM : V_CENTER, radius: R.xl, name: "title-panel" });
    p.alpha = 0.97;
    const col = stack({ w: w - 2 * S.xl, y: S.xl, ha: H_CENTER, spacing: S.md });
    const logo = label(t("game.title"), { size: portrait ? 34 : 46, weight: 700, wrap: true, w: "100%", lineSpacing: portrait ? 2 : 4, color: C.ink });
    col.addControl(logo);
    col.addControl(label(t("game.tagline"), { size: T.h3, weight: 600, color: C.accent }));
    const gap = label("", { h: portrait ? 4 : 12 });
    col.addControl(gap);
    if (o.save) {
      col.addControl(
        button(t("title.continue"), { w: "100%", size: "lg", variant: "primary", testId: "btn-continue", sub: t("title.saveInfo", { day: o.save.day, money: formatMoney(o.save.money) }), onClick: o.onContinue }),
      );
    }
    col.addControl(button(t("title.newGame"), { w: "100%", size: "lg", variant: o.save ? "secondary" : "primary", testId: "btn-new", onClick: o.onNew }));
    col.addControl(button(t("settings.open"), { w: "100%", size: "lg", testId: "btn-settings", onClick: o.onSettings }));
    if (!o.persistent) col.addControl(label(t("title.noStorage"), { size: T.small, wrap: true, color: C.bad, weight: 600 }));
    p.addControl(col);
    p.addControl(label(t("title.version", { version: o.version }), { size: T.tiny, color: C.inkFaint, align: H_CENTER, y: -S.md, va: V_BOTTOM, h: 18 }));
    ui.setScreen(p);
  };
  render();
  return ui.onResize(render);
}

export function confirmNewGame(ui: Ui, onYes: () => void) {
  ui.confirm(t("title.confirmNew"), t("title.confirmYes"), t("title.confirmNo"), onYes, "confirm-new");
}
