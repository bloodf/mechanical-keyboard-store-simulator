"""
The keyboard workshop (meters, z up). The player works at the bench and never walks around, so:
  - the room and everything away from the bench is rendered by Cycles into a 360° panorama
    (background + image-based lighting for the game's PBR materials),
  - the bench top and the props on it are real meshes exported to glTF (bench.glb) so the keyboard
    sits on them, casts shadows on them and the camera can move freely around.
Layout: bench top z = 0.76, x ∈ [−1.0, 1.0], y ∈ [−0.38, 0.56] (typist at −y), back wall y = 0.62,
keyboard center at the origin of the bench top. Panorama origin = the usual camera spot (0, −0.42, 1.16).

usage: python workshop.py [pano|preview|bench|all] [--fast]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy
import bmesh
from mathutils import Matrix, Vector

import textures as TX
from common import BUILD, PUBLIC, add_modifier, apply_modifiers, assign, camera, link, look_at, mesh_from_bmesh, principled, set_smooth_by_angle, srgb

TEX = os.path.join(BUILD, "workshop")
os.makedirs(TEX, exist_ok=True)
BENCH_Z = 0.76
PANO_ORIGIN = (0.0, -0.42, 1.16)
ROOM = dict(x0=-2.2, x1=2.2, y0=-3.2, y1=0.62, h=2.75)
FAST = "--fast" in sys.argv


# ---------------------------------------------------------------- helpers
def img_path(name, make):
    p = os.path.join(TEX, name)
    if not os.path.exists(p):
        make().save(p)
    return p


def tex_material(name, path, roughness=0.6, metallic=0.0, scale=None, box=False, bump=0.0, coat=0.0):
    m = principled(name, "#ffffff", roughness=roughness, metallic=metallic, coat=coat)
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(path, check_existing=True)
    if scale or box:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        s = scale or (1, 1, 1)
        mp.inputs["Scale"].default_value = s
        nt.links.new(tc.outputs["Object" if box else "UV"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
        if box:
            tex.projection = "BOX"
            tex.projection_blend = 0.2
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if bump:
        b = nt.nodes.new("ShaderNodeBump")
        b.inputs["Strength"].default_value = bump
        b.inputs["Distance"].default_value = 0.0005
        bw = nt.nodes.new("ShaderNodeRGBToBW")
        nt.links.new(tex.outputs["Color"], bw.inputs["Color"])
        nt.links.new(bw.outputs["Val"], b.inputs["Height"])
        nt.links.new(b.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def noisy(name, color, roughness=0.8, scale=8.0, amount=0.08, bump=0.05):
    """Painted plaster / matte surfaces: subtle color variation + micro bump."""
    m = principled(name, color, roughness=roughness)
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = scale
    nz.inputs["Detail"].default_value = 10
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs["Factor"].default_value = amount
    mix.inputs[6].default_value = srgb(color)
    nt.links.new(nz.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    b = nt.nodes.new("ShaderNodeBump")
    b.inputs["Strength"].default_value = bump
    b.inputs["Distance"].default_value = 0.002
    nz2 = nt.nodes.new("ShaderNodeTexNoise")
    nz2.inputs["Scale"].default_value = scale * 40
    nt.links.new(tc.outputs["Object"], nz2.inputs["Vector"])
    nt.links.new(nz2.outputs["Fac"], b.inputs["Height"])
    nt.links.new(b.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def emissive(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = srgb(color)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


def emissive_image(name, path, strength):
    m = emissive(name, "#ffffff", strength)
    nt = m.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(path, check_existing=True)
    nt.links.new(tex.outputs["Color"], nt.nodes["Emission"].inputs["Color"])
    return m


def bx(name, size, center, mat, bevel=0.002, seg=2, uv_fit=False):
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(center) @ Matrix.Diagonal((sx, sy, sz, 1)), calc_uvs=True)
    ob = mesh_from_bmesh(name, bm, smooth=False)
    if bevel:
        add_modifier(ob, "BEVEL", width=min(bevel, min(size) * 0.45), segments=seg, limit_method="ANGLE")
        add_modifier(ob, "WEIGHTED_NORMAL", keep_sharp=True)
        apply_modifiers(ob)
        set_smooth_by_angle(ob, 35)
    if mat and mat.name.split(".")[0] in UV_SCALE:
        uv_box(ob, UV_SCALE[mat.name.split(".")[0]])
    else:
        uv_box(ob, fit=True)
    return assign(ob, mat) if mat else ob


UV_SCALE = {"floor": 0.5, "oak": 0.8, "walnut": 1.5, "butcher-block": 0.5}


def uv_box(ob, scale=1.0, offset=(0.0, 0.0), fit=False):
    """Box-project UVs in world space (meters × scale) — survives glTF export, unlike shader box mapping.
    fit=True: every side shows the whole image (normalized to the object's bounds)."""
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new()
    uvl = me.uv_layers.active.data
    mw = ob.matrix_world
    cos = [mw @ v.co for v in me.vertices]
    lo = [min(c[i] for c in cos) for i in range(3)]
    hi = [max(c[i] for c in cos) for i in range(3)]
    span = [max(1e-6, hi[i] - lo[i]) for i in range(3)]
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            if ax == 2:
                iu, iv = 0, 1
            elif ax == 1:
                iu, iv = 0, 2
            else:
                iu, iv = 1, 2
            if fit:
                u = (co[iu] - lo[iu]) / span[iu]
                v = (co[iv] - lo[iv]) / span[iv]
                # mirror on the faces looking toward −y/+x so prints read correctly from outside
                if (ax == 1 and n[1] > 0) or (ax == 0 and n[0] < 0):
                    u = 1 - u
                uvl[li].uv = (u, v)
            else:
                uvl[li].uv = (co[iu] * scale + offset[0], co[iv] * scale + offset[1])
    return ob


def cyl(name, r, h, base, mat, seg=32, r2=None, bevel=0.0, axis="z"):
    bm = bmesh.new()
    rot = Matrix.Identity(4)
    if axis == "x":
        rot = Matrix.Rotation(math.pi / 2, 4, "Y")
    elif axis == "y":
        rot = Matrix.Rotation(math.pi / 2, 4, "X")
    off = Vector((0, 0, h / 2))
    if axis == "x":
        off = Vector((h / 2, 0, 0))
    elif axis == "y":
        off = Vector((0, -h / 2, 0))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h, matrix=Matrix.Translation(Vector(base) + off) @ rot, calc_uvs=True)
    ob = mesh_from_bmesh(name, bm, smooth=True, smooth_angle=40)
    if bevel:
        add_modifier(ob, "BEVEL", width=bevel, segments=2, limit_method="ANGLE")
        apply_modifiers(ob)
    return assign(ob, mat) if mat else ob


