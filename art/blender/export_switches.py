"""Export switch parts as glTF: one file per family with every part/variant as a named node (meters, origin = plate top).
   mx.glb:  top, bottom3 (3-pin), bottom5 (5-pin), pins, leaf, spring, jacket, stem_linear/tactile/clicky/silent
   box.glb: same + box (wall)  ·  choc.glb: top, bottom, pins, spring, stem_linear/tactile/clicky
Materials are placeholders named by role; the game assigns product colors."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from common import *
import switches as S

OUT = os.path.join(os.path.dirname(__file__), "../../public/assets/models")

def tris(o):
    o.data.calc_loop_triangles()
    return len(o.data.loop_triangles)

def export_family(fam):
    reset()
    objs = {}
    M = S.materials()
    if fam in ("mx", "box"):
        tops = S.mx_top_housing(box_style=fam == "box")
        objs["top"] = assign(tops[0], M["housing"])
        if len(tops) > 1:
            objs["box"] = assign(tops[1], M["housing"])
        objs["bottom3"] = assign(S.mx_bottom_housing(False), M["bottom"])
        objs["bottom5"] = assign(S.mx_bottom_housing(True), M["bottom"])
        objs["pins"] = assign(S.mx_pins(), M["gold"])
        objs["leaf"] = assign(S.mx_leaf(), M["metal"])
        objs["spring"] = assign(S.spring("spring", 2.6, -7.6, S.MX_H - 2.2, 9.5), M["spring"])
        objs["spring_lo"] = assign(S.spring("spring_lo", 2.6, -7.6, S.MX_H - 2.2, 9.5, per_turn=10, res=0), M["spring"])
        objs["jacket"] = assign(S.mx_click_jacket(), M["jacket"])
        for k in ("linear", "tactile", "clicky", "silent"):
            objs["stem_" + k] = assign(S.mx_stem(k, box_style=fam == "box"), M["stem"])
    else:
        objs["top"] = assign(S.choc_top_housing(), M["housing"])
        objs["bottom"] = assign(S.choc_bottom_housing(), M["bottom"])
        objs["pins"] = assign(S.choc_pins(), M["gold"])
        objs["spring"] = assign(S.spring("spring", 1.8, -3.8, S.CHOC_H - 1.6, 5.5, 0.18), M["spring"])
        objs["spring_lo"] = assign(S.spring("spring_lo", 1.8, -3.8, S.CHOC_H - 1.6, 5.5, 0.18, per_turn=10, res=0), M["spring"])
        for k in ("linear", "tactile", "clicky"):
            objs["stem_" + k] = assign(S.choc_stem(k), M["stem"])
    total = 0
    for name, o in objs.items():
        o.name = name
        o.data.name = name
        total += tris(o)
        print(f"  {fam}.{name}: {tris(o)} tris")
    print(f"{fam}: {total} tris total")
    export_glb(os.path.join(OUT, f"switch_{fam}.glb"), list(objs.values()), export_materials="EXPORT")

for fam in ("mx", "box", "choc"):
    export_family(fam)
