import assert from "node:assert/strict";
import { test } from "node:test";
import { addMonths, clip, completedMonths, cost, coverage, earned, easter, holidays, holidaysBetween, isDay, monthDays, overlaps, periodStart, spanValid, type Rules, type Span } from "../lib/calendar.ts";

// The French calendar and the counting of days: pure, checked against
// dates anyone can verify.
const span = (start: string, end: string, startHalf: "am" | "pm" = "am", endHalf: "am" | "pm" = "pm"): Span => ({ start, startHalf, end, endHalf });
const days = (list: string[]) => new Set(list);
const off = (from: string, to: string, alsace = false) => new Map([...holidaysBetween(from, to, { alsace })]);

test("Easter Sunday for known years", () => {
  assert.equal(easter(2024), "2024-03-31");
  assert.equal(easter(2025), "2025-04-20");
  assert.equal(easter(2026), "2026-04-05");
  assert.equal(easter(2027), "2027-03-28");
  assert.equal(easter(2038), "2038-04-25");
  assert.equal(easter(2000), "2000-04-23");
});

test("the eleven French public holidays of 2026, and Alsace-Moselle's two more", () => {
  assert.deepEqual(holidays(2026).map(h => `${h.day} ${h.key}`), [
    "2026-01-01 newYear", "2026-04-06 easterMonday", "2026-05-01 labourDay", "2026-05-08 victory", "2026-05-14 ascension",
    "2026-05-25 whitMonday", "2026-07-14 bastille", "2026-08-15 assumption", "2026-11-01 allSaints", "2026-11-11 armistice", "2026-12-25 christmas",
  ]);
  const alsace = holidays(2026, { alsace: true });
  assert.equal(alsace.length, 13);
  assert.ok(alsace.some(h => h.day === "2026-04-03" && h.key === "goodFriday"));
  assert.ok(alsace.some(h => h.day === "2026-12-26" && h.key === "stStephen"));
  assert.equal(holidays(2027).find(h => h.key === "ascension")?.day, "2027-05-06");
  assert.equal(holidays(2025).find(h => h.key === "whitMonday")?.day, "2025-06-09");
});

test("days are real days", () => {
  assert.ok(isDay("2028-02-29"));
  assert.ok(!isDay("2027-02-29"));
  assert.ok(!isDay("2026-13-01"));
  assert.ok(!isDay("1999-12-31"));
  assert.ok(!isDay(20260101));
  assert.equal(monthDays("2026-02").length, 28);
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
});

test("jours ouvrés: Monday to Friday, public holidays not counted, half days", () => {
  const rules: Rules = { counting: "ouvres", daysOff: off("2026-01-01", "2026-12-31") };
  assert.equal(cost(span("2026-10-05", "2026-10-09"), rules), 5); // a week
  assert.equal(cost(span("2026-10-05", "2026-10-16"), rules), 10); // two weeks, the week-end free
  assert.equal(cost(span("2026-11-09", "2026-11-13"), rules), 4); // 11 November
  assert.equal(cost(span("2026-05-11", "2026-05-15"), rules), 4); // Ascension, Thursday 14 May
  assert.equal(cost(span("2026-10-05", "2026-10-05", "am", "am"), rules), 0.5); // a morning
  assert.equal(cost(span("2026-10-05", "2026-10-05", "pm", "pm"), rules), 0.5); // an afternoon
  assert.equal(cost(span("2026-10-05", "2026-10-09", "pm", "am"), rules), 4); // Monday noon to Friday noon
  assert.equal(cost(span("2026-10-10", "2026-10-11"), rules), 0); // a week-end
  assert.equal(cost(span("2026-10-09", "2026-10-05"), rules), 0); // backwards
});

