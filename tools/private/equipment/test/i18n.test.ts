import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "../lib/i18n/en.ts";
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
  assert.equal(plural(en.list.count, 1, "en"), "1 item");
  assert.equal(plural(en.list.count, 2, "en"), "2 items");
  assert.equal(plural(en.list.count, 0, "en"), "No items");
  assert.equal(plural(catalogue("fr").list.count, 1, "fr"), "1 objet");
  assert.equal(plural(catalogue("fr").bell.left, 3, "fr", { name: "Léa" }), "Léa est parti avec encore 3 objets");
  assert.equal(format("{a} and {b}", { a: 1 }), "1 and {b}");
});

test("the first of a month as each language writes it: 1er février, 1 February", async () => {
  const { formatDay } = await import("../lib/i18n/index.ts");
  assert.equal(formatDay("2023-02-01", "fr", { day: "numeric", month: "long", year: "numeric" }), "1er février 2023");
  assert.equal(formatDay("2023-02-02", "fr", { day: "numeric", month: "long", year: "numeric" }), "2 février 2023");
  assert.equal(formatDay("2023-02-01", "en", { day: "numeric", month: "long", year: "numeric" }), "1 February 2023");
  assert.equal(formatDay("2023-02-01", "fr", { day: "numeric", month: "short" }), "1er févr.");
  assert.equal(formatDay("2023-02-11", "fr", { day: "numeric", month: "long" }), "11 février");
});
