/**
 * Keyboard layouts as key geometry in "u" (1u = one key pitch).
 * Every key has a KeyboardEvent.code so a real keyboard can drive the key tester and sound test.
 */
export type LayoutId = "40" | "60" | "65" | "75" | "tkl" | "full";
export type KeyKind = "alpha" | "mod" | "accent";

export interface KeyGeom {
  id: number;
  label: string;
  code: string; // KeyboardEvent.code ("" if no physical equivalent)
  x: number; // left edge (u)
  y: number; // top edge (u)
  w: number;
  h: number;
  kind: KeyKind;
  rowFromBottom: number; // 0 = spacebar row (used for sculpted profiles)
}

export interface Layout {
  id: LayoutId;
  width: number;
  depth: number;
  keys: KeyGeom[];
}

// Row entry: [label, code, width?, kind?, height?] or a number = horizontal gap.
type E = [string, string, number?, KeyKind?, number?] | number;

const letters = (s: string): E[] => s.split("").map((c) => [c, `Key${c}`]);
const digits: E[] = "1234567890".split("").map((d) => [d, `Digit${d}`]);
const fkeys = (a: number, b: number): E[] => Array.from({ length: b - a + 1 }, (_, i) => [`F${a + i}`, `F${a + i}`]);

const NUM_ROW: E[] = [["`", "Backquote"], ...digits, ["-", "Minus"], ["=", "Equal"], ["⌫", "Backspace", 2, "mod"]];
const NUM_ROW_ESC: E[] = [["Esc", "Escape", 1, "accent"], ...digits, ["-", "Minus"], ["=", "Equal"], ["⌫", "Backspace", 2, "mod"]];
const Q_ROW: E[] = [["Tab", "Tab", 1.5, "mod"], ...letters("QWERTYUIOP"), ["[", "BracketLeft"], ["]", "BracketRight"], ["\\", "Backslash", 1.5, "mod"]];
const A_ROW: E[] = [["Caps", "CapsLock", 1.75, "mod"], ...letters("ASDFGHJKL"), [";", "Semicolon"], ["'", "Quote"], ["Enter", "Enter", 2.25, "accent"]];
const Z_ROW = (rshift: number): E[] => [
  ["Shift", "ShiftLeft", 2.25, "mod"],
  ...letters("ZXCVBNM"),
  [",", "Comma"],
  [".", "Period"],
  ["/", "Slash"],
  ["Shift", "ShiftRight", rshift, "mod"],
];
const SPACE = (w = 6.25): E => ["", "Space", w, "alpha"];
const ARROWS: E[] = [["←", "ArrowLeft", 1, "accent"], ["↓", "ArrowDown", 1, "accent"], ["→", "ArrowRight", 1, "accent"]];

interface RowSpec {
  y: number;
  keys: E[];
}

const SPECS: Record<LayoutId, RowSpec[]> = {
  "40": [
    { y: 0, keys: [["Esc", "Escape", 1, "accent"], ...letters("QWERTYUIOP"), ["⌫", "Backspace", 1.75, "mod"]] },
    { y: 1, keys: [["Tab", "Tab", 1.25, "mod"], ...letters("ASDFGHJKL"), ["Enter", "Enter", 2.5, "accent"]] },
    { y: 2, keys: [["Shift", "ShiftLeft", 1.75, "mod"], ...letters("ZXCVBNM"), [",", "Comma"], [".", "Period"], ["/", "Slash"], ["Shift", "ShiftRight", 1, "mod"]] },
    { y: 3, keys: [["Ctrl", "ControlLeft", 1.25, "mod"], ["Win", "MetaLeft", 1.25, "mod"], ["Alt", "AltLeft", 1.25, "mod"], SPACE(), ["Alt", "AltRight", 1.25, "mod"], ["Fn", "", 1.5, "mod"]] },
  ],
  "60": [
    { y: 0, keys: NUM_ROW_ESC },
    { y: 1, keys: Q_ROW },
    { y: 2, keys: A_ROW },
    { y: 3, keys: Z_ROW(2.75) },
    { y: 4, keys: [["Ctrl", "ControlLeft", 1.25, "mod"], ["Win", "MetaLeft", 1.25, "mod"], ["Alt", "AltLeft", 1.25, "mod"], SPACE(), ["Alt", "AltRight", 1.25, "mod"], ["Win", "MetaRight", 1.25, "mod"], ["Fn", "", 1.25, "mod"], ["Ctrl", "ControlRight", 1.25, "mod"]] },
  ],
  "65": [
    { y: 0, keys: [...NUM_ROW_ESC, ["Del", "Delete", 1, "mod"]] },
    { y: 1, keys: [...Q_ROW, ["PgUp", "PageUp", 1, "mod"]] },
    { y: 2, keys: [...A_ROW, ["PgDn", "PageDown", 1, "mod"]] },
    { y: 3, keys: [...Z_ROW(1.75), ["↑", "ArrowUp", 1, "accent"], ["End", "End", 1, "mod"]] },
    { y: 4, keys: [["Ctrl", "ControlLeft", 1.25, "mod"], ["Win", "MetaLeft", 1.25, "mod"], ["Alt", "AltLeft", 1.25, "mod"], SPACE(), ["Alt", "AltRight", 1, "mod"], ["Fn", "", 1, "mod"], ["Ctrl", "ControlRight", 1, "mod"], ...ARROWS] },
  ],
  "75": [
    { y: 0, keys: [["Esc", "Escape", 1, "accent"], ...fkeys(1, 12), ["PrtSc", "PrintScreen", 1, "mod"], ["Ins", "Insert", 1, "mod"], ["Del", "Delete", 1, "mod"]] },
    { y: 1, keys: [...NUM_ROW, ["Home", "Home", 1, "mod"]] },
    { y: 2, keys: [...Q_ROW, ["PgUp", "PageUp", 1, "mod"]] },
    { y: 3, keys: [...A_ROW, ["PgDn", "PageDown", 1, "mod"]] },
    { y: 4, keys: [...Z_ROW(1.75), ["↑", "ArrowUp", 1, "accent"], ["End", "End", 1, "mod"]] },
    { y: 5, keys: [["Ctrl", "ControlLeft", 1.25, "mod"], ["Win", "MetaLeft", 1.25, "mod"], ["Alt", "AltLeft", 1.25, "mod"], SPACE(), ["Alt", "AltRight", 1, "mod"], ["Fn", "", 1, "mod"], ["Ctrl", "ControlRight", 1, "mod"], ...ARROWS] },
  ],
  tkl: [
    { y: 0, keys: [["Esc", "Escape", 1, "accent"], 1, ...fkeys(1, 4), 0.5, ...fkeys(5, 8), 0.5, ...fkeys(9, 12), 0.25, ["PrtSc", "PrintScreen", 1, "mod"], ["ScrLk", "ScrollLock", 1, "mod"], ["Pause", "Pause", 1, "mod"]] },
    { y: 1.25, keys: [...NUM_ROW, 0.25, ["Ins", "Insert", 1, "mod"], ["Home", "Home", 1, "mod"], ["PgUp", "PageUp", 1, "mod"]] },
    { y: 2.25, keys: [...Q_ROW, 0.25, ["Del", "Delete", 1, "mod"], ["End", "End", 1, "mod"], ["PgDn", "PageDown", 1, "mod"]] },
    { y: 3.25, keys: A_ROW },
    { y: 4.25, keys: [...Z_ROW(2.75), 1.25, ["↑", "ArrowUp", 1, "accent"]] },
    { y: 5.25, keys: [["Ctrl", "ControlLeft", 1.25, "mod"], ["Win", "MetaLeft", 1.25, "mod"], ["Alt", "AltLeft", 1.25, "mod"], SPACE(), ["Alt", "AltRight", 1.25, "mod"], ["Win", "MetaRight", 1.25, "mod"], ["Menu", "ContextMenu", 1.25, "mod"], ["Ctrl", "ControlRight", 1.25, "mod"], 0.25, ...ARROWS] },
  ],
  full: [], // built from TKL + numpad below
};

