# Mechanical Keyboard Store Simulator

Browser game built with **Babylon.js** (3D + in-canvas UI) and TypeScript/Vite. Everything — art, sounds,
customers, parts — is generated in code. See **PLAN.md** for the design and roadmap.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN IP, for testing on a phone)
npm run build      # static files in dist/ — upload anywhere (itch.io, GitHub Pages, …)
npm run preview    # serve the production build on :4173
```

## Play

- **New Game** → create your technician (name, store name, look) → you're in your shop.
- Walk with **WASD / arrows** (Shift = run), drag to look around, **E** to interact. On phones: left stick + tap the prompt.
- **Job board** (cork board, or 📋) → take a job → the customer walks in → go to the **workbench** → build it step by step
  (3D minigames) → deliver → the customer reacts.
- **Mirror** / 👤 → change your look, your name or the store name (the neon sign updates live).
- In the key test and sound check you can type on your **real keyboard**.

## Test

```bash
npm test                                   # unit tests (RNG, save/tamper, i18n, layouts, balance, scoring, content)
npm run test:e2e                           # needs `npm run dev`: smoke (desktop + phone), audio check, full build with real input
```

The whole UI is drawn in the canvas, so end-to-end tests find controls through a dev-only hook
(`window.__mkss.find(name)`) and click them with a real mouse/touchscreen.

## Dev tools

In `npm run dev` only, the **🛠** button (bottom-left) opens: auto-complete the current build step, unlock all parts,
+$100, next day, the **sound board**, simulate save tampering, wipe everything. Not included in production builds.

`/sandbox.html?view=humans|face|board|store` renders art in isolation (used while developing the procedural models).

## Layout

| Folder | What |
|---|---|
| `src/engine` | Babylon app shell (frame governor, quality), geometry & procedural textures, keyboard model, humans, store scene, cheater scene |
| `src/gui` | In-canvas UI kit (theme, widgets, `Ui`) and screens: title, HUD, profile editor, settings, cheater, sound board |
| `src/game` | Game flow (`game.ts`), job board, results, bench mode: steps, parts drawer, 3D minigames (`bench/games`) |
| `src/build` | Build session, job generator, sound profile & matching, scoring |
| `src/data` | Layouts, parts, per-run catalog (brands, switches, keycaps, case colors), colors, avatars |
| `src/core`, `src/save` | Seeded RNG, game state + migrations; encrypted save with tamper / multi-tab detection |
| `src/audio` | Synthesized sound effects (no music), customer voices, key sounds |
| `src/i18n` | `t("key")`, plurals, money; every string lives in `locales/en.ts` |
