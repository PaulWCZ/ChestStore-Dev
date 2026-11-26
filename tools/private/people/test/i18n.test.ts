import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "../src/i18n/en.ts";
import { publicLocale } from "@argentic/chest-app";
import { checkWords } from "@argentic/chest-app/testing";
import { catalogue, catalogues, format, locales, plural, words } from "../src/i18n/index.ts";

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
  assert.equal(publicLocale(locales, "fr", "en-GB"), "fr");
  assert.equal(publicLocale(locales, undefined, "de-DE,fr;q=0.8,en;q=0.5"), "fr");
  assert.equal(publicLocale(locales, "xx", "de"), "en");
  assert.equal(publicLocale(locales, undefined, undefined), "en");
  // A language the tool does not speak reads English.
  assert.equal(words("de"), catalogue("en"));
  assert.equal(words("fr"), catalogue("fr"));
});

test("@argentic/chest-app's check: every text in every language, the same {placeholders}, French typography", () => {
  checkWords(catalogues);
});

test("plurals and placeholders follow the language", () => {
  assert.equal(plural(en.directory.count, 1, "en"), "1 person");
  assert.equal(plural(en.directory.count, 2, "en"), "2 people");
  assert.equal(plural(catalogue("fr").directory.count, 0, "fr"), "0 personne");
  assert.equal(plural(en.todo.summary, 0, "en"), "Nothing to do");
  assert.equal(plural(en.bell.todo.onboarding, 2, "en", { name: "Nora Petit" }), "Welcome Nora Petit: 2 to-dos for you");
  assert.equal(plural(catalogue("fr").directory.count, 1200, "fr"), "1\u202f200 personnes");
  assert.equal(format("{a} and {b}", { a: 1 }), "1 and {b}");
});

test("French typography: a narrow no-break space before : ; ? ! and inside « »", () => {
  for (const [key, text] of leaves(catalogue("fr"))) {
    assert.doesNotMatch(text, / [:;?!»]/u, `fr: ${key}`);
    assert.doesNotMatch(text, /« /u, `fr: ${key}`);
  }
});
