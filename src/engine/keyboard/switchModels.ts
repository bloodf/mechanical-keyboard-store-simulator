/**
 * Switch part geometry from the Blender-modeled glTF files (public/assets/models/switch_*.glb),
 * converted to millimeters in board space. Loaded once; every board thin-instances these parts.
 */
import type { VertexData } from "@babylonjs/core";
import type { SwitchFamily } from "../../data/profiles";
import { loadGlb } from "../glb";

export type SwitchParts = Record<string, VertexData>;
const cache: Partial<Record<SwitchFamily, SwitchParts>> = {};
let loading: Promise<void> | null = null;
const waiters: (() => void)[] = [];

export function loadSwitchModels(base = `${import.meta.env.BASE_URL}assets/models`): Promise<void> {
  if (!loading) {
    loading = Promise.all(
      (["mx", "box", "choc"] as SwitchFamily[]).map(async (f) => {
        const file = await loadGlb(`${base}/switch_${f}.glb`, 1000);
        const parts: SwitchParts = {};
        for (const p of file.primitives) parts[p.node] = p.data;
        cache[f] = parts;
      }),
    ).then(() => {
      waiters.splice(0).forEach((w) => w());
    });
  }
  return loading;
}

export function switchParts(f: SwitchFamily): SwitchParts | null {
  return cache[f] ?? null;
}

/** Call back once the models are available (immediately if they already are). */
export function whenSwitchModels(cb: () => void) {
  if (cache.mx) cb();
  else {
    waiters.push(cb);
    void loadSwitchModels();
  }
}
