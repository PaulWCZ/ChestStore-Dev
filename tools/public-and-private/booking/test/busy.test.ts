import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "../src/lib/app-error.ts";
import * as b from "../src/lib/booking.ts";
import * as calendars from "../src/lib/calendars.ts";
import * as publish from "../src/lib/publish.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { openHost } from "./support/host.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, nora } from "./support/members.ts";

// What keeps a host busy besides Booking: times they block, their other
// calendars (Google, Outlook, Apple) read through the declared network;
// and what Booking tells the Chest's calendar.

let database: TestDatabase;
let chest: FakeChest;
// What each calendar address answers in the test at hand (reset before each).
let routes: Record<string, (request: Request) => Response | Promise<Response>> = {};
const asked: string[] = [];
const declared = (JSON.parse(readFileSync(join(import.meta.dirname, "..", "chest.json"), "utf8")) as { network: string[] }).network;
async function answer(request: Request): Promise<Response> {
  asked.push(request.url);
  const route = routes[request.url];
  return route ? route(request) : new Response("no", { status: 404 });
}
before(async () => {
  database = await testDatabase();
  // The hosts chest.json declares, answered as through the Chest's egress
  // proxy (SDK studio.15): the tool's own plain fetch() reaches them.
  chest = await fakeChest({ chest: { timeZone: "Europe/Paris" }, tool: "booking", members: everyone, capabilities: ["members", "notifications", "calendar", "mail"], calendar: { domain: "atelier.test", toolTitle: "Booking", company: "Atelier" }, network: Object.fromEntries(declared.map(host => [host, answer])) });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate hosts, bookings, settings, form_counts cascade`;
  chest.calendar.clear();
  routes = {};
  asked.length = 0;
  chest.egress.length = 0;
});

async function refuses(step: Promise<unknown>, code: string) {
  await assert.rejects(step, (e: unknown) => e instanceof AppError && e.code === code);
}

// Monday 5 October 2026, 08:00 in Paris (UTC+2).
const monday = Date.parse("2026-10-05T06:00:00Z");
const guest = { name: "Alex Doe", email: "alex@example.com", note: "", zone: "Europe/Paris", language: "en" };
const base = { title: "Call", slug: "call", description: "", duration: 60, interval: 60, locationKind: "video", location: "", bufferBefore: 0, bufferAfter: 0, noticeMinutes: 0, windowDays: 60, color: "sky", active: true };

async function ready(extra: Record<string, unknown> = {}) {
  const sql = database.sql;
  const host = await openHost(sql, asMember(ines), { title: "Meeting", slug: "meeting" });
  const type = await b.createType(sql, asMember(ines), { ...base, ...extra });
  return { sql, host, type };
}
const starts = (list: { start: string }[]) => list.map(s => s.start.slice(11, 16));

test("a host blocks an hour: it is not offered, whatever the type; they can free it again", async () => {
  const { sql, host, type } = await ready();
  const block = await b.blockTime(sql, asMember(ines), { day: "2026-10-06", from: 600, to: 660, note: "Dentist" }, monday);
  assert.equal(block.start.toISOString(), "2026-10-06T08:00:00.000Z");
  // 9:00, 11:00 (not 10:00), 14:00… in Paris.
  assert.deepEqual(starts(await b.freeTimes(sql, host, type, "2026-10-06", "2026-10-06", monday)), ["07:00", "09:00", "12:00", "13:00", "14:00"]);
  await refuses(b.book(sql, host, type, { ...guest, start: "2026-10-06T08:00:00.000Z" }, monday), "taken");
  assert.deepEqual((await b.blocksOf(sql, ines.id, new Date(monday))).map(x => x.note), ["Dentist"]);
  // Only the host frees it; a wrong range, a past time are refused.
  await refuses(b.unblock(sql, asMember(hugo), block.id), "not_found");
  await refuses(b.blockTime(sql, asMember(ines), { day: "2026-10-06", from: 660, to: 600, note: "" }, monday), "invalid_range");
  await refuses(b.blockTime(sql, asMember(ines), { day: "2026-10-01", from: 600, to: 660, note: "" }, monday), "too_late");
  await refuses(b.blockTime(sql, asMember(nora), { day: "2026-10-06", from: 600, to: 660, note: "" }, monday), "forbidden");
  await b.unblock(sql, asMember(ines), block.id);
  assert.ok(starts(await b.freeTimes(sql, host, type, "2026-10-06", "2026-10-06", monday)).includes("08:00"));
});

// A Google calendar as its secret address serves it: a weekly meeting on
// Tuesdays 10:00–11:00 Paris, and one on Wednesday in UTC.
const google = ["BEGIN:VCALENDAR", "PRODID:-//Google Inc//Google Calendar 70.9054//EN", "VERSION:2.0",
  "BEGIN:VEVENT", "DTSTART;TZID=Europe/Paris:20260929T100000", "DTEND;TZID=Europe/Paris:20260929T110000", "RRULE:FREQ=WEEKLY;BYDAY=TU", "UID:team@google.com", "SUMMARY:Secret project review", "END:VEVENT",
  "BEGIN:VEVENT", "DTSTART:20261007T120000Z", "DTEND:20261007T130000Z", "UID:lunch@google.com", "SUMMARY:Lunch with the bank", "END:VEVENT",
  "END:VCALENDAR"].join("\r\n");
const secret = "https://calendar.google.com/calendar/ical/ines%40atelier.test/private-0123456789abcdef/basic.ics";


test("the host's Google calendar: busy times are kept (never titles) and not offered; its address is checked, read again, disconnected", async () => {
  const { sql, host, type } = await ready();
  let body = google;
  routes = { [secret]: () => new Response(body, { headers: { "content-type": "text/calendar" } }) };
  const linked = await calendars.connect(sql, asMember(ines), secret.replace("https://", "webcal://"), monday);
  // One request, through the Chest's egress to a declared host: read once.
  assert.deepEqual(asked, [secret]);
  assert.deepEqual(chest.egress, [{ method: "GET", url: secret, status: 200 }]);
  assert.equal(linked.provider, "calendar.google.com");
  assert.ok(!linked.hint.includes("private-0123456789abcdef"), "the secret part is never shown again");
  assert.equal(linked.error, null);
  // Only instants are stored.
  const kept = await sql`select * from busy`;
  assert.ok(kept.length > 5);
  assert.ok(!JSON.stringify(kept).includes("Secret project"));
  assert.deepEqual(starts(await b.freeTimes(sql, host, type, "2026-10-06", "2026-10-06", monday)), ["07:00", "09:00", "12:00", "13:00", "14:00"]);
  assert.ok(!starts(await b.freeTimes(sql, host, type, "2026-10-07", "2026-10-07", monday)).includes("12:00"));
  // The meeting is cancelled there: the next read frees the time.
  body = google.replace("RRULE:FREQ=WEEKLY;BYDAY=TU", "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261001T000000Z");
  assert.equal(await calendars.refreshDue(sql, { olderThanMinutes: 10, now: monday + 11 * 60000 }), 1);
  assert.ok(starts(await b.freeTimes(sql, host, type, "2026-10-06", "2026-10-06", monday)).includes("08:00"));
  // Read a minute ago: not again.
  assert.equal(await calendars.refreshDue(sql, { olderThanMinutes: 10, now: monday + 12 * 60000 }), 0);
  // The address stops working: the busy times known stay, the error shows.
  body = "<!doctype html><title>Sign in</title>";
  assert.equal(await calendars.refresh(sql, linked.id, monday + 30 * 60000), "not_calendar");
  const [after] = await calendars.calendarsOf(sql, ines.id, monday + 30 * 60000);
  assert.equal(after!.error, "not_calendar");
  assert.equal(after!.stale, true);
  assert.ok((await sql`select 1 from busy`).length > 0);
  // Disconnected: its busy times go with it.
  await refuses(calendars.disconnect(sql, asMember(hugo), linked.id), "not_found");
  await calendars.disconnect(sql, asMember(ines), linked.id);
  assert.equal((await sql`select 1 from busy`).length, 0);
});

test("only the declared calendar hosts, over https; errors say what went wrong; three calendars at most", async () => {
  const { sql } = await ready();
  for (const bad of ["http://calendar.google.com/x.ics", "https://evil.example/cal.ics", "https://user:pw@calendar.google.com/x.ics", "https://calendar.google.com.evil.example/x.ics", "not an address"]) {
    await refuses(calendars.connect(sql, asMember(ines), bad), "calendar_not_allowed");
  }
  assert.ok(calendars.allowedHost("p42-caldav.icloud.com") && calendars.allowedHost("outlook.office365.com") && !calendars.allowedHost("icloud.com"));
  routes = {
    "https://outlook.office365.com/owa/calendar/gone/calendar.ics": () => new Response("", { status: 404 }),
    "https://outlook.live.com/owa/calendar/refused/calendar.ics": () => new Response("", { status: 403, headers: { "chest-egress": "refused; reason=undeclared" } }),
    "https://p01-caldav.icloud.com/published/2/redirect": () => new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } }),
    "https://p01-caldav.icloud.com/published/2/large": () => new Response("x", { headers: { "content-length": String(6 * 1024 * 1024) } }),
    "https://p02-caldav.icloud.com/published/2/ok": () => new Response(google),
    "https://p03-caldav.icloud.com/published/2/ok": () => new Response(google),
    "https://p04-caldav.icloud.com/published/2/ok": () => new Response(google),
    "https://p05-caldav.icloud.com/published/2/ok": () => new Response(google),
    "https://p01-caldav.icloud.com/published/2/unreachable": () => { throw new TypeError("fetch failed"); },
  };
  await refuses(calendars.connect(sql, asMember(ines), "https://outlook.office365.com/owa/calendar/gone/calendar.ics", monday), "calendar_not_found");
  await refuses(calendars.connect(sql, asMember(ines), "https://outlook.live.com/owa/calendar/refused/calendar.ics", monday), "calendar_refused");
  await refuses(calendars.connect(sql, asMember(ines), "https://p01-caldav.icloud.com/published/2/redirect", monday), "calendar_refused");
  await refuses(calendars.connect(sql, asMember(ines), "https://p01-caldav.icloud.com/published/2/large", monday), "calendar_too_large");
  await refuses(calendars.connect(sql, asMember(ines), "https://p01-caldav.icloud.com/published/2/unreachable", monday), "calendar_unreachable");
  for (const n of [2, 3, 4]) await calendars.connect(sql, asMember(ines), `https://p0${n}-caldav.icloud.com/published/2/ok`, monday);
  await refuses(calendars.connect(sql, asMember(ines), "https://p05-caldav.icloud.com/published/2/ok", monday), "too_many_calendars");
  await refuses(calendars.connect(sql, asMember(nora), "https://p05-caldav.icloud.com/published/2/ok", monday), "forbidden");
});

