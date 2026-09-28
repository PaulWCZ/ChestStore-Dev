import assert from "node:assert/strict";
import { test } from "node:test";
import { calendar, escape, fold } from "../lib/ics.ts";

test("text is escaped as RFC 5545 asks", () => {
  assert.equal(escape("a;b,c\\d\ne"), "a\;b\\,c\\\\d\\ne");
});

test("long lines fold at 75 octets without cutting a character", () => {
  const line = "SUMMARY:" + "é".repeat(80);
  const folded = fold(line);
  for (const piece of folded.split("\r\n")) assert.ok(new TextEncoder().encode(piece).length <= 75);
  assert.equal(folded.split("\r\n").map((p, i) => (i === 0 ? p : p.slice(1))).join(""), line);
});

test("a calendar holds the event in UTC, lines ending in CRLF", () => {
  const text = calendar([{ uid: "b1@booking", sequence: 2, start: new Date("2026-10-01T08:00:00Z"), end: new Date("2026-10-01T08:30:00Z"), summary: "First call, Camille", location: "12 rue X" }], { now: new Date("2026-09-01T00:00:00Z"), method: "PUBLISH" });
  assert.match(text, /^BEGIN:VCALENDAR\r\n/u);
  assert.match(text, /DTSTART:20261001T080000Z\r\n/u);
  assert.match(text, /SUMMARY:First call\\, Camille\r\n/u);
  assert.match(text, /SEQUENCE:2\r\n/u);
  assert.match(text, /STATUS:CONFIRMED/u);
  assert.ok(!/[^\r]\n/u.test(text));
});

test("a cancelled event says so", () => {
  const text = calendar([{ uid: "b1@booking", sequence: 3, start: new Date(0), end: new Date(60000), summary: "x", cancelled: true }], { method: "CANCEL" });
  assert.match(text, /METHOD:CANCEL/u);
  assert.match(text, /STATUS:CANCELLED/u);
});
