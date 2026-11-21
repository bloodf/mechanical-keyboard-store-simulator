import type { Control } from "@babylonjs/gui";
import type { BuildSession } from "../../build/types";
import type { GameState } from "../../core/state";
import type { Catalog } from "../../data/catalog";
import type { SoundMods } from "../../data/parts";
import type { Board } from "../../engine/keyboard/board";
import type { BenchView, StoreScene } from "../../engine/store/storeScene";
import type { Painter } from "../../gui/widgets";
import type { Ui } from "../../gui/ui";

/** What step views work with. */
export interface StepCtx {
  state: GameState;
  catalog: Catalog;
  store: StoreScene;
  ui: Ui;
  session: BuildSession;
  builds: number;
  board(): Board | null;
  /** Replace the board (layout change). */
  setLayoutBoard(): Board | null;
  /** Session changed: refresh ticket/footer and save. */
  update(): void;
  /** The step's task is finished (enables Next). */
  complete(): void;
  /** Redraw the drawer (after a choice changes what's shown). */
  rerender(): void;
  keySound(keyId: number, animate?: boolean): void;
  view(v: BenchView | { target: import("@babylonjs/core").Vector3; w: number; d: number; beta: number }): void;
  wake(): void;
}

export interface DrawerArea {
  w: number;
  h: number;
  portrait: boolean;
}

/** A build step's UI + 3D behavior. */
export interface StepView {
  /** Build the drawer body for the given area. */
  render(area: DrawerArea): Control;
  /** Compact drawer (3D-interactive steps keep the board visible). */
  compact?: boolean;
  /** Pointer on the 3D view (CSS px) — only fires when not over UI. */
  onPointer?(type: "down" | "move" | "up", x: number, y: number, e: PointerEvent): void;
  onKey?(e: KeyboardEvent): void;
  update?(dt: number): void;
  /** Dev/test: finish this step well. */
  auto?(): void;
  dispose?(): void;
}

export interface TileSpec {
  id: string;
  title: string;
  sub?: string;
  price?: number | null;
  priceText?: string;
  effects?: SoundMods;
  icon: Painter;
  selected?: boolean;
  lockedAt?: number | null;
  badge?: string;
  onClick: () => void;
}