def tube(name, pts, r, mat, res=3):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = r
    curve.bevel_resolution = res
    curve.use_fill_caps = True
    sp = curve.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (*p, 1)
    ob = bpy.data.objects.new(name, curve)
    link(ob)
    ob.data.materials.append(mat)
    return ob


def area(name, loc, target, energy, size, color="#ffffff", shape="SQUARE", size_y=None):
    l = bpy.data.lights.new(name, "AREA")
    l.energy = energy
    l.shape = shape
    l.size = size
    if size_y:
        l.size_y = size_y
    l.color = srgb(color)[:3]
    ob = bpy.data.objects.new(name, l)
    link(ob)
    ob.location = loc
    look_at(ob, target)
    return ob


# ---------------------------------------------------------------- materials
def materials():
    M = {}
    M["wall"] = noisy("wall", "#e9e1d3", 0.9, 3.0, 0.05, 0.03)
    M["wall_accent"] = noisy("wall-accent", "#4f6b62", 0.85, 3.0, 0.06, 0.03)  # deep green wainscot
    M["ceiling"] = noisy("ceiling", "#f1ede6", 0.95, 2.0, 0.03, 0.02)
    M["floor"] = tex_material("floor", img_path("floor.png", lambda: TX.planks(2048, 2048, rows=10)), roughness=0.45, bump=0.15, coat=0.2)
    M["trim"] = principled("trim", "#f4efe6", roughness=0.5)
    M["oak"] = tex_material("oak", img_path("oak.png", lambda: TX.wood(2048, 512, "#c79a66", "#8a5e38", boards=5, seed=11)), roughness=0.5, bump=0.1)
    M["walnut"] = tex_material("walnut", img_path("walnut.png", lambda: TX.wood(1024, 512, "#6b4a33", "#3b271a", boards=3, seed=12)), roughness=0.45, bump=0.1)
    M["peg"] = tex_material("pegboard", img_path("pegboard.png", lambda: TX.pegboard(2048, 1024, 2048 / 64)), roughness=0.8)
    M["steel"] = principled("steel", "#9aa0a6", roughness=0.35, metallic=1.0)
    M["steel_dark"] = principled("steel-dark", "#3b3f45", roughness=0.5, metallic=0.8)
    M["black"] = principled("black-plastic", "#1d1e20", roughness=0.45)
    M["red"] = principled("red-plastic", "#c8352e", roughness=0.35)
    M["yellow"] = principled("yellow-plastic", "#f2b51d", roughness=0.35)
    M["blue"] = principled("blue-plastic", "#2f66c9", roughness=0.35)
    M["green"] = principled("green-plastic", "#2f8a57", roughness=0.4)
    M["white"] = principled("white-plastic", "#f1f0ec", roughness=0.4)
    M["glass"] = principled("glass", "#ffffff", roughness=0.02, transmission=1.0, ior=1.45)
    M["leaf"] = principled("leaf", "#4f8a3c", roughness=0.55)
    M["pot"] = principled("terracotta", "#b8643f", roughness=0.8)
    M["cardboard"] = tex_material("cardboard", img_path("cardboard.png", lambda: TX.cardboard(512, 512)), roughness=0.85)
    M["frame"] = principled("frame", "#2b2b2b", roughness=0.5)
    M["window"] = principled("window-frame", "#f3f1ec", roughness=0.45)
    M["sky"] = emissive_image("sky", img_path("sky.png", lambda: TX.sky(1024, 512)), 3.0)
    M["bulb"] = emissive("bulb", "#fff1d6", 25.0)
    M["fabric"] = principled("fabric", "#3d4a5c", roughness=0.95)
    return M


