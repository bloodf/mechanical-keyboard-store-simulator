/**
 * In-canvas widget kit built on Babylon GUI. Everything is sized in "ideal pixels"
 * (the Ui class scales the whole tree to the screen). Interactive controls get a stable
 * name (testId) so automated tests can find and click them with a real mouse.
 */
import {
  Container,
  Control,
  Ellipse,
  InputText,
  Rectangle,
  Slider,
  StackPanel,
  TextBlock,
} from "@babylonjs/gui";
import type { ICanvasRenderingContext } from "@babylonjs/core";
import { play } from "../audio/engine";
import { C, FONT, R, S, T } from "./theme";

export const H_LEFT = Control.HORIZONTAL_ALIGNMENT_LEFT;
export const H_CENTER = Control.HORIZONTAL_ALIGNMENT_CENTER;
export const H_RIGHT = Control.HORIZONTAL_ALIGNMENT_RIGHT;
export const V_TOP = Control.VERTICAL_ALIGNMENT_TOP;
export const V_CENTER = Control.VERTICAL_ALIGNMENT_CENTER;
export const V_BOTTOM = Control.VERTICAL_ALIGNMENT_BOTTOM;

let uid = 0;
const nextName = (p: string) => `${p}-${++uid}`;

export interface Box {
  w?: number | string;
  h?: number | string;
  x?: number;
  y?: number;
  ha?: number;
  va?: number;
}
export function place<T extends Control>(c: T, b: Box): T {
  if (b.w !== undefined) c.width = typeof b.w === "number" ? `${b.w}px` : b.w;
  if (b.h !== undefined) c.height = typeof b.h === "number" ? `${b.h}px` : b.h;
  if (b.x !== undefined) c.left = `${b.x}px`;
  if (b.y !== undefined) c.top = `${b.y}px`;
  c.horizontalAlignment = b.ha ?? H_LEFT;
  c.verticalAlignment = b.va ?? V_TOP;
  return c;
}

// ---------------- Panels ----------------
export interface PanelOpts extends Box {
  bg?: string;
  radius?: number;
  shadow?: boolean;
  border?: string;
  thickness?: number;
  name?: string;
  block?: boolean; // blocks pointer events from reaching the 3D scene (default true)
}
export function panel(o: PanelOpts = {}): Rectangle {
  const r = new Rectangle(o.name ?? nextName("panel"));
  r.background = o.bg ?? C.paper;
  r.cornerRadius = o.radius ?? R.lg;
  r.thickness = o.thickness ?? (o.border ? 2 : 0);
  r.color = o.border ?? "transparent";
  if (o.shadow !== false) {
    r.shadowColor = C.shadow;
    r.shadowBlur = 22;
    r.shadowOffsetY = 8;
  }
  r.isPointerBlocker = o.block ?? true;
  place(r, { w: o.w ?? "100%", h: o.h ?? "100%", ...o });
  return r;
}

/** Invisible layout container. */
export function group(o: Box & { name?: string } = {}): Container {
  const c = new Container(o.name ?? nextName("group"));
  c.isHitTestVisible = false; // layout only: children still get pointer events
  place(c, { w: o.w ?? "100%", h: o.h ?? "100%", ...o });
  return c;
}

export function stack(o: Box & { horizontal?: boolean; spacing?: number; name?: string } = {}): StackPanel {
  const s = new StackPanel(o.name ?? nextName("stack"));
  s.isVertical = !o.horizontal;
  s.spacing = o.spacing ?? S.sm;
  s.ignoreLayoutWarnings = true;
  s.isHitTestVisible = false;
  place(s, { w: o.w ?? (o.horizontal ? undefined : "100%"), h: o.h ?? (o.horizontal ? "100%" : undefined), ...o });
  if (o.horizontal && o.w === undefined) s.adaptWidthToChildren = true;
  if (!o.horizontal && o.h === undefined) s.adaptHeightToChildren = true;
  return s;
}

