# Art direction & asset pipeline (v0.3 plan)

## Why the current assets look cheap
- Characters and props are stacks of **primitives** (capsules, spheres, boxes) with flat colors. No designed
  silhouettes, no edge bevels, no surface detail, no material variety.
- No **baked lighting / ambient occlusion**, so objects float and everything looks equally lit.
- Proportions were "correct" numerically but not **designed**, which gives the mannequin look.
- The keyboard was a rough approximation (rounded boxes with a taper), not real geometry.

## Direction: "the real deal, with a funny approach"
- **Real**: believable objects at real scale, modeled like production game assets: designed meshes, bevels,
  proper normals, PBR materials with surface detail (PBT grain, bead-blasted aluminum, wood, fabric),
  baked lighting for the shop.
- **Funny**: from *content and performance*, not from broken models. That means joke brands and packaging,
  posters and signage, expressive faces and exaggerated animation (stomps, happy jumps, dramatic sighs), and
  slightly stylized (not realistic) characters.
- **Keyboard = 100% accurate**: modeled from published dimensions. See the spec table below.

## Pipeline
- Assets are modeled **by scripts in Blender 5.2 LTS** (`art/blender/*.py`, run with the `bpy` module) using real
  modeling tools (bmesh topology, lofts, booleans, bevels, subdivision, weighted normals, rigs and shape keys) and
  rendered/baked with Cycles.
- Exported as **glTF (.glb)** into `public/assets/` and loaded by Babylon.js at runtime. The generated files are
  committed, so the game builds without Blender. `npm run art` regenerates them.
- Still "everything generated in code": no downloaded or hand-made assets, and reproducible from the scripts.
- Runtime variety stays procedural: colors, materials, shape-key weights, part swaps (hair, clothes, accessories),
  generated colorways/brands. Every customer and build is still different.

## Keyboard spec used (mm)
| Item | Value |
|---|---|
| Key pitch | 19.05 |
| Keycap base (1u) | 18.0 × 18.0 |
| Plate cutout | 14.0 × 14.0, plate 1.5 thick |
| Plate top → PCB top | 5.0, PCB 1.6 thick |
| MX-style top housing | 15.6 square at the plate, ~6.6 tall; cross stem 4.0 × 1.17, 3.6 above housing; pins at (−3.81, 2.54) and (2.54, 5.08) |
| Stabilizer wire inserts | ±11.9 (2–2.75u), ±50 (6.25u) |
| Keycap rest height | skirt ~4.4 above the plate (4 mm travel) |
| Profiles (top-center height R1/R2/R3/R4, dish) | Cherry 9.4/7.6/7.3/8.4 cyl · OEM 11.9/9.8/9.2/10.0 cyl · SA 14.5/12.2/11.9/12.2 sph · XDA 9.1 uniform sph · MT3-like 13.7/11.3/10.9/11.3 deep sph |
| Case | 8 bezel, 7° typing angle, flat bottom, USB-C cutout |

Profile heights come from published comparison charts and vary ±0.3 mm between manufacturers. Send exact references
(e.g. a specific brand's CAD numbers) to have them matched.

## Phases
1. **Keyboard kit** (proof of concept done, see `art/previews/`): all 6 layouts, 5 profiles, switch types
   (linear/tactile/clicky/silent looks), case per material (aluminum, plastic, polycarbonate, acrylic sandwich, wood, brass),
   plates, foams, PCB (hot-swap sockets, diodes, MCU, USB-C), stabilizers, then in-game integration.
2. **Characters**: one designed base body (quad topology, subdivision), rigged, with face shape keys (smile, frown,
   angry, talk, blink), clothing and hair variants, animation clips (idle, walk, talk, wave, happy, angry, typing).
   **A sample will be shown for approval before producing the variants.**
3. **Shop**: architecture (moldings, window frames, door), furniture (shelving, counter, workbench with pegboard,
   display tables), props (tools, lube jars, switch bags, product boxes with generated joke-brand art, neon sign as
   real tube geometry), **baked lighting**.
4. **Minigame props**: lube station (brush, pot), switch opener, stab wire close-ups, soldering station, screwdriver,
   tape roll, keycap puller.
5. **Integration & performance**: LODs, instancing, WebP textures, mobile checks.
