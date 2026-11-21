/**
 * Avatar description (plain data). Used for the player's technician and, later, every generated customer.
 * Renderer-independent: engine/human builds the 3D person from this.
 */
export const HAIR_STYLES = ["short", "buzz", "bob", "long", "bun", "ponytail", "curly", "afro", "spiky", "bald"] as const;
export const BROWS = ["straight", "arched", "thick", "thin"] as const;
export const FACIAL_HAIR = ["none", "stubble", "mustache", "beard"] as const;
export const TOPS = ["tshirt", "hoodie", "shirt", "sweater"] as const;
export const GLASSES = ["none", "round", "square"] as const;
export const HATS = ["none", "cap", "beanie"] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type BrowStyle = (typeof BROWS)[number];
export type FacialHair = (typeof FACIAL_HAIR)[number];
export type TopStyle = (typeof TOPS)[number];
export type GlassesStyle = (typeof GLASSES)[number];
export type HatStyle = (typeof HATS)[number];

export interface AvatarParams {
  height: number; // 0.9 … 1.1 (× 1.72 m)
  build: number; // 0 slim … 1 broad
  skin: string;
  hairStyle: HairStyle;
  hairColor: string;
  eyeColor: string;
  brows: BrowStyle;
  facialHair: FacialHair;
  top: TopStyle;
  topColor: string;
  pantsColor: string;
  shoeColor: string;
  glasses: GlassesStyle;
  hat: HatStyle;
  hatColor: string;
  headphones: boolean;
  apron: boolean;
  apronColor: string;
}

export const SKIN_TONES = ["#f6d7c3", "#efc7a6", "#e2b08c", "#d19a6f", "#b97f56", "#9c6644", "#7d5033", "#5e3a24", "#4a2c1b", "#f3cfb3"];
export const HAIR_COLORS = ["#1c1612", "#3b2618", "#5a3a22", "#8a5a2b", "#a8552a", "#d9b26a", "#e8d7a8", "#9a9a9a", "#e8e8e8", "#ff7eb6", "#4a7bd9", "#3fb58a", "#8e5cd9"];
export const EYE_COLORS = ["#5a3b22", "#7a5a2e", "#4f7a3a", "#3d6fb0", "#7a8a96", "#a8741c"];
export const CLOTH_COLORS = [
  "#2f3640", "#f5f1e8", "#c0392b", "#e67e22", "#f1c40f", "#27ae60", "#16a085", "#2980b9", "#8e44ad", "#e84393",
  "#6d4c41", "#95a5a6", "#1e3a5f", "#ffb8b8", "#b8e0d2", "#d6c7ff",
];
export const PANTS_COLORS = ["#2b3a55", "#1f1f24", "#4a5a6a", "#6b5a45", "#c9b78f", "#3d4f3a", "#7a2e2e", "#d8d2c2"];
export const SHOE_COLORS = ["#f2f2f2", "#1c1c1c", "#7a4b2a", "#c0392b", "#2980b9", "#e7c04a"];

export const AVATAR_LIMITS = { height: [0.9, 1.1] as const, build: [0, 1] as const };

export function randomAvatar(rnd: () => number): AvatarParams {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const hairStyle = pick(HAIR_STYLES);
  return {
    height: 0.92 + rnd() * 0.16,
    build: rnd(),
    skin: pick(SKIN_TONES),
    hairStyle,
    hairColor: rnd() < 0.85 ? pick(HAIR_COLORS.slice(0, 9)) : pick(HAIR_COLORS),
    eyeColor: pick(EYE_COLORS),
    brows: pick(BROWS),
    facialHair: rnd() < 0.6 ? "none" : pick(FACIAL_HAIR),
    top: pick(TOPS),
    topColor: pick(CLOTH_COLORS),
    pantsColor: pick(PANTS_COLORS),
    shoeColor: pick(SHOE_COLORS),
    glasses: rnd() < 0.65 ? "none" : pick(GLASSES),
    hat: rnd() < 0.75 ? "none" : pick(HATS),
    hatColor: pick(CLOTH_COLORS),
    headphones: rnd() < 0.12,
    apron: false,
    apronColor: "#2d6a4f",
  };
}

/** The shop technician default: random person, wearing the shop apron. */
export function defaultTechnician(rnd: () => number): AvatarParams {
  return { ...randomAvatar(rnd), apron: true, hat: "none", headphones: false };
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const inList = <T extends string>(xs: readonly T[], v: unknown): v is T => typeof v === "string" && (xs as readonly string[]).includes(v);

export function validateAvatar(a: unknown): a is AvatarParams {
  if (typeof a !== "object" || a === null) return false;
  const x = a as Record<string, unknown>;
  const num = (v: unknown, [lo, hi]: readonly [number, number]) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  return (
    num(x.height, AVATAR_LIMITS.height) &&
    num(x.build, AVATAR_LIMITS.build) &&
    [x.skin, x.hairColor, x.eyeColor, x.topColor, x.pantsColor, x.shoeColor, x.hatColor, x.apronColor].every((c) => typeof c === "string" && HEX.test(c)) &&
    inList(HAIR_STYLES, x.hairStyle) &&
    inList(BROWS, x.brows) &&
    inList(FACIAL_HAIR, x.facialHair) &&
    inList(TOPS, x.top) &&
    inList(GLASSES, x.glasses) &&
    inList(HATS, x.hat) &&
    typeof x.headphones === "boolean" &&
    typeof x.apron === "boolean"
  );
}

export const NAME_MAX = 20;
export const STORE_NAME_MAX = 28;
/** Trim, collapse spaces, strip control chars, cap length. */
export function cleanName(s: string, max: number): string {
  return s.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