// ---------------- Text ----------------
export interface LabelOpts extends Box {
  size?: number;
  weight?: 400 | 500 | 600 | 700;
  color?: string;
  align?: number;
  valign?: number;
  wrap?: boolean;
  italic?: boolean;
  outline?: string;
  outlineWidth?: number;
  name?: string;
  lineSpacing?: number;
  /** Wrap within a fixed height and end with "…" if it doesn't fit. */
  ellipsis?: boolean;
}
export function label(text: string, o: LabelOpts = {}): TextBlock {
  const t = new TextBlock(o.name ?? nextName("label"), text);
  t.fontFamily = FONT;
  t.fontSize = o.size ?? T.body;
  t.fontWeight = String(o.weight ?? 500);
  t.fontStyle = o.italic ? "italic" : "normal";
  t.color = o.color ?? C.ink;
  t.textHorizontalAlignment = o.align ?? H_LEFT;
  t.textVerticalAlignment = o.valign ?? V_CENTER;
  if (o.outline) {
    t.outlineColor = o.outline;
    t.outlineWidth = o.outlineWidth ?? 4;
  }
  if (o.lineSpacing) t.lineSpacing = `${o.lineSpacing}px`;
  if (o.ellipsis) {
    t.textWrapping = 3 as unknown as boolean; // TextWrapping.WordWrapEllipsis
  } else if (o.wrap) {
    t.textWrapping = true;
    if (o.h === undefined) t.resizeToFit = true;
  }
  t.isPointerBlocker = false;
  t.isHitTestVisible = false; // plain text never swallows clicks
  place(t, { w: o.w ?? "100%", h: o.h ?? (o.wrap ? undefined : Math.round((o.size ?? T.body) * 1.45)), ...o });
  return t;
}

// ---------------- Buttons ----------------
export type Variant = "primary" | "secondary" | "danger" | "ghost" | "dark" | "good";
const VARIANT: Record<Variant, { face: string; base: string; text: string; hover: string }> = {
  primary: { face: C.accent, base: C.accentDark, text: C.white, hover: "#ff8c5e" },
  secondary: { face: C.paper, base: "#d8c8b0", text: C.ink, hover: "#fff3e6" },
  danger: { face: C.bad, base: C.badDark, text: C.white, hover: "#ee5466" },
  ghost: { face: "transparent", base: "transparent", text: C.inkSoft, hover: "rgba(0,0,0,0.05)" },
  dark: { face: C.darkSoft, base: C.dark, text: C.white, hover: "#4a3d33" },
  good: { face: C.good, base: "#1f7a3a", text: C.white, hover: "#3bb46a" },
};

export interface ButtonOpts extends Box {
  variant?: Variant;
  size?: "lg" | "md" | "sm";
  testId?: string;
  disabled?: boolean;
  sub?: string; // second smaller line
  sound?: boolean;
  onClick?: () => void;
}

/** Chunky keycap button: a darker base with a face that presses down. */
export class KeyButton extends Rectangle {
  readonly face: Rectangle;
  readonly text: TextBlock;
  readonly subText: TextBlock | null;
  private v: (typeof VARIANT)[Variant];
  private _disabled = false;
  private depth: number;
  onClick: (() => void) | undefined;

  constructor(text: string, o: ButtonOpts = {}) {
    super(o.testId ?? nextName("btn"));
    const size = o.size ?? "md";
    const h = size === "lg" ? 64 : size === "md" ? 52 : 40;
    this.depth = size === "sm" ? 4 : 6;
    this.v = VARIANT[o.variant ?? "secondary"];
    this.thickness = 0;
    this.cornerRadius = size === "sm" ? R.sm : R.md;
    this.background = this.v.base;
    this.isPointerBlocker = true;
    place(this, { w: o.w ?? 160, h: o.h ?? h, ...o });
    if (o.variant !== "ghost") {
      this.shadowColor = "rgba(40,25,10,0.16)";
      this.shadowBlur = 10;
      this.shadowOffsetY = 4;
    }
    this.face = new Rectangle(`${this.name}-face`);
    this.face.thickness = 0;
    this.face.cornerRadius = this.cornerRadius;
    this.face.background = this.v.face;
    this.face.height = `${(typeof o.h === "number" ? o.h : h) - this.depth}px`;
    this.face.verticalAlignment = V_TOP;
    this.face.isPointerBlocker = false;
    this.addControl(this.face);
    const fs = size === "lg" ? 22 : size === "md" ? 18 : 15;
    this.text = label(text, { size: fs, weight: 700, color: this.v.text, align: H_CENTER, h: o.sub ? "60%" : "100%", va: o.sub ? V_TOP : V_CENTER });
    this.text.textVerticalAlignment = o.sub ? V_BOTTOM : V_CENTER;
    this.face.addControl(this.text);
    this.subText = null;
    if (o.sub) {
      this.subText = label(o.sub, { size: fs - 5, weight: 500, color: this.v.text, align: H_CENTER, h: "40%", va: V_BOTTOM });
      this.subText.alpha = 0.85;
      this.subText.textVerticalAlignment = V_TOP;
      this.face.addControl(this.subText);
    }
    this.onClick = o.onClick;
    this.onPointerEnterObservable.add(() => {
      if (this._disabled) return;
      if (this.v !== VARIANT.ghost) this.face.background = this.v.hover;
      else this.face.background = this.v.hover;
      play("ui.hover");
    });
    this.onPointerOutObservable.add(() => {
      this.face.background = this.v.face;
      this.face.top = "0px";
    });
    this.onPointerDownObservable.add(() => {
      if (this._disabled) return;
      this.face.top = `${this.depth - 1}px`;
      if (o.sound !== false) play("ui.click");
    });
    this.onPointerUpObservable.add(() => (this.face.top = "0px"));
    // Click = pressed and released on this button.
    this.onPointerClickObservable.add(() => {
      if (!this._disabled) this.onClick?.();
    });
    this.disabled = !!o.disabled;
  }

