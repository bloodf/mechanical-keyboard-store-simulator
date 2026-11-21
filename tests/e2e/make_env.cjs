// Build public/assets/env/workshop.env from art/build/workshop_env.hdr (needs the dev server on :5173).
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage();
  p.on("pageerror", (e) => !/envgen started/.test(e.message) && console.log("pageerror", e.message));
  await p.goto("http://localhost:5173/sandbox.html?view=envgen");
  await p.waitForFunction(() => window.envData, null, { timeout: 300000 });
  const data = await p.evaluate(() => window.envData);
  fs.mkdirSync("public/assets/env", { recursive: true });
  fs.writeFileSync("public/assets/env/workshop.env", Buffer.from(data, "base64"));
  console.log("wrote public/assets/env/workshop.env", Buffer.from(data, "base64").length, "bytes");
  await b.close();
})();