test("through the Chest's egress: a redirect between declared hosts is followed; a host the Chest does not let through is said as unreachable", async () => {
  const { sql } = await ready();
  const moved = "https://outlook.live.com/owa/calendar/moved/calendar.ics";
  const there = "https://outlook.office365.com/owa/calendar/new/calendar.ics";
  routes = { [moved]: () => new Response(null, { status: 301, headers: { location: there } }), [there]: () => new Response(google) };
  const linked = await calendars.connect(sql, asMember(ines), moved, monday);
  assert.equal(linked.error, null);
  assert.deepEqual(chest.egress.map(e => [e.url, e.status]), [[moved, 301], [there, 200]]);
  // The proxy refuses what the owner did not approve: had the manifest
  // lost a host, its calendars would read as unreachable, never hang.
  await assert.rejects(fetch("https://calendar.example.org/x.ics"), TypeError);
  assert.equal(chest.egress.at(-1)?.refused, "undeclared");
});

test("the calendar hosts the tool checks are the ones chest.json declares to the Chest", () => {
  const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "chest.json"), "utf8")) as { network?: string[] };
  assert.deepEqual([...(manifest.network ?? [])].sort(), [...calendars.calendarHosts].sort());
});

test("a host's daily maximum holds across all their types", async () => {
  const { sql, host, type } = await ready();
  const other = await b.createType(sql, asMember(ines), { ...base, title: "Visit", slug: "visit" });
  await b.saveHostPrefs(sql, asMember(ines), { dailyMax: 2, emailMe: false });
  const me = (await b.hostOf(sql, ines.id))!;
  await b.book(sql, me, type, { ...guest, start: "2026-10-06T07:00:00.000Z" }, monday);
  await b.book(sql, me, other, { ...guest, start: "2026-10-06T09:00:00.000Z" }, monday);
  assert.deepEqual(await b.freeTimes(sql, me, type, "2026-10-06", "2026-10-06", monday), []);
  await refuses(b.book(sql, me, other, { ...guest, start: "2026-10-06T12:00:00.000Z" }, monday), "taken");
  assert.ok((await b.freeTimes(sql, me, other, "2026-10-07", "2026-10-07", monday)).length > 0);
  assert.equal(host.dailyMax, 0);
});

