/** Build flow: step order, completion rules, and turning minigame results into build state. */
import { derive } from "../core/rng";
import { getLayout } from "../data/layouts";
import { PCBS } from "../data/parts";
import type { BuildSession, FaultyKey, Order, StepId } from "./types";

export const ALL_STEPS: StepId[] = ["case", "pcb", "damp", "plate", "stabs", "switches", "lube", "install", "solder", "screws", "keycaps", "test", "sound", "deliver"];

export function newSession(job: Order): BuildSession {
  return {
    job,
    step: "case",
    layout: null,
    caseMaterial: null,
    caseColor: null,
    customColorway: null,
    pcb: null,
    damp: [],
    tapeQuality: null,
    plate: null,
    stabs: null,
    stabMods: [],
    stabLube: null,
    switchId: null,
    lube: null,
    installed: false,
    solderQuality: null,
    faults: [],
    fixed: [],
    screws: null,
    keycapsId: null,
    tested: false,
    soundChecked: false,
    reserved: {},
    family: null,
  };
}

export function isHotswap(b: BuildSession): boolean {
  return PCBS.find((p) => p.id === b.pcb)?.hotswap ?? true;
}

/** Steps for this build (soldering only exists for solder PCBs). */
export function stepsFor(b: BuildSession): StepId[] {
  return ALL_STEPS.filter((s) => s !== "solder" || (b.pcb !== null && !isHotswap(b)));
}

/** Whether the step's requirements are met so the player can continue. */
export function stepDone(b: BuildSession, step: StepId): boolean {
  switch (step) {
    case "case":
      return !!b.layout && !!b.caseMaterial && !!b.caseColor;
    case "pcb":
      return !!b.pcb;
    case "damp":
      return !b.damp.includes("tape") || b.tapeQuality !== null;
    case "plate":
      return !!b.plate;
    case "stabs":
      return !!b.stabs && b.stabLube !== null;
    case "switches":
      return !!b.switchId;
    case "lube":
      return !!b.lube;
    case "install":
      return b.installed;
    case "solder":
      return b.solderQuality !== null;
    case "screws":
      return !!b.screws;
    case "keycaps":
      return !!b.keycapsId;
    case "test":
      return b.tested;
    case "sound":
      return b.soundChecked;
    case "deliver":
      return false;
  }
}

export function nextStep(b: BuildSession): StepId {
  const steps = stepsFor(b);
  const i = steps.indexOf(b.step);
  return steps[Math.min(steps.length - 1, i + 1)];
}

export function prevStep(b: BuildSession): StepId | null {
  const steps = stepsFor(b);
  const i = steps.indexOf(b.step);
  return i > 0 ? steps[i - 1] : null;
}

/** Earlier choices can be changed until the switches are installed (then the board is assembled). */
export function canGoBack(b: BuildSession): boolean {
  return !b.installed && stepsFor(b).indexOf(b.step) > 0;
}

/** Hot-swap install minigame: keys pushed in too fast get bent pins (dead until fixed). */
export function applyInstall(b: BuildSession, bentKeys: number[]) {
  b.installed = true;
  for (const key of bentKeys) {
    if (!b.faults.some((f) => f.key === key)) b.faults.push({ key, kind: "dead", cause: "bentPin" });
  }
}

/** Soldering minigame: each missed beat leaves a cold joint on a random key in that group. */
export function applySolder(b: BuildSession, quality: number, missedGroups: number[], groups: number) {
  b.solderQuality = quality;
  if (!b.layout) return;
  const keys = getLayout(b.layout).keys;
  const rng = derive(b.job.id, "solder", missedGroups.join(","));
  const per = Math.ceil(keys.length / groups);
  for (const g of missedGroups) {
    const group = keys.slice(g * per, (g + 1) * per).filter((k) => !b.faults.some((f) => f.key === k.id));
    if (!group.length) continue;
    const k = rng.pick(group);
    const fault: FaultyKey = { key: k.id, kind: rng.chance(0.6) ? "dead" : "chatter", cause: "coldJoint" };
    b.faults.push(fault);
  }
}

export function unresolvedFaults(b: BuildSession): FaultyKey[] {
  return b.faults.filter((f) => !b.fixed.includes(f.key));
}
