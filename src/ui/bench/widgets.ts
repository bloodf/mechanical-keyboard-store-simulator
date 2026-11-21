import type { SoundMods } from "../../data/parts";
import { formatMoney, t, tx, type MessageKey } from "../../i18n";
import { h } from "../dom";

/** "deeper", "less ping"… from a part's sound modifiers. */
export function effectTags(m: SoundMods | undefined): HTMLElement | null {
  if (!m) return null;
  const tags: string[] = [];
  const add = (axis: keyof SoundMods, min = 0.035) => {
    const v = m[axis] ?? 0;
    if (Math.abs(v) < min) return;
    const dir = v > 0 ? "up" : "down";
    const key = `effect.${axis}.${dir}`;
    if (["effect.scratch.up", "effect.click.down", "effect.rattle.up", "effect.rattle.down"].includes(key)) return;
    tags.push(t(key as MessageKey));
  };
  (["depth", "brightness", "hollow", "volume", "scratch", "click"] as const).forEach((a) => add(a));
  if (!tags.length) return null;
  return h("span", { class: "tags" }, ...tags.map((x) => h("span", { class: "tag" }, x)));
}

export interface CardOpts {
  title: string;
  sub?: string | null;
  price?: number | null;
  priceText?: string;
  tags?: HTMLElement | null;
  selected?: boolean;
  lockedAt?: number | null; // builds needed
  swatch?: string[];
  onClick: () => void;
  testId?: string;
}

export function partCard(o: CardOpts): HTMLButtonElement {
  const locked = o.lockedAt !== null && o.lockedAt !== undefined;
  return h(
    "button",
    {
      class: `pcard${o.selected ? " selected" : ""}${locked ? " locked" : ""}`,
      disabled: locked,
      "aria-pressed": o.selected ? "true" : "false",
      "data-test": o.testId,
      onclick: o.onClick,
    },
    o.swatch ? h("span", { class: "swatches" }, ...o.swatch.map((c) => h("span", { class: "sw", style: `background:${c}` }))) : null,
    h("span", { class: "pc-title" }, o.title),
    o.sub ? h("span", { class: "pc-sub" }, o.sub) : null,
    o.tags ?? null,
    h(
      "span",
      { class: "pc-price" },
      locked ? t("bench.locked", { count: o.lockedAt! }) : (o.priceText ?? (o.price ? formatMoney(o.price) : t("bench.free"))),
    ),
  );
}

export function section(titleKey: MessageKey | null, ...children: (HTMLElement | null)[]): HTMLElement {
  return h("div", { class: "psection" }, titleKey ? h("h4", {}, t(titleKey)) : null, h("div", { class: "pgrid" }, ...children));
}

export function pill(label: string, selected: boolean, onClick: () => void, testId?: string): HTMLButtonElement {
  return h("button", { class: `pill${selected ? " selected" : ""}`, "aria-pressed": selected ? "true" : "false", "data-test": testId, onclick: onClick }, label);
}

export { tx };
