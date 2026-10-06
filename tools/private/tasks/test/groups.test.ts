import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { boardAudience } from "../src/lib/audience.ts";
import * as boards from "../src/lib/boards.ts";
import * as cards from "../src/lib/cards.ts";
import { AppError } from "../src/core/tool.ts";
import { forgetGroups, sharingGroups, withGroups } from "../src/lib/groups.ts";
import { en } from "../src/i18n/en.ts";
import { handlers } from "../src/lib/lifecycle.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, groups, hugo, ines, lea } from "./support/members.ts";

// Tasks is usually open to everyone: no group gives it, so a member's
// groups as the Chest asserts them (SDK 0.3.0) are empty. With the
// "groups" permission (Proposal (studio)), a private board may be shared
// with any group of the Chest, and whether someone is in it is asked of
// the Chest (members.groups.of / groups.members).

// Nobody's groups give Tasks: what member(request) carries is [].
const bare = everyone.map(p => ({ ...p, groups: [] }));
const sales = { id: groups.sales, name: "Sales", members: [ines.id, hugo.id], grants: false };
const office = { id: groups.office, name: "Office", members: [camille.id, lea.id], grants: false };
const as = (p: (typeof everyone)[number]) => asMember({ ...p, groups: [] });
const hidden = (error: unknown) => error instanceof AppError && error.code === "not_found";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: bare, groups: [sales, office], capabilities: ["members", "files", "notifications", "groups"] });
  forgetGroups();
});
after(async () => {
  await chest.close();
  await database.close();
});

test("every group of the Chest may be chosen for a private board, by name", async () => {
  assert.deepEqual(await sharingGroups(), [{ id: groups.office, name: "Office" }, { id: groups.sales, name: "Sales" }]);
});

test("a board shared with a group that does not give Tasks: its members see it, asked of the Chest", async () => {
  const { sql } = database;
  const b = await boards.createBoard(sql, as(hugo), { name: "Leads", visibility: "private", groups: [groups.sales] }, en.templates.columns);
  // Inès's assertion lists no group: alone, it does not open the board…
  await assert.rejects(boards.board(sql, as(ines), b.id), hidden);
  // …her groups from the Chest do (what currentMember() gives every page).
  const inesAll = await withGroups(as(ines));
  assert.deepEqual(inesAll.groups, [groups.sales]);
  assert.equal((await boards.board(sql, inesAll, b.id)).access, "write");
  // Léa (Office) does not see it.
  await assert.rejects(boards.board(sql, await withGroups(as(lea)), b.id), hidden);
  // The pickers and the checks of a list ask per group, not per person.
  const audience = (await boardAudience(b)).map(p => p.id);
  assert.ok(audience.includes(ines.id));
  assert.ok(!audience.includes(lea.id));
  assert.deepEqual([...await cards.audience(b, [ines.id, lea.id])], [ines.id]);
});

test("someone leaves the group: once the Chest says so, the board closes to them", async () => {
  const { sql } = database;
  const b = await boards.createBoard(sql, as(hugo), { name: "Pipeline", visibility: "private", groups: [groups.sales] }, en.templates.columns);
  assert.ok((await boardAudience(b)).some(p => p.id === ines.id));
  chest.groups.find(g => g.id === groups.sales)!.members = [hugo.id];
  await handlers(sql)["member.updated"]!({ id: "evt_groups1", type: "member.updated", occurredAt: new Date().toISOString(), data: { id: ines.id, changed: ["groups"] } } as never);
  assert.ok(!(await boardAudience(b)).some(p => p.id === ines.id));
  await assert.rejects(boards.board(sql, await withGroups(as(ines)), b.id), hidden);
  chest.groups.find(g => g.id === groups.sales)!.members = [ines.id, hugo.id];
  forgetGroups();
});

test("without the permission: only the groups that give Tasks, as the assertion says", async () => {
  await chest.close();
  chest = await fakeChest({ network: {}, members: everyone, groups: [{ ...office, grants: true }, sales], capabilities: ["members", "files", "notifications"] });
  forgetGroups();
  assert.deepEqual(await sharingGroups(), [{ id: groups.office, name: "Office" }]);
  const lea0 = asMember({ ...lea, groups: [groups.office] });
  assert.deepEqual((await withGroups(lea0)).groups, [groups.office]);
  const b = await boards.createBoard(database.sql, as(hugo), { name: "Rota", visibility: "private", groups: [groups.office] }, en.templates.columns);
  assert.equal((await boards.board(database.sql, await withGroups(lea0), b.id)).access, "comment");
});