# ---------------------------------------------------------------- room
def room(M):
    x0, x1, y0, y1, H = ROOM["x0"], ROOM["x1"], ROOM["y0"], ROOM["y1"], ROOM["h"]
    W, D = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    bx("floor", (W, D, 0.02), (cx, cy, -0.01), M["floor"], bevel=0)
    bx("ceiling", (W, D, 0.02), (cx, cy, H + 0.01), M["ceiling"], bevel=0)
    # walls: upper paint + lower wainscot (deep green) with a chair rail
    t = 0.05
    for name, size, c in [
        ("wall-back", (W, t, H), (cx, y1 + t / 2, H / 2)),
        ("wall-front", (W, t, H), (cx, y0 - t / 2, H / 2)),
        ("wall-right", (t, D, H), (x1 + t / 2, cy, H / 2)),
    ]:
        bx(name, size, c, M["wall"], bevel=0)
    # left wall with a window opening (x = x0): wall pieces around the hole
    wy0, wy1, wz0, wz1 = -1.9, -0.35, 0.95, 2.25
    for name, (ya, yb, za, zb) in {
        "wl-a": (y0, wy0, 0, H),
        "wl-b": (wy1, y1, 0, H),
        "wl-c": (wy0, wy1, 0, wz0),
        "wl-d": (wy0, wy1, wz1, H),
    }.items():
        bx(name, (t, yb - ya, zb - za), (x0 - t / 2, (ya + yb) / 2, (za + zb) / 2), M["wall"], bevel=0)
    # wainscot panels (lower 0.95 m) + chair rail + baseboard on back/right/left walls
    wh = 0.92
    bx("wains-back", (W, 0.012, wh), (cx, y1 - 0.006, wh / 2), M["wall_accent"], bevel=0.001)
    bx("wains-right", (0.012, D, wh), (x1 - 0.006, cy, wh / 2), M["wall_accent"], bevel=0.001)
    bx("wains-front", (W, 0.012, wh), (cx, y0 + 0.006, wh / 2), M["wall_accent"], bevel=0.001)
    for (ya, yb) in ((y0, wy0), (wy1, y1)):
        bx("wains-left", (0.012, yb - ya, wh), (x0 + 0.006, (ya + yb) / 2, wh / 2), M["wall_accent"], bevel=0.001)
    bx("wains-left-c", (0.012, wy1 - wy0, wh), (x0 + 0.006, (wy0 + wy1) / 2, wh / 2), M["wall_accent"], bevel=0.001)
    # vertical panel grooves
    for i in range(int(W / 0.28)):
        x = x0 + 0.14 + i * 0.28
        bx("groove", (0.004, 0.003, wh - 0.12), (x, y1 - 0.0125, wh / 2), principled("groove", "#3c554d", 0.9), bevel=0)
    rail = M["trim"]
    bx("rail-back", (W, 0.03, 0.04), (cx, y1 - 0.015, wh + 0.02), rail, bevel=0.006)
    bx("rail-right", (0.03, D, 0.04), (x1 - 0.015, cy, wh + 0.02), rail, bevel=0.006)
    bx("rail-front", (W, 0.03, 0.04), (cx, y0 + 0.015, wh + 0.02), rail, bevel=0.006)
    bx("rail-left", (0.03, D, 0.04), (x0 + 0.015, cy, wh + 0.02), rail, bevel=0.006)
    bx("base-back", (W, 0.02, 0.1), (cx, y1 - 0.02, 0.05), rail, bevel=0.004)
    bx("base-right", (0.02, D, 0.1), (x1 - 0.02, cy, 0.05), rail, bevel=0.004)
    bx("base-front", (W, 0.02, 0.1), (cx, y0 + 0.02, 0.05), rail, bevel=0.004)
    # crown molding
    bx("crown-back", (W, 0.05, 0.06), (cx, y1 - 0.025, H - 0.03), rail, bevel=0.01)
    bx("crown-right", (0.05, D, 0.06), (x1 - 0.025, cy, H - 0.03), rail, bevel=0.01)
    bx("crown-left", (0.05, D, 0.06), (x0 + 0.025, cy, H - 0.03), rail, bevel=0.01)
    bx("crown-front", (W, 0.05, 0.06), (cx, y0 + 0.025, H - 0.03), rail, bevel=0.01)
    # window: frame, mullions, sill, sky outside
    fw = 0.06
    wm = M["window"]
    wx = x0 - 0.02
    for (name, size, c) in [
        ("wf-top", (0.1, wy1 - wy0 + 2 * fw, fw), (wx, (wy0 + wy1) / 2, wz1 + fw / 2)),
        ("wf-bot", (0.1, wy1 - wy0 + 2 * fw, fw), (wx, (wy0 + wy1) / 2, wz0 - fw / 2)),
        ("wf-l", (0.1, fw, wz1 - wz0), (wx, wy0 - fw / 2, (wz0 + wz1) / 2)),
        ("wf-r", (0.1, fw, wz1 - wz0), (wx, wy1 + fw / 2, (wz0 + wz1) / 2)),
        ("wf-mid", (0.08, 0.035, wz1 - wz0), (wx, (wy0 + wy1) / 2, (wz0 + wz1) / 2)),
        ("wf-mid2", (0.08, wy1 - wy0, 0.035), (wx, (wy0 + wy1) / 2, wz0 + (wz1 - wz0) * 0.62)),
    ]:
        bx(name, size, c, wm, bevel=0.008)
    bx("sill", (0.2, wy1 - wy0 + 0.2, 0.035), (x0 + 0.06, (wy0 + wy1) / 2, wz0 - 0.02), M["trim"], bevel=0.008)
    bx("glass", (0.006, wy1 - wy0, wz1 - wz0), (x0 - 0.03, (wy0 + wy1) / 2, (wz0 + wz1) / 2), M["glass"], bevel=0)
    s = bx("sky", (0.01, 6.0, 3.2), (x0 - 2.5, (wy0 + wy1) / 2, 1.5), M["sky"], bevel=0)
    s.rotation_euler = (0, 0, 0)
    # plant on the sill
    plant((x0 + 0.1, wy0 + 0.25, wz0 - 0.003), M, 0.7)
    # ceiling lights: two linear pendants over the bench and the room
    for (px, py) in ((0.0, -0.1), (0.0, -1.9)):
        bx("pendant", (1.2, 0.14, 0.05), (px, py, H - 0.55), M["steel_dark"], bevel=0.01)
        bx("pendant-diffuser", (1.16, 0.12, 0.006), (px, py, H - 0.578), M["bulb"], bevel=0)
        for sx in (-0.5, 0.5):
            tube("pendant-wire", [(px + sx, py, H - 0.53), (px + sx, py, H)], 0.0015, M["black"], res=1)
        area("pendant-light", (px, py, H - 0.59), (px, py, 0), 45 if py > -1 else 35, 1.1, "#ffe9cc", shape="RECTANGLE", size_y=0.1)
    # sun + sky fill through the window
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 2.6
    sun.angle = math.radians(1.5)
    sun.color = srgb("#fff0d8")[:3]
    so = bpy.data.objects.new("sun", sun)
    link(so)
    so.rotation_euler = Vector((0.75, 0.25, -0.55)).to_track_quat("Z", "Y").to_euler()
    area("window-fill", (x0 + 0.05, (wy0 + wy1) / 2, (wz0 + wz1) / 2), (x0 + 3, (wy0 + wy1) / 2, 0.9), 60, 1.3, "#dbe8ff", shape="RECTANGLE", size_y=1.2)


