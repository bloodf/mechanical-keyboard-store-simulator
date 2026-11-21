/** The customer's job ticket (quote, wishes, bill, live sound preview). */
import type { Control } from "@babylonjs/gui";
import { play } from "../../audio/engine";
import { computeProfile, partsCost, soundMatch, targetRanges } from "../../build/profile";
import type { BuildSession, JobRequest } from "../../build/types";
import type { Catalog } from "../../data/catalog";
import { formatMoney, t, tx, type MessageKey } from "../../i18n";
import { C, R, S, T } from "../../gui/theme";
import { button, chip, drawBox, group, H_RIGHT, label, panel, stack } from "../../gui/widgets";
import { radarPainter } from "./radar";

export function quoteText(job: JobRequest): string {
  return job.quote.map((q) => tx(q.key, q.params)).join(" ");
}

export function wantsList(job: JobRequest): string[] {
  const out: string[] = [];
  out.push(job.layout.kind === "exact" ? t(`layout.name.${job.layout.id}` as MessageKey) : t(`req.layout.${job.layout.kind}` as MessageKey));
  out.push(job.sound.map((w) => t(`sound.word.${w}` as MessageKey)).join(" + "));
  if (job.feel !== "any") out.push(t(`feel.${job.feel}` as MessageKey));
  const th = job.theme;
  out.push(
    th.kind === "any"
      ? t("req.theme.any")
      : tx(`req.theme.${th.kind}`, { ...(th.kind !== "hue" ? { family: `@color.family.${th.family}` } : {}), ...(th.kind !== "family" ? { hue: `@color.hue.${th.hue}` } : {}) }),
  );
  if (job.picky > 0.7) out.push(`⚠ ${t("req.picky")}`);
  return out;
}

/** Chips that wrap onto rows within width w. */
export function chipsWrap(items: string[], w: number): Control {
  const approx = (s: string) => 26 + s.length * 7.6;
  const rows: string[][] = [[]];
  let x = 0;
  for (const s of items) {
    const cw = approx(s);
    if (x + cw > w && rows[rows.length - 1].length) {
      rows.push([]);
      x = 0;
    }
    rows[rows.length - 1].push(s);
    x += cw + 6;
  }
  const col = stack({ w, spacing: 6 });
  for (const r of rows) {
    const row = stack({ horizontal: true, h: 28, spacing: 6 });
    for (const s of r) row.addControl(chip(s, { bg: "#fff1d6", size: T.tiny + 1, h: 28 }));
    col.addControl(row);
  }
  return col;
}

export function ticketPanel(job: JobRequest, b: BuildSession | null, cat: Catalog, o: { w: number; h: number; onHide?: () => void; withRadar?: boolean }): Control {
  const p = panel({ w: o.w, h: o.h, radius: R.lg, name: "ticket" });
  const inner = o.w - 2 * S.lg;
  const col = stack({ w: inner, x: S.lg, y: S.md, spacing: S.xs });
  const head = group({ w: inner, h: 34 });
  head.addControl(label(job.customer.name, { size: T.h3, weight: 700, w: inner - 80, h: 30 }));
  head.addControl(button("🔊", { w: 36, h: 32, size: "sm", ha: H_RIGHT, x: o.onHide ? -40 : 0, testId: "ticket-listen", onClick: () => play("voice.talk", { params: { voice: job.customer.voice } }) }));
  if (o.onHide) head.addControl(button("✕", { w: 36, h: 32, size: "sm", ha: H_RIGHT, testId: "ticket-hide", onClick: o.onHide }));
  col.addControl(head);
  col.addControl(chip(t(`persona.${job.customer.persona}` as MessageKey), { bg: C.paper3, size: T.tiny + 1, h: 24 }));
  col.addControl(label(`“${quoteText(job)}”`, { size: T.small, italic: true, wrap: true, color: C.ink }));
  col.addControl(chipsWrap(wantsList(job), inner));
  if (b) {
    const cost = partsCost(b, cat).total;
    const profit = job.budget - cost;
    const bill = (k: string, v: string, color: string = C.ink) => {
      const r = group({ w: inner, h: 22 });
      r.addControl(label(k, { size: T.small, weight: 600, color: C.inkSoft }));
      r.addControl(label(v, { size: T.small, weight: 700, color, align: 1 }));
      return r;
    };
    col.addControl(bill(t("ticket.budget"), formatMoney(job.budget)));
    col.addControl(bill(t("ticket.parts"), `−${formatMoney(cost)}`));
    col.addControl(bill(t("ticket.profit"), formatMoney(profit), profit >= 0 ? C.good : C.bad));
    if (o.withRadar !== false && b.layout) {
      const m = Math.round(soundMatch(computeProfile(b, cat).sound, job.sound) * 100);
      col.addControl(label(`${t("ticket.sound")} · ${m}%`, { size: T.small, weight: 700, color: C.inkSoft, h: 20 }));
      const rh = Math.min(190, o.h - 400);
      if (rh >= 100) col.addControl(drawBox(radarPainter(() => ({ profile: computeProfile(b, cat).sound, target: targetRanges(job.sound) })), { w: inner, h: rh }));
    }
  } else {
    const r = group({ w: inner, h: 26 });
    r.addControl(label(`${t("ticket.budget")} ${formatMoney(job.budget)}`, { size: T.body, weight: 700, color: C.good }));
    col.addControl(r);
  }
  p.addControl(col);
  return p;
}
