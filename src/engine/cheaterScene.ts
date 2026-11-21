/** "CHEATER DETECTED": an angry membrane keyboard with googly eyes, police lights, falling keycaps. */
import { Color3, Color4, FreeCamera, HemisphericLight, Mesh, MeshBuilder, PointLight, Scene, StandardMaterial, TransformNode, Vector3, DirectionalLight } from "@babylonjs/core";
import type { GameApp, GameScene } from "./app";
import { roundedBox } from "./geometry";
import { Ui } from "../gui/ui";

export class CheaterScene implements GameScene {
  readonly scene: Scene;
  readonly ui: Ui;
  maxFps = 30;
  private kb!: TransformNode;
  private pupils: Mesh[] = [];
  private red: PointLight;
  private blue: PointLight;
  private redBulb: StandardMaterial;
  private blueBulb: StandardMaterial;
  private rain: { m: Mesh; v: number; spin: Vector3 }[] = [];
  private t = 0;
  private camera: FreeCamera;

  constructor(app: GameApp) {
    const s = (this.scene = new Scene(app.engine));
    s.clearColor = new Color4(0.1, 0.04, 0.07, 1);
    this.kb = new TransformNode("membrane", s);
    const hemi = new HemisphericLight("h", new Vector3(0, 1, 0), s);
    hemi.intensity = 0.6;
    const key = new DirectionalLight("k", new Vector3(-0.3, -0.8, 0.6), s);
    key.intensity = 0.9;
    this.red = new PointLight("red", new Vector3(-2.2, 1.6, -1), s);
    this.red.diffuse = Color3.FromHexString("#ff2040");
    this.blue = new PointLight("blue", new Vector3(2.2, 1.6, -1), s);
    this.blue.diffuse = Color3.FromHexString("#2050ff");
    const m = (hex: string, emissive?: string) => {
      const x = new StandardMaterial(hex, s);
      x.diffuseColor = Color3.FromHexString(hex);
      x.specularColor = new Color3(0.2, 0.2, 0.2);
      if (emissive) x.emissiveColor = Color3.FromHexString(emissive);
      return x;
    };
    const body = roundedBox("body", { w: 3.4, h: 0.16, d: 1.3, r: 0.06 }, s);
    body.material = m("#cfc7b4");
    body.parent = this.kb;
    const capMat = m("#efe9da");
    const cap = roundedBox("cap", { w: 0.17, h: 0.05, d: 0.17, r: 0.02 }, s);
    cap.material = capMat;
    cap.parent = this.kb;
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 16; c++) {
        const inst = cap.createInstance(`c${r}-${c}`);
        inst.parent = this.kb;
        inst.position.set(-1.5 + c * 0.2, 0.1, 0.4 - r * 0.2);
      }
    cap.setEnabled(false);
    this.redBulb = m("#550010", "#000000");
    this.blueBulb = m("#000d55", "#000000");
    for (const [x, mat] of [[-1.5, this.redBulb], [1.5, this.blueBulb]] as const) {
      const b = MeshBuilder.CreateSphere("bulb", { diameter: 0.44, slice: 0.5 }, s);
      b.material = mat;
      b.parent = this.kb;
      b.position.set(x, 0.08, 0.45);
    }
    const white = m("#ffffff");
    const black = m("#111111");
    for (const x of [-0.55, 0.55]) {
      const eye = MeshBuilder.CreateSphere("eye", { diameter: 0.64, segments: 24 }, s);
      eye.material = white;
      eye.parent = this.kb;
      eye.scaling.z = 0.55;
      eye.position.set(x, 0.45, -0.25);
      const pupil = MeshBuilder.CreateSphere("pupil", { diameter: 0.26, segments: 16 }, s);
      pupil.material = black;
      pupil.parent = this.kb;
      pupil.scaling.z = 0.4;
      pupil.position.set(x, 0.42, -0.43);
      this.pupils.push(pupil);
      const brow = roundedBox("brow", { w: 0.55, h: 0.09, d: 0.08, r: 0.03 }, s);
      brow.material = black;
      brow.parent = this.kb;
      brow.position.set(x * 0.95, 0.88, -0.35);
      brow.rotation.z = x < 0 ? 0.45 : -0.45;
    }
    const mouth = MeshBuilder.CreateTorus("mouth", { diameter: 0.56, thickness: 0.09, tessellation: 32 }, s);
    mouth.material = black;
    mouth.parent = this.kb;
    mouth.position.set(0, 0.02, -0.68);
    mouth.rotation.x = -Math.PI / 2.6;
    mouth.scaling.set(1, 1, 0.5);
    this.kb.rotation.x = -0.55;
    const colors = ["#e74c3c", "#f1c40f", "#2ecc71", "#3498db", "#9b59b6", "#ecf0f1"];
    const rainCap = roundedBox("rain", { w: 0.22, h: 0.14, d: 0.22, r: 0.04 }, s);
    rainCap.setEnabled(false);
    for (let i = 0; i < 40; i++) {
      const r = rainCap.clone(`r${i}`)!;
      r.setEnabled(true);
      r.material = m(colors[i % colors.length]);
      r.position.set((Math.random() - 0.5) * 9, Math.random() * 8, 1.5 + Math.random() * 4);
      this.rain.push({ m: r, v: 0.6 + Math.random() * 1.2, spin: new Vector3(Math.random(), Math.random(), Math.random()).scale(3) });
    }
    this.camera = new FreeCamera("cam", new Vector3(0, 0.9, -5), s);
    this.camera.setTarget(new Vector3(0, 0.35, 0));
    this.ui = new Ui(s);
    this.resize();
  }

  resize() {
    this.ui.fit();
    const portrait = this.ui.portrait;
    this.camera.position.set(0, portrait ? 0.2 : 0.9, portrait ? -9 : -5);
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const phase = Math.floor(t * 4) % 2;
    this.red.intensity = phase === 0 ? 3 : 0;
    this.blue.intensity = phase === 1 ? 3 : 0;
    this.redBulb.emissiveColor = phase === 0 ? Color3.FromHexString("#ff2040") : Color3.Black();
    this.blueBulb.emissiveColor = phase === 1 ? Color3.FromHexString("#2050ff") : Color3.Black();
    this.kb.position.y = (this.ui.portrait ? 0.6 : 0.35) + Math.abs(Math.sin(t * 5)) * 0.15;
    this.kb.rotation.z = Math.sin(t * 23) * 0.02;
    this.kb.rotation.y = Math.sin(t * 0.7) * 0.25;
    this.pupils.forEach((p, i) => {
      p.position.x = (i === 0 ? -0.55 : 0.55) + Math.sin(t * 7 + i) * 0.1;
      p.position.y = 0.42 + Math.cos(t * 9 + i * 2) * 0.08;
    });
    for (const r of this.rain) {
      r.m.position.y -= r.v * dt;
      r.m.rotation.x += r.spin.x * dt;
      r.m.rotation.y += r.spin.y * dt;
      if (r.m.position.y < -4) r.m.position.y = 5;
    }
  }

  dispose() {
    this.ui.dispose();
    this.scene.dispose();
  }
}
