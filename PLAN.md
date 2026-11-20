# Mechanical Keyboard Store Simulator — Game Plan (draft v1)

> Status: **Phase 0 done** (foundation, save, cheater screen) **+ sound effects system.** Next: Phase 1. Decisions are recorded in §0.

---

## 0. Decisions (agreed)

| Topic | Decision |
|---|---|
| Camera | **Third-person** in the shop (camera follows the technician). **First-person** only at the workbench while building. |
| Art | **100% generated in code.** Funny through animation, expressions, emotes and dialogue, **not** through bad models: humans must have believable human proportions, and the store must read clearly as a store. Stylized, clean, soft lighting. |
| Language | English only, but **i18n-ready from day one**: every visible string goes through `t("key")`. |
| Devices | **Desktop and mobile.** Keyboard + mouse, plus touch (virtual joystick, tap to interact, large buttons). |
| Audio | **Sound effects only, no music.** Every sound is synthesized in code (no audio files), with small random variation each play. |
| Gameplay depth | **Always arcade-like.** Mini-games are short, readable and forgiving. No simulation homework. |
| Game length | **Endless sandbox** with **goals** that unlock new tools, materials and stock. |
| Cheating | Funny cheater screen → save wiped → new game carries a permanent **"🤡 Known Cheater" badge**. |
| Brands | **Only invented joke brands.** Never real ones (no Cherry, Gateron, GMK, etc.). |

---

## 1. The pitch

