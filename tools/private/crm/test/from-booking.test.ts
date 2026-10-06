import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, shownTo, type FakeChest } from "@argentic/chest-sdk/testing";
import { onEvent as POST } from "../src/lib/deliveries.ts";
import * as activities from "../src/lib/activities.ts";
import * as contacts from "../src/lib/contacts.ts";
import { bookingKey, readBooking, upcoming } from "../src/lib/from-booking.ts";
import { catalogue, format } from "../src/i18n/index.ts";
import { leads } from "../src/lib/leads.ts";
import { erase } from "../src/lib/lifecycle.ts";
import { withWhen } from "../src/lib/page-data.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora } from "./support/members.ts";

// Booking → Clients: `booking.confirmed` and `booking.cancelled` (v1,
// Booking's README "With the other tools"): the guest found by email or
// made a contact, one meeting line per booking — its time replaced by a
// later move, cancelled for good — on the contact's history and the My day
// of its host and owner, linking back to Booking.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ network: {}, tool: "crm", members: everyone, receives: ["member.*", "booking.confirmed", "booking.cancelled"], tools: { booking: true } });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(() => {
  chest.notifications.splice(0);
});

let bookings = 100;
const soon = (hours: number) => new Date(Date.now() + hours * 3600_000);
const iso = (d: Date) => d.toISOString();
type Extra = { booking?: string; status?: "confirmed" | "cancelled"; host?: string | null; start?: Date; minutes?: number; moves?: number; contact?: Record<string, unknown>; v?: unknown; path?: unknown; type?: unknown; cancelledBy?: string };
const data = (extra: Extra = {}) => {
  const start = extra.start ?? soon(26);
  const booking = extra.booking ?? String(++bookings);
  return {
    v: extra.v ?? 1,
    booking,
    status: extra.status ?? "confirmed",
    at: iso(soon(-1)),
    host: extra.host === undefined ? ines.id : extra.host,
    start: iso(start),
    end: iso(new Date(start.getTime() + (extra.minutes ?? 60) * 60_000)),
    type: extra.type ?? { id: "3", name: { en: "Project call", fr: "Appel projet" } },
    kind: "video",
    contact: { name: "Sarah Klein", email: "sarah@example.com", phone: null, company: null, language: "en", ...extra.contact },
    source: "page",
    moves: extra.moves ?? 0,
    ...(extra.status === "cancelled" ? { cancelledBy: extra.cancelledBy ?? "guest" } : {}),
    path: extra.path ?? `/chest/bookings/${booking}`,
  };
};
const tell = (d: ReturnType<typeof data>, id?: string) => chest.deliver({ type: d.status === "cancelled" ? "booking.cancelled" : "booking.confirmed", source: "booking", data: d, ...(id ? { id } : {}) }, POST);
const byEmail = async (address: string) => (await database.sql<{ id: string }[]>`select id from contacts where lower(email) = ${address} order by id`).map(r => String(r.id));
const lines = async (contactId: string) => (await activities.timeline(database.sql, { contactId })).filter(a => a.kind === "booking");
const state = async (booking: string) => (await database.sql<{ status: string; moves: number; starts_at: Date; activity_id: string | null }[]>`select status, moves, starts_at, activity_id from booked_meetings where booking = ${booking}`)[0];

test("a new guest: a contact of their host (who works on clients here), one meeting line; nobody else is told; the host's My day shows it", async () => {
  const { sql } = database;
  const d = data({ contact: { name: "Sarah‮Klein ", email: "Sarah.Klein@Example.com", phone: "+33 6 11 22 33 44" } });
  assert.equal(await tell(d), 204);
  const [id] = await byEmail("sarah.klein@example.com");
  assert.ok(id);
  const c = await contacts.contact(sql, asMember(camille), id);
  assert.equal(c.name, "SarahKlein", "direction overrides and spaces cleaned");
  assert.equal(c.email, "sarah.klein@example.com");
  assert.equal(c.phone, "+33 6 11 22 33 44");
  assert.equal(c.owner, ines.id, "the host is meeting them: theirs");
  assert.equal(c.lastContact, d.at);
  const history = await activities.timeline(sql, { contactId: id });
  assert.deepEqual(history.map(a => a.kind), ["booking", "created"]);
  assert.deepEqual(history[1]!.data, { booking: d.booking });
  const line = history[0]!;
  assert.equal(line.data["status"], "confirmed");
  assert.equal(line.data["start"], d.start);
  assert.equal(line.data["host"], ines.id);
  assert.equal(line.data["path"], d.path);
  assert.deepEqual(line.data["type"], { en: "Project call", fr: "Appel projet" });
  // Not a lead: it has its owner.
  assert.ok(!(await leads(sql, asMember(camille))).rows.some(r => r.id === id));
  // Booking told Inès; Clients adds nothing to her bell.
  assert.equal(chest.notifications.length, 0);
  // Her My day, and the line in each language, linking back to Booking.
  const mine = await upcoming(sql, ines.id);
  assert.ok(mine.some(m => m.booking === d.booking && m.contact.id === id && m.path === d.path));
  assert.ok(!(await upcoming(sql, hugo.id)).some(m => m.booking === d.booking));
  const [en] = withWhen([line], "en");
  assert.equal(en!.link, `https://booking-chest.chest.test${d.path}`);
  assert.equal(en!.meeting?.type, "Project call");
  assert.equal(en!.meeting?.host, ines.id);
  assert.equal(en!.meeting?.cancelled, false);
  const [fr] = withWhen([line], "fr");
  assert.equal(fr!.meeting?.type, "Appel projet");
  assert.equal(format(catalogue("fr").timeline.booked, { type: "Appel projet" }), "A pris rendez-vous\u202f: Appel projet");
});

