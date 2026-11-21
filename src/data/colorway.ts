import type { Rng } from "../core/rng";
import type { HueName } from "./parts";
import { hslToHex, hueName } from "./color";

export type ColorFamily = "pastel" | "retro" | "dark" | "mono" | "vivid";
export const COLOR_FAMILIES: ColorFamily[] = ["pastel", "retro", "dark", "mono", "vivid"];

export interface Colorway {
  family: ColorFamily;
  /** The color a customer would describe this set by ("pastel PINK", "dark with ORANGE accents"). */
  hue: HueName;
  case: string;
  alpha: string; // letter keys
  mod: string; // modifiers
  accent: string; // Esc / Enter / arrows
  legendOnAlpha: string;
  legendOnMod: string;
  legendOnAccent: string;
}

const hsl = (h: number, s: number, l: number) => hslToHex(h, s, l);

export { hueName };

/** Generated colorway: pleasant, readable, never the same twice. */
export function randomColorway(rng: Rng, family?: ColorFamily): Colorway {
  const style = family ?? rng.pick(COLOR_FAMILIES);
  const h = rng.next();
  const acc = h + rng.pick([0.5, 0.42, 0.58, 0.33, 0.08]);
  switch (style) {
    case "pastel":
      return {
        family: style,
        hue: hueName(h),
        case: hsl(h, 0.45, 0.82),
        alpha: hsl(h, 0.25, 0.95),
        mod: hsl(h, 0.45, 0.8),
        accent: hsl(acc, 0.6, 0.72),
        legendOnAlpha: hsl(h, 0.4, 0.3),
        legendOnMod: hsl(h, 0.4, 0.25),
        legendOnAccent: hsl(acc, 0.6, 0.25),
      };
    case "retro": {
      const ah = rng.pick([0.0, 0.03, 0.55, 0.12, 0.08]);
      return {
        family: style,
        hue: hueName(ah),
        case: "#d8d2c2",
        alpha: "#ece6d6",
        mod: "#9c9a92",
        accent: hsl(ah, 0.7, 0.5),
        legendOnAlpha: "#3a3833",
        legendOnMod: "#f2efe6",
        legendOnAccent: "#ffffff",
      };
    }
    case "dark":
      return {
        family: style,
        hue: hueName(acc),
        case: hsl(h, 0.1, 0.14),
        alpha: hsl(h, 0.08, 0.2),
        mod: hsl(h, 0.08, 0.13),
        accent: hsl(acc, 0.75, 0.55),
        legendOnAlpha: hsl(acc, 0.7, 0.7),
        legendOnMod: hsl(h, 0.1, 0.75),
        legendOnAccent: "#111111",
      };
    case "mono":
      return {
        family: style,
        hue: hueName(h),
        case: hsl(h, 0.5, 0.35),
        alpha: hsl(h, 0.5, 0.55),
        mod: hsl(h, 0.5, 0.42),
        accent: hsl(h, 0.6, 0.75),
        legendOnAlpha: hsl(h, 0.4, 0.95),
        legendOnMod: hsl(h, 0.4, 0.92),
        legendOnAccent: hsl(h, 0.6, 0.22),
      };
    default:
      return {
        family: "vivid",
        hue: hueName(h),
        case: hsl(h, 0.15, 0.9),
        alpha: hsl(h, 0.75, 0.55),
        mod: hsl(h + 0.08, 0.75, 0.45),
        accent: hsl(acc, 0.85, 0.6),
        legendOnAlpha: "#ffffff",
        legendOnMod: "#ffffff",
        legendOnAccent: "#1b1b1b",
      };
  }
}
