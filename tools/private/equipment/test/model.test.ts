import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "@argentic/chest-app";
import { addDays, addMonths, clean, day, daysBetween, ending, makeTag, money, seatsCount, tag } from "../src/shared/model.ts";

const code = (fn: () => unknown) => {
  try { fn(); } catch (error) { return error instanceof AppError ? error.code : "other"; }
  return "none";
};

test("money reads amounts as people write them, in cents", () => {
  assert.equal(money("1299.90"), 129990);
  assert.equal(money("1 299,90"), 129990);
  assert.equal(money("1,299.90"), 129990);
  assert.equal(money("1.299,90 €"), 129990);
  assert.equal(money("€45"), 4500);
  assert.equal(money("1,299"), 129900);
  assert.equal(money("1.234.567"), 123456700);
  assert.equal(money("12,5"), 1250);
  assert.equal(money(""), null);
  assert.equal(money(null), null);
  assert.equal(money(19.99), 1999);
  assert.equal(code(() => money("abc")), "invalid_money");
  assert.equal(code(() => money("-3")), "invalid_money");
  assert.equal(code(() => money("12.345,678")), "invalid_money");
  assert.equal(code(() => money("99999999999")), "invalid_money");
});

test("asset tags: letters, digits and . _ / -, 32 at most; the tool's own series", () => {
  assert.equal(tag(" EQ-0042 "), "EQ-0042");
  assert.equal(tag("IT 12"), "IT-12");
  assert.equal(code(() => tag("-x")), "invalid_tag");
  assert.equal(code(() => tag("a".repeat(33))), "invalid_tag");
  assert.equal(code(() => tag("é")), "invalid_tag");
  assert.equal(makeTag(42), "EQ-0042");
  assert.equal(makeTag(12345), "EQ-12345");
});

test("days, months and what ends soon", () => {
  assert.equal(day("2026-02-28"), "2026-02-28");
  assert.equal(code(() => day("2026-02-30")), "invalid");
  assert.equal(code(() => day("1970-01-01")), "invalid");
  assert.equal(day(""), null);
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2023-03-15", 36), "2026-03-15");
  assert.equal(daysBetween("2026-09-28", "2026-10-28"), 30);
  assert.equal(ending("2026-10-10", "2026-09-28"), "soon");
  assert.equal(ending("2026-11-27", "2026-09-28"), "soon");
  assert.equal(ending("2026-11-28", "2026-09-28"), "later");
  assert.equal(ending("2026-09-27", "2026-09-28"), "past");
  assert.equal(ending(null, "2026-09-28"), "none");
});

test("texts are trimmed and bounded; seats are whole numbers", () => {
  assert.equal(clean("  a \n b ", 10), "a b");
  assert.equal(clean("a\n\n\n\nb", 10, { multiline: true }), "a\n\nb");
  assert.equal(code(() => clean("   ", 10)), "empty");
  assert.equal(code(() => clean("abcdef", 5)), "too_long");
  assert.equal(seatsCount("10"), 10);
  assert.equal(seatsCount(""), null);
  assert.equal(code(() => seatsCount("0")), "invalid_seats");
  assert.equal(code(() => seatsCount("2.5")), "invalid_seats");
});

test("a series of tags for several items: the digits at the end count up", async () => {
  const { tagSeries } = await import("../src/shared/model.ts");
  assert.deepEqual(tagSeries("LAP-009", 3), ["LAP-009", "LAP-010", "LAP-011"]);
  assert.deepEqual(tagSeries("KEY", 1), ["KEY"]);
  assert.deepEqual(tagSeries("A99", 2), ["A99", "A100"]);
  assert.throws(() => tagSeries("KEY", 2));
});
