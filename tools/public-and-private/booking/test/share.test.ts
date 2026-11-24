import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/lib/app-error.ts";
import * as b from "../src/lib/booking.ts";
import { busyData, busyFingerprint, busyLimits, busySnapshot, readBusy } from "../src/lib/busy-snapshot.ts";
import * as calendars from "../src/lib/calendars.ts";
import { catalogue, startsWithVowel, zoneName } from "../src/i18n/index.ts";
import * as lifecycle from "../src/lib/lifecycle.ts";
import * as share from "../src/lib/share.ts";
import { openParts } from "../src/lib/slots.ts";
import { zoneGroups } from "../src/lib/zones.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { builtServer, type Handler } from "./support/server.ts";
import { openHost } from "./support/host.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

// An event's key names the guest by a short hash of their address (an
// identifier of the tool's own: SDK 0.7.0 refuses "@" in a key).
const keyOf = (id: string, email: string, rest: string): string => `booking:${id}:${share.guestTag(email)}:${rest}`;
// What Booking declares it tells (chest.json "emits"): the fake Chest checks
// each event's data against it, as the Chest does.
const emits = (JSON.parse(readFileSync(new URL("../chest.json", import.meta.url), "utf8")) as { emits: Record<string, { description: string; data: Record<string, string> }> }).emits;
// A busy snapshot's spans, as the event carries them (JSON text).
const spansOf = (p: { data: Record<string, unknown> }): unknown => JSON.parse(p.data["spans"] as string);

// Booking and the other tools of the Chest (SDK 0.7.0 events between
// tools): a host's busy times told (booking.busy) and heard
// (hiring.busy); each booking told to Clients (booking.confirmed,
// booking.cancelled). And the host's truth on the team's screens: one type
// under one name, the busy times of other calendars, plain words for a
// wrong calendar address.

