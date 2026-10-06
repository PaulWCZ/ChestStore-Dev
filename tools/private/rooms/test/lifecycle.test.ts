import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { builtServer, type Handler } from "./support/server.ts";
import * as desks from "../src/lib/desk-bookings.ts";
import { addDays, today } from "../src/shared/model.ts";
import * as places from "../src/lib/places.ts";
import { presenceOf, setPresence } from "../src/lib/presence.ts";
import * as rooms from "../src/lib/room-bookings.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, sofia } from "./support/members.ts";
import { office, workday, zone } from "./support/places.ts";

let database: TestDatabase;
let chest: FakeChest;
let o: Awaited<ReturnType<typeof office>>;
let POST: Handler;
before(async () => {
  POST = await builtServer();
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  o = await office(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

test("someone who leaves: their coming bookings are cancelled and their guests told, their desk freed; the past stays", async () => {
  const { sql } = database;
  const d = workday(1);
  await places.updateDesk(sql, asMember(camille), o.desks[3], { name: "D-04", assignedTo: hugo.id });
  const mine = await rooms.bookRoom(sql, asMember(hugo), { roomId: o.atlas, day: d, start: 600, end: 660, title: "Hugo's review", attendees: [ines.id] }, zone);
  const invited = await rooms.bookRoom(sql, asMember(lea), { roomId: o.bora, day: d, start: 600, end: 660, attendees: [hugo.id, ines.id] }, zone);
  const desk = await desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[0], day: workday(2) }, zone);
  await setPresence(sql, asMember(hugo), { day: d, status: "office" }, zone);
  // A booking of the past, written as it would have been.
  await sql`insert into desk_bookings (desk_id, member_id, day, part, during) values (${o.desks[1]!}, ${hugo.id}, ${addDays(today(zone), -7)}, 'day', tstzrange(now() - interval '8 days', now() - interval '7 days'))`;
  chest.notifications.length = 0;
  assert.equal(await chest.emit({ type: "member.removed", data: { id: hugo.id } }, POST), 204);
  assert.deepEqual(await rooms.roomDay(sql, asMember(ines), o.office, d, zone).then(b => b.map(x => [x.id, x.attendees])), [[invited.bookings[0]!.id, [ines.id]]]);
  assert.equal((await desks.deskDay(sql, asMember(ines), o.office, workday(2))).some(b => b.id === desk.id), false);
  assert.equal((await presenceOf(sql, [hugo.id], d, d)).get(hugo.id), undefined);
  const [assigned] = await sql`select assigned_to from desks where id = ${o.desks[3]!}`;
  assert.equal(assigned!["assigned_to"], null);
  const [past] = await sql`select count(*)::int as n from desk_bookings where member_id = ${hugo.id} and cancelled_at is null`;
  assert.equal(past!["n"], 1);
  // Inès, invited to Hugo's meeting, hears it is cancelled, in French.
  const told = chest.notifications.filter(n => n.member === ines.id);
  assert.equal(told.length, 1);
  assert.equal(told[0]!.title, "Réunion annulée : Hugo's review");
  assert.match(told[0]!.body ?? "", /L’organisateur est parti/u);
  assert.equal(told[0]!.key, `room:${mine.bookings[0]!.id}`);
});

test("an erasure anonymises the past, deletes presence, and is acknowledged once", async () => {
  const { sql } = database;
  const d = workday(3);
  await rooms.bookRoom(sql, asMember(sofia), { roomId: o.atlas, day: d, start: 540, end: 600, attendees: [lea.id] }, zone);
  await rooms.bookRoom(sql, asMember(lea), { roomId: o.bora, day: d, start: 540, end: 600, attendees: [sofia.id] }, zone);
  await setPresence(sql, asMember(sofia), { day: d, status: "remote" }, zone);
  await sql`insert into room_bookings (room_id, member_id, title, day, during) values (${o.bora}, ${sofia.id}, 'Old', ${addDays(today(zone), -3)}, tstzrange(now() - interval '3 days', now() - interval '3 days' + interval '1 hour'))`;
  const erasure = "era_" + "c".repeat(26);
  const event = { type: "member.erased" as const, id: "evt_" + "d".repeat(26), data: { id: sofia.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  for (const table of ["desk_bookings", "room_bookings", "room_attendees", "presence", "member_prefs"]) {
    const [left] = await sql.unsafe(`select count(*)::int as n from ${table} where member_id = $1`, [sofia.id]);
    assert.equal(left!["n"], 0, table);
  }
  const [old] = await sql`select member_id from room_bookings where title = 'Old'`;
  assert.equal(old!["member_id"], "erased");
  assert.deepEqual(chest.acknowledged, [erasure]);
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});