def plant(base, M, s=1.0):
    x, y, z = base
    cyl("pot", 0.07 * s, 0.11 * s, (x, y, z), M["pot"], seg=24, r2=0.085 * s, bevel=0.004)
    cyl("soil", 0.078 * s, 0.005, (x, y, z + 0.1 * s), principled("soil", "#3a2a1e", roughness=1), seg=24)
    import random

    rnd = random.Random(int(x * 100 + y * 10))
    for i in range(14):
        a = rnd.uniform(0, 2 * math.pi)
        tilt = rnd.uniform(0.25, 0.9)
        L = rnd.uniform(0.12, 0.22) * s
        bm = bmesh.new()
        # leaf: a curved blade
        pts = []
        n = 6
        for j in range(n + 1):
            t = j / n
            wdt = 0.022 * s * math.sin(math.pi * min(1, t * 1.1)) + 0.002
            r = L * t
            zz = math.sin(tilt) * r - 0.35 * r * r / L
            hr = math.cos(tilt) * r
            pts.append((hr, wdt, zz))
        vl = [bm.verts.new((p[0], -p[1], p[2])) for p in pts]
        vr = [bm.verts.new((p[0], p[1], p[2])) for p in pts]
        for j in range(n):
            bm.faces.new((vl[j], vl[j + 1], vr[j + 1], vr[j]))
        ob = mesh_from_bmesh("leaf", bm, smooth=True)
        ob.location = (x, y, z + 0.1 * s)
        ob.rotation_euler = (0, 0, a)
        assign(ob, M["leaf"])