You run a small mechanical keyboard shop. Customers walk in with requests, for example:
"I want a deep thocky 65% under $250", "make it sound like rain on a window", or
"can you make my $15 membrane keyboard mechanical?" (no, you can't). You talk to them, buy parts,
build the keyboard at your workbench, lube the switches, test it, check the sound, and hand it over.
Happy customers pay, tip and leave good reviews. Angry customers shout, ask for refunds and leave 1-star reviews.
Everything is procedurally generated, so no two runs are the same.

Look and feel: the cozy, clean style of recent "simulator" games (Supermarket Simulator,
TCG Card Shop Simulator): bright colors, soft lighting, floating price tags, satisfying *clack* feedback.
Characters are stylized but have **real human proportions** (no bobble-heads). The humor comes from
exaggerated animation, facial expressions, emotes and writing.

---

## 2. Technology

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript | Big game with lots of data types. Types catch bugs early. |
| Build tool | Vite | Fast dev server. Builds to plain static files you can host anywhere (itch.io, GitHub Pages, Netlify). |
| 3D | Three.js | Mature WebGL library, works in every modern browser. No engine lock-in. |
| UI / menus | HTML/CSS overlay (small framework-free layer, or Preact if it grows) | Menus, dialogue and inventory are easier to build in HTML than in 3D. |
| Audio | Web Audio API, **synthesized SFX only (no music)** | Every effect is generated in code. Switch sounds come from the build's parts (see §6), so every build really sounds different. |
| Randomness | Seeded PRNG (e.g. `sfc32`/`mulberry32`) | "Always new" but reproducible, which helps debugging and lets us detect save tampering. |
| Save | `localStorage` + Web Crypto (AES-GCM + HMAC-SHA-256) | See §8. |
| Tests | Vitest (logic) + Playwright (in-browser smoke tests) | |

**Art approach: everything generated in code.** Store, furniture, keyboards, keycaps and customers are built
from primitives (rounded boxes, cylinders, capsules) plus toon/flat shading and procedural colors.
That fits "everything is always new": a customer is a random mix of body shape, head size, hair, glasses,
clothes colors and accessories, not a fixed model. It also means no asset licensing and a small download.
(If you want hand-made models later, we can add a GLTF loader.)

---

## 3. Core game loop

```
 ┌─ Morning ──────────────────────────────────────────────┐
 │ Check inventory → order parts from suppliers            │
 │ (delivery takes time, prices fluctuate)                 │
 ├─ Shop open ────────────────────────────────────────────┤
 │ Customer arrives → dialogue → accept / refuse / haggle  │
 │        ↓                                                │
 │ Workbench: build → lube → assemble → test → sound check │
 │        ↓                                                │
 │ Hand over → customer reaction → payment / tip / review  │
 │ (repeat while open; queue builds up; patience drains)   │
 ├─ Evening ──────────────────────────────────────────────┤
 │ Day summary: money, reputation, reviews                 │
 │ Buy upgrades → autosave → next day                      │
 └────────────────────────────────────────────────────────┘
```

Progression: start with a tiny bench and cheap parts, then unlock better suppliers, exotic parts,
a sound-test booth, a lube station, display shelves (selling prebuilt boards passively), an employee, etc.

---

## 4. The 3D world

- **Camera:** third-person follow camera in the shop (WASD/arrows + mouse orbit on desktop, virtual
  joystick + drag-to-orbit on mobile). Using the workbench switches smoothly to a **first-person** bench view
  for the building steps.
- **Shop areas:** entrance/door, counter (talk to customers), workbench, parts shelves/storage,
  delivery drop-off, computer (supplier orders and reviews), sound-test booth (upgrade).
- **Characters:** built from smooth-shaded parts with real proportions (head ≈ 1/7.5 of height), a simple
  skeleton for walk/idle/talk/angry animations, and a face with eyes, brows and mouth for expressions.
  Variety comes from height, build, skin tone, hair style/color, clothes and accessories.
  **This is the biggest art risk**, so Phase 1 includes a character prototype for you to approve first.
- **Customers:** walk in, queue, wait at the counter with a patience meter over their head,
  emote (💢 angry, 💤 bored, ✨ happy), and walk out, sometimes stomping.
- **Juice:** squash-and-stretch on interactions, particles on completed builds, coins flying on payment,
  screen shake when a customer yells.

---

## 5. Building a keyboard (the heart of the game)

Each step is a small, **arcade-style** interaction at the bench (a few seconds each, clear feedback,
forgiving). It is never a spreadsheet.

| # | Step | What the player does | What it affects |
|---|---|---|---|
| 1 | **Case** | Pick layout (60 / 65 / 75 / TKL / Full / Alice) and material (plastic, aluminum, acrylic, wood, polycarbonate, brass weight) | Look, price, sound (resonance, pitch), weight |
| 2 | **PCB** | Hot-swap vs solder, flex cut vs solid, RGB or not. Must match case layout | Compatibility, sound, and whether soldering is needed |
| 3 | **Plate** | Aluminum, brass, POM, PC, FR4, carbon fiber (or plateless) | Typing feel (stiffness) and sound (pitch, brightness) |
| 4 | **Dampening** | Case foam, PE foam sheet, plate foam, tape mod, force-break mod | Deeper sound, less ping and hollowness. Too much = muffled |
| 5 | **Stabilizers** | Clip, band-aid mod, lube the wires | Rattle on spacebar/enter/shift (a common complaint!) |
| 6 | **Switches** | Linear / tactile / clicky, spring weight, housing material | Feel, sound, price |
| 7 | **Lubing** | Quick timing game: brush strokes in a "sweet spot" bar. Too little = scratchy, too much = mushy; tactiles/clickies want a light touch. Better lube station upgrades = bigger sweet spot | Smoothness and "creaminess" |
| 8 | **Assembly** | Tap/drag switches into place (batch fill after a few). Soldering = quick tap-on-the-glow rhythm game | Dead keys if rushed |
| 9 | **Keycaps** | Material (ABS / PBT), profile (Cherry, OEM, SA, XDA, MT3), colorway/theme, artisan keycap | Look (customer theme request), sound (SA = clacky/high, Cherry PBT = deeper) |
| 10 | **Test** | Key-tester screen: press every key, find dead or chattering keys, fix them | Returned boards = angry customers |
| 11 | **Sound check** | Type on it; see the board's sound profile next to the client's target | Customer satisfaction |

Compatibility rules create real puzzles: a 65% PCB doesn't fit a TKL case, a hot-swap PCB with
3-pin sockets doesn't take 5-pin switches without clipping the legs, a south-facing PCB plus Cherry-profile
caps causes interference, etc. We start with a few simple rules and add more later.

---

## 6. The sound system (the standout feature)

Every build produces a **sound profile** computed from its parts, for example:

- **Pitch / depth** (thock ↔ clack)
- **Brightness** (muffled ↔ crisp)
- **Volume**
- **Hollowness / ping** (reduced by foam)
- **Rattle** (from stabilizers)
- **Smoothness / scratch** (from lube)
- **Clickiness**

The Web Audio engine then **synthesizes** keypresses from that profile (filtered noise bursts +
short resonant tones + a click transient + random variation per key). A brass-plate, lubed-linear,
PBT Cherry board really does sound deeper than an ABS-SA, clicky, empty-plastic-case board.

Customers describe what they want in words ("thocky", "creamy", "marbly", "poppy", "clacky", "quiet for
the office", "loud so my roommate hears"). Those words map to target ranges on the profile. The sound-check
screen shows a radar chart (build vs. request) and a match %, and you can listen to both.

### 6b. Sound effects catalog (no music)

All sounds are generated live from code (`src/audio/library.ts`), with random variation on every play.
Four volume channels the player controls in Settings: **Interface, Shop & workbench, Customer voices, Keyboard typing**
(+ master and mute). A **sound board** in dev tools plays every effect. An automated check renders every sound
offline and verifies it isn't silent, doesn't clip, fits its time budget, and has balanced loudness.

| Group | Sounds (59 so far) |
|---|---|
| Interface | click, hover, confirm, back, error, toast, panel open/close, toggle |
| Money | coin, cash register, spend |
| Progress | goal complete, unlock, shop opens (bell), shutter closes, good/bad review |
| Shop | door bell, footstep, angry stomp, door slam, delivery truck, box drop, box opening, shelf place, computer beep, notification |
| Workbench | switch opener, spring, lube brush, screwdriver, soldering, keycap pull/place, PCB snap, foam, tape mod, stabilizer rattle, tester beep, dead key, build complete |
| Keyboard typing | thocky, clacky, clicky, marbly, membrane, spacebar. Presets of the parametric key engine that Phase 5 drives from real parts |
| Customers | talking, happy, question, angry, sad, laugh, gasp, grumble. Gibberish "Sims-style" voices from a formant synth; **each customer has their own voice** (pitch, size, speed, breathiness) |
| Cheater | police siren, sad trombone, wrong buzzer |

New sounds are added as features need them (e.g. positional 3D audio for customers in Phase 1/3).

---

## 7. Procedural generation ("never the same twice")

Every new game gets a random **world seed**. Each day and each customer derives their own sub-seed.

**Customer generator**
- Appearance: body type, skin tone, hair, glasses, hat, hoodie colors, accessories (headphones, cat ears, energy drink…)
- Name: first and last name syllable tables, plus online handles ("xX_ThockLord_Xx")
- Personality traits: patience, politeness, knowledge level (noob ↔ enthusiast ↔ snob), haggler, indecisive
- Budget, and how strict they are about it
- Mood, which can change during the conversation

**Request types** (weighted, more unlock over time)
1. Full custom build ("65%, thocky, pastel theme, under $300")
2. Sound request only ("make it sound creamy, I don't care how")
3. Theme request ("I want it to look like a sunset / my cat / the ocean")
4. Mod an existing board (lube + foam + stab fix on a board they bring)
5. Repair (chattering key, dead switch, rattling spacebar)
6. **Membrane conversion** (impossible; see below)
7. Speed job (rush fee, short patience)
8. Influencer (reviews count 5×, very picky)
9. Returning customer (remembers you; loyalty or grudge)

**The membrane customer.** Converting a membrane keyboard into a mechanical one isn't possible
(no PCB switch footprints, the rubber-dome sheet is the "switch", no plate, etc.). The player gets a
dialogue tree with choices: explain it politely, explain it technically, upsell a starter board, or be rude.
Customer personality decides the reaction: some learn and buy a starter kit, some argue ("my cousin did it!"),
some leave angry reviews. There's a running joke counter of how many times you've had to explain it.

**Dialogue** uses template grammars (Tracery-style) with personality-flavored variants, so lines combine
into many different sentences instead of repeating the same few.

**Also generated:** supplier catalogs and price swings, part names and invented
brands (like "Thockwell" or "KeyKrafters"), colorways, reviews text, random daily events (group buy
delayed, viral trend raises demand for pink switches, power outage, shipment damaged).

---

## 8. Save system & anti-cheat

**How it works**
1. The game state is serialized to JSON (with a version number for future migrations).
2. It is encrypted with **AES-256-GCM** (key derived per save with HKDF-SHA-256 and a random salt), using the
   audited pure-JS `@noble` libraries. These work without HTTPS (phone testing over Wi-Fi) and synchronously
   (saving when the tab closes is reliable). GCM's authentication tag makes any modified byte fail, and the slot
   name is bound in, so blobs can't be moved between slots.
3. Before every write, the game checks the slots still contain exactly what it wrote last. An edit made
   *while the game is open* is caught too. Authentic data from another tab is not cheating: only one tab runs the store.
4. It is written to `localStorage`. Autosave runs at the end of each day, after every sale/build, and on tab close.
5. Two slots are written alternately with a counter, so a failed write (storage full) never loses the previous save.
   Clearing site data is a legitimate fresh start and is never punished.
6. Internal sanity checks on load catch impossible states (negative stock, money that doesn't match
   the transaction log, etc.).

**If tampering is detected:** a funny full-screen **"CHEATER DETECTED"** scene. Ideas: a giant
disappointed membrane keyboard, every customer in the shop turning to stare, a fake "reporting you to the
Keyboard Police 🚨" progress bar, and a sad rubber-dome sound. Then the save is wiped and a new game starts with a permanent **"🤡 Known Cheater"** badge
(shown in the HUD, and customers occasionally comment on it).

⚠️ **Limit to be aware of:** in a browser-only game the encryption key must ship inside the game's
JavaScript. That means this **stops casual cheating** (editing localStorage in DevTools, copy-pasting
values, save editors). A determined programmer who reverse-engineers the code could still forge a save.
Only a server can fully prevent that. We'll obfuscate the key derivation to raise the effort, but
"nobody can ever cheat" isn't achievable without a backend. For a single-player game this level is normal.

---

## 9. Economy & progression

- **Money:** revenue = parts + labor fee + tips − parts cost − rent (daily)
- **Reputation / stars:** from reviews. Drives how many customers come and their budgets
- **Inventory:** stock per part, storage capacity (upgradeable), supplier lead times, bulk discounts, damaged deliveries
- **Goals (endless sandbox):** a goal board with generated and fixed goals ("Serve 10 happy customers",
  "Build a brass-plate board", "Calm an angry customer", "Explain the membrane thing 5 times").
  Completing them unlocks **tools** (lube station, switch opener, sound booth, soldering iron+),
  **materials** (wood, brass, carbon…), **stock/suppliers** and decor. There is always a next goal.
- **Upgrades:** bigger storage, second bench, display shelf, decor, hire an assistant
- **No hard game over:** running out of money → a goofy loan shark / "emergency garage sale" keeps the sandbox going

---

## 10. Project structure (proposed)

```
mechanical-keyboard-store-simulator/
  index.html
  src/
    main.ts               # boot, game loop
    core/                 # rng, events, state store, time/day cycle
    save/                 # serialize, crypto, migrations, tamper detection
    world/                # three.js scene, shop, lighting, camera, interaction
    gen/                  # procedural: customers, names, dialogue grammar, requests, parts, events
    data/                 # part definitions, compatibility rules, sound coefficients
    build/                # workbench state machine + each mini-game
    audio/                # SFX engine + library, key-sound synth, customer voices (no music)
    ui/                   # HUD, dialogue box, inventory, computer/shop, menus, cheater screen
  tests/
```

---

## 11. Milestones

We build a **playable vertical slice first**, then widen it.

| Phase | Goal | Playable result |
|---|---|---|
| **0. Foundation** | Vite + TS + Three.js scaffold, seeded RNG, state store, **encrypted save + cheater screen** | Blank shop that saves, loads and catches tampering |
| **1. Shop, character & movement** | Procedural shop, **human character prototype (for your approval)**, third-person controls (desktop + touch), interaction prompts, first-person bench camera | Walk around your shop |
| **2. Parts & inventory** | Part catalog, compatibility rules, inventory, supplier computer, deliveries | Buy and stock parts |
| **3. Customers** | Customer generator (looks + personality), walking/queue, dialogue box, first 3 request types | Customers come and ask for things |
| **4. Build flow** | Bench steps 1–11 in simple form, then the lube and test mini-games | Build and deliver a keyboard ← **vertical slice complete** |
| **5. Sound engine** | Profile calculation + synthesizer + radar-chart sound check | Hear the difference between builds |
| **6. Drama** | Membrane customer, angry customers, haggling, refunds, reviews, events | The funny part |
| **7. Progression** | Days, rent, reputation, upgrades, unlocks, bankruptcy | A full run |
| **8. Polish** | Tutorial, juice, extra SFX passes, graphics settings, balancing, performance, mobile check | Shareable game |

Every phase ends with automated tests (logic in Vitest, a headless-browser smoke test) plus a playable
build you can try in your browser.

---

## 12. Open questions

All answered. See §0.
