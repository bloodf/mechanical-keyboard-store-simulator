/** Rebuild the 3D board from a (possibly restored) session, without animations. */
import { ALL_STEPS } from "../../build/session";
import type { BuildSession } from "../../build/types";
import { findSwitch, keycapSetOf } from "../../build/profile";
import type { Catalog } from "../../data/catalog";
import { CASE_MATERIALS, PCBS, PLATES, STABS } from "../../data/parts";
import type { Board } from "../../engine/keyboard/board";

export function tapeStrips(quality: number, rows: number) {
  return Array.from({ length: rows }, (_, row) => ({ row, offset: (1 - quality) * (row % 2 ? 1 : -1) }));
}

export function syncBoard(board: Board, b: BuildSession, cat: Catalog) {
  const reached = (s: (typeof ALL_STEPS)[number]) => ALL_STEPS.indexOf(b.step) >= ALL_STEPS.indexOf(s);
  const cm = CASE_MATERIALS.find((m) => m.id === b.caseMaterial) ?? null;
  board.setCase(cm, b.caseColor?.hex ?? null, false);
  board.setDampening(b.damp, false);
  board.setPcb(PCBS.find((p) => p.id === b.pcb) ?? null, false);
  if (b.tapeQuality !== null && b.damp.includes("tape")) board.setTape(tapeStrips(b.tapeQuality, Math.ceil(board.layout.depth)));
  board.setPlate(PLATES.find((p) => p.id === b.plate) ?? null, false);
  if (reached("stabs")) board.setStabs(STABS.find((s) => s.id === b.stabs) ?? null, (b.stabLube ?? 0) > 0.3);
  board.setSwitchLook(findSwitch(cat, b.switchId) ?? null);
  board.setAllSwitches(b.installed, true);
  const kc = keycapSetOf(b, cat);
  if (reached("keycaps") && kc) {
    board.setKeycaps(kc);
    board.setAllCaps(true, true);
  } else {
    board.setKeycaps(null);
  }
}
