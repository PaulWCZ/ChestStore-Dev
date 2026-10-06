import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, shownTo, type FakeChest } from "@argentic/chest-sdk/testing";
import * as desks from "../src/lib/desk-bookings.ts";
import * as rooms from "../src/lib/room-bookings.ts";
import * as tell from "../src/lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";
import { office, workday, zone } from "./support/places.ts";

let database: TestDatabase;
let chest: FakeChest;
let o: Awaited<ReturnType<typeof office>>;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  o = await office(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

test("people invited hear of it in their own language; a change replaces the item; a cancellation too", async () => {
  const { sql } = database;
  chest.notifications.length = 0;
  const done = await rooms.bookRoom(sql, asMember(hugo), { roomId: o.atlas, day: workday(1), start: 600, end: 660, title: "Budget", attendees: [ines.id, camille.id] }, zone);
  await tell.invited(asMember(hugo), done.bookings[0]!.attendees, done.bookings);
  const key = `room:${done.bookings[0]!.id}`;
  assert.deepEqual(chest.notifications.map(n => [n.member, shownTo(n, "fr").title, n.key]).sort(), [[camille.id, "Hugo Bernard vous invite\u202f: Budget", key], [ines.id, "Hugo Bernard vous invite\u202f: Budget", key]]);
  assert.match(chest.notifications[0]!.body ?? "", /^Atlas · .* 10:00–11:00$/u);
  assert.equal(chest.notifications[0]!.path, `/chest/rooms?day=${workday(1)}&booking=${done.bookings[0]!.id}`);
  const { before: b, after: a } = await rooms.updateRoomBooking(sql, asMember(hugo), done.bookings[0]!.id, { start: 630, end: 690, attendees: [ines.id, lea.id] }, zone);
  await tell.changed(asMember(hugo), b, a);
  const byMember = new Map(chest.notifications.map(n => [n.member, n]));
  assert.equal(shownTo(byMember.get(ines.id)!, "fr").title, "Réunion modifiée\u202f: Budget");
  assert.equal(shownTo(byMember.get(lea.id)!, "fr").title, "Hugo Bernard vous invite\u202f: Budget");
  assert.equal(shownTo(byMember.get(camille.id)!, "fr").title, "Réunion annulée\u202f: Budget");
  assert.equal(chest.notifications.filter(n => n.member === ines.id).length, 1);
  // An admin cancels it: the organiser hears it too.
  const gone = await rooms.cancelRoomBooking(sql, asMember(camille), a.id, "one", zone);
  await tell.cancelled(asMember(camille), gone, "admin");
  const hugoTold = chest.notifications.find(n => n.member === hugo.id);
  assert.equal(hugoTold?.title, "Your booking of Atlas was cancelled");
  assert.match(hugoTold?.body ?? "", /Camille Martin cancelled it\.$/u);
});

test("a weekly invitation is one item for the series", async () => {
  const { sql } = database;
  chest.notifications.length = 0;
  const done = await rooms.bookRoom(sql, asMember(lea), { roomId: o.bora, day: workday(1), start: 480, end: 510, title: "Stand-up", attendees: [hugo.id], weeks: 3 }, zone);
  await tell.invited(asMember(lea), [hugo.id], done.bookings);
  assert.equal(chest.notifications.length, 1);
  assert.match(chest.notifications[0]!.title, /^Léa Dubois invited you every \w+day: Stand-up$/u);
  assert.match(chest.notifications[0]!.body ?? "", /^Bora · 08:00–08:30 · 3 weeks from /u);
});

test("booking one's own desk is silent; a desk an admin frees is told to its holder", async () => {
  const { sql } = database;
  chest.notifications.length = 0;
  const b = await desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[0], day: workday(2) }, zone);
  assert.equal(chest.notifications.length, 0);
  await tell.desksCancelled(asMember(hugo), [await desks.cancelDesk(sql, asMember(hugo), b.id)], "admin");
  assert.equal(chest.notifications.length, 0);
  const again = await desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[0], day: workday(2) }, zone);
  await tell.desksCancelled(asMember(camille), [await desks.cancelDesk(sql, asMember(camille), again.id)], "admin");
  assert.equal(chest.notifications.length, 1);
  assert.equal(chest.notifications[0]!.title, "Your booking of desk D-01 was cancelled");
  assert.equal(chest.badges.size, 0);
});
