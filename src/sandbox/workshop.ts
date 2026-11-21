/** Dev-only: the workshop scene with a keyboard on the bench (?view=workshop&bv=overview|top|low). */
import "@fontsource/inter/600.css";
import { getCatalog } from "../data/catalog";
import type { LayoutId } from "../data/layouts";
import { CASE_MATERIALS, PCBS, PLATES, STABS } from "../data/parts";
import { Vector3 } from "@babylonjs/core";
import { GameApp } from "../engine/app";
import { Board } from "../engine/keyboard/board";
import { loadSwitchModels } from "../engine/keyboard/switchModels";
import { WorkshopScene, type BenchView } from "../engine/workshop/workshopScene";

export async function run(canvas: HTMLCanvasElement, q: URLSearchParams) {
  await document.fonts.load("600 40px Inter");
  const app = new GameApp(canvas);
  const ws = new WorkshopScene(app, q.get("name") ?? "Thock & Roll");
  app.set(ws);
  await Promise.all([ws.ready, loadSwitchModels()]);
  const cat = getCatalog(q.get("seed") ?? "SANDBOX");
  const parts = (q.get("parts") ?? "pcb,plate,stabs,switches,caps").split(",");
  if (parts[0] !== "none") {
    const b = new Board(ws.scene, (q.get("layout") ?? "65") as LayoutId, ws.shadows);
    b.base.parent = ws.benchAnchor;
    const cm = CASE_MATERIALS.find((c) => c.id === (q.get("case") ?? "aluminum"))!;
    b.setSwitchLook(cat.switches[Number(q.get("sw") ?? 0)]);
    b.setCase(cm, q.get("color") ? "#" + q.get("color") : cm.colors[Number(q.get("ci") ?? 2)].hex, false);
    b.setDampening(["caseFoam", "plateFoam"], false);
    b.setPcb(PCBS[Number(q.get("pcb") ?? 0)], false);
    if (parts.includes("plate")) b.setPlate(PLATES[Number(q.get("plate") ?? 0)], false);
    if (parts.includes("stabs")) b.setStabs(STABS[1], true, false);
    if (parts.includes("switches")) b.setAllSwitches(true, true);
    if (parts.includes("caps")) {
      const kc = cat.keycaps[Number(q.get("kc") ?? 1)];
      b.setKeycaps(q.get("profile") ? { ...kc, profile: q.get("profile") as never } : kc);
      b.setAllCaps(true, true);
    }
    ws.setBenchView((q.get("bv") ?? "overview") as BenchView, { w: b.outerWidth, d: b.outerDepth });
  }
  if (q.get("insets")) {
    const [l, t, bo] = q.get("insets")!.split(",").map(Number);
    ws.setInsets(l, t, bo);
  }
  if (q.get("focus")) {
    const [x, y, z, w, d, beta] = q.get("focus")!.split(",").map(Number);
    ws.setBenchView({ target: new Vector3(x, y, z), w, d, beta });
  }
  // let the camera settle instantly
  for (let i = 0; i < 200; i++) ws.update(0.05);
  (window as unknown as { ready: boolean }).ready = true;
}
