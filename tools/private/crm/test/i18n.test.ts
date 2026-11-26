import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "../src/i18n/en.ts";
import { catalogue, format, formatDay, localeOf, locales, money, plural, words } from "../src/i18n/index.ts";

// Every catalogue has exactly the keys of the English one, no empty word,
// and the same {placeholders} in each word.
function leaves(value: unknown, path = ""): Map<string, string> {
  const found = new Map<string, string>();
  if (typeof value === "string") found.set(path, value);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) for (const [p, s] of leaves(v, path ? path + "." + k : k)) found.set(p, s);
  return found;
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/gu)].map(m => m[1]).sort().join(",");

test("every language has every word of English, none empty, with the same placeholders", () => {
  const source = leaves(en);
  for (const locale of locales) {
    const words = leaves(catalogue(locale));
    assert.deepEqual([...words.keys()].sort(), [...source.keys()].sort(), `keys of ${locale}`);
    for (const [key, text] of words) {
      assert.ok(text.trim().length > 0, `${locale}: ${key} is empty`);
      assert.equal(placeholders(text), placeholders(source.get(key)!), `${locale}: ${key} placeholders`);
    }
    assert.equal(catalogue(locale).meta.lang, locale);
  }
});

test("a member's language the tool speaks, else English", () => {
  assert.equal(words("fr").meta.lang, "fr");
  assert.equal(words("de").meta.lang, "en");
  assert.equal(localeOf(null), "en");
});

test("plurals, placeholders and money follow the language", () => {
  assert.equal(plural(en.deals.count, 1, "en"), "1 deal");
  assert.equal(plural(en.deals.count, 2, "en"), "2 deals");
  assert.equal(plural(catalogue("fr").home.summary, 0, "fr"), "Rien à faire aujourd’hui. Préparez vos prochains appels.");
  assert.equal(format("{a} and {b}", { a: 1 }), "1 and {b}");
  assert.equal(money(1250000, "en"), "€12,500");
  assert.equal(money(1250050, "fr", { cents: true }).replace(/\s/gu, " "), "12 500,50 €");
  assert.equal(formatDay("2026-10-05", "en"), "5 Oct");
});
