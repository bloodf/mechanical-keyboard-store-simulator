/** Radar chart: the build's sound profile vs. the customer's target ranges. */
import type { KeySoundProfile } from "../../audio/keyPress";
import { AXES, type Axis, type Range } from "../../build/profile";
import { t, type MessageKey } from "../../i18n";

export function drawRadar(
  canvas: HTMLCanvasElement,
  profile: KeySoundProfile | null,
  target: Partial<Record<Axis, Range>>,
  opts: { labels?: boolean } = {},
) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || 220;
  const cssH = canvas.clientHeight || 220;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const g = canvas.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cssW, cssH);
  const cx = cssW / 2;
  const cy = cssH / 2 + 4;
  const R = Math.min(cssW, cssH) / 2 - (opts.labels === false ? 8 : 30);
  const n = AXES.length;
  const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const pt = (i: number, r: number): [number, number] => [cx + Math.cos(ang(i)) * r * R, cy + Math.sin(ang(i)) * r * R];

  // Grid
  g.strokeStyle = "rgba(60,40,20,0.15)";
  g.lineWidth = 1;
  for (const ring of [0.25, 0.5, 0.75, 1]) {
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const [x, y] = pt(i % n, ring);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = pt(i, 1);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(x, y);
    g.stroke();
  }
  // Target ranges: thick green bands along each constrained spoke
  g.lineCap = "round";
  AXES.forEach((a, i) => {
    const r = target[a];
    if (!r) return;
    const [x0, y0] = pt(i, Math.max(0.02, r[0]));
    const [x1, y1] = pt(i, Math.min(1, r[1]));
    g.strokeStyle = "rgba(46,160,90,0.55)";
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  });
  // Build polygon
  if (profile) {
    g.beginPath();
    AXES.forEach((a, i) => {
      const [x, y] = pt(i, Math.max(0.03, profile[a]));
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.closePath();
    g.fillStyle = "rgba(255,122,69,0.25)";
    g.fill();
    g.strokeStyle = "#ff7a45";
    g.lineWidth = 2;
    g.stroke();
    AXES.forEach((a, i) => {
      const [x, y] = pt(i, Math.max(0.03, profile[a]));
      const r = target[a];
      const inside = !r || (profile[a] >= r[0] && profile[a] <= r[1]);
      g.fillStyle = inside ? "#ff7a45" : "#e23b4e";
      g.beginPath();
      g.arc(x, y, inside ? 3 : 4.5, 0, Math.PI * 2);
      g.fill();
    });
  }
  if (opts.labels !== false) {
    g.fillStyle = "#3a2c20";
    g.font = "700 11px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    AXES.forEach((a, i) => {
      const [x, y] = pt(i, 1.2);
      g.fillText(t(`axis.${a}` as MessageKey), x, y);
    });
  }
}
