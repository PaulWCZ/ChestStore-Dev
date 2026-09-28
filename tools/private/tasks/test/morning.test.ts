import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-jobs/[name]/route.ts";
import * as boards from "../lib/boards.ts";
import * as cards from "../lib/cards.ts";
import { en } from "../lib/i18n/en.ts";
import { today } from "../lib/model.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, schedules: [{ name: "morning", cron: "30 7 * * 1-5" }] });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("the weekday morning tells each person what is due, in their language, and sets every tile", async () => {
  const { sql } = database;
  const b = await boards.createBoard(sql, asMember(hugo), { name: "Morning" }, en.templates.columns);
  const [todo] = await boards.columns(sql, b.id);
  const yesterday = new Date(Date.now() - 864e5);
  for (const [title, due, who] of [["Call the bank", today(yesterday), ines.id], ["Send the quote", today(), ines.id], ["Later thing", "2099-01-01", hugo.id]] as const) {
    const c = await cards.addCard(sql, asMember(hugo), b.id, todo!.id, title);
    await cards.updateCard(sql, asMember(hugo), c.id, { due });
    await cards.setAssignees(sql, asMember(hugo), c.id, [who]);
  }
  chest.badges.set(hugo.id, 4); // stale since yesterday
  assert.equal(await chest.run("morning", POST), 204);
  assert.deepEqual(chest.notifications.map(n => [n.member, n.title, n.body, n.key]), [[ines.id, "2 tâches pour aujourd’hui", "Call the bank · Send the quote", "digest"]]);
  assert.equal(chest.badges.get(ines.id), 2);
  assert.equal(chest.badges.get(hugo.id), undefined);
  // Delivered again (at least once): the same item, not a second one.
  assert.equal(await chest.run("morning", POST), 204);
  assert.equal(chest.notifications.length, 1);
});
