/** Third-person movement with circle-vs-box collision (slides along furniture and walls). */
import { Vector3 } from "@babylonjs/core";
import type { Human } from "../human/human";
import type { Box2 } from "./storeBuilder";

export interface MoveInput {
  x: number; // strafe  (-1 left … 1 right), camera-relative
  y: number; // forward (-1 back … 1 forward)
  run: boolean;
}

const RADIUS = 0.28;
const WALK = 1.6;
const RUN = 3.0;

export class PlayerController {
  readonly pos = new Vector3();
  heading = Math.PI; // facing -z (toward the back wall)
  private vel = new Vector3();

  constructor(
    private human: Human,
    private obstacles: Box2[],
  ) {}

  place(p: Vector3, heading: number) {
    this.pos.copyFrom(p);
    this.heading = heading;
    this.vel.setAll(0);
    this.apply(0);
  }

  /** camYaw: direction the camera looks (radians, 0 = +z), used to make input camera-relative. */
  update(dt: number, input: MoveInput, camForward: Vector3) {
    const fwd = new Vector3(camForward.x, 0, camForward.z);
    if (fwd.lengthSquared() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    // Babylon is left-handed: right = up × forward
    const right = Vector3.Cross(Vector3.Up(), fwd).normalize();
    const want = fwd.scale(input.y).add(right.scale(input.x));
    const mag = Math.min(1, want.length());
    const speed = (input.run ? RUN : WALK) * mag;
    if (mag > 0.01) want.normalize().scaleInPlace(speed);
    else want.setAll(0);
    // accelerate toward the desired velocity
    const k = 1 - Math.exp(-dt * 12);
    this.vel.addInPlace(want.subtract(this.vel).scale(k));
    const step = this.vel.scale(dt);
    this.moveAxis(step.x, 0);
    this.moveAxis(0, step.z);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.15) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * (1 - Math.exp(-dt * 12));
    }
    this.human.speed = sp;
    this.human.setAction(sp > 0.15 ? "walk" : this.human.action === "walk" ? "idle" : this.human.action);
    this.apply(dt);
  }

  private moveAxis(dx: number, dz: number) {
    const nx = this.pos.x + dx;
    const nz = this.pos.z + dz;
    for (const b of this.obstacles) {
      // circle vs box: closest point distance
      const cx = Math.max(b.minX, Math.min(nx, b.maxX));
      const cz = Math.max(b.minZ, Math.min(nz, b.maxZ));
      if ((nx - cx) ** 2 + (nz - cz) ** 2 < RADIUS * RADIUS) return; // blocked on this axis
    }
    this.pos.x = nx;
    this.pos.z = nz;
  }

  private apply(_dt: number) {
    this.human.root.position.copyFrom(this.pos);
    this.human.root.rotation.y = this.heading;
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }
}
