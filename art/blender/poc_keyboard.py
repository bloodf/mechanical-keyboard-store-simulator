import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import bpy, math
from common import *
from keyboard import build_keyboard

reset()
colorway = {
    "alpha": "#e9e3d3", "mod": "#a8a296", "accent": "#d0552c",
    "legend_alpha": "#2b2924", "legend_mod": "#f1ede4", "legend_accent": "#fff6ee",
}
switch = {"housing": "#f4f1ea", "stem": "#e0322b", "bottom": "#e9e6de"}
mode = sys.argv[-1] if len(sys.argv) > 1 else "hero"
if mode == "switch":
    from keyboard import build_switch
    hm = principled("housing", "#e8f2ff", roughness=0.08, transmission=0.9)
    sm = principled("stem", "#e0322b", roughness=0.35)
    bmm = principled("bottom", "#f4f1ea", roughness=0.45)
    for o in build_switch(hm, sm, bmm, "ex", exploded=6.0):
        o.location.z += mm(25)
    for o in build_switch(hm, sm, bmm, "as"):
        o.location.x += mm(-30); o.location.z += mm(12)
root, parts = (None, []) if mode == "switch" else build_keyboard("65", colorway, "low", case_color="#5b7593", case_metal=True, switch=switch, show_caps=(mode != "build"))
# desk + desk mat
bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0, -0.0005))
assign(bpy.context.object, principled("desk", "#a87a4f", roughness=0.55, grain=0.4, grain_scale=120))
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, mm(10), mm(-0.5)))
matobj = bpy.context.object
matobj.scale = (0.62, 0.28, mm(3))
add_modifier(matobj, "BEVEL", width=mm(1.5), segments=3)
assign(matobj, principled("deskmat", "#2b3038", roughness=0.95, grain=0.6, grain_scale=3000))
world_studio("#e8dccb", 0.35)
area_light((mm(-300), mm(-250), mm(450)), (0, 0, 0), 18, size=0.6, color="#fff1dd")
area_light((mm(450), mm(300), mm(250)), (0, 0, mm(20)), 6, size=0.5, color="#d6e4ff")
if mode == "hero":
    camera((mm(-210), mm(-430), mm(260)), (mm(10), mm(5), mm(15)), lens=45)
elif mode == "build":
    camera((mm(-60), mm(-185), mm(150)), (mm(-75), mm(5), mm(10)), lens=40)
elif mode == "switch":
    camera((mm(-10), mm(-75), mm(55)), (mm(-12), 0, mm(22)), lens=50)
else:
    camera((mm(-95), mm(-130), mm(95)), (mm(-70), mm(-5), mm(18)), lens=50)
render(f"/home/model/art-scratch/kb_{mode}.png", 1280, 720, samples=40)
