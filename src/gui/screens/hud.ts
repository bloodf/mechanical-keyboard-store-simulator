/** In-store HUD: store plate, money, buttons, interaction prompt, active job, touch joystick. */
import { Ellipse, type Control } from "@babylonjs/gui";
import type { GameState } from "../../core/state";
import type { InteractId } from "../../engine/store/storeBuilder";
import type { MoveInput } from "../../engine/store/player";
import { formatMoney, formatNumber, t, type MessageKey } from "../../i18n";
import { C, R, S, T } from "../theme";
import type { Ui } from "../ui";
import { button, chip, drawBox, group, H_CENTER, H_RIGHT, label, panel, rrect, stack, V_BOTTOM, V_CENTER } from "../widgets";

export interface HudOpts {
  state: GameState;
  touch: boolean;
  stick: MoveInput;
  onProfile: () => void;
  onSettings: () => void;
  onMenu: () => void;
  onJobs: () => void;
  onInteract: () => void;
}

export interface Hud {
  root: Control;
  update(): void;
  setPrompt(id: InteractId | null): void;
  setJob(text: string | null): void;
  showHint(on: boolean): void;
  dispose(): void;
}

export function createHud(ui: Ui, o: HudOpts): Hud {
  const root = group({ name: "hud" });
  root.isPointerBlocker = false;
  let prompt: InteractId | null = null;
  let jobText: string | null = null;
  let hintOn = true;

  const build = () => {
    root.clearControls();
    const s = o.state;
    const small = ui.portrait || ui.compact;
    // Store plate (top-left)
    const plateW = small ? 186 : 270;
    const plate = panel({ w: plateW, h: small ? 62 : 72, x: S.lg, y: S.lg, radius: R.lg, name: "hud-plate" });
    plate.addControl(label(s.profile.storeName || t("profile.defaultStore"), { size: small ? T.body : T.h3, weight: 700, x: S.lg, y: small ? 8 : 10, w: plateW - 2 * S.lg, h: small ? 24 : 28, name: "hud-store" }));
    plate.addControl(
      label(`${t("hud.day", { day: s.day })}  ·  ${t("hud.reputation", { stars: formatNumber(s.reputation / 100, 1) })}`, {
        size: T.small,
        weight: 600,
        color: C.inkSoft,
        x: S.lg,
        y: small ? 34 : 40,
        w: plateW - 2 * S.lg,
        h: 20,
        name: "hud-day",
      }),
    );
    root.addControl(plate);
    const money = chip(formatMoney(s.money), { x: S.lg, y: S.lg + (small ? 70 : 82), bg: C.paper, color: C.good, size: small ? T.body : T.h3, name: "hud-money" });
    money.shadowColor = C.shadow;
    money.shadowBlur = 10;
    money.shadowOffsetY = 3;
    root.addControl(money);
    if (s.flags.knownCheater) {
      const badge = chip(t("hud.cheaterBadge"), { x: S.lg, y: S.lg + (small ? 114 : 134), bg: "#ffe14d", size: T.small, name: "hud-badge" });
      badge.rotation = -0.04;
      root.addControl(badge);
    }
    // Buttons (top-right)
    const bw = small ? 44 : 52;
    const btns = stack({ horizontal: true, h: bw, spacing: small ? 6 : S.sm, x: -S.lg, y: S.lg, ha: H_RIGHT });
    const hb = (icon: string, id: string, f: () => void) => btns.addControl(button(icon, { w: bw, h: bw, size: small ? "sm" : "md", testId: id, onClick: f }));
    hb("📋", "hud-jobs", o.onJobs);
    hb("👤", "hud-profile", o.onProfile);
    hb("⚙", "hud-settings", o.onSettings);
    hb("☰", "hud-menu", o.onMenu);
    root.addControl(btns);
    // Active job (top-center)
    if (jobText) {
      const j = chip(`🧾 ${jobText}`, { y: small ? S.lg + 128 : S.lg + 8, ha: small ? undefined : H_CENTER, x: small ? S.lg : 0, bg: C.dark, color: C.white, size: T.small, name: "hud-job" });
      if (small) j.top = `${S.lg + (s.flags.knownCheater ? 160 : 124)}px`;
      root.addControl(j);
    }
    // Interaction prompt (bottom-center), clickable too
    if (prompt) {
      const text = t(`interact.${prompt}` as MessageKey);
      const w = Math.min(ui.W - 2 * S.lg, 120 + text.length * 11);
      const pr = panel({ w, h: 66, y: o.touch ? -190 : -S.xxl, ha: H_CENTER, va: V_BOTTOM, bg: C.dark, radius: R.lg, name: "hud-prompt" });
      pr.hoverCursor = "pointer";
      pr.onPointerClickObservable.add(() => o.onInteract());
      const key = drawBox(
        (g, x, y, w2, h2, k) => {
          g.fillStyle = "#8a7a6a";
          rrect(g, x, y + 5 * k, w2, h2 - 5 * k, 8 * k);
          g.fill();
          g.fillStyle = C.paper;
          rrect(g, x, y, w2, h2 - 6 * k, 8 * k);
          g.fill();
          g.fillStyle = C.ink;
          g.font = `700 ${20 * k}px Fredoka, sans-serif`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(o.touch ? "👆" : t("interact.key"), x + w2 / 2, y + (h2 - 6 * k) / 2 + 1);
        },
        { w: 44, h: 46, x: S.md, va: V_CENTER },
      );
      pr.addControl(key);
      pr.addControl(label(text, { size: T.h3, weight: 700, color: C.white, x: 70, w: w - 80, va: V_CENTER }));
      root.addControl(pr);
    }
    if (hintOn && !prompt) {
      root.addControl(label(t(o.touch ? "hud.hintMoveTouch" : "hud.hintMove"), { size: T.small, weight: 600, color: C.white, outline: "rgba(0,0,0,0.55)", outlineWidth: 4, align: H_CENTER, y: -S.lg, va: V_BOTTOM, h: 24 }));
    }
    if (o.touch) root.addControl(joystick());
  };

  const joystick = (): Control => {
    const size = 150;
    const base = new Ellipse("joystick");
    base.width = base.height = `${size}px`;
    base.thickness = 4;
    base.color = "rgba(255,255,255,0.5)";
    base.background = "rgba(30,20,10,0.25)";
    base.horizontalAlignment = 0;
    base.verticalAlignment = V_BOTTOM;
    base.left = `${S.xl}px`;
    base.top = `${-S.xl}px`;
    base.isPointerBlocker = true;
    const thumb = new Ellipse("joystick-thumb");
    thumb.width = thumb.height = "64px";
    thumb.thickness = 0;
    thumb.background = "rgba(255,250,242,0.9)";
    thumb.isPointerBlocker = false;
    base.addControl(thumb);
    let active = false;
    const setFrom = (x: number, y: number) => {
      const m = base._currentMeasure;
      const cx = m.left + m.width / 2;
      const cy = m.top + m.height / 2;
      const r = m.width / 2;
      let dx = (x - cx) / r;
      let dy = (y - cy) / r;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      const k = size / 2 - 32;
      thumb.left = `${dx * k}px`;
      thumb.top = `${dy * k}px`;
      o.stick.x = dx;
      o.stick.y = -dy;
      o.stick.run = len > 0.95;
    };
    base.onPointerDownObservable.add((v) => {
      active = true;
      setFrom(v.x, v.y);
    });
    base.onPointerMoveObservable.add((v) => active && setFrom(v.x, v.y));
    base.onPointerUpObservable.add(() => {
      active = false;
      thumb.left = thumb.top = "0px";
      o.stick.x = o.stick.y = 0;
      o.stick.run = false;
    });
    return base;
  };

  build();
  const off = ui.onResize(build);
  return {
    root,
    update: build,
    setPrompt(id) {
      if (id === prompt) return;
      prompt = id;
      build();
    },
    setJob(text) {
      jobText = text;
      build();
    },
    showHint(on) {
      hintOn = on;
      build();
    },
    dispose() {
      off();
      root.dispose();
    },
  };
}