let database: TestDatabase;
let chest: FakeChest;
// The built server's routes (/chest-schedules, /chest-events).
let POST: Handler;
// The declared calendar hosts, as the Chest's egress reaches them (fakeChest
// network, SDK studio.15); a test says what they answer.
let calendarAnswer: (request: Request) => Response = () => new Response("no", { status: 404 });
const network = { "*.icloud.com": (request: Request) => calendarAnswer(request) };
before(async () => {
  database = await testDatabase();
  POST = await builtServer();
  process.env["CHEST_TOOL"] = "booking";
  chest = await fakeChest({ chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["members", "notifications"], emits, network });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate hosts, bookings, settings, form_counts, shared_busy, told_busy cascade`;
  chest.emitted.length = 0;
});

// Monday 5 October 2026, 08:00 in Paris (UTC+2).
const monday = Date.parse("2026-10-05T06:00:00Z");
const guest = { name: "Sarah Klein", email: "sarah@example.com", note: "About the shop", zone: "Europe/Paris", language: "en" };
const base = { title: "Project call", slug: "project-call", description: "", duration: 60, interval: 60, locationKind: "video", location: "", bufferBefore: 0, bufferAfter: 0, noticeMinutes: 0, windowDays: 60, color: "sky", active: true };

// Inès writes in English, with a French version of her texts.
async function inesReady() {
  const sql = database.sql;
  const host = await openHost(sql, asMember(ines), { title: "Meeting", slug: "meeting" });
  await b.saveHost(sql, asMember(ines), { slug: host.slug, zone: host.zone, welcome: "", listed: true, language: "en", second: "fr", welcomeAlt: "" });
  const type = await b.createType(sql, asMember(ines), { ...base, alt: { title: "Appel projet" } });
  return { sql, host: (await b.hostOf(sql, ines.id))!, type };
}
const busyOf = (member: string) => chest.emitted.filter(p => p.type === "booking.busy" && p.data["member"] === member);

test("a busy snapshot: times only, on the minute, merged, from today for 90 days; capped without claiming a time free", () => {
  const now = Date.parse("2026-10-05T06:30:10Z");
  const s = busySnapshot(ines.id, [
    { start: Date.parse("2026-10-05T08:00:30Z"), end: Date.parse("2026-10-05T09:00:00Z") },
    { start: Date.parse("2026-10-05T08:30:00Z"), end: Date.parse("2026-10-05T09:15:00Z") },
    { start: Date.parse("2026-10-05T09:15:00Z"), end: Date.parse("2026-10-05T09:30:00Z") },
    { start: Date.parse("2026-10-04T08:00:00Z"), end: Date.parse("2026-10-04T09:00:00Z") },
    { start: Date.parse("2027-06-01T08:00:00Z"), end: Date.parse("2027-06-01T09:00:00Z") },
  ], now);
  assert.deepEqual(s, { v: 1, member: ines.id, at: "2026-10-05T06:30:10.000Z", from: "2026-10-05T00:00:00Z", to: "2027-01-03T00:00:00Z", spans: [["2026-10-05T08:00:00Z", "2026-10-05T09:30:00Z"]] });
  // The same times later the same day: the same fingerprint.
  assert.equal(busyFingerprint(busySnapshot(ines.id, [{ start: Date.parse("2026-10-05T08:00:00Z"), end: Date.parse("2026-10-05T09:30:00Z") }], now + 3600000)), busyFingerprint(s));
  const many = Array.from({ length: busyLimits.spans + 5 }, (_, i) => ({ start: now + i * 7200000, end: now + i * 7200000 + 3600000 }));
  const capped = busySnapshot(ines.id, many, now);
  assert.equal(capped.spans.length, busyLimits.spans);
  assert.equal(capped.to, new Date(Math.floor((now + busyLimits.spans * 7200000) / 60000) * 60000).toISOString().slice(0, 16) + ":00Z");
  assert.ok(capped.spans.at(-1)![1] <= capped.to);
  assert.ok(Buffer.byteLength(JSON.stringify(busyData(capped))) < 16 * 1024, "fits in an event");
  assert.equal(typeof busyData(capped)["spans"], "string", "spans as JSON text: an event's fields are flat");
  // What another tool sends is checked.
  assert.deepEqual(readBusy(busyData(s))!.spans, [{ start: Date.parse("2026-10-05T08:00:00Z"), end: Date.parse("2026-10-05T09:30:00Z") }]);
  assert.deepEqual(readBusy(s)!.spans, readBusy(busyData(s))!.spans, "a list, as a teller of before sent it, too");
  assert.equal(readBusy({ ...s, spans: "[[" }), null, "text that is no JSON");
  assert.equal(readBusy({ ...s, v: 2 }), null);
  assert.equal(readBusy({ ...s, member: "Inès" }), null);
  assert.equal(readBusy({ ...s, spans: [["2026-10-05T09:00:00Z", "2026-10-05T08:00:00Z"]] }), null);
  assert.equal(readBusy({ ...s, spans: [["2026-10-01T09:00:00Z", "2026-10-01T10:00:00Z"]] }), null, "a span outside the window");
  assert.equal(readBusy({ ...s, to: "2028-01-01T00:00:00Z" }), null);
  assert.equal(readBusy("busy"), null);
});

test("a booking tells Clients who booked, which type in every language, when — never the note or the answers — and the host's busy times", async () => {
  const { sql, host, type } = await inesReady();
  const made = await b.book(sql, host, type, { ...guest, start: "2026-10-06T08:00:00.000Z" }, monday);
  await share.changed(sql, "booked", made.booking, { now: monday });
  const confirmed = chest.emitted.find(p => p.type === "booking.confirmed")!;
  assert.equal(confirmed.key, keyOf(made.booking.id, made.booking.guestEmail, "confirmed:0"));
  assert.deepEqual(confirmed.data, {
    v: 1, booking: made.booking.id, status: "confirmed", at: made.booking.createdAt.toISOString(), host: ines.id,
    start: "2026-10-06T08:00:00.000Z", end: "2026-10-06T09:00:00.000Z",
    type: type.id, typeName: "Project call", typeNameFr: "Appel projet", kind: "video",
    contactName: "Sarah Klein", contactEmail: "sarah@example.com", contactPhone: null, contactLanguage: "en",
    source: "page", moves: 0, path: `/chest/bookings/${made.booking.id}`,
  });
  // About one booking, for its host and the administrators only.
  assert.equal(confirmed.subject, `booking:${made.booking.id}`);
  assert.deepEqual(confirmed.audience, { members: [ines.id], roles: ["admin"] });
  assert.ok(!JSON.stringify(confirmed.data).includes("About the shop"), "never the guest's note");
  const [busy] = busyOf(ines.id);
  assert.deepEqual(spansOf(busy!), [["2026-10-06T08:00:00Z", "2026-10-06T09:00:00Z"]]);
  assert.equal(busy!.subject, ines.id);
  assert.ok(!JSON.stringify(busy!.data).includes("Sarah"), "times only");
  // Nothing changed: nothing told again.
  assert.equal(await share.shareBusy(sql, [ines.id], monday + 60000), 0);
  // Moved: the same booking, confirmed again with its moves; cancelled.
  const moved = await b.moveByHost(sql, asMember(ines), made.booking.id, "2026-10-07T08:00:00.000Z", monday);
  await share.changed(sql, "moved", moved.booking, { previousHost: moved.from, now: monday + 120000 });
  const again = chest.emitted.filter(p => p.type === "booking.confirmed");
  assert.deepEqual(again.map(p => [p.key, p.data["start"], p.data["moves"]]), [[keyOf(made.booking.id, made.booking.guestEmail, "confirmed:0"), "2026-10-06T08:00:00.000Z", 0], [keyOf(made.booking.id, made.booking.guestEmail, "confirmed:1"), "2026-10-07T08:00:00.000Z", 1]]);
  assert.deepEqual(spansOf(busyOf(ines.id).at(-1)!), [["2026-10-07T08:00:00Z", "2026-10-07T09:00:00Z"]]);
  // at: when it moved, as recorded — not when it was told.
  assert.equal(again[1]!.data["at"], new Date(monday).toISOString());
  const gone = await b.cancelByHost(sql, asMember(ines), made.booking.id, "", monday);
  await share.changed(sql, "cancelled", gone, { now: monday + 180000 });
  const cancelled = chest.emitted.find(p => p.type === "booking.cancelled")!;
  assert.equal(cancelled.key, keyOf(made.booking.id, made.booking.guestEmail, "cancelled"));
  assert.equal(cancelled.data["at"], gone.cancelledAt!.toISOString());
  assert.equal(cancelled.data["status"], "cancelled");
  assert.equal(cancelled.data["cancelledBy"], "host");
  assert.deepEqual(spansOf(busyOf(ines.id).at(-1)!), []);
});

test("a time blocked and another calendar's busy times are told; what Hiring told Booking is never told back", async () => {
  const { sql, host, type } = await inesReady();
  await b.blockTime(sql, asMember(ines), { day: "2026-10-06", from: 600, to: 660, note: "Dentist" }, monday);
  // (The fake Chest keeps keys for 24 hours, like the Chest: another time than the first test's.)
  assert.equal(await share.shareBusy(sql, [ines.id], monday + 1000), 1);
  assert.deepEqual(spansOf(busyOf(ines.id).at(-1)!), [["2026-10-06T08:00:00Z", "2026-10-06T09:00:00Z"]]);
  // Hiring says Inès is in an interview on Tuesday at 14:00.
  const told = { v: 1, member: ines.id, at: new Date(monday).toISOString(), from: "2026-10-05T00:00:00Z", to: "2027-01-03T00:00:00Z", spans: [["2026-10-06T12:00:00Z", "2026-10-06T13:00:00Z"]] };
  assert.equal(await chest.deliver({ type: "hiring.busy", source: "hiring", data: told }, POST), 204);
  const free = (await b.freeTimes(sql, host, type, "2026-10-06", "2026-10-06", monday)).map(s => s.start.slice(11, 16));
  assert.ok(!free.includes("12:00") && !free.includes("08:00") && free.includes("13:00"), "neither the block nor the interview is offered");
  assert.equal(await share.shareBusy(sql, [ines.id], monday + 60000), 0, "no echo");
  // An older snapshot arriving late changes nothing; an invalid one is dropped.
  assert.equal(await chest.deliver({ type: "hiring.busy", source: "hiring", data: { ...told, at: new Date(monday - 60000).toISOString(), spans: [] } }, POST), 204);
  assert.equal(await chest.deliver({ type: "hiring.busy", source: "hiring", data: { ...told, member: "someone" } }, POST), 204);
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from told_spans where member_id = ${ines.id}`;
  assert.equal(row!.n, 1);
  // A newer one replaces it.
  assert.equal(await chest.deliver({ type: "hiring.busy", source: "hiring", data: { ...told, at: new Date(monday + 60000).toISOString(), spans: [] } }, POST), 204);
  assert.ok((await b.freeTimes(sql, host, type, "2026-10-06", "2026-10-06", monday)).some(s => s.start.slice(11, 16) === "12:00"));
  // Someone who leaves: what was told of them is forgotten.
  await chest.deliver({ type: "hiring.busy", source: "hiring", data: { ...told, at: new Date(monday + 120000).toISOString() } }, POST);
  await lifecycle.leave(sql, ines.id);
  const [left] = await sql<{ n: number }[]>`select count(*)::int as n from told_busy where member_id = ${ines.id}`;
  assert.equal(left!.n, 0);
});

