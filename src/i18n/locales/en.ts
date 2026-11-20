/**
 * English strings. Every visible string in the game lives here.
 * Other locales must provide the same keys (enforced by the `Messages` type).
 * Interpolation: {name}. Plurals: an object with Intl.PluralRules categories.
 */
const en = {
  "game.title": "Mechanical Keyboard Store Simulator",
  "game.tagline": "Thock responsibly.",

  "title.continue": "Continue",
  "title.newGame": "New Game",
  "title.confirmNew": "Start a new store? Your current save will be lost forever.",
  "title.confirmYes": "Yes, fresh start",
  "title.confirmNo": "Keep my store",
  "title.saveInfo": "Day {day} · {money}",
  "title.noStorage": "Your browser is blocking storage — progress will NOT be saved.",
  "title.version": "v{version} · Phase 0",

  "hud.day": "Day {day}",
  "hud.reputation": "{stars} ★",
  "hud.cheaterBadge": "🤡 Known Cheater",
  "hud.cheaterBadge.tooltip": {
    one: "Caught editing the save file once. Customers remember.",
    other: "Caught editing the save file {count} times. Customers definitely remember.",
  },
  "hud.backToTitle": "Menu",
  "hud.saved": "Saved",
  "hud.saveFailed": "Could not save (storage full?)",

  "shop.placeholder.title": "Your shop is under construction",
  "shop.placeholder.body": "The 3D store, customers and workbench arrive in Phase 1. Your save is real, though: day, money and badge persist and are tamper-protected.",

  "cheater.title": "CHEATER DETECTED",
  "cheater.subtitle": "Someone touched the save file. The keyboard saw everything.",
  "cheater.reporting": "Reporting you to the Keyboard Police…",
  "cheater.reportingDone": "Report filed. Case #{caseNo}.",
  "cheater.count": {
    one: "First offense. The switches are disappointed.",
    two: "Second offense. The switches are now lubed with tears.",
    other: "Offense #{count}. At this point you ARE the membrane keyboard.",
  },
  "cheater.startOver": "Start over (with shame)",
  "cheater.jokes.0": "Your save file has been replaced with a $9 membrane keyboard.",
  "cheater.jokes.1": "Even rubber domes have more integrity than this.",
  "cheater.jokes.2": "Nice try. We lubed the encryption.",
  "cheater.jokes.3": "Your money has been converted into mushy keypresses.",
  "cheater.jokes.4": "The spacebar rattles with disapproval.",
  "cheater.jokes.5": "All your keycaps are now Comic Sans.",
  "cheater.jokes.6": "Achievement unlocked: Hot-Swapped Your Morals.",
  "cheater.jokes.7": "We told the customers. They're writing reviews right now.",

  "tabs.title": "Your store is open in another tab",
  "tabs.body": "Only one tab can run the shop at a time (we don't want two of you fighting over the same switches).",
  "tabs.useHere": "Open it here instead",

  "debug.title": "Dev tools",
  "debug.addMoney": "+$100 & save",
  "debug.nextDay": "Next day & save",
  "debug.tamper": "Tamper with save (demo)",
  "debug.wipe": "Wipe everything",
} as const;

export default en;
