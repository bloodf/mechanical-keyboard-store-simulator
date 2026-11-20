import en from "./locales/en";

type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
type Entry = string | PluralForms;
export type MessageKey = keyof typeof en;
/** Shape every locale must satisfy: same keys as English. */
export type Messages = { [K in MessageKey]: Entry };

const locales: Record<string, Messages> = { en };
let current = "en";
let messages: Messages = en;
let plural = new Intl.PluralRules(current);

export function setLocale(code: string) {
  const base = code.split("-")[0];
  const found = locales[code] ? code : locales[base] ? base : "en";
  current = found;
  messages = locales[found];
  plural = new Intl.PluralRules(found);
  document.documentElement.lang = found;
  applyDomTranslations();
}

export function getLocale() {
  return current;
}

export type Params = Record<string, string | number>;

/** Translate. Pass `count` in params for plural entries. Missing keys render visibly. */
export function t(key: MessageKey, params: Params = {}): string {
  const entry: Entry | undefined = messages[key] ?? (en as Messages)[key];
  if (entry === undefined) return `⟦${key}⟧`;
  let str: string;
  if (typeof entry === "string") {
    str = entry;
  } else {
    const n = Number(params.count ?? 0);
    // "two" etc. are used for jokes even in English, so allow exact-number forms first.
    const exact = n === 1 ? entry.one : n === 2 ? entry.two : undefined;
    str = exact ?? entry[plural.select(n)] ?? entry.other;
  }
  return str.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat(current, { style: "currency", currency: "USD" }).format(cents / 100);
}

export function formatNumber(n: number, digits = 0): string {
  return new Intl.NumberFormat(current, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

/** Fill elements marked with data-i18n="key" (used for static HTML). */
export function applyDomTranslations(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n as MessageKey);
  });
}

export function allKeys(): MessageKey[] {
  return Object.keys(en) as MessageKey[];
}
