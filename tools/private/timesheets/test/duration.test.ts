import assert from "node:assert/strict";
import { test } from "node:test";
import { amountText, hoursText, parseAmount, parseHours } from "../lib/amounts.ts";
import { formatClock, formatDuration, hours, parseDuration } from "../lib/duration.ts";

test("durations are read the way people type them", () => {
  const cases: [string, number | null][] = [
    ["1:30", 90], ["0:45", 45], [":45", 45], ["12:05", 725], ["1.5", 90], ["1,5", 90], ["2", 120], [".25", 15], [",75", 45],
    ["90m", 90], ["90 min", 90], ["45mn", 45], ["1h30", 90], ["1h 30m", 90], ["1 h 30 min", 90], ["1h", 60], ["1.5h", 90], ["2 hrs", 120],
    ["3 heures", 180], ["  2:00  ", 120], ["1H30", 90], ["24", 1440], ["", 0], ["   ", 0], ["0", 0],
    ["25", null], ["24:01", null], ["1:75", null], ["abc", null], ["1h75", null], ["-1", null], ["1..5", null], ["1:30:00", null], ["9".repeat(30), null], ["1500m", null],
  ];
  for (const [input, expected] of cases) assert.equal(parseDuration(input), expected, JSON.stringify(input));
});

test("durations are written as hours:minutes, decimals for exports", () => {
  assert.equal(formatDuration(90), "1:30");
  assert.equal(formatDuration(5), "0:05");
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(6000), "100:00");
  assert.equal(formatClock(3725), "1:02:05");
  assert.equal(formatClock(-4), "0:00:00");
  assert.equal(hours(90), 1.5);
  assert.equal(hours(20), 0.33);
});

test("rates and budgets are read in both languages' ways", () => {
  assert.equal(parseAmount("80"), 8000);
  assert.equal(parseAmount("80.50"), 8050);
  assert.equal(parseAmount("80,5"), 8050);
  assert.equal(parseAmount("1 200"), 120000);
  assert.equal(parseAmount("1,200"), 120000);
  assert.equal(parseAmount("1.200,50 €"), 120050);
  assert.equal(parseAmount("€ 95"), 9500);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("ten"), null);
  assert.equal(parseAmount("-5"), null);
  assert.equal(parseHours("120"), 7200);
  assert.equal(parseHours("12,5"), 750);
  assert.equal(parseHours("12:30"), 750);
  assert.equal(parseHours("40h"), 2400);
  assert.equal(parseHours("x"), null);
  assert.equal(amountText(8050, true), "80,50");
  assert.equal(amountText(8000, false), "80");
  assert.equal(hoursText(750, true), "12,5");
  assert.equal(hoursText(2100, false), "35");
});