test("told again, a booking is the same event: its data does not change with the time of telling", async () => {
  const { sql, host, type } = await inesReady();
  const made = await b.book(sql, host, type, { ...guest, start: "2026-10-06T08:00:00.000Z" }, monday);
  assert.equal(await share.changed(sql, "booked", made.booking, { now: monday + 5000 }), true);
  // A retry (the request answered too late, the page sent twice) minutes later: taken, one event.
  assert.equal(await share.changed(sql, "booked", made.booking, { now: monday + 300000 }), true, "not a key_conflict");
  const moved = await b.moveByHost(sql, asMember(ines), made.booking.id, "2026-10-07T08:00:00.000Z", monday + 60000);
  assert.equal(await share.changed(sql, "moved", moved.booking, { previousHost: moved.from, now: monday + 400000 }), true);
  // Read again from the database (a retry after a restart): the same data.
  const reread = (await b.bookingsByIds(sql, [made.booking.id]))[0]!;
  assert.equal(await share.changed(sql, "moved", reread, { now: monday + 900000 }), true, "the move told again is the same event");
  const confirmed = chest.emitted.filter(p => p.type === "booking.confirmed" && p.data["booking"] === made.booking.id);
  assert.deepEqual(confirmed.map(p => [p.key, p.data["at"]]), [
    [keyOf(made.booking.id, made.booking.guestEmail, "confirmed:0"), made.booking.createdAt.toISOString()],
    [keyOf(made.booking.id, made.booking.guestEmail, "confirmed:1"), new Date(monday + 60000).toISOString()],
  ]);
  const gone = await b.cancelByHost(sql, asMember(ines), made.booking.id, "", monday + 120000);
  assert.equal(await share.changed(sql, "cancelled", gone, { now: monday + 1000000 }), true);
  assert.equal(await share.changed(sql, "cancelled", (await b.bookingsByIds(sql, [made.booking.id]))[0]!, { now: monday + 2000000 }), true);
  assert.equal(chest.emitted.filter(p => p.type === "booking.cancelled" && p.data["booking"] === made.booking.id).length, 1);
  // Other data under a key already used is refused by the Chest, never taken as the first: the booking stands.
  assert.equal(await share.changed(sql, "cancelled", { ...gone, guestName: "Someone else" }, { now: monday + 2000000 }), false);
});

