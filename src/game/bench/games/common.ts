/** Shared bits for the 3D bench minigames. */
import { Color3, Color4, PBRMaterial, Plane, ParticleSystem, Vector3, type Ray, type Scene } from "@babylonjs/core";
import { particleDot } from "../../../engine/textures";

/**
 * Minigame material (PBR, lit by the workshop's image-based lighting).
 * spec: 0 matte … 1 polished metal · emissive: glow color.
 */
export function mat(scene: Scene, hex: string, o: { spec?: number; alpha?: number; emissive?: string } = {}): PBRMaterial {
  const m = new PBRMaterial(`mg-${hex}-${Math.random().toString(36).slice(2, 6)}`, scene);
  m.albedoColor = Color3.FromHexString(hex).toLinearSpace();
  const s = o.spec ?? 0.3;
  m.metallic = s >= 0.85 ? 0.9 : 0;
  m.roughness = Math.max(0.08, 0.85 - s * 0.75);
  if (o.alpha !== undefined && o.alpha < 1) {
    m.alpha = o.alpha;
    m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  }
  if (o.emissive) m.emissiveColor = Color3.FromHexString(o.emissive).toLinearSpace().scale(2);
  return m;
}

/** Where a ray hits the horizontal plane y = h (world), or null. */
export function hitY(ray: Ray, h: number): Vector3 | null {
  const d = ray.intersectsPlane(Plane.FromPositionAndNormal(new Vector3(0, h, 0), new Vector3(0, 1, 0)));
  return d === null ? null : ray.origin.add(ray.direction.scale(d));
}

/** Little puff/spark emitter. */
export function puffs(scene: Scene, kind: "smoke" | "sparks"): ParticleSystem {
  const ps = new ParticleSystem(`ps-${kind}`, 120, scene);
  ps.particleTexture = particleDot(scene);
  ps.emitter = Vector3.Zero();
  ps.minEmitBox = ps.maxEmitBox = Vector3.Zero();
  if (kind === "smoke") {
    ps.color1 = new Color4(0.95, 0.95, 0.95, 0.5);
    ps.color2 = new Color4(0.85, 0.85, 0.85, 0.35);
    ps.colorDead = new Color4(1, 1, 1, 0);
    ps.minSize = 0.006;
    ps.maxSize = 0.018;
    ps.minLifeTime = 0.5;
    ps.maxLifeTime = 1.1;
    ps.direction1 = new Vector3(-0.01, 0.06, -0.01);
    ps.direction2 = new Vector3(0.01, 0.1, 0.01);
    ps.minEmitPower = 0.3;
    ps.maxEmitPower = 0.6;
    ps.gravity = new Vector3(0, 0.02, 0);
  } else {
    ps.color1 = new Color4(1, 0.8, 0.3, 1);
    ps.color2 = new Color4(1, 0.4, 0.2, 1);
    ps.colorDead = new Color4(1, 0.2, 0, 0);
    ps.minSize = 0.002;
    ps.maxSize = 0.005;
    ps.minLifeTime = 0.15;
    ps.maxLifeTime = 0.35;
    ps.direction1 = new Vector3(-1, 1, -1);
    ps.direction2 = new Vector3(1, 2, 1);
    ps.minEmitPower = 0.2;
    ps.maxEmitPower = 0.5;
    ps.gravity = new Vector3(0, -2, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  }
  ps.emitRate = 0;
  ps.start();
  return ps;
}

/** Emit n particles at a world position. */
export function burst(ps: ParticleSystem, at: Vector3, n: number) {
  ps.emitter = at.clone();
  ps.manualEmitCount = n;
}

/** The running minigame, for dev/test tooling (screen positions of its targets). */
export const minigameRegistry: { current: { debugPoints(): unknown } | null } = { current: null };
