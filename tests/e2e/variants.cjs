// All kinds of keyboards and the less common bench paths:
//  A) low-profile Choc build: swap the case, change the PCB footprint (parts that no longer fit go back), foams
//     on/off, plateless, stabilizer mods + skip lubing, no lube in stock (order / skip), low-profile caps,
//     a chattering key found and fixed in the key test, tweaking foams in the sound check;
//  B) Box switches on a solder PCB: back button, lube redo, solder, "order more…" tiles;
//  C) deadlines: a late delivery, a cancelled order, closing time while a dialog is open, Grandma's rescue;
//  D) an old (v3 shop-floor) save upgraded on Continue; dev auto-build with an empty shelf; another tab's
//     older save showing up (conflict), and editing the save while playing (cheater screen).
// Needs `npm run dev` running.
const { ok, launch, newGamePage } = require("./helpers.cjs");

(async () => {
  const browser = await launch();
  const g = await newGamePage(browser);
  const { page } = g;
  const st = () => g.state();
  const build = () => g.ev(() => window.__mkss.state().activeBuild);
  const edit = async (fn, arg) => {
    await page.evaluate(fn, arg);
    await page.evaluate(() => window.__mkss.refresh());
    await page.waitForTimeout(500);
  };
  const waitDone = async (check, what, timeout = 90000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await check()) return;
      await page.waitForTimeout(400);
    }
    await g.shot(`FAILED-${what}`);
    throw new Error("timed out: " + what);
  };
  const next = async () => {
    const before = await g.step();
    await g.click("btn-next");
    await waitDone(async () => (await g.step()) !== before, `leave ${before}`);
  };
  const auto = async () => {
    const before = await g.step();
    await page.evaluate(() => window.__mkss.autoStep());
    await waitDone(async () => (await g.step()) !== before, `auto ${before}`);
  };

  await g.open();
  await g.click("btn-new");
  await g.click("profile-done");
  await g.waitFor("hud-bar");
  const cat = await page.evaluate(() => window.__mkss.catalog());
  const choc = cat.switches.find((s) => s.family === "choc").id;
  const box = cat.switches.find((s) => s.family === "box").id;
  const lp = cat.keycaps.find((k) => k.profile === "lp").id;
  const mxCaps = cat.keycaps.find((k) => k.profile !== "lp").id;

  // ================= A) low-profile Choc =================
  await edit(
    ({ choc, lp }) => {
      const s = window.__mkss.state();
      const o = s.offers.shift();
      o.wants = { lowProfile: true };
      s.accepted.push(o);
      s.money = 5000_00;
      const inv = s.inventory;
      for (const c of ["navy", "lavender", "crimson", "gold", "spacegrey"]) inv[`case/aluminum/65/${c}`] = 1;
      Object.assign(inv, { "case/aluminum/65/silver": 1, "pcb/hotswap/65/choc": 1, "stab/standard/choc": 1, "stab/standard/mx": 2, "foam/tape": 1, [`sw/${choc}`]: 68, [`kc/${lp}`]: 1, "foam/peFoam": 1, "foam/silicone": 1 });
      delete inv.lube;
    },
    { choc, lp },
  );
  await g.click(`start-${(await st()).accepted[0].id}`);
  await g.waitFor("drawer");
  await g.clickTile("case-case_plastic_65_black");
  if (await g.find("drawer-next")) {
    await g.click("drawer-next");
    await g.click("drawer-prev");
  }
  await g.clickTile("case-case_aluminum_65_silver");
  ok((await build()).caseMaterial === "aluminum" && (await st()).inventory["case/plastic/65/black"] === 1, "swapped the case; the first one went back on the shelf");
  await next();
  await g.clickTile("pcb-pcb_hotswap_65_mx");
  await next();
  await next(); // no foams yet
  await g.clickTile("plate-none");
  await next();
  await g.clickTile("stabs-stab_standard_mx");
  for (let i = 0; i < 3; i++) await g.click("btn-back");
  ok((await g.step()) === "pcb", "went back three steps");
  await g.clickTile("pcb-pcb_hotswap_65_choc");
  ok((await build()).family === "choc" && (await st()).inventory["pcb/hotswap/65/mx"] === 1 && (await build()).stabs === null, "switched to a Choc PCB: the MX stabilizers went back too");
  await next();
  await g.clickTile("damp-tape");
  await g.clickTile("damp-tape");
  await g.clickTile("damp-peFoam");
  await g.clickTile("damp-peFoam");
  await g.clickTile("damp-peFoam");
  await g.clickTile("damp-silicone");
  ok((await build()).damp.length === 2 && (await build()).damp.includes("silicone"), "foams toggled");
  await next();
  await g.clickTile("plate-none");
  ok((await build()).plate === "none", "plateless");
  await next();
  await g.clickTile("stabs-stab_standard_choc");
  await g.click("subtab-mods");
  await g.clickTile("stabmod-bandaid");
  await g.click("subtab-tiers");
  await g.click("stab-skip");
  ok((await build()).stabLube === 0, "skipped stabilizer lube");
  await next();
  await g.clickTile(`switch-${choc}`);
  await next();
  ok((await g.step()) === "lube", "lube step");
  await g.waitFor("lube-buy");
  await g.click("lube-buy");
  await g.click("suppliers-close");
  await page.waitForTimeout(600);
  await g.click("lube-retry");
  await g.click("lube-skip");
  ok((await build()).lube.skipped, "no lube in stock: skipped");
  await next();
  // install: drag fast across the board → some pins bend
  await page.waitForFunction(() => window.__mkss.settled(), null, { timeout: 60000 });
  const n = await g.ev(() => window.__mkss.keyCount());
  const pts = [];
  for (let id = 0; id < n; id += 3) pts.push(await g.ev((i) => window.__mkss.keyScreen(i), id));
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts) await page.mouse.move(p.x, p.y, { steps: 1 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  await auto(); // the rest of the install
  ok((await build()).installed, "installed (fast dragging risks bent pins)");
  await auto(); // screws
  await g.clickTile(`keycaps-${lp}`);
  await page.waitForTimeout(2500);
  await g.shot("var-1-choc");
  await next();
  await page.reload();
  await page.waitForFunction(() => window.__mkss, null, { timeout: 180000 });
  await g.click("btn-continue");
  await g.waitFor("drawer");
  ok((await g.step()) === "test" && (await build()).keycapsId === lp, "reload at the key test restores the finished board");
  // key test with a chattering key
  await edit(() => window.__mkss.state().activeBuild.faults.push({ key: 20, kind: "chatter", cause: "coldJoint" }));
  await page.waitForFunction(() => window.__mkss.settled(), null, { timeout: 60000 });
  for (const k of ["a", "s", "d", "f", "Space"]) await page.keyboard.press(k);
  const p20 = await g.ev(() => window.__mkss.keyScreen(20));
  await page.mouse.click(p20.x, p20.y);
  await page.waitForTimeout(500);
  await page.mouse.click(p20.x, p20.y);
  await page.waitForTimeout(1200);
  ok((await build()).fixed.includes(20), "found and fixed a chattering key");
  // sweep, fix whatever the fast install bent, sweep again
  for (let round = 0; round < 3 && !(await build()).tested; round++) {
    await g.click("test-sweep");
    await page.waitForTimeout(5000);
    const b = await build();
    for (const f of b.faults.filter((x) => !b.fixed.includes(x.key))) {
      const p = await g.ev((i) => window.__mkss.keyScreen(i), f.key);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(900);
    }
  }
  await waitDone(async () => (await build()).tested, "test");
  await next();
  await g.click("tweak-peFoam");
  await g.click("tweak-peFoam");
  for (const k of ["q", "w", "e", "r", "t"]) await page.keyboard.press(k);
  const pk = await g.ev(() => window.__mkss.keyScreen(30));
  await page.mouse.click(pk.x, pk.y);
  await waitDone(async () => (await build()).soundChecked, "sound check");
  await next();
  await g.click("btn-back");
  await next();
  await g.click("btn-next");
  await g.waitFor("btn-next-customer");
  ok((await st()).history[0] && (await st()).activeBuild === null, "shipped a low-profile keyboard");
  await g.click("btn-next-customer");
  await g.click("nav-menu");
  await g.click("menu-stats");
  await g.waitFor("stats-close");
  await g.shot("var-5-stats");
  await g.click("stats-close");

  // ================= B) Box switches, solder PCB =================
  await edit(
    ({ box, mxCaps }) => {
      const s = window.__mkss.state();
      const o = s.offers.shift();
      o.wants = undefined;
      o.layout = { kind: "exact", id: "65" };
      s.accepted.push(o);
      Object.assign(s.inventory, { "case/plastic/65/white": 1, "pcb/solder/65/mx": 1, "plate/pom/65/mx": 1, "stab/premium/mx": 1, [`sw/${box}`]: 70, [`kc/${mxCaps}`]: 1, lube: 2 });
    },
    { box, mxCaps },
  );
  await g.click(`start-${(await st()).accepted[0].id}`);
  await g.waitFor("drawer");
  await g.clickTile("case-buy");
  await g.click("suppliers-close");
  await page.waitForTimeout(600);
  await g.clickTile("case-case_plastic_65_white");
  await next();
  await g.clickTile("pcb-pcb_solder_65_mx");
  await next();
  await next(); // no foams
  await g.clickTile("plate-plate_pom_65_mx");
  await g.click("btn-back");
  ok((await g.step()) === "damp", "back to the previous step");
  await next();
  await next();
  await g.clickTile("stabs-stab_premium_mx");
  await g.click("stab-lube");
  await page.waitForTimeout(1500);
  await auto(); // the wire minigame finishes itself
  // a switch without enough stock is dimmed and opens the supplier
  const few = cat.switches.find((x) => x.family === "mx").id;
  await edit((id) => (window.__mkss.state().inventory[`sw/${id}`] = 5), few);
  await g.clickTile(`switch-${few}`);
  await g.click("suppliers-close");
  await page.waitForTimeout(600);
  await g.clickTile(`switch-${box}`);
  await next();
  // lube with the Space bar: way too much on the first switch, then about right
  await g.waitFor("lube-hold");
  for (let i = 0; i < 9 && (await build()).lube === null; i++) {
    await page.keyboard.down("Space");
    await page.waitForTimeout(i === 0 ? 4000 : 600);
    await page.keyboard.up("Space");
    await page.waitForTimeout(1300);
  }
  await waitDone(async () => (await build()).lube !== null, "lube with space");
  ok((await build()).lube.over > 0, "over-lubed one switch");
  await g.click("lube-redo");
  await auto(); // lube again
  ok(!(await build()).lube.skipped && (await build()).lube.over === 0, "redid the lubing");
  await auto(); // install
  ok((await g.step()) === "solder", "solder PCB → soldering step");
  await g.click("solder-tap");
  await page.keyboard.press("Space");
  await page.mouse.click(640, 250); // taps on the 3D view solder too
  await auto(); // solder
  // screws: one too short (loose), one too long (stripped), the rest automatic
  await page.waitForFunction(() => window.__mkss.settled(), null, { timeout: 60000 });
  for (const hold of [250, 2600]) {
    const sc = (await g.ev(() => window.__mkss.minigame())).filter((x) => x.open).sort((p, q) => p.p.y - q.p.y)[0];
    await page.mouse.move(sc.p.x, sc.p.y);
    await page.mouse.down();
    await page.waitForTimeout(hold);
    await page.mouse.up();
    await page.waitForTimeout(700);
  }
  await auto(); // the remaining screws
  ok((await build()).screws.loose + (await build()).screws.stripped > 0, "a loose or stripped screw counts against quality");
  await g.clickTile("keycaps-buy");
  await g.click("suppliers-close");
  await page.waitForTimeout(600);
  await g.clickTile(`keycaps-${mxCaps}`);
  await page.waitForTimeout(2500);
  await g.shot("var-2-box");
  await next();
  await auto(); // test
  await g.click("autotype");
  await waitDone(async () => (await build()).soundChecked, "sound check B");
  await next();
  await g.click("btn-next");
  await g.waitFor("btn-next-customer");
  await g.click("btn-next-customer");
  ok((await st()).history.length === 2, "shipped a Box-switch keyboard");

  // ================= C) deadlines & Grandma =================
  await g.click("nav-closeday");
  await g.click("confirm-closeday-yes");
  await g.click("day-open");
  await edit(() => {
    const s = window.__mkss.state();
    const [late, lost] = s.offers.splice(0, 2);
    late.due = s.day - 2;
    late.layout = { kind: "exact", id: "65" };
    late.wants = undefined;
    lost.due = s.day - 3;
    s.accepted.push(late, lost);
    Object.assign(s.inventory, { "case/plastic/65/black": 1, "pcb/hotswap/65/mx": 1, "plate/aluminum/65/mx": 1, "stab/standard/mx": 1 });
  });
  await g.click(`start-${(await st()).accepted[0].id}`);
  await g.waitFor("drawer");
  for (let i = 0; i < 14 && (await g.step()) !== "deliver"; i++) await auto();
  await edit(() => (window.__mkss.state().minute = 17 * 60 + 50));
  const dayC = (await st()).day;
  await g.click("btn-next");
  await g.waitFor("btn-next-customer");
  await g.shot("var-3-late");
  await page.waitForTimeout(1500);
  ok(!(await g.find("day-open")), "the day report waits until the shipping report is closed");
  ok((await st()).stats.lateDeliveries === 1, "a late delivery is counted");
  await g.click("btn-next-customer");
  await g.click("day-open");
  ok((await st()).day === dayC + 1, "…then the workshop closed for the day");
  await edit(() => {
    const s = window.__mkss.state();
    s.money = 0;
    s.inventory = {};
    s.shipments = [];
  });
  await g.click("nav-closeday");
  await g.click("confirm-closeday-yes");
  await g.waitFor("day-open");
  await g.shot("var-4-grandma");
  await g.click("day-open");
  const s = await st();
  ok(s.accepted.length === 0 && s.mail.some((m) => m.kind === "cancelled"), "the far-overdue client cancelled");
  ok(s.money === 200_00 && s.mail.some((m) => m.kind === "gift"), "broke with nothing to build: Grandma sent money");

  // ================= D) old save, empty-shelf auto build, conflict, live edit =================
  // an authentic save from the shop-floor version (v3) becomes a workshop with the starter stock
  await page.evaluate(async () => {
    const { seal } = await import("/src/save/crypto.ts");
    const job = { id: "job.9", index: 9, customer: { name: "Old Timer", persona: "writer", voice: {} }, layout: { kind: "exact", id: "65" }, sound: ["creamy"], feel: "any", theme: { kind: "any" }, budget: 30000, picky: 0.3, quote: [{ key: "job.greet.0", params: { name: "Old" } }] };
    const v3 = { version: 3, seed: "OLDSAVE1", createdAt: 1, day: 7, money: 123400, reputation: 350, playTimeSec: 500, stats: { customersServed: 5, keyboardsBuilt: 5, membraneExplained: 1, angryCustomers: 0, perfectBuilds: 2, totalProfit: 80000 }, jobsIssued: 10, jobBoard: [job], activeBuild: null, history: [], profile: { name: "Sam", storeName: "Old Shop", avatar: {}, created: true }, inventory: {}, goalsCompleted: [], unlocks: [], flags: { knownCheater: false, cheatCount: 0 } };
    for (const k of ["mkss.save.a", "mkss.save.b", "mkss.shame"]) localStorage.removeItem(k);
    localStorage.setItem("mkss.save.b", seal(JSON.stringify({ slot: "b", counter: 1, savedAt: 1, state: v3 }), "slot:b"));
  });
  await page.reload();
  await page.waitForFunction(() => window.__mkss, null, { timeout: 180000 });
  await g.click("btn-continue");
  await g.waitFor("hud-bar");
  const old = await st();
  ok(old.version === 4 && old.money === 123400 && Object.keys(old.inventory).length > 5 && old.offers.length === 1 && !old.needsStarterKit, "a v3 save continues as a v4 workshop with the starter stock");
  // dev auto-build with nothing on the shelf: every step falls back to a dev part
  await edit(() => {
    const s = window.__mkss.state();
    const o = s.offers.shift();
    o.wants = { lowProfile: false };
    s.accepted.push(o);
    s.inventory = {};
  });
  await g.click(`start-${(await st()).accepted[0].id}`);
  await g.waitFor("drawer");
  for (let i = 0; i < 14 && (await g.step()) !== "deliver"; i++) await auto();
  ok((await g.step()) === "deliver", "dev auto-build works even with an empty shelf");
  // another tab's (older, authentic) save shows up: this tab pauses instead of crying "cheater"
  const snap = await page.evaluate(() => [localStorage.getItem("mkss.save.a"), localStorage.getItem("mkss.save.b")]);
  await page.evaluate(() => window.__mkss.game.persist());
  await edit(() => (window.__mkss.state().money += 1));
  await page.evaluate((sn) => {
    if (sn[0]) localStorage.setItem("mkss.save.a", sn[0]);
    if (sn[1]) localStorage.setItem("mkss.save.b", sn[1]);
  }, snap);
  await edit(() => (window.__mkss.state().money += 1));
  await g.waitFor("other-tab", 60000);
  ok(!(await g.find("cheater-title")), "an older authentic save from another tab pauses the game (not cheating)");
  await page.reload();
  await page.waitForFunction(() => window.__mkss, null, { timeout: 180000 });
  await g.click("btn-continue");
  await g.waitFor("drawer");
  // editing the save while playing → caught on the next save → cheater screen
  await page.evaluate(() => {
    for (const k of ["mkss.save.a", "mkss.save.b"]) {
      const v = localStorage.getItem(k);
      if (v) localStorage.setItem(k, v.slice(0, 40) + (v[40] === "Q" ? "R" : "Q") + v.slice(41));
    }
  });
  await g.click("dev-tools");
  await g.click("dbg-money");
  await g.waitFor("cheater-title", 120000);
  ok(true, "a save edited while the game runs is caught on the next save");
  for (let i = 0; i < 3; i++) {
    if (await g.find("btn-start-over")) await g.click("btn-start-over");
    try {
      await g.waitFor("profile-done", 120000);
      break;
    } catch (e) {
      if (i === 2) throw e;
    }
  }
  await g.click("profile-done");
  await g.waitFor("hud-bar");
  // the dev tools' tamper demo
  await g.click("dev-tools");
  await g.click("dbg-tamper");
  await page.waitForFunction(() => window.__mkss, null, { timeout: 180000 });
  await g.waitFor("cheater-title", 120000);
  ok(true, "editing the save while playing is caught");

  const errs = g.realErrors();
  ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));
  await browser.close();
  console.log("\nVariants e2e passed.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