test("Leave tells Booking a host is off: no time is offered those days, the agenda says « Off », a later snapshot frees them", async () => {
  const { sql, host, type } = await inesReady();
  const tuesday = async () => (await b.freeTimes(sql, host, type, "2026-10-06", "2026-10-06", monday)).map(s => s.start.slice(11, 16));
  assert.ok((await tuesday()).length > 0, "Tuesday is open");
  // Inès is off on Tuesday: the whole day in Paris, times only.
  const off = { v: 1, member: ines.id, at: new Date(monday).toISOString(), from: "2026-10-05T00:00:00Z", to: "2027-01-03T00:00:00Z", spans: [["2026-10-05T22:00:00Z", "2026-10-06T22:00:00Z"]] };
  assert.equal(await chest.deliver({ type: "leave.busy", source: "leave", data: off }, POST), 204);
  assert.deepEqual(await tuesday(), [], "no time on a day off");
  assert.ok((await b.freeTimes(sql, host, type, "2026-10-07", "2026-10-07", monday)).length > 0, "Wednesday stays open");
  // Hiring's interviews are kept apart: Leave's snapshot replaces only Leave's.
  await chest.deliver({ type: "hiring.busy", source: "hiring", data: { ...off, spans: [["2026-10-07T07:00:00Z", "2026-10-07T08:00:00Z"]] } }, POST);
  const rows = await b.busyElsewhere(sql, host, 7, monday);
  assert.ok(rows.some(r => r.day === "2026-10-06" && r.source === "tool:leave"), "the day off on her agenda");
  assert.equal(catalogue("en").bookings.busyWhere.leave, "Off");
  assert.equal(catalogue("fr").bookings.busyWhere.leave, "Absent");
  // Never told back to another tool.
  assert.equal(await share.shareBusy(sql, [ines.id], monday + 7000), 1);
  assert.ok(!JSON.stringify(busyOf(ines.id).at(-1)!.data).includes("2026-10-05T22:00:00Z"), "no echo");
  // An older snapshot arriving late changes nothing.
  await chest.deliver({ type: "leave.busy", source: "leave", data: { ...off, at: new Date(monday - 60000).toISOString(), spans: [] } }, POST);
  assert.deepEqual(await tuesday(), []);
  // The leave cancelled: Leave says she is free again; Tuesday opens, the interview stays.
  await chest.deliver({ type: "leave.busy", source: "leave", data: { ...off, at: new Date(monday + 60000).toISOString(), spans: [] } }, POST);
  assert.ok((await tuesday()).length > 0, "Tuesday open again");
  assert.ok(!(await b.freeTimes(sql, host, type, "2026-10-07", "2026-10-07", monday)).some(s => s.start.slice(11, 16) === "07:00"), "Hiring's interview still kept");
  // A snapshot named for Booking itself is never taken.
  await chest.deliver({ type: "leave.busy", source: "booking", data: { ...off, at: new Date(monday + 120000).toISOString() } }, POST);
  assert.ok((await tuesday()).length > 0);
});

