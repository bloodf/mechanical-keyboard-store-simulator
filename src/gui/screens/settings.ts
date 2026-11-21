/** Settings modal: sound volumes (no music — effects only) and graphics quality. */
import { BUSES, getAudioSettings, play, setAudioSettings, type Bus } from "../../audio/engine";
import type { SfxId } from "../../audio/library";
import type { GameApp, Quality } from "../../engine/app";
import { t, type MessageKey } from "../../i18n";
import { C, S, T } from "../theme";
import type { Ui } from "../ui";
import { button, H_CENTER, label, rule, slider, stack, V_BOTTOM } from "../widgets";

const SAMPLE: Record<Bus, SfxId> = { ui: "ui.click", world: "shop.boxDrop", voice: "voice.talk", keyboard: "kb.thock" };

export function openSettings(ui: Ui, app: GameApp) {
  const s = getAudioSettings();
  let timer = 0;
  const sample = (id: SfxId) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => play(id), 140);
  };
  ui.modal({ w: 560, h: 590, name: "settings", dismissable: true }, (p, close) => {
    const col = stack({ w: "88%", y: S.xl, ha: H_CENTER, spacing: S.sm });
    col.addControl(label(t("settings.title"), { size: T.h1, weight: 700, align: H_CENTER, h: 44 }));
    col.addControl(label(t("settings.audio"), { size: T.h3, weight: 700, color: C.inkSoft, h: 32 }));
    const row = (key: MessageKey, value: number, id: string, on: (v: number) => void) => {
      const r = stack({ horizontal: true, h: 44, spacing: S.md });
      r.addControl(label(t(key), { w: 190, size: T.body, weight: 600 }));
      r.addControl(slider(value, { w: 250, testId: id, onChange: on }));
      col.addControl(r);
    };
    row("settings.master", s.master, "vol-master", (v) => (setAudioSettings({ master: v }), sample("ui.confirm")));
    for (const b of BUSES.filter((x) => x !== "voice")) row(`settings.bus.${b}` as MessageKey, s[b], `vol-${b}`, (v) => (setAudioSettings({ [b]: v }), sample(SAMPLE[b])));
    const mute = button(s.muted ? `🔇 ${t("settings.mute")}` : `🔊 ${t("settings.mute")}`, {
      w: 260,
      size: "sm",
      variant: s.muted ? "dark" : "secondary",
      testId: "vol-mute",
      onClick: () => {
        const m = !getAudioSettings().muted;
        setAudioSettings({ muted: m });
        mute.setLabel(m ? `🔇 ${t("settings.mute")}` : `🔊 ${t("settings.mute")}`);
        mute.setVariant(m ? "dark" : "secondary");
      },
    });
    col.addControl(mute);
    col.addControl(rule({ h: 2, y: 0 }));
    col.addControl(label(t("settings.graphics"), { size: T.h3, weight: 700, color: C.inkSoft, h: 32 }));
    const q = stack({ horizontal: true, h: 48, spacing: S.sm });
    const qs: Quality[] = ["low", "medium", "high"];
    const btns = qs.map((qq) =>
      button(t(`settings.quality.${qq}` as MessageKey), {
        w: 140,
        size: "sm",
        variant: app.quality === qq ? "primary" : "secondary",
        testId: `quality-${qq}`,
        onClick: () => {
          app.setQuality(qq);
          btns.forEach((b, i) => b.setVariant(qs[i] === qq ? "primary" : "secondary"));
        },
      }),
    );
    btns.forEach((b) => q.addControl(b));
    col.addControl(q);
    col.addControl(label(t("settings.qualityHint"), { size: T.small, color: C.inkFaint, h: 22 }));
    p.addControl(col);
    p.addControl(button(t("settings.close"), { w: 200, variant: "primary", testId: "settings-close", y: -S.xl, ha: H_CENTER, va: V_BOTTOM, onClick: close }));
  });
}
