import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, instantOf, isDay, mondayOf, monthEnd, wall, weekDays } from "../lib/days.ts";
import { period } from "../lib/periods.ts";

test("weeks start on Monday, across months and years", () => {
  assert.equal(mondayOf("2026-09-28"), "2026-09-28");
  assert.equal(mondayOf("2026-10-04"), "2026-09-28");
  assert.equal(mondayOf("2027-01-01"), "2026-12-28");
  assert.deepEqual(weekDays("2026-09-28").at(-1), "2026-10-04");
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(monthEnd("2026-02-10"), "2026-02-28");
  assert.ok(isDay("2026-02-28"));
  assert.ok(!isDay("2026-02-30"));
  assert.ok(!isDay("26-02-01"));
});

test("a clock in Paris, across the daylight-saving changes", () => {
  // 23:50 in Paris on 28 September is 21:50 UTC: the entry's day is Paris's.
  assert.deepEqual(wall(Date.parse("2026-09-28T21:50:00Z"), "Europe/Paris"), { day: "2026-09-28", minutes: 23 * 60 + 50 });
  assert.equal(instantOf("2026-09-28", 9 * 60, "Europe/Paris").toISOString(), "2026-09-28T07:00:00.000Z");
  assert.equal(instantOf("2026-01-15", 9 * 60, "Europe/Paris").toISOString(), "2026-01-15T08:00:00.000Z");
  // 02:30 on 29 March 2026 does not exist in Paris: read after the change.
  assert.equal(instantOf("2026-03-29", 150, "Europe/Paris").toISOString(), "2026-03-29T01:30:00.000Z");
  // 02:30 on 25 October 2026 happens twice: the first.
  assert.equal(instantOf("2026-10-25", 150, "Europe/Paris").toISOString(), "2026-10-25T00:30:00.000Z");
  assert.equal(wall(Date.parse("2026-09-28T03:00:00Z"), "America/Montreal").day, "2026-09-27");
});

test("the periods of a report", () => {
  assert.deepEqual(period("week", "2026-09-30"), { preset: "week", from: "2026-09-28", to: "2026-10-04" });
  assert.deepEqual(period("lastWeek", "2026-09-30"), { preset: "lastWeek", from: "2026-09-21", to: "2026-09-27" });
  assert.deepEqual(period("month", "2026-09-30"), { preset: "month", from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(period("lastMonth", "2026-03-10"), { preset: "lastMonth", from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(period("custom", "2026-09-30", "2026-01-05", "2026-01-20"), { preset: "custom", from: "2026-01-05", to: "2026-01-20" });
  assert.deepEqual(period("custom", "2026-09-30", "2024-01-01", "2026-01-20"), { preset: "custom", from: "2024-01-01", to: "2024-12-31" });
  assert.equal(period("custom", "2026-09-30", "2026-02-01", "2026-01-01").preset, "week");
  assert.equal(period("nonsense", "2026-09-30").preset, "week");
});
