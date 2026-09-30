import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest } from "@argentic/chest-sdk/testing";
import { answer } from "../lib/answers.ts";
import { AppError } from "../lib/app-error.ts";
import { all, everyone as everyoneWithPolls, inAudience } from "../lib/audience.ts";
import { withAllGroups } from "../lib/groups.ts";
import * as polls from "../lib/polls.ts";
import * as tell from "../lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { chestGroups, everyone, groups, hugo, ines, lea, sofia } from "./support/members.ts";

// Polls open to everyone, the usual case: no group gives Polls, so the
// Chest's assertion and members.* name no group (SDK 0.3.0: only the groups
// that give the tool). A poll put to Sales must still ask Sales: Polls asks
// the Chest who is in which group ("groups": "read", members.groups.of and
// members.groups.members).
let database: TestDatabase;
before(async () => {
  database = await testDatabase();
});
after(async () => {
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate polls, tellings, series, comments restart identity cascade`;
});

const zone = "Europe/Paris";
const now = new Date("2026-10-05T08:00:00Z");
const ctx = { zone, now, today: "2026-10-05", known: null };
// As the Chest asserts them when no group gives Polls: no group.
const bare = everyone.map(m => ({ ...m, groups: [] }));
const noneGrant = chestGroups.map(g => ({ ...g, grants: false }));
const as = (m: (typeof everyone)[number]) => asMember({ ...m, groups: [] });

test("a poll put to a group that does not give Polls asks exactly its members: the member, the audience, the badges", async () => {
  const chest = await fakeChest({ members: bare, groups: noneGrant, capabilities: ["members", "notifications", "groups"], chest: { timeZone: zone } });
  try {
    const { sql } = database;
    // The assertion names no group; the Chest says Hugo is in Sales.
    assert.deepEqual((await withAllGroups(as(hugo))).groups, [groups.sales]);
    assert.deepEqual((await withAllGroups(as(lea))).groups, [groups.tech]);
    const made = await polls.createPoll(sql, as(sofia), { kind: "choice", title: "Team lunch on Friday?", options: ["Yes", "No"], audience: { everyone: false, groups: [groups.sales] }, open: true }, ctx);
    const poll = await polls.load(sql, made.id);
    // Who the poll asks, read page after page from the Chest.
    assert.deepEqual((await all(poll)).people.map(p => p.id).sort(), [hugo.id, ines.id].sort());
    // Counting several polls' audiences at once (the home page).
    const team = (await everyoneWithPolls(poll.groups)).people;
    assert.deepEqual(team.filter(p => inAudience(p, poll)).map(p => p.id).sort(), [hugo.id, ines.id].sort());
    // The badge: one poll waits for Hugo, none for Léa, even named without groups.
    const counts = await polls.pendingCounts(sql, [as(hugo), as(lea)], now);
    assert.deepEqual([counts.get(hugo.id), counts.get(lea.id)], [1, 0]);
    assert.equal((await polls.pendingCounts(sql, [as(hugo)], now)).get(hugo.id), 1, "one person: all their groups at once");
    // Answering: Hugo as the request carries him (lib/session.ts adds his
    // groups); Léa is not asked.
    const q = poll.questions[0]!;
    await answer(sql, await withAllGroups(as(hugo)), made.id, { [q.id]: { options: [q.options[0]!.id] } }, now);
    await assert.rejects(answer(sql, await withAllGroups(as(lea)), made.id, { [q.id]: { options: [q.options[0]!.id] } }, now), (e: unknown) => e instanceof AppError && ["not_asked", "not_found"].includes(e.code));
    // Told: the fallback of a page at a time keeps Sales only.
    await tell.refreshAsked(sql, poll);
    assert.equal(chest.badges.get(ines.id), 1);
    assert.equal(chest.badges.get(lea.id) ?? 0, 0);
  } finally {
    await chest.close();
  }
});

test("without the groups permission, a member's groups are those the Chest gave with them", async () => {
  const chest = await fakeChest({ members: everyone, groups: chestGroups, capabilities: ["members", "notifications"], chest: { timeZone: zone } });
  try {
    assert.deepEqual((await withAllGroups(asMember(hugo))).groups, [groups.sales]);
    assert.deepEqual((await withAllGroups(as(hugo))).groups, [], "nothing invented");
  } finally {
    await chest.close();
  }
});
