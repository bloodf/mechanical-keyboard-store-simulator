"""
Switch models (mm, origin = plate top at the switch center, +Y = north/LED side, +Z = up).

MX-style (Cherry MX pattern):
  plate cutout 14.0 × 14.0 · top housing 15.6 square at the plate, 6.6 tall above it
  cross stem 4.0 long, arms 1.17 / 1.27 wide, 3.6 above the housing at rest · travel 4.0
  bottom housing 14.0 body below the plate with plate-clip wings · center post Ø4.0 × 3.3
  pins Ø1.47 at (−3.81, 2.54) and (2.54, 5.08) · 5-pin: plastic pins Ø1.75 at (±5.08, 0)
Box-style: MX footprint, square box wall (5.9 outer) around the cross.
Low-profile (Kailh Choc v1 pattern):
  plate cutout 13.8 × 13.8 · housing 15.0 × 15.0, top 3.0 above the plate · twin rails 1.2 × 3.0, 5.7 apart · travel 3.0
"""
import math
import bmesh
import bpy
from mathutils import Matrix, Vector

from common import add_modifier, apply_modifiers, assign, link, mesh_from_bmesh, mm, principled, set_smooth_by_angle


# ---------------------------------------------------------------- geometry helpers
def loft(bm, sections, cap_bottom=True, cap_top=True):
    """sections: list of (w, d, z, r) rounded rectangles (mm) stacked bottom → top."""
    rings = []
    for (w, d, z, r) in sections:
        rings.append([bm.verts.new((mm(x), mm(y), mm(z))) for (x, y) in rrect_pts(w, d, r)])
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if cap_bottom:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top:
        bm.faces.new(rings[-1])
    return rings


def rrect_pts(w, d, r, per=5, cx=0.0, cy=0.0):
    r = max(0.02, min(r, w / 2 - 0.01, d / 2 - 0.01))
    pts = []
    for (ox, oy, a0) in [(w / 2 - r, -d / 2 + r, -90), (w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90), (-w / 2 + r, -d / 2 + r, 180)]:
        for i in range(per):
            a = math.radians(a0 + 90 * i / (per - 1))
            pts.append((cx + ox + r * math.cos(a), cy + oy + r * math.sin(a)))
    return pts


def box(bm, cx, cy, z0, w, d, h):
    m = Matrix.Translation((mm(cx), mm(cy), mm(z0 + h / 2))) @ Matrix.Diagonal((mm(w), mm(d), mm(h), 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def cyl(bm, cx, cy, z0, r, h, seg=20):
    m = Matrix.Translation((mm(cx), mm(cy), mm(z0 + h / 2)))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=mm(r), radius2=mm(r), depth=mm(h), matrix=m)


def cutter(name, build):
    bm = bmesh.new()
    build(bm)
    return mesh_from_bmesh(name, bm, smooth=False)


def boolean(target, cut_obj, op="DIFFERENCE"):
    b = target.modifiers.new("bool", "BOOLEAN")
    b.operation = op
    b.solver = "EXACT"
    b.object = cut_obj
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=b.name)
    bpy.data.objects.remove(cut_obj)


def finish(ob, bevel=0.2, seg=2, angle=35):
    if bevel:
        add_modifier(ob, "BEVEL", width=mm(bevel), segments=seg, limit_method="ANGLE", angle_limit=math.radians(angle))
    add_modifier(ob, "WEIGHTED_NORMAL", keep_sharp=True)
    apply_modifiers(ob)
    set_smooth_by_angle(ob, angle)
    return ob


def spring(name, radius, z0, z1, turns, wire=0.22, per_turn=24, res=2):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = mm(wire)
    curve.bevel_resolution = res
    sp = curve.splines.new("POLY")
    n = int(turns * per_turn)
    sp.points.add(n)
    for i in range(n + 1):
        t = i / n
        a = 2 * math.pi * turns * t
        # closed (flat) ends like a real spring
        zt = t
        if t < 0.06:
            zt = t * 0.35
        elif t > 0.94:
            zt = 1 - (1 - t) * 0.35
        else:
            zt = 0.021 + (t - 0.06) / 0.88 * 0.958
        sp.points[i].co = (mm(radius * math.cos(a)), mm(radius * math.sin(a)), mm(z0 + (z1 - z0) * zt), 1)
    ob = bpy.data.objects.new(name, curve)
    link(ob)
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.object


