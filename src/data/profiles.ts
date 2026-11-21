/**
 * Keycap profiles and switch families, modeled from published dimensions (mm).
 * Heights are measured at the top center from the bottom of the skirt; angles: + = the top faces the typist.
 * Numbers come from manufacturer comparison charts and vary ±0.3 mm between makers.
 */

export type SwitchFamily = "mx" | "box" | "choc";
/** What a keycap stem fits: MX-style cross (MX and Box switches) or Choc twin rails. */
export type CapMount = "mx" | "choc";
export const MOUNT_OF_FAMILY: Record<SwitchFamily, CapMount> = { mx: "mx", box: "mx", choc: "choc" };
/** PCB / plate footprint: MX and Box switches share the MX footprint. */
export const FOOTPRINT_OF_FAMILY: Record<SwitchFamily, CapMount> = MOUNT_OF_FAMILY;

export type KeycapProfile = "cherry" | "oem" | "sa" | "dsa" | "xda" | "mt3" | "kat" | "lp";
export const KEYCAP_PROFILES: KeycapProfile[] = ["cherry", "oem", "sa", "dsa", "xda", "mt3", "kat", "lp"];

export type ProfileRow = 1 | 2 | 3 | 4;

export interface ProfileGeo {
  mount: CapMount;
  dish: "cyl" | "sph";
  depth: number; // dish depth at the center
  side: number; // inset of the top from the base, left/right
  front: number; // inset at the front (typist side)
  back: number; // inset at the back
  baseR: number; // corner radius at the base
  topR: number; // corner radius at the top
  rows: Record<ProfileRow, [height: number, angle: number]>;
  sculpted: boolean;
}

const uniform = (h: number): Record<ProfileRow, [number, number]> => ({ 1: [h, 0], 2: [h, 0], 3: [h, 0], 4: [h, 0] });

export const PROFILE_GEO: Record<KeycapProfile, ProfileGeo> = {
  cherry: { mount: "mx", dish: "cyl", depth: 0.55, side: 2.75, front: 2.9, back: 1.1, baseR: 0.9, topR: 2.2, sculpted: true, rows: { 1: [9.4, 7.5], 2: [7.6, 3], 3: [7.3, -1], 4: [8.4, -6] } },
  oem: { mount: "mx", dish: "cyl", depth: 0.6, side: 2.75, front: 3.2, back: 0.9, baseR: 0.9, topR: 2.2, sculpted: true, rows: { 1: [11.9, 9], 2: [9.8, 4], 3: [9.2, 0], 4: [10.0, -7] } },
  sa: { mount: "mx", dish: "sph", depth: 1.15, side: 2.6, front: 2.6, back: 2.6, baseR: 1.2, topR: 2.8, sculpted: true, rows: { 1: [14.5, 12], 2: [12.2, 6], 3: [11.9, 0], 4: [12.2, -6] } },
  dsa: { mount: "mx", dish: "sph", depth: 0.75, side: 2.65, front: 2.65, back: 2.65, baseR: 1.0, topR: 2.3, sculpted: false, rows: uniform(7.6) },
  xda: { mount: "mx", dish: "sph", depth: 0.6, side: 1.4, front: 1.4, back: 1.4, baseR: 1.0, topR: 2.4, sculpted: false, rows: uniform(9.1) },
  mt3: { mount: "mx", dish: "sph", depth: 1.55, side: 2.4, front: 2.4, back: 1.9, baseR: 1.1, topR: 2.6, sculpted: true, rows: { 1: [13.7, 11], 2: [11.3, 5], 3: [10.9, 0], 4: [11.3, -5] } },
  kat: { mount: "mx", dish: "sph", depth: 1.0, side: 2.5, front: 2.6, back: 1.8, baseR: 1.0, topR: 2.5, sculpted: true, rows: { 1: [12.6, 10], 2: [10.4, 5], 3: [9.6, 0], 4: [10.4, -5] } },
  // low profile for Choc switches (MBK-like): nearly flat, big top, shallow spherical dish
  lp: { mount: "choc", dish: "sph", depth: 0.3, side: 0.9, front: 0.9, back: 0.9, baseR: 1.6, topR: 2.3, sculpted: false, rows: uniform(3.5) },
};

/** Layout rowFromBottom → profile row: bottom & ZXCV = R4, ASDF = R3, QWERTY = R2, numbers & F-keys = R1. */
export function profileRow(rowFromBottom: number): ProfileRow {
  return ({ 0: 4, 1: 4, 2: 3, 3: 2 } as Record<number, ProfileRow>)[rowFromBottom] ?? 1;
}

export interface SwitchFamilyGeo {
  housingTop: number; // top housing height above the plate top
  stemTop: number; // stem top above the plate at rest
  travel: number;
  capZ: number; // keycap skirt above the plate at rest
  cutout: number; // plate cutout (square)
}
export const FAMILY_GEO: Record<SwitchFamily, SwitchFamilyGeo> = {
  mx: { housingTop: 6.6, stemTop: 10.2, travel: 4.0, capZ: 4.4, cutout: 14.0 },
  box: { housingTop: 6.6, stemTop: 10.2, travel: 3.6, capZ: 4.4, cutout: 14.0 },
  choc: { housingTop: 3.0, stemTop: 6.0, travel: 3.0, capZ: 3.3, cutout: 13.8 },
};
