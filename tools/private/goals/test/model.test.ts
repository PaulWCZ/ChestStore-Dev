import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../lib/app-error.ts";
import { checkValue, clean, cycleDates, cycleTime, isStale, measure, mondayOf, nextQuarter, objectiveProgress, parseValue, progress, quarterOf, score, worst } from "../lib/model.ts";
import { valueText } from "../lib/values.ts";

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("texts are trimmed, bounded, and keep line breaks only where allowed", () => {
  assert.equal(clean("  Win   20 customers \n", 200), "Win 20 customers");
  assert.equal(clean("a\r\n\r\n\r\n\r\nb", 200, { multiline: true }), "a\n\nb");
  assert.throws(() => clean("   ", 10), refused("empty"));
  assert.equal(clean("", 10, { optional: true }), "");
  assert.throws(() => clean("x".repeat(11), 10), refused("too_long"));
  assert.throws(() => clean(42, 10), refused("invalid"));
});

test("values are read as people type them, in English or French", () => {
  assert.equal(parseValue("12"), 12);
  assert.equal(parseValue("12,5"), 12.5);
  assert.equal(parseValue("1 200"), 1200);
  assert.equal(parseValue("1 200,75"), 1200.75);
  assert.equal(parseValue("-3"), -3);
  assert.equal(parseValue("+4"), 4);
  assert.equal(parseValue(0.123456), 0.1235);
  for (const bad of ["", "abc", "1.2.3", "1e5", "--1", "12,5,1", null, {}, Infinity]) assert.throws(() => parseValue(bad), refused("invalid_number"), String(bad));
  assert.throws(() => parseValue("10000000000000"), refused("invalid_number"));
});

test("a key result's measure: a number with a unit, a percentage, money, or done / not done", () => {
  assert.deepEqual(measure({ kind: "number", unit: " customers ", start: "0", target: "20" }), { kind: "number", unit: "customers", start: 0, target: 20 });
  assert.deepEqual(measure({ kind: "milestone", start: "5", target: "9" }), { kind: "milestone", unit: "", start: 0, target: 1 });
  assert.deepEqual(measure({ kind: "money", unit: "€", target: "50000" }), { kind: "money", unit: "", start: 0, target: 50000 });
  assert.throws(() => measure({ kind: "number", start: "3", target: "3" }), refused("same_values"));
  assert.throws(() => measure({ kind: "percent", start: "0", target: "5000" }), refused("invalid_number"));
  assert.throws(() => measure({ kind: "stars", target: "3" }), refused("invalid"));
  assert.throws(() => measure({ kind: "number", target: "" }), refused("invalid_number"));
  assert.equal(checkValue("milestone", "1"), 1);
  assert.equal(checkValue("milestone", false), 0);
  assert.throws(() => checkValue("milestone", "0.5"), refused("invalid"));
});

test("progress runs from start to target, either way, capped at 0 and 100 %", () => {
  assert.equal(progress(0, 20, 5), 0.25);
  assert.equal(progress(0, 20, 30), 1);
  assert.equal(progress(0, 20, -4), 0);
  assert.equal(progress(8, 3, 5.5), 0.5);
  assert.equal(progress(8, 3, 2), 1);
  assert.equal(objectiveProgress([]), null);
  assert.equal(objectiveProgress([{ progress: 1, weight: 1 }, { progress: 0, weight: 1 }]), 0.5);
  assert.equal(objectiveProgress([{ progress: 1, weight: 3 }, { progress: 0, weight: 1 }]), 0.75);
  assert.equal(worst([null, "on_track", "at_risk"]), "at_risk");
  assert.equal(worst(["on_track", "off_track", "at_risk"]), "off_track");
  assert.equal(worst([null, null]), null);
});

test("cycles: dates in order and bounded; quarters; where a day stands in a cycle", () => {
  assert.deepEqual(cycleDates("2026-10-01", "2026-12-31"), { startsOn: "2026-10-01", endsOn: "2026-12-31" });
  assert.throws(() => cycleDates("2026-12-31", "2026-10-01"), refused("dates_order"));
  assert.throws(() => cycleDates("2026-02-30", "2026-10-01"), refused("invalid_date"));
  assert.throws(() => cycleDates("2026-01-01", "2027-06-01"), refused("too_long_cycle"));
  assert.deepEqual(quarterOf("2026-09-28"), { name: "Q3 2026", startsOn: "2026-07-01", endsOn: "2026-09-30" });
  assert.deepEqual(nextQuarter("2026-12-31"), { name: "Q1 2027", startsOn: "2027-01-01", endsOn: "2027-03-31" });
  const q4 = { startsOn: "2026-10-01", endsOn: "2026-12-31" };
  assert.equal(cycleTime(q4, "2026-09-28").phase, "before");
  const during = cycleTime(q4, "2026-10-08");
  assert.equal(during.phase, "during");
  assert.equal(during.week, 2);
  assert.equal(during.weeks, 14);
  assert.equal(during.daysLeft, 84);
  assert.equal(cycleTime(q4, "2027-01-02").phase, "after");
  assert.equal(mondayOf("2026-10-04"), "2026-09-28");
  assert.equal(mondayOf("2026-09-28"), "2026-09-28");
});

test("a key result is stale after 14 days without news, unless done or closed", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  assert.equal(isStale(new Date("2026-10-01T10:00:00Z"), false, false, now), true);
  assert.equal(isStale(new Date("2026-10-10T10:00:00Z"), false, false, now), false);
  assert.equal(isStale(new Date("2026-10-01T10:00:00Z"), true, false, now), false);
  assert.equal(isStale(new Date("2026-10-01T10:00:00Z"), false, true, now), false);
});

test("a retrospective's score: 0 to 1, or a percentage", () => {
  assert.equal(score("0.7"), 0.7);
  assert.equal(score("70"), 0.7);
  assert.equal(score("70 %"), 0.7);
  assert.equal(score("100%"), 1);
  assert.equal(score(""), null);
  assert.throws(() => score("140"), refused("invalid_score"));
  assert.throws(() => score("-1"), refused("invalid_score"));
});

test("values are written in the reader's language", () => {
  assert.equal(valueText({ kind: "number", unit: "customers", currency: null }, 1200, "en"), "1,200 customers");
  assert.equal(valueText({ kind: "number", unit: "clients", currency: null }, 1200.5, "fr"), "1 200,5 clients");
  assert.equal(valueText({ kind: "percent", unit: "", currency: null }, 35, "en"), "35%");
  assert.equal(valueText({ kind: "money", unit: "", currency: "EUR" }, 12000, "fr"), "12 000 €");
  assert.equal(valueText({ kind: "money", unit: "", currency: "EUR" }, 12000, "en"), "€12,000");
});