# ---------------------------------------------------------------- MX family
MX_H = 6.6
STEM_H = 3.6


def mx_top_housing(box_style=False):
    bm = bmesh.new()
    loft(bm, [(15.6, 15.6, 0.0, 0.6), (15.6, 15.6, 1.1, 0.6), (14.8, 14.6, 1.6, 0.9), (13.0, 12.4, 5.9, 1.6), (12.6, 12.0, MX_H - 0.2, 1.8), (12.2, 11.6, MX_H, 1.7)])
    ob = mesh_from_bmesh("top_housing", bm, smooth=False)
    # hollow it (1.0 mm walls, open at the bottom) + stem opening + LED window
    inner = cutter("inner", lambda b: loft(b, [(13.6, 13.6, -0.5, 0.5), (13.4, 13.4, 1.1, 0.5), (11.2, 10.6, 5.9 - 0.9, 1.2)]))
    boolean(ob, inner)
    opening = 7.4 if box_style else 7.2
    op = cutter("opening", lambda b: box(b, 0, 0, MX_H - 1.6, opening, 5.9, 3))
    boolean(ob, op)
    led = cutter("led", lambda b: box(b, 0, 4.3, MX_H - 1.0, 4.6, 2.2, 2))
    boolean(ob, led)
    # latch windows (E/W) where the bottom housing's hooks show through
    lat = cutter("latch", lambda b: (box(b, 7.3, 0, 0.35, 1.2, 4.6, 1.3), box(b, -7.3, 0, 0.35, 1.2, 4.6, 1.3)))
    boolean(ob, lat)
    finish(ob, 0.22, 2, 30)
    parts = [ob]
    if box_style:
        bmb = bmesh.new()
        loft(bmb, [(6.6, 6.6, MX_H - 0.6, 0.5), (6.6, 6.6, MX_H + 0.35, 0.5)], cap_bottom=False, cap_top=True)
        wall = mesh_from_bmesh("box_wall", bmb, smooth=False)
        boolean(wall, cutter("boxhole", lambda b: box(b, 0, 0, MX_H - 1, 5.4, 5.4, 3)))
        finish(wall, 0.15, 1)
        parts.append(wall)
    return parts


def mx_bottom_housing(five_pin=False):
    bm = bmesh.new()
    # body through the plate (14.0) + plate-clip wings (north/south) + base skirt
    loft(bm, [(13.9, 13.9, -5.0, 0.5), (13.9, 13.9, -1.5, 0.5), (13.9, 13.9, 0.0, 0.5)])
    ob = mesh_from_bmesh("bottom_housing", bm, smooth=False)
    wings = cutter("wings", lambda b: (box(b, 0, 7.0, -2.6, 6.0, 0.9, 2.1), box(b, 0, -7.0, -2.6, 6.0, 0.9, 2.1)))
    boolean(ob, wings, "UNION")
    hooks = cutter("hooks", lambda b: (box(b, 7.2, 0, 0.0, 1.0, 4.4, 1.4), box(b, -7.2, 0, 0.0, 1.0, 4.4, 1.4)))
    boolean(ob, hooks, "UNION")
    post = cutter("post", lambda b: cyl(b, 0, 0, -8.3, 2.0, 3.4, 24))
    boolean(ob, post, "UNION")
    if five_pin:
        pp = cutter("ppins", lambda b: (cyl(b, -5.08, 0, -8.0, 0.87, 3.1, 14), cyl(b, 5.08, 0, -8.0, 0.87, 3.1, 14)))
        boolean(ob, pp, "UNION")
    # LED holes (2 small rectangles, north)
    lh = cutter("ledholes", lambda b: (box(b, -1.27, 5.08, -5.5, 0.9, 0.9, 1), box(b, 1.27, 5.08, -5.5, 0.9, 0.9, 1)))
    boolean(ob, lh)
    finish(ob, 0.2, 2, 30)
    return ob


