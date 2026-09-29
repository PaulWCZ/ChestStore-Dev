import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-jobs/[name]/route.ts";
import { checkIn } from "../lib/check-in.ts";
import * as places from "../lib/places.ts";
import { setRules } from "../lib/settings.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";
import { office } from "./support/places.ts";

let database: TestDatabase;
let chest: FakeChest;
let o: Awaited<ReturnType<typeof office>>;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, schedules: [{ name: "quarter", cron: "*/15 * * * *" }] });
  o = await office(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

// A booking of Atlas by Hugo with Ines, from `from` to `to` minutes from
// now, made `made` minutes from now (in the past: negative).
async function booking(from: number, to: number, made = -60 * 24, room = o.atlas): Promise<string> {
  const { sql } = database;
  const [b] = await sql<{ id: string }[]>`
    insert into room_bookings (room_id, member_id, title, day, during, created_at)
    values (${room}, ${hugo.id}, 'Sync', current_date,
      tstzrange(now() + make_interval(mins => ${from}), now() + make_interval(mins => ${to}), '[)'), now() + make_interval(mins => ${made}))
    returning id`;
  await sql`insert into room_attendees (booking_id, member_id) values (${b!.id}, ${ines.id})`;
  return String(b!.id);
}

test("a quarter of an hour before, its people are reminded, once", async () => {
  const soon = await booking(10, 40);
  chest.notifications.length = 0;
  assert.equal(await chest.run("quarter", POST), 204);
  const told = chest.notifications.filter(n => n.key === `room:${soon}`);
  assert.deepEqual(told.map(n => n.member).sort(), [hugo.id, ines.id].sort());
  assert.match(told.find(n => n.member === ines.id)!.title, /^Commence à \d\d:\d\d : Sync$/u);
  chest.notifications.length = 0;
  await chest.run("quarter", POST);
  assert.equal(chest.notifications.filter(n => n.key === `room:${soon}`).length, 0, "once");
  await database.sql`delete from room_bookings`;
});

test("check-in off: nobody's room is freed; on: a room nobody checked in to is freed, its people told", async () => {
  const { sql } = database;
  const cabin = await places.addRoom(sql, asMember(camille), o.ground, { name: "Cabin", capacity: 2 });
  const ghost = await booking(-20, 40, -60);
  const kept = await booking(-20, 100, -60, o.bora);
  await booking(-20, 30, -25, cabin.id); // booked on the spot: counts as checked in
  await chest.run("quarter", POST);
  assert.equal((await sql`select count(*)::int as n from room_bookings where cancelled_at is not null`)[0]!.n, 0, "off: nothing freed");
  await setRules(sql, asMember(camille), { checkIn: true });
  await checkIn(sql, asMember(ines), kept);
  chest.notifications.length = 0;
  await chest.run("quarter", POST);
  const freed = (await sql<{ id: string }[]>`select id from room_bookings where cancelled_at is not null`).map(r => String(r.id));
  assert.deepEqual(freed, [ghost]);
  assert.ok(chest.notifications.some(n => n.member === hugo.id && /Atlas/u.test(n.title)), "the organiser hears it");
  assert.ok(chest.notifications.some(n => n.member === ines.id && /Personne n’a pointé/u.test(n.body ?? "")), "the guest too, in French");
  await setRules(sql, asMember(camille), { checkIn: false });
  await sql`delete from room_bookings`;
});

test("check-in: the organiser or a guest, from ten minutes before; not someone else; not once over", async () => {
  const { sql } = database;
  const later = await booking(30, 60);
  await assert.rejects(checkIn(sql, asMember(hugo), later), { code: "too_early" });
  const now = await booking(5, 60, -60 * 24, o.bora);
  await assert.rejects(checkIn(sql, asMember(lea), now), { code: "forbidden" });
  await checkIn(sql, asMember(hugo), now);
  await checkIn(sql, asMember(hugo), now);
  const over = await booking(-60, -30);
  await assert.rejects(checkIn(sql, asMember(hugo), over), { code: "past" });
  await checkIn(sql, asMember(camille), now);
  await sql`delete from room_bookings`;
});
