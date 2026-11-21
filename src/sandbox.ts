/** Dev-only visual sandbox: ?view=humans | ?view=human&seed=N — used to iterate on procedural art. */
import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, Vector3 } from "@babylonjs/core";
import { randomAvatar, defaultTechnician } from "./data/avatar";
import { Rng } from "./core/rng";
import { Human } from "./engine/human/human";
import { Board } from "./engine/keyboard/board";
import { getCatalog } from "./data/catalog";
import { CASE_MATERIALS, PCBS, PLATES, STABS } from "./data/parts";

const q = new URLSearchParams(location.search);
const canvas = document.getElementById("c") as HTMLCanvasElement;
if (["caps", "switches", "board2"].includes(q.get("view") ?? "")) {
  void import("./sandbox/art").then((m) => m.run(canvas, q));
  throw new Error("art sandbox started");
}
if (q.get("view") === "workshop") {
  void import("./sandbox/workshop").then((m) => m.run(canvas, q));
  throw new Error("workshop sandbox started");
}
if (q.get("view") === "envgen") {
  void import("./sandbox/envgen").then((m) => m.run(canvas));
  throw new Error("envgen started");
}
if (q.get("view") === "store") {
  void import("./engine/store/storeSandbox").then((m) => m.run(canvas, q));
  throw new Error("store sandbox started"); // stop the rest of this module
}
const engine = new Engine(canvas, true, { stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.93, 0.88, 0.8, 1);
const hemi = new HemisphericLight("h", new Vector3(0, 1, 0), scene);
hemi.intensity = 0.65;
hemi.groundColor = new Color3(0.45, 0.38, 0.32);
const sun = new DirectionalLight("s", new Vector3(-0.5, -1, -0.7), scene);
sun.position = new Vector3(5, 10, 7);
sun.intensity = 1.6;
const sg = new ShadowGenerator(2048, sun);
sg.usePercentageCloserFiltering = true;
const ground = MeshBuilder.CreateGround("g", { width: 20, height: 20 }, scene);
const gm = new StandardMaterial("gm", scene);
gm.diffuseColor = Color3.FromHexString("#d9c7ab");
gm.specularColor = Color3.Black();
ground.material = gm;
ground.receiveShadows = true;

const view = q.get("view") ?? "humans";
const humans: Human[] = [];
const seed = q.get("seed") ?? "1";
const cam = new ArcRotateCamera("cam", Math.PI / 2, 1.35, 6, new Vector3(0, 0.95, 0), scene);
cam.attachControl(canvas, true);
cam.minZ = 0.05;
if (view === "humans") {
  const n = Number(q.get("n") ?? 6);
  for (let i = 0; i < n; i++) {
    const rng = new Rng(seed + ":" + i);
    const h = new Human(scene, i === 0 ? defaultTechnician(() => rng.next()) : randomAvatar(() => rng.next()), sg, `h${i}`);
    h.root.position.x = (i - (n - 1) / 2) * 0.8;
    humans.push(h);
  }
  cam.target = new Vector3(0, Number(q.get("ty") ?? 0.95), 0);
  cam.radius = Number(q.get("r") ?? 5.2);
} else if (view === "face") {
  const rng = new Rng(seed);
  const h = new Human(scene, randomAvatar(() => rng.next()), sg, "h");
  humans.push(h);
  cam.target = new Vector3(0, 1.6 * h.params.height, 0);
  cam.radius = 0.75;
  if (q.get("expr")) h.setExpression(q.get("expr") as never);
} else if (view === "walk") {
  const rng = new Rng(seed);
  const h = new Human(scene, randomAvatar(() => rng.next()), sg, "h");
  h.speed = 1.3;
  h.setAction("walk");
  humans.push(h);
  cam.alpha = 0;
  cam.radius = 3.2;
}
let board: Board | null = null;
if (view === "board") {
  const cat = getCatalog("SANDBOX");
  board = new Board(scene, (q.get("layout") ?? "65") as never, sg);
  const stage = q.get("stage") ?? "full";
  const cm = CASE_MATERIALS.find((m) => m.id === (q.get("case") ?? "aluminum"))!;
  board.setCase(cm, cm.colors[1].hex, false);
  board.setPcb(PCBS[0], false);
  if (stage !== "pcb") board.setPlate(PLATES[0], false);
  if (stage !== "pcb") board.setStabs(STABS[1], true);
  board.setSwitchLook(cat.switches[0]);
  if (stage === "switches" || stage === "full") board.setAllSwitches(true, true);
  if (stage === "full") {
    board.setKeycaps(cat.keycaps[Number(q.get("caps") ?? 0)]);
    board.setAllCaps(true, true);
  }
  board.root.position.y = 0.02;
  cam.target = new Vector3(0, 0.02, 0);
  cam.radius = Number(q.get("r") ?? 0.55);
  cam.beta = Number(q.get("beta") ?? 0.9);
  cam.alpha = -Math.PI / 2;
}
cam.alpha = Number(q.get("alpha") ?? cam.alpha);
if (q.get("action")) humans.forEach((h) => h.setAction(q.get("action") as never));
let t = Number(q.get("t") ?? 0);
engine.runRenderLoop(() => {
  const dt = engine.getDeltaTime() / 1000;
  t += dt;
  humans.forEach((h) => h.update(q.get("freeze") ? 0.0001 : dt));
  board?.update(dt);
  scene.render();
});
window.addEventListener("resize", () => engine.resize());
(window as unknown as { ready: boolean }).ready = true;