test("without events between tools, bookings stand and nothing breaks", async () => {
  await chest.close();
  chest = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["members", "notifications"] });
  const { sql, host, type } = await inesReady();
  const made = await b.book(sql, host, type, { ...guest, start: "2026-10-06T08:00:00.000Z" }, monday);
  await share.changed(sql, "booked", made.booking, { now: monday });
  assert.equal(await share.shareBusy(sql, [ines.id], monday), 0);
  assert.equal(chest.emitted.length, 0);
  await chest.close();
  chest = await fakeChest({ chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["members", "notifications"], emits, network });
});

test("one type, one name: the team reads it in their language, whatever language the guest booked in", async () => {
  const { sql, host, type } = await inesReady();
  const english = await b.book(sql, host, type, { ...guest, start: "2026-10-06T08:00:00.000Z" }, monday);
  const french = await b.book(sql, host, type, { ...guest, name: "Lucie Garnier", email: "lucie@example.com", language: "fr", start: "2026-10-06T09:00:00.000Z" }, monday);
  // Each booking keeps what its guest read (their emails).
  assert.deepEqual([english.booking.title, french.booking.title], ["Project call", "Appel projet"]);
  const fr = await b.typeNames(sql, [english.booking.typeId, french.booking.typeId], "fr");
  assert.deepEqual([...fr.values()], ["Appel projet"]);
  assert.equal((await b.typeNames(sql, [type.id], "en")).get(type.id), "Project call");
  assert.deepEqual(await b.titlesOf(sql, french.booking), { en: "Project call", fr: "Appel projet" });
  // A type removed: the booking's own copy.
  await b.removeType(sql, asMember(ines), type.id);
  assert.deepEqual(await b.titlesOf(sql, french.booking), { en: "Appel projet", fr: "Appel projet" });
  // Hugo writes in English only: English for everyone.
  const hugoHost = await openHost(sql, asMember(hugo), { title: "Showroom visit", slug: "visit" });
  const [visit] = await b.typesOf(sql, hugo.id);
  assert.equal((await b.typeNames(sql, [visit!.id], "fr")).get(visit!.id), "Showroom visit");
  assert.ok(hugoHost);
});

