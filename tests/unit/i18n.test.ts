import { describe, expect, it } from "vitest";
import { DICTS } from "@/i18n";

const LOCALES = Object.keys(DICTS) as (keyof typeof DICTS)[];
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translations", () => {
  const en = DICTS.en;
  for (const locale of LOCALES.filter((l) => l !== "en")) {
    it(`${locale} has every English key with the same placeholders`, () => {
      const missing: string[] = [];
      const badVars: string[] = [];
      for (const [ns, msgs] of Object.entries(en)) {
        for (const [key, text] of Object.entries(msgs ?? {})) {
          const other = DICTS[locale][ns]?.[key];
          if (other == null) missing.push(`${ns}.${key}`);
          else if (vars(other).join() !== vars(text).join()) badVars.push(`${ns}.${key}`);
        }
      }
      expect(missing).toEqual([]);
      expect(badVars).toEqual([]);
    });
  }
});
