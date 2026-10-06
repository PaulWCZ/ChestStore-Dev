import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "../src/i18n/en.ts";
import { catalogue, format, locales, plural, publicLocale } from "../src/i18n/index.ts";
import { cut } from "../src/lib/notify.ts";

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
    assert.equal(catalogue(locale).tool.lang, locale);
  }
});

test("the public part's language: the visitor's choice, then the browser's, then English", () => {
  assert.equal(publicLocale("fr", "en-GB"), "fr");
  assert.equal(publicLocale(undefined, "de-DE,fr;q=0.8,en;q=0.5"), "fr");
  assert.equal(publicLocale("xx", "de"), "en");
  assert.equal(publicLocale(undefined, null), "en");
});

test("plurals and placeholders follow the language", () => {
  assert.equal(plural(en.front.comments, 1, "en"), "1 comment");
  assert.equal(plural(en.front.comments, 2, "en"), "2 comments");
  assert.equal(plural(catalogue("fr").front.comments, 0, "fr"), "0 commentaire");
  assert.equal(plural(catalogue("fr").comments.title, 0, "fr"), "Commentaires");
  assert.equal(plural(en.readers.reminded, 1200, "en"), "Reminder sent to 1,200 people.");
  assert.equal(format("{a} and {b}", { a: 1 }), "1 and {b}");
});

test("a bell item keeps French typography: the narrow no-break spaces survive cut()", () => {
  const title = format(catalogue("fr").bell.important, { title: "Déménagement\n  du   bureau" });
  assert.equal(cut(title, 80), "Important : Déménagement du bureau");
  assert.equal(cut(format(catalogue("fr").bell.commented, { name: "Inès", title: "Plan" }), 80), "Inès a commenté « Plan »");
});
