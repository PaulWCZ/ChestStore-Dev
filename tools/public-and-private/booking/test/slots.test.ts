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
const thirty: Rules = { duration: 30, interval: 30, bufferBefore: 0, bufferAfter: 0, noticeMinutes: 120, windowDays: 30 };
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
