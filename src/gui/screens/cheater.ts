/** CHEATER DETECTED overlay (text in the canvas) with the fake "Keyboard Police" report. */
import { play, unlockAudio } from "../../audio/engine";
import { t } from "../../i18n";
import { C, S, T } from "../theme";
import type { Ui } from "../ui";
import { bar, button, group, H_CENTER, label, stack, V_BOTTOM } from "../widgets";

export function showCheater(ui: Ui, cheatCount: number, onStartOver: () => void) {
  const jokes = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5).slice(0, 2);
  let progress = 0;
  let done = false;
  const caseNo = 10000 + Math.floor(Math.random() * 89999);
  const render = () => {
    const root = group({ name: "cheater-screen" });
    const title = label(t("cheater.title"), { size: ui.portrait ? 52 : 86, weight: 700, color: "#ff2d4a", outline: "#2050ff", outlineWidth: 10, align: H_CENTER, y: S.xl, h: ui.portrait ? 140 : 110, wrap: ui.portrait, name: "cheater-title" });
    root.addControl(title);
    const col = stack({ w: Math.min(640, ui.W - 40), y: -S.xl, ha: H_CENTER, va: V_BOTTOM, spacing: S.sm });
    col.addControl(label(t("cheater.subtitle"), { size: T.h3, weight: 700, color: C.white, align: H_CENTER, wrap: true }));
    for (const j of jokes) col.addControl(label("• " + t(`cheater.jokes.${j}` as "cheater.jokes.0"), { size: T.body, weight: 600, color: "#f3e6ea", align: H_CENTER, wrap: true }));
    col.addControl(label(t("cheater.count", { count: cheatCount }), { size: T.body, weight: 700, color: "#ffe14d", align: H_CENTER }));
    const b = bar(0, { thickness: 16, color: "#ff2d4a", bg: "rgba(255,255,255,0.18)", ha: H_CENTER });
    col.addControl(b);
    const status = label(t("cheater.reporting"), { size: T.body, weight: 600, color: C.white, align: H_CENTER, name: "cheater-status" });
    col.addControl(status);
    const btn = button(t("cheater.startOver"), {
      w: 340,
      size: "lg",
      variant: "danger",
      testId: "btn-start-over",
      ha: H_CENTER,
      onClick: () => {
        unlockAudio();
        play("cheat.trombone");
        btn.disabled = true;
        setTimeout(onStartOver, 600);
      },
    });
    btn.isVisible = done;
    col.addControl(btn);
    root.addControl(col);
    ui.setScreen(root);
    return { b, status, btn, title };
  };
  let els = render();
  const off = ui.onResize(() => (els = render()));
  let played = false;
  const playOnce = () => {
    if (played) return;
    played = true;
    unlockAudio();
    play("cheat.siren");
    play("cheat.buzzer", { delay: 1.7 });
  };
  window.addEventListener("pointerdown", playOnce, { once: true });
  window.addEventListener("keydown", playOnce, { once: true });
  playOnce();
  const start = performance.now();
  const tick = () => {
    const p = Math.min(1, (performance.now() - start) / 3200);
    progress = p < 0.85 ? (p / 0.85) * 0.99 : 0.99; // stalls at 99% for comedy
    (els.b.children[0] as { width: string }).width = `${(p >= 1 ? 1 : progress) * 100}%`;
    els.title.rotation = Math.sin(performance.now() / 40) * 0.012;
    if (p < 1) requestAnimationFrame(tick);
    else {
      done = true;
      els.status.text = t("cheater.reportingDone", { caseNo });
      els.btn.isVisible = true;
      off();
    }
  };
  requestAnimationFrame(tick);
}
