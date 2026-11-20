// End-to-end smoke test against a running server (default: dev server on :5173).
// Usage: npm run test:e2e   (BASE_URL=http://localhost:4173 for `npm run preview`)
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL || "http://localhost:5173/";
const OUT = path.join(__dirname, "screens");
fs.mkdirSync(OUT, { recursive: true });

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT: " + msg);
  console.log("  ok -", msg);
}

async function run(name, contextOpts) {
  console.log(`\n[${name}]`);
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(BASE);
  await page.waitForSelector(".title-screen");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, `${name}-1-title.png`) });
  assert((await page.locator("#btn-continue").count()) === 0, "fresh browser has no Continue button");

  // Settings: change a volume, it is remembered across reloads
  await page.click("#btn-settings");
  await page.waitForSelector("#settings");
  await page.locator("#vol-voice").fill("35");
  await page.screenshot({ path: path.join(OUT, `${name}-1b-settings.png`) });
  await page.click("#settings-close");
  const vol = await page.evaluate(() => JSON.parse(localStorage.getItem("mkss.settings.audio")).voice);
  assert(Math.abs(vol - 0.35) < 1e-9, "volume setting is saved");

  // Sound board (dev only): every sound button plays without errors
  if (await page.locator("#debug").count()) {
    await page.click("#debug summary");
    await page.click("#dbg-sounds");
    await page.waitForSelector("#sound-board");
    const n = await page.locator("[data-sfx]").count();
    for (let i = 0; i < n; i++) await page.locator("[data-sfx]").nth(i).click();
    await page.locator(".sb-type").pressSequentially("thock ", { delay: 30 });
    await page.screenshot({ path: path.join(OUT, `${name}-1c-soundboard.png`) });
    await page.click("#sound-board-close");
    assert(n >= 50, `sound board plays all ${n} sounds`);
  }

  await page.click("#btn-new");
  await page.waitForSelector("#hud-money");
  assert((await page.textContent("#hud-day")) === "Day 1", "new game starts on Day 1");
  assert((await page.textContent("#hud-money")) === "$500.00", "new game starts with $500");
  assert(await page.locator("#hud-badge").isHidden(), "no cheater badge on a clean start");

  const raw = await page.evaluate(() => localStorage.getItem("mkss.save.b"));
  assert(raw && raw.startsWith("MKSS1.") && !raw.includes("money"), "save is encrypted in localStorage");

  if (await page.locator("#debug").count()) {
    await page.click("#debug summary");
    await page.click("#dbg-money");
    await page.click("#dbg-day");
    await page.reload();
    await page.waitForSelector("#btn-continue");
    assert((await page.textContent("#btn-continue small")).includes("Day 2"), "Continue shows the saved day after reload");
    await page.click("#btn-continue");
    assert((await page.textContent("#hud-money")) === "$600.00", "money persisted across reload");
    await page.screenshot({ path: path.join(OUT, `${name}-2-shop.png`) });
  }

  // A second tab takes over; the first one pauses without false cheating alarms.
  const tab2 = await ctx.newPage();
  tab2.setDefaultTimeout(120000);
  await tab2.goto(BASE, { timeout: 90000 }); // software GL in CI is slow with two tabs
  await page.waitForSelector("#other-tab");
  assert(true, "opening a second tab pauses the first one");
  await tab2.waitForSelector("#btn-continue", { timeout: 60000 });
  await tab2.click("#btn-continue");
  await tab2.close();
  await page.reload();
  await page.waitForSelector("#btn-continue");
  await page.click("#btn-continue");
  assert(await page.locator("#cheater-screen").count() === 0, "tab switching is not treated as cheating");

  // Player edits the save in DevTools
  await page.evaluate(() => {
    for (const k of ["mkss.save.a", "mkss.save.b"]) {
      const v = localStorage.getItem(k);
      if (v) localStorage.setItem(k, v.slice(0, 30) + (v[30] === "Q" ? "R" : "Q") + v.slice(31));
    }
  });
  await page.reload();
  await page.waitForSelector("#cheater-screen");
  assert(true, "tampered save shows the cheater screen");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, `${name}-3-cheater.png`) });

  await page.reload();
  await page.waitForSelector("#cheater-screen");
  assert(true, "reloading does not escape the cheater screen");

  await page.waitForSelector("#btn-start-over:not([hidden])", { timeout: 8000 });
  await page.click("#btn-start-over");
  await page.waitForSelector("#hud-badge:not([hidden])");
  assert((await page.textContent("#hud-money")) === "$500.00", "progress was wiped");
  assert(await page.locator("#hud-badge").isVisible(), "new run shows the 🤡 Known Cheater badge");
  await page.screenshot({ path: path.join(OUT, `${name}-4-badge.png`) });

  await page.reload();
  await page.waitForSelector("#btn-continue");
  await page.click("#btn-continue");
  assert(await page.locator("#hud-badge").isVisible(), "badge persists after reload");

  const realErrors = errors.filter((e) => !/GPU stall|WebGL|AudioContext/i.test(e));
  assert(realErrors.length === 0, "no page errors" + (realErrors.length ? ": " + realErrors.join(" | ") : ""));
  await browser.close();
}

(async () => {
  await run("desktop", { viewport: { width: 1280, height: 800 } });
  await run("mobile", { ...devices["iPhone 13"], defaultBrowserType: undefined });
  console.log("\nAll e2e checks passed. Screenshots in tests/e2e/screens/");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
