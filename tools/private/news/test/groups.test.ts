import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { everyone as readers } from "../src/lib/audience.ts";
import { AppError } from "@argentic/chest-app";
import { forgetGroups } from "../src/lib/groups.ts";
import * as posts from "../src/lib/posts.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, groups, hugo, ines, lea, workshop } from "./support/members.ts";

// News is usually open to everyone: no group gives it. With the capability
// "members.groups" (Proposal (studio), the name announced for 0.5) the
// Chest names every group a member is in — in their assertion and in
// members.* — so a post kept to the Workshop (a group that does not give
// News) reaches its members. Without it, the Chest names only the groups
// that give News.

const zone = "Europe/Paris";
const hidden = (error: unknown) => error instanceof AppError && error.code === "not_found";
const inWorkshop = (m: (typeof everyone)[number]) => ([hugo.id, lea.id].includes(m.id) ? { ...m, groups: [...m.groups, groups.workshop] } : m);
const cast = everyone.map(inWorkshop);

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {},
    chest: { timeZone: zone },
    members: cast,
    groups: [{ ...workshop, members: [hugo.id, lea.id], grants: false }],
    capabilities: ["members", "files", "notifications", "members.groups"],
  });
  forgetGroups();
});
after(async () => {
  await chest.close();
  await database.close();
});

test("a post kept to a group that does not give News: its members read it, as the Chest names their groups", async () => {
  const { sql } = database;
  const p = await posts.createPost(sql, asMember(camille), { kind: "announcement", title: "Workshop safety", groups: [groups.workshop] }, { zone });
  // Hugo, as the Chest asserts him with members.groups: in the Workshop.
  assert.equal((await posts.post(sql, asMember(inWorkshop(hugo)), p.id, { zone })).title, "Workshop safety");
  await assert.rejects(posts.post(sql, asMember(ines), p.id, { zone }), hidden);
  // The readers' list carries every group (a post's audience, its counts).
  const { people } = await readers();
  assert.ok(people.find(r => r.id === lea.id)!.groups.includes(groups.workshop));
  assert.ok(!people.find(r => r.id === ines.id)!.groups.includes(groups.workshop));
});

test("without members.groups, a group that does not give News names nobody: nothing invented", async () => {
  const saved = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("CHEST_")));
  const bare = await fakeChest({ network: {}, chest: { timeZone: zone }, members: cast, groups: [{ ...workshop, members: [hugo.id, lea.id], grants: false }], capabilities: ["members", "files", "notifications"] });
  try {
    const { people } = await readers();
    assert.ok(people.every(r => !r.groups.includes(groups.workshop)));
  } finally {
    await bare.close();
    Object.assign(process.env, saved);
  }
});
