// Phone (portrait, touch): the workshop HUD, orders, suppliers with the cart dialog, stock, mail reading,
// and building with taps (parts drawer, ticket dialog, step bar). Needs `npm run dev` running.
const { ok, launch, newGamePage } = require("./helpers.cjs");

(async () => {
  const browser = await launch();
  const g = await newGamePage(browser, { mobile: true });
  const { page } = g;
  page.on("dialog", (d) => d.accept(d.message().toLowerCase().includes("workshop") ? "Pocket Thocks" : "Kai"));
  const st = () => g.state();

  await g.open();
  await g.click("btn-new");
  await g.click("input-name");
  await page.waitForTimeout(600);
  await g.click("profile-done");
  await g.waitFor("hud-bar");
  await page.waitForTimeout(1500);
  await g.shot("mobile-1-workshop");

  await g.click("nav-orders");
  await g.waitFor("offer-0");
  await g.shot("mobile-2-orders");
  await g.click("accept-0");
  await g.click("orders-close");
  await page.waitForTimeout(800);

  await g.click("nav-suppliers");
  await g.click("suptab-sw");
  const sw = Object.keys((await st()).inventory).find((k) => k.startsWith("sw/")).slice(3);
  await g.click(`pack-${sw}-35`);
  await g.shot("mobile-3-suppliers");
  await g.click("sup-cart");
  await g.waitFor("sup-order");
  await g.click("ship-express");
  await g.click("sup-order");
  ok((await st()).shipments.length === 1, "ordered from the cart dialog on a phone");
  await page.waitForTimeout(500);
  await g.click("suppliers-close");
  await page.waitForTimeout(800);

  await g.click("nav-stock");
  await g.click("stockcat-sw");
  await g.shot("mobile-4-stock");
  await g.click("stock-close");
  await page.waitForTimeout(800);

  await g.click("nav-mail");
  await g.click("mail-0");
  await g.waitFor("mail-read");
  await g.shot("mobile-5-mail");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await g.click("mail-close");
  await page.waitForTimeout(800);

  // build with taps
  await g.click(`start-${(await st()).accepted[0].id}`);
  await g.waitFor("drawer");
  await g.clickTile("case-case_plastic_65_black");
  await g.click("btn-next");
  await g.waitFor("drawer");
  await g.click("ticket-open");
  await g.waitFor("ticket-modal");
  await g.shot("mobile-6-ticket");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await g.clickTile("pcb-pcb_hotswap_65_mx");
  await g.shot("mobile-7-bench");
  ok((await st()).activeBuild.pcb === "hotswap", "picked parts with taps");

  // the lube minigame in portrait: tap the brush button a few times, then skip the rest
  for (let i = 0; i < 10 && (await g.step()) !== "lube"; i++) {
    await page.evaluate(() => window.__mkss.autoStep());
    await page.waitForTimeout(1200);
  }
  await g.waitFor("lube-hold");
  await g.shot("mobile-8-lube");
  for (let i = 0; i < 2; i++) await g.click("lube-hold");
  await g.click("lube-skip");
  ok((await st()).activeBuild.lube.skipped, "lube minigame works with taps");

  // an empty shelf: the stock panel sends you to the suppliers
  await page.evaluate(() => {
    window.__mkss.state().inventory = {};
    window.__mkss.refresh();
  });
  await g.click("nav-stock");
  await g.click("stock-buy");
  await g.waitFor("suppliers-close");
  ok(true, "empty stock → suppliers");
  await g.click("suppliers-close");
  await page.waitForTimeout(800);

  // dev tools on a phone: wipe everything
  await g.click("dev-tools");
  await g.click("dbg-wipe");
  await page.waitForFunction(() => window.__mkss, null, { timeout: 180000 });
  await g.waitFor("btn-new");
  ok(!(await g.find("btn-continue")), "wipe removed the save");

  const errs = g.realErrors();
  ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));
  await browser.close();
  console.log("\nMobile e2e passed.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
