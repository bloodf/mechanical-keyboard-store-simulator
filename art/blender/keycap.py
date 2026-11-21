"""
Keycap modeler. Each cap is built like a real keycap:
  - a lofted shell from the 18 mm base outline to the smaller sculpted top (slightly convex walls),
  - a rounded top lip and a concave dish (cylindrical for Cherry/OEM, spherical for SA/XDA/MT3),
  - row sculpt (height + tilt per row) for sculpted profiles,
  - a hollow interior with the cross-stem socket underneath,
  - UVs that project the legend from an atlas cell onto the dish (planar, top-down).

Dimensions (mm) follow published keycap profile charts (key pitch 19.05; base 18.0 for 1u).
Heights are measured at the top center from the base. Angles: + = top faces the typist.
"""
import math
import bmesh
from mathutils import Vector
from common import mm

PITCH = 19.05
GAP = 0.525  # 19.05 - 18.0 = 1.05 total gap per key

# name: dish, dish_depth, side_inset, front_inset, back_inset, base_r, top_r, rows{R: (height, angle)}
PROFILES = {
    "low": dict(  # Cherry profile
        dish="cyl", depth=0.55, side=2.75, front=2.9, back=1.1, base_r=0.9, top_r=2.2,
        rows={1: (9.4, 7.5), 2: (7.6, 3.0), 3: (7.3, -1.0), 4: (8.4, -6.0)},
    ),
    "standard": dict(  # OEM profile
        dish="cyl", depth=0.6, side=2.75, front=3.2, back=0.9, base_r=0.9, top_r=2.2,
        rows={1: (11.9, 9.0), 2: (9.8, 4.0), 3: (9.2, 0.0), 4: (10.0, -7.0)},
    ),
    "sphere": dict(  # SA profile (R4 = R2 rotated)
        dish="sph", depth=1.15, side=2.6, front=2.6, back=2.6, base_r=1.2, top_r=2.8,
        rows={1: (14.5, 12.0), 2: (12.2, 6.0), 3: (11.9, 0.0), 4: (12.2, -6.0)},
    ),
    "flat": dict(  # XDA profile (uniform)
        dish="sph", depth=0.6, side=1.4, front=1.4, back=1.4, base_r=1.0, top_r=2.4,
        rows={1: (9.1, 0.0), 2: (9.1, 0.0), 3: (9.1, 0.0), 4: (9.1, 0.0)},
    ),
    "deep": dict(  # MT3-like deep sculpt
        dish="sph", depth=1.55, side=2.4, front=2.4, back=1.9, base_r=1.1, top_r=2.6,
        rows={1: (13.7, 11.0), 2: (11.3, 5.0), 3: (10.9, 0.0), 4: (11.3, -5.0)},
    ),
}

CORNER_PTS = 7  # points per rounded corner (ring has 4 * CORNER_PTS points)


def rrect(cx, cy, w, d, r):
    """Rounded rectangle outline, CCW, starting at the front-right corner arc."""
    r = max(0.01, min(r, w / 2 - 0.01, d / 2 - 0.01))
    pts = []
    corners = [(cx + w / 2 - r, cy - d / 2 + r, -90), (cx + w / 2 - r, cy + d / 2 - r, 0), (cx - w / 2 + r, cy + d / 2 - r, 90), (cx - w / 2 + r, cy - d / 2 + r, 180)]
    for (ox, oy, a0) in corners:
        for i in range(CORNER_PTS):
            a = math.radians(a0 + 90 * i / (CORNER_PTS - 1))
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts


def row_of(row_from_bottom: int) -> int:
    """Layout rowFromBottom → profile row: bottom & ZXCV = R4, ASDF = R3, QWERTY = R2, numbers & F = R1."""
    return {0: 4, 1: 4, 2: 3, 3: 2}.get(row_from_bottom, 1)