test("the agenda says why a stretch is not free: another calendar's busy times, another tool's, within the hours", async () => {
  const { sql, host } = await inesReady();
  const [cal] = await sql<{ id: string }[]>`insert into calendars (member_id, url, provider) values (${ines.id}, 'https://calendar.google.com/calendar/ical/x/private-y/basic.ics', 'calendar.google.com') returning id::text as id`;
  // Tuesday 16:00–17:00 and 19:00–20:00 in Paris (the second after hours).
  await sql`insert into busy (calendar_id, member_id, span) values (${cal!.id}, ${ines.id}, tstzrange('2026-10-06T14:00:00Z', '2026-10-06T15:00:00Z')), (${cal!.id}, ${ines.id}, tstzrange('2026-10-06T17:00:00Z', '2026-10-06T18:00:00Z'))`;
  await chest.deliver({ type: "hiring.busy", source: "hiring", data: { v: 1, member: ines.id, at: new Date(monday).toISOString(), from: "2026-10-05T00:00:00Z", to: "2027-01-03T00:00:00Z", spans: [["2026-10-07T07:30:00Z", "2026-10-07T08:30:00Z"]] } }, POST);
  const rows = await b.busyElsewhere(sql, host, 7, monday);
  assert.deepEqual(rows, [
    { day: "2026-10-06", start: 960, end: 1020, source: "calendar.google.com" },
    { day: "2026-10-07", start: 570, end: 630, source: "tool:hiring" },
  ]);
  // Told for others only (its audience leaves Inès out): never offered,
  // never shown on her agenda.
  await chest.deliver({ type: "leave.busy", source: "leave", audience: [camille.id], data: { v: 1, member: ines.id, at: new Date(monday).toISOString(), from: "2026-10-05T00:00:00Z", to: "2027-01-03T00:00:00Z", spans: JSON.stringify([["2026-10-08T07:00:00Z", "2026-10-08T08:00:00Z"]]) } }, POST);
  assert.ok(!(await b.busyElsewhere(sql, host, 7, monday)).some(r => r.source === "tool:leave"), "not shown to whom the teller did not tell");
  const [kept] = await sql<{ n: number }[]>`select count(*)::int as n from told_spans where member_id = ${ines.id} and source = 'leave'`;
  assert.equal(kept!.n, 1, "yet kept: the time is not offered");
  // Pure: clipped to the day's hours, from now on, merged.
  const hours = { weekly: host.weekly, overrides: {}, zone: "Europe/Paris" };
  assert.deepEqual(openParts(hours, [{ start: Date.parse("2026-10-06T06:00:00Z"), end: Date.parse("2026-10-06T08:00:00Z") }, { start: Date.parse("2026-10-06T07:30:00Z"), end: Date.parse("2026-10-06T08:30:00Z") }], "2026-10-06", monday), [{ start: 540, end: 630 }]);
  assert.deepEqual(openParts(hours, [{ start: Date.parse("2026-10-05T05:00:00Z"), end: Date.parse("2026-10-05T08:00:00Z") }], "2026-10-05", monday), [{ start: 540, end: 600 }], "not before now");
});

