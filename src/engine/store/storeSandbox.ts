/** Dev-only: render the store in a given mode for screenshots. */
import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/700.css";
import { Rng } from "../../core/rng";
import { defaultTechnician, randomAvatar } from "../../data/avatar";
import { getCatalog } from "../../data/catalog";
import { CASE_MATERIALS, PCBS, PLATES, STABS } from "../../data/parts";
import { GameApp } from "../app";
import { Board } from "../keyboard/board";
import { StoreScene, type StoreMode } from "./storeScene";

export async function run(canvas: HTMLCanvasElement, q: URLSearchParams) {
  await document.fonts.load("700 40px Fredoka");
  const app = new GameApp(canvas);
  const rng = new Rng(q.get("seed") ?? "1");
  const store = new StoreScene(app, defaultTechnician(() => rng.next()), q.get("name") ?? "Thock & Roll");
  app.set(store);
  const cat = getCatalog("SANDBOX");
  // display keyboards
  store.layout.displayAnchors.forEach((a, i) => {
    const b = new Board(store.scene, i ? "75" : "65", store.shadows);
    const cm = CASE_MATERIALS[i ? 0 : 2];
    b.setCase(cm, cm.colors[i + 1].hex, false);
    b.setPlate(PLATES[0], false);
    b.setSwitchLook(cat.switches[i]);
    b.setAllSwitches(true, true);
    b.setKeycaps(cat.keycaps[i + 2]);
    b.setAllCaps(true, true);
    b.root.parent = a;
  });
  const mode = (q.get("mode") ?? "attract") as StoreMode;
  if (mode === "bench") {
    const b = new Board(store.scene, "65", store.shadows);
    const cm = CASE_MATERIALS[0];
    b.setCase(cm, cm.colors[3].hex, false);
    b.setPcb(PCBS[0], false);
    b.setPlate(PLATES[0], false);
    b.setStabs(STABS[1], true);
    b.setSwitchLook(cat.switches[2]);
    b.setAllSwitches(true, true);
    b.root.parent = store.layout.benchAnchor;
    store.setBenchView((q.get("bv") ?? "overview") as never, { w: b.outerWidth, d: b.outerDepth });
  }
  if (q.get("customer")) store.spawnCustomer(randomAvatar(() => rng.next()));
  store.setMode(mode, true);
  if (q.get("insets")) {
    const [l, t, b] = q.get("insets")!.split(",").map(Number);
    store.setInsets(l, t, b);
  }
  if (mode === "play" && q.get("alpha")) store.camera.alpha = Number(q.get("alpha"));
  (window as unknown as { ready: boolean; store: StoreScene }).ready = true;
  (window as unknown as { store: StoreScene }).store = store;
}
