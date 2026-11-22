# Mechanical Keyboard Store Simulator

Browser game built with **Babylon.js** (3D + in-canvas UI) and TypeScript/Vite. You run a custom mechanical keyboard
workshop: take client orders, keep your parts in stock, buy from suppliers, build every keyboard by hand at the bench,
and ship it to the client. Every run is different (seeded world: brands, products, clients, requests).
See **PLAN.md** for the design and roadmap, **ART.md** for how the 3D art is made.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN IP, for testing on a phone)
npm run build      # static files in dist/ — upload anywhere (itch.io, GitHub Pages, …)
npm run preview    # serve the production build on :4173
```

## Play

- **New Game** → name yourself and your workshop (printed on your desk mat).
- The top bar: **📋 Orders** (new requests and your queue), **📦 Stock**, **🛒 Suppliers**, **✉️ Mail**, money,
  reputation, **🌙 Close for today**.
- **Orders**: accept or decline client requests. Each has a budget and a deadline; some ask for a specific keycap
  profile, low-profile switches, hot-swap or a case material. Some people want their *membrane* keyboard converted —
  explain why that's not a thing, or sell them a real one.
- **Suppliers**: cases, PCBs and plates (per layout, MX or Choc footprint), stabilizers, switches (packs), keycap sets,
  foam, tape, lube. Standard shipping arrives the next morning, express in two workshop hours.
- **The bench**: start an accepted order and build it step by step from your stock — case, PCB, dampening (tape mod),
  plate, stabilizers (lube the wires), switches, lube, install, solder (solder PCBs), close the case, keycaps, key test,
  sound check — then **pack & ship**. The client pays on delivery; their review arrives by mail.
- Time only passes when you work (each step takes workshop minutes). The workshop closes at 18:00; new orders and
  standard deliveries arrive in the morning. Deliver late and clients pay less (and say so).
- At the bench, **right-drag** (or middle-drag) looks around the keyboard and the **mouse wheel** zooms.
- In the key test and sound check you can type on your **real keyboard**.

## Test

```bash
npm test             # unit tests: RNG, save/tamper/migrations, i18n, layouts, balance, scoring, workshop economy
npm run test:e2e     # needs `npm run dev`: smoke (desktop + phone), audio check, full workshop loop with real input
```

The whole UI is drawn in the canvas, so end-to-end tests find controls through a dev-only hook
(`window.__mkss.find(name)`) and click them with a real mouse/touchscreen.

## Dev tools

In `npm run dev` only, the **🛠** button (bottom-left) opens: auto-complete the current build step, unlock all parts,
+$100, close the day, the **sound board**, simulate save tampering, wipe everything. Not included in production builds.

`/sandbox.html?view=workshop|caps|board2` renders the art in isolation (e.g.
`?view=workshop&case=wood&layout=tkl&kc=12&bv=low`).

## Layout

| Folder | What |
|---|---|
| `src/engine` | Babylon app shell (frame governor, quality), workshop scene (panorama + IBL + bench), keyboard model (`keyboard/`: board, keycap generator, switch models), glb loader, cheater scene |
| `src/gui` | In-canvas UI kit (theme, widgets, sheets, `Ui`) and screens: title, workshop HUD, profile, settings, cheater, sound board |
| `src/game` | Game flow (`game.ts`), panels (orders, stock, suppliers, mail), bench: steps, parts drawer, 3D minigames (`bench/games`) |
| `src/build` | Workshop rules (clock, orders, deliveries, shipping, reviews), stock & prices, build session, orders generator, sound profile, scoring |
| `src/data` | Layouts, parts, keycap profiles & switch families, per-run catalog (brands, switches, keycaps, case colors), colors |
| `src/core`, `src/save` | Seeded RNG, game state + migrations; encrypted save with tamper / multi-tab detection |
| `src/audio` | Synthesized sound effects (no music), key sounds |
| `src/i18n` | `t("key")`, plurals, money; every string lives in `locales/en.ts` |
| `art/blender` | Blender scripts that model and render the 3D assets (`public/assets`) — see ART.md |
