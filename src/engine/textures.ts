/** Procedural textures drawn on canvases (no image files). */
import { DynamicTexture, Texture, type Scene } from "@babylonjs/core";
import { FONT } from "../gui/theme";

type Ctx = CanvasRenderingContext2D;

function dyn(name: string, w: number, h: number, scene: Scene, draw: (g: Ctx, w: number, h: number) => void, opts: { mipmaps?: boolean; wrap?: boolean } = {}): DynamicTexture {
  const t = new DynamicTexture(name, { width: w, height: h }, scene, opts.mipmaps ?? true, Texture.TRILINEAR_SAMPLINGMODE);
  const g = t.getContext() as unknown as Ctx;
  draw(g, w, h);
  t.update(true);
  if (opts.wrap) t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 8;
  return t;
}

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

export function woodFloor(scene: Scene): DynamicTexture {
  seed = 7;
  return dyn("woodFloor", 1024, 1024, scene, (g, w, h) => {
    const rows = 8;
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * 300;
      while (x < w) {
        const len = 220 + rnd() * 260;
        const l = 52 + rnd() * 10;
        g.fillStyle = `hsl(${28 + rnd() * 6}, ${42 + rnd() * 10}%, ${l}%)`;
        g.fillRect(x, r * rh, len, rh);
        // grain
        for (let i = 0; i < 14; i++) {
          g.strokeStyle = `rgba(90,55,25,${0.05 + rnd() * 0.1})`;
          g.lineWidth = 1 + rnd() * 1.5;
          g.beginPath();
          const y = r * rh + rnd() * rh;
          g.moveTo(x, y);
          for (let k = 0; k <= len; k += 20) g.lineTo(x + k, y + Math.sin((k + i * 40) / 45) * 2.5);
          g.stroke();
        }
        g.fillStyle = "rgba(60,35,15,0.55)";
        g.fillRect(x, r * rh, 3, rh);
        x += len;
      }
      g.fillStyle = "rgba(60,35,15,0.45)";
      g.fillRect(0, r * rh, w, 3);
    }
  }, { wrap: true });
}

export function paintedWall(scene: Scene, hex: string, name = "wall"): DynamicTexture {
  seed = 3;
  return dyn(name, 512, 512, scene, (g, w, h) => {
    g.fillStyle = hex;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? "255,255,255" : "0,0,0"},${0.015 + rnd() * 0.02})`;
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
  }, { wrap: true });
}

export function cuttingMat(scene: Scene): DynamicTexture {
  return dyn("cutMat", 1024, 600, scene, (g, w, h) => {
    g.fillStyle = "#2f6e57";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i <= w; i += 24) {
      g.strokeStyle = i % 120 === 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.14)";
      g.lineWidth = i % 120 === 0 ? 2 : 1;
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, h);
      g.stroke();
    }
    for (let j = 0; j <= h; j += 24) {
      g.strokeStyle = j % 120 === 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.14)";
      g.lineWidth = j % 120 === 0 ? 2 : 1;
      g.beginPath();
      g.moveTo(0, j);
      g.lineTo(w, j);
      g.stroke();
    }
    g.fillStyle = "rgba(255,255,255,0.45)";
    g.font = `600 22px ${FONT}`;
    g.fillText("SELF-HEALING CUTTING MAT · 45° · 60° · THOCK", 20, h - 14);
  });
}

export function pegboard(scene: Scene): DynamicTexture {
  return dyn("pegboard", 512, 256, scene, (g, w, h) => {
    g.fillStyle = "#d3b182";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#8a6a45";
    for (let x = 16; x < w; x += 32) for (let y = 16; y < h; y += 32) {
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
    }
  }, { wrap: true });
}

export function cork(scene: Scene): DynamicTexture {
  seed = 11;
  return dyn("cork", 512, 384, scene, (g, w, h) => {
    g.fillStyle = "#c89a62";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? "120,80,40" : "235,200,150"},${0.2 + rnd() * 0.3})`;
      g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 2, 2 + rnd() * 2);
    }
  });
}

/** Poster with big text. */
export function poster(scene: Scene, name: string, bg: string, fg: string, lines: string[], sub: string): DynamicTexture {
  return dyn(name, 512, 720, scene, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = 10;
    g.strokeRect(24, 24, w - 48, h - 48);
    g.fillStyle = fg;
    g.textAlign = "center";
    g.font = `700 118px ${FONT}`;
    lines.forEach((l, i) => g.fillText(l, w / 2, 230 + i * 130));
    g.font = `600 34px ${FONT}`;
    g.fillText(sub, w / 2, h - 80);
    // a cute keycap
    g.fillStyle = fg;
    g.beginPath();
    g.roundRect(w / 2 - 60, 80, 120, 80, 16);
    g.fill();
    g.fillStyle = bg;
    g.font = `700 48px ${FONT}`;
    g.fillText("⌘", w / 2, 138);
  });
}

/** Street view behind the shop windows. */
export function streetView(scene: Scene): DynamicTexture {
  seed = 21;
  return dyn("street", 1024, 512, scene, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.7);
    sky.addColorStop(0, "#8fd0ff");
    sky.addColorStop(1, "#e9f6ff");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    // buildings across the street
    let x = 0;
    while (x < w) {
      const bw = 120 + rnd() * 160;
      const bh = 160 + rnd() * 200;
      g.fillStyle = `hsl(${rnd() * 360}, 30%, ${70 + rnd() * 15}%)`;
      g.fillRect(x, h * 0.72 - bh, bw, bh);
      g.fillStyle = "rgba(60,90,120,0.45)";
      for (let wx = x + 16; wx < x + bw - 30; wx += 38) for (let wy = h * 0.72 - bh + 20; wy < h * 0.72 - 40; wy += 48) g.fillRect(wx, wy, 22, 28);
      x += bw + 8;
    }
    g.fillStyle = "#9aa0a6";
    g.fillRect(0, h * 0.72, w, h * 0.08);
    g.fillStyle = "#5d6166";
    g.fillRect(0, h * 0.8, w, h * 0.2);
    g.fillStyle = "#e9e9e9";
    for (let i = 0; i < w; i += 80) g.fillRect(i, h * 0.9, 40, 6);
  });
}

/** Neon-style store sign text (redrawn when the store is renamed). */
export function signTexture(scene: Scene, text: string, color: string, existing?: DynamicTexture): DynamicTexture {
  const draw = (g: Ctx, w: number, h: number) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = "center";
    g.textBaseline = "middle";
    let size = 230;
    g.font = `700 ${size}px ${FONT}`;
    while (g.measureText(text).width > w - 80 && size > 40) {
      size -= 6;
      g.font = `700 ${size}px ${FONT}`;
    }
    g.shadowColor = color;
    g.shadowBlur = 40;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2);
    g.shadowBlur = 12;
    g.fillStyle = "#ffffff";
    g.globalAlpha = 0.85;
    g.fillText(text, w / 2, h / 2);
    g.globalAlpha = 1;
  };
  if (existing) {
    draw(existing.getContext() as unknown as Ctx, existing.getSize().width, existing.getSize().height);
    existing.update(true);
    return existing;
  }
  const t = dyn("sign", 2048, 320, scene, draw);
  t.hasAlpha = true;
  return t;
}

/** Soft round particle sprite (smoke, sparks, confetti). */
export function particleDot(scene: Scene): DynamicTexture {
  const t = dyn("dot", 64, 64, scene, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  });
  t.hasAlpha = true;
  return t;
}
