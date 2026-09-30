import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../lib/app-error.ts";
import * as b from "../lib/booking.ts";
import * as calendars from "../lib/calendars.ts";
import { freeWindows } from "../lib/slots.ts";
import { cleanLanguages, cleanTypeTexts, localizeType, localizeWelcome, pageLanguage, pageLanguages } from "../lib/texts.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { openHost } from "./support/host.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

// A new host is not public until they connect a calendar or confirm their
// hours; a host's texts in two languages; the agenda's free stretches.

let database: TestDatabase;
let chest: FakeChest;
// Google's host as the Chest's egress reaches it (fakeChest network, SDK
// studio.15): a test says what it answers.
let google: () => Response = () => new Response("no", { status: 404 });
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ chest: { timeZone: "Europe/Paris" }, members: everyone, network: { "calendar.google.com": () => google() } });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate hosts, bookings, settings, form_counts cascade`;
});

async function refuses(step: Promise<unknown>, code: string) {
  await assert.rejects(step, (e: unknown) => e instanceof AppError && e.code === code);
}

// Monday 5 October 2026, 08:00 in Paris (UTC+2).
const monday = Date.parse("2026-10-05T06:00:00Z");
const first = { title: "30-minute meeting", slug: "meeting" };
const guest = { name: "Alex Doe", email: "alex@example.com", note: "", zone: "Europe/Paris", language: "en" };

test("opening the tool once publishes nobody: a new host is not listed, has no public page and cannot be booked", async () => {
  const sql = database.sql;
  const host = await b.ensureHost(sql, asMember(hugo), first);
  assert.equal(host.ready, false);
  assert.equal(await b.publicHost(sql, "hugo-bernard"), null);
  assert.equal(await b.publicType(sql, "hugo-bernard", "meeting"), null);
  assert.deepEqual(await b.listedHosts(sql), []);
  // Opening it again changes nothing.
  assert.equal((await b.ensureHost(sql, asMember(hugo), first)).ready, false);
  // Confirming the hours makes the page public.
  await b.confirmHours(sql, asMember(hugo));
  assert.equal((await b.publicHost(sql, "hugo-bernard"))?.host.ready, true);
  assert.deepEqual((await b.listedHosts(sql)).map(h => h.slug), ["hugo-bernard"]);
  // Only a host confirms, and only their own.
  await refuses(b.confirmHours(sql, asMember({ ...camille, role: null, isAdmin: false })), "forbidden");
});

test("saving the week's hours confirms them; connecting a calendar that reads does too, one that fails does not", async () => {
  const sql = database.sql;
  const made = await b.ensureHost(sql, asMember(hugo), first);
  await b.saveWeekly(sql, asMember(hugo), made.weekly);
  assert.equal((await b.hostOf(sql, hugo.id))?.ready, true);

  await b.ensureHost(sql, asMember(ines), first);
  const address = "https://calendar.google.com/calendar/ical/ines%40example.test/private-0123456789abcdef/basic.ics";
  google = () => new Response("no", { status: 404 });
  await refuses(calendars.connect(sql, asMember(ines), address, monday), "calendar_not_found");
  assert.equal((await b.hostOf(sql, ines.id))?.ready, false);
  const empty = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:test\r\nEND:VCALENDAR\r\n";
  google = () => new Response(empty, { headers: { "content-type": "text/calendar" } });
  await calendars.connect(sql, asMember(ines), address, monday);
  assert.equal((await b.hostOf(sql, ines.id))?.ready, true);
  assert.ok(await b.publicType(sql, "ines-moreau", "meeting"));
});

test("a host who is not public yet takes nobody's team bookings; the owner's page still works", async () => {
  const sql = database.sql;
  const owner = await openHost(sql, asMember(camille), first);
  await b.ensureHost(sql, asMember(hugo), first);
  const team = await b.createType(sql, asMember(camille), { title: "Discovery", slug: "discovery", description: "", duration: 30, locationKind: "phone", location: "", bufferBefore: 0, bufferAfter: 0, noticeMinutes: 0, windowDays: 30, color: "sky", active: true, pool: [hugo.id] });
  assert.deepEqual(await b.teamOf(sql, owner, team), [camille.id]);
  await b.confirmHours(sql, asMember(hugo));
  assert.deepEqual(await b.teamOf(sql, owner, team), [camille.id, hugo.id]);
});

test("a host's page reads in one language: the visitor's when the host wrote it, otherwise the host's", () => {
  const english = { language: "en" as const, second: null };
  const both = { language: "en" as const, second: "fr" as const };
  const unsaid = { language: null, second: null };
  assert.equal(pageLanguage(english, "fr"), "en");
  assert.deepEqual(pageLanguages(english), ["en"]);
  assert.equal(pageLanguage(both, "fr"), "fr");
  assert.equal(pageLanguage(both, "en"), "en");
  assert.deepEqual(pageLanguages(both), ["en", "fr"]);
  assert.equal(pageLanguage(unsaid, "fr"), "fr");
  assert.deepEqual(cleanLanguages("fr", ""), { language: "fr", second: null });
  assert.throws(() => cleanLanguages("fr", "fr"), (e: unknown) => e instanceof AppError && e.code === "invalid");
  assert.throws(() => cleanLanguages("de", null), (e: unknown) => e instanceof AppError && e.code === "invalid");

  const questions = [{ id: "use00001", label: "What is it for?", kind: "choice" as const, required: true, options: ["A home", "A shop"] }, { id: "plans001", label: "Plans?", kind: "yesno" as const, required: false, options: [] }];
  // Texts of what the type has, bounded; empty ones and those of a missing
  // question or choice are left out.
  const alt = cleanTypeTexts({ title: "Appel projet", description: "", use00001: "À quoi est-ce destiné ?", "use00001.0": "Un logement", "use00001.5": "Rien", "gone0001": "x", "plans001.0": "x" }, questions);
  assert.deepEqual(alt, { title: "Appel projet", use00001: "À quoi est-ce destiné ?", "use00001.0": "Un logement" });
  assert.throws(() => cleanTypeTexts({ "<script>": "x" }, questions));
  assert.throws(() => cleanTypeTexts({ title: "x".repeat(81) }, questions), (e: unknown) => e instanceof AppError && e.code === "too_long");
  const type = { title: "Project call", description: "About you", questions, alt };
  const fr = localizeType(type, both, "fr");
  assert.equal(fr.title, "Appel projet");
  // Left empty: the first language's text.
  assert.equal(fr.description, "About you");
  assert.deepEqual(fr.questions[0]!.options, ["Un logement", "A shop"]);
  assert.equal(localizeType(type, english, "fr"), type);
  assert.equal(localizeWelcome({ ...both, welcome: "Hello", welcomeAlt: "Bonjour" }, "fr"), "Bonjour");
  assert.equal(localizeWelcome({ ...both, welcome: "Hello", welcomeAlt: "" }, "fr"), "Hello");
});

test("a French visitor books a bilingual host in French; an English-only host's page keeps the visitor in English", async () => {
  const sql = database.sql;
  const made = await openHost(sql, asMember(ines), first);
  // Inès reads French: her texts are taken to be French until she says.
  assert.equal(made.language, "fr");
  await b.saveHost(sql, asMember(ines), { slug: made.slug, zone: made.zone, welcome: "Hello", listed: true, language: "en", second: "fr", welcomeAlt: "Bonjour" });
  const host = (await b.hostOf(sql, ines.id))!;
  assert.deepEqual([host.language, host.second, host.welcomeAlt], ["en", "fr", "Bonjour"]);
  const questions = [{ id: "use00001", label: "What is it for?", kind: "choice", required: true, options: ["A home", "A shop"] }];
  const type = await b.createType(sql, asMember(ines), { title: "Project call", slug: "project-call", description: "", duration: 30, locationKind: "phone", location: "", bufferBefore: 0, bufferAfter: 0, noticeMinutes: 0, windowDays: 30, color: "sky", active: true, questions, alt: { title: "Appel projet", use00001: "C’est pour quoi ?", "use00001.0": "Un logement", "use00001.1": "Une boutique" } });
  assert.equal(type.alt["title"], "Appel projet");
  // The French page's choices are French: an English choice is refused there.
  await refuses(b.book(sql, host, type, { ...guest, language: "fr", phone: "+33 6 12 34 56 78", start: "2026-10-06T07:00:00.000Z", answers: { use00001: "A home" } }, monday), "invalid");
  const fr = await b.book(sql, host, type, { ...guest, language: "fr", phone: "+33 6 12 34 56 78", start: "2026-10-06T07:00:00.000Z", answers: { use00001: "Un logement" } }, monday);
  assert.equal(fr.booking.guestLanguage, "fr");
  assert.equal(fr.booking.title, "Appel projet");
  assert.deepEqual(fr.booking.answers.map(a => [a.label, a.answer]), [["C’est pour quoi ?", "Un logement"]]);
  const en = await b.book(sql, host, type, { ...guest, language: "en", phone: "+33 6 12 34 56 78", start: "2026-10-06T08:00:00.000Z", answers: { use00001: "A shop" } }, monday);
  assert.equal(en.booking.title, "Project call");

  // No second language: the French visitor reads (and books) in English.
  await b.saveHost(sql, asMember(ines), { slug: made.slug, zone: made.zone, welcome: "Hello", listed: true, language: "en", second: "" });
  const single = (await b.hostOf(sql, ines.id))!;
  assert.equal(single.second, null);
  assert.equal(single.welcomeAlt, "");
  const pinned = await b.book(sql, single, type, { ...guest, language: "fr", phone: "+33 6 12 34 56 78", start: "2026-10-06T09:00:00.000Z", answers: { use00001: "A home" } }, monday);
  assert.equal(pinned.booking.guestLanguage, "en");
  assert.equal(pinned.booking.title, "Project call");
  await refuses(b.saveHost(sql, asMember(ines), { slug: made.slug, zone: made.zone, welcome: "", listed: true, language: "en", second: "en" }), "invalid");
});

test("the first type's name waits in the other language, for the day the host adds one", async () => {
  const sql = database.sql;
  await b.ensureHost(sql, asMember(hugo), { ...first, others: { fr: "Rendez-vous de 30 minutes" } });
  const [type] = await b.typesOf(sql, hugo.id);
  assert.deepEqual(type!.alt, { title: "Rendez-vous de 30 minutes" });
});

test("free stretches of a day: the hours minus what is busy, from now, on the quarter hour", () => {
  const zone = "Europe/Paris";
  const week = [[], [[540, 750], [840, 1050]], [], [], [], [], []] as [number, number][][];
  const at = (h: number, m = 0) => Date.parse(`2026-10-05T${String(h - 2).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  // A booking 10:00–10:40 and a calendar event 15:00–16:00.
  const busy = [{ start: at(10), end: at(10, 40) }, { start: at(15), end: at(16) }];
  assert.deepEqual(freeWindows({ weekly: week, overrides: {}, zone }, busy, "2026-10-05", at(8)), [
    { start: 540, end: 600 }, { start: 645, end: 750 }, { start: 840, end: 900 }, { start: 960, end: 1050 },
  ]);
  // Later in the day: the morning is gone, the stretch starts now (rounded up).
  assert.deepEqual(freeWindows({ weekly: week, overrides: {}, zone }, busy, "2026-10-05", at(14, 5)), [{ start: 855, end: 900 }, { start: 960, end: 1050 }]);
  // A day off, or less than 15 minutes: nothing.
  assert.deepEqual(freeWindows({ weekly: week, overrides: { "2026-10-05": [] }, zone }, busy, "2026-10-05", at(8)), []);
  assert.deepEqual(freeWindows({ weekly: week, overrides: {}, zone }, [{ start: at(9, 10), end: at(17, 30) }], "2026-10-05", at(8)), []);
});

test("the agenda's free stretches leave out bookings and blocked times", async () => {
  const sql = database.sql;
  const host = await openHost(sql, asMember(ines), first);
  const [type] = await b.typesOf(sql, ines.id);
  await b.book(sql, host, type!, { ...guest, start: "2026-10-06T07:00:00.000Z" }, monday);
  await b.blockTime(sql, asMember(ines), { day: "2026-10-06", from: 840, to: 900, note: "Dentist" }, monday);
  const free = await b.freeStretches(sql, host, 7, monday);
  // Tuesday: 09:00–09:30 booked, 14:00–15:00 blocked.
  assert.deepEqual(free.get("2026-10-06"), [{ start: 570, end: 750 }, { start: 900, end: 1050 }]);
  // The weekend: no hours, no stretch.
  assert.equal(free.get("2026-10-10"), undefined);
  // Monday from 08:00 (now): the whole of its hours.
  assert.deepEqual(free.get("2026-10-05"), [{ start: 540, end: 750 }, { start: 840, end: 1050 }]);
});
