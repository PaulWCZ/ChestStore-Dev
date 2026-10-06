import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import * as members from "@argentic/chest-sdk/members";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { boardAudience } from "../src/lib/audience.ts";
import * as boards from "../src/lib/boards.ts";
import * as cards from "../src/lib/cards.ts";
import { AppError } from "@argentic/chest-app";
import { forgetGroups, sharingGroups } from "../src/lib/groups.ts";
import { en } from "../src/i18n/en.ts";
import { handlers } from "../src/lib/lifecycle.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, groups, hugo, ines, lea } from "./support/members.ts";

// Tasks is usually open to everyone: no group gives it. With the
// capability "members.groups" (Proposal (studio), announced for 0.5), a
// private board may be shared with any group of the Chest, and every
// member the Chest gives Tasks carries every group they are in
// (member.groups) — nothing to ask on the side.

const sales = { id: groups.sales, name: "Sales", members: [ines.id, hugo.id], grants: false };
const office = { id: groups.office, name: "Office", members: [camille.id, lea.id], grants: false };
const hidden = (error: unknown) => error instanceof AppError && error.code === "not_found";
// A member as the Chest gives them to Tasks now (members.get: their groups
// as this Chest's capabilities show them).
const asChest = async (p: (typeof everyone)[number]) => asMember((await members.get(p.id))!);

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, groups: [sales, office], capabilities: ["members", "files", "notifications", "members.groups"] });
  forgetGroups();
});
after(async () => {
  await chest.close();
  await database.close();
});

test("every group of the Chest may be chosen for a private board, by name", async () => {
  assert.deepEqual(await sharingGroups(), [{ id: groups.office, name: "Office" }, { id: groups.sales, name: "Sales" }]);
});

test("a board shared with a group that does not give Tasks: its members see it, from their member.groups", async () => {
  const { sql } = database;
  const b = await boards.createBoard(sql, await asChest(hugo), { name: "Leads", visibility: "private", groups: [groups.sales] }, en.templates.columns);
  const inesNow = await asChest(ines);
  assert.deepEqual(inesNow.groups, [groups.sales]);
  assert.equal((await boards.board(sql, inesNow, b.id)).access, "write");
  // Léa (Office) does not see it.
  await assert.rejects(boards.board(sql, await asChest(lea), b.id), hidden);
  // The pickers and the checks of a list read each member's groups.
  const audience = (await boardAudience(b)).map(p => p.id);
  assert.ok(audience.includes(ines.id));
  assert.ok(!audience.includes(lea.id));
  assert.deepEqual([...await cards.audience(b, [ines.id, lea.id])], [ines.id]);
});

test("someone leaves the group: the board closes to them at once; a group renamed is offered by its new name", async () => {
  const { sql } = database;
  const b = await boards.createBoard(sql, await asChest(hugo), { name: "Pipeline", visibility: "private", groups: [groups.sales] }, en.templates.columns);
  assert.ok((await boardAudience(b)).some(p => p.id === ines.id));
  chest.groups.find(g => g.id === groups.sales)!.members = [hugo.id];
  chest.members.find(m => m.id === ines.id)!.groups = [];
  assert.ok(!(await boardAudience(b)).some(p => p.id === ines.id));
  await assert.rejects(boards.board(sql, await asChest(ines), b.id), hidden);
  chest.groups.find(g => g.id === groups.sales)!.name = "Sales team";
  assert.ok((await sharingGroups()).some(g => g.name === "Sales"), "kept a minute");
  await handlers(sql)["group.changed"]!({ id: "evt_groups1", type: "group.changed", occurredAt: new Date().toISOString(), data: { id: groups.sales } } as never);
  assert.ok((await sharingGroups()).some(g => g.name === "Sales team"));
  chest.groups.find(g => g.id === groups.sales)!.members = [ines.id, hugo.id];
  chest.groups.find(g => g.id === groups.sales)!.name = "Sales";
  chest.members.find(m => m.id === ines.id)!.groups = [groups.sales];
  forgetGroups();
});

test("without the capability: only the groups that give Tasks, as the Chest says them", async () => {
  await chest.close();
  chest = await fakeChest({ network: {}, members: everyone, groups: [{ ...office, grants: true }, sales], capabilities: ["members", "files", "notifications"] });
  forgetGroups();
  assert.deepEqual(await sharingGroups(), [{ id: groups.office, name: "Office" }]);
  assert.deepEqual((await asChest(ines)).groups, [], "Sales does not give Tasks: hidden");
  const b = await boards.createBoard(database.sql, await asChest(hugo), { name: "Rota", visibility: "private", groups: [groups.office] }, en.templates.columns);
  assert.equal((await boards.board(database.sql, await asChest(lea), b.id)).access, "comment");
});
