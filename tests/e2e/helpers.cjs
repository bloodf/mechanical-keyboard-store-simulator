// Shared helpers for the canvas-UI end-to-end tests. The whole UI is drawn in WebGL, so tests
// locate controls through the dev-only hook window.__mkss.find(name) and click them with a real
// mouse / touchscreen at those coordinates.
const { chromium, devices } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const BASE = process.env.BASE_URL || "http://localhost:5173/";
const OUT = path.join(__dirname, "screens");
fs.mkdirSync(OUT, { recursive: true });

function ok(cond, msg) {
  if (!cond) throw new Error("ASSERT: " + msg);
  console.log("  ok -", msg);
}

// ---- Coverage (COVERAGE=1): precise V8 coverage of the game's own modules (src/**/*.ts), taken through the
// DevTools protocol. Snapshots are taken before every reload (the page's scripts and their counts are gone after a
// navigation) and when the browser closes; scripts/coverage.mjs merges them all.
const COV = !!process.env.COVERAGE;
const COV_DIR = path.join(__dirname, "../../coverage/e2e-raw");
const tracked = new Map(); // page -> { cdp, scripts, snapshot }
let covN = 0;

async function trackCoverage(page) {
  if (!COV || tracked.has(page)) return;
  const cdp = await page.context().newCDPSession(page);
  const scripts = new Map();
  cdp.on("Debugger.scriptParsed", (e) => {
    if (/\/src\/.+\.ts(\?|$)/.test(e.url)) scripts.set(e.scriptId, e.url);
  });
  await cdp.send("Debugger.enable");
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
  const sources = new Map();
  const snapshot = async () => {
    let result;
    try {
      ({ result } = await cdp.send("Profiler.takePreciseCoverage"));
    } catch {
      return;
    }
    const entries = [];
    for (const r of result) {
      const url = scripts.get(r.scriptId);
      if (!url) continue;
      let source = sources.get(r.scriptId);
      if (source === undefined) {
        try {
          source = (await cdp.send("Debugger.getScriptSource", { scriptId: r.scriptId })).scriptSource;
        } catch {
          continue;
        }
        sources.set(r.scriptId, source);
      }
      entries.push({ url, scriptId: r.scriptId, source, functions: r.functions });
    }
    if (!entries.length) return;
    fs.mkdirSync(COV_DIR, { recursive: true });
    fs.writeFileSync(path.join(COV_DIR, `${path.basename(process.argv[1], ".cjs")}-${process.pid}-${++covN}.json`), JSON.stringify(entries));
  };
  tracked.set(page, { cdp, snapshot });
  // reloads started by the tests…
  for (const m of ["reload", "goto"]) {
    const orig = page[m].bind(page);
    page[m] = async (...args) => {
      await snapshot();
      return orig(...args);
    };
  }
  // …and by the game itself (wipe, tamper demo, another tab, cleared storage)
  await page.exposeFunction("__beforeReload", snapshot);
  page.on("close", () => tracked.delete(page));
}

async function saveCoverage(page) {
  const t = tracked.get(page);
  if (!t) return;
  await t.snapshot();
  tracked.delete(page);
}

async function launch() {
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const close = browser.close.bind(browser);
  browser.close = async () => {
    for (const p of [...tracked.keys()]) await saveCoverage(p);
    return close();
  };
  return browser;
}

async function newGamePage(browser, { mobile = false, context = null } = {}) {
  const ctx = context ?? (mobile ? await browser.newContext({ ...devices["iPhone 13"] }) : await browser.newContext({ viewport: { width: 1280, height: 720 } }));
  const page = await ctx.newPage();
  page.setDefaultTimeout(150000);
  await trackCoverage(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const api = {
    page,
    ctx,
    errors,
    mobile,
    async open() {
      await page.goto(BASE, { timeout: 240000 });
      await page.waitForFunction(() => window.__mkss, null, { timeout: 180000 });
    },
    find: (name) => page.evaluate((n) => window.__mkss.find(n), name),
    async waitFor(name, timeout = 90000) {
      try {
        await page.waitForFunction((n) => window.__mkss && window.__mkss.find(n), name, { timeout });
      } catch (e) {
        await page.screenshot({ path: path.join(OUT, `FAILED-waiting-for-${name}.png`) }).catch(() => {});
        throw new Error(`timed out waiting for control "${name}"` + (errors.length ? `\n  page errors: ${errors.slice(0, 5).join(" | ")}` : ""));
      }
    },
    async click(name) {
      await api.waitFor(name);
      // wait until the control stops moving (layout settles after it appears)
      let r = await api.find(name);
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(150);
        const r2 = await api.find(name);
        if (r2 && r && Math.abs(r2.x - r.x) < 1 && Math.abs(r2.y - r.y) < 1) break;
        r = r2 ?? r;
      }
      if (mobile) await page.touchscreen.tap(r.x, r.y);
      else await page.mouse.click(r.x, r.y);
      await page.waitForTimeout(350);
    },
    /** Click a tile in the parts drawer, paging with ▶ if needed. */
    async clickTile(name) {
      for (let i = 0; i < 10; i++) {
        try {
          await page.waitForFunction((n) => window.__mkss.find(n), name, { timeout: i === 0 ? 15000 : 6000 });
          return api.click(name);
        } catch {
          if (!(await api.find("drawer-next"))) break;
          await api.click("drawer-next");
        }
      }
      await page.screenshot({ path: path.join(OUT, `FAILED-tile-${name}.png`) });
      throw new Error("tile not found: " + name);
    },
    ev: (fn, arg) => page.evaluate(fn, arg),
    step: () => page.evaluate(() => window.__mkss.step()),
    state: () => page.evaluate(() => window.__mkss.state()),
    shot: (name) => page.screenshot({ path: path.join(OUT, name + ".png") }),
    realErrors: () => errors.filter((e) => !/GPU stall|WebGL|AudioContext|store sandbox/i.test(e)),
  };
  return api;
}

module.exports = { ok, launch, newGamePage, trackCoverage, saveCoverage, BASE, OUT };
