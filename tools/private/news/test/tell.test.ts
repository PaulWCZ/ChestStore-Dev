import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest, type FakeMember } from "@argentic/chest-sdk/testing";
import { POST as job } from "../app/chest-jobs/[name]/route.ts";
import * as posts from "../lib/posts.ts";
import * as tell from "../lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, sofia, stranger } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
});
after(async () => {
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate posts, files, reactions, comments, confirmations, rsvps, visits restart identity cascade`;
});
const open = async (members: FakeMember[] = everyone) => {
  chest = await fakeChest({ members, capabilities: ["members", "files", "notifications"], schedules: [{ name: "publish", cron: "*/15 * * * *" }] });
  return chest;
};
const zone = "Europe/Paris";
const pub = asMember(camille);

test("an Important post is told to everyone who has News, in their language, once", async () => {
  await open();
  try {
    const p = await posts.createPost(database.sql, pub, { kind: "announcement", title: "Office move", body: "We move on **2 November**.", important: true }, { zone });
    await posts.confirm(database.sql, asMember(lea), p.id);
    const first = await tell.announce(database.sql);
    assert.deepEqual(first, { told: [p.id], waiting: [] });
    const items = chest.notifications.filter(n => n.key === `post:${p.id}:important`);
    // Not the author, not Léa (she confirmed already), not Tom (no role).
    assert.deepEqual(items.map(n => n.member).sort(), [hugo.id, ines.id, nora.id, sofia.id].sort());
    assert.equal(items.find(n => n.member === ines.id)!.title, "Important : Office move");
    assert.equal(items.find(n => n.member === hugo.id)!.title, "Important: Office move");
    assert.equal(items.find(n => n.member === hugo.id)!.body, "We move on 2 November.");
    assert.equal(items[0]!.path, `/chest/posts/${p.id}`);
    assert.equal(chest.badges.get(hugo.id), 1);
    assert.equal(chest.badges.get(lea.id), undefined);
    assert.deepEqual(await tell.announce(database.sql), { told: [], waiting: [] });
    assert.equal(chest.notifications.filter(n => n.key === `post:${p.id}:important`).length, 4);
    // Confirming takes it out of that person's bell and tile.
    await posts.confirm(database.sql, asMember(hugo), p.id);
    await tell.confirmed(database.sql, hugo, p.id);
    assert.ok(!chest.notifications.some(n => n.member === hugo.id && n.key === `post:${p.id}:important`));
    assert.equal(chest.badges.get(hugo.id), undefined);
    // Deleted: out of every bell.
    await tell.settled(p.id);
    assert.equal(chest.notifications.filter(n => n.key === `post:${p.id}:important`).length, 0);
    assert.ok(!chest.notifications.some(n => n.member === stranger.id));
  } finally {
    await chest.close();
  }
});

test("a scheduled Important post is told at its time, by the publish schedule", async () => {
  await open();
  try {
    const soon = new Date(Date.now() + 864e5);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(soon);
    const p = await posts.createPost(database.sql, pub, { kind: "announcement", title: "Bonus", important: true, publishAt: { day, time: "09:00" } }, { zone });
    assert.equal(await chest.run("publish", job), 204);
    assert.equal(chest.notifications.length, 0);
    await database.sql`update posts set publish_at = now() - interval '1 minute' where id = ${p.id}`;
    assert.equal(await chest.run("publish", job), 204);
    assert.equal(chest.notifications.filter(n => n.key === `post:${p.id}:important`).length, 5);
    // Not a delivery of the Chest: refused.
    assert.equal((await job(new Request("http://tool.test/chest-jobs/publish", { method: "POST", body: "{}" }))).status, 401);
  } finally {
    await chest.close();
  }
});

test("a welcome tells the new colleague; a comment tells the author; a reminder those who have not confirmed", async () => {
  await open();
  try {
    const w = await posts.createPost(database.sql, pub, { kind: "welcome", title: "Welcome Nora!", welcome: nora.id }, { zone });
    await tell.announce(database.sql);
    assert.deepEqual(chest.notifications.map(n => [n.member, n.title]), [[nora.id, "Bienvenue ! L’équipe vous salue dans les Actualités"]]);
    const done = await posts.addComment(database.sql, asMember(hugo), w.id, "Welcome!");
    await tell.commented(asMember(hugo), done);
    assert.deepEqual(chest.notifications.at(-1), { member: camille.id, title: "Hugo Bernard a commenté « Welcome Nora! »", body: "Welcome!", path: `/chest/posts/${w.id}#comments`, key: `post:${w.id}:comments` });
    // Her own comment tells nobody.
    const before = chest.notifications.length;
    await tell.commented(pub, { ...done, comment: { ...done.comment, body: "Thanks" } });
    assert.equal(chest.notifications.length, before);
    await tell.remind(database.sql, { id: w.id, title: "Office move", body: "", locale: "en", versions: [], author: camille.id }, [{ id: hugo.id, name: hugo.name, photo: null, locale: "en", role: "reader", groups: [] }], "2026-10-01");
    assert.equal(chest.notifications.at(-1)!.title, "Reminder: Office move");
    assert.equal(chest.notifications.at(-1)!.body, "Please confirm you have read it.");
  } finally {
    await chest.close();
  }
});

test("beyond the Chest's 1,000 recipients an hour, the telling stops and goes on later from where it stopped", async () => {
  const letters = "abcdefghijklmnopqrstuvwxyz234567";
  const crowd: FakeMember[] = Array.from({ length: 1300 }, (_, i) => {
    const code = [...Array(4)].map((_, k) => letters[Math.floor(i / 32 ** k) % 32]).join("");
    return { id: "mbr_" + code + "q".repeat(22), firstName: "P" + i, lastName: "Crowd", name: `P${i} Crowd`, photo: null, role: "reader", isAdmin: false, isBuilder: false, groups: [], locale: "en" };
  });
  await open([camille, ...crowd]);
  try {
    const p = await posts.createPost(database.sql, pub, { kind: "announcement", title: "Fire drill", important: true }, { zone });
    const result = await tell.announce(database.sql);
    assert.deepEqual(result, { told: [], waiting: [p.id] });
    // Two pages: 499 people (the author is not told) and 500; the third is refused.
    assert.equal(chest.notifications.length, 999);
    const [row] = await database.sql<{ announced_at: Date | null; announce_after: string | null }[]>`select announced_at, announce_after from posts where id = ${p.id}`;
    assert.equal(row!.announced_at, null);
    assert.ok(row!.announce_after, "the cursor where it stopped");
    // Still over the quota: nobody told twice, it waits again.
    assert.deepEqual(await tell.announce(database.sql), { told: [], waiting: [p.id] });
    assert.equal(chest.notifications.length, 999);
  } finally {
    await chest.close();
  }
});
