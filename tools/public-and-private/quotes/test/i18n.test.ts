import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "../lib/i18n/en.ts";
import { errorCodes } from "../lib/app-error.ts";
import { catalogue, format, locales, plural, publicLocale } from "../lib/i18n/index.ts";

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

test("the public part's language: the visitor's choice, then the browser's, then English", () => {
  assert.equal(publicLocale("fr", "en-GB"), "fr");
  assert.equal(publicLocale(undefined, "de-DE,fr;q=0.8,en;q=0.5"), "fr");
  assert.equal(publicLocale("xx", "de"), "en");
  assert.equal(publicLocale(undefined, null), "en");
});

test("plurals and placeholders follow the language", () => {
  assert.equal(plural(en.desk.figures.invoices, 1, "en"), "1 invoice");
  assert.equal(plural(en.desk.figures.invoices, 2, "en"), "2 invoices");
  assert.equal(plural(en.desk.figures.invoices, 0, "en"), "No invoice");
  assert.equal(plural(catalogue("fr").desk.figures.quotes, 2, "fr"), "2 devis, HT");
  assert.equal(format("{a} and {b}", { a: 1 }), "1 and {b}");
});

test("every error code a service may answer has its words", () => {
  for (const locale of locales) for (const code of errorCodes) assert.ok(catalogue(locale).errors[code], `${locale}: errors.${code}`);
});
