import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { atLeast, checkSources } from "@argentic/chest-app/testing";
import { dateFormat, formatDate, formatDay, numberFormat, plural, pluralRules } from "../src/shared/format.ts";
import { valueText } from "../src/shared/values.ts";

// What a type cannot check, read in the sources (Node runs .ts as is).
atLeast(4);
const root = join(import.meta.dirname, "..");

test("the sources: no style={}, no server code in islands, no colour in CSS, known classes, capabilities used and declared, every lib module tested", () => {
  checkSources({ root, requireTests: true });
});

// Intl objects live outside V8's heap: one per row of a page piles up
// hundreds of MiB. Only src/shared/format.ts makes them, once per
// language, zone and style.
test("no Intl object is made outside the kept formatters", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/u.test(name) ? [path] : [];
  });
  const found = walk(join(root, "src")).filter(f => !f.endsWith(join("shared", "format.ts"))).filter(f => /new Intl\./u.test(readFileSync(f, "utf8"))).map(f => relative(root, f));
  assert.deepEqual(found, []);
});

test("the formatters are kept: the same object for the same language and style", () => {
  assert.equal(numberFormat("fr", { maximumFractionDigits: 2 }), numberFormat("fr", { maximumFractionDigits: 2 }));
  assert.equal(dateFormat("en", { timeZone: "UTC", day: "numeric" }), dateFormat("en", { timeZone: "UTC", day: "numeric" }));
  assert.equal(pluralRules("fr"), pluralRules("fr"));
  // And they write as before: Europe's English, French spaces.
  assert.equal(formatDay("2027-01-04", "en"), "4 Jan 2027");
  assert.equal(formatDate(new Date("2026-10-05T22:30:00Z"), "fr", "Europe/Paris", { day: "numeric", month: "long" }), "6 octobre");
  const plain = (s: string) => s.replace(/[\u00a0\u202f]/gu, " ");
  assert.equal(plain(plural({ one: "{count} objectif", other: "{count} objectifs" }, 1200, "fr")), "1 200 objectifs");
  assert.equal(plain(valueText({ kind: "money", unit: "", currency: "EUR" }, 1250.5, "fr")), "1 250,50 €");
});

test("a thousand values written reuse a handful of formatters", () => {
  for (let i = 0; i < 1000; i++) valueText({ kind: i % 2 ? "percent" : "number", unit: "customers", currency: null, unitLocale: "en" }, i, i % 3 ? "fr" : "en");
  // Same object each time (nothing new made per value).
  assert.equal(numberFormat("en", { maximumFractionDigits: 2 }), numberFormat("en", { maximumFractionDigits: 2 }));
});
