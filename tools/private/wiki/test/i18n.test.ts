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
  assert.equal(plural(en.home.pages, 1, "en"), "1 page");
  assert.equal(plural(en.home.pages, 2, "en"), "2 pages");
  assert.equal(plural(en.home.pages, 0, "en"), "No pages");
  assert.equal(plural(catalogue("fr").search.results, 1, "fr", { q: "congés" }), "1 page correspond à «\u202fcongés\u202f».");
  assert.equal(plural(catalogue("fr").home.pages, 1.5, "fr"), "1,5 page");
  assert.equal(format("{a} and {b}", { a: 1 }), "1 and {b}");
});

test("the example handbook exists in every language and links its own pages", async () => {
  const { fromMarkdown } = await import("../lib/markdown.ts");
  for (const locale of locales) {
    const starter = catalogue(locale).starter;
    const keys = Object.keys(starter.pages);
    for (const page of Object.values(starter.pages)) {
      const doc = JSON.stringify(fromMarkdown(page.body));
      for (const target of doc.matchAll(/"href":"page:([a-z]+)"/gu)) assert.ok(keys.includes(target[1]!), `${locale}: page:${target[1]}`);
    }
  }
});