test("jours ouvrables: Saturday counts, and the Saturday after a week off", () => {
  const rules: Rules = { counting: "ouvrables", daysOff: off("2026-01-01", "2027-01-31") };
  assert.equal(cost(span("2026-10-05", "2026-10-09"), rules), 6); // Monday to Friday: 6
  assert.equal(cost(span("2026-10-05", "2026-10-16"), rules), 12); // two weeks: 12
  assert.equal(cost(span("2026-10-05", "2026-10-07"), rules), 3); // back on Thursday: no Saturday
  assert.equal(cost(span("2026-10-05", "2026-10-09", "am", "am"), rules), 4.5); // back on Friday afternoon
  assert.equal(cost(span("2026-10-05", "2026-10-09"), rules, { tail: false }), 5);
  // Friday 1 May 2026 is a holiday: Thursday 30 April ends the week, Saturday 2 May counts.
  assert.equal(cost(span("2026-04-27", "2026-04-30"), rules), 5);
  // Christmas 2026 is a Friday, Saturday 26 is ouvrable (outside Alsace-Moselle).
  assert.equal(cost(span("2026-12-21", "2026-12-24"), rules), 5);
  const alsace: Rules = { counting: "ouvrables", daysOff: off("2026-01-01", "2027-01-31", true) };
  assert.equal(cost(span("2026-12-21", "2026-12-24"), alsace), 4); // 26 December is a holiday there
});

test("calendar days count everything; a company that works Whit Monday counts it", () => {
  assert.equal(cost(span("2026-10-09", "2026-10-12"), { counting: "calendar", daysOff: off("2026-01-01", "2026-12-31") }), 4);
  const all = off("2026-01-01", "2026-12-31");
  assert.equal(cost(span("2026-05-25", "2026-05-29"), { counting: "ouvres", daysOff: all }), 4);
  all.delete("2026-05-25");
  assert.equal(cost(span("2026-05-25", "2026-05-29"), { counting: "ouvres", daysOff: all }), 5);
  assert.equal(cost(span("2026-05-25", "2026-05-29"), { counting: "ouvres", daysOff: days([]) }), 5);
});

test("spans: well formed, overlapping by half days, covering days, clipped", () => {
  assert.ok(!spanValid(span("2026-10-05", "2026-10-05", "pm", "am")));
  assert.ok(spanValid(span("2026-10-05", "2026-10-06", "pm", "am")));
  assert.ok(!overlaps(span("2026-10-05", "2026-10-05", "am", "am"), span("2026-10-05", "2026-10-05", "pm", "pm")));
  assert.ok(overlaps(span("2026-10-05", "2026-10-06", "am", "am"), span("2026-10-06", "2026-10-07")));
  assert.ok(!overlaps(span("2026-10-05", "2026-10-06", "am", "am"), span("2026-10-06", "2026-10-07", "pm", "pm")));
  assert.equal(coverage(span("2026-10-05", "2026-10-07", "pm", "am"), "2026-10-05"), "pm");
  assert.equal(coverage(span("2026-10-05", "2026-10-07", "pm", "am"), "2026-10-06"), "full");
  assert.equal(coverage(span("2026-10-05", "2026-10-07", "pm", "am"), "2026-10-07"), "am");
  assert.equal(coverage(span("2026-10-05", "2026-10-07"), "2026-10-08"), null);
  assert.deepEqual(clip(span("2026-09-28", "2026-10-02", "pm", "am"), "2026-10-01", "2026-10-31"), span("2026-10-01", "2026-10-02", "am", "am"));
  assert.equal(clip(span("2026-09-28", "2026-09-30"), "2026-10-01", "2026-10-31"), null);
});

test("leave earned month by month, and the reference period from 1 June", () => {
  assert.equal(completedMonths("2026-03-15", "2026-04-14"), 0);
  assert.equal(completedMonths("2026-03-15", "2026-04-15"), 1);
  assert.equal(completedMonths("2026-01-31", "2026-02-28"), 1);
  assert.equal(completedMonths("2026-06-01", "2027-06-01"), 12);
  assert.equal(periodStart("2026-09-28", 6), "2026-06-01");
  assert.equal(periodStart("2026-03-01", 6), "2025-06-01");
  assert.equal(periodStart("2026-03-01", 1), "2026-01-01");
  assert.deepEqual(earned("2026-06-01", "2027-06-01", 25, 6), { total: 25, thisPeriod: 0, months: 12 });
  assert.deepEqual(earned("2026-06-01", "2027-05-31", 25, 6), { total: 22.92, thisPeriod: 22.92, months: 11 });
  assert.deepEqual(earned("2026-06-01", "2027-05-31", 30, 6), { total: 27.5, thisPeriod: 27.5, months: 11 });
  // Hired on 15 March 2026: 2.5 months by 1 June; this period counts from then.
  const e = earned("2026-03-15", "2026-09-28", 25, 6);
  assert.equal(e.months, 6);
  assert.equal(e.total, 12.5);
  assert.equal(e.thisPeriod, 8.33);
});
