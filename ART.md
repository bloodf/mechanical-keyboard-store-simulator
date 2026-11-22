# Art direction & asset pipeline (v0.3)

## Direction: "the real deal, calm"
- **Real**: objects at real scale, modeled like production assets (lofts, booleans, bevels, weighted normals), PBR
  materials lit by an image-based environment, soft shadows.
- **The keyboard is 100 % accurate**: modeled from published dimensions (table below).
- **Funny** comes from writing (orders, membrane requests, reviews, joke brands), not from crude models.

## Pipeline
- Assets are **modeled by Python scripts in Blender 5.2 LTS** (`art/blender/*.py`, run with the `bpy` module:
  `~/.venvs/bpy/bin/python art/blender/<script>.py`). Everything stays "generated in code", reproducible, no downloads.
- Output in `public/assets/` (committed, so the game builds without Blender):

| File | Made by | What |
|---|---|---|
| `models/switch_mx.glb`, `switch_box.glb`, `switch_choc.glb` | `export_switches.py` (+ `switches.py`) | Every switch part as a named node: top housing (hollow, stem opening, LED window, latch windows), bottom housing (3- and 5-pin, plate clips, center post), gold pins, leaf, closed-end spring (+ low-poly spring), click jacket, stems per type (linear / tactile bumps / clicky / silent pads), Box wall; Choc housing + twin-rail stems |
| `models/bench.glb` | `workshop.py bench` | Butcher-block bench top, steel legs & shelf, articulated desk lamp, mug, parts tray, tester |
| `env/workshop_bg.jpg` | `workshop.py pano` + `pano_post.py` | 360° Cycles render of the workshop from the bench (background) |
| `env/workshop.env` | `pano_post.py` + `tests/e2e/make_env.cjs` | Prefiltered environment (image-based lighting and reflections) |

- The workshop room (walls, wainscot, window with daylight, pegboard with tools, shelves with stock boxes, poster,
  clock, packing table, door, pendant lights) only exists in the panorama: the camera never leaves the bench, so the
  room costs one texture. The bench and its props are real meshes so the keyboard sits on them and casts shadows.
- **Keycaps are generated at runtime** (`src/engine/keyboard/keycapGeo.ts`, a TypeScript port of `art/blender/keycap.py`):
  every size, row and profile, with legends projected from an atlas onto the dish. **Cases, plates, PCBs, foams and
  stabilizers are generated at runtime** too (`board.ts`), from the layout. **Switches** come from the glb files
  (thin-instanced: one draw call per part for the whole board).
- Babylon loads the glb files with a small reader (`src/engine/glb.ts`) — the official loader package lags behind
  the Babylon core version we use.
- Previews: `sandbox.html?view=workshop|caps|board2` (Babylon), `art/previews/` (Cycles renders), `npm run art:preview`.

## Keyboard spec (mm)
| Item | Value |
|---|---|
| Key pitch | 19.05 (1u); keycap base 18.0 × 18.0 for 1u |
| Plate | 1.5 thick (1.2 for Choc); cutouts 14.0 × 14.0 (13.8 Choc); stabilizer cutouts 6.75 × 14 at ±11.9 (2–2.75u) and ±50 (6.25u) |
| PCB | top 5.0 below the plate top (2.2 for Choc), 1.6 thick; switch footprint pins (−3.81, 2.54) & (2.54, 5.08), Ø4 center post, 5-pin plastic pegs at ±5.08 |
| MX-style switch | top housing 15.6 square at the plate → 12.2 × 11.6 top, 6.6 tall; cross stem 4.0 × 1.17 / 1.27 arms; stem top 10.2 above the plate; travel 4.0 (Box 3.6) |
| Choc switch | housing 15.0, 3.0 above the plate; twin rails 1.2 × 3.0, 5.7 apart; travel 3.0; caps float above the housing |
| Keycap rest | skirt 4.4 above the plate (MX), 5.8 (Choc) |
| Profiles (top-center height R1/R2/R3/R4, dish) | Cherry 9.4/7.6/7.3/8.4 cyl · OEM 11.9/9.8/9.2/10.0 cyl · SA 14.5/12.2/11.9/12.2 sph · DSA 7.6 uniform sph · XDA 9.1 uniform sph · MT3 13.7/11.3/10.9/11.3 deep sph · KAT 12.6/10.4/9.6/10.4 sph · LP (Choc) 3.5 uniform shallow sph |
| Cases | plastic tray (fillet, 5°), acrylic sandwich (layer lines, 2°), aluminum top-mount (chamfer, 7°), polycarbonate gasket (translucent, 6°), wood (grain, 6°), brass (polished, 7°); flat bottom on the desk, USB-C port; low-profile cases for Choc |

Profile heights come from published comparison charts and vary ±0.3 mm between manufacturers.

## Regenerating
```bash
~/.venvs/bpy/bin/python art/blender/export_switches.py        # switch glb files
~/.venvs/bpy/bin/python art/blender/workshop.py bench         # bench.glb
~/.venvs/bpy/bin/python art/blender/workshop.py pano          # panorama HDR (~15 min on 4 CPU cores)
~/.venvs/bpy/bin/python art/blender/pano_post.py              # background jpg + small HDR
node tests/e2e/make_env.cjs                                   # workshop.env (needs `npm run dev`)
~/.venvs/bpy/bin/python art/blender/poc_switches.py           # Cycles render of the switch models
```

## Removed in v0.3
The procedural humans, the walkable store and the avatar editor (the game no longer has a shop floor).
