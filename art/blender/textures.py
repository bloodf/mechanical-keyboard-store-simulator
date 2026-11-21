"""Procedural texture images (PIL + numpy) for the workshop: wood, pegboard, labels, posters."""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FONTS = os.path.join(ROOT, "node_modules", "@fontsource", "inter", "files")


def font(size, weight=700):
    return ImageFont.truetype(os.path.join(FONTS, f"inter-latin-{weight}-normal.woff"), size)


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def smooth_noise(w, h, scale, rng, octaves=4):
    """Value noise (sum of upscaled random grids), 0..1."""
    acc = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gw = max(2, int(w / scale * 2**o))
        gh = max(2, int(h / scale * 2**o))
        g = Image.fromarray((rng.random((gh, gw)) * 255).astype(np.uint8))
        acc += np.asarray(g.resize((w, h), Image.BICUBIC), np.float32) / 255 * amp
        tot += amp
        amp *= 0.5
    return acc / tot


def aniso_noise(w, h, sx, sy, rng, octaves=3):
    """Noise stretched along x (streaks): grid cell sx × sy px."""
    acc = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gw = max(2, int(w / sx * 2**o))
        gh = max(2, int(h / sy * 2**o))
        g = Image.fromarray((rng.random((gh, gw)) * 255).astype(np.uint8))
        acc += np.asarray(g.resize((w, h), Image.BICUBIC), np.float32) / 255 * amp
        tot += amp
        amp *= 0.5
    return acc / tot


def wood(w, h, base="#b98a5a", dark="#7a5232", boards=6, seed=1, vertical_boards=False, ring_freq=55.0):
    """Boards of wood with the grain along x: long straight growth lines with gentle waviness,
    fine pore streaks, per-board tone and seams. Returns a PIL image."""
    if vertical_boards:
        return wood(h, w, base, dark, boards, seed, False, ring_freq).transpose(Image.TRANSPOSE)
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    bh = h / boards
    board = np.floor(yy / bh).astype(int)
    off = rng.random(boards + 1).astype(np.float32) * 10
    tone = (0.86 + 0.26 * rng.random(boards + 1)).astype(np.float32)
    wave = aniso_noise(w, h, w / 2.5, bh * 0.8, rng, 2)  # slow waviness of the growth lines
    lines_per_board = ring_freq / boards * 1.2
    v = (yy / bh - board) * lines_per_board + off[board] + (wave - 0.5) * 2.2
    rings = 0.5 + 0.5 * np.sin(v * 2 * np.pi)
    rings = rings**4  # thin dark latewood lines
    pores = aniso_noise(w, h, 60, 1.5, rng, 2)  # fine streaks
    blotch = aniso_noise(w, h, w / 4, bh, rng, 2)
    t = np.clip(rings * 0.5 + (pores - 0.5) * 0.5 + (blotch - 0.5) * 0.5 + 0.25, 0, 1)
    c0, c1 = hex_rgb(base), hex_rgb(dark)
    img = c0[None, None, :] * (1 - t[..., None]) + c1[None, None, :] * t[..., None]
    img *= tone[board][..., None]
    seam = np.abs(yy / bh - np.round(yy / bh)) * bh < 1.0
    img[seam] *= 0.6
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def planks(w, h, seed=2, rows=8, base="#a87a4f", dark="#6e4a2c"):
    """Floor planks: rows of boards with staggered end joints."""
    img = wood(w, h, base, dark, boards=rows, seed=seed, ring_freq=80)
    g = ImageDraw.Draw(img)
    rnd = random.Random(seed)
    bh = h / rows
    for r in range(rows):
        x = rnd.uniform(0, w)
        while x < w:
            g.line([(x, r * bh), (x, (r + 1) * bh)], fill=(60, 40, 25), width=2)
            x += rnd.uniform(w * 0.35, w * 0.7)
    return img


def pegboard(w, h, pitch_px, base="#b08a63", seed=3):
    rng = np.random.default_rng(seed)
    n = smooth_noise(w, h, 40, rng, 3)
    c = hex_rgb(base)
    arr = c[None, None, :] * (0.92 + 0.16 * n[..., None])
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    g = ImageDraw.Draw(img)
    r = pitch_px * 0.14
    for y in np.arange(pitch_px / 2, h, pitch_px):
        for x in np.arange(pitch_px / 2, w, pitch_px):
            g.ellipse([x - r, y - r, x + r, y + r], fill=(38, 28, 20))
    return img


def label(w, h, bg, fg, lines, sizes, weights=None, border=None, align="center"):
    img = Image.new("RGB", (w, h), bg)
    g = ImageDraw.Draw(img)
    if border:
        g.rectangle([6, 6, w - 7, h - 7], outline=border, width=4)
    total = sum(int(s * 1.25) for s in sizes)
    y = (h - total) / 2
    for i, (text, s) in enumerate(zip(lines, sizes)):
        f = font(s, (weights or [700] * len(lines))[i])
        bb = g.textbbox((0, 0), text, font=f)
        tw = bb[2] - bb[0]
        x = (w - tw) / 2 - bb[0] if align == "center" else 24
        g.text((x, y - bb[1] + (s * 1.25 - (bb[3] - bb[1])) / 2), text, font=f, fill=fg)
        y += int(s * 1.25)
    return img


def cardboard(w, h, seed=4, base="#b88b58"):
    rng = np.random.default_rng(seed)
    n = smooth_noise(w, h, 60, rng, 4)
    fib = smooth_noise(w, h, 3, rng, 2)
    c = hex_rgb(base)
    arr = c[None, None, :] * (0.9 + 0.12 * n[..., None] + 0.05 * fib[..., None])
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def box_art(w, h, brand, product, color, seed):
    """Printed product box side: cardboard + colored band + brand."""
    img = cardboard(w, h, seed)
    g = ImageDraw.Draw(img)
    band = int(h * 0.42)
    g.rectangle([0, (h - band) // 2, w, (h + band) // 2], fill=color)
    f = font(int(band * 0.34), 800)
    bb = g.textbbox((0, 0), brand, font=f)
    g.text(((w - (bb[2] - bb[0])) / 2 - bb[0], (h - band) / 2 + band * 0.1 - bb[1]), brand, font=f, fill=(250, 248, 240))
    f2 = font(int(band * 0.2), 600)
    bb = g.textbbox((0, 0), product, font=f2)
    g.text(((w - (bb[2] - bb[0])) / 2 - bb[0], (h - band) / 2 + band * 0.58 - bb[1]), product, font=f2, fill=(250, 248, 240))
    return img


def sky(w, h):
    """Soft daylight seen through the window: gradient + distant tree line."""
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    top = hex_rgb("#8fb8e8")
    hor = hex_rgb("#e8f1fb")
    arr = top[None, None, :] * (1 - yy[..., None]) + hor[None, None, :] * yy[..., None]
    arr = np.repeat(arr, w, axis=1)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    g = ImageDraw.Draw(img)
    rnd = random.Random(7)
    base = h * 0.78
    pts = [(0, h)]
    x = 0
    while x <= w:
        pts.append((x, base - rnd.uniform(0, h * 0.22)))
        x += rnd.uniform(w * 0.02, w * 0.06)
    pts.append((w, h))
    g.polygon(pts, fill=(92, 128, 96))
    g.rectangle([0, h * 0.88, w, h], fill=(150, 160, 150))
    return img.filter(ImageFilter.GaussianBlur(3))
