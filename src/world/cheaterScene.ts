/**
 * "CHEATER DETECTED": a furious cheap membrane keyboard with googly eyes, police lights,
 * and a rain of disappointed keycaps.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { SceneController } from "./stage";

export class CheaterScene implements SceneController {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  private disposables: { dispose(): void }[] = [];
  private membrane = new THREE.Group();
  private pupils: THREE.Mesh[] = [];
  private brows: THREE.Mesh[] = [];
  private red: THREE.PointLight;
  private blue: THREE.PointLight;
  private redBulb: THREE.MeshStandardMaterial;
  private blueBulb: THREE.MeshStandardMaterial;
  private rain: { m: THREE.Mesh; v: number; spin: THREE.Vector3 }[] = [];
  private portrait = false;

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color("#1a0b12");
    s.fog = new THREE.Fog("#1a0b12", 8, 20);
    s.add(new THREE.HemisphereLight("#ffffff", "#331122", 0.7));
    const key = new THREE.DirectionalLight("#ffffff", 1.4);
    key.position.set(2, 5, 4);
    s.add(key);

    this.red = new THREE.PointLight("#ff2040", 0, 12, 1.5);
    this.red.position.set(-2.2, 1.6, 1);
    this.blue = new THREE.PointLight("#2050ff", 0, 12, 1.5);
    this.blue.position.set(2.2, 1.6, 1);
    s.add(this.red, this.blue);

    // Police light bar on top of the membrane keyboard
    this.redBulb = this.mat({ color: "#550010", emissive: "#ff2040", emissiveIntensity: 0 });
    this.blueBulb = this.mat({ color: "#000d55", emissive: "#2050ff", emissiveIntensity: 0 });
    const bulbGeo = this.geo(new THREE.SphereGeometry(0.22, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2));
    const rb = new THREE.Mesh(bulbGeo, this.redBulb);
    rb.position.set(-1.5, 0.1, -0.45);
    const bb = new THREE.Mesh(bulbGeo, this.blueBulb);
    bb.position.set(1.5, 0.1, -0.45);
    this.membrane.add(rb, bb);

    // The sad $9 membrane keyboard: flat, beige, chiclet keys
    const body = new THREE.Mesh(this.geo(new RoundedBoxGeometry(3.4, 0.16, 1.3, 3, 0.06)), this.mat({ color: "#cfc7b4", roughness: 0.85 }));
    this.membrane.add(body);
    const capGeo = this.geo(new RoundedBoxGeometry(0.17, 0.05, 0.17, 2, 0.02));
    const capMat = this.mat({ color: "#efe9da", roughness: 0.9 });
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 16; c++) {
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.set(-1.5 + c * 0.2, 0.1, -0.4 + r * 0.2);
        this.membrane.add(cap);
      }
    }
    // Googly eyes
    const white = this.mat({ color: "#ffffff", roughness: 0.3 });
    const black = this.mat({ color: "#111111", roughness: 0.2 });
    for (const x of [-0.55, 0.55]) {
      const eye = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.32, 32, 16)), white);
      eye.scale.z = 0.55;
      eye.position.set(x, 0.45, 0.25);
      this.membrane.add(eye);
      const pupil = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.13, 24, 16)), black);
      pupil.scale.z = 0.4;
      pupil.position.set(x, 0.42, 0.43);
      this.membrane.add(pupil);
      this.pupils.push(pupil);
      const brow = new THREE.Mesh(this.geo(new RoundedBoxGeometry(0.55, 0.09, 0.08, 2, 0.03)), black);
      brow.position.set(x * 0.95, 0.88, 0.35);
      brow.rotation.z = x < 0 ? -0.45 : 0.45; // angry
      this.membrane.add(brow);
      this.brows.push(brow);
    }
    // Frown
    const mouth = new THREE.Mesh(this.geo(new THREE.TorusGeometry(0.28, 0.045, 12, 32, Math.PI)), black);
    mouth.position.set(0, 0.02, 0.68);
    mouth.rotation.x = -Math.PI / 2.6;
    this.membrane.add(mouth);

    this.membrane.rotation.x = 0.55;
    this.membrane.position.y = -0.1;
    s.add(this.membrane);

    // Falling keycaps
    const rainGeo = this.geo(new RoundedBoxGeometry(0.22, 0.14, 0.22, 2, 0.04));
    const colors = ["#e74c3c", "#f1c40f", "#2ecc71", "#3498db", "#9b59b6", "#ecf0f1"];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(rainGeo, this.mat({ color: colors[i % colors.length], roughness: 0.5 }));
      m.position.set((Math.random() - 0.5) * 9, Math.random() * 8, -1.5 - Math.random() * 4);
      s.add(m);
      this.rain.push({ m, v: 0.6 + Math.random() * 1.2, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(3) });
    }

    this.camera.position.set(0, 0.6, 5);
    this.camera.lookAt(0, 0.3, 0);
  }

  private mat(p: THREE.MeshStandardMaterialParameters) {
    const m = new THREE.MeshStandardMaterial(p);
    this.disposables.push(m);
    return m;
  }
  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.disposables.push(g);
    return g;
  }

  resize(w: number, h: number) {
    this.portrait = h > w;
    this.camera.position.z = this.portrait ? 9 : 5;
    this.camera.position.y = this.portrait ? 0.2 : 0.9;
  }

  update(dt: number, time: number) {
    // Alternate police lights
    const phase = Math.floor(time * 4) % 2;
    this.red.intensity = phase === 0 ? 25 : 0;
    this.blue.intensity = phase === 1 ? 25 : 0;
    this.redBulb.emissiveIntensity = phase === 0 ? 3 : 0.1;
    this.blueBulb.emissiveIntensity = phase === 1 ? 3 : 0.1;

    // Angry bouncing and shaking
    this.membrane.position.y = (this.portrait ? 0.5 : 0.35) + Math.abs(Math.sin(time * 5)) * 0.15;
    this.membrane.rotation.z = Math.sin(time * 23) * 0.02;
    this.membrane.rotation.y = Math.sin(time * 0.7) * 0.25;
    // Googly pupils wobble
    this.pupils.forEach((p, i) => {
      p.position.x = (i === 0 ? -0.55 : 0.55) + Math.sin(time * 7 + i) * 0.1;
      p.position.y = 0.42 + Math.cos(time * 9 + i * 2) * 0.08;
    });
    this.brows.forEach((b, i) => (b.position.y = 0.88 + Math.sin(time * 10 + i) * 0.03));

    for (const r of this.rain) {
      r.m.position.y -= r.v * dt;
      r.m.rotation.x += r.spin.x * dt;
      r.m.rotation.y += r.spin.y * dt;
      if (r.m.position.y < -4) r.m.position.y = 5;
    }
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
  }
}
