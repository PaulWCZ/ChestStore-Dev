import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../lib/errors.ts";
import * as posts from "../lib/posts.ts";
import { exportAll, fromSlack, headline, importSlack, readSlack, undoImport } from "../lib/transfer.ts";
import { readZip, writeZip } from "../lib/zip.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, sofia } from "./support/members.ts";

// Moving posts in (a Slack channel export) and out (every post as a ZIP).
// The fixture is slack-export-viewer's test archive (MIT, THIRD_PARTY.md): a
// real export of two channels, with joins, bots and people.
let database: TestDatabase;
let chest: FakeChest;
const hermione = { ...hugo, id: "mbr_hermioneaaaaaaaaaaaaaaaaaa", firstName: "Hermione", lastName: "Granger", name: "Hermione Granger", locale: "en" as const };
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ chest: { timeZone: "Europe/Paris" }, members: [...everyone, hermione], capabilities: ["members", "files", "notifications"] });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate posts, files, comments restart identity cascade`;
});
const zone = "Europe/Paris";
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const fixture = readFileSync(join(import.meta.dirname, "fixtures", "slack-export-viewer-testarchive.zip"));

test("a real Slack export: its channels, top-level messages only, by their author when a member has that name", async () => {
  const read = readSlack(fixture);
  assert.deepEqual(read.channels.map(c => c.name).sort(), ["enrique", "traveling-sailor"]);
  const enrique = read.channels.find(c => c.name === "enrique")!;
  assert.equal(enrique.messages, 30, "joins and bots left out");
  const done = await importSlack(database.sql, asMember(camille), fixture, enrique.id);
  assert.equal(done.added, 30);
  assert.ok(done.unmatched.includes("Harry Potter") && !done.unmatched.includes("Hermione Granger"));
  const rows = await database.sql<{ author: string; body: string; publish_at: Date; announced_at: Date | null }[]>`select author, body, publish_at, announced_at from posts order by publish_at`;
  assert.ok(rows.some(r => r.author === hermione.id), "Hermione's messages are hers");
  assert.ok(rows.filter(r => r.author === camille.id).every(r => r.body.startsWith("_Publié sur Slack par ")), "the others say whose they were, in the importer's language");
  assert.ok(rows.every(r => r.publish_at.getUTCFullYear() === 2016 && r.announced_at !== null), "at their date; nobody told");
  // Again: nothing twice. Then taken back, and it can come again.
  assert.deepEqual((await importSlack(database.sql, asMember(camille), fixture, enrique.id)).added, 0);
  assert.equal(await undoImport(database.sql, asMember(camille), done.batch), 30);
  assert.equal((await posts.front(database.sql, asMember(hugo), { zone })).posts.length, 0);
  assert.equal((await importSlack(database.sql, asMember(camille), fixture, enrique.id)).added, 30);
  await assert.rejects(importSlack(database.sql, asMember(hugo), fixture, enrique.id), refused("forbidden"));
  await assert.rejects(importSlack(database.sql, asMember(camille), fixture, "C_NOPE"), refused("not_found"));
  assert.throws(() => readSlack(new TextEncoder().encode("not a zip")), refused("not_export"));
  assert.throws(() => readSlack(writeZip([{ name: "notes.json", data: "[]" }])), refused("not_export"));
});

test("Slack's marks, links and mentions become News's; threads stay out; a long first line is cut", () => {
  const users = new Map([["U1", { id: "U1", name: "Inès Moreau" }]]);
  assert.equal(fromSlack("*Office move* on _Monday_, see <https://example.com/plan|the plan> &amp; ask <@U1> in <#C9|general> <!here>", users),
    "**Office move** on _Monday_, see [the plan](https://example.com/plan) & ask @Inès Moreau in #general @here");
  assert.equal(fromSlack("2 * 3 ~old~ price", users), "2 \\* 3 old price");
  assert.deepEqual(headline("**Office move** on Monday\nBring boxes."), { title: "Office move on Monday", body: "Bring boxes." });
  const long = headline("word ".repeat(60).trim());
  assert.ok([...long.title].length <= 140 && long.title.endsWith("…") && long.body.startsWith("word word"));
  const zip = writeZip([
    { name: "channels.json", data: JSON.stringify([{ id: "C1", name: "announcements" }]) },
    { name: "users.json", data: JSON.stringify([{ id: "U1", name: "ines", profile: { real_name: "Inès Moreau" } }]) },
    { name: "announcements/2026-09-01.json", data: JSON.stringify([
      { type: "message", user: "U1", text: "Kick-off", ts: "1756717200.000100", thread_ts: "1756717200.000100", reply_count: 1 },
      { type: "message", user: "U1", text: "a reply", ts: "1756717300.000200", thread_ts: "1756717200.000100" },
      { type: "message", subtype: "channel_join", user: "U1", text: "<@U1> has joined", ts: "1756717100.000001" },
    ]) },
  ]);
  const read = readSlack(zip);
  assert.deepEqual(read.messages.get("C1")!.map(m => m.text), ["Kick-off"]);
});

test("download all posts: what the publisher sees, as JSON and Markdown, with comments and files", async () => {
  const object = "uploads/bbbbbbbbbbbbbbbbbbbb.txt";
  chest.files.set(object, { data: new TextEncoder().encode("the plan"), type: "text/plain", updated: new Date().toISOString() } as never);
  const doc = await posts.recordUpload(database.sql, asMember(camille), { object, fileName: "plan.txt", type: "text/plain", size: 8, role: "attachment" });
  const p = await posts.createPost(database.sql, asMember(camille), { kind: "announcement", title: "Office move", body: "We **move**.", locale: "en", versions: [{ locale: "fr", title: "Déménagement", body: "Nous déménageons." }], attachments: [doc.id] }, { zone });
  await posts.addComment(database.sql, asMember(hugo), p.id, `Thanks @[${sofia.id}]!`);
  const zip = await exportAll(database.sql, asMember(camille), zone);
  const entries = new Map(readZip(zip).map(e => [e.name, new TextDecoder().decode(e.data)]));
  const json = JSON.parse(entries.get("posts.json")!) as { posts: { title: string; versions: unknown[]; author: string; comments: { author: string; text: string }[]; files: { path: string | null }[] }[] };
  assert.equal(json.posts[0]!.title, "Office move");
  assert.equal(json.posts[0]!.author, "Camille Martin");
  assert.deepEqual(json.posts[0]!.comments.map(c => [c.author, c.text]), [["Hugo Bernard", "Thanks @Sofia Rossi!"]]);
  const md = [...entries].find(([name]) => name.endsWith(".md"))![1];
  assert.match(md, /^# Office move\n/u);
  assert.match(md, /# Déménagement/u);
  const file = json.posts[0]!.files[0]!.path!;
  assert.equal(entries.get(file), "the plan");
  await assert.rejects(exportAll(database.sql, asMember(hugo), zone), refused("forbidden"));
});
