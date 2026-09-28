import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "../lib/i18n/en.ts";
import { salaryText } from "../lib/facts.ts";
import { catalogue, fileSize, format, locales, plural, publicLocale } from "../lib/i18n/index.ts";

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

test("plurals, placeholders, money and sizes follow the language", () => {
  assert.equal(plural(en.board.days, 0, "en"), "Today");
  assert.equal(plural(en.board.days, 1, "en"), "1 day");
  assert.equal(plural(en.board.days, 3, "en"), "3 days");
  assert.equal(plural(catalogue("fr").careers.count, 1, "fr"), "1 poste ouvert");
  assert.equal(plural(catalogue("fr").home.candidates, 0, "fr"), "Aucun candidat pour l’instant");
  assert.equal(format("{a} and {b}", { a: 1 }), "1 and {b}");
  assert.equal(salaryText({ min: 42000, max: 50000, currency: "EUR", period: "year" }, en.facts, "en"), "€42,000 – €50,000 per year");
  assert.equal(salaryText({ min: 42000, max: null, currency: "EUR", period: "year" }, catalogue("fr").facts, "fr").replace(/\s/gu, " "), "À partir de 42 000 € par an");
  assert.equal(salaryText({ min: null, max: null, currency: "EUR", period: "year" }, en.facts, "en"), "");
  assert.equal(fileSize(2.5 * 1048576, "en"), "2.5 MB");
});

test("the mails' words: a confirmation and a rejection in the candidate's language", () => {
  const fr = catalogue("fr").mail;
  assert.ok(format(fr.rejectBody, { name: "Lucie", job: "Designer", company: "Atelier Martin", sender: "Camille" }).startsWith("Bonjour Lucie,"));
  assert.ok(format(en.mail.confirmBody, { name: "Tom", job: "Designer", company: "Atelier Martin", careers: "https://x.test/" }).includes("https://x.test/"));
});
