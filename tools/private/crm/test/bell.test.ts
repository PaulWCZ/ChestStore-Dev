import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { onSchedule as POST } from "../src/lib/deliveries.ts";
import * as activities from "../src/lib/activities.ts";
import * as deals from "../src/lib/deals.ts";
import { addDays } from "../src/shared/model.ts";
import { today } from "../src/lib/zone.ts";
import * as steps from "../src/lib/steps.ts";
import * as tell from "../src/lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ network: {}, members: everyone });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});

test("given a deal or a next step, one is told in their language; done, the item goes and the tile follows", async () => {
  const { sql } = database;
  const d = await deals.addDeal(sql, asMember(camille), { title: "Printers", value: 240000 });
  const given = await deals.setOwner(sql, asMember(camille), d.id, ines.id);
  await tell.dealGiven(asMember(camille), given.given, { id: d.id, title: d.title, value: d.value });
  assert.deepEqual(chest.notifications.map(n => [n.member, n.title, n.body?.replace(/\s/gu, " "), n.key]), [[ines.id, "Camille Martin vous a confié une affaire", "Printers · 2 400 €", `deal:${d.id}:owner`]]);
  const s = await steps.addStep(sql, asMember(camille), { deal: d.id }, { text: "Demo", due: today(), owner: hugo.id });
  await tell.stepGiven(asMember(camille), s.given, s.step, { kind: "deal", id: d.id, title: d.title });
  const bell = chest.notifications.find(n => n.member === hugo.id)!;
  assert.equal(bell.title, "Camille Martin gave you a next step");
  assert.match(bell.body ?? "", /^Demo — \w+ \d{1,2} \w+ · Printers$/u);
  await tell.refreshBadges(sql, [hugo.id, ines.id]);
  assert.equal(chest.badges.get(hugo.id), 1);
  await steps.completeStep(sql, asMember(hugo), s.step.id);
  await tell.stepSettled(s.step.id);
  await tell.refreshBadges(sql, [hugo.id]);
  assert.equal(chest.notifications.some(n => n.key === `step:${s.step.id}`), false);
  assert.equal(chest.badges.get(hugo.id), undefined);
  // Giving it to oneself tells nobody.
  const mine = await steps.addStep(sql, asMember(hugo), { deal: d.id }, { text: "Mine", due: today(), owner: hugo.id }).catch(e => e);
  assert.ok(mine instanceof Error, "Hugo does not own the deal");
});

test("the weekday morning: each person's due steps in one item, in their language; tiles set; removed history purged", async () => {
  const { sql } = database;
  chest.notifications.length = 0;
  const d1 = await deals.addDeal(sql, asMember(ines), { title: "Laptops" });
  const d2 = await deals.addDeal(sql, asMember(ines), { title: "Screens" });
  const d3 = await deals.addDeal(sql, asMember(hugo), { title: "Later" });
  await steps.addStep(sql, asMember(ines), { deal: d1.id }, { text: "Call the buyer", due: addDays(today(), -1) });
  await steps.addStep(sql, asMember(ines), { deal: d2.id }, { text: "Send the quote", due: today() });
  await steps.addStep(sql, asMember(hugo), { deal: d3.id }, { text: "Next month", due: addDays(today(), 30) });
  const gone = await activities.log(sql, asMember(ines), { deal: d1.id }, "note", "Oops");
  await activities.remove(sql, asMember(ines), gone.id);
  await sql`update activities set removed_at = now() - interval '2 days' where id = ${gone.id}`;
  chest.badges.set(hugo.id, 4); // stale since yesterday
  assert.equal(await chest.run("morning", POST), 204);
  assert.deepEqual(chest.notifications.map(n => [n.member, n.title, n.body, n.key]), [[ines.id, "2 prochaines étapes pour aujourd’hui", "Call the buyer · Send the quote", "digest"]]);
  assert.equal(chest.badges.get(ines.id), 2);
  assert.equal(chest.badges.get(hugo.id), undefined);
  const [purged] = await sql`select count(*)::int as n from activities where id = ${gone.id}`;
  assert.equal(purged!["n"], 0);
  // Delivered again (at least once): the same item, not a second one.
  assert.equal(await chest.run("morning", POST), 204);
  assert.equal(chest.notifications.length, 1);
});
