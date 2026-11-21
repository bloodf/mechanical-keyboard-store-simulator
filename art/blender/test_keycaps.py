import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
from common import *
from keycap import build_keycap, PROFILES

reset()
profiles = ["low", "standard", "sphere", "flat", "deep"]
mat = principled("pbt", "#ece6d6", roughness=0.72, grain=0.25, grain_scale=900)
for pi, p in enumerate(profiles):
    for r in (1, 2, 3, 4):
        bm = bmesh.new()
        build_keycap(bm, 1, 1, p, r)
        ob = mesh_from_bmesh(f"{p}R{r}", bm)
        ob.location = (mm((r - 1) * 22), mm(-pi * 24), 0)
        assign(ob, mat)
bm = bmesh.new(); build_keycap(bm, 2.25, 1, "low", 3); ob = mesh_from_bmesh("enter", bm); ob.location = (mm(110), 0, 0); assign(ob, mat)
bm = bmesh.new(); build_keycap(bm, 6.25, 1, "low", 4); ob = mesh_from_bmesh("space", bm); ob.location = (mm(150), mm(-40), 0); ob.rotation_euler = (0, 0, 1.5708); assign(ob, mat)
# ground
bpy.ops.mesh.primitive_plane_add(size=1, location=(mm(60), mm(-50), 0)); g = bpy.context.object; g.scale = (0.6, 0.5, 1)
assign(g, principled("mat", "#2f3a44", roughness=0.85))
world_studio("#cfd5dc", 0.45)
area_light((mm(60), mm(-250), mm(300)), (mm(60), mm(-50), 0), 3.0, size=0.35)
area_light((mm(-250), mm(100), mm(150)), (mm(60), mm(-50), 0), 1.2, size=0.3, color="#cfe0ff")
camera((mm(60), mm(-420), mm(200)), (mm(62), mm(-45), mm(3)), lens=55)
render("/home/model/art-scratch/keycaps.png", 960, 540, samples=32)
