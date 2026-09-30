import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest, type FakeMember } from "@argentic/chest-sdk/testing";
import { POST as job } from "../app/chest-jobs/[name]/route.ts";
import { continueDigest, digestKey, mondayOf, seenDigest, startDigest } from "../lib/digest.ts";
import { leave } from "../lib/lifecycle.ts";
import * as posts from "../lib/posts.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, groups, hugo, ines, lea, nora, sofia, stranger } from "./support/members.ts";

// The weekly digest: Monday morning, one item per person with posts they
// have not seen this week, in their language; replaced, never doubled;
// gone when they come.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
});
after(async () => {
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate posts, files, reactions, comments, confirmations, rsvps, visits, digests, digest_runs restart identity cascade`;
});
const open = async (members: FakeMember[] = everyone) => {
  chest = await fakeChest({ chest: { timeZone: "Europe/Paris" }, members, groups: fakeGroups, capabilities: ["members", "files", "notifications"], schedules: [{ name: "publish", cron: "*/15 * * * *" }, { name: "digest", cron: "30 8 * * 1" }] });
  return chest;
};
const zone = "Europe/Paris";
// Monday 28 September 2026, 08:30 in Paris.
const monday = new Date("2026-09-28T06:30:00Z");
const daysAgo = (n: number) => new Date(monday.getTime() - n * 864e5);
const write = (input: posts.PostInput, at: Date, who = camille) => posts.createPost(database.sql, asMember(who), input, { zone, now: at });
const digestOf = (member: string) => chest.notifications.filter(n => n.key === digestKey && n.member === member);

test("the Monday of a week, on the Chest's clock", () => {
  assert.equal(mondayOf(monday, zone), "2026-09-28");
  assert.equal(mondayOf(new Date("2026-10-04T21:59:00Z"), zone), "2026-09-28"); // Sunday 23:59 in Paris
  assert.equal(mondayOf(new Date("2026-10-04T22:30:00Z"), zone), "2026-10-05"); // Monday 00:30 in Paris
  assert.equal(mondayOf(new Date("2026-10-04T22:30:00Z"), "America/New_York"), "2026-09-28");
});

test("each person gets one item: the posts of the week they have not seen, in their language", async () => {
  await open();
  try {
    const old = await write({ kind: "info", title: "Old news" }, daysAgo(9));
    const a = await write({ kind: "announcement", title: "Office move" }, daysAgo(5));
    const b = await write({ kind: "info", title: "New printer" }, daysAgo(3));
    const c = await write({ kind: "info", title: "Sales targets", groups: [groups.sales] }, daysAgo(2), sofia);
    const imp = await write({ kind: "announcement", title: "Fire drill", important: true }, daysAgo(1));
    // Hugo came after the move, and confirmed the drill; Léa came after everything.
    await posts.visit(database.sql, asMember(hugo), daysAgo(4));
    await posts.confirm(database.sql, asMember(hugo), imp.id);
    await posts.visit(database.sql, asMember(lea), daysAgo(0.5));
    await startDigest(database.sql, { scheduledAt: monday.toISOString(), timeZone: zone });

    // Hugo (English, Sales): the printer and the Sales post, not the move (seen), not the drill (confirmed).
    const [h] = digestOf(hugo.id);
    assert.equal(h!.title, "This week: 2 posts you haven’t seen yet");
    assert.equal(h!.body, "Sales targets · New printer");
    assert.equal(h!.path, "/chest");
    // Inès (French, Sales, never came): everything of the week.
    const [i] = digestOf(ines.id);
    assert.equal(i!.title, "Cette semaine\u202f: 4 publications que vous n’avez pas encore vues");
    // Nora (no group): not the Sales post.
    assert.equal(digestOf(nora.id)[0]!.title, "Cette semaine\u202f: 3 publications que vous n’avez pas encore vues");
    // Camille wrote all she could see: only Sofia's Sales post, not for her.
    assert.deepEqual(digestOf(camille.id), []);
    // Sofia: Camille's three.
    assert.equal(digestOf(sofia.id)[0]!.title, "This week: 3 posts you haven’t seen yet");
    // Léa came after everything; Tom has no role.
    assert.deepEqual(digestOf(lea.id), []);
    assert.deepEqual(digestOf(stranger.id), []);
    assert.ok(!chest.notifications.some(n => n.body?.includes("Old news")));
    assert.ok(old.id && a.id && b.id && c.id);

    // Delivered again (at least once): the same items, never two.
    const count = chest.notifications.filter(n => n.key === digestKey).length;
    await startDigest(database.sql, { scheduledAt: monday.toISOString(), timeZone: zone });
    assert.equal(chest.notifications.filter(n => n.key === digestKey).length, count);
    assert.equal(await continueDigest(database.sql, new Date(monday.getTime() + 60_000)), "none");

    // Hugo opens the front page: his digest goes.
    await seenDigest(database.sql, hugo.id);
    assert.deepEqual(digestOf(hugo.id), []);
    assert.deepEqual((await database.sql`select member from digests where member = ${hugo.id}`).length, 0);
  } finally {
    await chest.close();
  }
});

test("next week replaces this week's item; with nothing new, last week's goes", async () => {
  await open();
  try {
    await write({ kind: "info", title: "Week one" }, daysAgo(2));
    await startDigest(database.sql, { scheduledAt: monday.toISOString(), timeZone: zone });
    assert.equal(digestOf(nora.id).length, 1);
    const next = new Date(monday.getTime() + 7 * 864e5);
    await write({ kind: "info", title: "Week two" }, new Date(next.getTime() - 864e5));
    // Nora came in between, after "Week one" and before "Week two"; Léa after both.
    await posts.visit(database.sql, asMember(nora), new Date(monday.getTime() + 864e5));
    await posts.visit(database.sql, asMember(lea), new Date(next.getTime() - 3600e3));
    await startDigest(database.sql, { scheduledAt: next.toISOString(), timeZone: zone }, next);
    const [n] = digestOf(nora.id);
    assert.equal(n!.body, "Week two");
    assert.equal(digestOf(nora.id).length, 1);
    // Léa had last week's; nothing new for her now: it is withdrawn.
    assert.deepEqual(digestOf(lea.id), []);
    assert.equal((await database.sql`select 1 from digests where member = ${lea.id}`).length, 0);
  } finally {
    await chest.close();
  }
});

test("a deleted or scheduled post is never in the digest; with nothing at all, nobody is told", async () => {
  await open();
  try {
    const gone = await write({ kind: "info", title: "Oops" }, daysAgo(2));
    await posts.deletePost(database.sql, asMember(camille), gone.id);
    await write({ kind: "info", title: "Tomorrow", publishAt: { day: "2026-09-29", time: "09:00" } }, daysAgo(1));
    await startDigest(database.sql, { scheduledAt: monday.toISOString(), timeZone: zone });
    assert.deepEqual(chest.notifications.filter(n => n.key === digestKey), []);
  } finally {
    await chest.close();
  }
});

test("the schedule calls the digest; beyond the hourly quota it goes on with the publish pass", async () => {
  const letters = "abcdefghijklmnopqrstuvwxyz234567";
  const crowd: FakeMember[] = Array.from({ length: 1200 }, (_, i) => {
    const code = [...Array(4)].map((_, k) => letters[Math.floor(i / 32 ** k) % 32]).join("");
    return { id: "mbr_" + code + "q".repeat(22), firstName: "P" + i, lastName: "Crowd", name: `P${i} Crowd`, photo: null, role: "reader", isAdmin: false, isBuilder: false, groups: [], locale: i % 2 ? "fr" : "en" };
  });
  await open([camille, ...crowd]);
  try {
    await write({ kind: "info", title: "Canteen menu" }, new Date(Date.now() - 864e5));
    assert.equal(await chest.run("digest", job, { scheduledAt: new Date().toISOString() }), 204);
    // Two pages (499: Camille wrote it; 500), then the Chest's quota.
    assert.equal(chest.notifications.filter(n => n.key === digestKey).length, 999);
    const [run] = await database.sql<{ after: string | null; done_at: Date | null }[]>`select after, done_at from digest_runs`;
    assert.equal(run!.done_at, null);
    assert.ok(run!.after);
    // The publish pass tries again: still over the quota, nobody told twice.
    assert.equal(await chest.run("publish", job), 204);
    assert.equal(chest.notifications.filter(n => n.key === digestKey).length, 999);
    assert.equal(new Set(chest.notifications.map(n => n.member)).size, 999);
    // A run stopped last week is dropped, not finished.
    await database.sql`update digest_runs set to_at = to_at - interval '8 days'`;
    assert.equal(await continueDigest(database.sql), "none");
  } finally {
    await chest.close();
  }
});

test("someone who leaves is forgotten by the digest", async () => {
  await open();
  try {
    await write({ kind: "info", title: "Week one" }, daysAgo(2));
    await startDigest(database.sql, { scheduledAt: monday.toISOString(), timeZone: zone });
    assert.equal((await database.sql`select 1 from digests where member = ${nora.id}`).length, 1);
    await leave(database.sql, nora.id);
    assert.equal((await database.sql`select 1 from digests where member = ${nora.id}`).length, 0);
  } finally {
    await chest.close();
  }
});
