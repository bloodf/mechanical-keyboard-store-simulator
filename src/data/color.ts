/** Framework-free color helpers (HSL ↔ hex, naming colors the way customers talk about them). */
import type { HueName } from "./parts";

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 1) + 1) % 1;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(Math.max(0, Math.min(1, c)) * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

/** Relative luminance (sRGB → linear), for contrast decisions. */
export function luminance(hex: string): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const [r, g, b] = hexToRgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function hueName(h: number): HueName {
  const x = ((h % 1) + 1) % 1;
  if (x < 0.035 || x >= 0.95) return "red";
  if (x < 0.1) return "orange";
  if (x < 0.17) return "yellow";
  if (x < 0.44) return "green";
  if (x < 0.52) return "teal";
  if (x < 0.7) return "blue";
  if (x < 0.82) return "purple";
  return "pink";
}

/** What a customer would call this color (neutrals included). */
export function classifyColor(hex: string): HueName {
  const [h, s, l] = hexToHsl(hex);
  if (l > 0.9 && s < 0.5) return "white";
  if (l < 0.16) return "black";
  if (s < 0.12) return l > 0.75 ? "white" : l < 0.3 ? "black" : "grey";
  if (s < 0.45 && l > 0.55 && h > 0.06 && h < 0.16) return "beige";
  return hueName(h);
}

export type Tone = "pale" | "light" | "mid" | "deep" | "dark";
export function toneOf(hex: string): Tone {
  const l = hexToHsl(hex)[2];
  return l > 0.82 ? "pale" : l > 0.65 ? "light" : l > 0.38 ? "mid" : l > 0.22 ? "deep" : "dark";
}

export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round((x + (y - x) * t) * 255).toString(16).padStart(2, "0");
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}
