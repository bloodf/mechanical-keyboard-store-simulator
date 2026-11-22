/** Procedural textures drawn on canvases (no image files). */
import { DynamicTexture, Texture, type Scene } from "@babylonjs/core";

/** Soft round particle sprite (smoke, sparks, confetti). */
export function particleDot(scene: Scene): DynamicTexture {
  const t = new DynamicTexture("dot", { width: 64, height: 64 }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const g = t.getContext() as unknown as CanvasRenderingContext2D;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  t.update(true);
  t.hasAlpha = true;
  return t;
}
