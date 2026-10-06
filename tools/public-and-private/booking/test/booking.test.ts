import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as b from "../src/lib/booking.ts";
import { AppError } from "../src/lib/app-error.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { openHost } from "./support/host.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, nora } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate hosts, bookings, settings, form_counts cascade`;
});

// Monday 5 October 2026, 08:00 in Paris (UTC+2).
const monday = Date.parse("2026-10-05T06:00:00Z");
const first = { title: "30-minute meeting", slug: "meeting" };
const guest = { name: "Alex Doe", email: "alex@example.com", note: "", zone: "America/Montreal", language: "en" };

async function refuses(step: Promise<unknown>, code: string) {
  await assert.rejects(step, (e: unknown) => e instanceof AppError && e.code === code);
}

async function ready() {
  const sql = database.sql;
  const host = await openHost(sql, asMember(ines), first);
  const [type] = await b.typesOf(sql, ines.id);
  return { sql, host, type: type! };
}

test("a host's page is made the first time they open the tool: an address from their name, weekday hours, one type", async () => {
  const { sql, host, type } = await ready();
  assert.equal(host.slug, "ines-moreau");
  assert.equal(host.zone, "Europe/Paris");
  assert.equal(type.title, "30-minute meeting");
  // A second opening changes nothing.
  assert.equal((await b.ensureHost(sql, asMember(ines), first)).slug, "ines-moreau");
  assert.equal((await b.typesOf(sql, ines.id)).length, 1);
  // Nobody without the role gets one.
  await refuses(b.ensureHost(sql, asMember(nora), first), "forbidden");
});

test("free times follow the host's hours in their zone, after the notice", async () => {
  const { sql, host, type } = await ready();
  const found = await b.freeTimes(sql, host, type, "2026-10-05", "2026-10-05", monday);
  // 4 hours of notice from 08:00: the first time is 12:00 (Paris), then the afternoon.
  assert.equal(found[0]!.start, "2026-10-05T10:00:00.000Z");
  assert.equal(found.length, 1 + 7);
  assert.deepEqual(await b.freeTimes(sql, host, type, "2026-10-10", "2026-10-11", monday), []);
});

test("a booking takes the time; the same time cannot be booked twice", async () => {
  const { sql, host, type } = await ready();
  const start = "2026-10-06T07:00:00.000Z";
  const { booking, secret } = await b.book(sql, host, type, { ...guest, start }, monday);
  assert.equal(booking.guestName, "Alex Doe");
  assert.equal(booking.endsAt.toISOString(), "2026-10-06T07:30:00.000Z");
  assert.equal(secret.length, 32);
  await refuses(b.book(sql, host, type, { ...guest, start }, monday), "taken");
  const free = await b.freeTimes(sql, host, type, "2026-10-06", "2026-10-06", monday);
  assert.ok(!free.some(s => s.start === start));
});

test("two visitors on the same time at once: the database keeps one", async () => {
  const { sql, host, type } = await ready();
  const start = "2026-10-06T08:00:00.000Z";
  const results = await Promise.allSettled([b.book(sql, host, type, { ...guest, start }, monday), b.book(sql, host, type, { ...guest, email: "sam@example.com", start }, monday)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.equal((rejected.reason as AppError).code, "taken");
});

test("a time that is not offered is refused: outside the hours, too soon, or not on the grid", async () => {
  const { sql, host, type } = await ready();
  await refuses(b.book(sql, host, type, { ...guest, start: "2026-10-06T05:00:00.000Z" }, monday), "taken");
  await refuses(b.book(sql, host, type, { ...guest, start: "2026-10-05T07:00:00.000Z" }, monday), "taken");
  await refuses(b.book(sql, host, type, { ...guest, start: "2026-10-06T07:10:00.000Z" }, monday), "taken");
  await refuses(b.book(sql, host, type, { ...guest, start: "nonsense" }, monday), "invalid");
  await refuses(b.book(sql, host, type, { ...guest, email: "not an email", start: "2026-10-06T07:00:00.000Z" }, monday), "invalid_email");
});

test("buffers keep time around a booking, for this type and the others", async () => {
  const { sql, host, type } = await ready();
  const long = await b.updateType(sql, asMember(ines), type.id, { title: "Visit", slug: "visit", description: "", duration: 30, interval: 30, locationKind: "place", location: "12 rue des Lilas", bufferBefore: 0, bufferAfter: 30, noticeMinutes: 0, windowDays: 30, color: "leaf", active: true });
  await b.book(sql, host, long, { ...guest, start: "2026-10-06T07:00:00.000Z" }, monday);
  const free = (await b.freeTimes(sql, host, long, "2026-10-06", "2026-10-06", monday)).map(s => s.start);
  assert.ok(!free.includes("2026-10-06T07:30:00.000Z"));
  assert.ok(free.includes("2026-10-06T08:00:00.000Z"));
});

test("a day off and a holiday remove the day's times", async () => {
  const { sql, host, type } = await ready();
  await b.saveOverride(sql, asMember(ines), { day: "2026-10-06", ranges: [], note: "Dentist" });
  await b.daysOff(sql, asMember(ines), { from: "2026-10-07", to: "2026-10-08", note: "Holiday" });
  await b.saveOverride(sql, asMember(ines), { day: "2026-10-10", ranges: [[600, 660]], note: "Open day" });
  const days = new Set((await b.freeTimes(sql, host, type, "2026-10-06", "2026-10-10", monday)).map(s => s.start.slice(0, 10)));
  assert.deepEqual([...days], ["2026-10-09", "2026-10-10"]);
  await b.removeOverride(sql, asMember(ines), "2026-10-06");
  assert.equal((await b.overridesOf(sql, ines.id, "2026-10-01")).length, 3);
});

test("the guest's link cancels, or moves to another free time, and stops at the start", async () => {
  const { sql, host, type } = await ready();
  const { booking, secret } = await b.book(sql, host, type, { ...guest, start: "2026-10-06T07:00:00.000Z" }, monday);
  const moved = await b.moveByGuest(sql, secret, "2026-10-06T07:30:00.000Z", monday);
  assert.equal(moved.booking.id, booking.id);
  assert.equal(moved.before.toISOString(), "2026-10-06T07:00:00.000Z");
  assert.equal(moved.booking.moves, 1);
  // The old time is free again.
  assert.ok((await b.freeTimes(sql, host, type, "2026-10-06", "2026-10-06", monday)).some(s => s.start === "2026-10-06T07:00:00.000Z"));
  await refuses(b.cancelByGuest(sql, secret, "", Date.parse("2026-10-06T08:00:00Z")), "too_late");
  const cancelled = await b.cancelByGuest(sql, secret, "Something came up", monday);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancelledBy, "guest");
  await refuses(b.cancelByGuest(sql, secret, "", monday), "too_late");
  await refuses(b.cancelByGuest(sql, "x".repeat(32), "", monday), "not_found");
});

test("hosts see their bookings, administrators everyone's; a host cancels only their own", async () => {
  const { sql, host, type } = await ready();
  await openHost(sql, asMember(hugo), first);
  const { booking } = await b.book(sql, host, type, { ...guest, start: "2026-10-06T07:00:00.000Z" }, monday);
  assert.equal((await b.bookings(sql, asMember(ines), { scope: "upcoming", now: monday })).length, 1);
  assert.equal((await b.bookings(sql, asMember(hugo), { scope: "upcoming", now: monday })).length, 0);
  assert.equal((await b.bookings(sql, asMember(camille), { scope: "upcoming", all: true, now: monday })).length, 1);
  await refuses(b.bookings(sql, asMember(hugo), { scope: "upcoming", all: true }), "forbidden");
  await refuses(b.cancelByHost(sql, asMember(hugo), booking.id, "", monday), "not_found");
  const done = await b.cancelByHost(sql, asMember(camille), booking.id, "Office closed", monday);
  assert.equal(done.cancelledBy, "host");
  assert.equal((await b.bookings(sql, asMember(ines), { scope: "cancelled" })).length, 1);
});

test("addresses are unique, and never one of the tool's own", async () => {
  const { sql } = await ready();
  await openHost(sql, asMember(hugo), first);
  await refuses(b.saveHost(sql, asMember(hugo), { slug: "ines-moreau", zone: "Europe/Paris", welcome: "", listed: true }), "slug_taken");
  await refuses(b.saveHost(sql, asMember(hugo), { slug: "chest", zone: "Europe/Paris", welcome: "", listed: true }), "invalid");
  await refuses(b.saveHost(sql, asMember(hugo), { slug: "hugo", zone: "Mars/Olympus", welcome: "", listed: true }), "invalid");
  await b.saveHost(sql, asMember(hugo), { slug: "hugo", zone: "America/Montreal", welcome: "Hi!", listed: false });
  assert.equal((await b.publicHost(sql, "hugo"))?.host.zone, "America/Montreal");
  assert.deepEqual((await b.listedHosts(sql)).map(h => h.slug), ["ines-moreau"]);
  await refuses(b.createType(sql, asMember(ines), { title: "Other", slug: "meeting", description: "", duration: 30, locationKind: "video", location: "", bufferBefore: 0, bufferAfter: 0, noticeMinutes: 0, windowDays: 30, color: "sky", active: true }), "slug_taken");
  await refuses(b.createType(sql, asMember(ines), { title: "Call", slug: "", description: "", duration: 30, locationKind: "video", location: "javascript:alert(1)", bufferBefore: 0, bufferAfter: 0, noticeMinutes: 0, windowDays: 30, color: "sky", active: true }), "invalid_link");
});

test("a phone call asks for the guest's number", async () => {
  const { sql, host, type } = await ready();
  const call = await b.updateType(sql, asMember(ines), type.id, { title: "Call", slug: "call", description: "", duration: 30, locationKind: "phone", location: "", bufferBefore: 0, bufferAfter: 0, noticeMinutes: 0, windowDays: 30, color: "sky", active: true });
  await refuses(b.book(sql, host, call, { ...guest, start: "2026-10-06T07:00:00.000Z", phone: "call me" }, monday), "invalid_phone");
  const { booking } = await b.book(sql, host, call, { ...guest, start: "2026-10-06T07:00:00.000Z", phone: "+1 (514) 555-0101" }, monday);
  assert.equal(booking.guestPhone, "+1 (514) 555-0101");
});

test("the calendar feed opens with its token only, and a new one replaces it", async () => {
  const { sql, host, type } = await ready();
  await b.book(sql, host, type, { ...guest, start: "2026-10-06T07:00:00.000Z" }, monday);
  const token = await b.newFeed(sql, asMember(ines));
  assert.equal((await b.feed(sql, token, monday))?.bookings.length, 1);
  const again = await b.newFeed(sql, asMember(ines));
  assert.equal(await b.feed(sql, token, monday), null);
  assert.ok(await b.feed(sql, again, monday));
  await b.stopFeed(sql, asMember(ines));
  assert.equal(await b.feed(sql, again, monday), null);
});

test("reminders are taken once, for bookings made well before", async () => {
  const { sql, host, type } = await ready();
  await b.book(sql, host, type, { ...guest, start: "2026-10-07T07:00:00.000Z" }, monday);
  // Pretend it was booked a week before.
  await sql`update bookings set created_at = '2026-09-28T00:00:00Z'`;
  const tuesday = Date.parse("2026-10-06T08:00:00Z");
  assert.equal((await b.dueReminders(sql, tuesday)).length, 1);
  assert.equal((await b.dueReminders(sql, tuesday)).length, 0);
});

test("bookings over for longer than kept are deleted; a guest's data can be erased", async () => {
  const { sql, host, type } = await ready();
  await b.book(sql, host, type, { ...guest, start: "2026-10-06T07:00:00.000Z" }, monday);
  await b.book(sql, host, type, { ...guest, email: "Sam@Example.com", start: "2026-10-06T08:00:00.000Z" }, monday);
  assert.equal(await b.cleanup(sql, Date.parse("2027-10-07T00:00:00Z")), 0);
  await refuses(b.eraseGuest(sql, asMember(ines), "sam@example.com"), "forbidden");
  assert.equal((await b.eraseGuest(sql, asMember(camille), "sam@example.com")).length, 1);
  assert.equal(await b.cleanup(sql, Date.parse("2028-11-01T00:00:00Z")), 1);
});

test("the form's guard stops a visitor after a few bookings an hour", async () => {
  const { sql } = await ready();
  for (let i = 0; i < b.formLimits.perVisitorHour; i++) await b.guard(sql, "203.0.113.9");
  await refuses(b.guard(sql, "203.0.113.9"), "too_many");
  await b.guard(sql, "198.51.100.4");
});

test("visitors the front did not name count together, under the hourly ceiling and the daily cap kept in the database", async () => {
  const { sql } = await ready();
  // No counter of their own: eight bookings an hour would close the form to all.
  for (let i = 0; i < b.formLimits.perVisitorHour + 2; i++) await b.guard(sql, "unknown");
  await sql`update form_counts set count = ${b.formLimits.perHour} where key = 'all'`;
  await refuses(b.guard(sql, "unknown"), "too_many");
  // The earlier hours of the last day count too, for everyone…
  await sql`delete from form_counts`;
  const now = Date.now();
  const hour = Math.floor(now / 3600000) * 3600000;
  await sql`insert into form_counts (key, hour, count) values ('all', ${new Date(hour - 5 * 3600000)}, ${b.formLimits.perDay})`;
  await refuses(b.guard(sql, "203.0.113.20", now), "too_many");
  // …and a day later they are forgotten.
  await b.guard(sql, "203.0.113.21", now + 86400000);
});

test("the public forms' guard: the Chest counts when it can, the tool's own counters otherwise", async () => {
  const { admit, checkForm, formToken } = await import("../src/lib/guard.ts");
  const { sql } = await ready();
  // A form sent within 3 seconds is not refused: the answer waits the rest
  // (a clock that moves as it sleeps).
  let clock = Date.now();
  const slept: number[] = [];
  await checkForm(formToken(clock - 1000), () => clock, async ms => { slept.push(ms); clock += ms; });
  assert.ok(slept.length === 1 && slept[0]! >= 2000 && slept[0]! <= 2100, `waited ${slept[0]}`);
  // In time: no wait at all.
  await checkForm(formToken(clock - 5000), () => clock, async ms => { slept.push(ms); });
  assert.equal(slept.length, 1);
  await assert.rejects(checkForm("nonsense"), (e: unknown) => e instanceof AppError && e.code === "invalid");
  // The visitor's address is the one the Chest's front saw
  // (Chest-Visitor-Address, visitors.address()), never X-Forwarded-For,
  // which the visitor writes: a new one at each request changes nothing.
  const h = new Headers({ "chest-visitor-address": "203.0.113.50" });
  for (let i = 0; i < b.formLimits.perVisitorHour; i++) await admit(sql, new Headers({ "chest-visitor-address": "203.0.113.50", "x-forwarded-for": `198.51.100.${i}` }), "book");
  await refuses(admit(sql, h, "book"), "too_many");
  // Another visitor is not held by the first.
  await admit(sql, new Headers({ "chest-visitor-address": "198.51.100.50" }), "book");
});
