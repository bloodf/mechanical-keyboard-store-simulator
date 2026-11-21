"""Panorama → game assets:
  public/assets/env/workshop_bg.jpg  (sRGB background, 3072×1536)
  art/build/workshop_env.hdr         (small linear HDR; tests/e2e/make_env.cjs turns it into workshop.env)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
from PIL import Image

from common import BUILD, PUBLIC


def read_hdr(path):
    """Minimal Radiance .hdr reader (new-style RLE or flat)."""
    data = open(path, "rb").read()
    i = 0
    w = h = None
    while True:
        j = data.index(b"\n", i)
        line = data[i:j].decode("latin1")
        i = j + 1
        if line.startswith("-Y") or line.startswith("+Y"):
            parts = line.split()
            h, w = int(parts[1]), int(parts[3])
            break
    out = np.zeros((h, w, 4), np.uint8)
    p = i
    for y in range(h):
        if data[p] == 2 and data[p + 1] == 2 and (data[p + 2] << 8 | data[p + 3]) == w:
            p += 4
            for c in range(4):
                x = 0
                while x < w:
                    n = data[p]
                    p += 1
                    if n > 128:
                        n -= 128
                        out[y, x : x + n, c] = data[p]
                        p += 1
                    else:
                        out[y, x : x + n, c] = np.frombuffer(data[p : p + n], np.uint8)
                        p += n
                    x += n
        else:
            out[y] = np.frombuffer(data[p : p + w * 4], np.uint8).reshape(w, 4)
            p += w * 4
    e = out[..., 3].astype(np.int32)
    scale = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0).astype(np.float32)
    return out[..., :3].astype(np.float32) * scale[..., None]


def write_hdr(path, img):
    h, w, _ = img.shape
    m = np.max(img, axis=2)
    e = np.zeros((h, w), np.int32)
    mant = np.zeros((h, w), np.float32)
    nz = m > 1e-32
    mant[nz], e[nz] = np.frexp(m[nz])
    rgbe = np.zeros((h, w, 4), np.uint8)
    sc = np.where(nz, mant * 256.0 / np.maximum(m, 1e-32), 0)
    rgbe[..., :3] = np.clip(img * sc[..., None], 0, 255).astype(np.uint8)
    rgbe[..., 3] = np.where(nz, e + 128, 0).astype(np.uint8)
    with open(path, "wb") as f:
        f.write(b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n")
        f.write(f"-Y {h} +X {w}\n".encode())
        f.write(rgbe.tobytes())


def srgb_encode(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


if __name__ == "__main__":
    src = os.path.join(BUILD, "workshop_pano.hdr")
    exposure = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
    img = read_hdr(src)
    print("pano", img.shape, "mean", img.mean(), "max", img.max())
    os.makedirs(os.path.join(PUBLIC, "env"), exist_ok=True)
    # background: gentle highlight roll-off instead of a hard clip
    x = img * exposure
    x = x / (1 + np.maximum(0, x - 0.8) * 0.8)
    bg = (srgb_encode(x) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(bg).save(os.path.join(PUBLIC, "env", "workshop_bg.jpg"), quality=86, optimize=True, progressive=True)
    # downscale each channel (box filter) for the lighting HDR
    chans = [np.asarray(Image.fromarray(img[..., c]).resize((512, 256), Image.BOX)) for c in range(3)]
    write_hdr(os.path.join(BUILD, "workshop_env.hdr"), np.stack(chans, axis=2).astype(np.float32))
    print("wrote bg + env hdr")