# ---------------------------------------------------------------- back wall: pegboard, tools, shelf, poster, clock
def back_wall(M):
    y1 = ROOM["y1"]
    # pegboard 1.6 × 0.75 above the bench
    pb = bx("pegboard", (1.6, 0.008, 0.75), (0.0, y1 - 0.03, BENCH_Z + 0.2 + 0.375), M["peg"], bevel=0.002)
    for sx in (-0.8, 0.8):
        bx("peg-frame", (0.025, 0.03, 0.78), (sx, y1 - 0.02, BENCH_Z + 0.575), M["oak"], bevel=0.004)
    bx("peg-frame-t", (1.63, 0.03, 0.025), (0, y1 - 0.02, BENCH_Z + 0.96), M["oak"], bevel=0.004)
    bx("peg-frame-b", (1.63, 0.03, 0.025), (0, y1 - 0.02, BENCH_Z + 0.19), M["oak"], bevel=0.004)
    yw = y1 - 0.04
    # hanging tools (front of the board)
    zt = BENCH_Z + 0.78
    for i, (col, L) in enumerate([("red", 0.2), ("yellow", 0.17), ("blue", 0.22), ("red", 0.15), ("black", 0.19)]):
        x = -0.68 + i * 0.055
        screwdriver((x, yw - 0.015, zt), M, M[col], L)
    # pliers & cutters
    for i, col in enumerate(("red", "blue")):
        pliers((-0.32 + i * 0.09, yw - 0.012, zt + 0.02), M, M[col])
    # tweezers
    for i in range(3):
        x = -0.1 + i * 0.025
        for s in (-1, 1):
            tube("tweezer", [(x, yw - 0.01, zt + 0.02), (x + s * 0.004, yw - 0.01, zt - 0.1), (x + s * 0.0015, yw - 0.01, zt - 0.13)], 0.0018, M["steel"], res=1)
    # keycap pullers (wire loops)
    for i in range(2):
        x = 0.05 + i * 0.06
        bx("puller-grip", (0.018, 0.012, 0.06), (x, yw - 0.012, zt + 0.0), M["yellow" if i else "black"], bevel=0.004)
        for s in (-1, 1):
            pts = [(x + s * 0.004, yw - 0.012, zt - 0.03), (x + s * 0.016, yw - 0.012, zt - 0.07), (x + s * 0.014, yw - 0.012, zt - 0.1), (x + s * 0.004, yw - 0.012, zt - 0.105)]
            tube("puller-wire", pts, 0.001, M["steel"], res=1)
    # solder spool on a peg
    cyl("spool", 0.04, 0.03, (0.27, yw - 0.035, zt - 0.02), M["steel"], seg=40, axis="y")
    cyl("spool-core", 0.016, 0.032, (0.27, yw - 0.034, zt - 0.02), M["black"], seg=24, axis="y")
    # clipboard with order sheets
    bx("clipboard", (0.23, 0.006, 0.32), (0.52, yw - 0.004, BENCH_Z + 0.55), M["walnut"], bevel=0.004)
    paper = tex_material("orders-paper", img_path("orders.png", lambda: TX.label(460, 600, (246, 243, 235), (40, 40, 40), ["ORDERS", "", "#0412  65% thock", "#0413  TKL clacky", "#0414  40% pink", "#0415  full size", "#0416  ???"], [54, 20, 30, 30, 30, 30, 30], [800, 400, 500, 500, 500, 500, 500], align="left")), roughness=0.9)
    bx("sheet", (0.21, 0.002, 0.28), (0.52, yw - 0.008, BENCH_Z + 0.535), paper, bevel=0)
    bx("clip", (0.08, 0.012, 0.025), (0.52, yw - 0.01, BENCH_Z + 0.705), M["steel"], bevel=0.004)
    # tape rolls on a peg
    for i, col in enumerate(("#e8d7a0", "#4aa3df")):
        cyl("tape", 0.03, 0.02, (0.7, yw - 0.03 - i * 0.022, zt - 0.05), principled(f"tape{i}", col, 0.5), seg=32, axis="y")
    # shelf above the pegboard with jars and boxes
    zs = BENCH_Z + 1.09
    bx("shelf", (1.7, 0.22, 0.03), (0, y1 - 0.11, zs), M["oak"], bevel=0.004)
    for sx in (-0.7, 0.7):
        bx("bracket", (0.02, 0.18, 0.12), (sx, y1 - 0.1, zs - 0.075), M["steel_dark"], bevel=0.003)
    import random

    rnd = random.Random(5)
    x = -0.8
    colors = ["#e04f5f", "#4a90d9", "#f2c14e", "#5fb98d", "#9b6dd6", "#ef8b3c"]
    while x < 0.75:
        kind = rnd.choice(["jar", "jar", "box", "tube", "stack"])
        if kind == "jar":
            r = rnd.uniform(0.025, 0.04)
            h = rnd.uniform(0.05, 0.08)
            cyl("jar", r, h, (x + r, y1 - 0.12, zs + 0.015), M["glass"], seg=32)
            cyl("jar-fill", r * 0.9, h * rnd.uniform(0.4, 0.85), (x + r, y1 - 0.12, zs + 0.018), principled("lube", rnd.choice(["#f3e8c8", "#e9f0f5", "#f5d7a8"]), 0.2), seg=24)
            cyl("jar-lid", r * 1.04, 0.015, (x + r, y1 - 0.12, zs + 0.015 + h), principled("lid", rnd.choice(colors), 0.35), seg=32, bevel=0.002)
            x += 2 * r + 0.02
        elif kind == "box":
            w, h = rnd.uniform(0.08, 0.16), rnd.uniform(0.08, 0.16)
            col = rnd.choice(colors)
            art = img_path(f"shelfbox{int(x * 100)}.png", lambda: TX.box_art(512, 512, rnd.choice(["THOCKWERK", "CLACKCO", "SWITCHLAB", "KEYSMITH"]), rnd.choice(["switches ×70", "lube kit", "keycaps", "stabilizers"]), tuple(int(col[i : i + 2], 16) for i in (1, 3, 5)), 9))
            bx("shelfbox", (w, 0.16, h), (x + w / 2, y1 - 0.11, zs + 0.015 + h / 2), tex_material(f"sb{x}", art, 0.8), bevel=0.003)
            x += w + 0.015
        elif kind == "tube":
            cyl("tube", 0.012, 0.12, (x + 0.012, y1 - 0.1, zs + 0.015), principled("tube", rnd.choice(colors), 0.4), seg=16)
            x += 0.03
        else:
            for j in range(rnd.randint(2, 4)):
                bx("keycap-box", (0.14, 0.14, 0.03), (x + 0.07, y1 - 0.11, zs + 0.03 + j * 0.031), principled("kcbox", rnd.choice(["#1d1e22", "#f0ede6", "#2d3a4f"]), 0.5), bevel=0.004)
            x += 0.16
    plant((0.78, y1 - 0.12, zs + 0.015), M, 0.8)
    # framed poster (right of the pegboard) and a wall clock (left)
    poster = img_path("poster.png", lambda: TX.label(600, 800, (236, 225, 201), (52, 74, 66), ["KEEP", "CALM", "AND", "THOCK", "ON", "", "est. workshop"], [110, 110, 80, 120, 110, 20, 34], [900, 900, 500, 900, 900, 400, 500], border=(52, 74, 66)))
    bx("poster-frame", (0.44, 0.02, 0.58), (1.3, y1 - 0.01, 1.55), M["frame"], bevel=0.004)
    bx("poster", (0.4, 0.004, 0.54), (1.3, y1 - 0.021, 1.55), tex_material("poster", poster, 0.8), bevel=0)
    cyl("clock", 0.15, 0.03, (-1.3, y1 - 0.005, 1.75), M["white"], seg=48, axis="y", bevel=0.004)
    cyl("clock-rim", 0.16, 0.025, (-1.3, y1 - 0.003, 1.75), M["black"], seg=48, axis="y")
    def placed(name, size, local, rot_y, loc):
        o = bx(name, size, local, M["black"], bevel=0)
        o.rotation_euler = (0, rot_y, 0)
        o.location = loc
        return o

    for i in range(12):
        a = i / 12 * 2 * math.pi
        placed("tick", (0.006, 0.004, 0.02), (0, 0, 0.125), -a, (-1.3, y1 - 0.037, 1.75))
    placed("hand-h", (0.008, 0.004, 0.07), (0, 0, 0.03), math.radians(-60), (-1.3, y1 - 0.04, 1.75))
    placed("hand-m", (0.006, 0.004, 0.11), (0, 0, 0.05), math.radians(40), (-1.3, y1 - 0.042, 1.75))


