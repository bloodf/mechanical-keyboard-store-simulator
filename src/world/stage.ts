/** Owns the WebGL renderer and swaps between scene controllers (title, cheater, shop…). */
import * as THREE from "three";

export interface SceneController {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number, time: number): void;
  resize?(w: number, h: number): void;
  dispose(): void;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  private current: SceneController | null = null;
  private timer = new THREE.Timer();
  private running = true;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.id = "gl";
    container.appendChild(this.renderer.domElement);
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.timer.connect(document); // pauses time while the tab is hidden
    this.renderer.setAnimationLoop((ts) => this.frame(ts));
  }

  /** Stop rendering entirely (e.g. another tab took over the store). */
  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  set(ctrl: SceneController) {
    this.current?.dispose();
    this.current = ctrl;
    this.resize();
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.current) {
      this.current.camera.aspect = w / h;
      this.current.camera.updateProjectionMatrix();
      this.current.resize?.(w, h);
    }
  }

  private frame(ts: number) {
    if (!this.running) return;
    this.timer.update(ts);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    if (!this.current) return;
    this.current.update(dt, this.timer.getElapsed());
    this.renderer.render(this.current.scene, this.current.camera);
  }
}
