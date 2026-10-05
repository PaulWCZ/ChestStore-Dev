import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { checkTheme, validateTheme } from "@argentic/chest-ui/contract";
import { AppError, field } from "../src/core/tool.ts";
import { en } from "../src/i18n/en.ts";
import { formatter, locales, publicLocale, words } from "../src/i18n/index.ts";
import { csvLine } from "../src/lib/csv.ts";
import { identity } from "../src/theme.ts";

// Rules checked on the sources, without a server (Node runs .ts as is).
const leaves = (value: unknown, path = ""): [string, string][] =>
  typeof value === "string" ? [[path, value]] : Object.entries(value as object).flatMap(([k, v]) => leaves(v, `${path}.${k}`));
const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? sources(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

test("every language says every text, with the same {placeholders}", () => {
  const { kit: _, ...source } = en;
  for (const locale of locales) {
    const { kit: __, ...other } = words(locale);
    const theirs = new Map(leaves(other));
    for (const [path, text] of leaves(source)) {
      const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/gu)].map(m => m[1]).sort();
      assert.deepEqual(placeholders(theirs.get(path) ?? ""), placeholders(text), `${locale}${path}`);
    }
  }
});

test("dates, numbers and plurals in the reader's language and zone", () => {
  const fr = formatter("fr", "Europe/Paris", "EUR"), en = formatter("en", "America/New_York", "EUR");
  const at = new Date("2026-10-05T22:30:00Z");
  assert.equal(fr.date(at), "6 oct. 2026"); // already the 6th in Paris
  assert.equal(en.date(at), "5 Oct 2026");
  assert.equal(fr.money(1234.5), "1\u202f234,50\u00a0€");
  assert.equal(fr.plural({ one: "{count} note", other: "{count} notes" }, 0), "0 note");
  assert.equal(en.plural({ one: "{count} note", other: "{count} notes" }, 0), "0 notes");
  assert.equal(publicLocale(undefined, "de-DE, fr;q=0.8, en;q=0.5"), "fr");
  assert.equal(publicLocale("en", "fr"), "en");
});

test("an action's fields read forms and JSON alike, and refuse with a code", () => {
  const code = (f: () => unknown) => assert.throws(f, AppError);
  assert.equal(field.text({ max: 5 }).read("  hi "), "hi");
  assert.throws(() => field.text({ max: 5 }).read("   "), { code: "empty" });
  assert.throws(() => field.text({ max: 5 }).read("toolong"), { code: "too_long" });
  assert.equal(field.int({ min: 1, max: 9 }).read("3"), 3);
  code(() => field.int({ min: 1, max: 9 }).read("12"));
  code(() => field.id().read("1 or 1=1"));
  assert.equal(field.bool().read("on"), true);
  assert.equal(field.bool().read(undefined), false);
  assert.deepEqual(field.list(field.id(), 3).read("7"), ["7"]);
  assert.equal(field.optional(field.day()).read(""), undefined);
  code(() => field.choice(["a", "b"]).read("c"));
});

test("CSV cells are quoted, formulas defused", () => {
  assert.equal(csvLine([1, "a,b", 'say "hi"', "=1+1", -2]), '1,"a,b","say ""hi""",\'=1+1,-2\r\n');
});

test("the look passes the kit's contract; the CSS names no colour", () => {
  assert.deepEqual(validateTheme(identity), []);
  assert.deepEqual(checkTheme(identity), []);
  assert.doesNotMatch(readFileSync("src/styles.css", "utf8"), /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch)\(|(?<![\w-])(white|black)(?![\w-])/iu);
});

test("pages carry no style attribute; the browser never gets the SDK", () => {
  for (const file of sources("src").filter(f => /\.tsx?$/u.test(f))) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /\sstyle=\{/u, `${file}: style={} is refused by the policy (use a class)`);
    if (file.startsWith("src/islands/") || file === "src/core/client.tsx" || file === "src/core/entry.tsx") {
      assert.doesNotMatch(text, /^import (?!type)[^;]*from "@argentic\/chest-sdk/mu, `${file}: the SDK is for the server only`);
      assert.doesNotMatch(text, /^import (?!type)[^;]*from "\.\.\/(lib|actions)/mu, `${file}: server code in the browser`);
    }
  }
});