def screwdriver(top, M, handle_mat, L):
    x, y, z = top
    cyl("sd-handle", 0.011, 0.085, (x, y, z - 0.085), handle_mat, seg=12, bevel=0.003)
    cyl("sd-shaft", 0.0025, L - 0.085, (x, y, z - L), M["steel"], seg=10)


def pliers(top, M, grip):
    x, y, z = top
    for s in (-1, 1):
        tube("pl-grip", [(x + s * 0.004, y, z), (x + s * 0.02, y, z - 0.11)], 0.006, grip, res=2)
        tube("pl-jaw", [(x + s * 0.004, y, z), (x + s * 0.002, y, z + 0.045)], 0.004, M["steel_dark"], res=1)


# ---------------------------------------------------------------- right wall: stock shelving
def stock_shelves(M):
    x1 = ROOM["x1"]
    import random

    rnd = random.Random(8)
    brands = ["THOCKWERK", "CLACKCO", "SWITCHLAB", "KEYSMITH", "LUBEBROS", "CAPSULE", "GASKETO", "PLATEAU"]
    products = ["switches ×70", "switches ×110", "keycap set", "stabilizers", "case 65%", "PCB hot-swap", "foam kit", "plates"]
    cols = [(198, 61, 54), (47, 102, 201), (242, 181, 29), (47, 138, 87), (120, 80, 190), (30, 30, 34), (230, 120, 60)]
    for unit, (ya, yb) in enumerate(((-2.6, -1.5), (-1.35, -0.25))):
        xc = x1 - 0.22
        w = yb - ya
        for (sy,) in ((ya,), (yb,)):
            for sx in (xc - 0.2, xc + 0.2):
                bx("upright", (0.03, 0.03, 2.0), (sx, sy, 1.0), M["steel_dark"], bevel=0.003)
        for lvl in range(5):
            z = 0.12 + lvl * 0.44
            bx("shelf-board", (0.44, w, 0.02), (xc, (ya + yb) / 2, z), M["steel"], bevel=0.002)
            if lvl == 4:
                continue
            y = ya + 0.03
            while y < yb - 0.12:
                kind = rnd.random()
                if kind < 0.55:
                    d = rnd.uniform(0.14, 0.3)
                    h = rnd.uniform(0.12, min(0.36, 0.4))
                    col = rnd.choice(cols)
                    key = f"stock{unit}{lvl}{int(y * 100)}.png"
                    art = img_path(key, lambda: TX.box_art(512, 384, rnd.choice(brands), rnd.choice(products), col, rnd.randint(0, 99)))
                    stack = 1 if h > 0.22 else rnd.randint(1, 2)
                    for sidx in range(stack):
                        bx("stockbox", (0.34, d, h), (xc - 0.02, y + d / 2, z + 0.01 + h / 2 + sidx * h), tex_material(key, art, 0.8), bevel=0.004)
                    y += d + 0.012
                elif kind < 0.8:
                    # clear bins with colored switches inside
                    d = 0.2
                    c = rnd.choice(["#e0322b", "#f2c230", "#2f6fe0", "#8b5a2b", "#f4f1ea", "#ff8fb1"])
                    bx("bin", (0.36, d, 0.14), (xc - 0.02, y + d / 2, z + 0.08), M["glass"], bevel=0.006)
                    bx("bin-fill", (0.33, d - 0.02, 0.08), (xc - 0.02, y + d / 2, z + 0.05), principled(f"sw{c}", c, 0.45, grain=0.6, grain_scale=90), bevel=0.004)
                    bx("bin-label", (0.002, 0.1, 0.04), (xc - 0.2, y + d / 2, z + 0.1), M["white"], bevel=0)
                    y += d + 0.012
                else:
                    # rolled desk mats
                    for j in range(3):
                        cyl("mat-roll", 0.035, 0.4, (xc - 0.2, y + 0.04 + j * 0.075, z + 0.045), principled("mat", rnd.choice(["#2d3a4f", "#c94f4f", "#e9e1d0", "#3d6b5a"]), 0.9), seg=24, axis="x")
                    y += 0.24


