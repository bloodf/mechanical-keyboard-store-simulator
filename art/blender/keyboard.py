"""
Keyboard assembly modeled to real specs (all in mm, plate top = z 0 before the typing-angle tilt):
  key pitch 19.05 · plate cutout 14.0 × 14.0 · plate 1.5 thick · PCB 1.6 thick, top 5.0 below plate top
  MX-style switch: top housing 15.6 → 14.2 wide, 6.6 above the plate; cross stem 4.0 × 1.17, 3.6 above the housing
  stabilizers: wire inserts ±11.9 (2–2.75u), ±50 (6.25u); keycap skirt 4.4 above the plate at rest
  case: 8 bezel, 7° typing angle, flat bottom
"""
import json
import math
import os
import bpy
import bmesh
from mathutils import Matrix, Vector
from PIL import Image, ImageDraw, ImageFont

from common import BUILD, add_modifier, apply_modifiers, assign, link, mesh_from_bmesh, mm, principled, image_material, set_smooth_by_angle
from keycap import PITCH, build_keycap, row_of

LAYOUTS = json.load(open(os.path.join(BUILD, "layouts.json")))
FONT_DIR = "/home/model/art-scratch/fonts/package/files"
SYMBOL_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

PLATE_T = 1.5
PCB_TOP = -5.0
PCB_T = 1.6
SWITCH_H = 6.6
STEM_H = 3.6
CAP_Z = 4.4
BEZEL = 8.0
TYPING_ANGLE = 7.0


def key_center(k, L):
    """mm, origin at the layout center; +y = away from the typist (north)."""
    x = (k["x"] + k["w"] / 2) * PITCH - L["width"] * PITCH / 2
    y = -((k["y"] + k["h"] / 2) * PITCH - L["depth"] * PITCH / 2)
    return x, y


def needs_stab(k):
    return k["w"] >= 2 or k["h"] >= 2


def stab_offset(k):
    span = max(k["w"], k["h"])
    return 50.0 if span >= 6 else 11.9


# ------------------------------------------------------------------ primitives
def box_bm(bm, cx, cy, z0, w, d, h):
    m = Matrix.Translation((mm(cx), mm(cy), mm(z0 + h / 2))) @ Matrix.Diagonal((mm(w), mm(d), mm(h), 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def rounded_prism(bm, cx, cy, w, d, r, z0, z1, seg=6):
    """Vertical rounded-rectangle prism (closed)."""
    pts = []
    r = min(r, w / 2 - 0.01, d / 2 - 0.01)
    for (ox, oy, a0) in [(w / 2 - r, -d / 2 + r, -90), (w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90), (-w / 2 + r, -d / 2 + r, 180)]:
        for i in range(seg):
            a = math.radians(a0 + 90 * i / (seg - 1))
            pts.append((cx + ox + r * math.cos(a), cy + oy + r * math.sin(a)))
    bot = [bm.verts.new((mm(x), mm(y), mm(z0))) for x, y in pts]
    top = [bm.verts.new((mm(x), mm(y), mm(z1))) for x, y in pts]
    n = len(pts)
    for i in range(n):
        bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]))
    bm.faces.new(list(reversed(bot)))
    bm.faces.new(top)


