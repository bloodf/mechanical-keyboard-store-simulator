# Mechanical Keyboard Store Simulator

Browser game (Three.js + TypeScript + Vite). See **PLAN.md** for the full design and roadmap.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN IP, for testing on a phone)
npm run build      # static files in dist/ — upload anywhere (itch.io, GitHub Pages, …)
npm run preview    # serve the production build on :4173
```

## Test

```bash
npm test                                   # unit tests (RNG, save/crypto/tamper detection, i18n)
npm run test:e2e                           # browser smoke test, desktop + mobile (needs `npm run dev` running)
BASE_URL=http://localhost:4173/ npm run test:e2e   # same against `npm run preview`
```

## Dev tools

In `npm run dev` only, a **Dev tools** tab on the right edge lets you add money, advance the day,
**simulate save tampering** (to see the cheater screen), and wipe everything. It is not in production builds.

## Layout

| Folder | What |
|---|---|
| `src/core` | Seeded RNG, game state + validation |
| `src/save` | AES-GCM sealing, two-slot save manager, tamper / live-edit / multi-tab detection, shame record |
| `src/i18n` | `t("key")`, plurals, money formatting; `locales/en.ts` holds every string |
| `src/world` | Renderer stage, procedural keyboard model + colorways, title and cheater scenes |
| `src/audio` | Web Audio synth (key clack, sad trombone, siren) |
| `src/ui` | DOM screens: title, HUD, cheater overlay, dialogs |