test("a room of its own for each video meeting; a payment link travels with the booking", async () => {
  const { sql, host, type } = await ready({ videoRooms: true, location: b.defaultRooms, paymentLink: "https://buy.stripe.com/test_abc" });
  assert.equal(type.location, b.defaultRooms);
  assert.ok(b.isPublicJitsi(b.roomLink(type.location, "x")));
  assert.equal(b.isPublicJitsi("https://meet.example.com/x"), false);
  // No silent default: the host chooses where rooms are made (meet.jit.si
  // asks whoever opens a room to sign in, since 2023).
  await refuses(b.createType(sql, asMember(ines), { ...base, slug: "rooms", locationKind: "video", videoRooms: true, location: "" }), "rooms_address");
  const one = await b.book(sql, host, type, { ...guest, start: "2026-10-06T07:00:00.000Z" }, monday, { company: "Atelier Martin" });
  const two = await b.book(sql, host, type, { ...guest, start: "2026-10-06T09:00:00.000Z" }, monday, { company: "Atelier Martin" });
  assert.match(one.booking.videoLink, /^https:\/\/meet\.jit\.si\/atelier-martin-[a-z0-9x]{12}$/u);
  assert.notEqual(one.booking.videoLink, two.booking.videoLink);
  assert.equal(b.meetingPlace(one.booking), one.booking.videoLink);
  assert.equal(one.booking.paymentLink, "https://buy.stripe.com/test_abc");
  // The host's own tool: {room} is where the name goes.
  assert.match(b.roomLink("https://whereby.com/{room}?embed", "Atelier"), /^https:\/\/whereby\.com\/atelier-[a-z0-9x]{12}\?embed$/u);
  await refuses(b.createType(sql, asMember(ines), { ...base, slug: "pay", paymentLink: "javascript:alert(1)" }), "invalid_link");
  await b.markPaid(sql, asMember(ines), one.booking.id, true);
  assert.equal((await b.bookingFor(sql, asMember(ines), one.booking.id)).paid, true);
  await refuses(b.markPaid(sql, asMember(hugo), one.booking.id, true), "not_found");
});