# ------------------------------------------------------------------ switch
def build_switch(housing_mat, stem_mat, bottom_mat, name="switch", exploded=0.0):
    """MX-style switch. Origin = plate top at the switch center. `exploded` (mm) spreads the parts apart."""
    objs = []
    # top housing: tapered, with a rounded crown
    bm = bmesh.new()
    rings = [(15.6, 15.6, 0.0), (15.6, 15.6, 1.2), (14.9, 14.6, 4.8), (14.2, 13.6, SWITCH_H - 0.35), (13.7, 13.1, SWITCH_H)]
    vr = []
    for (w, d, z) in rings:
        vr.append([bm.verts.new((mm(x), mm(y), mm(z + exploded * 2))) for (x, y) in [(w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2), (-w / 2, -d / 2)]])
    for i in range(len(vr) - 1):
        for j in range(4):
            bm.faces.new((vr[i][j], vr[i][(j + 1) % 4], vr[i + 1][(j + 1) % 4], vr[i + 1][j]))
    bm.faces.new(vr[-1])
    bm.faces.new(list(reversed(vr[0])))
    top = mesh_from_bmesh(f"{name}_top", bm, smooth=False)
    add_modifier(top, "BEVEL", width=mm(0.35), segments=2, limit_method="ANGLE")
    assign(top, housing_mat)
    objs.append(top)
    # LED window (north) and side clips
    bm = bmesh.new()
    box_bm(bm, 0, 4.6, SWITCH_H - 0.05 + exploded * 2, 5.0, 2.8, 0.12)
    led = mesh_from_bmesh(f"{name}_led", bm, smooth=False)
    assign(led, principled("led-window", "#1a1a1a", roughness=0.2))
    objs.append(led)
    bm = bmesh.new()
    for sx in (-1, 1):
        box_bm(bm, sx * 7.85, 0, 1.0 + exploded * 2, 0.5, 5.0, 2.4)
    clips = mesh_from_bmesh(f"{name}_clips", bm, smooth=False)
    assign(clips, housing_mat)
    objs.append(clips)
    # stem: body visible through the top + cross
    bm = bmesh.new()
    box_bm(bm, 0, 0, SWITCH_H - 1.9 + exploded * 3, 7.2, 5.8, 1.3)  # slider body stays recessed in the housing
    box_bm(bm, 0, 0, SWITCH_H + exploded * 3, 4.0, 1.17, STEM_H)
    box_bm(bm, 0, 0, SWITCH_H + exploded * 3, 1.27, 4.0, STEM_H)
    stem = mesh_from_bmesh(f"{name}_stem", bm, smooth=False)
    add_modifier(stem, "BEVEL", width=mm(0.12), segments=1)
    assign(stem, stem_mat)
    objs.append(stem)
    # bottom housing under the plate: body, center post, pins
    bm = bmesh.new()
    box_bm(bm, 0, 0, -5.0 - exploded, 13.9, 13.9, 5.0)
    box_bm(bm, 0, 0, -1.5 - exploded, 15.4, 15.4, 0.0001)
    bottom = mesh_from_bmesh(f"{name}_bottom", bm, smooth=False)
    add_modifier(bottom, "BEVEL", width=mm(0.3), segments=2)
    assign(bottom, bottom_mat)
    objs.append(bottom)
    bpy.ops.mesh.primitive_cylinder_add(radius=mm(2.0), depth=mm(3.0), location=(0, 0, mm(-6.5 - exploded)), vertices=20)
    post = bpy.context.object
    assign(post, bottom_mat)
    objs.append(post)
    pin_mat = principled("pin", "#d9b458", roughness=0.25, metallic=1.0)
    for (px, py) in ((-3.81, 2.54), (2.54, 5.08)):
        bpy.ops.mesh.primitive_cylinder_add(radius=mm(0.74), depth=mm(3.3), location=(mm(px), mm(py), mm(-6.65 - exploded)), vertices=12)
        assign(bpy.context.object, pin_mat)
        objs.append(bpy.context.object)
    if exploded:
        # spring between the housing halves
        curve = bpy.data.curves.new("spring", "CURVE")
        curve.dimensions = "3D"
        curve.bevel_depth = mm(0.22)
        curve.bevel_resolution = 3
        sp = curve.splines.new("POLY")
        turns, n = 9, 180
        sp.points.add(n - 1)
        for i in range(n):
            a = 2 * math.pi * turns * i / n
            sp.points[i].co = (mm(2.6 * math.cos(a)), mm(2.6 * math.sin(a)), mm(-3.5 - exploded + (exploded * 2.2 + 8) * i / n), 1)
        ob = bpy.data.objects.new(f"{name}_spring", curve)
        link(ob)
        ob.data.materials.append(principled("spring", "#c9ccd1", roughness=0.2, metallic=1.0))
        objs.append(ob)
    return objs


