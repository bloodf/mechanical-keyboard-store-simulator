// Smoke test (desktop + mobile): title, settings, workshop setup (your name + workshop name),
// encrypted save, reload/continue, one-tab rule, tamper → cheater screen → 🤡 badge.
// Needs `npm run dev` running.
const { ok, launch, newGamePage } = require("./helpers.cjs");

async function run(name, mobile) {
  console.log(`\n[${name}]`);
  const browser = await launch();
  const g = await newGamePage(browser, { mobile });
  const { page } = g;
  if (mobile) page.on("dialog", (d) => d.accept(d.message().toLowerCase().includes("workshop") ? "Mobile Thocks" : "Mina"));
  await g.open();
  await g.waitFor("btn-new");
  ok(!(await g.find("btn-continue")), "fresh browser has no Continue button");
  await g.shot(`${name}-1-title`);

  // Settings: change a volume (click on the slider track) — remembered in localStorage
  await g.click("btn-settings");
  await g.waitFor("vol-world");
  const s = await g.find("vol-world");
  if (mobile) await page.touchscreen.tap(s.x - s.w * 0.3, s.y);
  else await page.mouse.click(s.x - s.w * 0.3, s.y);
  await page.waitForTimeout(500);
  await g.shot(`${name}-2-settings`);
  await g.click("settings-close");
  const vol = await page.evaluate(() => JSON.parse(localStorage.getItem("mkss.settings.audio") || "{}").world);
  ok(typeof vol === "number" && vol < 0.6, `volume setting saved (${vol})`);

  // New game → name yourself and the workshop
  await g.click("btn-new");
  await g.waitFor("profile-done");
  if (!mobile) {
    await g.click("input-name");
    await page.keyboard.type("Mina");
    await g.click("input-store");
    await page.keyboard.type("Desk Thocks");
  } else {
    await g.click("input-name");
    await page.waitForTimeout(800);
    await g.click("input-store");
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(1000);
  await g.shot(`${name}-3-setup`);
  await g.click("profile-done");
  await g.waitFor("hud-bar");
  const st = await g.state();
  const wantStore = mobile ? "Mobile Thocks" : "Desk Thocks";
  ok(st.profile.created && st.profile.name === "Mina" && st.profile.storeName === wantStore, `profile saved (${st.profile.name} @ ${st.profile.storeName})`);
  ok(st.offers.length === 2 && Object.keys(st.inventory).length > 5, "first orders and the starter stock are there");
  const raw = await page.evaluate(() => localStorage.getItem("mkss.save.a") || localStorage.getItem("mkss.save.b"));
  ok(raw && raw.startsWith("MKSS1.") && !raw.includes("Mina"), "save is encrypted");
  await page.waitForTimeout(2500);
  await g.shot(`${name}-4-workshop`);

  // dev: +$100, then reload → Continue keeps it
  await g.click("dev-tools");
  await g.click("dbg-money");
  await page.reload();
  await page.waitForFunction(() => window.__mkss, null, { timeout: 180000 });
  await g.waitFor("btn-continue");
  await g.click("btn-continue");
  await g.waitFor("hud-bar");
  ok((await g.state()).money === 60000, "money persisted across reload ($600)");

  // Second tab takes over; the first pauses without a false cheating alarm
  const tab2 = await g.ctx.newPage();
  tab2.setDefaultTimeout(240000);
  await tab2.goto(page.url(), { timeout: 240000 });
  await g.waitFor("other-tab", 180000);
  ok(true, "opening a second tab pauses the first");
  await tab2.close();
  await page.reload();
  await page.waitForFunction(() => window.__mkss, null, { timeout: 180000 });
  await g.waitFor("btn-continue");
  ok(!(await g.find("cheater-title")), "tab switching is not treated as cheating");

  // Tamper with the save
  await page.evaluate(() => {
    for (const k of ["mkss.save.a", "mkss.save.b"]) {
      const v = localStorage.getItem(k);
      if (v) localStorage.setItem(k, v.slice(0, 30) + (v[30] === "Q" ? "R" : "Q") + v.slice(31));
    }
  });
  await page.reload();
  await page.waitForFunction(() => window.__mkss, null, { timeout: 180000 });
  await g.waitFor("cheater-title");
  ok(true, "tampered save shows the cheater screen");
  await page.waitForTimeout(2500);
  await g.shot(`${name}-5-cheater`);
  await page.reload();
  await page.waitForFunction(() => window.__mkss, null, { timeout: 180000 });
  await g.waitFor("cheater-title");
  ok(true, "reloading does not escape the cheater screen");
  await g.waitFor("btn-start-over", 60000);
  await g.click("btn-start-over");
  await g.waitFor("profile-done", 240000); // builds the whole workshop scene again (slow in software GL)
  await g.click("profile-done");
  await g.waitFor("hud-cheater");
  const after = await g.state();
  ok(after.money === 50000 && after.flags.knownCheater, "progress wiped and the 🤡 Known Cheater badge is shown");
  await page.waitForTimeout(1500);
  await g.shot(`${name}-6-badge`);

  const errs = g.realErrors();
  ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));
  await browser.close();
}

(async () => {
  await run("desktop", false);
  await run("mobile", true);
  console.log("\nSmoke e2e passed. Screenshots in tests/e2e/screens/");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
