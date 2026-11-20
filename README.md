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
npm test                                   # unit tests (RNG, save/crypto/tamper detection, i18n, sound library)
npm run test:e2e                           # browser smoke test (desktop + mobile) + audio check of every sound (needs `npm run dev`)
BASE_URL=http://localhost:4173/ npm run test:e2e   # same against `npm run preview`
```

## Dev tools

In `npm run dev` only, a **Dev tools** tab on the right edge lets you add money, advance the day,
**simulate save tampering** (to see the cheater screen), open the **sound board** (play every effect, try customer
voices, type to test keyboard sounds), and wipe everything. It is not in production builds.

## Audio

Sound effects only, no music. Everything is synthesized in `src/audio/` (no audio files). To add a sound: add an entry
in `library.ts` and a name `sfx.<id>` in `src/i18n/locales/en.ts`. The tests check both, and `tests/e2e/audio.cjs`
checks the new sound renders properly.

## Layout

| Folder | What |
|---|---|
| `src/core` | Seeded RNG, game state + validation |
| `src/save` | AES-GCM sealing, two-slot save manager, tamper / live-edit / multi-tab detection, shame record |
| `src/i18n` | `t("key")`, plurals, money formatting; `locales/en.ts` holds every string |
| `src/world` | Renderer stage, procedural keyboard model + colorways, title and cheater scenes |
| `src/audio` | SFX engine (volume channels, settings), sound library, parametric key sound, customer voice synth |
| `src/ui` | DOM screens: title, HUD, cheater overlay, dialogs |
