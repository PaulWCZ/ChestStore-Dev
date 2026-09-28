import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultWeek, slots, validRanges, type Availability, type Rules } from "../lib/slots.ts";
import { addDays, instantOf, isDate, isZone, offset, wall } from "../lib/zone.ts";

test("wall clocks and instants, across daylight-saving changes", () => {
  // Paris: summer UTC+2, winter UTC+1; the clock goes back on 25 Oct 2026 at 3:00.
  assert.equal(instantOf("2026-10-12", 9 * 60, "Europe/Paris").toISOString(), "2026-10-12T07:00:00.000Z");
  assert.equal(instantOf("2026-10-26", 9 * 60, "Europe/Paris").toISOString(), "2026-10-26T08:00:00.000Z");
  // 2:30 happens twice on 25 Oct: the first one.
  assert.equal(instantOf("2026-10-25", 150, "Europe/Paris").toISOString(), "2026-10-25T00:30:00.000Z");
  // 2:30 does not exist on 29 Mar 2026: after the change.
  assert.equal(wall(instantOf("2026-03-29", 150, "Europe/Paris"), "Europe/Paris").minutes, 210);
  assert.deepEqual(wall(Date.parse("2026-10-12T07:00:00Z"), "America/Montreal"), { date: "2026-10-12", minutes: 180, weekday: 1 });
  assert.equal(offset(Date.parse("2026-07-01T12:00:00Z"), "Europe/Paris"), 120);
  assert.equal(offset(Date.parse("2026-01-01T12:00:00Z"), "Asia/Kolkata"), 330);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.ok(isZone("Europe/Paris") && !isZone("Mars/Olympus") && !isZone("../etc"));
  assert.ok(isDate("2026-02-28") && !isDate("2026-02-30") && !isDate("tomorrow"));
});

const paris: Availability = { weekly: defaultWeek, overrides: {}, zone: "Europe/Paris" };
const thirty: Rules = { duration: 30, interval: 30, bufferBefore: 0, bufferAfter: 0, noticeMinutes: 120, windowDays: 30, dailyLimit: 0 };
const monday8am = Date.parse("2026-10-12T06:00:00Z"); // 8:00 in Paris

test("slots: the host's hours in their zone, from the notice, around bookings with buffers, days off", () => {
  const day = slots(paris, thirty, [], { from: "2026-10-12", to: "2026-10-12" }, monday8am);
  // Notice of 2 h: from 10:00; 10:00–12:30 (5), 14:00–17:30 (7).
  assert.equal(day.length, 12);
  assert.equal(day[0]!.start, "2026-10-12T08:00:00.000Z");
  assert.equal(day.at(-1)!.start, "2026-10-12T15:00:00.000Z");
  // A booking 10:30–11:00 with 15 min buffers blocks 10:00, 10:30 and 11:00.
  const busy = [{ start: Date.parse("2026-10-12T08:30:00Z"), end: Date.parse("2026-10-12T09:00:00Z") }];
  const around = slots(paris, { ...thirty, bufferBefore: 15, bufferAfter: 15 }, busy, { from: "2026-10-12", to: "2026-10-12" }, monday8am);
  assert.deepEqual(around.slice(0, 2).map(s => s.start), ["2026-10-12T09:30:00.000Z", "2026-10-12T10:00:00.000Z"]);
  // A day off, special hours, a weekend, the window.
  const off = slots({ ...paris, overrides: { "2026-10-13": [], "2026-10-14": [[600, 660]] } }, thirty, [], { from: "2026-10-13", to: "2026-10-18" }, monday8am);
  assert.equal(off.filter(s => s.start.startsWith("2026-10-13")).length, 0);
  assert.deepEqual(off.filter(s => s.start.startsWith("2026-10-14")).map(s => s.start), ["2026-10-14T08:00:00.000Z", "2026-10-14T08:30:00.000Z"]);
  assert.equal(off.filter(s => s.start.startsWith("2026-10-17") || s.start.startsWith("2026-10-18")).length, 0);
  assert.equal(slots(paris, { ...thirty, windowDays: 1 }, [], { from: "2026-10-12", to: "2026-10-20" }, monday8am).filter(s => s.start >= "2026-10-14").length, 0);
});

