import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from common import *
from switches import build_switch, materials

reset()
specs = [
    ("mx", "linear", materials("#eef6ff", "#e0322b", "#f4f1ea", clear=True), "MX linear (clear top)"),
    ("mx", "tactile", materials("#2a2a2e", "#8b5a2b", "#2a2a2e"), "MX tactile"),
    ("mx", "clicky", materials("#f4f1ea", "#2f6fe0", "#f4f1ea"), "MX clicky"),
    ("box", "linear", materials("#ffd6e0", "#f2c230", "#ffd6e0"), "Box linear"),
    ("choc", "linear", materials("#3a3d42", "#e0322b", "#3a3d42"), "Choc low-profile"),
]
for i, (fam, kind, mats, label) in enumerate(specs):
    x = mm((i - 2) * 26)
    parts = build_switch(fam, kind, True, mats)
    for o in parts.values():
        o.location.x += x
        o.location.y += mm(22)
        o.location.z += mm(9)
    ex = build_switch(fam, kind, True, mats, explode=7.0)
    for o in ex.values():
        o.location.x += x
        o.location.y += mm(-22)
        o.location.z += mm(12)
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, mm(-15), 0))
g = bpy.context.object
g.scale = (0.6, 0.5, 1)
assign(g, principled("ground", "#3a4350", roughness=0.8))
world_studio("#dfe3e8", 0.5)
area_light((mm(-60), mm(-150), mm(160)), (0, mm(-15), mm(10)), 2.2, size=0.25)
area_light((mm(140), mm(60), mm(90)), (0, mm(-15), mm(10)), 0.9, size=0.2, color="#dbe6ff")
camera((mm(0), mm(-250), mm(150)), (0, mm(0), mm(8)), lens=50)
render("/home/model/art-scratch/switches.png", 1400, 700, samples=48)