# ---------------------------------------------------------------- behind the camera: packing station & door
def packing(M):
    y0 = ROOM["y0"]
    # door on the front wall
    bx("door", (0.9, 0.045, 2.05), (1.3, y0 + 0.03, 1.025), principled("door", "#3f5f57", 0.5), bevel=0.01)
    bx("door-glass", (0.5, 0.05, 0.7), (1.3, y0 + 0.032, 1.55), M["glass"], bevel=0.005)
    cyl("door-knob", 0.025, 0.06, (0.95, y0 + 0.06, 1.0), M["steel"], seg=24, axis="y")
    # packing table with boxes and a tape gun
    bx("pack-top", (1.4, 0.7, 0.04), (-0.9, y0 + 0.45, 0.9), M["oak"], bevel=0.006)
    for (lx, ly) in ((-1.55, y0 + 0.15), (-0.25, y0 + 0.15), (-1.55, y0 + 0.75), (-0.25, y0 + 0.75)):
        bx("pack-leg", (0.05, 0.05, 0.88), (lx, ly, 0.44), M["steel_dark"], bevel=0.004)
    for i in range(3):
        bx("ship-box", (0.5, 0.22, 0.08), (-1.1, y0 + 0.4, 0.96 + i * 0.082), M["cardboard"], bevel=0.004)
    bx("ship-box-open", (0.52, 0.24, 0.1), (-0.45, y0 + 0.45, 0.97), M["cardboard"], bevel=0.004)
    cyl("tape-gun", 0.05, 0.05, (-0.75, y0 + 0.6, 0.92), M["red"], seg=24, axis="x")


# ---------------------------------------------------------------- the bench (exported for the game)
def bench(M, with_top=True):
    objs = []
    z = BENCH_Z
    top_mat = tex_material("butcher-block", img_path("butcher.png", lambda: TX.wood(2048, 1024, "#d2a877", "#9c6c40", boards=9, seed=21, ring_freq=40)), roughness=0.42, bump=0.08)
    if with_top:
        t = bx("bench-top", (2.0, 0.94, 0.045), (0, 0.09, z - 0.0225), top_mat, bevel=0.004)
        objs.append(t)
    legs = []
    for (lx, ly) in ((-0.95, -0.33), (0.95, -0.33), (-0.95, 0.5), (0.95, 0.5)):
        legs.append(bx("bench-leg", (0.06, 0.06, z - 0.045), (lx, ly, (z - 0.045) / 2), M["steel_dark"], bevel=0.004))
    legs.append(bx("bench-rail", (1.9, 0.04, 0.06), (0, 0.5, 0.2), M["steel_dark"], bevel=0.004))
    legs.append(bx("bench-shelf", (1.9, 0.8, 0.02), (0, 0.09, 0.16), M["oak"], bevel=0.003))
    objs += legs
    return objs


