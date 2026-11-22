// Every workshop screen and button: orders (decline, membrane replies & pitch, queue), stock filters, suppliers
// (all tabs, filters, cart, shipping, tools, not enough money, waiting for the courier), mail, menu (profile,
// settings & quality, quit/continue), dev tools (sound board, unlock, money, next day, auto step, wipe),
// closing the day (button and automatically at 18:00), put aside & resume, look-around camera, Esc.
// Needs `npm run dev` running.
const { ok, launch, newGamePage } = require("./helpers.cjs");

(async () => {
  const browser = await launch();
  const g = await newGamePage(browser);
  const { page } = g;
  const st = () => g.state();
  const edit = async (fn, arg) => {
    await page.evaluate(fn, arg);
    await page.evaluate(() => window.__mkss.refresh());
    await page.waitForTimeout(400);
  };
  const gone = async (name, timeout = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (!(await g.find(name))) return true;
      await page.waitForTimeout(300);
    }
    return false;
  };

  await g.open();
  await g.click("btn-new");
  await g.click("profile-done");
  await g.waitFor("hud-bar");

  // ---------------- Orders ----------------
  await g.click("nav-orders");
  await g.click("orders-tab-accepted");
  await g.click("orders-tab-new");
  await g.click("decline-1");
  ok((await st()).offers.length === 1 && (await st()).stats.ordersDeclined === 1, "declined an order");
  await g.click("orders-close");
  await edit(() => {
    const s = window.__mkss.state();
    const o = s.offers[0];
    s.offers.push({ ...o, id: "order.m1", index: 77, kind: "membrane" }, { ...o, id: "order.m2", index: 78, kind: "membrane" });
  });
  await g.click("nav-orders");
  await g.shot("ws-1-orders-membrane");
  await g.click("explain-1");
  await g.click("reply-2");
  ok((await st()).stats.membraneExplained === 1, "explained the membrane thing");
  await g.click("pitch-1");
  ok((await st()).offers.some((o) => o.id === "order.m2" && o.kind === "build"), "sold a real keyboard to a membrane customer");
  await g.click("accept-1");
  await g.click("accept-0");
  ok((await st()).accepted.length === 2, "two orders accepted");
  await g.click("orders-tab-accepted");
  await g.click("start-0");
  await g.waitFor("drawer");
  ok(!!(await st()).activeBuild, "started building from the accepted list");

  // put aside → idle card → start again
  await g.click("btn-abandon");
  await g.click("confirm-abandon-yes");
  await g.waitFor("bench-idle");
  ok((await st()).activeBuild === null && (await st()).accepted.length === 2, "put the keyboard aside");
  await g.click("bench-orders");
  await g.waitFor("orders-close");
  await page.keyboard.press("Escape");
  ok(await gone("orders-close"), "Esc closes a panel");
  const first = (await st()).accepted[0].id;
  await g.click(`start-${first}`);
  await g.waitFor("drawer");

  // ---------------- Stock ----------------
  await g.click("nav-stock");
  for (const c of ["case", "pcb", "plate", "stab", "sw", "kc", "foam", "lube", "all"]) await g.click(`stockcat-${c}`);
  await g.shot("ws-2-stock");
  await g.click("stock-close");

  // ---------------- Suppliers ----------------
  await g.click("nav-suppliers");
  for (const l of ["40", "60", "75", "tkl", "full", "65"]) await g.click(`suplayout-${l}`);
  await g.click("swatch-aluminum-navy");
  await g.click("add-case_aluminum_65_navy");
  await g.click("suptab-pcb");
  await g.click("supfp-choc");
  await g.click("add-pcb_hotswap_65_choc");
  await g.click("suptab-plate");
  await g.click("add-plate_aluminum_65_choc");
  await g.click("suptab-stab");
  await g.click("add-stab_standard_choc");
  await g.click("supfp-mx");
  await g.click("suptab-sw");
  const sw = (await st()).inventory ? Object.keys((await st()).inventory).find((k) => k.startsWith("sw/")).slice(3) : "sw.0";
  await g.click(`pack-${sw}-10`);
  await g.click("suptab-kc");
  await g.click("suptab-foam");
  await g.click("add-foam_plateFoam");
  await g.click("suptab-lube");
  await g.click("add-lube");
  await g.click("cart-rm-0");
  await g.click("ship-express");
  await g.click("ship-standard");
  await g.shot("ws-3-suppliers");
  const m0 = (await st()).money;
  await g.click("sup-order");
  ok((await st()).money < m0 && (await st()).shipments.length === 1, "standard order placed");
  await g.click("suptab-tool");
  await g.click("buytool-switchPress");
  ok((await st()).unlocks.includes("tool.switchPress"), "bought the switch press");
  await g.shot("ws-4-tools");
  await g.click("suptab-lube");
  await g.click("add-lube");
  await g.click("ship-express");
  await g.click("sup-order");
  await g.click("sup-wait");
  await page.waitForTimeout(800);
  ok((await st()).shipments.every((x) => !x.express), "waited for the express courier");
  await g.click("suppliers-close");
  // broke: the order button is disabled
  await edit(() => (window.__mkss.state().money = 100));
  await g.click("nav-suppliers");
  await g.click("suptab-lube");
  await g.click("add-lube");
  await g.click("sup-order");
  ok((await st()).shipments.length === 1, "can't order without money");
  await g.click("suppliers-close");
  await edit(() => (window.__mkss.state().money = 80000));

  // ---------------- Mail ----------------
  await g.click("nav-mail");
  await g.click("mail-0");
  if (await g.find("mail-1")) await g.click("mail-1");
  await g.shot("ws-5-mail");
  await g.click("mail-close");

  // ---------------- Look around ----------------
  const cam = () => page.evaluate(() => window.__mkss.game.ws.camera.alpha);
  const a0 = await cam();
  await page.mouse.move(640, 300);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(740, 260, { steps: 5 });
  await page.mouse.up({ button: "right" });
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(1500);
  ok(Math.abs((await cam()) - a0) > 0.05, "right-drag looks around the keyboard");

  // ---------------- Menu: profile, settings, quality, quit & continue ----------------
  await g.click("nav-menu");
  await g.click("menu-profile");
  await g.click("input-store");
  await page.keyboard.type(" 2");
  await g.click("profile-done");
  ok((await st()).profile.storeName.endsWith(" 2"), "renamed the workshop");
  await g.click("nav-menu");
  await g.click("menu-settings");
  for (const q of ["low", "medium", "high"]) {
    await g.click(`quality-${q}`);
    await page.waitForTimeout(800);
  }
  await g.click("vol-mute");
  await g.click("vol-mute");
  await g.click("settings-close");
  await g.click("nav-menu");
  await g.click("menu-stats");
  await g.waitFor("stats-close");
  await g.shot("ws-7-stats");
  await g.click("stats-close");
  await g.click("nav-menu");
  await g.click("menu-resume");
  await g.click("nav-menu");
  await g.click("menu-quit");
  await g.click("btn-new");
  await g.click("confirm-new-no"); // keep the workshop
  await g.click("btn-continue");
  await g.waitFor("drawer");
  ok(true, "quit to the title and continued");

  // ---------------- Dev tools ----------------
  const dev = async (id) => {
    await g.click("dev-tools");
    await g.click(id);
  };
  await dev("dbg-unlock");
  await dev("dbg-money");
  await dev("dbg-sounds");
  for (const c of ["ui", "money", "progress", "shop", "bench", "keyboard", "cheater", "customer"]) await g.click(`sb-cat-${c}`);
  await g.click("sfx-voice.happy");
  await g.click("sb-voice");
  await g.click("sound-board-close");
  await dev("dbg-auto");
  ok((await g.step()) === "pcb", "dev auto-step finished the case step");

  // ---------------- Closing time ----------------
  await g.click("nav-closeday");
  await g.click("confirm-closeday-no");
  const day = (await st()).day;
  await g.click("nav-closeday");
  await g.click("confirm-closeday-yes");
  await g.waitFor("day-open");
  await g.shot("ws-6-day-report");
  await g.click("day-open");
  ok((await st()).day === day + 1, "closed for the day with the button");
  await dev("dbg-day");
  await g.click("day-open");
  ok((await st()).day === day + 2, "dev: next day");
  // working past 18:00 closes the workshop automatically
  await edit(() => (window.__mkss.state().minute = 17 * 60 + 58));
  await page.evaluate(() => window.__mkss.autoStep());
  await g.waitFor("day-open");
  await g.click("day-open");
  ok((await st()).day === day + 3 && (await st()).minute === 9 * 60, "closing time at 18:00 opens a new morning");

  const errs = g.realErrors();
  ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));

  // ---------------- Clearing site data while playing is respected (not cheating) ----------------
  await page.evaluate(() => ["mkss.save.a", "mkss.save.b"].forEach((k) => localStorage.removeItem(k)));
  await dev("dbg-money");
  await page.waitForFunction(() => window.__mkss, null, { timeout: 180000 });
  await g.waitFor("btn-new");
  ok(!(await g.find("btn-continue")) && !(await g.find("cheater-title")), "cleared storage → fresh start, no cheater screen");
  await browser.close();
  console.log("\nWorkshop screens e2e passed.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
