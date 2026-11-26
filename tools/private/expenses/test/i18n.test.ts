import assert from "node:assert/strict";
import { test } from "node:test";
import { publicLocale } from "@argentic/chest-app";
import { atLeast, checkWords } from "@argentic/chest-app/testing";
import { en } from "../src/i18n/en.ts";
import { catalogue, catalogues, format, locales, plural } from "../src/i18n/index.ts";
import { categoryName, powerName } from "../src/shared/words.ts";

atLeast(4);

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
});

test("plurals, placeholders, categories and powers follow the language", () => {
  assert.equal(plural(en.home.send, 1, "en"), "Send 1 expense");
  assert.equal(plural(en.home.send, 3, "en"), "Send 3 expenses");
  assert.equal(plural(catalogue("fr").home.send, 2, "fr"), "Envoyer 2 dépenses");
  assert.equal(format("{a} and {b}", { a: 1 }), "1 and {b}");
  assert.equal(categoryName({ key: "meals", name: null }, catalogue("fr")), "Repas");
  assert.equal(categoryName({ key: "meals", name: "Client lunches" }, catalogue("fr")), "Client lunches");
  assert.equal(powerName("car", "7", catalogue("fr")), "7 CV et plus");
  assert.equal(powerName("car", "9", en), "9 CV");
});

test("the package's word checks: the same texts and placeholders, French typography", () => {
  checkWords(catalogues);
});
