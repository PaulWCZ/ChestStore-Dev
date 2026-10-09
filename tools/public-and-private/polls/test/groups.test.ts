import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest } from "@argentic/chest-sdk/testing";
import { answer } from "../src/lib/answers.ts";
import { AppError } from "@argentic/chest-app";
import { all, everyone as everyoneWithPolls, inAudience } from "../src/lib/audience.ts";
import { chestGroups as listGroups, forgetGroups, groupMembers } from "../src/lib/groups.ts";
import { handlers } from "../src/lib/lifecycle.ts";
import * as polls from "../src/lib/polls.ts";
import * as tell from "../src/lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { chestGroups, everyone, groups, hugo, ines, lea, sofia } from "./support/members.ts";

// Polls open to everyone, the usual case: no group gives Polls. With the
// capability "members.groups" (Proposal (studio), the name announced for
// 0.5) the Chest names every group a member is in — in their assertion
// (member(request).groups) and in members.list — and members.list({group})
// says who is in any group. A poll put to Sales asks Sales.
let database: TestDatabase;
before(async () => {
  database = await testDatabase();
});
after(async () => {
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate polls, tellings, series, comments restart identity cascade`;
  forgetGroups();
});

const zone = "Europe/Paris";
const now = new Date("2026-10-05T08:00:00Z");
const ctx = { zone, now, today: "2026-10-05", known: null };
// No group gives Polls.
const noneGrant = chestGroups.map(g => ({ ...g, grants: false }));
const as = asMember;

test("a poll put to a group that does not give Polls asks exactly its members: the member, the audience, the badges", async () => {
  const chest = await fakeChest({ network: {}, members: everyone, groups: noneGrant, capabilities: ["members", "notifications", "members.groups"], chest: { timeZone: zone } });
  try {
    const { sql } = database;
    assert.deepEqual((await listGroups())?.map(g => g.name), ["Office", "Sales", "Tech"], "every group of the Chest, by name");
    const made = await polls.createPoll(sql, as(sofia), { kind: "choice", title: "Team lunch on Friday?", options: ["Yes", "No"], audience: { everyone: false, groups: [groups.sales] }, open: true }, ctx);
    const poll = await polls.load(sql, made.id);
    // Who the poll asks, read page after page from the Chest.
    assert.deepEqual((await all(poll)).people.map(p => p.id).sort(), [hugo.id, ines.id].sort());
    // Counting several polls' audiences at once (the home page).
    const team = (await everyoneWithPolls()).people;
    assert.deepEqual(team.filter(p => inAudience(p, poll)).map(p => p.id).sort(), [hugo.id, ines.id].sort());
    // The badge: one poll waits for Hugo, none for Léa.
    const counts = await polls.pendingCounts(sql, [as(hugo), as(lea)], now);
    assert.deepEqual([counts.get(hugo.id), counts.get(lea.id)], [1, 0]);
    // Answering: Hugo is asked; Léa is not.
    const q = poll.questions[0]!;
    await answer(sql, as(hugo), made.id, { [q.id]: { options: [q.options[0]!.id] } }, now);
    await assert.rejects(answer(sql, as(lea), made.id, { [q.id]: { options: [q.options[0]!.id] } }, now), (e: unknown) => e instanceof AppError && ["not_asked", "not_found"].includes(e.code));
    // Told: the page at a time keeps Sales only.
    await tell.refreshAsked(sql, poll);
    assert.equal(chest.badges.get(ines.id), 1);
    assert.equal(chest.badges.get(lea.id) ?? 0, 0);
    // Who is in a group, for results per team (members.list({group})).
    assert.deepEqual([...(await groupMembers([groups.sales]))!.get(groups.sales)!].sort(), [hugo.id, ines.id].sort());
  } finally {
    await chest.close();
  }
});

test("without members.groups, a group that does not give Polls is unknown: nothing invented", async () => {
  const chest = await fakeChest({ network: {}, members: everyone, groups: noneGrant, capabilities: ["members", "notifications"], chest: { timeZone: zone } });
  try {
    assert.deepEqual(await listGroups(), [], "only the groups that give Polls");
    const made = await polls.createPoll(database.sql, as(sofia), { kind: "choice", title: "Lunch?", options: ["Yes", "No"], audience: { everyone: false, groups: [groups.sales] }, open: true }, ctx);
    assert.deepEqual((await all(await polls.load(database.sql, made.id))).people, [], "the Chest names no member of Sales");
    assert.deepEqual([...(await groupMembers([groups.sales]))!.get(groups.sales)!], []);
  } finally {
    await chest.close();
  }
});

test("someone who leaves a group loses what the group's poll asked of them: the bell item and the tile", async () => {
  const chest = await fakeChest({ network: {}, members: everyone, groups: noneGrant, capabilities: ["members", "notifications", "members.groups"], chest: { timeZone: zone } });
  try {
    const { sql } = database;
    const made = await polls.createPoll(sql, as(sofia), { kind: "choice", title: "Team lunch?", options: ["Yes", "No"], audience: { everyone: false, groups: [groups.sales] }, open: true }, ctx);
    await tell.runTellings(sql, now);
    const asks = () => chest.notifications.filter(n => n.key === tell.askKey(made.id)).map(n => n.member).sort();
    assert.deepEqual(asks(), [hugo.id, ines.id].sort());
    assert.equal(chest.badges.get(hugo.id), 1);
    // Hugo moves from Sales to Tech; the Chest tells Polls.
    chest.members = chest.members.map(m => (m.id === hugo.id ? { ...m, groups: [groups.tech] } : m));
    chest.groups = noneGrant.map(g => ({ ...g, members: g.id === groups.sales ? g.members.filter(m => m !== hugo.id) : g.id === groups.tech ? [...g.members, hugo.id] : g.members }));
    await handlers(sql)["member.updated"]!({ id: "evt_1", type: "member.updated", data: { id: hugo.id, changed: ["groups"] } } as never);
    assert.deepEqual(asks(), [ines.id]);
    assert.equal(chest.badges.get(hugo.id) ?? 0, 0);
  } finally {
    await chest.close();
  }
});
