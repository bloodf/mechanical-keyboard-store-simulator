/**
 * Profile editor: your name, the store name, and the avatar. The 3D technician (in front of the
 * mirror) updates live. Used for first-time character creation and later edits.
 */
import { Rectangle } from "@babylonjs/gui";
import { Rng } from "../../core/rng";
import {
  BROWS,
  CLOTH_COLORS,
  cleanName,
  EYE_COLORS,
  FACIAL_HAIR,
  GLASSES,
  HAIR_COLORS,
  HAIR_STYLES,
  HATS,
  NAME_MAX,
  PANTS_COLORS,
  randomAvatar,
  SHOE_COLORS,
  SKIN_TONES,
  STORE_NAME_MAX,
  TOPS,
  type AvatarParams,
} from "../../data/avatar";
import { t, type MessageKey } from "../../i18n";
import { C, R, S, T } from "../theme";
import type { Ui } from "../ui";
import { button, group, H_CENTER, H_RIGHT, label, panel, slider, stack, stepper, swatch, textInput, V_BOTTOM } from "../widgets";

type Tab = "you" | "body" | "hair" | "outfit" | "extras";
const TABS: Tab[] = ["you", "body", "hair", "outfit", "extras"];
const APRON_COLORS = ["#2d6a4f", "#1e3a5f", "#7a2e2e", "#3b3028", "#c0392b", "#8e44ad", "#f1c40f", "#e84393"];

export interface ProfileEditorOpts {
  first: boolean;
  name: string;
  storeName: string;
  avatar: AvatarParams;
  /** Called live while editing (preview). */
  onAvatar: (a: AvatarParams) => void;
  onStoreName: (s: string) => void;
  onDone: (p: { name: string; storeName: string; avatar: AvatarParams }) => void;
  /** Reports the screen area the panel covers so the camera can frame the avatar next to it. */
  onInsets: (left: number, top: number, bottom: number, right: number) => void;
}

