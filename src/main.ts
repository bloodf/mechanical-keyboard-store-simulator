/**
 * Entry point: fonts, locale, audio unlock, then the Babylon.js game.
 * Everything you see — 3D and UI — is rendered inside the canvas.
 */
import "@fontsource/fredoka/400.css";
import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import "@fontsource/inter/600.css"; // keycap legends
import "./styles.css";
import { setLocale, t } from "./i18n";
import { unlockAudio } from "./audio/engine";
import { Game } from "./game/game";

setLocale(navigator.language || "en");
document.title = t("game.title");

// Browsers only allow sound after a user gesture.
window.addEventListener("pointerdown", unlockAudio, true);
window.addEventListener("keydown", unlockAudio, true);

const canvas = document.getElementById("game") as HTMLCanvasElement;
const loading = document.getElementById("loading");
if (loading) loading.textContent = t("loading");

// Make sure the UI font is ready before the canvas draws text with it.
Promise.all([...["400", "600", "700"].map((w) => document.fonts.load(`${w} 24px Fredoka`)), document.fonts.load("600 24px Inter")])
  .catch(() => undefined)
  .then(() => {
    const game = new Game(canvas);
    game.boot();
    loading?.remove();
  });
