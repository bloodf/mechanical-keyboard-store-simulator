/** Mail: welcome letter, client reviews and complaints, membrane customers' replies. */
import { formatClock, inbox } from "../../build/workshop";
import type { GameState, Mail } from "../../core/state";
import { t, tx, type MessageKey } from "../../i18n";
import { openSheet, scrollList } from "../../gui/sheet";
import { C, R, S, T } from "../../gui/theme";
import type { Ui } from "../../gui/ui";
import { clickable, label, panel, stack } from "../../gui/widgets";

export function mailFrom(m: Mail): string {
  return m.from.startsWith("@") ? t(m.from.slice(1) as MessageKey) : m.from;
}

export function mailSubject(m: Mail): string {
  if (m.kind === "review") return t("mail.subject.review", { stars: "★".repeat(m.stars ?? 0) + "☆".repeat(5 - (m.stars ?? 0)) });
  return t(`mail.subject.${m.kind}` as MessageKey);
}

export function openMail(ui: Ui, o: { state: GameState; persist: () => void; onChanged: () => void }) {
  const s = o.state;
  let open: string | null = inbox(s).find((m) => !m.read)?.id ?? inbox(s)[0]?.id ?? null;
  return openSheet(ui, { name: "mail", title: () => `✉️ ${t("mail.title")}` }, (body, area, rerender) => {
    const list = inbox(s);
    const cur = list.find((x) => x.id === open);
    if (cur && !cur.read && !ui.portrait) {
      cur.read = true;
      o.persist();
      o.onChanged();
    }
    const leftW = ui.portrait ? area.w : Math.min(380, area.w * 0.4);
    const { viewer, content } = scrollList(leftW, area.h, "mail-list");
    body.addControl(viewer);
    if (!list.length) content.addControl(label(t("mail.empty"), { size: T.body, color: C.inkSoft, h: 40 }));
    list.forEach((m, i) => {
      const sel = m.id === open;
      const r = panel({ w: leftW - 24, h: 62, radius: R.sm, bg: sel ? "#fff3ea" : C.white, shadow: false, border: sel ? C.accent : C.line, thickness: sel ? 2 : 1, name: `mail-${i}` });
      r.addControl(label(`${m.read ? "" : "● "}${mailFrom(m)}`, { size: T.small, weight: 700, x: S.md, y: 6, h: 22, w: leftW - 130, color: m.read ? C.ink : C.accentDark }));
      r.addControl(label(`${t("hud.day", { day: Math.floor(m.at / 1440) + 1 })} · ${formatClock(m.at % 1440)}`, { size: T.tiny, color: C.inkFaint, x: -S.md, y: 6, h: 22, w: 110, align: 1, ha: 1 }));
      r.addControl(label(mailSubject(m), { size: T.small, color: C.inkSoft, x: S.md, y: 32, h: 22, w: leftW - 60 }));
      clickable(r, () => {
        open = m.id;
        if (!m.read) {
          m.read = true;
          o.persist();
          o.onChanged();
        }
        rerender();
      });
      content.addControl(r);
    });
    const m = list.find((x) => x.id === open);
    if (m && !ui.portrait) {
      const p = panel({ w: area.w - leftW - S.lg, h: area.h, x: leftW + S.lg, radius: R.md, bg: C.white, shadow: false, border: C.line, thickness: 1, name: "mail-open" });
      const col = stack({ w: area.w - leftW - S.lg - 2 * S.xl, x: S.xl, y: S.xl, spacing: S.sm });
      col.addControl(label(mailSubject(m), { size: T.h2, weight: 700, h: 36, color: m.kind === "complaint" || m.kind === "cancelled" ? C.bad : C.ink }));
      col.addControl(label(`${mailFrom(m)} · ${t("hud.day", { day: Math.floor(m.at / 1440) + 1 })} ${formatClock(m.at % 1440)}`, { size: T.small, color: C.inkSoft, h: 22 }));
      if (m.stars) col.addControl(label("★".repeat(m.stars) + "☆".repeat(5 - m.stars), { size: 34, weight: 700, color: C.gold, h: 44 }));
      col.addControl(label(tx(m.key, m.params), { size: T.body + 1, wrap: true, lineSpacing: 4, h: area.h - 160, valign: 0 }));
      p.addControl(col);
      body.addControl(p);
    }
  });
}