  get disabled() {
    return this._disabled;
  }
  set disabled(v: boolean) {
    this._disabled = v;
    this.alpha = v ? 0.45 : 1;
    this.hoverCursor = v ? "default" : "pointer";
  }

  setLabel(text: string) {
    this.text.text = text;
  }

  setVariant(variant: Variant) {
    this.v = VARIANT[variant];
    this.background = this.v.base;
    this.face.background = this.v.face;
    this.text.color = this.v.text;
    if (this.subText) this.subText.color = this.v.text;
  }
}

export function button(text: string, o: ButtonOpts = {}): KeyButton {
  return new KeyButton(text, o);
}

// ---------------- Chips, bars, badges ----------------
export function chip(text: string, o: Box & { bg?: string; color?: string; size?: number; name?: string; pad?: number } = {}): Rectangle {
  const size = o.size ?? T.small;
  const pad = o.pad ?? S.md;
  const r = new Rectangle(o.name ?? nextName("chip"));
  r.thickness = 0;
  r.cornerRadius = 999;
  r.background = o.bg ?? C.paper;
  r.adaptWidthToChildren = o.w === undefined;
  place(r, { h: o.h ?? size + 16, ...o });
  const t = label(text, { size, weight: 700, color: o.color ?? C.ink, align: H_CENTER });
  t.resizeToFit = true;
  t.paddingLeft = `${pad}px`;
  t.paddingRight = `${pad}px`;
  t.width = o.w !== undefined ? "100%" : "";
  r.addControl(t);
  r.isPointerBlocker = false;
  r.isHitTestVisible = false;
  (r as Rectangle & { textBlock?: TextBlock }).textBlock = t;
  return r;
}
export function chipText(c: Rectangle, text: string) {
  const t = (c as Rectangle & { textBlock?: TextBlock }).textBlock;
  if (t) t.text = text;
}

/** Horizontal progress/score bar. */
export function bar(value: number, o: Box & { color?: string; bg?: string; thickness?: number } = {}): Rectangle {
  const h = o.thickness ?? 10;
  const back = new Rectangle(nextName("bar"));
  back.thickness = 0;
  back.cornerRadius = h / 2;
  back.background = o.bg ?? C.paper3;
  back.isHitTestVisible = false;
  place(back, { w: o.w ?? "100%", h, ...o });
  const fill = new Rectangle(nextName("barfill"));
  fill.thickness = 0;
  fill.cornerRadius = h / 2;
  fill.background = o.color ?? C.accent;
  fill.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
  fill.horizontalAlignment = H_LEFT;
  back.addControl(fill);
  return back;
}

/** Divider line */
export function rule(o: Box & { color?: string } = {}): Rectangle {
  const r = new Rectangle(nextName("rule"));
  r.thickness = 0;
  r.background = o.color ?? C.line;
  r.isHitTestVisible = false;
  place(r, { w: o.w ?? "100%", h: o.h ?? 2, ...o });
  return r;
}

// ---------------- Custom drawing ----------------
export type Painter = (g: ICanvasRenderingContext & CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ratio: number) => void;

/** A control that draws itself with a 2D-canvas painter (icons, charts, gauges). */
export class DrawBox extends Control {
  constructor(
    name: string,
    public painter: Painter,
  ) {
    super(name);
    this.isPointerBlocker = false;
    this.isHitTestVisible = false;
  }
  _draw(context: ICanvasRenderingContext) {
    const m = this._currentMeasure;
    context.save();
    this._applyStates(context);
    this.painter(context as ICanvasRenderingContext & CanvasRenderingContext2D, m.left, m.top, m.width, m.height, this._host?.idealRatio ?? 1);
    context.restore();
  }
  /** Call after data changes. */
  redraw() {
    this.markAsDirty();
  }
}
export function drawBox(p: Painter, o: Box & { name?: string } = {}): DrawBox {
  const d = new DrawBox(o.name ?? nextName("draw"), p);
  place(d, { w: o.w ?? "100%", h: o.h ?? "100%", ...o });
  return d;
}

