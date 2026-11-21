/** Dev-only art sandbox: ?view=caps | switches | board2 — PBR previews of the generated keyboard parts. */
import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, Mesh, MeshBuilder, PBRMaterial, Scene, ShadowGenerator, Vector3, VertexData } from "@babylonjs/core";
import { KEYCAP_PROFILES, type ProfileRow } from "../data/profiles";
import { getCatalog } from "../data/catalog";
import { CASE_MATERIALS, PCBS, PLATES, STABS } from "../data/parts";
import type { LayoutId } from "../data/layouts";
import { Board } from "../engine/keyboard/board";
import { loadSwitchModels } from "../engine/keyboard/switchModels";
import { buildKeycap, PITCH } from "../engine/keyboard/keycapGeo";

export async function run(canvas: HTMLCanvasElement, q: URLSearchParams) {
  const engine = new Engine(canvas, true, { stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.16, 0.17, 0.19, 1);
  const hemi = new HemisphericLight("h", new Vector3(0.2, 1, -0.3), scene);
  hemi.intensity = 0.8;
  hemi.groundColor = new Color3(0.25, 0.22, 0.2);
  const sun = new DirectionalLight("s", new Vector3(-0.4, -1, 0.6), scene);
  sun.position = new Vector3(200, 400, -300);
  sun.intensity = 2.2;
  const sg = new ShadowGenerator(2048, sun);
  sg.usePercentageCloserFiltering = true;
  const cam = new ArcRotateCamera("cam", Number(q.get("a") ?? Math.PI / 2 + 0.5), Number(q.get("b") ?? 1.0), Number(q.get("r") ?? 260), Vector3.Zero(), scene);
  cam.minZ = 1;
  cam.maxZ = 5000;
  cam.attachControl(canvas, true);
  const ground = MeshBuilder.CreateGround("g", { width: 2000, height: 2000 }, scene);
  const gm = new PBRMaterial("gm", scene);
  gm.albedoColor = Color3.FromHexString("#3a4350");
  gm.roughness = 0.8;
  gm.metallic = 0;
  ground.material = gm;
  ground.receiveShadows = true;
  const view = q.get("view");
  if (view === "caps") {
    const colors = ["#e9e4d8", "#2f3b4c", "#c8553d", "#6a8d73", "#d9b44a", "#8e7dbe", "#4f6d7a", "#ffb3c1"];
    KEYCAP_PROFILES.forEach((p, pi) => {
      const mat = new PBRMaterial(`m${p}`, scene);
      mat.albedoColor = Color3.FromHexString(colors[pi]);
      mat.roughness = 0.6;
      mat.metallic = 0;
      const z = (pi - KEYCAP_PROFILES.length / 2) * PITCH * 1.25;
      const items: { w: number; row: ProfileRow }[] = [{ w: 1, row: 1 }, { w: 1, row: 2 }, { w: 1, row: 3 }, { w: 1, row: 4 }, { w: 2.25, row: 3 }, { w: 6.25, row: 4 }];
      let x = -110;
      for (const it of items) {
        const g = buildKeycap({ profile: p, row: it.row, w: it.w, h: 1 });
        const m = new Mesh(`cap-${p}-${it.row}-${it.w}`, scene);
        const vd = new VertexData();
        vd.positions = g.positions;
        vd.normals = g.normals;
        vd.indices = g.indices;
        vd.uvs = g.uvs;
        vd.applyToMesh(m);
        m.material = mat;
        m.position.set(-(x + (it.w * PITCH) / 2), 0, z);
        x += it.w * PITCH + 2;
        sg.addShadowCaster(m);
        m.receiveShadows = true;
      }
    });
  }
  if (view === "board2") {
    await loadSwitchModels();
    const cat = getCatalog(q.get("seed") ?? "SANDBOX");
    const b = new Board(scene, (q.get("layout") ?? "65") as LayoutId, sg);
    const cm = CASE_MATERIALS.find((c) => c.id === (q.get("case") ?? "aluminum"))!;
    const sw = cat.switches[Number(q.get("sw") ?? 0)];
    b.setSwitchLook(sw);
    b.setCase(cm, q.get("color") ? "#" + q.get("color") : cm.colors[1].hex, false);
    b.setDampening(["caseFoam", "plateFoam"], false);
    b.setPcb(PCBS[Number(q.get("pcb") ?? 0)], false);
    const parts = (q.get("parts") ?? "pcb,plate,stabs,switches,caps").split(",");
    if (parts.includes("plate")) b.setPlate(PLATES[Number(q.get("plate") ?? 0)], false);
    if (parts.includes("stabs")) b.setStabs(STABS[1], true, false);
    if (parts.includes("switches")) b.setAllSwitches(true, true);
    if (parts.includes("caps")) {
      const kc = cat.keycaps[Number(q.get("kc") ?? 0)];
      b.setKeycaps(q.get("profile") ? { ...kc, profile: q.get("profile") as never } : kc);
      b.setAllCaps(true, true);
    }
    b.base.scaling.setAll(1000); // sandbox works in mm
    cam.target = new Vector3(0, 10, 0);
  }
  (window as unknown as { ready: boolean }).ready = true;
  if (q.get("still")) {
    // software GL is slow: render a few frames, then stop (screenshots)
    let n = 0;
    engine.runRenderLoop(() => {
      scene.render();
      if (++n >= 3) engine.stopRenderLoop();
    });
  } else engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}
