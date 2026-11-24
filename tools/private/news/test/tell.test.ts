import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { connect } from "@argentic/chest-sdk/realtime/client";
import { fakeChest, type FakeChest, type FakeMember } from "@argentic/chest-sdk/testing";
import { chestSchedules as job } from "../src/calls.ts";
import * as live from "../src/lib/live.ts";
import * as posts from "../src/lib/posts.ts";
import * as tell from "../src/lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, sofia, stranger } from "./support/members.ts";

// SDK 0.7.0's fake keeps each item in its member's language (its
// translation, the English words otherwise).
const shown = (n: { title: string; body?: string }) => ({ title: n.title, ...(n.body !== undefined ? { body: n.body } : {}) });

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
  chest = await fakeChest({ chest: { timeZone: "Europe/Paris" }, members, capabilities: ["members", "files", "notifications"], network: {} });
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
    assert.equal(shown(items.find(n => n.member === ines.id)!).title, "Important\u202f: Office move");
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
    assert.equal((await job(new Request("http://tool.test/chest-schedules", { method: "POST", body: "{}" }))).status, 401);
  } finally {
    await chest.close();
  }
});

test("a welcome tells the new colleague; a comment tells the author; a reminder those who have not confirmed", async () => {
  await open();
  try {
    const w = await posts.createPost(database.sql, pub, { kind: "welcome", title: "Welcome Nora!", welcome: nora.id }, { zone });
    await tell.announce(database.sql);
    assert.deepEqual(chest.notifications.map(n => [n.member, shown(n).title]), [[nora.id, "Bienvenue\u202f! L’équipe vous salue dans les Actualités"]]);
    const done = await posts.addComment(database.sql, asMember(hugo), w.id, "Welcome!");
    await tell.commented(asMember(hugo), done);
    const toCamille = chest.notifications.at(-1)!;
    assert.deepEqual([toCamille.member, toCamille.path, toCamille.key], [camille.id, `/chest/posts/${w.id}#comments`, `post:${w.id}:comments`]);
    assert.deepEqual(shown(toCamille), { title: "Hugo Bernard a commenté «\u202fWelcome Nora!\u202f»", body: "Welcome!" });
    // Her own comment tells nobody.
    const before = chest.notifications.length;
    await tell.commented(pub, { ...done, comment: { ...done.comment, body: "Thanks" } });
    assert.equal(chest.notifications.length, before);
    await tell.remind({ id: w.id, title: "Office move", body: "", locale: "en", versions: [] }, [{ id: hugo.id, name: hugo.name, photo: null, locale: "en", role: "reader", groups: [] }]);
    assert.equal(chest.notifications.at(-1)!.title, "Reminder: Office move");
    assert.equal(chest.notifications.at(-1)!.body, "Please confirm you have read it.");
  } finally {
    await chest.close();
  }
});

test("an Important post is told a page of 500 at a time, never refused for its pace; a Chest out of reach makes it wait, and it goes on", async () => {
  const letters = "abcdefghijklmnopqrstuvwxyz234567";
  const crowd: FakeMember[] = Array.from({ length: 1300 }, (_, i) => {
    const code = [...Array(4)].map((_, k) => letters[Math.floor(i / 32 ** k) % 32]).join("");
    return { id: "mbr_" + code + "q".repeat(22), firstName: "P" + i, lastName: "Crowd", name: `P${i} Crowd`, photo: null, role: "reader", isAdmin: false, isBuilder: false, groups: [], locale: "en" };
  });
  await open([camille, ...crowd]);
  try {
    const p = await posts.createPost(database.sql, pub, { kind: "announcement", title: "Fire drill", important: true }, { zone });
    // The Chest out of reach: nobody told, the post waits for the next pass.
    const api = process.env["CHEST_API"];
    process.env["CHEST_API"] = "http://127.0.0.1:9";
    try {
      assert.deepEqual(await tell.announce(database.sql), { told: [], waiting: [p.id] });
    } finally {
      process.env["CHEST_API"] = api;
    }
    assert.equal(chest.notifications.length, 0);
    const [row] = await database.sql<{ announced_at: Date | null }[]>`select announced_at from posts where id = ${p.id}`;
    assert.equal(row!.announced_at, null);
    // Back: SDK 0.7.0's Chest refuses no notice for its pace — the three
    // pages go at once, the author aside.
    assert.deepEqual(await tell.announce(database.sql), { told: [p.id], waiting: [] });
    assert.equal(chest.notifications.length, 1300);
    assert.deepEqual(await tell.announce(database.sql), { told: [], waiting: [] }, "nobody told twice");
    assert.equal(chest.notifications.length, 1300);
  } finally {
    await chest.close();
  }
});

test("the weekly digest item an earlier version left in a bell is withdrawn at the next pass, once", async () => {
  await open();
  try {
    const notifications = await import("@argentic/chest-sdk/notifications");
    await notifications.notify([hugo.id, ines.id], { title: "3 posts this week", path: "/chest", key: tell.oldDigestKey });
    await database.sql`insert into digests (member, sent_at) values (${hugo.id}, now()), (${ines.id}, now())`;
    await tell.pass(database.sql);
    assert.equal(chest.notifications.filter(n => n.key === tell.oldDigestKey).length, 0);
    assert.equal((await database.sql`select 1 from digests`).length, 0);
    // Nothing left: nothing asked of the Chest again.
    await tell.clearDigests(database.sql);
  } finally {
    await chest.close();
  }
});

test("a comment: the post's author is told, unless its page is on their screen (realtime's watching); answers and confirmations are published", async () => {
  const { realtime } = JSON.parse(readFileSync("chest.json", "utf8"));
  chest = await fakeChest({ chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["members", "files", "notifications", "realtime"], realtime, network: {} });
  const page = connect({ url: chest.realtime.url(camille.id) });
  try {
    const w = await posts.createPost(database.sql, pub, { kind: "announcement", title: "Lunch on Friday" }, { zone });
    const told = () => chest.notifications.filter(n => n.member === camille.id && n.key === `post:${w.id}:comments`).length;
    await tell.commented(asMember(hugo), await posts.addComment(database.sql, asMember(hugo), w.id, "Count me in"));
    assert.equal(told(), 1, "away: told");
    // Camille opens the post (LivePost: the channel joined, focused).
    let joined = false;
    page.channel(`post:${w.id}`).onJoined(() => { joined = true; });
    page.focus(`post:${w.id}`);
    for (let i = 0; i < 300 && !(joined && (await live.watching([camille.id], w.id)).has(camille.id)); i++) await new Promise(r => setTimeout(r, 10));
    assert.deepEqual([...await live.watching([camille.id, hugo.id, "erased"], w.id)], [camille.id]);
    chest.notifications.length = 0;
    await tell.commented(asMember(sofia), await posts.addComment(database.sql, asMember(sofia), w.id, "Me too"));
    assert.equal(told(), 0, "watching: she sees it arrive");
    // What is not a row is published, without payload.
    await live.answered(w.id);
    await live.confirmed({ author: camille.id });
    await live.confirmed({ author: "erased" });
    assert.deepEqual(chest.realtime.published.map(p => [p.channel, p.event, p.payload]), [[`post:${w.id}`, "post.answered", null], [`mine:${camille.id}`, "post.confirmed", null]]);
  } finally {
    page.close();
    await chest.close();
  }
  // Without realtime (or no Chest): nothing thrown, nobody watching.
  await open();
  try {
    await live.answered("1");
    assert.equal((await live.watching([camille.id], "1")).size, 0);
  } finally {
    await chest.close();
  }
});
