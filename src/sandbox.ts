/**
 * Dev-only visual sandbox (sandbox.html):
 *   ?view=workshop  the workshop with a keyboard on the bench (see src/sandbox/workshop.ts for options)
 *   ?view=caps      every keycap profile, rows R1–R4 + wide keys
 *   ?view=board2    a keyboard on a plain ground (layout, case, sw, kc, profile, parts…)
 *   ?view=envgen    builds public/assets/env/workshop.env (used by tests/e2e/make_env.cjs)
 */
const q = new URLSearchParams(location.search);
const canvas = document.getElementById("c") as HTMLCanvasElement;
const view = q.get("view") ?? "workshop";
if (view === "workshop") void import("./sandbox/workshop").then((m) => m.run(canvas, q));
else if (view === "envgen") void import("./sandbox/envgen").then((m) => m.run(canvas));
else void import("./sandbox/art").then((m) => m.run(canvas, q));
