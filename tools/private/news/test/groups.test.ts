import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { everyone as readers } from "../lib/audience.ts";
import { AppError } from "../lib/errors.ts";
import { forgetGroups, withGroups } from "../lib/groups.ts";
import * as posts from "../lib/posts.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, groups, hugo, ines, lea, workshop } from "./support/members.ts";

// News is usually open to everyone: no group gives it, so a member's groups
// as the Chest asserts them (SDK 0.3.0) are only those that give News. With
// the "groups" permission (Proposal (studio)) a post kept to the Workshop
// (a group that does not give News) asks the Chest who is in it:
// members.groups.of for the reader signed in (what currentMember() gives
// every page), every group's members for the list of readers.

const zone = "Europe/Paris";
const hidden = (error: unknown) => error instanceof AppError && error.code === "not_found";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({
    chest: { timeZone: zone },
    members: everyone,
    groups: [{ ...workshop, members: [hugo.id, lea.id] }],
    capabilities: ["members", "files", "notifications", "groups"],
  });
  forgetGroups();
});
after(async () => {
  await chest.close();
  await database.close();
});

test("a post kept to a group that does not give News: its members read it, asked of the Chest", async () => {
  const { sql } = database;
  const p = await posts.createPost(sql, asMember(camille), { kind: "announcement", title: "Workshop safety", groups: [groups.workshop] }, { zone });
  // Hugo's assertion does not list the Workshop: alone, it does not open the post…
  const hugo0 = asMember(hugo);
  assert.ok(!hugo0.groups.includes(groups.workshop));
  await assert.rejects(posts.post(sql, hugo0, p.id, { zone }), hidden);
  // …his groups from the Chest do.
  const hugoAll = await withGroups(hugo0);
  assert.ok(hugoAll.groups.includes(groups.workshop));
  assert.equal((await posts.post(sql, hugoAll, p.id, { zone })).title, "Workshop safety");
  await assert.rejects(posts.post(sql, await withGroups(asMember(ines)), p.id, { zone }), hidden);
  // The readers' list carries every group (a post's audience, its counts).
  const { people } = await readers();
  assert.ok(people.find(r => r.id === lea.id)!.groups.includes(groups.workshop));
  assert.ok(!people.find(r => r.id === ines.id)!.groups.includes(groups.workshop));
});
