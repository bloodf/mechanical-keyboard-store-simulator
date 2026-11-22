# Mechanical Keyboard Store Simulator — Game Plan

> Status **v0.3 "The Workshop"**: the game is now only keyboard manufacturing. Everything happens at the workbench:
> client orders, stock, suppliers, building, shipping, reviews. The shop floor, walking and characters were removed
> (your direction after v0.2). The 3D art was rebuilt with a Blender-scripted pipeline (ART.md).
> Decisions are recorded in §0; what's next is in §10.

---

## 0. Decisions (agreed)

| Topic | Decision |
|---|---|
| Scope (v0.3) | **Just the keyboard manufacturing.** One scene: the workbench. No store floor, no walking, no customers in 3D. From the bench you take client orders, control stock, buy from suppliers, build, and ship. |
| Tone | **Calm.** No babbling voices, no stomping; few toasts. The humor is in the writing (orders, membrane requests, reviews, joke brands) and the cheater screen. |
| Art | Real objects at real scale, modeled in **Blender by script** and shaded with PBR + image-based lighting. **The keyboard must be 100% accurate** (keycap profiles, switches, plates, stabilizers, PCBs, cases). See ART.md. |
| Variety | All kinds of keyboards: 6 layouts, 8 keycap profiles (Cherry, OEM, SA, DSA, XDA, MT3, KAT, low-profile), 3 switch families (MX, Box, Choc), 6 case styles, 7 plates, 5 PCBs. Products, brands and colorways are generated per run. |
| Language | English only, but **i18n-ready**: every visible string goes through `t("key")`. |
| Devices | Desktop and mobile (touch). |
| Audio | Sound effects only, no music. Every sound is synthesized in code with small random variation. |
| Engine / UI | **Babylon.js**, everything drawn in the canvas with Babylon GUI (keycap-style buttons, panels, tiles, charts). |
| Player | Name + workshop name (printed on the desk mat). No avatar anymore. |
| Gameplay depth | Arcade-like minigames; light management (stock, deadlines, cash). No spreadsheets. |
| Game length | Endless sandbox; parts unlock as you deliver keyboards (goals system later). |
| Cheating | Funny cheater screen → save wiped → new game carries a permanent **🤡 Known Cheater** badge. |
| Brands | Only invented joke brands. Never real ones. |

---

## 1. The pitch

You run a small custom mechanical keyboard workshop. Clients send requests — "a 65%, thocky, pastel, under $400",
"it has to be SA keycaps", "make it low-profile", "can you make my membrane keyboard mechanical?" (no). You buy parts
from suppliers, keep your shelves stocked, build each keyboard by hand at the bench (lube the switches, tape the PCB,
solder, test every key), check the sound, pack it and ship it. Clients pay on delivery and mail you a review.

## 2. Technology

| Concern | Choice |
|---|---|
| Language / build | TypeScript + Vite (static files, host anywhere) |
| 3D + UI | Babylon.js 9 + Babylon GUI, all in one canvas |
| Art | Blender 5.2 (Python `bpy`) scripts → glTF models, a Cycles-rendered 360° panorama + prefiltered environment (`.env`) |
| Audio | Web Audio, synthesized SFX only |
| Randomness | Seeded PRNG (world seed → catalog, orders, reviews) |
| Save | `localStorage`, AES-256-GCM sealed (see §7) |
| Tests | Vitest (logic) + Playwright (the real game in a browser, real mouse/keyboard input) |

## 3. Core loop

```
 Morning (09:00) ─ new order requests arrive · standard deliveries arrive · old requests expire
      │
      ├─ Orders: accept / decline (budget, deadline, wishes) · membrane requests: explain, or sell a real one
      ├─ Stock & Suppliers: buy what the queue needs (standard = tomorrow, express = in 2 workshop hours)
      ├─ Bench: start an accepted order → 13 build steps from stock → pack & ship → client pays
      │        (each step takes workshop minutes; time only moves when you work)
      ├─ Mail: reviews arrive a few hours after shipping · complaints · membrane customers' replies
      │
 18:00 ─ closing time (or close early) → day report → next morning
```

Deadlines matter: late deliveries pay less (−15 %/day) and get worse reviews; 3 days past due the client cancels.
Reputation (★) grows with good reviews and brings more (and bigger) orders.

## 4. Building a keyboard

