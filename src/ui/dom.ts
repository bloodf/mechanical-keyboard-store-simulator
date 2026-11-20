type Child = Node | string | null | undefined | false;

/** Tiny hyperscript helper: h("button", { class: "btn", onclick }, "Text"). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2), v as EventListener);
    } else if (k === "class") {
      el.className = String(v);
    } else if (k === "dataset") {
      Object.assign(el.dataset, v);
    } else {
      el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function uiRoot(): HTMLElement {
  return document.getElementById("ui")!;
}

export function clearUi() {
  uiRoot().replaceChildren();
}

export function toast(text: string, kind: "info" | "error" = "info") {
  const el = h("div", { class: `toast toast-${kind}`, role: "status" }, text);
  document.body.append(el);
  setTimeout(() => el.classList.add("out"), 1600);
  setTimeout(() => el.remove(), 2100);
}
