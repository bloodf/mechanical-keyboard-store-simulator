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

async function launch() {
  return chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
}

async function newGamePage(browser, { mobile = false, context = null } = {}) {
  const ctx = context ?? (mobile ? await browser.newContext({ ...devices["iPhone 13"] }) : await browser.newContext({ viewport: { width: 1280, height: 720 } }));
  const page = await ctx.newPage();
  page.setDefaultTimeout(150000);
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

module.exports = { ok, launch, newGamePage, BASE, OUT };
