import { describe, expect, it } from "vitest";
import { allKeys, t } from "../../src/i18n";
import en from "../../src/i18n/locales/en";

describe("i18n", () => {
  it("interpolates and pluralizes", () => {
    expect(t("hud.day", { day: 3 })).toBe("Day 3");
    expect(t("cheater.count", { count: 1 })).toMatch(/First offense/);
    expect(t("cheater.count", { count: 2 })).toMatch(/Second offense/);
    expect(t("cheater.count", { count: 7 })).toMatch(/Offense #7/);
  });
  it("has no empty strings", () => {
    const intentionallyEmpty = new Set(["color.tone.mid"]); // "blue", not "mid blue"
    for (const k of allKeys()) {
      if (intentionallyEmpty.has(k)) continue;
      const v = en[k];
      const strings = typeof v === "string" ? [v] : Object.values(v);
      for (const s of strings) expect(s.trim().length, k).toBeGreaterThan(0);
    }
  });
  it("UI code only uses keys that exist", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".ts") ? [path.join(d, e.name)] : [],
      );
    const keys = new Set<string>(allKeys());
    for (const f of walk("src")) {
      for (const m of fs.readFileSync(f, "utf8").matchAll(/\bt\("([\w.]+)"/g)) {
        expect(keys.has(m[1]), `${f}: ${m[1]}`).toBe(true);
      }
    }
  });
});
