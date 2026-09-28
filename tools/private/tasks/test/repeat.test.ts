import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../lib/app-error.ts";
import { today } from "../lib/model.ts";
import { addDays, firstDue, nextDue, occurs, parseRepeat, ruleKey, suggest, weekday } from "../lib/repeat.ts";

// The rules of a repeating card, alone: what a page may send, the day the
// next one is due, month ends and summer time.

test("a rule is one of the plain choices; anything else is refused", () => {
  assert.equal(parseRepeat(null), null);
  assert.equal(parseRepeat(undefined), null);
  assert.deepEqual(parseRepeat({ every: "day" }), { every: "day" });
  assert.deepEqual(parseRepeat({ every: "weekday", extra: 1 }), { every: "weekday" });
  assert.deepEqual(parseRepeat({ every: "week", days: [4, 1, 1] }), { every: "week", days: [1, 4] });
  assert.deepEqual(parseRepeat({ every: "month", day: 31 }), { every: "month", day: 31 });
  for (const bad of [{}, [], "day", { every: "year" }, { every: "week", days: [] }, { every: "week", days: [7] }, { every: "week", days: ["1"] }, { every: "month", day: 0 }, { every: "month", day: 32 }, { every: "month", day: 1.5 }]) {
    assert.throws(() => parseRepeat(bad), (e: unknown) => e instanceof AppError && e.code === "invalid", JSON.stringify(bad));
  }
});

test("every weekday skips the weekend; every week falls on its days", () => {
  // 2026-10-02 is a Friday.
  assert.equal(weekday("2026-10-02"), 5);
  assert.equal(nextDue({ every: "weekday" }, "2026-10-02", "2026-10-02"), "2026-10-05");
  assert.equal(nextDue({ every: "day" }, "2026-10-02", "2026-10-02"), "2026-10-03");
  const monThu = { every: "week" as const, days: [1, 4] };
  assert.equal(nextDue(monThu, "2026-10-05", "2026-10-05"), "2026-10-08");
  assert.equal(nextDue(monThu, "2026-10-08", "2026-10-05"), "2026-10-12");
  assert.equal(nextDue({ every: "week", days: [0] }, "2026-10-02", "2026-10-02"), "2026-10-04");
});

test("every month on the 31st takes the last day of shorter months, and the 31st again after", () => {
  const rule = { every: "month" as const, day: 31 };
  assert.equal(nextDue(rule, "2026-01-31", "2026-01-31"), "2026-02-28");
  assert.equal(nextDue(rule, "2026-02-28", "2026-02-28"), "2026-03-31");
  assert.equal(nextDue(rule, "2026-03-31", "2026-03-31"), "2026-04-30");
  assert.equal(nextDue(rule, "2028-01-31", "2028-01-31"), "2028-02-29"); // a leap year
  assert.equal(nextDue({ every: "month", day: 30 }, "2026-01-30", "2026-01-30"), "2026-02-28");
  assert.equal(nextDue({ every: "month", day: 15 }, "2026-12-15", "2026-12-15"), "2027-01-15");
  assert.ok(occurs(rule, "2026-06-30"));
  assert.ok(!occurs({ every: "month", day: 29 }, "2026-03-28"));
});

test("a card done late does not make one already late: the next is from today on", () => {
  // Due Monday 5 October, done Wednesday 14: the next Monday from today.
  assert.equal(nextDue({ every: "week", days: [1] }, "2026-10-05", "2026-10-14"), "2026-10-19");
  // A daily card done two days late: due today.
  assert.equal(nextDue({ every: "day" }, "2026-10-12", "2026-10-14"), "2026-10-14");
  // Done early (due next week): the one after it.
  assert.equal(nextDue({ every: "week", days: [1] }, "2026-10-19", "2026-10-14"), "2026-10-26");
});

test("a card that starts repeating without a date gets the first day of its rule from today", () => {
  assert.equal(firstDue({ every: "weekday" }, "2026-10-03"), "2026-10-05"); // a Saturday → Monday
  assert.equal(firstDue({ every: "day" }, "2026-10-03"), "2026-10-03");
  assert.equal(firstDue({ every: "month", day: 1 }, "2026-10-03"), "2026-11-01");
  assert.deepEqual(suggest("week", "2026-10-08"), { every: "week", days: [4] });
  assert.deepEqual(suggest("month", "2026-10-31"), { every: "month", day: 31 });
  assert.deepEqual(suggest("weekday", "2026-10-31"), { every: "weekday" });
});

test("summer time never moves a day: days are counted on the calendar", () => {
  // Europe: clocks change on 29 March and 25 October 2026.
  assert.equal(nextDue({ every: "day" }, "2026-03-28", "2026-03-28"), "2026-03-29");
  assert.equal(nextDue({ every: "day" }, "2026-03-29", "2026-03-29"), "2026-03-30");
  assert.equal(nextDue({ every: "week", days: [0] }, "2026-10-18", "2026-10-18"), "2026-10-25");
  assert.equal(addDays("2026-10-24", 2), "2026-10-26");
  // America: 8 March and 1 November 2026.
  assert.equal(nextDue({ every: "weekday" }, "2026-03-06", "2026-03-06"), "2026-03-09");
});

test("today is the day in the Chest's zone, not the server's", () => {
  // 23:30 UTC on 28 March is already the 29th in Paris (and summer time begins).
  assert.equal(today(new Date("2026-03-28T23:30:00Z"), "Europe/Paris"), "2026-03-29");
  // 07:30 in Auckland on 28 September (its summer time began the day before) is 18:30 UTC on the 27th.
  assert.equal(today(new Date("2026-09-27T18:30:00Z"), "Pacific/Auckland"), "2026-09-28");
  // Los Angeles, the night summer time ends: still 1 November there.
  assert.equal(today(new Date("2026-11-02T06:30:00Z"), "America/Los_Angeles"), "2026-11-01");
});

test("a rule's key ignores the order of its fields", () => {
  assert.equal(ruleKey({ day: 3, every: "month" } as never), ruleKey({ every: "month", day: 3 }));
  assert.equal(ruleKey(null), "none");
  assert.notEqual(ruleKey({ every: "week", days: [1] }), ruleKey({ every: "week", days: [1, 2] }));
});
