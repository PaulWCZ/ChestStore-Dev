import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "../src/i18n/en.ts";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { publicLocale } from "@argentic/chest-app";
import { catalogue, format, locales, plural } from "../src/i18n/index.ts";

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

test("the public part's language: the visitor's choice, then the browser's, then the Chest's, then English", () => {
  assert.equal(publicLocale(locales, "fr", "en-GB"), "fr");
  assert.equal(publicLocale(locales, undefined, "de-DE,fr;q=0.8,en;q=0.5"), "fr");
  assert.equal(publicLocale(locales, "xx", "de"), "en");
  assert.equal(publicLocale(locales, undefined, undefined, "fr"), "fr");
  assert.equal(publicLocale(locales, undefined, undefined), "en");
});

test("plurals and placeholders follow the language", () => {
  assert.equal(plural(en.desk.figures.invoices, 1, "en"), "1 invoice");
  assert.equal(plural(en.desk.figures.invoices, 2, "en"), "2 invoices");
  assert.equal(plural(en.desk.figures.invoices, 0, "en"), "No invoice");
  assert.equal(plural(catalogue("fr").desk.figures.quotes, 2, "fr"), "2 devis, HT");
  assert.equal(format("{a} and {b}", { a: 1 }), "1 and {b}");
});

// Every code the sources refuse with (new AppError("…"), fail("…")) has its
// words in every language (the type checks the literal ones too; this
// finds them all, and the catalogue keeps no word nothing says).
test("every error code a service may answer has its words, and every word of errors is said", () => {
  const src = join(import.meta.dirname, "..", "src");
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : /\.tsx?$/u.test(name) ? [join(dir, name)] : []);
  const codes = new Set<string>();
  for (const file of walk(src)) for (const m of readFileSync(file, "utf8").matchAll(/(?:new AppError|fail)\("([a-z_]+)"/gu)) codes.add(m[1]!);
  assert.ok(codes.size > 40);
  for (const locale of locales) for (const code of codes) assert.ok((catalogue(locale).errors as Record<string, string>)[code], `${locale}: errors.${code}`);
  // Said by the package (src/actions.ts' fields, the bounds, the pages), or
  // a code that comes back from a rule as data (an import's line, a bank
  // line, a field the form points at).
  const package_ = ["invalid", "empty", "too_long", "too_large", "forbidden", "not_found", "unavailable", "unknown", "limit", "expired", "amount_ambiguous"];
  // Codes a rule takes as a value (int(…, "quantity_invalid"), wholeDays(…,
  // "terms_invalid")), the dialogs' own checks (percent_invalid), and the
  // database's guard of a finalised document (frozen: a trigger's refusal).
  const asData = ["date_invalid", "amount_invalid", "quantity_invalid", "discount_invalid", "percent_invalid", "terms_invalid", "frozen"];
  const unused = Object.keys(catalogue("en").errors).filter(code => !codes.has(code) && !package_.includes(code) && !asData.includes(code));
  assert.deepEqual(unused, []);
});
