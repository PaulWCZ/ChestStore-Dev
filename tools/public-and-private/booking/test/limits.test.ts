import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../lib/app-error.ts";
import * as b from "../lib/booking.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { openHost } from "./support/host.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines } from "./support/members.ts";

// The limits of a booking type — per day, notice, window, buffers — shape
// the free times and hold again when booking, even when visitors race.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ chest: { timeZone: "Europe/Paris" }, members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate hosts, bookings, settings, form_counts cascade`;
});

async function rejects(step: Promise<unknown>, code: string) {
  await assert.rejects(step, (e: unknown) => e instanceof AppError && e.code === code);
}

// Monday 5 October 2026, 08:00 in Paris.
const monday = Date.parse("2026-10-05T06:00:00Z");
const guest = (n: number) => ({ name: `Guest ${n}`, email: `guest${n}@example.com`, note: "", zone: "Europe/Paris", language: "en" });
const base = { title: "Showroom visit", slug: "showroom", description: "", duration: 30, interval: 30, locationKind: "place", location: "", bufferBefore: 0, bufferAfter: 0, noticeMinutes: 0, windowDays: 30, color: "sun", active: true };

async function ready(limits: Partial<typeof base> & { dailyLimit?: number } = {}) {
  const sql = database.sql;
  const host = await openHost(sql, asMember(ines), { title: "Meeting", slug: "meeting" });
  const type = await b.createType(sql, asMember(ines), { ...base, ...limits });
  return { sql, host, type };
}

// Tuesday 6 October in Paris: 9:00, 9:30, … (UTC+2).
const tuesday = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 6, hour - 2, minute)).toISOString();

test("a daily limit is saved with the type and bounded", async () => {
  const { sql, type } = await ready({ dailyLimit: 3 });
  assert.equal(type.dailyLimit, 3);
  assert.equal((await b.typesOf(sql, ines.id)).find(t => t.id === type.id)!.dailyLimit, 3);
  await rejects(b.updateType(sql, asMember(ines), type.id, { ...base, dailyLimit: 51 }), "invalid");
  await rejects(b.updateType(sql, asMember(ines), type.id, { ...base, dailyLimit: -1 }), "invalid");
  await rejects(b.updateType(sql, asMember(ines), type.id, { ...base, dailyLimit: 1.5 }), "invalid");
  // Left out (a caller from before): no limit.
  assert.equal((await b.updateType(sql, asMember(ines), type.id, base)).dailyLimit, 0);
});

test("once a type has its bookings of the day, the day has no more free time for it — other types keep theirs", async () => {
  const { sql, host, type } = await ready({ dailyLimit: 2 });
  const [other] = await b.typesOf(sql, ines.id);
  await b.book(sql, host, type, { ...guest(1), start: tuesday(9) }, monday);
  assert.ok((await b.freeTimes(sql, host, type, "2026-10-06", "2026-10-06", monday)).length > 0);
  await b.book(sql, host, type, { ...guest(2), start: tuesday(15) }, monday);
  assert.equal((await b.freeTimes(sql, host, type, "2026-10-06", "2026-10-06", monday)).length, 0);
  // Booking the day anyway (an old page) is refused.
  await rejects(b.book(sql, host, type, { ...guest(3), start: tuesday(11) }, monday), "taken");
  // The next day is open; another type on the same day too.
  assert.ok((await b.freeTimes(sql, host, type, "2026-10-07", "2026-10-07", monday)).length > 0);
  assert.ok((await b.freeTimes(sql, host, other!, "2026-10-06", "2026-10-06", monday)).length > 0);
  // A cancelled booking gives its place back.
  const [first] = await b.bookings(sql, asMember(ines), { scope: "upcoming", now: monday });
  await b.cancelByHost(sql, asMember(ines), first!.id, "", monday);
  assert.ok((await b.freeTimes(sql, host, type, "2026-10-06", "2026-10-06", monday)).length > 0);
});

test("a guest moves within a full day, but not onto another full day", async () => {
  const { sql, host, type } = await ready({ dailyLimit: 1 });
  const tue = await b.book(sql, host, type, { ...guest(1), start: tuesday(9) }, monday);
  await b.book(sql, host, type, { ...guest(2), start: new Date(Date.parse(tuesday(9)) + 86400000).toISOString() }, monday);
  // Same day, another time: their own booking does not count against them.
  const moved = await b.moveByGuest(sql, tue.secret, tuesday(10), monday);
  assert.equal(moved.booking.startsAt.toISOString(), tuesday(10));
  // Wednesday is full.
  await rejects(b.moveByGuest(sql, tue.secret, new Date(Date.parse(tuesday(11)) + 86400000).toISOString(), monday), "taken");
});