# ------------------------------------------------------------------ legends atlas
def legend_atlas(L, cw, path, cell=128, font_file="inter-latin-600-normal.woff"):
    labels = sorted({(k["kind"], k["label"]) for k in L["keys"]})
    kinds = ["alpha", "mod", "accent"]
    cols = 16
    rows = math.ceil((len(labels) + 3) / cols)
    img = Image.new("RGB", (cols * cell, rows * cell), "#000000")
    g = ImageDraw.Draw(img)
    main = os.path.join(FONT_DIR, font_file)
    uv = {}
    solid = {}

    def cell_uv(i):
        cx, cy = (i % cols) * cell, (i // cols) * cell
        W, H = cols * cell, rows * cell
        return ((cx + 4) / W, 1 - (cy + cell - 4) / H, (cx + cell - 4) / W, 1 - (cy + 4) / H)

    for i, (kind, label) in enumerate(labels):
        cx, cy = (i % cols) * cell, (i // cols) * cell
        g.rectangle([cx, cy, cx + cell, cy + cell], fill=cw[kind])
        if label:
            ascii_ok = all(ord(ch) < 128 for ch in label)
            size = int(cell * (0.36 if len(label) == 1 else 0.2 if len(label) <= 3 else 0.16))
            f = ImageFont.truetype(main if ascii_ok else SYMBOL_FONT, size)
            # classic top-left legend placement for single characters, centered-left for words
            bx = g.textbbox((0, 0), label, font=f)
            tw, th = bx[2] - bx[0], bx[3] - bx[1]
            if len(label) == 1 and ascii_ok:
                px, py = cx + cell * 0.2, cy + cell * 0.16
            else:
                px, py = cx + (cell - tw) / 2 - bx[0], cy + (cell - th) / 2 - bx[1]
            g.text((px, py), label, font=f, fill=cw["legend_" + kind])
        uv[(kind, label)] = cell_uv(i)
    for j, kind in enumerate(kinds):
        i = len(labels) + j
        cx, cy = (i % cols) * cell, (i // cols) * cell
        g.rectangle([cx, cy, cx + cell, cy + cell], fill=cw[kind])
        u0, v0, u1, v1 = cell_uv(i)
        solid[kind] = ((u0 + u1) / 2, (v0 + v1) / 2)
    img.save(path)
    return uv, solid


# ------------------------------------------------------------------ PCB artwork
def pcb_texture(L, path, mask="#1b5e3b", ppm=8):
    W = L["width"] * PITCH
    D = L["depth"] * PITCH
    img = Image.new("RGB", (int(W * ppm), int(D * ppm)), mask)
    g = ImageDraw.Draw(img)
    import random

    rnd = random.Random(3)
    trace = tuple(min(255, int(int(mask[i : i + 2], 16) * 1.35)) for i in (1, 3, 5))
    for _ in range(70):  # traces
        x, y = rnd.uniform(0, W), rnd.uniform(0, D)
        pts = [(x * ppm, y * ppm)]
        for _ in range(4):
            if rnd.random() < 0.5:
                x += rnd.uniform(-40, 40)
            else:
                y += rnd.uniform(-12, 12)
            pts.append((x * ppm, y * ppm))
        g.line(pts, fill=trace, width=2)
    for k in L["keys"]:
        cx = (k["x"] + k["w"] / 2) * PITCH
        cy = (k["y"] + k["h"] / 2) * PITCH
        s = 7.0
        g.rectangle([(cx - s) * ppm, (cy - s) * ppm, (cx + s) * ppm, (cy + s) * ppm], outline="#e8e8e8", width=2)
        for (px, py) in ((-3.81, -2.54), (2.54, -5.08)):  # PCB y is flipped vs. switch y
            r = 1.2
            g.ellipse([(cx + px - r) * ppm, (cy + py - r) * ppm, (cx + px + r) * ppm, (cy + py + r) * ppm], fill="#d9b458")
        g.ellipse([(cx - 2.0) * ppm, (cy - 2.0) * ppm, (cx + 2.0) * ppm, (cy + 2.0) * ppm], fill="#0c2016")
        # diode
        g.rectangle([(cx + 5.5) * ppm, (cy + 3) * ppm, (cx + 7.2) * ppm, (cy + 6.5) * ppm], fill="#151515")
    g.text((10 * ppm, (D - 4) * ppm), "MKSS-65 rev.3  ·  thock responsibly", fill="#f0f0f0")
    img.save(path)


# ------------------------------------------------------------------ assembly
def build_keyboard(layout_id="65", cw=None, profile="low", case_color="#c9ccd1", case_metal=True, switch=None, plate_color="#c8ccd2", show_caps=True, show_switches=True, keycap_material="pbt"):
    L = LAYOUTS[layout_id]
    keys = L["keys"]
    W = L["width"] * PITCH
    D = L["depth"] * PITCH
    parts = []

    # --- plate with switch + stabilizer cutouts (boolean with one joined cutter)
    bm = bmesh.new()
    box_bm(bm, 0, 0, -PLATE_T, W + 0.4, D + 0.4, PLATE_T)
    plate = mesh_from_bmesh("plate", bm, smooth=False)
    cut = bmesh.new()
    for k in keys:
        x, y = key_center(k, L)
        box_bm(cut, x, y, -3, 14.0, 14.0, 6)
        if needs_stab(k):
            off = stab_offset(k)
            vertical = k["h"] > k["w"]
            for s in (-1, 1):
                if vertical:
                    box_bm(cut, x, y + s * off, -3, 14.0, 6.75, 6)
                else:
                    box_bm(cut, x + s * off, y - 0.5, -3, 6.75, 14.0, 6)
    cutter = mesh_from_bmesh("cutter", cut, smooth=False)
    b = plate.modifiers.new("cut", "BOOLEAN")
    b.operation = "DIFFERENCE"
    b.solver = "EXACT"
    b.object = cutter
    apply_modifiers(plate)
    bpy.data.objects.remove(cutter)
    add_modifier(plate, "BEVEL", width=mm(0.2), segments=1, limit_method="ANGLE")
    assign(plate, principled("plate", plate_color, roughness=0.32, metallic=1.0, brushed=0.3))
    parts.append(plate)

    # --- PCB (textured top)
    tex = os.path.join(BUILD, f"pcb_{layout_id}.png")
    pcb_texture(L, tex)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, mm(PCB_TOP)))
    pcb_top = bpy.context.object
    pcb_top.scale = (mm(W), mm(D), 1)
    bpy.ops.object.transform_apply(scale=True)
    assign(pcb_top, image_material("pcb", tex, roughness=0.45))
    bm = bmesh.new()
    box_bm(bm, 0, 0, PCB_TOP - PCB_T, W - 0.1, D - 0.1, PCB_T - 0.02)
    pcb_body = mesh_from_bmesh("pcb_body", bm, smooth=False)
    assign(pcb_body, principled("pcb-edge", "#1b5e3b", roughness=0.5))
    parts += [pcb_top, pcb_body]

    # --- stabilizers
    stab_h = principled("stab", "#1c1c1c", roughness=0.45)
    wire_m = principled("wire", "#d0d3d8", roughness=0.25, metallic=1.0)
    for k in [k for k in keys if needs_stab(k)]:
        x, y = key_center(k, L)
        off = stab_offset(k)
        vertical = k["h"] > k["w"]
        bm = bmesh.new()
        for s in (-1, 1):
            if vertical:
                box_bm(bm, x, y + s * off, -4.5, 12.0, 6.3, 9.5)
            else:
                box_bm(bm, x + s * off, y - 0.5, -4.5, 6.3, 12.0, 9.5)
        h = mesh_from_bmesh("stab_h", bm, smooth=False)
        add_modifier(h, "BEVEL", width=mm(0.4), segments=2)
        assign(h, stab_h)
        parts.append(h)
        curve = bpy.data.curves.new("wire", "CURVE")
        curve.dimensions = "3D"
        curve.bevel_depth = mm(0.55)
        curve.bevel_resolution = 3
        sp = curve.splines.new("POLY")
        if vertical:
            pts = [(x + 4, y - off, 4.0), (x + 6.5, y - off, 1.0), (x + 6.5, y + off, 1.0), (x + 4, y + off, 4.0)]
        else:
            pts = [(x - off, y - 4, 4.0), (x - off, y - 6.5, 1.0), (x + off, y - 6.5, 1.0), (x + off, y - 4, 4.0)]
        sp.points.add(len(pts) - 1)
        for i, p in enumerate(pts):
            sp.points[i].co = (mm(p[0]), mm(p[1]), mm(p[2]), 1)
        wob = bpy.data.objects.new("wire", curve)
        link(wob)
        wob.data.materials.append(wire_m)
        parts.append(wob)

    # --- switches (one modeled switch, linked duplicates)
    if show_switches and switch:
        hm = principled("housing", switch["housing"], roughness=0.25 if switch.get("clear") else 0.45, transmission=0.85 if switch.get("clear") else 0.0)
        sm = principled("stem", switch["stem"], roughness=0.35)
        bmm = principled("bottom", switch.get("bottom", switch["housing"]), roughness=0.4, transmission=0.85 if switch.get("clear") else 0.0)
        proto = build_switch(hm, sm, bmm)
        for o in proto:
            if o.type == "MESH":
                apply_modifiers(o)
        for k in keys:
            x, y = key_center(k, L)
            for o in proto:
                d = o.copy()
                link(d)
                d.location = (d.location.x + mm(x), d.location.y + mm(y), d.location.z)
                parts.append(d)
        for o in proto:
            bpy.data.objects.remove(o)

    # --- keycaps (one mesh, atlas-textured)
    if show_caps and cw:
        atlas = os.path.join(BUILD, f"legends_{layout_id}.png")
        uv, solid = legend_atlas(L, cw, atlas)
        bm = bmesh.new()
        for k in keys:
            x, y = key_center(k, L)
            row = row_of(k["rowFromBottom"])
            before = set(bm.verts)
            build_keycap(bm, k["w"], k["h"], profile, row, uv_cell=uv[(k["kind"], k["label"])], solid_uv=solid[k["kind"]], legend_left=k["w"] > 1.3 and k["h"] == 1 and k["label"] not in ("", "Enter"))
            new = [v for v in bm.verts if v not in before]
            bmesh.ops.translate(bm, verts=new, vec=(mm(x), mm(y), mm(CAP_Z)))
        caps = mesh_from_bmesh("keycaps", bm, smooth=True, smooth_angle=50)
        rough = {"pbt": 0.68, "abs": 0.28, "pom": 0.45}[keycap_material]
        assign(caps, image_material("keycaps", atlas, roughness=rough, grain=0.25 if keycap_material == "pbt" else 0.05))
        parts.append(caps)

    # --- case (outer shell minus cavity), then tilt to the typing angle and cut the bottom flat
    bm = bmesh.new()
    rounded_prism(bm, 0, 0, W + 2 * BEZEL, D + 2 * BEZEL, 4.0, -45, 3.0, seg=8)
    case = mesh_from_bmesh("case", bm, smooth=False)
    cav = bmesh.new()
    rounded_prism(cav, 0, 0, W + 1.0, D + 1.0, 1.0, -13.0, 10, seg=4)
    box_bm(cav, 0, D / 2 + BEZEL, -9.0, 12.0, BEZEL * 3, 4.0)  # USB-C port
    cavity = mesh_from_bmesh("cavity", cav, smooth=False)
    b = case.modifiers.new("cavity", "BOOLEAN")
    b.operation = "DIFFERENCE"
    b.solver = "EXACT"
    b.object = cavity
    apply_modifiers(case)
    bpy.data.objects.remove(cavity)
    parts.append(case)

    root = bpy.data.objects.new("keyboard", None)
    link(root)
    for p in parts:
        p.parent = root
    # tilt: back edge up by the typing angle around the front bottom edge
    front_y = -(D / 2 + BEZEL)
    root.rotation_euler = (math.radians(TYPING_ANGLE), 0, 0)
    root.location = (0, mm(front_y) * (1 - math.cos(math.radians(TYPING_ANGLE))), 0)
    bpy.context.view_layer.update()
    # lift so the front bottom sits on z = 0 after cutting: front plate-top height above desk = 17 mm
    root.location.z = mm(17.0) - mm(front_y) * math.sin(math.radians(TYPING_ANGLE)) * 0
    bpy.context.view_layer.update()
    # flat bottom: cut everything of the case below the desk plane
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -0.25))
    floor_cut = bpy.context.object
    floor_cut.scale = (2, 2, 0.5)
    b = case.modifiers.new("flat", "BOOLEAN")
    b.operation = "DIFFERENCE"
    b.solver = "EXACT"
    b.object = floor_cut
    bpy.context.view_layer.objects.active = case
    bpy.ops.object.modifier_apply(modifier="flat")
    bpy.data.objects.remove(floor_cut)
    add_modifier(case, "BEVEL", width=mm(0.9), segments=3, limit_method="ANGLE", angle_limit=math.radians(40))
    add_modifier(case, "WEIGHTED_NORMAL", keep_sharp=True)
    set_smooth_by_angle(case, 40)
    if case_metal:
        # anodized aluminum: dyed oxide over metal → metallic but keeps its color; fine bead-blast grain
        cm = principled("case", case_color, roughness=0.42, metallic=0.85, grain=0.12, grain_scale=2500, coat=0.15)
    else:
        cm = principled("case", case_color, roughness=0.5, grain=0.15, grain_scale=1500)
    assign(case, cm)
    # rubber feet
    fm = principled("feet", "#161616", roughness=0.9)
    for fx in (-1, 1):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(mm(fx * (W / 2 - 10)), 0, mm(0.8)))
        f = bpy.context.object
        f.scale = (mm(18), mm(D + 4), mm(1.6))
        add_modifier(f, "BEVEL", width=mm(0.7), segments=2)
        assign(f, fm)
    return root, parts
