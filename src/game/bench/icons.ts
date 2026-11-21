/** Part icons drawn with 2D canvas painters (used in the parts drawer tiles). */
import type { Colorway } from "../../data/colorway";
import { getLayout, type LayoutId } from "../../data/layouts";
import { mixHex } from "../../data/color";
import { rrect, type Painter } from "../../gui/widgets";

const shade = (hex: string, k: number) => mixHex(hex, k > 0 ? "#ffffff" : "#000000", Math.abs(k));

export const layoutIcon = (id: LayoutId, color = "#3b3028"): Painter => (g, x, y, w, h, r) => {
  const L = getLayout(id);
  const pad = 8 * r;
  const s = Math.min((w - pad * 2) / L.width, (h - pad * 2) / L.depth);
  const ox = x + (w - L.width * s) / 2;
  const oy = y + (h - L.depth * s) / 2;
  g.fillStyle = shade(color, 0.75);
  rrect(g, ox - 3 * r, oy - 3 * r, L.width * s + 6 * r, L.depth * s + 6 * r, 4 * r);
  g.fill();
  for (const k of L.keys) {
    g.fillStyle = k.kind === "accent" ? "#ff7a45" : k.kind === "mod" ? shade(color, 0.35) : color;
    rrect(g, ox + k.x * s + 0.7 * r, oy + k.y * s + 0.7 * r, k.w * s - 1.4 * r, k.h * s - 1.4 * r, 1.5 * r);
    g.fill();
  }
};

export const caseIcon = (hex: string, material: string): Painter => (g, x, y, w, h, r) => {
  const cw = w * 0.78;
  const ch = h * 0.42;
  const cx = x + (w - cw) / 2;
  const cy = y + h * 0.34;
  g.fillStyle = "rgba(0,0,0,0.12)";
  rrect(g, cx + 3 * r, cy + ch * 0.55, cw, ch * 0.55, 10 * r);
  g.fill();
  // body (front face) + top
  g.fillStyle = shade(hex, -0.18);
  rrect(g, cx, cy + ch * 0.35, cw, ch * 0.62, 10 * r);
  g.fill();
  g.globalAlpha = material === "acrylic" || material === "polycarbonate" ? 0.65 : 1;
  g.fillStyle = hex;
  rrect(g, cx, cy, cw, ch * 0.62, 10 * r);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = "rgba(0,0,0,0.22)";
  rrect(g, cx + cw * 0.07, cy + ch * 0.1, cw * 0.86, ch * 0.38, 6 * r);
  g.fill();
  if (material === "wood") {
    g.strokeStyle = "rgba(60,30,10,0.35)";
    g.lineWidth = 1.5 * r;
    for (let i = 1; i < 5; i++) {
      g.beginPath();
      g.moveTo(cx + 6 * r, cy + ch * 0.35 + i * ch * 0.12);
      g.bezierCurveTo(cx + cw * 0.3, cy + ch * 0.3 + i * ch * 0.12, cx + cw * 0.7, cy + ch * 0.42 + i * ch * 0.12, cx + cw - 6 * r, cy + ch * 0.36 + i * ch * 0.12);
      g.stroke();
    }
  }
  if (material === "aluminum" || material === "brass") {
    g.fillStyle = "rgba(255,255,255,0.35)";
    rrect(g, cx + 8 * r, cy + 3 * r, cw * 0.5, 4 * r, 2 * r);
    g.fill();
  }
};

export const pcbIcon = (hex: string, rgb: boolean, flex: boolean): Painter => (g, x, y, w, h, r) => {
  const pw = w * 0.8;
  const ph = h * 0.5;
  const px = x + (w - pw) / 2;
  const py = y + (h - ph) / 2;
  g.fillStyle = hex;
  rrect(g, px, py, pw, ph, 6 * r);
  g.fill();
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 3; j++) {
      const cx = px + pw * (0.12 + i * 0.152);
      const cy = py + ph * (0.22 + j * 0.28);
      g.fillStyle = "#d9b458";
      g.beginPath();
      g.arc(cx, cy, 2.4 * r, 0, Math.PI * 2);
      g.fill();
      if (rgb) {
        g.fillStyle = ["#ff4d6d", "#4dd0ff", "#b3ff4d"][(i + j) % 3];
        g.fillRect(cx - 2 * r, cy + 5 * r, 4 * r, 2.5 * r);
      }
    }
  if (flex) {
    g.fillStyle = "rgba(0,0,0,0.55)";
    for (const f of [0.33, 0.66]) g.fillRect(px + pw * f, py + ph * 0.12, 3 * r, ph * 0.76);
  }
};

