// The workshop loop with REAL input: accept an order, buy a part from the supplier (express),
// build through every 3D minigame (waiting for the courier when the part isn't there yet),
// ship it, get the review by mail, close the day, and resume a half-finished build after a reload.
// Needs `npm run dev` running.
const { ok, launch, newGamePage } = require("./helpers.cjs");

(async () => {
  const browser = await launch();
  const g = await newGamePage(browser);
  const { page } = g;
  const build = () => g.ev(() => window.__mkss.state().activeBuild);
  const mg = () => g.ev(() => window.__mkss.minigame());
  const waitDone = async (check, what, timeout = 120000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await check()) return;
      await page.waitForTimeout(500);
    }
    await g.shot(`FAILED-${what}`);
    throw new Error("timed out: " + what);
  };
  const next = async () => {
    const before = await g.step();
    await g.click("btn-next");
    await waitDone(async () => (await g.step()) !== before, `leave step ${before}`);
  };
  const settle = () => page.waitForFunction(() => window.__mkss.settled(), null, { timeout: 120000 });
  const drag = async (pts, stepsEach = 3) => {
    await page.mouse.move(pts[0].x, pts[0].y);
    await page.mouse.down();
    for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: stepsEach });
    await page.mouse.up();
  };

  await g.open();
  await g.click("btn-new");
  await g.click("profile-done");
  await g.waitFor("hud-bar");

  // Orders: accept the first request
  await g.click("nav-orders");
  await g.click("accept-0");
  ok((await g.state()).accepted.length === 1, "order accepted");
  await g.click("orders-close");

  // Suppliers: a solder PCB for this 65%, express
  await g.click("nav-suppliers");
  await g.click("suptab-pcb");
  await g.click("suplayout-65");
  await g.click("add-pcb_solder_65_mx");
  await g.click("ship-express");
  const money0 = (await g.state()).money;
  await g.click("sup-order");
  const st0 = await g.state();
  ok(st0.money < money0 && st0.shipments.length === 1 && st0.shipments[0].express, "express supplier order paid and on its way");
  await g.click("suppliers-close");
  await page.waitForTimeout(600);

  // Start building from the idle bench card
  await g.click("start-order.0");
  await g.waitFor("drawer");
  ok((await g.step()) === "case", "building starts at the case step");
  await g.clickTile("case-case_plastic_65_black");
  ok((await build()).caseMaterial === "plastic", "case taken from stock");
  ok(!(await g.state()).inventory["case/plastic/65/black"], "…and it left the shelf");
  await next();

  // PCB: the solder PCB is still on the truck → wait for the courier
  ok(!(await g.state()).inventory["pcb/solder/65/mx"], "the solder PCB hasn't arrived yet");
  await g.click("btn-wait");
  await waitDone(async () => ((await g.state()).inventory["pcb/solder/65/mx"] ?? 0) === 1, "courier");
  ok(true, "waited for the courier: the PCB arrived");
  await g.clickTile("pcb-pcb_solder_65_mx");
  await next();

  // Dampening + 3D tape mod: drag across each lane of the flipped PCB
  await g.clickTile("damp-caseFoam");
  await g.clickTile("damp-tape");
  await g.click("tape-start");
  await page.waitForTimeout(1500);
  for (let i = 0; i < 10; i++) {
    await settle();
    const lanes = await mg();
    const lane = lanes && lanes.find((l) => !l.done);
    if (!lane) break;
    await drag([lane.a, { x: (lane.a.x * 2 + lane.b.x) / 3, y: (lane.a.y * 2 + lane.b.y) / 3 }, { x: (lane.a.x + lane.b.x * 2) / 3, y: (lane.a.y + lane.b.y * 2) / 3 }, lane.b], 4);
    await page.waitForTimeout(400);
  }
  await waitDone(async () => (await build()).tapeQuality !== null, "tape minigame");
  ok((await build()).tapeQuality > 0.6, `tape laid on the 3D PCB (quality ${Math.round((await build()).tapeQuality * 100)}%)`);
  await g.shot("build-1-tape");
  await next();
  await g.clickTile("plate-plate_aluminum_65_mx");
  await next();

  // Stabilizers + 3D wire lubing
  await g.clickTile("stabs-stab_standard_mx");
  await g.clickTile("stabmod-clip");
  await g.click("stab-lube");
  await page.waitForTimeout(1500);
  for (let w = 0; w < 4; w++) {
    await settle();
    const info = await mg();
    if (!info) break;
    await drag(info.path.filter((_, i) => i % 2 === 0), 2);
    await page.waitForTimeout(700);
  }
  await waitDone(async () => (await build()).stabLube !== null, "wire minigame");
  ok((await build()).stabLube > 0.5, `stabilizer wires lubed in 3D (${Math.round((await build()).stabLube * 100)}%)`);
  await next();
  const sw = Object.keys((await g.state()).inventory).find((k) => k.startsWith("sw/")).slice(3);
  await g.clickTile(`switch-${sw}`);
  await next();

  // Lube: hold the HOLD button for ~1.5 s per switch
  ok((await g.step()) === "lube", "lube step");
  await page.waitForTimeout(2500);
  for (let i = 0; i < 5; i++) {
    await g.waitFor("lube-hold");
    const r = await g.find("lube-hold");
    await page.mouse.move(r.x, r.y);
    await page.mouse.down();
    await page.waitForTimeout(1500 / (1 + i * 0.16));
    await page.mouse.up();
    await page.waitForTimeout(1200);
  }
  await waitDone(async () => (await build()).lube !== null, "lube minigame");
  ok(!(await build()).lube.skipped, `switches lubed in 3D (quality ${Math.round((await build()).lube.quality * 100)}%)`);
  await g.shot("build-2-lube");
  await next();

  // Install: click every key position on the 3D board
  ok((await g.step()) === "install", "install step");
  await page.waitForTimeout(1500);
  await settle();
  const n = await g.ev(() => window.__mkss.keyCount());
  for (let id = 0; id < n; id++) {
    const p = await g.ev((i) => window.__mkss.keyScreen(i), id);
    await page.mouse.click(p.x, p.y);
  }
  await waitDone(async () => (await build()).installed, "install");
  ok(true, `all ${n} switches installed by clicking the 3D board`);
  await next();

  // Solder: rhythm with Space
  ok((await g.step()) === "solder", "solder step for a solder PCB");
  await page.keyboard.press("Space");
  for (let i = 0; i < 18; i++) {
    await page.waitForTimeout(700);
    await page.keyboard.press("Space");
  }
  await waitDone(async () => (await build()).solderQuality !== null, "solder", 60000);
  ok(true, `soldered (${(await build()).faults.length} cold joints)`);
  await g.shot("build-3-solder");
  await next();

  // Screws: hold each screw ~0.93 s
  await page.waitForTimeout(1500);
  await settle();
  for (let i = 0; i < 8; i++) {
    const s = (await mg())?.find((x) => x.open);
    if (!s) break;
    await page.mouse.move(s.p.x, s.p.y);
    await page.mouse.down();
    await page.waitForTimeout(930);
    await page.mouse.up();
    await page.waitForTimeout(600);
  }
  await waitDone(async () => (await build()).screws !== null, "screws");
  ok((await build()).screws.quality > 0.5, `case screwed shut in 3D (${Math.round((await build()).screws.quality * 100)}%)`);
  await next();
  const kc = Object.keys((await g.state()).inventory).find((k) => k.startsWith("kc/")).slice(3);
  await g.clickTile(`keycaps-${kc}`);
  await page.waitForTimeout(3000);
  await g.shot("build-4-keycaps");
  await next();

  // Key test: real keyboard + sweep + click faulty keys to fix
  ok((await g.step()) === "test", "key test step");
  for (const k of ["q", "w", "e", "r"]) await page.keyboard.press(k);
  await g.click("test-sweep");
  await page.waitForTimeout(5000);
  await settle();
  for (const f of await g.ev(() => window.__mkss.faults())) {
    const p = await g.ev((i) => window.__mkss.keyScreen(i), f.key);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(900);
  }
  if (!(await build()).tested) {
    await g.click("test-sweep");
    await page.waitForTimeout(5000);
  }
  await waitDone(async () => (await build()).tested, "key test");
  ok(true, "all keys pass after fixing faulty ones");
  await g.shot("build-5-test");
  await next();

  // Sound check → pack & ship
  await g.click("autotype");
  await page.waitForTimeout(6000);
  await waitDone(async () => (await build()).soundChecked, "sound check");
  await g.shot("build-6-sound");
  await next();
  ok((await g.step()) === "deliver", "pack & ship step");
  const before = (await g.state()).money;
  await g.click("btn-next");
  await g.waitFor("qa-sound");
  await page.waitForTimeout(1500);
  await g.shot("build-7-shipped");
  const st = await g.state();
  ok(st.activeBuild === null && st.history.length === 1 && st.money > before, `shipped: client paid ${(st.money - before) / 100}`);
  const review = st.mail.find((m) => m.kind === "review" || m.kind === "complaint");
  ok(review && review.at > (st.day - 1) * 1440 + st.minute, "the client's review is on its way");
  await g.click("btn-next-customer");

  // Close the day: the review arrives, a new morning brings new orders
  await g.click("nav-closeday");
  await g.click("confirm-closeday-yes");
  await g.waitFor("day-open");
  await g.shot("build-8-day");
  await g.click("day-open");
  const st2 = await g.state();
  ok(st2.day === 2 && st2.offers.length >= 2, `day 2: ${st2.offers.length} order requests`);
  await g.click("nav-mail");
  await g.waitFor("mail-open");
  await g.shot("build-9-mail");
  ok((await g.state()).mail.some((m) => (m.kind === "review" || m.kind === "complaint") && m.read), "review read in the mail");
  await g.click("mail-close");
  await page.waitForTimeout(600);

  // Resume a half-finished build after reload
  await g.click("nav-orders");
  await g.click("accept-0");
  await g.click("orders-tab-accepted");
  await g.click("start-0");
  await g.waitFor("drawer");
  const tiles = Object.keys((await g.state()).inventory).filter((k) => k.startsWith("case/"));
  if (tiles.length) {
    await g.clickTile(`case-${tiles[0].replace(/\//g, "_")}`);
    await page.waitForTimeout(1500);
  }
  const chosen = (await build()).caseMaterial;
  await page.reload();
  await page.waitForFunction(() => window.__mkss, null, { timeout: 180000 });
  await g.click("btn-continue");
  await g.waitFor("drawer");
  ok((await g.step()) === "case" && (await build()).caseMaterial === chosen, "a half-finished build resumes with its choices");
  await page.waitForTimeout(2000);
  await g.shot("build-10-resumed");

  const errs = g.realErrors();
  ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));
  await browser.close();
  console.log("\nWorkshop e2e passed (orders → suppliers → every 3D minigame → ship → mail → next day → resume).");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