| # | Step | From stock | What it affects |
|---|---|---|---|
| 1 | Case | a case (material × layout × color) — sets the layout | look, sound body, typing angle |
| 2 | PCB | hot-swap / RGB / flex / solder, **MX or Choc footprint** | switch family, soldering step |
| 3 | Dampening | case foam, plate foam, PE foam, tape (minigame), silicone | ping, depth, brightness |
| 4 | Plate | aluminum, FR4, PC, POM, brass, carbon (same footprint) — or plateless | stiffness, pitch |
| 5 | Stabilizers | budget / standard / premium (footprint) + clip & band-aid mods + wire lube (minigame) | rattle |
| 6 | Switches | N switches of one product (MX, Box or Choc; linear/tactile/clicky/silent) | feel, sound |
| 7 | Lube | one lube portion, brush minigame on the real switch model (or skip) | smoothness, creaminess |
| 8 | Install | click/drag switches into the plate (rushing bends pins) | dead keys |
| 9 | Solder | rhythm minigame (solder PCBs only) | cold joints |
| 10 | Close case | screw torque minigame | rattle |
| 11 | Keycaps | a set whose mount fits the switches (Choc → low-profile) | looks, profile wishes, sound |
| 12 | Test | press every key (real keyboard works), fix dead/chattering keys | quality |
| 13 | Sound check | type, compare the radar chart with the request, tweak foams | sound score |
| 14 | Pack & ship | — | payment, review |

Compatibility: MX and Box switches share the MX footprint and MX-stem keycaps; Choc needs a Choc PCB, plate,
stabilizers and low-profile keycaps. Changing an earlier choice releases the parts that no longer fit.

Scoring: layout, sound, feel, looks (theme), build quality and **wishes** (profile / low-profile / hot-swap /
case material). The shipping screen shows your own QA check; the client's stars come later by mail.

## 5. Sound system

Every part moves a sound profile — depth, brightness, ping, scratch, rattle, volume, click. The same profile drives
the synthesized typing sound, the radar chart and the score, so what you hear is what the client judges.
Clients describe sounds in words (thocky, clacky, creamy, marbly, poppy, quiet, loud, clicky, deep, crisp) that map to
target ranges. A balance test proves every request is achievable.

## 6. Procedural generation ("never the same twice")

- **Catalog per run**: switch and keycap brands/names, colorways, case colors, prices.
- **Orders**: persona, name, quote assembled from phrase variants, layout/sound/feel/theme requests, wishes,
  budget, deadline, pickiness. ~12 % are membrane-conversion requests.
- **Mail**: reviews per mood, late-delivery reviews, cancellations, membrane customers' replies.
- The title screen shows a different finished keyboard every time.

## 7. Save & anti-cheat

AES-256-GCM sealed JSON in two alternating `localStorage` slots (HKDF-derived keys, slot name bound in), live-edit
detection before each write, structural sanity checks, versioned migrations (v1 → v4; a v3 shop save becomes a v4
workshop with the starter stock). Another tab is not cheating (only one tab runs the workshop). Tampering → the
**CHEATER DETECTED** screen → wipe → new game with the 🤡 badge. The key ships with the game, so this stops casual
editing, not a determined reverse engineer (normal for a browser-only game).

## 8. Economy

- Start: $500 and a starter kit (enough for the first, easy order).
- Prices per SKU; switch packs of 10/35/70/110 with bulk discounts; lube jars (3 boards); shipping fees.
- Orders pay 1.1–1.7× a typical parts cost; tips for 4–5 ★; late penalties.
- Unlocks: better parts appear at the supplier after N delivered keyboards.

## 9. Structure

See README.md (Layout). Framework-free rules live in `src/build` and `src/core` (unit tested); Babylon code in
`src/engine`, `src/gui`, `src/game`.

## 10. Next

| Idea | Notes |
|---|---|
| Goals board | "Ship 10 keyboards", "Explain the membrane thing 5 times" → unlock tools and suppliers |
| Client follow-ups | returns & repairs (a rattling spacebar comes back), repeat clients who remember you |
| More case shapes | split / Alice layouts, hi-pro cases, tray-mount vs gasket visual differences |
| Product photos | render supplier thumbnails from the real 3D parts instead of 2D icons |
| Workshop upgrades | lube station, switch opener, second bench, better lamp (visible on the bench) |
| Events | group-buy delays, damaged deliveries, a viral trend for pink switches |
