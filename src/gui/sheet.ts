/** Big panels for the workshop screens (orders, stock, suppliers, mail): header + body, scroll lists. */
import { Container, Rectangle, ScrollViewer, StackPanel } from "@babylonjs/gui";
import { C, S, T } from "./theme";
import type { Ui } from "./ui";
import { button, group, H_RIGHT, label, place } from "./widgets";

export interface SheetArea {
  w: number;
  h: number;
}

/**
 * A large modal sheet. `build` fills the body and can be called again via the returned `render`
 * (e.g. after a purchase). Returns { close, render }.
 */
export function openSheet(
  ui: Ui,
  o: { name: string; title: () => string; w?: number; h?: number; onClose?: () => void },
  build: (body: Container, area: SheetArea, rerender: () => void, close: () => void) => void,
): { close: () => void; render: () => void } {
  let body: Container | null = null;
  let titleLbl: ReturnType<typeof label> | null = null;
  let area: SheetArea = { w: 0, h: 0 };
  let closeFn: () => void = () => {};
  const render = () => {
    if (!body) return;
    body.clearControls();
    if (titleLbl) titleLbl.text = o.title();
    build(body, area, render, closeFn);
  };
  const w = Math.min(o.w ?? 1160, ui.W - 24);
  const h = Math.min(o.h ?? 700, ui.H - 24);
  closeFn = ui.modal({ w, h, name: o.name, dismissable: true, onClose: o.onClose }, (p, close) => {
    p.background = C.paper;
    titleLbl = label(o.title(), { size: ui.portrait ? T.h3 : T.h2, weight: 700, x: S.xl, y: S.lg, h: 36, w: w - 100, ellipsis: true });
    p.addControl(titleLbl);
    p.addControl(button("✕", { w: 44, h: 40, size: "sm", x: -S.lg, y: S.md, ha: H_RIGHT, testId: `${o.name}-close`, onClick: close }));
    area = { w: w - 2 * S.xl, h: h - 64 - S.lg };
    body = group({ w: area.w, h: area.h, x: S.xl, y: 64 });
    p.addControl(body);
    closeFn = close;
    render();
  });
  return { close: () => closeFn(), render };
}

/** Vertical scroll list: add rows to `content`. */
export function scrollList(w: number, h: number, name?: string): { viewer: ScrollViewer; content: StackPanel } {
  const sv = new ScrollViewer(name);
  place(sv, { w, h });
  sv.thickness = 0;
  sv.barSize = 10;
  sv.barColor = C.inkFaint;
  sv.barBackground = "transparent";
  sv.wheelPrecision = 0.04;
  const content = new StackPanel();
  content.width = `${w - 16}px`;
  content.isVertical = true;
  content.spacing = S.sm;
  content.horizontalAlignment = 0;
  content.verticalAlignment = 0;
  sv.addControl(content);
  return { viewer: sv, content };
}

/** Small round count badge (e.g. unread mail) to overlay on a button's corner. */
export function badge(n: number, o: { x?: number; y?: number; name?: string } = {}): Rectangle {
  const circle = new Rectangle(o.name);
  circle.width = "24px";
  circle.height = "24px";
  circle.cornerRadius = 12;
  circle.thickness = 0;
  circle.background = C.bad;
  circle.isHitTestVisible = false;
  circle.isPointerBlocker = false;
  circle.horizontalAlignment = 1;
  circle.verticalAlignment = 0;
  circle.left = `${o.x ?? 6}px`;
  circle.top = `${o.y ?? -6}px`;
  circle.addControl(label(String(n), { size: T.tiny, weight: 700, color: C.white, align: 2, w: 24, h: 24 }));
  return circle;
}

export interface GridButton {
  text: string;
  active: boolean;
  testId: string;
  onClick: () => void;
}

/** A row of toggle buttons that wraps onto more rows on narrow screens. Returns the control and its height. */
export function buttonGrid(items: GridButton[], width: number, o: { h?: number; minW?: number; maxW?: number; gap?: number; y?: number } = {}): { control: Container; height: number } {
  const h = o.h ?? 38;
  const gap = o.gap ?? 6;
  const minW = o.minW ?? 96;
  const perRow = Math.max(1, Math.min(items.length, Math.floor((width + gap) / (minW + gap))));
  const rows = Math.ceil(items.length / perRow);
  const bw = Math.min(o.maxW ?? 140, (width - gap * (perRow - 1)) / perRow);
  const c = group({ w: width, h: rows * h + (rows - 1) * gap, y: o.y ?? 0 });
  items.forEach((it, i) => {
    const b = button(it.text, { w: bw, h, size: "sm", variant: it.active ? "dark" : "secondary", testId: it.testId, onClick: it.onClick });
    b.left = `${(i % perRow) * (bw + gap)}px`;
    b.top = `${Math.floor(i / perRow) * (h + gap)}px`;
    c.addControl(b);
  });
  return { control: c, height: rows * h + (rows - 1) * gap };
}
