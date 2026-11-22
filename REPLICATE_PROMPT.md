# Single-shot prompt: Mechanical Keyboard Store Simulator

Copy everything inside the block below into a coding agent that can run commands in a Linux shell.

---

```text
Build a complete browser game called "Mechanical Keyboard Store Simulator" (tagline "Thock responsibly.").
Deliver a working project with unit tests, end-to-end tests, documentation, and a zip at the end.

=== 1. CONCEPT ===
You run a small custom mechanical-keyboard workshop. The whole game happens from one 3D view of your workbench:
there is no shop floor, no walking and no 3D customers. From the bench you:
- take client orders (accept / decline, each with a budget and a deadline in days),
- keep parts in stock and buy them from suppliers,
- build every keyboard by hand through short, forgiving 3D minigames,
- ship it to the client, who pays on delivery and mails a review a few hours later.
Tone: calm and cozy, like recent "simulator" games. The humor comes only from writing: joke brands, client
quotes, membrane-keyboard requests, reviews, and the cheater screen. No babbling voices, no stomping.
Everything is generated from a per-run world seed, so no two runs are the same: brands, product names,
colorways, case colors, clients, requests, reviews. Only invented joke brands, never real ones.
English only, but every visible string goes through t("key") from src/i18n/locales/en.ts (plurals, money
formatting, "@key" params). Desktop (mouse + keyboard) and mobile (touch, portrait). Sound effects only, no music.

=== 2. TECH ===
TypeScript + Vite, Babylon.js 9 (@babylonjs/core, @babylonjs/gui). Everything, 3D and UI, is drawn inside one
canvas with Babylon GUI: keycap-style buttons with a 3D press, panels, tiles, chips, charts, modal sheets with
scroll lists. No HTML UI. Fonts: @fontsource/fredoka for the UI, @fontsource/inter for keycap legends.
Crypto: @noble/ciphers + @noble/hashes. earcut for plate polygons. vite base "./" so dist/ works in a
sub-folder. The vite config defines __APP_VERSION__ from package.json.
Layout:
  src/core   (seeded rng, state, migrations)
  src/save   (crypto, saveManager)
  src/data   (layouts, parts, profiles, catalog, color, colorway, names)
  src/build  (jobs/orders, session, profile, scoring, stock, workshop, tools)
  src/audio  (engine, dsp, library, keyPress, voice)
  src/i18n
  src/engine (app shell, glb reader, keyboard/, workshop/, cheaterScene)
  src/gui    (theme, widgets, ui, sheet, screens/)
  src/game   (game.ts, bench/, panels/, results, orderCard, skuText)
Also: art/blender (Blender scripts), public/assets (generated art), tests/unit, tests/e2e, scripts/coverage.mjs.
Keep all game rules framework-free in src/build, src/core and src/data so they can be unit tested.

=== 3. THE KEYBOARD MUST BE ACCURATE (real dimensions in mm) ===
Key pitch 19.05 (1u). Keycap base 18.0 for 1u. Layouts: 40%, 60%, 65%, 75%, TKL, full-size (with numpad).
Each key has a KeyboardEvent.code so a real keyboard can drive it. Stabilizers on keys ≥2u.
Stabilizer plate cutouts 6.75×14 at ±11.9 mm (2–2.75u) and ±50 mm (6.25u).
Plate: 1.5 mm thick with 14.0 mm cutouts (Choc: 1.2 mm, 13.8 mm cutouts).
PCB: top 5.0 mm below the plate top (Choc: 2.2), 1.6 mm thick. The PCB artwork is a canvas texture: traces,
switch outlines, gold pads at (−3.81, 2.54) & (2.54, 5.08), center hole, RGB LED slots. The back side shows
hot-swap sockets and diodes. Flex-cut slots are drawn on flex PCBs.

Switch families:
- MX: top housing 15.6 mm square at the plate tapering to about 12.2×11.6, 6.6 mm tall; cross stem
  4.0 × 1.17/1.27 arms; stem top 10.2 mm above the plate; travel 4.0.
- Box: MX footprint, square box wall around the cross, travel 3.6.
- Choc (low profile): housing 15×15, 3.0 mm above the plate; twin rails; travel 3.0. Low-profile caps float
  above the housing.
MX and Box share the MX footprint and MX keycaps. Choc needs a Choc PCB, plate and stabilizers, plus
low-profile keycaps.

Keycap profiles, generated at runtime in TS. Numbers are top-center height per row R1/R2/R3/R4, tilt, and dish:
  Cherry 9.4/7.6/7.3/8.4 (cylindrical dish)
  OEM    11.9/9.8/9.2/10.0 (cylindrical)
  SA     14.5/12.2/11.9/12.2 (spherical)
  DSA    7.6 uniform (spherical)
  XDA    9.1 uniform, wide top (spherical)
  MT3    13.7/11.3/10.9/11.3 (deep spherical)
  KAT    12.6/10.4/9.6/10.4 (spherical)
  Low-profile (Choc) 3.5 uniform (shallow)
Row mapping: bottom row & ZXCV = R4, ASDF = R3, QWERTY = R2, numbers & F-keys = R1.

Keycap generator:
- lofted convex walls from the base to a 0.6 mm rounded lip that rolls into the dish;
- hollow inside with a stem socket;
- legends from a canvas atlas (single letters top-left, words centered, wide modifiers left-aligned), with
  UVs clamped to the atlas cell;
- cap space (x right, y away, z up, CCW faces) converted to Babylon left-handed space as X=−x, Y=z, Z=−y.
  This mirror flips the winding, which is what Babylon's front faces expect. Don't reverse the indices again.

Case styles, each with its own bezel, corner radius, fillet or chamfer edge, wall height and typing angle:
  plastic tray (fillet, 5°)
  acrylic sandwich (translucent, layer-line texture, 2°)
  aluminum top-mount (chamfer, 7°)
  polycarbonate gasket (translucent, 6°)
  wood (grain texture, 6°)
  brass (polished, 7°)
Every case has a flat bottom resting on the desk, is tilted by its typing angle, and has a USB-C port.
Cases for Choc builds are lower. Plates: aluminum, FR4, PC, POM, brass, carbon, or plateless.
Foams: case foam, plate foam (with cutouts), PE foam, tape on the PCB back, silicone bottom.

The Board class builds all of this in millimeters under a node scaled to key units (1 unit = 1u = 19.05 mm).
- Drop-in animations for every layer.
- Switch parts are thin-instanced (one draw call per part for the whole board).
- Install animations for switches and caps.
- Key presses move the stem and cap by the family's travel.
- Invisible thin-instance hit boxes for picking keys.
- Colored marker discs for the key test.
- Tape strips on the PCB back.
- The PCB flips over for the tape mod.
- Screw points on the case rim.
- setFamily rebuilds everything for MX/Box/Choc.
- dispose() removes meshes together with their materials and textures.

=== 4. ART PIPELINE (real modeled assets, not primitive stacks) ===
Use Blender 5.x as a Python module (pip "bpy" in a venv) to MODEL assets by script: bmesh lofts, booleans,
bevels, weighted normals, PBR materials. Export glTF to public/assets and commit the files, so the game builds
without Blender.
- art/blender/switches.py + export_switches.py → switch_mx.glb, switch_box.glb, switch_choc.glb. One file per
  family; every part is a named node:
    top housing (hollow, stem opening, LED window, latch windows)
    bottom housing, 3-pin and 5-pin (plate clips, center post)
    gold pins, leaf, closed-end spring + low-poly spring, click jacket
    stems: linear, tactile (bumps), clicky, silent (pads)
    Box wall
    Choc housings and twin-rail stems
- art/blender/workshop.py: a cozy workshop room rendered by Cycles as a 360° equirectangular HDR panorama
  from the bench camera position:
    walls with green wainscot, wood floor, window with daylight
    pegboard with tools, shelf with lube jars & boxes, metal stock shelving with printed joke-brand boxes
    poster "KEEP CALM AND THOCK ON", clock, packing table, door, pendant lights
  The bench and its props are hidden from the panorama camera but still cast light; they are exported
  separately as bench.glb (butcher-block top, steel legs, articulated lamp, mug, tray).
- Procedural textures (wood grain, planks, pegboard, box art, sky) are made with PIL + numpy.
- art/blender/pano_post.py turns the HDR into workshop_bg.jpg (sRGB background) and a small HDR.
- A headless-Chromium script (tests/e2e/make_env.cjs + a sandbox view) turns the small HDR into a prefiltered
  Babylon workshop.env.
- In the game:
  - The background is a big sphere with a ShaderMaterial doing an exact equirect lookup per pixel, so there
    are no seams.
  - scene.environmentTexture = workshop.env (image-based lighting).
  - Tone mapping: KHR PBR neutral.
  - A directional "window" light with PCF shadows, plus a warm spot from the lamp.
  - A real desk mat mesh with a felt canvas texture; the workshop name is printed in its corner.
- Write a tiny glb reader (src/engine/glb.ts) instead of the loader package:
  - meshes, node transforms and children (no scene → roots are nodes nobody lists as a child);
  - uint8/16/32 indices;
  - metallic-roughness materials with base-color textures, including EXT_texture_webp;
  - convert glTF to Babylon with x → −x.
- Dev sandbox page sandbox.html?view=workshop|caps|board2 for art checks.

=== 5. GAME LOOP & SCREENS ===
Title screen:
- a slow camera sway over the bench, with a different finished showcase keyboard every time;
- Continue (shows day & money), New Game (confirm if a save exists), Settings, version.
New game → a small form with your name and your workshop name.

Workshop HUD (top bar):
- workshop name + "Day N · HH:MM";
- buttons Orders / Stock / Suppliers / Mail with red count badges (offers, shipments on the way, unread mail);
- money, reputation (★ 0.0–5.0), "🌙 Close for today", ☰ menu;
- the menu holds Resume, 📊 Workshop stats, Profile, Settings, Main menu;
- on narrow screens the HUD uses icons and a second row.

Panels: big modal sheets, closed with ✕, Esc or a click outside. While a panel is open the bench UI is hidden.
- ORDERS, two tabs: New requests / Accepted.
  - Order cards show: name, persona, quote, requirement chips, "Pays $X", "📅 Due in N days" (red when late),
    and a stock check ("✓ Everything in stock" or "Missing: Cases, PCBs…").
  - Actions: Accept (queue max 4) / Decline.
  - Membrane requests (~12% of orders): "Explain why not" picks one of 3 replies; the client mails a reply
    later and reputation +2. "Suggest a real mechanical keyboard" turns the request into a build order.
  - Accepted cards have "Start building".
- STOCK: category filter buttons that wrap on narrow screens (All, Cases, PCBs, Plates, Stabilizers, Switches,
  Keycaps, Foam & tape, Lube, Tools). Rows show icon, name, description and "× N". A "stock value" total, an
  "On the way" list, and an "Open suppliers" button when empty.
- SUPPLIERS: category tabs, layout filter (cases, PCBs, plates), footprint filter MX/Choc (PCBs, plates,
  stabilizers).
  - Cases: one row per material with color swatches.
  - Switches: pack buttons 10/35/70/110 with bulk discounts.
  - Lube: jar = 3 boards.
  - Items locked until N keyboards delivered show "🔒 After N builds".
  - Cart column: remove lines; shipping Standard (tomorrow 09:00, free over $150, else $8) or Express
    (in 2 workshop hours, $15 + 10%); totals; "Place order"; "⏳ Wait for it" skips ahead to an express
    delivery.
  - On phones the cart opens as a dialog.
  - The cart survives closing the panel but resets for a new world seed.
  - TOOLS tab: one-time purchases that unlock with builds:
      switch press $90 — no bent pins
      torque screwdriver $70 — wider green zone
      lube station $180 — bigger sweet spot, lubing −30% time
      key tester $80 — test 4 min instead of 10
      temperature-controlled iron $150 — slower ring, soldering −30% time
      packing station $120 — packing 5 min, +2 reputation per good delivery
- MAIL: list (sender, time, subject, unread dot) + reading pane; on phones a letter opens as a dialog. Kinds:
  welcome letter (from "Parts Depot"), reviews with stars, complaints, late-delivery reviews, cancellations,
  membrane replies, and "Grandma Thock" rescue money.
- WORKSHOP STATS: days, reputation, shipped, five-star builds, profit, late deliveries, unhappy clients,
  declined orders, membrane talks, tools owned, recent deliveries.

=== 6. RULES (framework-free, unit tested) ===
Time:
- Workshop clock 09:00–18:00. Time moves only when you work: each build step adds minutes, shown on the Next
  button. Roughly: case 10, pcb 5, damp 5+4/foam (+12 tape), plate 5, stabs 15+lube 10+mods, switches 5,
  lube 0.5/key, install 0.25/key, solder 0.6/key, screws 10, keycaps 15, test 10, sound 5, pack 15.
  Tools shorten some of these.
- Working past 18:00, or "Close for today", ends the day. If a dialog is open, the day report waits until
  it closes.
- The day report lists shipped keyboards, income, money spent on parts & tools, rent, new orders, deliveries,
  new mail and rescue money.

Next morning:
- receive shipments;
- expire unanswered offers (each offer has 1 day to answer);
- cancel accepted orders more than 2 days past due (complaint mail, reputation −15);
- charge rent $25, never below $0;
- if money < $50, nothing is on the bench, stock value < $100 and nothing is on the way, Grandma Thock mails
  $200 (at most once per 7 days);
- new offers: 2–5, more with reputation, never more than 6 waiting in total.

Start of a new game:
- $500, reputation 3.0;
- a starter kit: 65% plastic black case, hot-swap MX PCB 65, aluminum plate 65, standard stabilizers,
  70 MX linear switches, one MX keycap set, 2 case foam, 1 tape, 2 lube;
- a welcome letter and two orders. The first is a tutorial: a 65% that sounds creamy, which the starter kit
  can build well.

Stock:
- SKU strings:
    case/<material>/<layout>/<colorId>
    pcb/<id>/<layout>/<mx|choc>
    plate/<id>/<layout>/<mx|choc>
    stab/<id>/<mx|choc>
    sw/<switchId>   (one switch)
    kc/<setId>
    foam/<id>
    lube            (one portion per board)
- Unit prices come from the part price × a layout factor; Choc PCBs and plates cost 15% more.
- The inventory is a map SKU → count.

Building:
- Starting a build moves the order to the bench. Parts are reserved from stock as you pick them; swapping a
  part returns the old one.
- Changing the case layout releases the PCB, plate and switches. Changing the PCB footprint releases the
  plate, stabilizers and switches.
- "Put aside" returns all parts (used lube is gone) and puts the order back in the queue.
- A helper lists what's missing to build an order from the current stock (best layout/footprint combination).
- Parts cost for profit uses the reserved SKUs at supplier prices.

Orders:
- Generated from seed + index.
- Personas: gamer, programmer, writer, streamer, office, student, grandparent, audiophile, collector, artist.
- Layout request: exact / compact / arrows / F-row / numpad / any.
- Sound words: thocky, clacky, creamy, marbly, poppy, quiet, loud, clicky, deep, crisp — picked from sensible
  combos only.
- Feel: any, light, heavy, linear, tactile, clicky, smooth.
- Theme: a color family and/or hue from the unlocked keycap sets.
- Budget ≈ reference parts cost × persona factor × 1.1–1.7; pickiness.
- Wishes that grow with experience: keycap profile (per-persona favorites), low-profile, hot-swap, case
  material.
- The quote is built from translatable phrase variants (job.greet.N, job.intro.<persona>.N, …).
- Lead time by size: 2–4 days.

Sound model:
- Every part moves a profile: depth, brightness, ping, scratch, rattle, volume, click.
- The same profile drives the synthesized typing sound, a radar chart and the score.
- Each sound word maps to target ranges on those axes.

Scoring:
- layout 0.2, sound 0.3, feel 0.14, looks/theme 0.13, build quality 0.13 (rattle, scratch, screws, unfixed
  faults), wishes ("spec") 0.1.
- Caps: wrong layout → max 2 stars; unfixed faults → max 3; missed wishes → max 3. Picky clients shift the
  thresholds.
- Pay: 100% at 3+ stars, 80% at 2, 50% at 1. Tip 10–20% at 4–5 stars.

Late delivery: pay −15% per day late (floor 50%), −1 star (−2 if 3+ days late), no tip, late review text.

Unlocks: better parts and tools after N delivered keyboards.

Per-run catalog:
- switches (MX, Box and Choc archetypes × linear/tactile/clicky/silent; nylon/PC/POM housing; spring;
  factory lube; long pole; generated joke brand + name; stem/housing/bottom colors);
- keycap sets covering all 8 profiles and ABS/PBT/POM, with generated colorways in families pastel, retro,
  dark, mono, vivid and readable legends;
- case colors per material (named classics + generated).

=== 7. THE BENCH (build steps) ===
Layout:
- the step bar (emoji chips) is under the HUD;
- the order ticket is on the left: name, persona, due chip, quote (ellipsized), wish chips, Pays / Parts used /
  Profit, live sound preview radar; on phones it's a button that opens it as a dialog;
- the parts drawer is at the bottom: title, hint, a paged row of tiles with ◀ ▶;
- drawer footer: ← Back (only until the switches are installed), Next → with "⏱ N min", "Put aside", and
  "⏳ Wait for the courier" when an express delivery is coming.
Tiles show icon, name, description, sound effect words, and "In stock: N" or "Need 68, have 12" (dimmed).
The last tile is always "🛒 Order more…", which opens Suppliers pre-filtered.
The camera frames the keyboard in the free screen area; right-drag looks around and the wheel zooms.

Steps:
1. Case — pick from cases in stock; the layout comes from the case.
2. PCB — the footprint sets the family.
3. Dampening — toggle foams. Tape starts a 3D minigame: the PCB flips and you swipe across each lane.
4. Plate — or plateless.
5. Stabilizers — tiers + clip / band-aid mods. Wire-lube 3D minigame: drag a brush along a magnified wire
   placed on the mat in front of the keyboard, on a timer. Or skip.
6. Switches — needs enough units for every key.
7. Lube — the real switch model at 4× scale, opened up in front of the keyboard. Hold a button or Space;
   release in the green zone of a gauge (linear, tactile, clicky and silent each have their own zone;
   over-lube makes it mushy and kills clicks); 5 rounds; redo ↺. Uses one lube portion; if there is none:
   order or skip.
8. Install — click/drag onto keys; fast dragging may bend pins (dead keys) unless you have the switch press.
9. Solder (solder PCBs only) — rhythm: a ring shrinks on a pad under the iron; tap or press Space when it
   matches; misses leave cold joints (dead or chattering keys).
10. Close case — hold each screw; release with the torque needle in green; too short = loose, too long =
    stripped.
11. Keycaps — from stock, mount must fit the family; caps cascade in.
12. Key test — press every key (real keyboard or taps) or run a sweep; faulty keys show red/orange; click to
    fix them.
13. Sound check — type or auto-type, radar chart vs. target, match %, a description of the sound, toggle
    foams from stock.
14. Pack & ship — client pays now. A shipped screen shows the QA bars and the payment; the review mail
    arrives 1.5–10 hours later.

Every change saves. Reloading mid-build restores the board from the session.

=== 8. SAVE & ANTI-CHEAT ===
Storage:
- State is plain JSON, versioned (v4), with migrations v1→v2→v3→v4. v4 turns an old shop-floor save into a
  workshop: jobs become orders, a build in progress goes back to the queue, starter stock is given once.
- Sealed with AES-256-GCM. The key comes from HKDF-SHA-256 with a random salt; the slot name is bound as
  associated data; the blob prefix is "MKSS1.".
- Two localStorage slots are written alternately, with a counter whose parity picks the slot.
- A sealed "shame" record survives wipes.
Tamper detection:
- Before each write, check the slots still contain exactly what this session wrote.
- Any failed authentication, a mismatch between the slots, or a validateState failure counts as tampering.
- The funny CHEATER DETECTED scene: an angry membrane keyboard with googly eyes, police lights, falling
  keycaps, a fake "Reporting you to the Keyboard Police…" bar stuck at 99%, jokes, and "Start over (with
  shame)". The screen survives reloads.
- Starting over begins a new game with a permanent 🤡 Known Cheater badge in the HUD.
Not cheating:
- Authentic data from another tab pauses this tab. A BroadcastChannel enforces one tab at a time, with an
  "Open it here instead" button.
- Clearing site data while playing gives a fresh start.
- If storage is full, report failed and keep the previous save.
Save right after a new game is created, so the starter stock isn't lost if the tab closes.

=== 9. AUDIO ===
Web Audio, everything synthesized, with a little random variation each play:
- ~59 effects: UI, money, progress, shop/workshop, bench tools, keyboard presets and spacebar, cheater sounds;
- the typing sound is parametric and driven by the build's sound profile;
- buses Interface / Workshop & bench / Keyboard + master + mute in Settings, saved in localStorage outside the
  protected save;
- a limiter; an offline render function for tests;
- a dev "sound board".

=== 10. DEV HOOKS (dev builds only, used by the e2e tests) ===
window.__mkss:
  find(name)        → CSS-pixel center of a named GUI control, or null if hidden or not laid out
  state(), catalog(), step(), autoStep() (finish the current step well, buying dev parts if needed)
  keyScreen(id), keyCount(), faults(), settled(), minigame() (screen points of the active minigame's targets)
  refresh()         (persist + redraw after a test edits the state)
  game
Other dev-only pieces:
- window.__mkssAudio.renderOffline;
- a 🛠 dev button: auto-step, unlock all, +$100, next day, sound board, tamper demo, wipe;
- reloads go through a hook (window.__beforeReload) so the test harness can save coverage first.
Every interactive control has a stable testId name. Layout containers and labels must not swallow pointer
events.

=== 11. TESTS (must all pass) ===
Unit tests (vitest, node), in tests/unit:
- rng, state validation & migrations, crypto/saveManager (tamper, live edit, conflict, wipe, full storage,
  damaged envelopes, shame record);
- i18n and content completeness (every generated quote renders without missing keys);
- layouts, balance (every sound request is achievable), scoring, profile;
- workshop economy (days, deliveries, rent, rescue, orders, membrane, queue limits, reserve/release/swap,
  late penalties, tools);
- stock & missingFor;
- keycap geometry for every profile/row/size; geo builder; glb reader with in-memory glTF fixtures and the
  real assets;
- the Board in Babylon NullEngine, with @napi-rs/canvas as OffscreenCanvas for canvas textures (every layout,
  case, plate, PCB, family, profile, animations, picking, markers, tape, flip, screws);
- icons and the radar chart painted on a real canvas.

End-to-end tests (Playwright + Chromium with SwiftShader), tests/e2e/*.cjs with helpers.cjs that click at
__mkss.find() coordinates after the position is stable:
- smoke.cjs: desktop + iPhone; title, settings, setup, encrypted save, reload & continue, second tab,
  tamper → cheater → start over → 🤡 badge.
- audio.cjs: render every sound offline; not silent, no NaN, no clipping, within its time budget.
- build.cjs: the full loop with real input through every 3D minigame, express supplier order & courier wait,
  ship, review by mail, close day, resume after reload.
- workshop.cjs: every panel & button: orders (decline, membrane explain/pitch), stock filters, supplier tabs &
  filters & cart & shipping & tools & broke, mail, look-around camera, menu (stats, profile, settings,
  quality low/medium/high, mute, quit/continue, new-game confirm), dev tools, close day (button, dev,
  automatically at 18:00), cleared storage.
- variants.cjs: Choc low-profile build (case swap, footprint change releases parts, foams, plateless,
  stabilizer mods & skip, no lube, fast install with bent pins, reload at the key test, chattering key,
  sound tweaks), Box switches on a solder PCB (back, wire auto, Space lube with over-lube & redo, solder taps,
  loose & stripped screws, stats), late delivery while closing time waits for the dialog, cancellation,
  Grandma, a v3 save migration, empty-shelf dev auto-build, another tab's older save, live save edit.
- mobile.cjs: portrait phone: panels, cart dialog, mail dialog, ticket dialog, building with taps, lube taps,
  empty stock, dev wipe.

Coverage:
- COVERAGE=1 makes the e2e helpers collect precise V8 coverage over the DevTools protocol
  (Profiler.takePreciseCoverage + Debugger.getScriptSource).
- Take a snapshot before every reload and when the browser closes, and write the raw data to
  coverage/e2e-raw.
- scripts/coverage.mjs:
  - converts the raw data with monocart-coverage-reports (rewrite Vite's inline source-map "sources" to the
    real src/ path and strip ?t= queries);
  - merges it with the vitest V8 lcov per file (use one run's line map when only one ran the file;
    otherwise covered if either covered it);
  - writes coverage/merged/index.html and a summary.
- Target: ~99% of lines combined.

=== 12. DELIVERABLES ===
- README.md: how to run, how to play, tests, dev tools, folder layout.
- PLAN.md: design decisions and rules.
- ART.md: the art pipeline and the keyboard spec table.
- A git repo with sensible commits.
- A final zip of the project without node_modules, dist, test screenshots, coverage raw data or generated
  art scratch.
Verify before finishing: npm run build (typecheck + build), npm test, npm run test:e2e against npm run dev,
npm run coverage.
```

---

## Commands (this repo)

```bash
cd /home/model/mechanical-keyboard-store-simulator
npm install                               # once
npx playwright install chromium           # once, only if Playwright's Chromium isn't installed yet

# Unit tests (vitest)
npm test                                  # all unit tests
npx vitest run tests/unit/workshop.test.ts   # one file
npm run test:unit:coverage                # unit tests + coverage → coverage/unit

# End-to-end tests (Playwright) — the dev server must be running
npm run dev                               # terminal 1 (http://localhost:5173)
npm run test:e2e                          # terminal 2: all six suites (~45 min in a VM without a GPU)
node tests/e2e/smoke.cjs                  # or one suite at a time:
node tests/e2e/audio.cjs
node tests/e2e/build.cjs
node tests/e2e/workshop.cjs
node tests/e2e/variants.cjs
node tests/e2e/mobile.cjs
# screenshots go to tests/e2e/screens/

# Combined coverage (unit + e2e), dev server running
npm run coverage                          # → coverage/merged/index.html
COVERAGE=1 node tests/e2e/variants.cjs && npm run coverage:report   # one suite, then rebuild the report

# Type check + production build
npm run build                             # → dist/
```
