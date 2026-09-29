import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { atOffice, presenceOf, setPresence } from "../lib/presence.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines } from "./support/members.ts";
import { workday, zone } from "./support/places.ts";

// A company that only wants "who is in on Thursday?" says it before any
// office is set up: presence needs no office.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("before any office exists, members say office, remote or off, and see who is in", async () => {
  const { sql } = database;
  const d = workday(1);
  await setPresence(sql, asMember(hugo), { day: d, status: "office" }, zone);
  await setPresence(sql, asMember(ines), { day: d, status: "remote" }, zone);
  assert.deepEqual((await presenceOf(sql, [hugo.id], d, d)).get(hugo.id)?.get(d), { status: "office", officeId: null });
  assert.deepEqual((await atOffice(sql, null, d, d)).get(d), [hugo.id]);
});