export function showProfileEditor(ui: Ui, o: ProfileEditorOpts): () => void {
  let tab: Tab = "you";
  let a: AvatarParams = { ...o.avatar };
  let name = o.name;
  let store = o.storeName;
  let rebuildTimer = 0;
  const preview = () => {
    clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(() => o.onAvatar({ ...a }), 60);
  };
  const set = <K extends keyof AvatarParams>(k: K, v: AvatarParams[K]) => {
    a = { ...a, [k]: v };
    preview();
  };

  const render = () => {
    const portrait = ui.portrait;
    const pw = portrait ? ui.W - 2 * S.md : Math.min(480, ui.W * 0.42);
    const ph = portrait ? Math.min(ui.H * 0.62, 600) : ui.H - 2 * S.lg;
    const p = panel({ w: pw, h: ph, x: portrait ? 0 : -S.lg, y: portrait ? -S.md : S.lg, ha: portrait ? H_CENTER : H_RIGHT, va: portrait ? V_BOTTOM : undefined, radius: R.xl, name: "profile-panel" });
    const inner = pw - 2 * S.xl;
    // Header
    p.addControl(label(t(o.first ? "profile.createTitle" : "profile.editTitle"), { size: portrait ? T.h2 : T.h1, weight: 700, x: S.xl, y: S.lg, w: inner, h: 40 }));
    // Tabs
    const tabs = stack({ horizontal: true, h: 40, spacing: S.xs, x: S.xl - 2, y: S.lg + 48 });
    const tw = Math.floor((inner + 4 - S.xs * 4) / 5);
    for (const tb of TABS) {
      tabs.addControl(
        button(t(`profile.tab.${tb}${portrait && tb === "hair" ? "Short" : ""}` as MessageKey), {
          w: tw,
          h: 40,
          size: "sm",
          variant: tab === tb ? "primary" : "secondary",
          testId: `ptab-${tb}`,
          onClick: () => {
            tab = tb;
            render();
          },
        }),
      );
    }
    p.addControl(tabs);
    // Content area
    const top = S.lg + 48 + 40 + S.lg;
    const footH = 64 + S.lg;
    const content = group({ w: inner, h: ph - top - footH, x: S.xl, y: top });
    content.addControl(buildTab(inner, ph - top - footH));
    p.addControl(content);
    // Footer
    const foot = stack({ horizontal: true, h: 56, spacing: S.md, y: -S.lg, ha: H_CENTER, va: V_BOTTOM });
    foot.addControl(
      button(t("profile.randomize"), {
        w: (inner - S.md) / 2,
        testId: "profile-random",
        onClick: () => {
          const r = new Rng(String(Math.random()));
          a = { ...randomAvatar(() => r.next()), apron: a.apron, apronColor: a.apronColor };
          preview();
          render();
        },
      }),
    );
    foot.addControl(
      button(t(o.first ? "profile.start" : "profile.done"), {
        w: (inner - S.md) / 2,
        variant: "primary",
        testId: "profile-done",
        onClick: () => {
          close();
          o.onDone({ name: cleanName(name, NAME_MAX) || t("profile.defaultName"), storeName: cleanName(store, STORE_NAME_MAX) || t("profile.defaultStore"), avatar: a });
        },
      }),
    );
    p.addControl(foot);
    ui.setScreen(p);
    // report insets (CSS px) so the avatar stays visible
    requestAnimationFrame(() => {
      const m = p._currentMeasure;
      const canvas = ui.adt.getScene()!.getEngine().getRenderingCanvas()!;
      const k = canvas.clientWidth / ui.adt.getScene()!.getEngine().getRenderWidth();
      if (portrait) o.onInsets(0, 80, canvas.clientHeight - m.top * k, 0);
      else o.onInsets(0, 0, 0, canvas.clientWidth - m.left * k);
    });
  };

  // ---- tab builders ----
  const rowLabel = (key: MessageKey) => label(t(key), { size: T.small, weight: 700, color: C.inkSoft, h: 22 });
  const swatches = (colors: string[], value: string, w: number, onPick: (c: string) => void, id: string) => {
    const size = ui.portrait ? 30 : 34;
    const gap = ui.portrait ? 7 : 8;
    const per = Math.max(1, Math.floor((w + gap) / (size + gap)));
    const rows = Math.ceil(colors.length / per);
    const c = group({ w, h: rows * (size + gap) });
    colors.forEach((col, i) => {
      c.addControl(
        swatch(col, col.toLowerCase() === value.toLowerCase(), {
          x: (i % per) * (size + gap),
          y: Math.floor(i / per) * (size + gap),
          size,
          testId: `${id}-${i}`,
          onClick: () => {
            onPick(col);
            render();
          },
        }),
      );
    });
    return c;
  };
  const pickFrom = <T extends string>(list: readonly T[], value: T, key: (v: T) => MessageKey, id: string, w: number, on: (v: T) => void) =>
    stepper(
      list.map((v) => t(key(v))),
      Math.max(0, list.indexOf(value)),
      { w, h: 44, testId: id, onChange: (i) => on(list[i]) },
    );

  function buildTab(w: number, h: number): Rectangle {
    const box = new Rectangle("ptab-content");
    box.thickness = 0;
    box.width = `${w}px`;
    box.height = `${h}px`;
    box.horizontalAlignment = 0;
    box.verticalAlignment = 0;
    const col = stack({ w, spacing: ui.portrait ? 4 : S.sm });
    const add = (...cs: Parameters<typeof col.addControl>[0][]) => cs.forEach((c) => col.addControl(c));
    const onOff = (v: boolean) => (v ? 1 : 0);
    switch (tab) {
      case "you":
        add(rowLabel("profile.name"), textInput(name, { w, maxLength: NAME_MAX, placeholder: t("profile.namePlaceholder"), testId: "input-name", onChange: (v) => (name = v) }));
        add(label("", { h: 6 }));
        add(
          rowLabel("profile.store"),
          textInput(store, {
            w,
            maxLength: STORE_NAME_MAX,
            placeholder: t("profile.storePlaceholder"),
            testId: "input-store",
            onChange: (v) => {
              store = v;
              o.onStoreName(cleanName(v, STORE_NAME_MAX) || t("profile.defaultStore"));
            },
          }),
          label(t("profile.storeHint"), { size: T.small, color: C.inkFaint, h: 22 }),
        );
        break;
      case "body":
        add(rowLabel("profile.height"), slider((a.height - 0.9) / 0.2, { w, testId: "sl-height", onChange: (v) => set("height", 0.9 + v * 0.2) }));
        add(rowLabel("profile.build"), slider(a.build, { w, testId: "sl-build", onChange: (v) => set("build", v) }));
        add(rowLabel("profile.skin"), swatches(SKIN_TONES, a.skin, w, (c) => set("skin", c), "sw-skin"));
        add(rowLabel("profile.eyes"), swatches(EYE_COLORS, a.eyeColor, w, (c) => set("eyeColor", c), "sw-eyes"));
        break;
      case "hair":
        add(rowLabel("profile.hairStyle"), pickFrom(HAIR_STYLES, a.hairStyle, (v) => `avatar.hair.${v}` as MessageKey, "st-hair", w, (v) => set("hairStyle", v)));
        add(rowLabel("profile.hairColor"), swatches(HAIR_COLORS, a.hairColor, w, (c) => set("hairColor", c), "sw-hair"));
        {
          const r = stack({ horizontal: true, h: 70, spacing: S.md });
          const half = (w - S.md) / 2;
          const c1 = stack({ w: half, spacing: 2 });
          c1.addControl(rowLabel("profile.brows"));
          c1.addControl(pickFrom(BROWS, a.brows, (v) => `avatar.brows.${v}` as MessageKey, "st-brows", half, (v) => set("brows", v)));
          const c2 = stack({ w: half, spacing: 2 });
          c2.addControl(rowLabel("profile.facialHair"));
          c2.addControl(pickFrom(FACIAL_HAIR, a.facialHair, (v) => `avatar.facial.${v}` as MessageKey, "st-facial", half, (v) => set("facialHair", v)));
          r.addControl(c1);
          r.addControl(c2);
          add(r);
        }
        break;
      case "outfit":
        add(rowLabel("profile.top"), pickFrom(TOPS, a.top, (v) => `avatar.top.${v}` as MessageKey, "st-top", w, (v) => set("top", v)));
        add(rowLabel("profile.topColor"), swatches(CLOTH_COLORS, a.topColor, w, (c) => set("topColor", c), "sw-top"));
        add(rowLabel("profile.pants"), swatches(PANTS_COLORS, a.pantsColor, w, (c) => set("pantsColor", c), "sw-pants"));
        add(rowLabel("profile.shoes"), swatches(SHOE_COLORS, a.shoeColor, w, (c) => set("shoeColor", c), "sw-shoes"));
        break;
      case "extras": {
        const half = (w - S.md) / 2;
        const r1 = stack({ horizontal: true, h: 70, spacing: S.md });
        const ap = stack({ w: half, spacing: 2 });
        ap.addControl(rowLabel("profile.apron"));
        ap.addControl(stepper([t("profile.off"), t("profile.on")], onOff(a.apron), { w: half, h: 44, testId: "st-apron", onChange: (i) => (set("apron", i === 1), render()) }));
        const hp = stack({ w: half, spacing: 2 });
        hp.addControl(rowLabel("profile.headphones"));
        hp.addControl(stepper([t("profile.off"), t("profile.on")], onOff(a.headphones), { w: half, h: 44, testId: "st-headphones", onChange: (i) => set("headphones", i === 1) }));
        r1.addControl(ap);
        r1.addControl(hp);
        add(r1);
        if (a.apron) add(rowLabel("profile.apronColor"), swatches(APRON_COLORS, a.apronColor, w, (c) => set("apronColor", c), "sw-apron"));
        const r2 = stack({ horizontal: true, h: 70, spacing: S.md });
        const gl = stack({ w: half, spacing: 2 });
        gl.addControl(rowLabel("profile.glasses"));
        gl.addControl(pickFrom(GLASSES, a.glasses, (v) => `avatar.glasses.${v}` as MessageKey, "st-glasses", half, (v) => set("glasses", v)));
        const ht = stack({ w: half, spacing: 2 });
        ht.addControl(rowLabel("profile.hat"));
        ht.addControl(pickFrom(HATS, a.hat, (v) => `avatar.hat.${v}` as MessageKey, "st-hat", half, (v) => (set("hat", v), render())));
        r2.addControl(gl);
        r2.addControl(ht);
        add(r2);
        if (a.hat !== "none") add(rowLabel("profile.hatColor"), swatches(CLOTH_COLORS, a.hatColor, w, (c) => set("hatColor", c), "sw-hat"));
        break;
      }
    }
    box.addControl(col);
    return box;
  }

  render();
  const off = ui.onResize(render);
  const close = () => {
    off();
    clearTimeout(rebuildTimer);
  };
  return close;
}