export const plateIcon = (hex: string, none: boolean): Painter => (g, x, y, w, h, r) => {
  const pw = w * 0.8;
  const ph = h * 0.5;
  const px = x + (w - pw) / 2;
  const py = y + (h - ph) / 2;
  if (none) {
    g.strokeStyle = "#a08c77";
    g.setLineDash([5 * r, 4 * r]);
    g.lineWidth = 2 * r;
    rrect(g, px, py, pw, ph, 6 * r);
    g.stroke();
    g.setLineDash([]);
    return;
  }
  g.fillStyle = hex;
  rrect(g, px, py, pw, ph, 5 * r);
  g.fill();
  g.fillStyle = "rgba(0,0,0,0.35)";
  for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) g.fillRect(px + pw * (0.06 + i * 0.132), py + ph * (0.14 + j * 0.28), pw * 0.09, ph * 0.2);
};

export const foamIcon = (hex: string, kind: string): Painter => (g, x, y, w, h, r) => {
  const pw = w * 0.78;
  const ph = kind === "peFoam" || kind === "tape" ? h * 0.12 : h * 0.32;
  const px = x + (w - pw) / 2;
  const py = y + (h - ph) / 2;
  if (kind === "tape") {
    for (let i = 0; i < 3; i++) {
      g.fillStyle = "#cfe3ff";
      rrect(g, px, y + h * (0.3 + i * 0.16), pw, h * 0.1, 3 * r);
      g.fill();
    }
    return;
  }
  g.fillStyle = hex;
  rrect(g, px, py, pw, ph, 5 * r);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.25)";
  for (let i = 0; i < 40; i++) g.fillRect(px + ((i * 37) % 100) / 100 * pw, py + ((i * 53) % 100) / 100 * ph, 2 * r, 2 * r);
};

export const stabIcon = (hex: string): Painter => (g, x, y, w, h, r) => {
  const cy = y + h * 0.55;
  g.strokeStyle = "#c9ccd1";
  g.lineWidth = 3 * r;
  g.beginPath();
  g.moveTo(x + w * 0.2, cy + 14 * r);
  g.lineTo(x + w * 0.2, cy);
  g.lineTo(x + w * 0.8, cy);
  g.lineTo(x + w * 0.8, cy + 14 * r);
  g.stroke();
  g.fillStyle = hex;
  for (const fx of [0.2, 0.8]) {
    rrect(g, x + w * fx - 10 * r, cy - 20 * r, 20 * r, 24 * r, 4 * r);
    g.fill();
  }
};

export const modIcon = (kind: "clip" | "bandaid"): Painter => (g, x, y, w, h, r) => {
  g.font = `${34 * r}px sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(kind === "clip" ? "✂️" : "🩹", x + w / 2, y + h / 2);
};

export const switchIcon = (housing: string, opacity: number, stem: string): Painter => (g, x, y, w, h, r) => {
  const s = Math.min(w, h) * 0.62;
  const cx = x + w / 2;
  const cy = y + h / 2 + 4 * r;
  g.globalAlpha = Math.max(0.55, opacity);
  g.fillStyle = shade(housing, -0.15);
  rrect(g, cx - s / 2, cy - s * 0.1, s, s * 0.45, 6 * r);
  g.fill();
  g.fillStyle = housing;
  rrect(g, cx - s / 2 + 3 * r, cy - s * 0.42, s - 6 * r, s * 0.4, 6 * r);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = stem;
  g.fillRect(cx - s * 0.05, cy - s * 0.62, s * 0.1, s * 0.3);
  g.fillRect(cx - s * 0.16, cy - s * 0.55, s * 0.32, s * 0.09);
};

export const keycapsIcon = (cw: Colorway): Painter => (g, x, y, w, h, r) => {
  const cap = (cx: number, cy: number, s: number, color: string, legend: string, text: string) => {
    g.fillStyle = shade(color, -0.2);
    rrect(g, cx - s / 2, cy - s / 2 + 4 * r, s, s, 7 * r);
    g.fill();
    g.fillStyle = color;
    rrect(g, cx - s / 2, cy - s / 2, s, s - 5 * r, 7 * r);
    g.fill();
    g.fillStyle = shade(color, 0.15);
    rrect(g, cx - s / 2 + 5 * r, cy - s / 2 + 4 * r, s - 10 * r, s - 16 * r, 5 * r);
    g.fill();
    g.fillStyle = legend;
    g.font = `700 ${s * 0.32}px system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, cx, cy - 3 * r);
  };
  const s = Math.min(w, h) * 0.38;
  cap(x + w * 0.3, y + h * 0.6, s, cw.mod, cw.legendOnMod, "⇧");
  cap(x + w * 0.7, y + h * 0.6, s, cw.accent, cw.legendOnAccent, "↵");
  cap(x + w * 0.5, y + h * 0.36, s, cw.alpha, cw.legendOnAlpha, "A");
};

export const swatchIcon = (hex: string): Painter => (g, x, y, w, h) => {
  g.fillStyle = hex;
  g.beginPath();
  g.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.32, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.15)";
  g.lineWidth = 2;
  g.stroke();
};

export const diceIcon: Painter = (g, x, y, w, h, r) => {
  g.font = `${40 * r}px sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("🎲", x + w / 2, y + h / 2);
};
