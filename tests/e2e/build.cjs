// Plays a full keyboard build with real mouse/keyboard input (no shortcuts) through every
// minigame, then checks delivery, saving, and resuming a half-finished build after reload.
// Needs `npm run dev` running (uses dev-only hooks to find key positions on screen).
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.env.BASE_URL || "http://localhost:5173/";
const OUT = path.join(__dirname, "screens");
fs.mkdirSync(OUT, { recursive: true });
const ok = (c, m) => {
  if (!c) throw new Error("ASSERT: " + m);
  console.log("  ok -", m);
};

let failShot = null;
(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  failShot = () => page.screenshot({ path: path.join(OUT, "build-FAILED.png") });
  const B = (fn, arg) => page.evaluate(fn, arg);
  const step = () => B(() => window.__mkssBench.step());
  const next = async () => {
    await page.waitForSelector("#btn-next:not([disabled])");
    await page.click("#btn-next");
  };
  const center = async (sel) => {
    const r = await page.locator(sel).boundingBox();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  };
  const shot = (n) => page.screenshot({ path: path.join(OUT, `build-${n}.png`) });

  await page.goto(BASE);
  await page.addStyleTag({ content: "#debug{display:none!important}" });
  await page.click("#btn-new");
  await page.waitForSelector(".job-card");
  await page.click('[data-test="take-0"]');
  ok((await step()) === "case", "taking a job starts the build at the case step");

  // Case
  await page.click('[data-test="layout-65"]');
  await page.click('[data-test="case-aluminum"]');
  await page.click('[data-test="color-navy"]');
  await next();
  // PCB: solder, to exercise the soldering minigame
  await page.click('[data-test="pcb-solder"]');
  await next();
  // Dampening with the tape mod minigame
  await page.click('[data-test="damp-caseFoam"]');
  await page.click('[data-test="damp-tape"]');
  ok(await page.locator("#btn-next[disabled]").count() === 1, "Next is disabled until the tape is applied");
  await page.click('[data-test="tape-start"]');
  await page.waitForSelector(".mg-tape");
  await page.waitForTimeout(400); // let it scroll into view
  const lanes = 5; // 65% = 5 rows
  for (let i = 0; i < lanes; i++) {
    const tape = await center(".mg-tape");
    const y = tape.y + tape.h * 0.12 + ((i + 0.5) / lanes) * tape.h * 0.76;
    await page.mouse.move(tape.x + tape.w * 0.1, y);
    await page.mouse.down();
    for (let s = 1; s <= 10; s++) await page.mouse.move(tape.x + tape.w * (0.1 + 0.08 * s), y + (s % 2 ? 2 : -2));
    await page.mouse.up();
  }
  await page.waitForSelector("#btn-next:not([disabled])", { timeout: 10000 });
  const tapeQ = await B(() => window.__mkssBench.state().activeBuild.tapeQuality);
  ok(tapeQ > 0.7, `tape mod minigame completes with swipes (quality ${Math.round(tapeQ * 100)}%)`);
  await shot("1-tape");
  await next();
  // Plate
  await page.click('[data-test="plate-pom"]');
  await next();
  // Stabs + wire lubing by dragging along the wire
  await page.click('[data-test="stabs-standard"]');
  await page.click('[data-test="stabmod-clip"]');
  await page.click('[data-test="stab-lube"]');
  await page.waitForSelector(".mg-wire");
  await page.waitForTimeout(400);
  for (let w = 0; w < 4; w++) {
    const wire = await center(".mg-wire");
    await page.mouse.move(wire.x + wire.w * 0.1, wire.y + wire.h * 0.72);
    await page.mouse.down();
    await page.mouse.move(wire.x + wire.w * 0.1, wire.y + wire.h * 0.5, { steps: 4 });
    await page.mouse.move(wire.x + wire.w * 0.9, wire.y + wire.h * 0.5, { steps: 25 });
    await page.mouse.move(wire.x + wire.w * 0.9, wire.y + wire.h * 0.72, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(150);
  }
  await page.waitForSelector("#btn-next:not([disabled])");
  const stabLube = await B(() => window.__mkssBench.state().activeBuild.stabLube);
  ok(stabLube > 0.8, `wire lubing by dragging covers the wires (${Math.round(stabLube * 100)}%)`);
  await next();
  // Switches: pick the first linear one
  await page.locator('[data-test^="switch-sw."]').first().click();
  await next();
  // Lube minigame: hold ~1.6s per switch (linear zone ≈ 0.55–0.8 of the meter)
  await page.waitForSelector(".mg-lube");
  await page.waitForTimeout(400);
  for (let i = 0; i < 5; i++) {
    const lube = await center(".mg-lube");
    await page.mouse.move(lube.x + lube.w * 0.4, lube.y + lube.h * 0.5);
    await page.mouse.down();
    await page.waitForTimeout(1500 / (1 + i * 0.16));
    await page.mouse.up();
    await page.waitForTimeout(800);
  }
  await page.waitForSelector("#btn-next:not([disabled])");
  const lubeQ = await B(() => window.__mkssBench.state().activeBuild.lube);
  ok(lubeQ && !lubeQ.skipped, `switch lubing minigame records a result (quality ${Math.round(lubeQ.quality * 100)}%)`);
  await shot("2-after-lube");
  await next();
  // Install: drag slowly across every key position
  ok((await step()) === "install", "install step");
  await page.waitForTimeout(1500);
  const n = await B(() => window.__mkssBench.keyCount());
  for (let id = 0; id < n; id++) {
    const p = await B((i) => window.__mkssBench.keyScreen(i), id);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.up();
  }
  await page.waitForSelector("#btn-next:not([disabled])");
  ok(true, `all ${n} switches installed by clicking on the 3D board`);
  await shot("3-installed");
  await next();
  // Solder: tap with Space on a rough rhythm (some misses are expected → cold joints)
  ok((await step()) === "solder", "solder step appears for a solder PCB");
  await page.keyboard.press("Space"); // start
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(700);
    await page.keyboard.press("Space");
  }
  await page.waitForSelector("#btn-next:not([disabled])", { timeout: 60000 });
  const faults = await B(() => window.__mkssBench.faults());
  ok(true, `soldering finished (${faults.length} cold joints)`);
  await next();
  // Screws: hold each until ~0.7 torque (0.75/s → ~930ms)
  await page.waitForSelector(".mg-screws");
  await page.waitForTimeout(400);
  for (let i = 0; i < 6; i++) {
    const sc = await center(".mg-screws");
    const cols = 3;
    const x = sc.x + sc.w * 0.12 + (((i % cols) + 0.5) / cols) * sc.w * 0.62;
    const y = sc.y + sc.h * 0.1 + (i < cols ? 0.28 : 0.72) * sc.h * 0.8;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(930);
    await page.mouse.up();
    await page.waitForTimeout(100);
  }
  await page.waitForSelector("#btn-next:not([disabled])");
  ok(true, "case screws minigame completes");
  await next();
  // Keycaps
  await page.locator('[data-test^="keycaps-kc."]').first().click();
  await page.waitForTimeout(2500);
  await shot("4-keycaps");
  await next();
  // Test: type real keys, then sweep, then fix every fault by clicking it
  ok((await step()) === "test", "key test step");
  for (const k of ["KeyQ", "KeyW", "KeyE", "Space"]) await page.keyboard.press(k.replace("Key", ""));
  await page.click('[data-test="test-sweep"]');
  await page.waitForTimeout(3500);
  const open = await B(() => window.__mkssBench.faults());
  for (const f of open) {
    const p = await B((i) => window.__mkssBench.keyScreen(i), f.key);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(500);
  await shot("5-test");
  if (!(await page.locator("#btn-next:not([disabled])").count())) await page.click('[data-test="test-sweep"]');
  await page.waitForSelector("#btn-next:not([disabled])");
  ok(true, `key test passes after fixing ${open.length} faulty keys`);
  await next();
  // Sound check
  await page.click('[data-test="autotype"]');
  await page.waitForTimeout(5000);
  await shot("6-sound");
  await page.waitForSelector("#btn-next:not([disabled])");
  const moneyBefore = await B(() => window.__mkssBench.state().money);
  await next();
  await page.waitForSelector('[data-test="result-stars"]');
  const stars = Number(await page.getAttribute('[data-test="result-stars"]', "data-stars"));
  const st = await B(() => window.__mkssBench.state());
  ok(stars >= 1 && stars <= 5, `delivered: ${stars} stars`);
  ok(st.money !== moneyBefore && st.history.length === 1 && st.activeBuild === null, "money, history and build state updated");
  await page.waitForTimeout(1500);
  await shot("7-result");

  // Resume a half-finished build after reload
  await page.click("#btn-next-customer");
  await page.click('[data-test="take-0"]');
  await page.click('[data-test="layout-tkl"]');
  await page.click('[data-test="case-wood"]').catch(() => {});
  await page.click('[data-test="case-plastic"]');
  await next();
  await page.click('[data-test="pcb-hotswap_rgb"]');
  await page.reload();
  await page.addStyleTag({ content: "#debug{display:none!important}" });
  await page.waitForSelector("#btn-continue");
  await page.click("#btn-continue");
  await page.waitForSelector(".sheet-foot");
  ok((await step()) === "pcb", "a half-finished build resumes at the same step after reload");
  ok((await B(() => window.__mkssBench.state().activeBuild.pcb)) === "hotswap_rgb", "…with its choices intact");
  await page.waitForTimeout(1200);
  await shot("8-resumed");

  const real = errors.filter((e) => !/GPU stall|WebGL|AudioContext/i.test(e));
  ok(real.length === 0, "no page errors" + (real.length ? ": " + real.join(" | ") : ""));
  await browser.close();
  console.log("\nBuild e2e passed. Screenshots in tests/e2e/screens/build-*.png");
})().catch(async (e) => {
  console.error(e);
  if (failShot) await failShot().catch(() => {});
  process.exit(1);
});