test("a known contact is found by their email, whatever its case; their owner (not the host) is told, and sees it in My day", async () => {
  const { sql } = database;
  const known = await contacts.addContact(sql, asMember(hugo), { name: "Marc Leroy", email: "marc@leroy.fr" });
  const d = data({ contact: { name: "M. Leroy", email: "MARC@Leroy.FR" } });
  assert.equal(await tell(d), 204);
  assert.deepEqual(await byEmail("marc@leroy.fr"), [known.id]);
  assert.equal((await lines(known.id)).length, 1);
  assert.equal((await contacts.contact(sql, asMember(hugo), known.id)).owner, hugo.id, "keeps its owner");
  const bell = chest.notifications.filter(n => n.key === bookingKey(d.booking));
  assert.deepEqual(bell.map(n => [n.member, n.title, n.path]), [[hugo.id, "Marc Leroy booked a meeting", `/chest/contacts/${known.id}`]]);
  assert.match(bell[0]!.body ?? "", /^Project call, /u);
  assert.ok((await upcoming(sql, hugo.id)).some(m => m.booking === d.booking), "the owner's My day");
  assert.ok((await upcoming(sql, ines.id)).some(m => m.booking === d.booking), "and the host's");
});

test("never by the phone alone: another name at the same number is a new contact, marked as maybe the same person", async () => {
  const { sql } = database;
  const shop = await contacts.addContact(sql, asMember(hugo), { name: "Boutique Lumière", phone: "01 42 00 00 01" });
  await tell(data({ contact: { name: "Julie Martin", email: "julie@example.org", phone: "+33 1 42 00 00 01" } }));
  const [julie] = await byEmail("julie@example.org");
  assert.ok(julie && julie !== shop.id);
  assert.equal((await lines(shop.id)).length, 0, "nothing in the shop's file");
  const [row] = await sql<{ maybe_same: string | null }[]>`select maybe_same from contacts where id = ${julie}`;
  assert.equal(String(row!.maybe_same), shop.id);
  // No usable email, the same phone and the same name: them.
  const paul = await contacts.addContact(sql, asMember(hugo), { name: "Paul Girard", phone: "06 12 12 12 12" });
  await tell(data({ contact: { name: "girard, paul", email: "not an address", phone: "+33 6 12 12 12 12" } }));
  assert.equal((await lines(paul.id)).length, 1);
});

test("one line per booking: a later move replaces its time; a repeat or an older move changes nothing", async () => {
  const { sql } = database;
  const booking = "7001";
  const first = data({ booking, contact: { email: "move@example.com" } });
  await tell(first);
  const [id] = await byEmail("move@example.com");
  const later = soon(50);
  const moved = data({ booking, start: later, moves: 1, host: hugo.id, contact: { email: "move@example.com" } });
  assert.equal(await tell(moved), 204);
  assert.equal(await tell(moved), 204, "the same event again, under another id");
  assert.equal(await tell(first), 204, "an older move delivered late");
  const all = await lines(id!);
  assert.equal(all.length, 1);
  assert.equal(all[0]!.data["start"], moved.start);
  assert.equal(all[0]!.data["moves"], 1);
  assert.equal(all[0]!.data["host"], hugo.id);
  const s = await state(booking);
  assert.equal(s!.moves, 1);
  assert.equal(s!.starts_at.toISOString(), moved.start);
  assert.equal(withWhen(all, "en")[0]!.meeting?.moves, 1);
  // The new host's My day, not the old one's (Inès owns the contact: hers too).
  assert.ok((await upcoming(sql, hugo.id)).some(m => m.booking === booking));
});

test("a cancellation is final: the line says so, My day drops it, a confirmation after it is ignored", async () => {
  const { sql } = database;
  const booking = "7002";
  await tell(data({ booking, contact: { email: "cancel@example.com" } }));
  const [id] = await byEmail("cancel@example.com");
  const cancelled = data({ booking, status: "cancelled", cancelledBy: "host", contact: { email: "cancel@example.com" } });
  assert.equal(await tell(cancelled), 204);
  assert.equal(await tell(cancelled), 204);
  assert.equal(await tell(data({ booking, moves: 3, contact: { email: "cancel@example.com" } })), 204);
  const [line] = await lines(id!);
  assert.equal(line!.data["status"], "cancelled");
  assert.equal(line!.data["cancelledBy"], "host");
  assert.equal((await state(booking))!.status, "cancelled");
  assert.equal(withWhen([line!], "en")[0]!.meeting?.cancelled, true);
  assert.ok(!(await upcoming(sql, ines.id)).some(m => m.booking === booking));
});

