import assert from "node:assert/strict";
import { test } from "node:test";
import { grid, monthOf, shift } from "../lib/calendar.ts";

test("the calendar's month: read from the address, shifted across years, whole weeks from Monday", () => {
  assert.equal(monthOf("2026-10", "2026-09-29"), "2026-10");
  assert.equal(monthOf("2026-13", "2026-09-29"), "2026-09");
  assert.equal(monthOf("<script>", "2026-09-29"), "2026-09");
  assert.equal(shift("2026-12", 1), "2027-01");
  assert.equal(shift("2026-01", -1), "2025-12");
  const october = grid("2026-10");
  // 1 October 2026 is a Thursday: the grid starts on Monday 28 September.
  assert.equal(october[0]![0], "2026-09-28");
  assert.equal(october.at(-1)!.at(-1), "2026-11-01");
  assert.ok(october.every(w => w.length === 7));
  // February 2027 starts on a Monday and fills four weeks exactly.
  assert.equal(grid("2027-02").length, 4);
});
