/** Dev-only: turn the small panorama HDR into a prefiltered Babylon .env (used by tests/e2e/make_env.cjs). */
import { Engine, EnvironmentTextureTools, HDRCubeTexture, Scene } from "@babylonjs/core";

export async function run(canvas: HTMLCanvasElement) {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  const hdr = new HDRCubeTexture("/art/build/workshop_env.hdr", scene, 256, false, true, false, true);
  await new Promise<void>((res) => hdr.onLoadObservable.addOnce(() => res()));
  const buf = await EnvironmentTextureTools.CreateEnvTextureAsync(hdr, { imageType: "image/png" });
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  (window as unknown as { envData: string }).envData = btoa(s);
}
