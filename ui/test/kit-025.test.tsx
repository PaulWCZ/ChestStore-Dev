// What 0.2.5 fixes: a corrected date and a click on the Save below it,
// in one move, lost the click (Support's "day off", Quotes' payment
// dialog). The refused date's sentence went on the press's blur, the page
// moved up between press and release. The rule of when typed text is a
// whole date is pure and tested here; the move itself is played in
// Chromium by scripts/gallery/check-flows.mjs ("a corrected date and Save
// in one move"), which fails on 0.2.4.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { addDays, formatDate, readTypedDate, typedDateComplete, type IsoDate } from "../src/components/dates.js";
import { dateWords, en, fr, type DateWords } from "../src/components/words.js";
import * as logic from "../src/components/logic.js";

const ui = join(import.meta.dirname, "..", "..");
const source = (file: string) => readFileSync(join(ui, "src", "components", file), "utf8");
const today = "2026-09-29";
const mdy: DateWords = dateWords({ ...en.date, order: "mdy" });
const ymd: DateWords = dateWords({ ...en.date, order: "ymd" });

test("typedDateComplete: a whole date is one that more typing could not turn into another day", () => {
  for (const t of ["1/1/2026", "01/01/2026", "29/09/2026", "29.9.2026", "29-09-2026", " 29/09/2026 ", "2026-09-30", "29092026", "29 sept 2026", "1er octobre 2026", "Oct 5, 2026", "today", "Tomorrow", "yesterday"]) {
    assert.equal(typedDateComplete(t, en.date), true, t);
  }
  for (const t of ["demain", "Aujourd’hui", "hier", "29 sept. 2026"]) assert.equal(typedDateComplete(t, fr.date), true, t);
  for (const t of ["", " ", "1", "29", "29/", "29/10", "29/10/", "1/1/2", "1/1/20", "1/1/202", "29 sept", "29 sept 2", "29 sept 20", "Oct 5", "Oct 5, 20", "2026", "2026-09-3", "2026-09", "tom", "2909202"]) {
    assert.equal(typedDateComplete(t, en.date), false, JSON.stringify(t));
  }
  assert.equal(typedDateComplete("10/31/2026", mdy), true);
  assert.equal(typedDateComplete("10/3", mdy), false);
  assert.equal(typedDateComplete("2026/10/31", ymd), true);
  assert.equal(typedDateComplete("2026/10/03", ymd), true);
  assert.equal(typedDateComplete("2026/10/3", ymd), false, "the day may grow: 3 → 30");
  assert.equal(typedDateComplete("20261031", ymd), true);
  assert.equal(typedDateComplete("31 Oct 2026", ymd), true, "a month's name: its year ends it");
  assert.equal(logic.typedDateComplete, typedDateComplete, "server-safe, in /components/logic");
});

// Every text on the way to a date, typed a character at a time: none that
// the field would send while typing is another day than the one intended.
test("typing a date a character at a time never sends a wrong partial date ('1/1/2' is not year 2, '1/1/20' not 2020)", () => {
  const cases: [string, DateWords, IsoDate][] = [
    ["1/1/2026", en.date, "2026-01-01"],
    ["1/10/2026", en.date, "2026-10-01"],
    ["15/12/2026", en.date, "2026-12-15"],
    ["2/2/2027", fr.date, "2027-02-02"],
    ["29 sept 2026", fr.date, "2026-09-29"],
    ["1er octobre 2026", fr.date, "2026-10-01"],
    ["Oct 25, 2026", en.date, "2026-10-25"],
    ["2026-10-30", en.date, "2026-10-30"],
    ["30102026", en.date, "2026-10-30"],
    ["10/3/2026", mdy, "2026-10-03"],
    ["2026/10/30", ymd, "2026-10-30"],
    ["tomorrow", en.date, "2026-09-30"],
  ];
  for (const [whole, words, want] of cases) {
    const sent: string[] = [];
    for (let n = 1; n <= whole.length; n++) {
      const text = whole.slice(0, n);
      const read = readTypedDate(text, words, today);
      if (read.ok && read.value !== null && typedDateComplete(text, words)) sent.push(`${text} → ${read.value}`);
    }
    assert.ok(sent.length > 0, `${whole} is sent once whole`);
    assert.ok(sent.every(s => s.endsWith("→ " + want)), `${whole}: ${sent.join(", ")}`);
  }
  // The texts the old reading took as a date on the way are only read on blur.
  assert.deepEqual(readTypedDate("1/1/20", en.date, today), { ok: true, value: "2020-01-01" });
  assert.equal(typedDateComplete("1/1/20", en.date), false);
  assert.equal(readTypedDate("1/1/2", en.date, today).ok, false);
});