test("a wrong calendar address is named for what it is, before anything is read; webcal:// is read as https://", async () => {
  const { sql } = await inesReady();
  const refused = (address: string) => {
    try {
      calendars.calendarAddress(address);
      return null;
    } catch (error) {
      return error instanceof AppError ? error.code : "thrown";
    }
  };
  // The four the critic pasted.
  assert.equal(refused("https://calendar.google.com/calendar/u/0/r"), "calendar_google_page");
  assert.equal(refused("https://calendar.google.com/calendar/embed?src=ines%40atelier.test&ctz=Europe%2FParis"), "calendar_google_page");
  assert.equal(refused("https://outlook.office365.com/owa/calendar/0f1e2d3c@atelier.test/a1b2c3d4e5/calendar.html"), "calendar_outlook_html");
  assert.equal(refused("webcal://p52-caldav.icloud.com/published/2/MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkw"), null);
  // And their neighbours.
  assert.equal(refused("https://outlook.live.com/calendar/0/view/month"), "calendar_outlook_page");
  assert.equal(refused("https://www.icloud.com/calendar/"), "calendar_apple_page");
  assert.equal(refused("https://example.com/cal.ics"), "calendar_not_allowed");
  assert.equal(refused("https://calendar.google.com/calendar/ical/ines%40atelier.test/private-0123/basic.ics"), null);
  assert.equal(refused("https://outlook.office365.com/owa/calendar/0f1e2d3c@atelier.test/a1b2c3d4e5/calendar.ics"), null);
  assert.equal(calendars.calendarAddress("webcal://p52-caldav.icloud.com/published/2/abc").url, "https://p52-caldav.icloud.com/published/2/abc");
  // Each has its own sentence, in both languages.
  for (const code of ["calendar_google_page", "calendar_outlook_html", "calendar_outlook_page", "calendar_apple_page"] as const) {
    assert.notEqual(catalogue("en").errors[code], catalogue("en").errors.calendar_refused);
    assert.ok(catalogue("fr").errors[code].length > 40);
  }
  // A webcal address connects (read over https).
  const seen: string[] = [];
  const ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261006T100000Z\r\nDTEND:20261006T110000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
  calendarAnswer = request => (seen.push(request.url), new Response(ics, { status: 200 }));
  const connected = await calendars.connect(sql, asMember(ines), "webcal://p52-caldav.icloud.com/published/2/abc", monday);
  assert.deepEqual([seen, connected.provider, connected.events], [["https://p52-caldav.icloud.com/published/2/abc"], "p52-caldav.icloud.com", 1]);
});

test("the visitor's details in their language: French city names, Montreal beside Toronto; d’Inès", () => {
  const fr = catalogue("fr");
  const common = zoneGroups(fr.zones, monday, [], ["Europe/Paris", "Europe/Brussels", "America/Toronto", "America/Sao_Paulo", "Pacific/Noumea", "Indian/Reunion", "America/Martinique", "Europe/Rome"])[0]!;
  const labels = common.zones.map(z => z.label);
  for (const city of ["Bruxelles (UTC+2)", "Toronto, Montréal (UTC−4)", "São Paulo (UTC−3)", "Nouméa (UTC+11)", "La Réunion (UTC+4)", "Martinique (UTC−4)"]) assert.ok(labels.includes(city), city);
  assert.ok(zoneGroups(catalogue("en").zones, monday, [], ["America/Toronto"])[0]!.zones.some(z => z.label === "Toronto, Montreal (UTC−4)"));
  assert.equal(zoneName("Europe/Brussels", fr.zones.cities), "Bruxelles");
  assert.equal(zoneName("Europe/Paris", fr.zones.cities), "Paris");
  assert.deepEqual(["Inès", "Hugo", "Élodie", "Camille", " Yann"].map(startsWithVowel), [true, false, true, false, true]);
  assert.ok(fr.public.jitsiGuestVowel.includes("d’{name}") && fr.public.jitsiGuest.includes("de {name}"));
});

