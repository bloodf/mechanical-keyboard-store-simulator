/** Dev tool: play every sound effect (paged, no scrolling). */
import { play } from "../../audio/engine";
import { SFX, SFX_CATEGORIES, SFX_IDS } from "../../audio/library";
import { randomVoiceParams, type VoiceParams } from "../../audio/voice";
import { t, type MessageKey } from "../../i18n";
import { C, S, T } from "../theme";
import type { Ui } from "../ui";
import { button, group, H_CENTER, label, stack, V_BOTTOM } from "../widgets";

export function openSoundBoard(ui: Ui) {
  let cat = 0;
  let voice: VoiceParams = randomVoiceParams(Math.random);
  ui.modal({ w: 760, h: 600, name: "sound-board", dismissable: true }, (p, close) => {
    const render = () => {
      p.clearControls();
      p.addControl(label(t("soundBoard.title"), { size: T.h1, weight: 700, align: H_CENTER, y: S.lg, h: 44 }));
      const tabs = stack({ horizontal: true, h: 40, spacing: S.xs, y: 70, ha: H_CENTER });
      SFX_CATEGORIES.forEach((c, i) =>
        tabs.addControl(button(t(`sfx.cat.${c}` as MessageKey), { w: 86, h: 38, size: "sm", variant: i === cat ? "primary" : "secondary", testId: `sb-cat-${c}`, onClick: () => ((cat = i), render()) })),
      );
      p.addControl(tabs);
      const ids = SFX_IDS.filter((id) => SFX[id].category === SFX_CATEGORIES[cat]);
      const grid = group({ w: 690, h: 380, y: 130, ha: H_CENTER });
      ids.forEach((id, i) =>
        grid.addControl(
          button(t(`sfx.${id}` as MessageKey), {
            w: 220,
            h: 46,
            size: "sm",
            x: (i % 3) * 235,
            y: Math.floor(i / 3) * 56,
            testId: `sfx-${id}`,
            sound: false,
            onClick: () => play(id, { params: SFX_CATEGORIES[cat] === "customer" ? { voice } : {} }),
          }),
        ),
      );
      p.addControl(grid);
      const foot = stack({ horizontal: true, h: 52, spacing: S.md, y: -S.lg, ha: H_CENTER, va: V_BOTTOM });
      foot.addControl(button(t("soundBoard.newVoice"), { w: 260, testId: "sb-voice", onClick: () => ((voice = randomVoiceParams(Math.random)), play("voice.talk", { params: { voice } })) }));
      foot.addControl(button(t("soundBoard.close"), { w: 180, variant: "primary", testId: "sound-board-close", onClick: close }));
      p.addControl(foot);
      p.addControl(label(t("soundBoard.hint"), { size: T.tiny, color: C.inkFaint, align: H_CENTER, y: -82, va: V_BOTTOM, h: 18 }));
    };
    render();
  });
}