test("a cancellation that comes before its confirmation brings nobody in; the confirmation after it is ignored", async () => {
  const booking = "7003";
  assert.equal(await tell(data({ booking, status: "cancelled", contact: { email: "early@example.com" } })), 204);
  assert.deepEqual(await byEmail("early@example.com"), []);
  assert.equal(await tell(data({ booking, contact: { email: "early@example.com" } })), 204);
  assert.deepEqual(await byEmail("early@example.com"), []);
  assert.equal((await state(booking))!.activity_id, null);
});

test("a contact deleted in Clients is not brought back by a later move of their booking", async () => {
  const { sql } = database;
  const booking = "7004";
  await tell(data({ booking, contact: { email: "gone@example.com" } }));
  const [id] = await byEmail("gone@example.com");
  await contacts.deleteContact(sql, asMember(camille), id!);
  assert.equal(await tell(data({ booking, moves: 1, contact: { email: "gone@example.com" } })), 204);
  assert.deepEqual(await byEmail("gone@example.com"), []);
});

test("a host who does not work on clients here: the guest is a lead of nobody's, the managers are told, My day's leads say the meeting", async () => {
  const { sql } = database;
  const d = data({ host: nora.id, contact: { name: "Léon Blanc", email: "leon@example.com" } });
  await tell(d);
  const [id] = await byEmail("leon@example.com");
  assert.equal((await contacts.contact(sql, asMember(camille), id!)).owner, null);
  const lead = (await leads(sql, asMember(camille))).rows.find(r => r.id === id);
  assert.ok(lead?.booking);
  assert.equal(lead.booking.start, d.start);
  const bell = chest.notifications.filter(n => n.key === bookingKey(d.booking));
  assert.deepEqual(bell.map(n => [n.member, shownTo(n, "fr").title]), [[camille.id, "Nouveau contact : Léon Blanc a pris rendez-vous"]]);
  // A viewer hosting is no owner either.
  await tell(data({ host: lea.id, contact: { email: "viewer-host@example.com" } }));
  const [v] = await byEmail("viewer-host@example.com");
  assert.equal((await contacts.contact(sql, asMember(camille), v!)).owner, null);
});

test("what is not a booking of version 1 is ignored; what is untrusted is cleaned", async () => {
  const bad: Extra[] = [
    { v: 2 }, { v: "1" }, { booking: "../1" }, { host: "camille" }, { minutes: 0 }, { minutes: 60 * 25 },
    { start: soon(24 * 365 * 4) }, { moves: -1 }, { contact: { email: "", phone: null } }, { contact: { email: 42 } },
  ];
  for (const extra of bad) {
    const d = data({ ...extra, contact: { email: "ignored@example.com", ...extra.contact } });
    assert.equal(await tell(d), 204, JSON.stringify(extra));
  }
  assert.deepEqual(await byEmail("ignored@example.com"), []);
  // A status that is not the event's own.
  assert.equal(await chest.deliver({ type: "booking.confirmed", source: "booking", data: { ...data({ contact: { email: "ignored@example.com" } }), status: "cancelled" } }, POST), 204);
  assert.deepEqual(await byEmail("ignored@example.com"), []);
  // A path that is not Booking's page, a type name too long: kept out, cut.
  const d = data({ path: "//evil.example/x", type: { name: { en: "x".repeat(500), fr: 7 } }, contact: { email: "clean@example.com" } });
  await tell(d);
  const [id] = await byEmail("clean@example.com");
  const [line] = await lines(id!);
  assert.equal(line!.data["path"], "");
  assert.equal(withWhen([line!], "en")[0]!.link, null);
  const type = line!.data["type"] as unknown as { en: string; fr: string };
  assert.ok(type.en.length <= 120);
  assert.equal(type.fr, type.en);
  assert.equal(readBooking({ id: "evt_x", type: "booking.confirmed", data: { ...d, v: 1 } })?.host, ines.id);
});

test("the same event delivered twice is handled once", async () => {
  const d = data({ contact: { email: "twice@example.com" } });
  const id = "evt_" + "t".repeat(26);
  assert.equal(await tell(d, id), 204);
  assert.equal(await tell(d, id), 204);
  const [c] = await byEmail("twice@example.com");
  assert.equal((await lines(c!)).length, 1);
});

test("a host erased: their id leaves the meetings they hosted", async () => {
  const { sql } = database;
  const d = data({ host: hugo.id, contact: { email: "erased-host@example.com" } });
  await tell(d);
  await erase(sql, hugo.id);
  const [c] = await byEmail("erased-host@example.com");
  const [line] = await lines(c!);
  assert.equal(line!.data["host"], null);
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from booked_meetings where host = ${hugo.id}`;
  assert.equal(row!.n, 0);
});
