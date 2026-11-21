/** Workshop top bar: name & clock, Orders / Stock / Suppliers / Mail, money, reputation, close for today, menu. */
import type { Container } from "@babylonjs/gui";
import { formatClock, unreadCount } from "../../build/workshop";
import { nowAbs, type GameState } from "../../core/state";
import { formatMoney, formatNumber, t } from "../../i18n";
import { badge } from "../sheet";
import { C, R, S, T } from "../theme";
import type { Ui } from "../ui";
import { button, chip, group, H_CENTER, H_RIGHT, label, panel, stack } from "../widgets";

export interface HudOpts {
  state: GameState;
  onOrders: () => void;
  onStock: () => void;
  onSuppliers: () => void;
  onMail: () => void;
  onCloseDay: () => void;
  onMenu: () => void;
}

export interface WorkshopHud {
  root: Container;
  height: number;
  update(): void;
  dispose(): void;
}

export function createWorkshopHud(ui: Ui, o: HudOpts): WorkshopHud {
  const root = group({ name: "hud" });
  const hud: WorkshopHud = {
    root,
    height: 70,
    update: () => render(),
    dispose: () => {
      off();
      ui.hud.removeControl(root);
    },
  };
  const render = () => {
    root.clearControls();
    const s = o.state;
    const portrait = ui.portrait;
    const small = portrait || ui.W < 1360;
    hud.height = portrait ? 118 : 70;
    const bar = panel({ w: ui.W - 2 * S.sm, h: portrait ? 110 : 60, x: S.sm, y: S.sm, radius: R.lg, bg: "rgba(255,250,242,0.94)", name: "hud-bar" });
    root.addControl(bar);
    // left: workshop name + clock
    const left = stack({ w: small ? 170 : 250, x: S.lg, y: 6, spacing: 0 });
    left.addControl(label(s.profile.storeName || t("profile.defaultStore"), { size: small ? T.body : T.h3, weight: 700, h: small ? 24 : 28, name: "hud-store", ellipsis: true }));
    left.addControl(label(`🕘 ${t("ws.clock", { day: s.day, time: formatClock(s.minute) })}`, { size: T.small, weight: 600, color: s.minute >= 17 * 60 ? C.accentDark : C.inkSoft, h: 20, name: "hud-clock" }));
    bar.addControl(left);
    // center: navigation
    const nav = stack({ horizontal: true, h: 46, spacing: S.sm, x: portrait ? 0 : (small ? 200 : 280), y: portrait ? 56 : 7, ha: portrait ? H_CENTER : undefined });
    const now = nowAbs(s);
    const navBtn = (icon: string, text: string, id: string, n: number, onClick: () => void) => {
      const b = button(small ? icon : `${icon} ${text}`, { w: small ? 56 : 140, h: 44, size: "sm", variant: "secondary", testId: id, onClick });
      if (n > 0) b.addControl(badge(n, { name: `${id}-badge` }));
      b.clipChildren = false;
      b.clipContent = false;
      nav.addControl(b);
    };
    navBtn("📋", t("ws.nav.orders"), "nav-orders", s.offers.length, o.onOrders);
    navBtn("📦", t("ws.nav.stock"), "nav-stock", 0, o.onStock);
    navBtn("🛒", t("ws.nav.suppliers"), "nav-suppliers", s.shipments.filter((x) => x.arrives > now).length, o.onSuppliers);
    navBtn("✉️", t("ws.nav.mail"), "nav-mail", unreadCount(s), o.onMail);
    bar.addControl(nav);
    // right: money, reputation, close for today, menu
    const right = stack({ horizontal: true, h: 46, spacing: S.sm, x: -S.md, y: 7, ha: H_RIGHT });
    right.addControl(chip(formatMoney(s.money), { bg: C.white, color: s.money >= 0 ? C.good : C.bad, size: small ? T.body : T.h3, h: 38, name: "hud-money" }));
    right.addControl(chip(`★ ${formatNumber(s.reputation / 100, 1)}`, { bg: C.white, color: C.gold, size: small ? T.body : T.h3, h: 38, name: "hud-rep" }));
    if (s.flags.knownCheater) right.addControl(chip("🤡", { bg: C.white, size: T.h3, h: 38 }));
    right.addControl(button(small ? "🌙" : `🌙 ${t("ws.nav.close")}`, { w: small ? 48 : 170, h: 44, size: "sm", variant: s.minute >= 17 * 60 ? "primary" : "secondary", testId: "nav-closeday", onClick: o.onCloseDay }));
    right.addControl(button("☰", { w: 48, h: 44, size: "sm", variant: "dark", testId: "nav-menu", onClick: o.onMenu }));
    bar.addControl(right);
  };
  render();
  const off = ui.onResize(render);
  ui.hud.addControl(root);
  return hud;
}
