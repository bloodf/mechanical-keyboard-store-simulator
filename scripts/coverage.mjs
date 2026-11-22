// Combined coverage: unit tests (vitest, coverage/unit/lcov.info) + end-to-end tests (V8 coverage from the browser,
// coverage/e2e-raw/*.json, converted with monocart-coverage-reports). Lines/functions/branches are merged per file
// (covered if either run covered them) → coverage/merged/lcov.info + index.html + a summary table.
import fs from "node:fs";
import path from "node:path";
import { CoverageReport } from "monocart-coverage-reports";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "coverage");
const EXCLUDE = [/^src\/sandbox/, /^src\/env\.d\.ts$/, /\/types\.ts$/];
const keep = (f) => f.startsWith("src/") && f.endsWith(".ts") && !EXCLUDE.some((r) => r.test(f));

// ---- 1. e2e raw → lcov
const rawDir = path.join(OUT, "e2e-raw");
const e2eLcov = path.join(OUT, "e2e", "lcov.info");
if (fs.existsSync(rawDir)) {
  const mcr = new CoverageReport({
    name: "MKSS e2e coverage",
    outputDir: path.join(OUT, "e2e"),
    reports: [["lcovonly", { file: "lcov.info" }], "console-summary"],
    entryFilter: (e) => {
      const m = e.url.match(/\/(src\/.+\.ts)/);
      return !!m && keep(m[1]);
    },
    sourcePath: (p) => {
      const m = p.match(/src\/.+\.ts/);
      return m ? m[0] : p;
    },
    sourceFilter: () => true,
    cleanCache: true,
  });
  // Vite's inline source maps name the source by its basename: point them at the real path (src/…/file.ts)
  const fixMap = (e0) => {
    // modules updated by the dev server are served as file.ts?t=…: same module, same coverage entry
    const e = { ...e0, url: e0.url.replace(/\?.*$/, "") };
    const m = e.url.match(/\/(src\/.+\.ts)/);
    const i = e.source?.lastIndexOf("sourceMappingURL=data:application/json;base64,");
    if (!m || i === undefined || i < 0) return e;
    const head = e.source.slice(0, i);
    const b64 = e.source.slice(i + "sourceMappingURL=data:application/json;base64,".length).trim();
    const map = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    map.sources = [m[1]];
    return { ...e, source: head + "sourceMappingURL=data:application/json;base64," + Buffer.from(JSON.stringify(map)).toString("base64") };
  };
  for (const f of fs.readdirSync(rawDir).filter((x) => x.endsWith(".json"))) await mcr.add(JSON.parse(fs.readFileSync(path.join(rawDir, f), "utf8")).map(fixMap));
  await mcr.generate();
}

// ---- 2. merge lcov files
function parseLcov(file) {
  const files = new Map();
  if (!fs.existsSync(file)) return files;
  let cur = null;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("SF:")) {
      let f = line.slice(3).trim();
      const m = f.match(/src\/.+\.ts/);
      f = m ? m[0] : path.relative(ROOT, f);
      cur = files.get(f) ?? { lines: new Map(), fns: new Map(), branches: new Map() };
      files.set(f, cur);
    } else if (!cur) continue;
    else if (line.startsWith("DA:")) {
      const [ln, hits] = line.slice(3).split(",").map(Number);
      cur.lines.set(ln, (cur.lines.get(ln) ?? 0) + hits);
    } else if (line.startsWith("FNDA:")) {
      const [hits, ...name] = line.slice(5).split(",");
      const n = name.join(",");
      cur.fns.set(n, (cur.fns.get(n) ?? 0) + Number(hits));
    } else if (line.startsWith("FN:")) {
      const [, ...name] = line.slice(3).split(",");
      const n = name.join(",");
      if (!cur.fns.has(n)) cur.fns.set(n, 0);
    } else if (line.startsWith("BRDA:")) {
      const [ln, block, branch, taken] = line.slice(5).split(",");
      const key = `${ln},${block},${branch}`;
      cur.branches.set(key, (cur.branches.get(key) ?? 0) + (taken === "-" ? 0 : Number(taken)));
    } else if (line === "end_of_record") cur = null;
  }
  return files;
}
const unit = parseLcov(path.join(OUT, "unit", "lcov.info"));
const e2e = parseLcov(e2eLcov);
const merged = new Map();
// The two converters don't mark exactly the same lines as code. When only one kind of test ran a file,
// use that run's line map; when both did, a line is covered if either covered it, uncovered if both list it
// and neither hit it.
const ran = (d) => !!d && [...d.lines.values()].some((v) => v > 0);
for (const f of new Set([...unit.keys(), ...e2e.keys()])) {
  if (!keep(f)) continue;
  const u = unit.get(f);
  const e = e2e.get(f);
  const sources = ran(u) && ran(e) ? [u, e] : ran(u) ? [u] : ran(e) ? [e] : [u, e].filter(Boolean);
  const m = { lines: new Map(), fns: new Map(), branches: new Map(), from: new Set() };
  for (const d of sources) {
    for (const [k, v] of d.lines) m.lines.set(k, (m.lines.get(k) ?? 0) + v);
    for (const [k, v] of d.fns) m.fns.set(k, (m.fns.get(k) ?? 0) + v);
    m.from.add(d === u ? "unit" : "e2e");
  }
  if (sources.length === 2) {
    // A line only one converter counts as code, never hit by it, while the other run executed the file:
    // unknown (usually an arrow-function body or a field the other converter attributes to a nearby line).
    for (const [k, v] of [...m.lines]) if (v === 0 && (!u.lines.has(k) || !e.lines.has(k))) m.lines.delete(k);
  }
  merged.set(f, m);
}
// files nobody loaded count as 0%
for (const f of walk(path.join(ROOT, "src"))) if (keep(f) && !merged.has(f)) merged.set(f, { lines: new Map([[1, 0]]), fns: new Map(), branches: new Map(), from: new Set() });
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(path.relative(ROOT, p));
  }
  return out;
}

