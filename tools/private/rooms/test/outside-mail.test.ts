import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, shownTo, type FakeChest } from "@argentic/chest-sdk/testing";
import { matchable } from "../src/lib/directory.ts";
import { weekdayLoad } from "../src/lib/export.ts";
import { compose, mailBounds, reach, send } from "../src/lib/invitations.ts";
import { leave } from "../src/lib/lifecycle.ts";
import * as rooms from "../src/lib/room-bookings.ts";
import { purge } from "../src/lib/settings.ts";
import * as tell from "../src/lib/tell.ts";
import * as visits from "../src/lib/visits.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, sofia, tom } from "./support/members.ts";
import { office, workday, zone } from "./support/places.ts";

// Mail and Rooms after the owner's decisions of 6 October 2026: a member
// is never mailed by the tool (the bell, which the Chest mails them by
// their choice; the calendar); a visitor — someone outside the company —
// may get an invitation by email (Proposal (studio): "mail"), through the
// company's own mail provider, replies going to the company's address.
const withMail = everyone.map(p => ({ ...p, email: p.firstName.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase() + "@atelier.test" }));

let database: TestDatabase;
let chest: FakeChest;
let o: Awaited<ReturnType<typeof office>>;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: withMail, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier.test", replyTo: "contact@atelier.test" }, chest: { timeZone: zone, organization: "Atelier Martin" } });
  o = await office(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

const announce = (who: typeof hugo, extra: Record<string, unknown> = {}, day = workday(2)) =>
  visits.announce(database.sql, asMember(who), { officeId: o.office, day, at: 600, name: "Paul Durand", company: "Durand SA", ...extra }, zone);

test("the guests of a room booking are told in their bell, in their language — never by a mail of the tool", async () => {
  const { sql } = database;
  chest.notifications.length = 0;
  const { bookings } = await rooms.bookRoom(sql, asMember(hugo), { roomId: o.atlas, day: workday(2), start: 600, end: 660, title: "Budget", attendees: [ines.id, sofia.id] }, zone);
  await tell.invited(asMember(hugo), bookings[0]!.attendees, bookings);
  const items = chest.notifications.filter(n => n.key === `room:${bookings[0]!.id}`);
  assert.deepEqual(items.map(n => n.member).sort(), [ines.id, sofia.id].sort());
  assert.equal(items[0]!.title, "Hugo Bernard invited you: Budget");
  assert.equal(shownTo(items[0]!, "fr").title, "Hugo Bernard vous invite\u202f: Budget");
  const gone = await rooms.cancelRoomBooking(sql, asMember(hugo), bookings[0]!.id, "one", zone);
  await tell.cancelled(asMember(hugo), gone, "none");
  assert.equal(chest.outbox.length, 0, "no mail to a member");
});

test("a visitor with an address gets an invitation: the announcer's language, the time, the office's address, a calendar file; replies go to the company's address", async () => {
  const { sql } = database;
  const before = chest.outbox.length;
  const v = await announce(lea, { email: " paul.durand@client.test " });
  assert.equal(await send(sql, v.id, "invite", zone), "sent");
  const sent = chest.outbox.slice(before);
  assert.equal(sent.length, 1);
  const m = sent[0]!;
  assert.deepEqual(m.to, ["paul.durand@client.test"]);
  assert.equal(m.replyTo, "contact@atelier.test", "the company's reply address (the connector's)");
  assert.equal(m.fromName, "Léa Dubois chez Atelier Martin");
  assert.match(m.subject, /^Votre visite chez Atelier Martin\u202f: \S+ \d+ \S+ à 10:00$/u);
  assert.match(m.text, /^Bonjour Paul Durand,\n\nLéa Dubois vous attend chez Atelier Martin le \S+ \d+ \S+ à 10:00\.\nAdresse\u202f: Paris, 12 rue de Paradis\n/u);
  assert.match(m.text, /Répondez à cet e-mail\.$/u);
  assert.deepEqual(m.attachments.map(a => [a.name, a.type]), [["visite.ics", "text/calendar"]]);
  assert.equal((await visits.visitsOn(sql, asMember(lea), o.office, workday(2))).find(x => x.id === v.id)?.invitation, "sent");
  // Only to the visitor: the host is not mailed.
  assert.equal(chest.outbox.some(x => x.to.some(t => t.endsWith("@atelier.test"))), false);
});

test("the message: an hour in the calendar from the visit's time, its SEQUENCE growing, a cancellation that takes it out", () => {
  const v = { id: "7", email: "p@client.test", language: "en", name: "Paul", day: "2026-11-03", at_minute: 600, mail_sequence: 1, office: "Paris", address: "12 rue de Paradis" };
  const invite = compose(v, "invite", { company: "Atelier Martin", host: "Hugo Bernard", zone, domain: "rooms.atelier.test" });
  assert.equal(invite.subject, "Your visit to Atelier Martin: Tuesday 3 November at 10:00");
  assert.equal(invite.key, "visit:7:1");
  const ics = String((invite.attachments![0] as { content: string }).content);
  assert.match(ics, /METHOD:PUBLISH/u);
  assert.match(ics, /DTSTART:20261103T090000Z/u, "10:00 in Paris");
  assert.match(ics, /DTEND:20261103T100000Z/u);
  assert.match(ics, /SEQUENCE:1/u);
  assert.match(ics, /SUMMARY:Visit to Atelier Martin/u);
  const cancel = compose({ ...v, mail_sequence: 2 }, "cancel", { company: "Atelier Martin", host: null, zone, domain: "rooms.atelier.test" });
  assert.equal(cancel.subject, "Cancelled: your visit to Atelier Martin, Tuesday 3 November at 10:00");
  assert.equal(cancel.fromName, "Atelier Martin");
  const off = String((cancel.attachments![0] as { content: string }).content);
  assert.match(off, /METHOD:CANCEL/u);
  assert.match(off, /STATUS:CANCELLED/u);
  assert.match(off, /SEQUENCE:2/u);
  assert.equal(/UID:([^\r\n]+)/u.exec(off)![1], /UID:([^\r\n]+)/u.exec(ics)![1], "the same event");
});

test("a visit cancelled tells its invited visitor; its Undo invites them again; a visit without an address sends nothing", async () => {
  const { sql } = database;
  const v = await announce(hugo, { email: "anna@client.test" }, workday(3));
  await send(sql, v.id, "invite", zone);
  const before = chest.outbox.length;
  const gone = await visits.cancelVisit(sql, asMember(hugo), v.id, zone);
  assert.equal(gone.invitation, "sent");
  assert.equal(await send(sql, v.id, "cancel", zone), "sent");
  assert.match(chest.outbox.at(-1)!.subject, /^Cancelled: your visit to Atelier Martin/u);
  await visits.restoreVisit(sql, asMember(hugo), v.id);
  assert.equal(await send(sql, v.id, "invite", zone), "sent");
  assert.match(chest.outbox.at(-1)!.subject, /^Your visit to Atelier Martin/u);
  assert.deepEqual(chest.outbox.slice(before).map(m => m.key), [`visit:${v.id}:2`, `visit:${v.id}:3`]);
  const quiet = await announce(hugo, {}, workday(3));
  assert.equal(await send(sql, quiet.id, "invite", zone), null);
  assert.equal(quiet.invitation, null);
});

test("an address must be one: a member's id or a word is refused", async () => {
  await assert.rejects(announce(hugo, { email: "not an address" }), { code: "invalid_email" });
  await assert.rejects(announce(hugo, { email: hugo.id }), { code: "invalid_email" });
  await assert.rejects(announce(hugo, { email: 42 }), { code: "invalid_email" });
  assert.equal((await announce(hugo, { email: "   " })).invitation, null);
  // The package's field.email: a display name, an IP literal, a domain
  // without a dot, a bidirectional override are no address; the domain is
  // lower-cased, the rest kept as written.
  for (const bad of ["Paul <paul@client.test>", "paul@[192.0.2.1]", "paul@client", "pa\u202eul@client.test", "paul@@client.test"]) {
    await assert.rejects(announce(hugo, { email: bad }), { code: "invalid_email" }, bad);
  }
  const v = await announce(hugo, { email: " Paul.Durand@Client.TEST " }, workday(4));
  assert.deepEqual([...await database.sql`select email from visits where id = ${v.id}`], [{ email: "Paul.Durand@client.test" }]);
});

test("a colleague's address is refused in the visitor's field: Rooms never mails a member", async () => {
  const before = chest.outbox.length;
  await assert.rejects(announce(hugo, { email: "INES@atelier.test" }), { code: "colleague_email" });
  assert.equal(chest.outbox.length, before);
  // Someone outside the company with the same domain's look is fine.
  assert.equal((await announce(hugo, { email: "nobody@atelier.test" })).name, "Paul Durand");
});

test("bounds: a visit sends 4 messages at most (Undo after Undo), an address is invited to 3 visits a day, an announcer invites 100 a day; past them the visit stands, not sent, the address goes", async () => {
  const { sql } = database;
  assert.deepEqual(mailBounds, { perVisit: 4, perAddressPerDay: 3, perAnnouncerPerDay: 100 });
  // Cancel and Undo, again and again: invitation, cancellation, invitation, cancellation — then no more.
  const v = await announce(lea, { email: "loop@client.test" }, workday(6));
  const before = chest.outbox.length;
  assert.equal(await send(sql, v.id, "invite", zone), "sent");
  assert.equal(await send(sql, v.id, "cancel", zone), "sent");
  assert.equal(await send(sql, v.id, "invite", zone), "sent");
  assert.equal(await send(sql, v.id, "cancel", zone), "sent");
  assert.equal(await send(sql, v.id, "invite", zone), "not_sent");
  assert.equal(chest.outbox.length - before, 4);
  assert.deepEqual({ ...(await sql<{ email: string | null; invitation: string }[]>`select email, invitation from visits where id = ${v.id}`)[0] }, { email: null, invitation: "not_sent" });
  assert.equal(await send(sql, v.id, "cancel", zone), null, "nobody left to write to");
  // One address, many visits: three invitations a day, whatever its case.
  const same = [];
  for (const email of ["same@client.test", "Same@Client.test", "SAME@client.test", "same@client.test"]) {
    const x = await announce(tom, { email }, workday(6));
    same.push(await send(sql, x.id, "invite", zone));
  }
  assert.deepEqual(same, ["sent", "sent", "sent", "not_sent"]);
  // A day later the address may be invited again.
  await sql`update visits set created_at = now() - interval '25 hours' where lower(email) = 'same@client.test'`;
  assert.equal(await send(sql, (await announce(tom, { email: "same@client.test" }, workday(6))).id, "invite", zone), "sent");
  // One announcer: a hundred invitations a day.
  await sql`insert into visits (office_id, day, at_minute, name, company, host, created_by, invitation)
    select ${o.office}, ${workday(6)}::date, 600, 'Guest ' || n, '', ${camille.id}, ${camille.id}, 'sent' from generate_series(1, 100) n`;
  const capped = await announce(camille, { email: "one-more@client.test" }, workday(6));
  assert.equal(await send(sql, capped.id, "invite", zone), "not_sent");
  await sql`delete from visits where created_by = ${camille.id} and name like 'Guest %'`;
});

test("a Chest that cannot send: the visit stands, the invitation says not sent, the address is not kept; the form is told", async () => {
  const { sql } = database;
  chest.delivery.mail = "not_connected";
  try {
    assert.deepEqual(await reach(), { ok: false, replyTo: "contact@atelier.test" });
    const v = await announce(hugo, { email: "late@client.test" }, workday(4));
    assert.equal(await send(sql, v.id, "invite", zone), "not_sent");
    const [row] = await sql<{ email: string | null; invitation: string }[]>`select email, invitation from visits where id = ${v.id}`;
    assert.deepEqual(row, { email: null, invitation: "not_sent" });
  } finally {
    chest.delivery.mail = "ready";
  }
  assert.deepEqual(await reach(), { ok: true, replyTo: "contact@atelier.test" });
});

test("the address goes once the visit's day is over; a host who leaves: their invited visitors hear it is cancelled", async () => {
  const { sql } = database;
  const past = await announce(tom, { email: "old@client.test" }, workday(1));
  await sql`update visits set day = (now() at time zone ${zone})::date - 1 where id = ${past.id}`;
  await purge(sql, zone);
  assert.equal((await sql<{ email: string | null }[]>`select email from visits where id = ${past.id}`)[0]?.email ?? null, null);
  const v = await announce(sofia, { email: "guest@client.test" }, workday(5));
  await send(sql, v.id, "invite", zone);
  const before = chest.outbox.length;
  await leave(sql, sofia.id, zone);
  const told = chest.outbox.slice(before);
  assert.equal(told.length, 1);
  assert.deepEqual(told[0]!.to, ["guest@client.test"]);
  assert.match(told[0]!.subject, /^Cancelled: your visit to Atelier Martin/u);
});

test("an import's addresses are matched by the Chest (members.matchEmails), never read from the members", async () => {
  const people = await matchable("ORGANIZER;CN=Someone:mailto:HUGO@atelier.test\r\nATTENDEE:mailto:ines@atel\r\n ier.test\r\nATTENDEE:mailto:paul@client.test");
  const byEmail = new Map(people.filter(p => p.email).map(p => [p.email, p.id]));
  assert.deepEqual([...byEmail].sort(), [["hugo@atelier.test", hugo.id], ["ines@atelier.test", ines.id]]);
  assert.ok(people.every(p => !p.email || p.email.endsWith("@atelier.test")));
  assert.equal(people.filter(p => p.id === camille.id && p.email).length, 0, "an address not in the file is not learnt");
});

test("the office, day by day: the average since the first day anyone came, counts only; admins only", async () => {
  const { sql } = database;
  const load = await weekdayLoad(sql, asMember(camille), o.office, zone);
  assert.equal(load.desks, 4);
  // Nobody came yet: no data, not zeros.
  assert.equal(load.since, null);
  assert.ok(load.loads.every(l => l.people === 0 && l.days === 0));
  await assert.rejects(weekdayLoad(sql, asMember(hugo), o.office, zone), { code: "forbidden" });
  // Léa came a week ago and Hugo today: only the days since then count —
  // the seven weeks before are not averaged in as zeros.
  const [dates] = await sql<{ week_ago: string; today: string }[]>`select to_char((now() at time zone ${zone})::date - 7, 'YYYY-MM-DD') as week_ago, to_char((now() at time zone ${zone})::date, 'YYYY-MM-DD') as today`;
  const weekAgo = dates!.week_ago, day0 = dates!.today;
  await sql`insert into presence (member_id, day, status, office_id) values (${lea.id}, ${weekAgo}::date, 'office', ${o.office}), (${hugo.id}, ${day0}::date, 'office', ${o.office}), (${lea.id}, ${day0}::date, 'office', ${o.office})`;
  const after = await weekdayLoad(sql, asMember(camille), o.office, zone);
  assert.equal(after.since, weekAgo);
  const todays = after.loads.find(l => l.days === 2)!;
  // The same weekday a week ago (1 person) and today (2): 1.5 on average, over 2 days — not over 8.
  assert.equal(todays.people, 1.5);
  assert.equal(after.loads.reduce((sum, l) => sum + l.days, 0), 8);
});