test("round robin: a team type is free when any of its hosts is, and goes to the least booked free one", async () => {
  const sql = database.sql;
  await openHost(sql, asMember(hugo), { title: "Meeting", slug: "meeting" });
  const owner = await openHost(sql, asMember(camille), { title: "Meeting", slug: "meeting" });
  // Only an administrator makes a team; a host alone cannot.
  await openHost(sql, asMember(ines), { title: "Meeting", slug: "meeting" });
  await refuses(b.createType(sql, asMember(ines), { ...base, slug: "team", pool: [hugo.id] }), "forbidden");
  const type = await b.createType(sql, asMember(camille), { ...base, slug: "demo", pool: [hugo.id, nora.id] });
  // Nora is no host: left out.
  assert.deepEqual(type.pool, [hugo.id]);
  // Camille blocks Tuesday morning: Hugo is still free then.
  await b.blockTime(sql, asMember(camille), { day: "2026-10-06", from: 540, to: 720, note: "" }, monday);
  const free = await b.freeTimes(sql, owner, type, "2026-10-06", "2026-10-06", monday);
  assert.ok(starts(free).includes("07:00"));
  const first = await b.book(sql, owner, type, { ...guest, start: "2026-10-06T07:00:00.000Z" }, monday);
  assert.equal(first.booking.memberId, hugo.id);
  // Both free on Wednesday at 9:00: Camille has fewer of this type.
  const second = await b.book(sql, owner, type, { ...guest, email: "b@example.com", start: "2026-10-07T07:00:00.000Z" }, monday);
  assert.equal(second.booking.memberId, camille.id);
  const third = await b.book(sql, owner, type, { ...guest, email: "c@example.com", start: "2026-10-07T07:00:00.000Z" }, monday);
  assert.equal(third.booking.memberId, hugo.id);
  await refuses(b.book(sql, owner, type, { ...guest, email: "d@example.com", start: "2026-10-07T07:00:00.000Z" }, monday), "taken");
  // The guest's page still finds the type through its owner.
  const found = await b.bySecret(sql, first.secret);
  assert.equal(found?.hostSlug, owner.slug);
});

