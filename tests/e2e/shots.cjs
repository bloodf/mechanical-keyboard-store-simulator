// Quick visual check: screenshots of the title (several generated colorways) and cheater screen.
const { chromium } = require("playwright");
const path = require("node:path");
const BASE = process.env.BASE_URL || "http://localhost:5173/";
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  for (let i = 0; i < 3; i++) {
    await p.goto(BASE);
    await p.waitForSelector(".title-screen");
    await p.waitForTimeout(1200);
    await p.screenshot({ path: path.join(__dirname, "screens", `look-title-${i}.png`) });
  }
  await p.evaluate(() => localStorage.setItem("mkss.save.a", "MKSS1.hacked"));
  await p.goto(BASE);
  await p.waitForSelector("#cheater-screen");
  await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(__dirname, "screens", "look-cheater.png") });
  await b.close();
})();
