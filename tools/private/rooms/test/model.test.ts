import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, clean, clock, day, freeSlots, id, int, keysOf, memberIds, minutes, mondayOf, nextNames, nextWorkingDay, overlaps, tapStart, today, twoWeeks, weekday } from "../src/lib/model.ts";

test("texts are trimmed, one line, bounded", () => {
  assert.equal(clean("  Weekly\n  sync\t", 20), "Weekly sync");
  assert.throws(() => clean("   ", 20), { code: "empty" });
  assert.equal(clean(undefined, 20, { optional: true }), "");
  assert.throws(() => clean("x".repeat(21), 20), { code: "too_long", values: { max: 20 } });
  assert.throws(() => clean(42, 20), { code: "invalid" });
});

test("ids, members, numbers, keys: anything else is refused", () => {
  assert.equal(id("12"), "12");
  assert.throws(() => id("1; drop table rooms"), { code: "not_found" });
  assert.throws(() => id("0"), { code: "not_found" });
  assert.deepEqual(memberIds(["mbr_" + "a".repeat(26), "mbr_" + "a".repeat(26)], 5), ["mbr_" + "a".repeat(26)]);
  assert.throws(() => memberIds(["bob"], 5), { code: "invalid" });
  assert.throws(() => memberIds(Array.from({ length: 3 }, (_, i) => "mbr_" + String.fromCharCode(97 + i).repeat(26)), 2), { code: "too_many" });
  assert.equal(int("7", 1, 10), 7);
  assert.throws(() => int(1.5, 1, 10), { code: "invalid" });
  assert.throws(() => int(11, 1, 10), { code: "invalid" });
  assert.deepEqual(keysOf(["video", "screen"], ["screen", "video", "phone"]), ["screen", "video"]);
  assert.throws(() => keysOf(["sauna"], ["screen"]), { code: "invalid" });
});

test("days: real ones only; weeks start on Monday; the working days of two weeks", () => {
  assert.equal(day("2026-09-29"), "2026-09-29");
  assert.throws(() => day("2026-02-30"), { code: "invalid" });
  assert.throws(() => day("29/09/2026"), { code: "invalid" });
  assert.equal(weekday("2026-09-27"), 7);
  assert.equal(mondayOf("2026-10-04"), "2026-09-28");
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.deepEqual(twoWeeks("2026-10-01", [1, 5]), ["2026-09-28", "2026-10-02", "2026-10-05", "2026-10-09"]);
  assert.equal(nextWorkingDay("2026-10-03", [1, 2, 3, 4, 5]), "2026-10-05");
  assert.equal(today("Europe/Paris", new Date("2026-10-24T22:30:00Z")), "2026-10-25");
});

test("quarter hours; parts of a day; free stretches between bookings", () => {
  assert.equal(minutes(570), 570);
  assert.throws(() => minutes(575), { code: "invalid" });
  assert.throws(() => minutes(1455), { code: "invalid" });
  assert.equal(clock(570), "09:30");
  assert.equal(overlaps("am", "pm"), false);
  assert.equal(overlaps("day", "pm"), true);
  assert.deepEqual(freeSlots([{ start: 600, end: 660 }, { start: 660, end: 720 }, { start: 900, end: 960 }], 480, 1080), [{ start: 480, end: 600 }, { start: 720, end: 900 }, { start: 960, end: 1080 }]);
  assert.deepEqual(freeSlots([{ start: 480, end: 1080 }], 480, 1080), []);
  assert.deepEqual(freeSlots([], 480, 1080, 1000), [{ start: 1005, end: 1080 }]);
});

test("desk names go on from the last one", () => {
  assert.deepEqual(nextNames([], 2), ["D-01", "D-02"]);
  assert.deepEqual(nextNames(["D-09", "D-10", "Window"], 2), ["D-11", "D-12"]);
  assert.deepEqual(nextNames(["7", "12"], 1), ["13"]);
});

test("a tap on a free stretch starts at the wanted time, else 08:00 for an early stretch, else its start", () => {
  assert.equal(tapStart({ start: 420, end: 870 }, 540), 540, "07:00–14:30 with 09:00 wanted: 09:00");
  assert.equal(tapStart({ start: 420, end: 525 }, 540), 480, "07:00–08:45: 08:00");
  assert.equal(tapStart({ start: 420, end: 495 }, 540), 420, "07:00–08:15: too short for 08:00");
  assert.equal(tapStart({ start: 780, end: 1200 }, 540), 780, "13:00–20:00: 13:00");
  assert.equal(tapStart({ start: 420, end: 555 }, 540), 480, "09:00 leaves only a quarter: 08:00");
});
