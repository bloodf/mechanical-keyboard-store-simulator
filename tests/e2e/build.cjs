// Plays a full keyboard build with REAL input through every 3D minigame, delivers it, then checks
// that a half-finished build resumes after a reload. Needs `npm run dev` running.
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
  await g.click("hud-jobs");
  await g.click("take-0");
  await page.waitForTimeout(800);
  await g.ev(() => window.__mkss.game.interact("bench"));
  await g.waitFor("drawer");
  ok((await g.step()) === "case", "taking a job and going to the bench starts at the case step");

  // Case: layout → material → color (tabs advance by themselves)
  await g.click("subtab-layout");
  await g.clickTile("layout-65");
  await g.clickTile("case-aluminum");
  await g.waitFor("subtab-color");
  ok((await build()).caseColor !== null, "case layout, material and color chosen");
  await next();
  await g.clickTile("pcb-solder");
  await next();

  // Dampening + 3D tape mod: drag across each lane of the flipped PCB
  await g.clickTile("damp-caseFoam");
  await g.clickTile("damp-tape");
  await g.click("tape-start");
  await page.waitForTimeout(1500);
  for (let i = 0; i < 5; i++) {
    await settle();
    const lanes = await mg();
    const lane = lanes.find((l) => !l.done);
    if (!lane) break;
    await drag([lane.a, { x: (lane.a.x * 2 + lane.b.x) / 3, y: (lane.a.y * 2 + lane.b.y) / 3 }, { x: (lane.a.x + lane.b.x * 2) / 3, y: (lane.a.y + lane.b.y * 2) / 3 }, lane.b], 4);
    await page.waitForTimeout(400);
  }
  await waitDone(async () => (await build()).tapeQuality !== null, "tape minigame");
  ok((await build()).tapeQuality > 0.6, `tape laid on the 3D PCB (quality ${Math.round((await build()).tapeQuality * 100)}%)`);
  await g.shot("build-1-tape");
  await next();
  await g.clickTile("plate-pom");
  await next();

  // Stabilizers + 3D wire lubing: drag the brush along each wire
  await g.clickTile("stabs-standard");
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
  await g.clickTile("switch-sw.0");
  await next();

  // Lube: hold the HOLD button for ~1.5 s per switch (linear zone 0.55–0.8)
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

  // Screws: hold each screw ~0.93 s (torque 0.75/s → green zone 0.6–0.82)
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
  await g.clickTile("keycaps-kc.0");
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

  // Sound check + deliver
  await g.click("autotype");
  await page.waitForTimeout(6000);
  await waitDone(async () => (await build()).soundChecked, "sound check");
  await g.shot("build-6-sound");
  const before = (await g.state()).money;
  await g.click("btn-next");
  await g.waitFor("result-stars");
  await page.waitForTimeout(2000);
  await g.shot("build-7-result");
  const st = await g.state();
  ok(st.activeBuild === null && st.history.length === 1 && st.money !== before, `delivered: ${st.history[0].stars}★, profit ${st.history[0].profit / 100}`);

  // Resume a half-finished build after reload
  await g.click("btn-next-customer");
  await g.waitFor("hud-plate");
  await g.click("hud-jobs");
  await g.click("take-0");
  await page.waitForTimeout(800);
  await g.ev(() => window.__mkss.game.interact("bench"));
  await g.waitFor("drawer");
  await g.click("subtab-layout");
  await g.clickTile("layout-tkl");
  await g.clickTile("case-plastic");
  await next();
  await g.clickTile("pcb-hotswap_rgb");
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForFunction(() => window.__mkss, null, { timeout: 180000 });
  await g.click("btn-continue");
  await g.waitFor("hud-plate");
  await g.ev(() => window.__mkss.game.interact("bench"));
  await g.waitFor("drawer");
  ok((await g.step()) === "pcb" && (await build()).pcb === "hotswap_rgb", "a half-finished build resumes at the same step with its choices");
  await page.waitForTimeout(2000);
  await g.shot("build-8-resumed");

  const errs = g.realErrors();
  ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));
  await browser.close();
  console.log("\nBuild e2e passed (real input through every 3D minigame).");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