test("minimum notice and how far ahead hold when booking, not only on the page", async () => {
  const { sql, host, type } = await ready({ noticeMinutes: 24 * 60, windowDays: 3 });
  // Tuesday 9:00 is 25 hours ahead: fine. Monday 16:00 is 8 hours ahead: too soon.
  await b.book(sql, host, type, { ...guest(1), start: tuesday(9) }, monday);
  await rejects(b.book(sql, host, type, { ...guest(2), start: "2026-10-05T14:00:00.000Z" }, monday), "taken");
  // Thursday is within 3 days; Friday the 9th is not.
  await b.book(sql, host, type, { ...guest(3), start: "2026-10-08T07:00:00.000Z" }, monday);
  await rejects(b.book(sql, host, type, { ...guest(4), start: "2026-10-09T07:00:00.000Z" }, monday), "taken");
});

test("buffers before and after hold when booking", async () => {
  const { sql, host, type } = await ready({ bufferBefore: 15, bufferAfter: 30 });
  await b.book(sql, host, type, { ...guest(1), start: tuesday(10) }, monday);
  // 9:30 would end at 10:00 plus its 30 minutes after: refused. 11:00 ends the 30 after 10:30.
  await rejects(b.book(sql, host, type, { ...guest(2), start: tuesday(9, 30) }, monday), "taken");
  await b.book(sql, host, type, { ...guest(3), start: tuesday(11, 30) }, monday);
  await rejects(b.book(sql, host, type, { ...guest(4), start: tuesday(11) }, monday), "taken");
});

test("visitors racing for the last places of a day: never more than the limit", async () => {
  const { sql, host, type } = await ready({ dailyLimit: 2 });
  // Six visitors at once, each on a different time of the same day.
  const times = [9, 10, 11, 14, 15, 16].map(h => tuesday(h));
  const results = await Promise.allSettled(times.map((start, i) => b.book(sql, host, type, { ...guest(i), start }, monday)));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 2);
  for (const r of results) if (r.status === "rejected") assert.equal((r.reason as AppError).code, "taken");
  const rows = await sql<{ n: number }[]>`select count(*)::int as n from bookings where type_id = ${type.id} and status = 'confirmed'`;
  assert.equal(rows[0]!.n, 2);
});

test("moves racing with bookings for the last place of a day: never more than the limit", async () => {
  const { sql, host, type } = await ready({ dailyLimit: 1 });
  const wednesday = (h: number) => new Date(Date.parse(tuesday(h)) + 86400000).toISOString();
  const mine = await b.book(sql, host, type, { ...guest(1), start: wednesday(9) }, monday);
  // Tuesday has one place: a guest moving there and two new visitors race for it.
  const results = await Promise.allSettled([
    b.moveByGuest(sql, mine.secret, tuesday(10), monday),
    b.book(sql, host, type, { ...guest(2), start: tuesday(11) }, monday),
    b.book(sql, host, type, { ...guest(3), start: tuesday(14) }, monday),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const rows = await sql<{ n: number }[]>`select count(*)::int as n from bookings where type_id = ${type.id} and status = 'confirmed' and starts_at >= '2026-10-05T22:00:00Z' and starts_at < '2026-10-06T22:00:00Z'`;
  assert.equal(rows[0]!.n, 1);
});

test("the limit is per type and per host: Hugo's bookings do not fill Inès's day", async () => {
  const { sql, host, type } = await ready({ dailyLimit: 1 });
  const hugoHost = await openHost(sql, asMember(hugo), { title: "Meeting", slug: "meeting" });
  const hugoType = await b.createType(sql, asMember(hugo), { ...base, dailyLimit: 1 });
  await b.book(sql, hugoHost, hugoType, { ...guest(1), start: tuesday(9) }, monday);
  await b.book(sql, host, type, { ...guest(2), start: tuesday(9) }, monday);
  assert.equal((await b.freeTimes(sql, host, type, "2026-10-06", "2026-10-06", monday)).length, 0);
});
