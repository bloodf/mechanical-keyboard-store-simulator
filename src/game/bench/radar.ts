/** Radar chart painter: build's sound profile vs the customer's target ranges. */
import type { KeySoundProfile } from "../../audio/keyPress";
import { AXES, type Axis, type Range } from "../../build/profile";
import { t, type MessageKey } from "../../i18n";
import { FONT } from "../../gui/theme";
import type { Painter } from "../../gui/widgets";

export function radarPainter(get: () => { profile: KeySoundProfile | null; target: Partial<Record<Axis, Range>> }, labels = true): Painter {
  return (g, x, y, w, h, k) => {
    const { profile, target } = get();
    const cx = x + w / 2;
    const cy = y + h / 2 + (labels ? 4 * k : 0);
    const R = Math.min(w, h) / 2 - (labels ? 30 * k : 6 * k);
    const n = AXES.length;
    const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
    const pt = (i: number, r: number): [number, number] => [cx + Math.cos(ang(i)) * r * R, cy + Math.sin(ang(i)) * r * R];
    g.strokeStyle = "rgba(60,40,20,0.15)";
    g.lineWidth = 1 * k;
    for (const ring of [0.25, 0.5, 0.75, 1]) {
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const [px, py] = pt(i % n, ring);
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
    }
    for (let i = 0; i < n; i++) {
      const [px, py] = pt(i, 1);
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(px, py);
      g.stroke();
    }
    g.lineCap = "round";
    AXES.forEach((a, i) => {
      const r = target[a];
      if (!r) return;
      const [x0, y0] = pt(i, Math.max(0.02, r[0]));
      const [x1, y1] = pt(i, Math.min(1, r[1]));
      g.strokeStyle = "rgba(46,160,90,0.55)";
      g.lineWidth = 10 * k;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    });
    if (profile) {
      g.beginPath();
      AXES.forEach((a, i) => {
        const [px, py] = pt(i, Math.max(0.03, profile[a]));
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.closePath();
      g.fillStyle = "rgba(255,122,69,0.25)";
      g.fill();
      g.strokeStyle = "#ff7a45";
      g.lineWidth = 2 * k;
      g.stroke();
      AXES.forEach((a, i) => {
        const [px, py] = pt(i, Math.max(0.03, profile[a]));
        const r = target[a];
        const inside = !r || (profile[a] >= r[0] && profile[a] <= r[1]);
        g.fillStyle = inside ? "#ff7a45" : "#e23b4e";
        g.beginPath();
        g.arc(px, py, (inside ? 3 : 4.5) * k, 0, Math.PI * 2);
        g.fill();
      });
    }
    if (labels) {
      g.fillStyle = "#3a2c20";
      g.font = `600 ${11 * k}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      AXES.forEach((a, i) => {
        const [px, py] = pt(i, 1.22);
        g.fillText(t(`axis.${a}` as MessageKey), px, py);
      });
    }
  };
}
