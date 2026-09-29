import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as desks from "../lib/desk-bookings.ts";
import { addDays, today, weekday } from "../lib/model.ts";
import { presenceOf, setPresence } from "../lib/presence.ts";
import { setRules } from "../lib/settings.ts";
import { applyUsual, setUsualWeek, usualWeek } from "../lib/usual.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, sofia } from "./support/members.ts";
import { office, zone } from "./support/places.ts";

let database: TestDatabase;
let chest: FakeChest;
let o: Awaited<ReturnType<typeof office>>;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  o = await office(database.sql);
  await setRules(database.sql, asMember(camille), { daysAhead: 14 });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  const { sql } = database;
  await sql`delete from desk_bookings`;
  await sql`delete from presence`;
  await sql`delete from usual_week`;
  await sql`delete from usual_applied`;
  await sql`delete from member_prefs`;
});

// The working days from tomorrow to the end of the window (14 days).
const coming = () => Array.from({ length: 14 }, (_, i) => addDays(today(zone), i + 1)).filter(d => weekday(d) <= 5);

test("a usual week says the coming days and books the usual desk, within the booking window, once", async () => {
  const { sql } = database;
  const { applied } = await setUsualWeek(sql, asMember(hugo), { days: { 2: "office", 4: "office", 5: "remote" }, deskId: o.desks[1] }, zone);
  const tue = coming().filter(d => weekday(d) === 2);
  const fri = coming().filter(d => weekday(d) === 5);
  assert.ok(applied >= tue.length * 2 + fri.length - 2, `applied ${applied}`);
  const said = (await presenceOf(sql, [hugo.id], today(zone), addDays(today(zone), 20))).get(hugo.id)!;
  for (const d of tue) assert.equal(said.get(d)?.status, "office", d);
  for (const d of fri) assert.equal(said.get(d)?.status, "remote", d);
  assert.equal([...said.keys()].some(d => d > addDays(today(zone), 14)), false, "nothing beyond the window");
  const booked = await desks.deskBookingsOf(sql, [hugo.id], today(zone), addDays(today(zone), 20));
  assert.ok(booked.every(b => b.deskId === o.desks[1] && [2, 4].includes(weekday(b.day))));
  assert.ok(booked.length >= tue.length);
  // Again: nothing more (idempotent), whoever reads a page.
  assert.equal(await applyUsual(sql, zone), 0);
  assert.deepEqual((await usualWeek(sql, asMember(hugo))).days, { 2: "office", 4: "office", 5: "remote" });
});

test("a day the person changed is never changed again; a day already said is left alone", async () => {
  const { sql } = database;
  const tue = coming().find(d => weekday(d) === 2)!;
  const thu = coming().find(d => weekday(d) === 4)!;
  await setPresence(sql, asMember(ines), { day: thu, status: "off" }, zone);
  await setUsualWeek(sql, asMember(ines), { days: { 2: "office", 4: "office" }, deskId: o.desks[2] }, zone);
  let said = (await presenceOf(sql, [ines.id], today(zone), addDays(today(zone), 20))).get(ines.id)!;
  assert.equal(said.get(thu)?.status, "off", "said before: kept");
  assert.equal(said.get(tue)?.status, "office");
  // Ines says remote on Tuesday: her desk goes; the usual week never puts it back.
  await setPresence(sql, asMember(ines), { day: tue, status: "remote" }, zone);
  await sql`delete from usual_applied where day <> ${tue}`; // even if everything else were applied again
  await applyUsual(sql, zone);
  said = (await presenceOf(sql, [ines.id], today(zone), addDays(today(zone), 20))).get(ines.id)!;
  assert.equal(said.get(tue)?.status, "remote");
  assert.equal((await desks.deskBookingsOf(sql, [ines.id], tue, tue)).length, 0);
});

test("changing the usual week takes back what the old one did, not what the person did", async () => {
  const { sql } = database;
  const days = coming();
  const mon = days.find(d => weekday(d) === 1)!;
  const wed = days.find(d => weekday(d) === 3)!;
  await setUsualWeek(sql, asMember(lea), { days: { 1: "office", 3: "office" }, deskId: o.desks[3] }, zone);
  // Lea moves to another desk on Monday herself.
  await desks.bookDesk(sql, asMember(lea), { deskId: o.desks[0], day: mon, move: true }, zone);
  await setUsualWeek(sql, asMember(lea), { days: { 1: "remote", 3: "remote" }, deskId: null }, zone);
  const said = (await presenceOf(sql, [lea.id], today(zone), addDays(today(zone), 20))).get(lea.id)!;
  assert.equal(said.get(mon)?.status, "office", "her own choice stays");
  assert.equal(said.get(wed)?.status, "remote", "the old usual Wednesday is said again");
  const left = (await desks.deskBookingsOf(sql, [lea.id], today(zone), addDays(today(zone), 20))).filter(b => b.day === mon || b.day === wed);
  assert.deepEqual(left.map(b => [b.day, b.deskId]), [[mon, o.desks[0]]]);
});

test("a usual desk someone else took that day: the day is said, without a desk; the desk-day limit holds", async () => {
  const { sql } = database;
  const tue = coming().find(d => weekday(d) === 2)!;
  await desks.bookDesk(sql, asMember(lea), { deskId: o.desks[1], day: tue }, zone);
  await setRules(sql, asMember(camille), { maxDeskDays: 1 });
  try {
    await setUsualWeek(sql, asMember(hugo), { days: { 1: "office", 2: "office", 3: "office" }, deskId: o.desks[1] }, zone);
    assert.equal((await presenceOf(sql, [hugo.id], tue, tue)).get(hugo.id)?.get(tue)?.status, "office");
    const mine = await desks.deskBookingsOf(sql, [hugo.id], today(zone), addDays(today(zone), 14));
    assert.ok(!mine.some(b => b.day === tue));
    const perWeek = new Map<string, number>();
    for (const b of mine) perWeek.set(b.day.slice(0, 7) + ":" + Math.floor((Date.parse(b.day) / 864e5 + 3) / 7), (perWeek.get(b.day.slice(0, 7) + ":" + Math.floor((Date.parse(b.day) / 864e5 + 3) / 7)) ?? 0) + 1);
    assert.ok([...perWeek.values()].every(n => n <= 1), "one desk day a week");
  } finally {
    await setRules(sql, asMember(camille), { maxDeskDays: null });
  }
});

test("refusals: no role, a weekday that is not one, a status that is not one, a desk given to someone else", async () => {
  const { sql } = database;
  await assert.rejects(setUsualWeek(sql, asMember(nora), { days: {} }, zone), { code: "forbidden" });
  await assert.rejects(setUsualWeek(sql, asMember(hugo), { days: { 8: "office" } }, zone), { code: "invalid" });
  await assert.rejects(setUsualWeek(sql, asMember(hugo), { days: { 1: "beach" } }, zone), { code: "invalid" });
  await assert.rejects(setUsualWeek(sql, asMember(hugo), { days: [] }, zone), { code: "invalid" });
  await sql`update desks set assigned_to = ${sofia.id} where id = ${o.desks[3]!}`;
  try {
    await assert.rejects(setUsualWeek(sql, asMember(hugo), { days: {}, deskId: o.desks[3] }, zone), { code: "assigned" });
  } finally {
    await sql`update desks set assigned_to = null where id = ${o.desks[3]!}`;
  }
});