test("slots keep the host's hours across the autumn change", () => {
  const monday = slots(paris, { ...thirty, windowDays: 60 }, [], { from: "2026-10-26", to: "2026-10-26" }, monday8am);
  assert.equal(monday[0]!.start, "2026-10-26T08:00:00.000Z"); // 9:00 in winter time
});

test("weekly ranges are checked", () => {
  assert.ok(validRanges([[540, 720], [780, 1080]]));
  assert.ok(!validRanges([[540, 720], [700, 1080]]));
  assert.ok(!validRanges([[720, 540]]));
  assert.ok(!validRanges([[0, 1500]]));
  assert.ok(!validRanges("x"));
});

test("the daily limit closes a day once the type has that many bookings, on the host's calendar", () => {
  const limited = { ...thirty, dailyLimit: 2 };
  const range = { from: "2026-10-12", to: "2026-10-13" };
  const at = (iso: string, sameType = true) => ({ start: Date.parse(iso), end: Date.parse(iso) + 1800000, ...(sameType ? { sameType: Date.parse(iso) } : {}) });
  // One booking of this type on Monday: Monday still open.
  const one = slots(paris, limited, [at("2026-10-12T12:00:00Z")], range, monday8am);
  assert.ok(one.some(s => s.start.startsWith("2026-10-12")));
  // Two: Monday closed, Tuesday open.
  const two = slots(paris, limited, [at("2026-10-12T12:00:00Z"), at("2026-10-12T13:00:00Z")], range, monday8am);
  assert.equal(two.filter(s => s.start.startsWith("2026-10-12")).length, 0);
  assert.equal(two.filter(s => s.start.startsWith("2026-10-13")).length, 14);
  // Bookings of other types take their time but do not count.
  const others = slots(paris, limited, [at("2026-10-12T12:00:00Z", false), at("2026-10-12T13:00:00Z", false)], range, monday8am);
  assert.ok(others.some(s => s.start.startsWith("2026-10-12")));
  // 0 is no limit.
  assert.ok(slots(paris, thirty, [at("2026-10-12T12:00:00Z"), at("2026-10-12T13:00:00Z")], range, monday8am).some(s => s.start.startsWith("2026-10-12")));
});

test("the daily limit counts days in the host's time zone, across a daylight-saving change", () => {
  // Open all day on the autumn change (25 Oct 2026, a 25-hour day in Paris).
  const allDay: Availability = { weekly: Array.from({ length: 7 }, () => [[0, 1440]]), overrides: {}, zone: "Europe/Paris" };
  const limited = { ...thirty, noticeMinutes: 0, windowDays: 60, dailyLimit: 2 };
  const range = { from: "2026-10-24", to: "2026-10-26" };
  const at = (iso: string) => ({ start: Date.parse(iso), end: Date.parse(iso) + 1800000, sameType: Date.parse(iso) });
  // 00:30 on the 25th (summer time, 22:30 UTC the day before) and 23:30 on
  // the 25th (winter time, 22:30 UTC): both on Sunday the 25th in Paris.
  const found = slots(allDay, limited, [at("2026-10-24T22:30:00Z"), at("2026-10-25T22:30:00Z")], range, monday8am);
  const days = new Set(found.map(s => wall(Date.parse(s.start), "Europe/Paris").date));
  assert.deepEqual([...days].sort(), ["2026-10-24", "2026-10-26"]);
  // The same two instants for a host in Montreal fall on the 24th and the
  // 25th (18:30 each): neither day is full.
  const montreal = slots({ ...allDay, zone: "America/Montreal" }, limited, [at("2026-10-24T22:30:00Z"), at("2026-10-25T22:30:00Z")], range, monday8am);
  assert.deepEqual([...new Set(montreal.map(s => wall(Date.parse(s.start), "America/Montreal").date))].sort(), ["2026-10-24", "2026-10-25", "2026-10-26"]);
  // Spring change (29 Mar 2026, a 23-hour day): still one day.
  const spring = slots(allDay, { ...limited, dailyLimit: 1 }, [at("2026-03-28T23:30:00Z")], { from: "2026-03-29", to: "2026-03-30" }, Date.parse("2026-03-20T00:00:00Z"));
  assert.deepEqual([...new Set(spring.map(s => wall(Date.parse(s.start), "Europe/Paris").date))], ["2026-03-30"]);
});
