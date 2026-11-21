/** Player-entered names (technician + workshop). */
export const NAME_MAX = 20;
export const STORE_NAME_MAX = 28;

/** Trim, collapse spaces, strip control chars, cap length. */
export function cleanName(s: string, max: number): string {
  return s.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
