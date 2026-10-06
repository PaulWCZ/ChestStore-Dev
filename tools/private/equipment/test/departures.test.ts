import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { chest as chestSettings } from "@argentic/chest-sdk/chest";
import { onEvent, onSchedule } from "../src/lib/deliveries.ts";
import { listCategories } from "../src/lib/categories.ts";
import { lastDayOf, leavingList, purgeDepartures, readLeaving } from "../src/lib/departures.ts";
import { AppError } from "@argentic/chest-app";
import * as items from "../src/lib/items.ts";
import { addDays } from "../src/shared/model.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, sofia } from "./support/members.ts";

// People → Equipment: someone leaving, what they hold to take back.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});

const M = asMember(camille);
const told = (type: "people.leaving" | "people.leaving_cancelled", data: Record<string, unknown>, extra: { source?: string; occurredAt?: string } = {}) =>
  chest.deliver({ type, source: extra.source ?? "people", data, ...(extra.occurredAt ? { occurredAt: extra.occurredAt } : {}) }, onEvent);
const bell = (member: string, who: string) => chest.notifications.filter(n => n.member === member && n.key === `leaving:${who}`);
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

async function equip(member: string) {
  const { sql } = database;
  const cats = await listCategories(sql, M);
  const laptop = await items.createItem(sql, M, { categoryId: cats.find(c => c.key === "laptop")!.id, name: "ThinkPad X1" });
  const phone = await items.createItem(sql, M, { categoryId: cats.find(c => c.key === "phone")!.id, name: "iPhone 15" });
  const slack = await items.createItem(sql, M, { categoryId: cats.find(c => c.key === "licence")!.id, name: "Figma", seats: "3" });
  await items.give(sql, M, laptop.id, { to: { member } });
  await items.give(sql, M, phone.id, { to: { member } });
  await items.giveSeat(sql, M, slack.id, member);
  return { laptop, phone, slack };
}

test("every field of People's event is checked", () => {
  assert.deepEqual(readLeaving({ member: hugo.id, lastDay: "2026-10-12" }), { memberId: hugo.id, lastDay: "2026-10-12" });
  for (const bad of [{ member: "Hugo", lastDay: "2026-10-12" }, { member: hugo.id, lastDay: "2026-02-30" }, { member: hugo.id, lastDay: 20261012 }, { member: hugo.id }, { member: hugo.id, lastDay: "1900-01-01" }]) {
    assert.equal(readLeaving(bad), null, JSON.stringify(bad));
  }
});

test("someone leaving: the managers hear it once, in their language, with what to take back; the list and the person's page show it", async () => {
  const { sql } = database;
  const last = addDays(chestSettings.today(), 14);
  await equip(hugo.id);
  assert.equal(await told("people.leaving", { member: hugo.id, lastDay: last }, { occurredAt: ago(60_000) }), 204);
  const toCamille = bell(camille.id, hugo.id);
  assert.equal(toCamille.length, 1);
  assert.match(toCamille[0]!.title, /^Hugo Bernard part le \d+ \S+ — 3 objets à reprendre$/u);
  assert.match(bell(sofia.id, hugo.id)[0]!.title, /^Hugo Bernard leaves on \d+ \S+ — 3 items to take back$/u);
  assert.equal(toCamille[0]!.path, `/chest/people/${hugo.id}`);
  assert.equal(bell(hugo.id, hugo.id).length, 0, "never the person leaving");
  assert.deepEqual(await leavingList(sql, M), [{ memberId: hugo.id, lastDay: last, items: 2, seats: 1 }]);
  assert.equal(await lastDayOf(sql, M, hugo.id), last);
  await assert.rejects(leavingList(sql, asMember(ines)), (e: unknown) => e instanceof AppError && e.code === "forbidden");
  // The same event delivered twice: one bell item still.
  const event = { type: "people.leaving", source: "people", id: "evt_" + "p".repeat(26), data: { member: hugo.id, lastDay: last } };
  assert.equal(await chest.deliver(event, onEvent), 204);
  assert.equal(await chest.deliver(event, onEvent), 204);
  assert.equal(bell(camille.id, hugo.id).length, 1);
  // Taken back in People: the notice goes, the list forgets him.
  assert.equal(await told("people.leaving_cancelled", { member: hugo.id }), 204);
  assert.equal(bell(camille.id, hugo.id).length, 0);
  assert.deepEqual(await leavingList(sql, M), []);
  assert.equal(await lastDayOf(sql, M, hugo.id), null);
  // The first word, delivered again late: ignored.
  assert.equal(await told("people.leaving", { member: hugo.id, lastDay: last }, { occurredAt: ago(30_000) }), 204);
  assert.equal(bell(camille.id, hugo.id).length, 0);
  assert.deepEqual(await leavingList(sql, M), []);
  // Leaving again (a new word): told again.
  assert.equal(await told("people.leaving", { member: hugo.id, lastDay: last }), 204);
  assert.equal(bell(camille.id, hugo.id).length, 1);
  // Everything taken back: the notice goes; nothing more on the list.
  await items.takeEverythingBack(sql, M, hugo.id);
  assert.equal(bell(camille.id, hugo.id).length, 0);
  assert.deepEqual(await leavingList(sql, M), []);
  assert.equal(await lastDayOf(sql, M, hugo.id), last, "still leaving, nothing left to take back");
});

test("leaving then gone: the departure gives way to “left and holds”; other shapes, other tools and strangers change nothing; old ones are forgotten", async () => {
  const { sql } = database;
  const now = chestSettings.today();
  await equip(ines.id);
  assert.equal(await told("people.leaving", { member: ines.id, lastDay: now }), 204);
  assert.equal(bell(camille.id, ines.id).length, 1);
  chest.members.splice(chest.members.findIndex(m => m.id === ines.id), 1);
  chest.former.push({ id: ines.id, name: "Inès Moreau" });
  assert.equal(await chest.emit({ type: "member.removed", data: { id: ines.id } }, onEvent), 204);
  assert.equal(bell(camille.id, ines.id).length, 0, "the leaving notice goes");
  assert.equal(chest.notifications.filter(n => n.member === camille.id && n.key === `left:${ines.id}`).length, 1, "the left notice says the rest");
  assert.equal(await lastDayOf(sql, M, ines.id), null);
  // Once gone, a late word from People changes nothing.
  assert.equal(await told("people.leaving", { member: ines.id, lastDay: now }), 204);
  assert.equal(await lastDayOf(sql, M, ines.id), null);
  const count = async () => Number((await sql`select count(*)::int as n from departures`)[0]!["n"]);
  const before = await count();
  assert.equal(await told("people.leaving", { member: "mbr_" + "z".repeat(26), lastDay: now }), 204);
  assert.equal(await told("people.leaving", { member: sofia.id, lastDay: "soon" }), 204);
  assert.equal(await told("people.leaving", { member: sofia.id, lastDay: addDays(now, -40) }), 204);
  assert.equal(await told("people.leaving", { member: sofia.id, lastDay: now }, { source: "hiring" }), 401);
  assert.equal(await count(), before);
  // Forgotten 30 days after the last day; a cancelled one after a week.
  assert.equal(await told("people.leaving", { member: sofia.id, lastDay: now }), 204);
  assert.equal(await purgeDepartures(sql, addDays(now, 30)), 0);
  // Sofia's, and Inès's (kept after she left, so People hears when her things are back).
  assert.equal(await purgeDepartures(sql, addDays(now, 31)), 2);
  await sql`insert into departures (member_id, last_day, told_at) values (${camille.id}, null, now() - interval '8 days')`;
  assert.equal(await purgeDepartures(sql, now), 1);
});