test("a host books for a guest (the notice aside, questions optional) and moves a meeting; others cannot", async () => {
  const { sql, host, type } = await ready({ noticeMinutes: 1440, questions: [{ id: "q1aa", label: "Budget?", kind: "short", required: true, options: [] }] });
  // The page offers nothing today (a day of notice); the host can.
  assert.deepEqual(await b.freeTimes(sql, host, type, "2026-10-05", "2026-10-05", monday), []);
  const today = await b.hostTimes(sql, asMember(ines), type.id, "2026-10-05", "2026-10-05", null, monday);
  assert.ok(today.length > 0);
  const made = await b.bookForGuest(sql, asMember(ines), type.id, { ...guest, start: today[0]!.start }, monday);
  assert.equal(made.booking.source, "host");
  assert.equal(made.booking.bookedBy, ines.id);
  await refuses(b.bookForGuest(sql, asMember(hugo), type.id, { ...guest, start: today[1]!.start }, monday), "not_found");
  // Moving: the free times leave the meeting itself out.
  const times = await b.hostTimes(sql, asMember(ines), null, "2026-10-06", "2026-10-06", made.booking.id, monday);
  const moved = await b.moveByHost(sql, asMember(ines), made.booking.id, times[2]!.start, monday);
  assert.equal(moved.booking.startsAt.toISOString(), times[2]!.start);
  assert.equal(moved.booking.moves, 1);
  await refuses(b.moveByHost(sql, asMember(hugo), made.booking.id, times[3]!.start, monday), "not_found");
  // An administrator may move anyone's.
  await b.moveByHost(sql, asMember(camille), made.booking.id, times[3]!.start, monday);
});

test("each booking goes into its host's Chest calendar, in each reader's language, and leaves it when cancelled", async () => {
  const { sql, host, type } = await ready({ location: "https://meet.example.com/ines" });
  const { booking } = await b.book(sql, host, type, { ...guest, start: "2026-10-06T07:00:00.000Z" }, monday);
  await publish.publish(sql, booking);
  const kept = chest.calendar.get(`booking:${booking.id}`);
  assert.ok(kept);
  assert.deepEqual(kept!.members, [ines.id]);
  assert.equal(kept!.title["fr"], "Call avec Alex Doe");
  assert.equal(kept!.title["en"], "Call with Alex Doe");
  assert.equal(kept!.location, "https://meet.example.com/ines");
  assert.equal(kept!.path, `/chest/bookings/${booking.id}`);
  assert.ok(chest.feed(ines.id).includes("SUMMARY:Call avec Alex Doe"));
  assert.equal((await b.settings(sql)).calendarWorks, true);
  const done = await b.cancelByHost(sql, asMember(ines), booking.id, "", monday);
  await publish.publish(sql, done);
  assert.equal(chest.calendar.has(`booking:${booking.id}`), false);
});

test("the websites allowed to show the booking pages: https origins only, ten at most", async () => {
  const { sql } = await ready();
  assert.deepEqual(b.embedOrigins("https://www.atelier-martin.fr/contact\nhttps://atelier-martin.fr, https://www.atelier-martin.fr"), ["https://www.atelier-martin.fr", "https://atelier-martin.fr"]);
  assert.throws(() => b.embedOrigins("http://atelier-martin.fr"), (e: unknown) => e instanceof AppError && e.code === "invalid_site");
  assert.throws(() => b.embedOrigins("https://a.fr 'unsafe-inline'"), (e: unknown) => e instanceof AppError && e.code === "invalid_site");
  assert.throws(() => b.embedOrigins(Array.from({ length: 11 }, (_, i) => `https://s${i}.fr`).join("\n")), (e: unknown) => e instanceof AppError && e.code === "too_many_sites");
  await refuses(b.saveSettings(sql, asMember(ines), { companyName: "", retentionMonths: 24, defaultZone: "Europe/Paris", embedOrigins: "https://a.fr" }), "forbidden");
  await b.saveSettings(sql, asMember(camille), { companyName: "", retentionMonths: 24, defaultZone: "Europe/Paris", embedOrigins: "https://a.fr" });
  assert.deepEqual((await b.settings(sql)).embedOrigins, ["https://a.fr"]);
});

test("a website allowed in Settings may frame the booking pages on the very next request: read each time, never kept", async () => {
  const { sql } = await ready();
  // Read through db() exactly as the server's framing calls it
  // (src/app.tsx; the whole answer: test/app.test.mjs).
  const proxied = await import("../src/lib/embed.ts");
  assert.deepEqual(await proxied.embedOrigins(), []);
  assert.equal(proxied.frameAncestors(await proxied.embedOrigins(), false), "frame-ancestors 'none'");
  await b.saveEmbed(sql, asMember(camille), "https://www.atelier-martin.fr");
  assert.equal(proxied.frameAncestors(await proxied.embedOrigins(), false), "frame-ancestors 'self' https://www.atelier-martin.fr");
  await b.saveEmbed(sql, asMember(camille), "https://www.atelier-martin.fr\nhttps://shop.atelier-martin.fr");
  assert.deepEqual(await proxied.embedOrigins(), ["https://www.atelier-martin.fr", "https://shop.atelier-martin.fr"]);
  await b.saveEmbed(sql, asMember(camille), "");
  assert.deepEqual(await proxied.embedOrigins(), []);
});
