// Renders every sound effect offline in a real browser and checks it: not silent, no NaN,
// not clipping, and it finishes inside its time budget. Prints a loudness table.
// Needs `npm run dev` running (the hook is dev-only).
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:5173/";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(BASE, { timeout: 240000 });
  await page.waitForFunction(() => window.__mkssAudio, null, { timeout: 240000 });
  const rows = await page.evaluate(async () => {
    const { renderOffline, ids } = window.__mkssAudio;
    const out = [];
    for (const id of ids) {
      const { buffer, declaredEnd } = await renderOffline(id);
      const d = buffer.getChannelData(0);
      let peak = 0, sum = 0, nan = false, last = 0, first = -1;
      for (let i = 0; i < d.length; i++) {
        const x = d[i];
        if (!Number.isFinite(x)) { nan = true; break; }
        const a = Math.abs(x);
        if (a > peak) peak = a;
        sum += x * x;
        if (a > 0.003) { last = i; if (first < 0) first = i; }
      }
      const audible = first >= 0 ? (last - first) / buffer.sampleRate : 0;
      // RMS over the audible part only, so short and long sounds compare fairly
      const rms = first >= 0 ? Math.sqrt(sum / Math.max(1, last - first)) : 0;
      out.push({ id, peak, rms, audible, end: last / buffer.sampleRate, budget: buffer.duration, declaredEnd, nan });
    }
    return out;
  });
  await browser.close();

  let failures = 0;
  const db = (x) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : "-inf").padStart(6);
  console.log("id".padEnd(22), "peak dB", " rms dB", " length", " status");
  for (const r of rows) {
    const problems = [];
    if (r.nan) problems.push("NaN");
    if (r.peak < 0.02) problems.push("too quiet/silent");
    if (r.peak > 1.0) problems.push("clips");
    if (r.end > r.budget - 0.05) problems.push("runs past its budget");
    if (r.declaredEnd > r.budget) problems.push("declared end past budget");
    if (problems.length) failures++;
    console.log(r.id.padEnd(22), db(r.peak), " ", db(r.rms), " ", r.audible.toFixed(2).padStart(5) + "s", " ", problems.join(", ") || "ok");
  }
  console.log(`\n${rows.length} sounds, ${failures} with problems`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
