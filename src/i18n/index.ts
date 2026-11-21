import en from "./locales/en";
import { namesEn, type NamePools } from "./locales/en.names";

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
  if (typeof document === "undefined") return;
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

/**
 * Translate a dynamic key (e.g. "part.case." + id). Params starting with "@" are themselves
 * translation keys; a param named "money" is formatted as currency.
 */
export function tx(key: string, params: Record<string, string | number> = {}): string {
  const resolved: Params = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v.startsWith("@")) resolved[k] = t(v.slice(1) as MessageKey);
    else if (k === "money" && typeof v === "number") resolved[k] = formatMoney(v);
    else resolved[k] = v;
  }
  return t(key as MessageKey, resolved);
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

const namePools: Record<string, NamePools> = { en: namesEn };
/** Word pools for generated names in the current locale. */
export function names(): NamePools {
  return namePools[current] ?? namesEn;
}

/** Number of variants for keys like "prefix.0", "prefix.1", … (used for generated dialogue). */
export function variantCount(prefix: string): number {
  let n = 0;
  while ((messages as Record<string, unknown>)[`${prefix}.${n}`] !== undefined) n++;
  return n;
}

export function allKeys(): MessageKey[] {
  return Object.keys(en) as MessageKey[];
}