test("DateField: an existing problem is cleared while typing (and the date sent once whole); a new one is said only on blur", () => {
  const all = source("date-field.tsx");
  const field = all.slice(all.indexOf("export function DateField"), all.indexOf("export type CalendarProps"));
  const typed = field.slice(field.indexOf("function typed("), field.indexOf("function pick("));
  // Every input is read by typed(), not only stored.
  assert.match(field, /onChange=\{e => typed\(e\.target\.value\)\}/u);
  assert.match(field, /onBlur=\{e => commit\(e\.target\.value\)\}/u, "the blur still reads it");
  // No problem said: nothing read before blur (no nagging, no auto-save of each day on the way).
  assert.match(typed, /if \(problem === null\) return;/u);
  assert.match(typed, /readTypedDate\(raw, labels, today, \{ min, max \}\)/u, "the same rule as on blur");
  // A text still refused keeps the sentence standing (no new problem while typing).
  assert.match(typed, /if \(!read\.ok\) return;/u);
  assert.doesNotMatch(typed, /setProblem\(read\.problem\)/u);
  // A whole accepted date: the problem goes, the tool gets the date (onProblem(null) follows the problem).
  assert.match(typed, /if \(read\.value !== null && typedDateComplete\(raw, labels\)\) \{\s*setProblem\(null\);\s*setQuiet\(false\);\s*if \(read\.value !== value\) onChange\(read\.value\);\s*\} else setQuiet\(true\);/u);
  // Quiet: the sentence is hidden, the problem still blocks (validity, hidden input, onProblem).
  assert.match(field, /const shownError = error \?\? \(quiet \? null : problem\);/u);
  assert.match(field, /<input type="hidden" name=\{name\} value=\{problem \? "" : value \?\? ""\} \/>/u);
  // The blur, a pick, a chip or an outside value end the quiet state.
  const commit = field.slice(field.indexOf("function commit("), field.indexOf("function typed("));
  assert.match(commit, /setTyping\(false\);\s*setQuiet\(false\);/u);
  assert.ok((field.match(/setQuiet\(false\)/gu) ?? []).length >= 5);
  // The validity and onProblem are set in the commit of the event itself, before a click that follows the blur.
  assert.match(field, /useLayoutEffect\(\(\) => \{\s*field\.current\?\.setCustomValidity\(problem \?\? ""\);/u);
});

test("DateRangeField: both ends are DateFields and take the fix (a corrected end counts as it is typed)", () => {
  const range = source("date-range.tsx");
  assert.equal((range.match(/<DateField /gu) ?? []).length, 2);
  assert.doesNotMatch(range, /<input /u, "no text field of its own");
  // The last day refused before the first, then corrected: the whole date is sent while typing.
  const from = "2026-11-20";
  const refused = readTypedDate("18/11/2026", en.date, today, { min: from });
  assert.ok(!refused.ok && refused.reason === "too_early");
  assert.equal(typedDateComplete("25/11/2026", en.date), true);
  assert.deepEqual(readTypedDate("25/11/2026", en.date, today, { min: from }), { ok: true, value: "2026-11-25" });
  assert.equal(formatDate(addDays(from, 5), en.date), "25/11/2026");
});

test("the kit says its version: 0.2.5-studio.1 or later", () => {
  // 0.2.6 bumped it (test/kit-026.test.tsx checks the exact version).
  const later = /^0\.2\.([5-9]|\d{2,})-studio\.\d+$/u;
  const pkg = JSON.parse(readFileSync(join(ui, "package.json"), "utf8")) as { version: string };
  assert.match(pkg.version, later);
  const lock = JSON.parse(readFileSync(join(ui, "package-lock.json"), "utf8")) as { version: string; packages: Record<string, { version?: string }> };
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""]?.version, pkg.version);
});