const NUMPAD: { x: number; y: number; e: E }[] = [
  { x: 0, y: 1.25, e: ["Num", "NumLock", 1, "mod"] },
  { x: 1, y: 1.25, e: ["/", "NumpadDivide", 1, "mod"] },
  { x: 2, y: 1.25, e: ["*", "NumpadMultiply", 1, "mod"] },
  { x: 3, y: 1.25, e: ["-", "NumpadSubtract", 1, "mod"] },
  { x: 0, y: 2.25, e: ["7", "Numpad7"] },
  { x: 1, y: 2.25, e: ["8", "Numpad8"] },
  { x: 2, y: 2.25, e: ["9", "Numpad9"] },
  { x: 3, y: 2.25, e: ["+", "NumpadAdd", 1, "mod", 2] },
  { x: 0, y: 3.25, e: ["4", "Numpad4"] },
  { x: 1, y: 3.25, e: ["5", "Numpad5"] },
  { x: 2, y: 3.25, e: ["6", "Numpad6"] },
  { x: 0, y: 4.25, e: ["1", "Numpad1"] },
  { x: 1, y: 4.25, e: ["2", "Numpad2"] },
  { x: 2, y: 4.25, e: ["3", "Numpad3"] },
  { x: 3, y: 4.25, e: ["Ent", "NumpadEnter", 1, "accent", 2] },
  { x: 0, y: 5.25, e: ["0", "Numpad0", 2] },
  { x: 2, y: 5.25, e: [".", "NumpadDecimal"] },
];

function build(id: LayoutId): Layout {
  const rows = id === "full" ? SPECS.tkl : SPECS[id];
  const keys: KeyGeom[] = [];
  const maxY = rows[rows.length - 1].y;
  const push = (e: Exclude<E, number>, x: number, y: number) => {
    const [label, code, w = 1, kind = "alpha", h = 1] = e;
    keys.push({ id: keys.length, label, code, x, y, w, h, kind, rowFromBottom: Math.round(maxY - y) });
  };
  let width = 0;
  for (const row of rows) {
    let x = 0;
    for (const e of row.keys) {
      if (typeof e === "number") {
        x += e;
        continue;
      }
      push(e, x, row.y);
      x += e[2] ?? 1;
    }
    width = Math.max(width, x);
  }
  if (id === "full") {
    const ox = width + 0.25;
    for (const n of NUMPAD) push(n.e as Exclude<E, number>, ox + n.x, n.y);
    width = ox + 4;
  }
  const depth = Math.max(...keys.map((k) => k.y + k.h));
  return { id, width, depth, keys };
}

const cache = new Map<LayoutId, Layout>();
export function getLayout(id: LayoutId): Layout {
  let l = cache.get(id);
  if (!l) cache.set(id, (l = build(id)));
  return l;
}

export const LAYOUT_IDS: LayoutId[] = ["40", "60", "65", "75", "tkl", "full"];

/** Keys that need stabilizers (2u and wider, or 2u tall). */
export const needsStab = (k: KeyGeom) => k.w >= 2 || k.h >= 2;
