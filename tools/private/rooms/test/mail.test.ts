import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { weekdayLoad } from "../lib/export.ts";
import * as rooms from "../lib/room-bookings.ts";
import * as tell from "../lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";
import { office, workday, zone } from "./support/places.ts";

// The guests of a room booking by email (Proposal (studio): mail), with
// the booking as an .ics file; the Chest knows the addresses, Rooms never.
const withMail = everyone.map(p => ({ ...p, email: p.firstName.toLowerCase() + "@atelier.test" }));

let database: TestDatabase;
let chest: FakeChest;
let o: Awaited<ReturnType<typeof office>>;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: withMail, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier.test" } });
  o = await office(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

test("guests get an invitation in their language with the .ics; a change and a cancel too; the organiser gets none; a retry sends nothing twice", async () => {
  const { sql } = database;
  const { bookings } = await rooms.bookRoom(sql, asMember(hugo), { roomId: o.atlas, day: workday(2), start: 600, end: 660, title: "Budget", attendees: [ines.id, lea.id] }, zone);
  await tell.invited(asMember(hugo), bookings[0]!.attendees, bookings);
  assert.deepEqual(chest.outbox.map(m => m.to).flat().sort(), ["inès@atelier.test", "léa@atelier.test"].sort());
  const toInes = chest.outbox.find(m => m.to.includes("inès@atelier.test"))!;
  assert.match(toInes.subject, /^Invitation : Budget — /u);
  assert.match(toInes.text, /Hugo Bernard vous invite à une réunion\./u);
  assert.deepEqual(toInes.attachments.map(a => [a.name, a.type]), [["reservation.ics", "text/calendar"]]);
  assert.equal(chest.outbox.some(m => m.to.includes("hugo@atelier.test")), false);
  await tell.invited(asMember(hugo), bookings[0]!.attendees, bookings);
  assert.equal(chest.outbox.length, 2, "same key: sent once");
  const { before: b, after: a } = await rooms.updateRoomBooking(sql, asMember(hugo), bookings[0]!.id, { start: 660, end: 720 }, zone);
  await tell.changed(asMember(hugo), b, a);
  assert.equal(chest.outbox.filter(m => m.subject.startsWith("Modifiée") || m.subject.startsWith("Changed")).length, 2);
  const gone = await rooms.cancelRoomBooking(sql, asMember(hugo), bookings[0]!.id, "one", zone);
  await tell.cancelled(asMember(hugo), gone, "none");
  assert.equal(chest.outbox.filter(m => /^(Annulée|Cancelled)/u.test(m.subject)).length, 2);
  assert.equal((await sql`select mail from settings`)[0]!.mail, "on");
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
