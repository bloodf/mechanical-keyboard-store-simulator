/** Job board: pick a customer request (shown as pinned tickets), or skip it. */
import { generateJob } from "../build/jobs";
import type { JobRequest } from "../build/types";
import type { GameState } from "../core/state";
import type { Catalog } from "../data/catalog";
import { formatMoney, t, type MessageKey } from "../i18n";
import { C, R, S, T } from "../gui/theme";
import type { Ui } from "../gui/ui";
import { button, chip, group, H_CENTER, label, panel, stack, V_BOTTOM, V_CENTER } from "../gui/widgets";
import { chipsWrap, quoteText, wantsList } from "./bench/ticket";

export function ensureBoard(s: GameState, cat: Catalog, builds: number) {
  while (s.jobBoard.length < 3) s.jobBoard.push(generateJob(s.seed, s.jobsIssued++, cat, builds));
}

export function openJobBoard(ui: Ui, o: { state: GameState; catalog: Catalog; builds: number; persist: () => void; onTake: (job: JobRequest) => void; onClose: () => void }) {
  ensureBoard(o.state, o.catalog, o.builds);
  o.persist();
  let page = 0;
  const busy = !!o.state.activeBuild;
  ui.modal({ w: 1040, h: 560, name: "job-board", dismissable: true, onClose: o.onClose }, (p, close) => {
    const render = () => {
      p.clearControls();
      p.background = "#c89a62";
      p.addControl(label(`📌 ${t("board.title")}`, { size: T.h1, weight: 700, color: C.white, outline: "rgba(60,30,10,0.5)", outlineWidth: 4, align: H_CENTER, y: S.lg, h: 44 }));
      p.addControl(label(busy ? t("board.busy") : t("board.subtitle"), { size: T.body, weight: 600, color: "#fff3df", align: H_CENTER, y: 62, h: 24 }));
      const jobs = o.state.jobBoard;
      const per = ui.portrait ? 1 : 3;
      const cardW = ui.portrait ? Math.min(360, ui.W - 100) : 300;
      const cardH = 380;
      const shown = jobs.slice(page * per, page * per + per);
      const row = stack({ horizontal: true, h: cardH, spacing: S.lg, y: 98, ha: H_CENTER });
      shown.forEach((job, k) => {
        const i = page * per + k;
        const card = panel({ w: cardW, h: cardH, bg: ["#fff6c9", "#ffe2ec", "#dff3ff"][i % 3], radius: R.sm, name: `job-${i}` });
        card.rotation = (k - 1) * 0.012;
        const inner = cardW - 2 * S.lg;
        const col = stack({ w: inner, x: S.lg, y: S.lg, spacing: S.xs });
        col.addControl(label(job.customer.name, { size: T.h3, weight: 700 }));
        col.addControl(chip(t(`persona.${job.customer.persona}` as MessageKey), { bg: "rgba(0,0,0,0.08)", size: T.tiny + 1, h: 24 }));
        col.addControl(label(`“${quoteText(job)}”`, { size: T.small, italic: true, wrap: true, h: 150 }));
        col.addControl(chipsWrap(wantsList(job), inner));
        card.addControl(col);
        const foot = group({ w: inner, h: 46, x: S.lg, y: -S.lg, va: V_BOTTOM });
        foot.addControl(label(formatMoney(job.budget), { size: T.h3, weight: 700, color: C.good, va: V_CENTER }));
        const btns = stack({ horizontal: true, h: 44, spacing: S.xs, ha: 1 });
        btns.addControl(button(t("board.skip"), { w: 76, h: 42, size: "sm", testId: `skip-${i}`, onClick: () => (jobs.splice(i, 1), ensureBoard(o.state, o.catalog, o.builds), o.persist(), render()) }));
        btns.addControl(button(t("board.take"), { w: 104, h: 42, size: "sm", variant: "primary", disabled: busy, testId: `take-${i}`, onClick: () => (jobs.splice(i, 1), ensureBoard(o.state, o.catalog, o.builds), close(), o.onTake(job)) }));
        foot.addControl(btns);
        card.addControl(foot);
        row.addControl(card);
      });
      p.addControl(row);
      if (per < jobs.length) {
        const pages = Math.ceil(jobs.length / per);
        const nav = stack({ horizontal: true, h: 44, spacing: S.md, y: -S.md, ha: H_CENTER, va: V_BOTTOM });
        nav.addControl(button("◀", { w: 60, h: 40, size: "sm", onClick: () => ((page = (page - 1 + pages) % pages), render()) }));
        nav.addControl(button("▶", { w: 60, h: 40, size: "sm", onClick: () => ((page = (page + 1) % pages), render()) }));
        p.addControl(nav);
      } else {
        p.addControl(button(t("board.close"), { w: 160, h: 46, size: "sm", y: -S.md, ha: H_CENTER, va: V_BOTTOM, testId: "jobs-close", onClick: close }));
      }
      const st = o.state.stats;
      p.addControl(label(t("board.stats", { built: st.keyboardsBuilt, perfect: st.perfectBuilds, profit: formatMoney(st.totalProfit) }), { size: T.tiny, weight: 600, color: "#fff3df", align: 1, x: -S.lg, y: -S.lg, va: V_BOTTOM, h: 18, w: 400, ha: 1 }));
    };
    render();
  });
}
