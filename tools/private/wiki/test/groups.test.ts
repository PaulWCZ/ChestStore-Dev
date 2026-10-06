import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { companyGroups, forgetGroups, membersOfTool } from "../src/lib/groups.ts";
import * as pages from "../src/lib/pages.ts";
import * as reads from "../src/lib/reads.ts";
import * as spaces from "../src/lib/spaces.ts";
import * as tell from "../src/lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, groups, hugo, ines, lea, tom } from "./support/members.ts";

// The wiki is usually open to everyone: no group gives it. With the
// capability "members.groups" (Proposal (studio), the name announced for
// 0.5) the Chest names every group a member is in — in their assertion
// (member(request).groups) and in members.* — so a space kept to Tech, or
// a page Sales must confirm, reaches exactly that group. Without it, the
// Chest names only the groups that give the wiki.

const office = { id: groups.office, name: "Office", members: [camille.id], grants: false };
const sales = { id: groups.sales, name: "Sales", members: [ines.id, hugo.id], grants: false };
const tech = { id: groups.tech, name: "Tech", members: [tom.id, lea.id], grants: false };

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, groups: [office, sales, tech], capabilities: ["members", "files", "notifications", "members.groups"] });
  forgetGroups();
});
after(async () => {
  await chest.close();
  await database.close();
});

test("a space kept to a group that does not give the wiki: its members read it, as the Chest names their groups", async () => {
  const { sql } = database;
  assert.deepEqual((await companyGroups()).map(g => g.name), ["Office", "Sales", "Tech"], "every group of the Chest");
  const s = await spaces.createSpace(sql, asMember(camille), { name: "Servers", visibility: "groups", groups: [groups.tech] });
  // Léa, as the Chest asserts her with members.groups: in Tech.
  assert.equal((await spaces.space(sql, asMember(lea), s.id)).access, "read");
  await assert.rejects(spaces.space(sql, asMember(hugo), s.id), /not_found/u);
  // Lists of people carry every group.
  const all = await membersOfTool();
  assert.deepEqual(all.find(m => m.id === tom.id)!.groups, [groups.tech]);
  assert.deepEqual(await tell.audience({ visibility: "groups", groups: [groups.tech], createdBy: camille.id }, [lea.id, hugo.id]), [lea.id]);
});

test("a page Sales must confirm: only Sales is told, and it is on their home page", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(camille), { name: "Price list" });
  const p = await pages.createPage(sql, asMember(camille), { spaceId: s.id, title: "Prices 2027" });
  const page = await reads.ask(sql, asMember(camille), p.id, { groups: [groups.sales] });
  const state = await reads.readState(sql, asMember(camille), p.id);
  chest.notifications.splice(0);
  assert.equal(await tell.readAsked(asMember(camille), page, state.asked!), 2);
  assert.deepEqual(chest.notifications.map(n => n.member).sort(), [ines.id, hugo.id].sort());
  assert.deepEqual((await reads.toRead(sql, asMember(hugo))).map(r => r.id), [p.id]);
  assert.deepEqual(await reads.toRead(sql, asMember(tom)), []);
});

test("without members.groups: only the groups that give the wiki", async () => {
  await chest.close();
  chest = await fakeChest({ network: {}, members: everyone, groups: [{ ...tech, grants: true }, sales], capabilities: ["members", "files", "notifications"] });
  forgetGroups();
  assert.deepEqual((await companyGroups()).map(g => g.name), ["Tech"]);
  const all = await membersOfTool();
  assert.deepEqual(all.find(m => m.id === lea.id)!.groups, [groups.tech]);
  assert.deepEqual(all.find(m => m.id === hugo.id)!.groups, [], "Sales does not give the wiki: not named");
});