def mx_pins():
    bm = bmesh.new()
    for (px, py) in ((-3.81, 2.54), (2.54, 5.08)):
        cyl(bm, px, py, -8.3, 0.735, 3.4, 12)
    return finish(mesh_from_bmesh("pins", bm, smooth=False), 0.1, 1)


def mx_stem(kind="linear", box_style=False):
    """kind: linear | tactile | clicky | silent."""
    bm = bmesh.new()
    # slider body (inside the housing, visible through the opening & when exploded)
    box(bm, 0, 0, MX_H - 5.8, 7.0, 5.6, 4.0)
    # rails on E/W sides guiding the stem
    box(bm, 3.9, 0, MX_H - 5.8, 0.8, 2.2, 4.0)
    box(bm, -3.9, 0, MX_H - 5.8, 0.8, 2.2, 4.0)
    # cross (+): 4.0 long, arms 1.17 (horizontal) / 1.27 (vertical)
    top = MX_H + STEM_H
    base = MX_H - 1.8
    if box_style:
        box(bm, 0, 0, base, 5.9, 5.9, top - base - 0.6)
    box(bm, 0, 0, base, 4.0, 1.17, top - base)
    box(bm, 0, 0, base, 1.27, 4.0, top - base)
    # legs (south side) that slide across the metal leaf
    for sx in (-1, 1):
        box(bm, sx * 1.9, -3.4, MX_H - 9.0, 1.0, 1.3, 3.3)
    ob = mesh_from_bmesh("stem", bm, smooth=False)
    if kind == "tactile":
        bumps = cutter("bumps", lambda b: [box(b, sx * 1.9, -4.2, MX_H - 8.0, 1.0, 0.6, 1.0) for sx in (-1, 1)])
        boolean(ob, bumps, "UNION")
    if kind == "silent":
        pads = cutter("pads", lambda b: [box(b, sx * 2.6, 0, MX_H - 6.2, 1.2, 3.2, 0.5) for sx in (-1, 1)])
        boolean(ob, pads, "UNION")
    finish(ob, 0.1, 1, 30)
    return ob


def mx_click_jacket():
    bm = bmesh.new()
    loft(bm, [(7.6, 6.2, MX_H - 6.2, 0.6), (7.6, 6.2, MX_H - 4.6, 0.6)])
    ob = mesh_from_bmesh("click_jacket", bm, smooth=False)
    boolean(ob, cutter("jhole", lambda b: box(b, 0, 0, MX_H - 7, 7.05, 5.65, 4)))
    return finish(ob, 0.1, 1)


def mx_leaf():
    bm = bmesh.new()
    box(bm, 0, -5.6, -4.8, 5.0, 0.25, 5.4)
    box(bm, 0, -4.9, -0.4, 4.2, 1.6, 0.25)
    return finish(mesh_from_bmesh("leaf", bm, smooth=False), 0.05, 1)


# ---------------------------------------------------------------- Choc (low profile) family
CHOC_H = 3.0


def choc_top_housing():
    bm = bmesh.new()
    loft(bm, [(15.0, 15.0, 0.0, 0.6), (15.0, 15.0, 0.8, 0.6), (14.4, 14.4, CHOC_H - 0.3, 1.2), (14.2, 14.2, CHOC_H, 1.2)])
    ob = mesh_from_bmesh("top_housing", bm, smooth=False)
    boolean(ob, cutter("inner", lambda b: loft(b, [(13.0, 13.0, -0.5, 0.5), (12.6, 12.6, CHOC_H - 0.8, 0.8)])))
    boolean(ob, cutter("opening", lambda b: box(b, 0, 0, CHOC_H - 1.5, 9.0, 5.2, 3)))
    boolean(ob, cutter("led", lambda b: box(b, 0, 4.7, CHOC_H - 1.0, 4.0, 2.2, 2)))
    return finish(ob, 0.18, 2, 30)


