import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "../lib/i18n/en.ts";
import { catalogue, format, formatDay, locales, plural, publicLocale, spanText } from "../lib/i18n/index.ts";
import { typeName } from "../lib/type-name.ts";

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

test("plurals, half days and dates follow the language", () => {
  assert.equal(plural(en.units.days, 1, "en"), "1 day");
  assert.equal(plural(en.units.days, 0.5, "en"), "0.5 days");
  assert.equal(plural(en.units.days, 2.5, "en"), "2.5 days");
  assert.equal(plural(catalogue("fr").units.days, 1.5, "fr"), "1,5 jour");
  assert.equal(plural(catalogue("fr").units.days, 2.5, "fr"), "2,5 jours");
  assert.equal(format("{a} and {b}", { a: 1 }), "1 and {b}");
  assert.equal(formatDay("2026-10-05", "en"), "Mon 5 Oct");
  assert.equal(formatDay("2026-10-05", "fr"), "lun. 5 oct.");
  const span = { start: "2026-10-05", startHalf: "pm" as const, end: "2026-10-09", endHalf: "am" as const };
  assert.equal(spanText(span, "en", en.span), "Mon 5 Oct, from noon – Fri 9 Oct, until noon");
  assert.equal(spanText({ ...span, end: "2026-10-05", endHalf: "pm" }, "fr", catalogue("fr").span), "lun. 5 oct. après-midi");
  assert.equal(spanText({ ...span, startHalf: "am", endHalf: "pm" }, "en", en.span), "Mon 5 Oct – Fri 9 Oct");
  assert.equal(typeName({ key: "paid", name: null }, catalogue("fr").types), "Congés payés");
  assert.equal(typeName({ key: "paid", name: "CP" }, catalogue("fr").types), "CP");
  assert.equal(typeName({ key: null, name: "Wedding" }, en.types), "Wedding");
});
