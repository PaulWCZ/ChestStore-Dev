import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { forgetGroups, membersOfTool, withGroups } from "../lib/groups.ts";
import * as pages from "../lib/pages.ts";
import * as reads from "../lib/reads.ts";
import * as spaces from "../lib/spaces.ts";
import * as tell from "../lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, groups, hugo, ines, lea, tom } from "./support/members.ts";

// The wiki is usually open to everyone: no group gives it, so a member's
// groups as the Chest asserts them (SDK 0.3.0) are empty. With the
// "groups" permission (Proposal (studio)) a space kept to Tech, or a page
// Sales must confirm, asks the Chest who is in the group
// (members.groups.of for the person signed in, the groups' members for a
// list of people).

const bare = everyone.map(p => ({ ...p, groups: [] }));
const as = (p: (typeof everyone)[number]) => asMember({ ...p, groups: [] });
const office = { id: groups.office, name: "Office", members: [camille.id], grants: false };
const sales = { id: groups.sales, name: "Sales", members: [ines.id, hugo.id], grants: false };
const tech = { id: groups.tech, name: "Tech", members: [tom.id, lea.id], grants: false };

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: bare, groups: [office, sales, tech], capabilities: ["members", "files", "notifications", "groups"] });
  forgetGroups();
});
after(async () => {
  await chest.close();
  await database.close();
});

test("a space kept to a group that does not give the wiki: its members read it, asked of the Chest", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, as(camille), { name: "Servers", visibility: "groups", groups: [groups.tech] });
  // Léa's assertion lists no group: alone, it does not open the space…
  await assert.rejects(spaces.space(sql, as(lea), s.id), /not_found/u);
  // …her groups from the Chest do (what currentMember() gives every page).
  const leaAll = await withGroups(as(lea));
  assert.deepEqual(leaAll.groups, [groups.tech]);
  assert.equal((await spaces.space(sql, leaAll, s.id)).access, "read");
  await assert.rejects(spaces.space(sql, await withGroups(as(hugo)), s.id), /not_found/u);
  // Lists of people carry every group, with one call per group.
  const all = await membersOfTool();
  assert.deepEqual(all.find(m => m.id === tom.id)!.groups, [groups.tech]);
  assert.deepEqual(await tell.audience({ visibility: "groups", groups: [groups.tech], createdBy: camille.id }, [lea.id, hugo.id]), [lea.id]);
});

test("a page Sales must confirm: only Sales is told, and it is on their home page", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, as(camille), { name: "Price list" });
  const p = await pages.createPage(sql, as(camille), { spaceId: s.id, title: "Prices 2027" });
  const page = await reads.ask(sql, as(camille), p.id, { groups: [groups.sales] });
  const state = await reads.readState(sql, as(camille), p.id);
  chest.notifications.splice(0);
  assert.equal(await tell.readAsked(as(camille), page, state.asked!), 2);
  assert.deepEqual(chest.notifications.map(n => n.member).sort(), [ines.id, hugo.id].sort());
  assert.deepEqual((await reads.toRead(sql, await withGroups(as(hugo)))).map(r => r.id), [p.id]);
  assert.deepEqual(await reads.toRead(sql, await withGroups(as(tom))), []);
});

test("without the permission: only the groups that give the wiki, as the assertion says", async () => {
  await chest.close();
  chest = await fakeChest({ members: everyone, groups: [{ ...tech, grants: true }, sales], capabilities: ["members", "files", "notifications"] });
  forgetGroups();
  const s = await spaces.createSpace(database.sql, asMember(camille), { name: "Tech only", visibility: "groups", groups: [groups.tech] });
  assert.deepEqual((await withGroups(asMember(lea))).groups, [groups.tech]);
  assert.equal((await spaces.space(database.sql, await withGroups(asMember(lea)), s.id)).access, "read");
  assert.deepEqual((await withGroups(as(hugo))).groups, []);
});