def choc_bottom_housing():
    bm = bmesh.new()
    loft(bm, [(13.7, 13.7, -2.2, 0.5), (13.7, 13.7, 0.0, 0.5)])
    ob = mesh_from_bmesh("bottom_housing", bm, smooth=False)
    boolean(ob, cutter("post", lambda b: cyl(b, 0, 0, -4.8, 1.6, 2.7, 20)), "UNION")
    boolean(ob, cutter("guides", lambda b: (cyl(b, -5.5, 0, -4.2, 0.9, 2.1, 14), cyl(b, 5.5, 0, -4.2, 0.9, 2.1, 14))), "UNION")
    return finish(ob, 0.15, 2, 30)


def choc_pins():
    bm = bmesh.new()
    for (px, py) in ((0.0, 5.9), (5.0, 3.8)):
        cyl(bm, px, py, -5.2, 0.6, 3.0, 12)
    return finish(mesh_from_bmesh("pins", bm, smooth=False), 0.08, 1)


def choc_stem(kind="linear"):
    bm = bmesh.new()
    box(bm, 0, 0, CHOC_H - 3.2, 10.0, 4.6, 2.2)
    top = CHOC_H + 3.0
    for sx in (-1, 1):
        box(bm, sx * 2.85, 0, CHOC_H - 1.0, 1.2, 3.0, top - (CHOC_H - 1.0))
    ob = mesh_from_bmesh("stem", bm, smooth=False)
    if kind == "tactile":
        boolean(ob, cutter("bump", lambda b: box(b, 0, -2.6, CHOC_H - 3.2, 2.0, 0.6, 1.0)), "UNION")
    return finish(ob, 0.08, 1, 30)


# ---------------------------------------------------------------- export
def materials(housing="#f4f1ea", stem="#e0322b", bottom=None, clear=False):
    hm = principled("housing", housing, roughness=0.1 if clear else 0.42, transmission=0.9 if clear else 0.0, ior=1.5)
    bm_ = principled("bottom", bottom or housing, roughness=0.42)
    sm = principled("stem", stem, roughness=0.35)
    metal = principled("metal", "#d8d1bf", roughness=0.22, metallic=1.0)
    gold = principled("gold", "#d9b458", roughness=0.25, metallic=1.0)
    spring_m = principled("spring", "#c9ccd1", roughness=0.18, metallic=1.0)
    jacket = principled("jacket", "#f6f6f6", roughness=0.4)
    return dict(housing=hm, bottom=bm_, stem=sm, metal=metal, gold=gold, spring=spring_m, jacket=jacket)


def build_switch(family="mx", kind="linear", five_pin=True, mats=None, explode=0.0):
    """Returns {part: object}. explode (mm) spreads parts vertically for the exploded view."""
    M = mats or materials()
    out = {}
    if family in ("mx", "box"):
        tops = mx_top_housing(box_style=family == "box")
        for o in tops:
            assign(o, M["housing"])
        out["top"] = tops[0]
        if len(tops) > 1:
            out["box"] = tops[1]
        out["bottom"] = assign(mx_bottom_housing(five_pin), M["bottom"])
        out["pins"] = assign(mx_pins(), M["gold"])
        out["stem"] = assign(mx_stem(kind, box_style=family == "box"), M["stem"])
        out["leaf"] = assign(mx_leaf(), M["metal"])
        out["spring"] = assign(spring("spring", 2.6, -7.6, MX_H - 2.2, 9.5), M["spring"])
        if kind == "clicky":
            out["jacket"] = assign(mx_click_jacket(), M["jacket"])
    else:
        out["top"] = assign(choc_top_housing(), M["housing"])
        out["bottom"] = assign(choc_bottom_housing(), M["bottom"])
        out["pins"] = assign(choc_pins(), M["gold"])
        out["stem"] = assign(choc_stem(kind), M["stem"])
        out["spring"] = assign(spring("spring", 1.8, -3.8, CHOC_H - 1.6, 5.5, 0.18), M["spring"])
    if explode:
        order = {"pins": -1.0, "bottom": -1.0, "leaf": -0.6, "spring": 0.0, "stem": 1.0, "jacket": 1.0, "top": 2.0, "box": 2.0}
        for k, o in out.items():
            o.location.z += mm(explode * order.get(k, 0))
    for k, o in out.items():
        o.name = k
    return out
