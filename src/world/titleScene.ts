/**
 * Title / menu backdrop: a workbench with a freshly generated keyboard that types by itself.
 * The colorway changes every time (a taste of "never the same twice").
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Rng } from "../core/rng";
import { play } from "../audio/engine";
import { randomColorway } from "./colorway";
import { animateKeys, buildKeyboard, type KeyboardModel } from "./keyboardModel";
import type { SceneController } from "./stage";

export class TitleScene implements SceneController {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
  maxFps = 30;
  private kb: KeyboardModel;
  private disposables: { dispose(): void }[] = [];
  private nextPress = 0.6;
  private rng: Rng;
  private typingWord: string[] = [];
  private portrait = false;
  /** Each title visit gets its own board sound, like each generated board. */
  private sound: "kb.thock" | "kb.marbly" | "kb.clack";

  constructor(renderer: THREE.WebGLRenderer, seed: string = String(Math.random())) {
    this.rng = new Rng(seed);
    this.sound = this.rng.pick(["kb.thock", "kb.marbly", "kb.clack"] as const);
    const s = this.scene;
    s.background = new THREE.Color("#efe3d3");
    s.fog = new THREE.Fog("#efe3d3", 6, 14);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environment = env;
    s.environmentIntensity = 0.55;
    this.disposables.push(env, pmrem);

    const hemi = new THREE.HemisphereLight("#fff4e6", "#8c7a66", 0.6);
    s.add(hemi);
    const sun = new THREE.DirectionalLight("#fff1dc", 2.2);
    sun.position.set(2.5, 5, 2.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -2;
    sun.shadow.camera.right = 2;
    sun.shadow.camera.top = 2;
    sun.shadow.camera.bottom = -2;
    sun.shadow.bias = -0.0004;
    sun.shadow.radius = 4;
    s.add(sun);
    const rim = new THREE.DirectionalLight("#b8d4ff", 0.6);
    rim.position.set(-3, 2, -3);
    s.add(rim);

    // Desk
    const wood = this.mat({ color: "#b98552", roughness: 0.7 });
    const desk = new THREE.Mesh(this.geo(new RoundedBoxGeometry(4.2, 0.08, 2.2, 3, 0.02)), wood);
    desk.position.y = -0.04;
    desk.receiveShadow = true;
    s.add(desk);
    // Wall
    const wall = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(12, 6)), this.mat({ color: "#e8d9c4", roughness: 0.95 }));
    wall.position.set(0, 2, -1.1);
    s.add(wall);
    // Pegboard with tools
    const peg = new THREE.Mesh(this.geo(new THREE.BoxGeometry(1.6, 0.8, 0.02)), this.mat({ color: "#d6b98c", roughness: 0.9 }));
    peg.position.set(0.6, 0.75, -1.08);
    peg.receiveShadow = true;
    s.add(peg);
    const toolColors = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71"];
    toolColors.forEach((c, i) => {
      const handle = new THREE.Mesh(this.geo(new THREE.CapsuleGeometry(0.025, 0.2, 4, 8)), this.mat({ color: c, roughness: 0.5 }));
      handle.position.set(0.05 + i * 0.35, 0.8, -1.05);
      handle.castShadow = true;
      s.add(handle);
      const tip = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.006, 0.006, 0.18)), this.mat({ color: "#bbb", metalness: 0.9, roughness: 0.3 }));
      tip.position.set(0.05 + i * 0.35, 0.6, -1.05);
      s.add(tip);
    });

    // Desk mat
    const matColor = new THREE.Color().setHSL(this.rng.next(), 0.25, 0.25);
    const deskMat = new THREE.Mesh(this.geo(new RoundedBoxGeometry(2.1, 0.01, 0.95, 2, 0.004)), this.mat({ color: matColor, roughness: 0.95 }));
    deskMat.position.set(0, 0.005, 0.15);
    deskMat.receiveShadow = true;
    s.add(deskMat);

    // Keyboard
    this.kb = buildKeyboard(randomColorway(this.rng));
    this.kb.group.scale.setScalar(0.1);
    this.kb.group.position.set(0, 0.1, 0.15);
    this.kb.group.rotation.x = 0.07; // typing angle
    s.add(this.kb.group);

    // Mug
    const mugMat = this.mat({ color: new THREE.Color().setHSL(this.rng.next(), 0.5, 0.6), roughness: 0.35 });
    const mug = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.12, 0.11, 0.26, 32)), mugMat);
    mug.position.set(1.35, 0.13, -0.25);
    mug.castShadow = true;
    s.add(mug);
    const handle = new THREE.Mesh(this.geo(new THREE.TorusGeometry(0.07, 0.02, 12, 24)), mugMat);
    handle.position.set(1.48, 0.14, -0.25);
    s.add(handle);
    const coffee = new THREE.Mesh(this.geo(new THREE.CircleGeometry(0.105, 32)), this.mat({ color: "#3b2414", roughness: 0.2 }));
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.set(1.35, 0.23, -0.25);
    s.add(coffee);

    // Switch tester / little jars of switches
    for (let i = 0; i < 3; i++) {
      const jar = new THREE.Mesh(
        this.geo(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 24)),
        this.mat({ color: "#ffffff", transparent: true, opacity: 0.35, roughness: 0.05 }),
      );
      jar.position.set(-1.45 + i * 0.22, 0.08, -0.55);
      s.add(jar);
      const fill = new THREE.Mesh(
        this.geo(new THREE.CylinderGeometry(0.08, 0.08, 0.09, 24)),
        this.mat({ color: ["#e74c3c", "#f5c542", "#5b9bd5"][i], roughness: 0.6 }),
      );
      fill.position.set(-1.45 + i * 0.22, 0.05, -0.55);
      s.add(fill);
    }

    // Plant
    const pot = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.13, 0.1, 0.22, 24)), this.mat({ color: "#c96f4a", roughness: 0.8 }));
    pot.position.set(-1.6, 0.11, 0.05);
    pot.castShadow = true;
    s.add(pot);
    const leafMat = this.mat({ color: "#4f9a57", roughness: 0.7 });
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.09, 12, 8)), leafMat);
      leaf.scale.set(0.5, 1.6, 0.25);
      const a = (i / 7) * Math.PI * 2;
      leaf.position.set(-1.6 + Math.cos(a) * 0.06, 0.34, 0.05 + Math.sin(a) * 0.06);
      leaf.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
      leaf.castShadow = true;
      s.add(leaf);
    }

    this.camera.position.set(0, 1.3, 2.3);
    this.camera.lookAt(0, 0.1, 0);
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
    this.camera.fov = this.portrait ? 55 : 35;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, time: number) {
    // Gentle camera drift
    const a = Math.sin(time * 0.12) * 0.35;
    const r = this.portrait ? 3.2 : 2.4;
    this.camera.position.set(Math.sin(a) * r, this.portrait ? 1.9 : 1.25, Math.cos(a) * r);
    this.camera.lookAt(0, this.portrait ? 0.35 : 0.12, 0);

    // The keyboard types random "words" by itself
    this.nextPress -= dt;
    if (this.nextPress <= 0) {
      if (this.typingWord.length === 0) {
        const n = this.rng.int(3, 7);
        for (let i = 0; i < n; i++) this.typingWord.push(this.rng.pick(this.kb.keys.filter((k) => k.label.length === 1)).label);
        this.typingWord.push("Space");
        this.nextPress = this.rng.range(0.6, 1.6);
        return;
      }
      const label = this.typingWord.shift()!;
      const key = this.kb.keys.find((k) => k.label === label);
      if (key) {
        key.press = 1;
        play(label === "Space" ? "kb.spacebar" : this.sound, { volume: 0.35, pan: (key.mesh.position.x / 8) * 0.6 });
      }
      this.nextPress = this.rng.range(0.08, 0.2);
    }
    animateKeys(this.kb, dt);
  }

  dispose() {
    this.kb.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