// ---- 3. report
const rows = [];
let tl = 0, th = 0, tf = 0, tfh = 0;
for (const [f, m] of [...merged].sort()) {
  const lines = [...m.lines.values()];
  const hit = lines.filter((v) => v > 0).length;
  const fns = [...m.fns.values()];
  const fh = fns.filter((v) => v > 0).length;
  tl += lines.length;
  th += hit;
  tf += fns.length;
  tfh += fh;
  const uncovered = [...m.lines].filter(([, v]) => v === 0).map(([k]) => k).sort((a, b) => a - b);
  rows.push({ f, pct: lines.length ? (100 * hit) / lines.length : 100, fpct: fns.length ? (100 * fh) / fns.length : 100, lines: lines.length, from: [...m.from].join("+"), uncovered });
}
fs.mkdirSync(path.join(OUT, "merged"), { recursive: true });
let lcov = "";
for (const [f, m] of merged) {
  lcov += `SF:${f}\n`;
  for (const [n, v] of m.fns) lcov += `FNDA:${v},${n}\n`;
  for (const [k, v] of [...m.lines].sort((a, b) => a[0] - b[0])) lcov += `DA:${k},${v}\n`;
  lcov += `LF:${m.lines.size}\nLH:${[...m.lines.values()].filter((v) => v > 0).length}\nend_of_record\n`;
}
fs.writeFileSync(path.join(OUT, "merged", "lcov.info"), lcov);
const range = (a) => {
  const out = [];
  for (let i = 0; i < a.length; i++) {
    let j = i;
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    out.push(i === j ? `${a[i]}` : `${a[i]}-${a[j]}`);
    i = j;
  }
  return out.join(",");
};
const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad("File", 46)} ${pad("Lines %", 8)} ${pad("Funcs %", 8)} ${pad("From", 9)} Uncovered lines`);
for (const r of rows) console.log(`${pad(r.f, 46)} ${pad(r.pct.toFixed(1), 8)} ${pad(r.fpct.toFixed(1), 8)} ${pad(r.from, 9)} ${range(r.uncovered).slice(0, 90)}`);
const total = (100 * th) / Math.max(1, tl);
console.log(`\nTOTAL lines ${total.toFixed(2)}% (${th}/${tl}) · functions ${((100 * tfh) / Math.max(1, tf)).toFixed(2)}% (${tfh}/${tf})`);
const html = `<!doctype html><meta charset=utf-8><title>MKSS coverage</title><style>body{font:14px system-ui;margin:24px}td,th{padding:3px 10px;text-align:left}tr:nth-child(even){background:#f4f4f4}.b{display:inline-block;height:10px;background:#2ea05a}</style>
<h1>Combined coverage (unit + e2e): ${total.toFixed(1)}% of lines</h1><table><tr><th>File</th><th>Lines</th><th></th><th>Functions</th><th>Covered by</th><th>Uncovered lines</th></tr>
${rows.map((r) => `<tr><td>${r.f}</td><td>${r.pct.toFixed(1)}%</td><td><span class=b style="width:${r.pct}px"></span></td><td>${r.fpct.toFixed(1)}%</td><td>${r.from}</td><td>${range(r.uncovered)}</td></tr>`).join("\n")}</table>`;
fs.writeFileSync(path.join(OUT, "merged", "index.html"), html);
fs.writeFileSync(path.join(OUT, "merged", "summary.json"), JSON.stringify({ lines: total, functions: (100 * tfh) / Math.max(1, tf), files: rows.map(({ f, pct, fpct }) => ({ file: f, lines: pct, functions: fpct })) }, null, 1));
console.log(`\nReport: coverage/merged/index.html`);