def build_keycap(bm: bmesh.types.BMesh, w_u: float, h_u: float, profile: str, row: int, uv_cell=None, solid_uv=None, legend_left=False):
    """Add one keycap to `bm`, centered at the origin, base at z=0 (meters). Returns the top height (m)."""
    P = PROFILES[profile]
    height, angle = P["rows"][row]
    W = w_u * PITCH - 2 * GAP
    D = h_u * PITCH - 2 * GAP
    w1 = W - 2 * P["side"]
    d1 = D - P["front"] - P["back"]
    yc = (P["front"] - P["back"]) / 2  # top center is shifted toward the back
    tilt = math.tan(math.radians(angle))
    uv_layer = bm.loops.layers.uv.verify()
    faces_before = set(bm.faces)

    def plane_z(x, y, t):
        # top plane through (0, yc, height), tilted: front edge lower when angle > 0
        return t * height + (y - yc) * tilt * t

    def dish(x, y):
        hx = w1 / 2
        hy = d1 / 2
        if P["dish"] == "cyl":
            u = min(1.0, abs(x) / hx)
            return P["depth"] * (1 - u * u)
        u = (x / hx) ** 2 + ((y - yc) / hy) ** 2
        return P["depth"] * max(0.0, 1 - u)

    # --- wall rings (base → outer top edge), then a rounded lip (fillet FR) rolling onto the dish
    FR = 0.6
    wt, dt = w1 + 2 * FR, d1 + 2 * FR
    rings = []
    steps = [0.0, 0.06, 0.2, 0.38, 0.56, 0.72, 0.85, 0.95, 1.0]
    for t in steps:
        e = 1 - (1 - t) ** 1.55  # convex walls
        w = W + (wt - W) * e
        d = D + (dt - D) * e
        cy = yc * e
        r = P["base_r"] + (P["top_r"] + FR - P["base_r"]) * e
        ring = []
        for (x, y) in rrect(0, cy, w, d, r):
            z = (plane_z(x, y, t) - FR * t) if t > 0 else 0.0
            ring.append(bm.verts.new((mm(x), mm(y), mm(z))))
        rings.append(ring)
    for a in (30, 60, 90):
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        grow = FR * (1 - ca)
        ring = []
        for (x, y) in rrect(0, yc, wt - 2 * grow, dt - 2 * grow, P["top_r"] + FR - grow):
            ring.append(bm.verts.new((mm(x), mm(y), mm(plane_z(x, y, 1.0) - FR * (1 - sa) - dish(x, y) * (a / 90)))))
        rings.append(ring)
    lip = rings[-1]
    # --- dish: concentric rings toward the center
    K = 7
    top_rings = [lip]
    for k in range(1, K):
        s = 1 - k / K
        ring = []
        for (x, y) in rrect(0, yc, w1 * s, d1 * s, max(0.05, P["top_r"] * s)):
            ring.append(bm.verts.new((mm(x), mm(y), mm(plane_z(x, y, 1.0) - dish(x, y)))))
        top_rings.append(ring)
    center = bm.verts.new((0, mm(yc), mm(plane_z(0, yc, 1.0) - dish(0, yc))))

    faces_top = []

    def bridge(a, b, collect=None):
        n = len(a)
        for i in range(n):
            f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
            if collect is not None:
                collect.append(f)

    for i in range(len(rings) - 1):
        bridge(rings[i], rings[i + 1])
    for i in range(len(top_rings) - 1):
        bridge(top_rings[i], top_rings[i + 1], faces_top)
    last = top_rings[-1]
    for i in range(len(last)):
        faces_top.append(bm.faces.new((last[i], last[(i + 1) % len(last)], center)))

    # --- interior: wall thickness 1.3 mm, ceiling under the top, cross-stem socket
    t_wall = 1.3
    inner_h = min(plane_z(0, -d1 / 2, 1.0), plane_z(0, d1 / 2, 1.0)) - P["depth"] - 1.4
    inner_base = [bm.verts.new((mm(x), mm(y), 0.0)) for (x, y) in rrect(0, 0, W - 2 * t_wall, D - 2 * t_wall, max(0.2, P["base_r"] - 0.5))]
    inner_top = [bm.verts.new((mm(x), mm(y), mm(inner_h))) for (x, y) in rrect(0, yc * 0.6, w1 - 0.6, d1 - 0.6, max(0.2, P["top_r"] - 0.6))]
    # rim (bottom edge between outer base and inner base)
    n = len(inner_base)
    for i in range(n):
        bm.faces.new((rings[0][(i + 1) % n], rings[0][i], inner_base[i], inner_base[(i + 1) % n]))
    for i in range(n):
        bm.faces.new((inner_base[(i + 1) % n], inner_base[i], inner_top[i], inner_top[(i + 1) % n]))
    ceil_c = bm.verts.new((0, mm(yc * 0.6), mm(inner_h)))
    for i in range(n):
        bm.faces.new((inner_top[(i + 1) % n], inner_top[i], ceil_c))
    # stem socket (cylinder Ø5.5 mm down to 1 mm above the base)
    seg = 20
    sb, st = [], []
    stem_bottom = 1.0
    for i in range(seg):
        a = 2 * math.pi * i / seg
        x, y = 2.75 * math.cos(a), 2.75 * math.sin(a)
        sb.append(bm.verts.new((mm(x), mm(y), mm(stem_bottom))))
        st.append(bm.verts.new((mm(x), mm(y), mm(inner_h))))
    for i in range(seg):
        bm.faces.new((sb[i], sb[(i + 1) % seg], st[(i + 1) % seg], st[i]))
    sc = bm.verts.new((0, 0, mm(stem_bottom)))
    for i in range(seg):
        bm.faces.new((sb[(i + 1) % seg], sb[i], sc))

    # --- UVs: legend cell projected onto the top; everything else samples the solid cap color
    if uv_cell is not None:
        u0, v0, u1, v1 = uv_cell
        sq = min(w1, d1) * 0.92
        off = (-(w1 - sq) / 2 + 1.2) if legend_left else 0.0
        top_set = set(faces_top)
        for f in [f for f in bm.faces if f not in faces_before]:
            for loop in f.loops:
                co = loop.vert.co
                if f in top_set:
                    # clamp to the cell: its border is plain cap color, so nothing smears across the top
                    lx = min(1.0, max(0.0, (co.x * 1000 - off) / sq + 0.5))
                    ly = min(1.0, max(0.0, (co.y * 1000 - yc) / sq + 0.5))
                    loop[uv_layer].uv = (u0 + lx * (u1 - u0), v0 + ly * (v1 - v0))
                    continue
                loop[uv_layer].uv = solid_uv if solid_uv else (u0 + 0.02 * (u1 - u0), v0 + 0.02 * (v1 - v0))
    bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if f not in faces_before])
    return mm(height + abs(tilt) * d1 / 2)