/** Rounded-rect path helper for painters. */
export function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---------------- Inputs ----------------
export function textInput(value: string, o: Box & { maxLength: number; placeholder?: string; testId?: string; onChange?: (v: string) => void }): InputText {
  const i = new InputText(o.testId ?? nextName("input"), value);
  i.fontFamily = FONT;
  i.fontSize = T.h3;
  i.fontWeight = "600";
  i.color = C.ink;
  i.background = C.white;
  i.focusedBackground = C.white;
  i.focusedColor = C.ink;
  i.thickness = 3;
  i.placeholderText = o.placeholder ?? "";
  i.placeholderColor = C.inkFaint;
  i.textHighlightColor = C.accentSoft;
  i.margin = "12px";
  i.autoStretchWidth = false;
  (i as unknown as { outlineColor: string }).outlineColor = "transparent";
  place(i, { w: o.w ?? "100%", h: o.h ?? 50, ...o });
  i.color = C.ink;
  i.onFocusObservable.add(() => (i.color = C.ink));
  i.onTextChangedObservable.add(() => {
    if (i.text.length > o.maxLength) i.text = i.text.slice(0, o.maxLength);
    o.onChange?.(i.text);
  });
  i.promptMessage = o.placeholder ?? "";
  return i;
}

export function slider(value: number, o: Box & { testId?: string; onChange: (v: number) => void }): Slider {
  const s = new Slider(o.testId ?? nextName("slider"));
  s.minimum = 0;
  s.maximum = 100;
  s.value = Math.round(value * 100);
  s.step = 1;
  s.color = C.accent;
  s.background = C.paper3;
  s.borderColor = "transparent";
  s.thumbColor = C.white;
  s.isThumbCircle = true;
  s.thumbWidth = "28px";
  s.barOffset = "10px";
  s.displayThumb = true;
  s.shadowColor = "rgba(0,0,0,0.18)";
  s.shadowBlur = 6;
  s.onValueChangedObservable.add((v) => o.onChange(v / 100));
  place(s, { w: o.w ?? "100%", h: o.h ?? 36, ...o });
  return s;
}

/** ◀ value ▶ picker (avatar editor etc.). */
export function stepper(values: string[], index: number, o: Box & { testId: string; onChange: (i: number) => void; format?: (i: number) => string }): Container {
  const c = group({ w: o.w ?? 260, h: o.h ?? 48, x: o.x, y: o.y, ha: o.ha, va: o.va, name: o.testId });
  let i = index;
  const text = label((o.format ?? ((k) => values[k]))(i), { size: T.body, weight: 700, align: H_CENTER, w: "100%", h: "100%" });
  const set = (d: number) => {
    i = (i + d + values.length) % values.length;
    text.text = (o.format ?? ((k) => values[k]))(i);
    o.onChange(i);
  };
  const bg = panel({ w: "100%", h: "100%", bg: C.white, radius: R.md, shadow: false, border: C.line, thickness: 2 });
  c.addControl(bg);
  c.addControl(text);
  c.addControl(button("◀", { w: 44, h: 40, size: "sm", x: 4, va: V_CENTER, testId: `${o.testId}-prev`, onClick: () => set(-1) }));
  c.addControl(button("▶", { w: 44, h: 40, size: "sm", x: -4, ha: H_RIGHT, va: V_CENTER, testId: `${o.testId}-next`, onClick: () => set(1) }));
  return c;
}

/** A round color swatch button. */
export function swatch(hex: string, selected: boolean, o: Box & { testId?: string; size?: number; onClick: () => void }): Ellipse {
  const size = o.size ?? 36;
  const e = new Ellipse(o.testId ?? nextName("swatch"));
  e.background = hex;
  e.thickness = selected ? 4 : 2;
  e.color = selected ? C.accent : "rgba(0,0,0,0.18)";
  place(e, { w: size, h: size, ...o });
  e.isPointerBlocker = true;
  e.hoverCursor = "pointer";
  e.onPointerClickObservable.add(() => {
    play("ui.toggle");
    o.onClick();
  });
  return e;
}

/** Simple clickable rectangle area with hover feedback (used by tiles). */
export function clickable(r: Rectangle, onClick: () => void, hoverBg?: string) {
  const base = r.background;
  r.isPointerBlocker = true;
  r.hoverCursor = "pointer";
  r.onPointerEnterObservable.add(() => {
    if (hoverBg) r.background = hoverBg;
    play("ui.hover");
  });
  r.onPointerOutObservable.add(() => {
    if (hoverBg) r.background = base;
  });
  r.onPointerClickObservable.add(() => onClick());
  r.onPointerDownObservable.add(() => play("ui.click"));
}
