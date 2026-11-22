/**
 * Workshop tools: one-time purchases that make a bench task easier or faster.
 * Owned tools are stored in state.unlocks as "tool.<id>".
 */
import type { GameState } from "../core/state";

export type ToolId = "lubeStation" | "switchPress" | "solderStation" | "torqueDriver" | "keyTester" | "packingStation";

export interface ToolDef {
  id: ToolId;
  price: number; // cents
  builds: number; // unlocks after this many delivered keyboards
}

export const TOOLS: ToolDef[] = [
  { id: "switchPress", price: 90_00, builds: 0 },
  { id: "torqueDriver", price: 70_00, builds: 0 },
  { id: "lubeStation", price: 180_00, builds: 1 },
  { id: "keyTester", price: 80_00, builds: 2 },
  { id: "solderStation", price: 150_00, builds: 3 },
  { id: "packingStation", price: 120_00, builds: 4 },
];

export const toolKey = (id: ToolId) => `tool.${id}`;

export function hasTool(s: Pick<GameState, "unlocks">, id: ToolId): boolean {
  return s.unlocks.includes(toolKey(id));
}

/** Buy a tool (installed right away). False if owned, locked or too expensive. */
export function buyTool(s: GameState, id: ToolId): boolean {
  const t = TOOLS.find((x) => x.id === id);
  if (!t || hasTool(s, id) || s.stats.keyboardsBuilt < t.builds || s.money < t.price) return false;
  s.money -= t.price;
  s.today.expenses += t.price;
  s.unlocks.push(toolKey(id));
  return true;
}

// ---- effects (read by the bench steps and the minigames) ----
/** Lube gauge: the green zone grows by this much on each side. */
export const lubeZoneBonus = (s: Pick<GameState, "unlocks">) => (hasTool(s, "lubeStation") ? 0.05 : 0);
/** Fast pushes never bend pins with the switch press. */
export const canBendPins = (s: Pick<GameState, "unlocks">) => !hasTool(s, "switchPress");
/** The solder ring shrinks slower with a temperature-controlled station. */
export const solderSlowdown = (s: Pick<GameState, "unlocks">) => (hasTool(s, "solderStation") ? 1.35 : 1);
/** Screw torque: the green zone of the gauge. */
export const screwZone = (s: Pick<GameState, "unlocks">): [number, number] => (hasTool(s, "torqueDriver") ? [0.55, 0.88] : [0.6, 0.82]);