def bench_props(M):
    """Props on the bench (kept clear of the keyboard area, x ∈ [−0.28, 0.28], y ∈ [−0.2, 0.2])."""
    objs = []
    z = BENCH_Z
    # articulated desk lamp, back-left, leaning over the work area
    bx_ = -0.55
    by = 0.42
    objs.append(cyl("lamp-base", 0.075, 0.02, (bx_, by, z), M["black"], seg=40, bevel=0.004))
    p0 = Vector((bx_, by, z + 0.02))
    p1 = p0 + Vector((0.05, -0.02, 0.36))
    p2 = p1 + Vector((0.26, -0.12, 0.06))
    for (a, b) in ((p0, p1), (p1, p2)):
        for off in (-0.012, 0.012):
            objs.append(tube("lamp-arm", [tuple(a + Vector((off, 0, 0))), tuple(b + Vector((off, 0, 0)))], 0.005, M["black"], res=2))
    objs.append(cyl("lamp-joint", 0.014, 0.04, tuple(p1 - Vector((0.02, 0, 0))), M["steel"], seg=16, axis="x"))
    shade = cyl("lamp-shade", 0.03, 0.11, (0, 0, 0), M["black"], seg=40, r2=0.075)
    shade.location = p2 + Vector((0.02, 0, -0.03))
    shade.rotation_euler = (math.radians(-30), math.radians(-35), 0)
    objs.append(shade)
    # parts tray (right)
    tray_mat = principled("tray", "#d9dde2", roughness=0.35, metallic=0.6)
    objs.append(bx("tray", (0.2, 0.13, 0.02), (0.63, 0.12, z + 0.01), tray_mat, bevel=0.004))
    # switch tester (small 3×3 block) and a keycap puller on the bench
    objs.append(bx("tester-base", (0.07, 0.07, 0.012), (0.6, -0.18, z + 0.006), M["black"], bevel=0.003))
    # mug
    mug_m = principled("mug", "#e8e3d8", roughness=0.25)
    mx = -0.62
    objs.append(cyl("mug", 0.04, 0.095, (mx, -0.1, z), mug_m, seg=48, bevel=0.003))
    handle = tube("mug-handle", [(mx + 0.038, -0.1, z + 0.075), (mx + 0.062, -0.1, z + 0.072), (mx + 0.07, -0.1, z + 0.05), (mx + 0.062, -0.1, z + 0.028), (mx + 0.038, -0.1, z + 0.024)], 0.0055, mug_m, res=3)
    objs.append(handle)
    objs.append(cyl("coffee", 0.036, 0.002, (mx, -0.1, z + 0.085), principled("coffee", "#3b2414", 0.1), seg=32))
    return objs


def build_scene(include_bench_for_camera=False):
    M = materials()
    room(M)
    back_wall(M)
    stock_shelves(M)
    packing(M)
    b = bench(M) + bench_props(M)
    # lamp light (the lamp mesh itself lives in bench.glb)
    area("lamp-light", (-0.23, 0.27, z_lamp()), (-0.05, 0.0, BENCH_Z), 6.0, 0.09, "#ffe1b0", shape="DISK")
    for o in b:
        o.visible_camera = include_bench_for_camera
    return M, b


def z_lamp():
    return BENCH_Z + 0.41


def render_settings(w, h, samples):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 6
    sc.cycles.use_light_tree = True
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    w_ = bpy.data.worlds.new("w")
    sc.world = w_
    w_.use_nodes = True
    w_.node_tree.nodes["Background"].inputs["Color"].default_value = srgb("#cfd8e3")
    w_.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.05


def pano(path_base, w, h, samples):
    cam = bpy.data.cameras.new("pano")
    cam.type = "PANO"
    try:
        cam.panorama_type = "EQUIRECTANGULAR"
    except Exception:
        cam.cycles.panorama_type = "EQUIRECTANGULAR"
    ob = bpy.data.objects.new("pano", cam)
    link(ob)
    ob.location = PANO_ORIGIN
    ob.rotation_euler = (math.pi / 2, 0, 0)  # looks toward +y (the back wall) at the image center
    bpy.context.scene.camera = ob
    render_settings(w, h, samples)
    sc = bpy.context.scene
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    # linear HDR for lighting
    sc.render.image_settings.file_format = "HDR"
    sc.render.filepath = path_base + ".hdr"
    bpy.ops.render.render(write_still=True)


def preview(path, w=1280, h=720, samples=48):
    """A view like the game camera, with the bench visible (for checking the look)."""
    for o in bpy.context.scene.objects:
        if o.type in ("MESH", "CURVE"):
            o.visible_camera = True
    camera(PANO_ORIGIN, (0, 0.1, BENCH_Z + 0.05), lens=22)
    render_settings(w, h, samples)
    sc = bpy.context.scene
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    mode = next((a for a in sys.argv[1:] if not a.startswith("--")), "preview")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    M, bench_objs = build_scene()
    if mode in ("preview",):
        preview("/home/model/art-scratch/workshop_preview.png", 960 if FAST else 1280, 540 if FAST else 720, 24 if FAST else 48)
    if mode in ("wide",):
        for o in bpy.context.scene.objects:
            if o.type in ("MESH", "CURVE"):
                o.visible_camera = True
        camera((0.3, -2.6, 1.6), (0.0, 0.2, 1.1), lens=18)
        render_settings(1280, 720, 32)
        sc = bpy.context.scene
        sc.view_settings.view_transform = "AgX"
        sc.render.filepath = "/home/model/art-scratch/workshop_wide.png"
        bpy.ops.render.render(write_still=True)
    if mode in ("pano", "all"):
        pano(os.path.join(BUILD, "workshop_pano"), 1024 if FAST else 3072, 512 if FAST else 1536, 24 if FAST else 40)
    if mode in ("bench", "all"):
        for o in bpy.context.scene.objects:
            o.select_set(False)
        for o in bench_objs:
            o.select_set(True)
        bpy.ops.object.convert(target="MESH")
        sel = [o for o in bpy.context.selected_objects]
        bpy.ops.export_scene.gltf(filepath=os.path.join(PUBLIC, "models", "bench.glb"), export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_image_format="WEBP")
