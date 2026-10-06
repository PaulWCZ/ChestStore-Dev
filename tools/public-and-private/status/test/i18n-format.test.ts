import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "../src/i18n/en.ts";
import { duration, moment, month, percent, stamp } from "../src/i18n/format.ts";

test("times, lengths and percentages as each language writes them", () => {
  const at = new Date("2026-09-28T12:05:00Z");
  const now = new Date("2026-09-30T00:00:00Z");
  assert.equal(moment(at, "Europe/Paris", "en", now), "28 Sept, 14:05");
  assert.match(stamp(at, "Europe/Paris", "en", now), /^28 Sept, 14:05 (CEST|GMT\+2)$/u);
  assert.equal(moment(at, "America/Montreal", "fr", now), "28 sept., 08:05");
  assert.equal(duration(2 * 3600000 + 5 * 60000, en.time), "2 h 5 min");
  assert.equal(duration(3600000, en.time), "1 h");
  assert.equal(duration(90000, en.time), "2 min");
  assert.equal(duration(27 * 3600000, en.time), "1 d 3 h");
  assert.equal(percent(99.999, "en"), "99.99%");
  assert.equal(percent(100, "en"), "100.00%");
  assert.equal(percent(99.5, "fr"), "99,50 %");
  assert.equal(month("2026-09", "fr"), "Septembre 2026");
});
