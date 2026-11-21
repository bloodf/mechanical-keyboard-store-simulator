import type { BuildSession } from "../../build/types";
import type { GameState } from "../../core/state";
import type { Catalog } from "../../data/catalog";
import type { BenchScene } from "../../world/benchScene";
import type { BoardModel } from "../../world/boardModel";

/** What step views get to work with. */
export interface BenchCtx {
  state: GameState;
  catalog: Catalog;
  scene: BenchScene;
  session: BuildSession;
  /** Keyboards delivered (or 999 with the dev "unlock all" switch): drives part unlocks. */
  builds: number;
  board(): BoardModel | null;
  /** Session changed: refresh ticket/footer and save. */
  update(): void;
  /** The current step's task is finished (enables Next). */
  complete(): void;
  /** Play a keystroke with the current build's sound (and animate the key). */
  keySound(keyId: number, animate?: boolean): void;
  /** Ask the renderer for full frame rate (3D is about to move). */
  wake(): void;
}

export interface StepView {
  el: HTMLElement;
  /** Small bottom sheet so the 3D board stays visible (3D-interactive steps). */
  compact?: boolean;
  onPointer?(type: "down" | "move" | "up", e: PointerEvent, key: number | null): void;
  onKey?(e: KeyboardEvent): void;
  /** Dev/test helper: finish this step with a good result. */
  auto?(): void;
  dispose?(): void;
}
