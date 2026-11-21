// Screenshot helper for the dev sandbox: node tests/e2e/sandbox.cjs "view=humans&seed=3" out.png [w h]
const { chromium } = require("playwright");
(async () => {
  const [, , query, out, w = "1280", h = "720"] = process.argv;
  const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: Number(w), height: Number(h) } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => (m.type() === "error" || process.env.DEBUG) && errs.push(m.type() + ": " + m.text()));
  await p.goto(`http://localhost:5173/sandbox.html?${query}`, { timeout: 240000 });
  await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
  await p.waitForTimeout(Number(process.env.WAIT || 2500));
  await p.screenshot({ path: out, timeout: 180000 });
  if (errs.length) console.log("errors:", errs);
  await b.close();
})();