test("erasing a host tells Clients each meeting called off", async () => {
  const { sql, host, type } = await inesReady();
  // Open every day, all day: a time three days from now, whatever today is.
  await b.saveWeekly(sql, asMember(ines), Array.from({ length: 7 }, () => [[0, 1440]]));
  const start = new Date(Math.ceil((Date.now() + 3 * 86400000) / 3600000) * 3600000).toISOString();
  const made = await b.book(sql, (await b.hostOf(sql, ines.id))!, type, { ...guest, start }, Date.now());
  assert.ok(host);
  const event = { type: "member.erased" as const, data: { id: ines.id, erasure: "era_" + "c".repeat(26), deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.deliver(event, POST), 204);
  const told = chest.emitted.filter(p => p.type === "booking.cancelled");
  assert.deepEqual(told.map(p => [p.data["booking"], p.data["host"], p.data["cancelledBy"]]), [[made.booking.id, null, "host"]]);
  assert.ok(camille);
});

test("hiring.busy exactly as Hiring emits it (its chest.json: v, member, at, from, to, spans as JSON text) is kept; from another tool it is ignored", async () => {
  const { sql, host, type } = await inesReady();
  const tuesday = async () => (await b.freeTimes(sql, host, type, "2026-10-06", "2026-10-06", monday)).map(s => s.start.slice(11, 16));
  assert.ok((await tuesday()).includes("12:00"), "Tuesday at 14:00 in Paris is open");
  // tools/public-and-private/hiring/src/lib/busy-snapshot.ts busyData: RFC 3339
  // instants from toISOString(), the spans' minutes as JSON text.
  const emitted = { v: 1, member: ines.id, at: new Date(monday).toISOString(), from: "2026-10-05T00:00:00.000Z", to: "2027-01-03T00:00:00.000Z", spans: JSON.stringify([["2026-10-06T12:00Z", "2026-10-06T13:00Z"]]) };
  // A type names no tool: a "hiring.busy" from another tool is accepted and ignored.
  assert.equal(await chest.deliver({ type: "hiring.busy", source: "forms", data: emitted }, POST), 204);
  assert.ok((await tuesday()).includes("12:00"), "nothing taken from a tool that is not Hiring");
  assert.equal(await chest.deliver({ type: "leave.busy", source: "hiring", data: emitted }, POST), 204);
  assert.ok((await tuesday()).includes("12:00"), "nor Leave's type from Hiring");
  assert.equal(await chest.deliver({ type: "hiring.busy", source: "hiring", data: emitted }, POST), 204);
  assert.ok(!(await tuesday()).includes("12:00"), "the interview's hour is no longer offered");
  // Another version is another shape: never read as this one.
  assert.equal(readBusy({ ...emitted, v: 2 }), null);
  const { v: _, ...unversioned } = emitted;
  assert.ok(readBusy(unversioned), "a teller that declares no version is read too");
});

test("a guest's name with an emoji of several parts (a zero-width joiner) is told without the joiner: the Chest refuses format characters; Booking keeps the name as typed", async () => {
  const { sql, host, type } = await inesReady();
  const name = "Nina 👩‍💻 Petit​";
  const made = await b.book(sql, host, type, { ...guest, name, start: "2026-10-06T08:00:00.000Z" }, monday);
  assert.equal(await share.changed(sql, "booked", made.booking, { now: monday }), true, "the Chest took it");
  const confirmed = chest.emitted.find(p => p.type === "booking.confirmed" && p.data["booking"] === made.booking.id)!;
  assert.equal(confirmed.data["contactName"], "Nina 👩💻 Petit");
  const [kept] = await sql<{ guest_name: string }[]>`select guest_name from bookings where id = ${made.booking.id}`;
  assert.equal(kept!.guest_name, name, "kept as typed");
  assert.equal(share.eventText("a\r\nb\u0007‮c\t\uD800"), "a\nbc\t");
});
