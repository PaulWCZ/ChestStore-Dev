import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "../src/i18n/en.ts";
import { catalogue, format, formatDay, formatSpan, formatTime, locales, plural } from "../src/i18n/index.ts";

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
    assert.equal(catalogue(locale).kit.lang, locale);
  }
});

test("plurals and placeholders follow the language", () => {
  assert.equal(plural(en.week.inOffice, 1, "en"), "1 person at the office");
  assert.equal(plural(en.week.inOffice, 3, "en"), "3 people at the office");
  assert.equal(plural(en.week.inOffice, 0, "en"), "Nobody at the office yet");
  assert.equal(plural(catalogue("fr").desks.freeCount, 2, "fr"), "2 postes libres");
  assert.equal(format("{a} and {b}", { a: 1 }), "1 and {b}");
});

test("days and times are written as in Europe, in each language", () => {
  assert.equal(formatDay("2026-09-29", "en", undefined, "2026"), "Tue 29 Sept");
  assert.equal(formatDay("2026-09-29", "fr", undefined, "2026"), "mar. 29 sept.");
  // A day of another year says its year; a weekday alone never does.
  assert.equal(formatDay("2027-01-05", "en", undefined, "2026"), "Tue, 5 Jan 2027");
  assert.equal(formatDay("2027-01-05", "fr", { weekday: "long", day: "numeric", month: "long" }, "2026"), "mardi 5 janvier 2027");
  assert.equal(formatDay("2027-01-05", "en", { weekday: "long" }, "2026"), "Tuesday");
  assert.equal(formatSpan(570, 660, "en"), "09:30–11:00");
  assert.equal(formatTime(1440, "fr"), "24:00");
});
