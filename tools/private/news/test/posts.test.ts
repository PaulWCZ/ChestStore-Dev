import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/core/tool.ts";
import * as posts from "../src/lib/posts.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, nora, sofia, stranger } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["members", "files", "notifications"] });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate posts, files, reactions, comments, confirmations, rsvps, visits restart identity cascade`;
});

const zone = "Europe/Paris";
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const pub = asMember(camille);
const reader = asMember(hugo);
const write = (input: posts.PostInput, who = pub, now?: Date) => posts.createPost(database.sql, who, input, { zone, ...(now ? { now } : {}) });
const frontOf = (who = reader, extra: { kind?: string; page?: string; now?: Date } = {}) => posts.front(database.sql, who, { zone, ...extra });

test("a publisher writes; readers see pinned first, then newest first; no role, nothing", async () => {
  const a = await write({ kind: "info", title: "  Coffee   machine fixed ", body: "Thanks **Hugo**!" }, pub, new Date(Date.now() - 3000));
  const b = await write({ kind: "announcement", title: "Office move", body: "We move on *1 December*.", pinned: true }, pub, new Date(Date.now() - 2000));
  const c = await write({ kind: "info", title: "New printer" }, pub, new Date(Date.now() - 1000));
  const page = await frontOf();
  assert.deepEqual(page.posts.map(p => p.id), [b.id, c.id, a.id]);
  assert.equal(page.posts[2]!.title, "Coffee machine fixed");
  assert.equal(page.posts[2]!.excerpt, "Thanks Hugo!");
  assert.equal(page.posts[0]!.pinned, true);
  assert.deepEqual((await frontOf(reader, { kind: "announcement" })).posts.map(p => p.id), [b.id]);
  assert.deepEqual((await frontOf(reader, { kind: "nonsense" })).posts.length, 3);
  await assert.rejects(frontOf(asMember(stranger)), refused("forbidden"));
  await assert.rejects(posts.front(database.sql, null, { zone }), refused("forbidden"));
});

test("the front page goes 20 posts at a time", async () => {
  for (let i = 0; i < 23; i++) await write({ kind: "info", title: "Post " + i }, pub, new Date(Date.now() - (30 - i) * 1000));
  const first = await frontOf();
  assert.equal(first.posts.length, 20);
  assert.equal(first.more, true);
  assert.equal(first.posts[0]!.title, "Post 22");
  const second = await frontOf(reader, { page: "2" });
  assert.deepEqual(second.posts.map(p => p.title), ["Post 2", "Post 1", "Post 0"]);
  assert.equal(second.more, false);
  assert.equal((await frontOf(reader, { page: "-1" })).posts[0]!.title, "Post 22");
});

test("what a publisher writes is bounded and checked; a reader cannot write", async () => {
  await assert.rejects(write({ kind: "info", title: "   " }), refused("empty"));
  await assert.rejects(write({ kind: "info", title: "x".repeat(141) }), refused("too_long"));
  await assert.rejects(write({ kind: "info", title: "Hi", body: "x".repeat(20001) }), refused("too_long"));
  await assert.rejects(write({ kind: "poll", title: "Hi" }), refused("invalid"));
  await assert.rejects(write({ kind: "info", title: 42 }), refused("invalid"));
  await assert.rejects(write({ kind: "info", title: "Hi" }, reader), refused("forbidden"));
  await assert.rejects(write({ kind: "info", title: "Hi" }, asMember(stranger)), refused("forbidden"));
  await assert.rejects(write({ kind: "event", title: "Dinner" }), refused("bad_date"));
  await assert.rejects(write({ kind: "event", title: "Dinner", event: { day: "2026-02-30" } }), refused("bad_date"));
  await assert.rejects(write({ kind: "event", title: "Dinner", event: { day: "2026-10-15", start: "25:00" } }), refused("bad_date"));
  await assert.rejects(write({ kind: "event", title: "Dinner", event: { day: "2026-10-15", start: "20:00", end: "19:00" } }), refused("bad_date"));
  await assert.rejects(write({ kind: "event", title: "Dinner", event: { day: "2026-10-15", end: "19:00" } }), refused("bad_date"));
  await assert.rejects(write({ kind: "welcome", title: "Welcome!" }), refused("no_person"));
  await assert.rejects(write({ kind: "welcome", title: "Welcome!", welcome: "mbr_" + "z".repeat(26) }), refused("no_person"));
  await assert.rejects(write({ kind: "info", title: "Later", publishAt: { day: "2030-01-01", time: "09:00" } }), refused("bad_date"));
  await assert.rejects(write({ kind: "info", title: "Hi", cover: "'; drop table posts; --" }), refused("not_found"));
  await assert.rejects(posts.post(database.sql, reader, "'; drop table posts; --", { zone }), refused("not_found"));
  // Fields of another kind are not kept.
  const info = await write({ kind: "info", title: "Hi", event: { day: "2026-10-15", place: "Nowhere" }, welcome: nora.id });
  const read = await posts.post(database.sql, reader, info.id, { zone });
  assert.equal(read.event, null);
  assert.equal(read.welcome, null);
});

test("an event keeps its day, times on the Chest's clock, and place; a welcome names a colleague", async () => {
  const e = await write({ kind: "event", title: "Team dinner", event: { day: "2026-10-15", start: "19:30", end: "23:00", place: "Chez Paul" } });
  const d = await posts.post(database.sql, reader, e.id, { zone });
  assert.deepEqual(d.event, { day: "2026-10-15", start: "2026-10-15T17:30:00.000Z", end: "2026-10-15T21:00:00.000Z", place: "Chez Paul", lastDay: null, seats: null });
  const allDay = await write({ kind: "event", title: "Seminar", event: { day: "2026-11-02", start: "", place: "" } });
  assert.deepEqual((await posts.post(database.sql, reader, allDay.id, { zone })).event, { day: "2026-11-02", start: null, end: null, place: null, lastDay: null, seats: null });
  const w = await write({ kind: "welcome", title: "Welcome Nora!", welcome: nora.id });
  assert.equal((await posts.post(database.sql, reader, w.id, { zone })).welcome, nora.id);
});

test("a scheduled post is seen by publishers only, until its time", async () => {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 864e5);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(tomorrow);
  const s = await write({ kind: "announcement", title: "Bonus day", publishAt: { day: parts, time: "09:00" } });
  assert.equal(s.published, false);
  assert.ok(!(await frontOf()).posts.some(p => p.id === s.id));
  await assert.rejects(posts.post(database.sql, reader, s.id, { zone }), refused("not_found"));
  const forPublisher = await frontOf(asMember(sofia));
  assert.ok(!forPublisher.posts.some(p => p.id === s.id));
  assert.deepEqual(forPublisher.scheduled.map(p => p.id), [s.id]);
  assert.equal((await posts.post(database.sql, asMember(sofia), s.id, { zone })).scheduled, true);
  await assert.rejects(posts.addComment(database.sql, asMember(sofia), s.id, "Early"), refused("closed"));
  const later = new Date(now.getTime() + 2 * 864e5);
  assert.ok((await frontOf(reader, { now: later })).posts.some(p => p.id === s.id));
  // A time already gone publishes now.
  const past = await write({ kind: "info", title: "Oops", publishAt: { day: "2026-01-01", time: "09:00" } });
  assert.equal(past.published, true);
});

test("editing: publishers only; a published post keeps its date; Important off forgets confirmations", async () => {
  const p = await write({ kind: "announcement", title: "Office move", important: true });
  await posts.confirm(database.sql, reader, p.id);
  await assert.rejects(posts.updatePost(database.sql, reader, p.id, { kind: "announcement", title: "Mine" }, { zone }), refused("forbidden"));
  const before = (await posts.post(database.sql, reader, p.id, { zone })).publishAt;
  const u = await posts.updatePost(database.sql, asMember(sofia), p.id, { kind: "announcement", title: "Office move: new date", publishAt: { day: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), time: "09:00" } }, { zone });
  assert.equal(u.importantChanged, true);
  const after = await posts.post(database.sql, reader, p.id, { zone });
  assert.equal(after.title, "Office move: new date");
  assert.equal(after.publishAt, before);
  assert.ok(after.editedAt);
  assert.equal(after.confirmed, false);
  await assert.rejects(posts.updatePost(database.sql, pub, "999", { kind: "info", title: "x" }, { zone }), refused("not_found"));
});

test("deleting is undone; a deleted post is gone for readers; pins", async () => {
  const p = await write({ kind: "info", title: "Parking" });
  await assert.rejects(posts.deletePost(database.sql, reader, p.id), refused("forbidden"));
  await posts.deletePost(database.sql, pub, p.id);
  await assert.rejects(posts.post(database.sql, reader, p.id, { zone }), refused("not_found"));
  await assert.rejects(posts.deletePost(database.sql, pub, p.id), refused("not_found"));
  await assert.rejects(posts.restorePost(database.sql, reader, p.id), refused("forbidden"));
  await posts.restorePost(database.sql, pub, p.id);
  await assert.rejects(posts.restorePost(database.sql, pub, p.id), refused("not_found"));
  await assert.rejects(posts.setPinned(database.sql, reader, p.id, true), refused("forbidden"));
  await posts.setPinned(database.sql, pub, p.id, true);
  assert.equal((await posts.post(database.sql, reader, p.id, { zone })).pinned, true);
  await posts.setPinned(database.sql, pub, p.id, false);
  assert.equal((await posts.post(database.sql, reader, p.id, { zone })).pinned, false);
});

test("reactions: a fixed set, one of each per person, again takes it back", async () => {
  const p = await write({ kind: "info", title: "Parking" });
  await posts.react(database.sql, reader, p.id, "party", true);
  await posts.react(database.sql, reader, p.id, "party", true);
  await posts.react(database.sql, asMember(ines), p.id, "party", true);
  await posts.react(database.sql, asMember(ines), p.id, "heart", true);
  let d = await posts.post(database.sql, reader, p.id, { zone });
  assert.deepEqual(d.reactionList.filter(r => r.count > 0).map(r => [r.emoji, r.count, r.mine]), [["heart", 1, false], ["party", 2, true]]);
  assert.equal(d.reactions, 3);
  await posts.react(database.sql, reader, p.id, "party", false);
  d = await posts.post(database.sql, reader, p.id, { zone });
  assert.equal(d.reactionList.find(r => r.emoji === "party")!.count, 1);
  await assert.rejects(posts.react(database.sql, reader, p.id, "poop", true), refused("invalid"));
  await assert.rejects(posts.react(database.sql, reader, p.id, "heart", "yes"), refused("invalid"));
  await assert.rejects(posts.react(database.sql, asMember(stranger), p.id, "heart", true), refused("forbidden"));
});

test("comments: anyone with a role; the author or a publisher removes one, and undoes it", async () => {
  const p = await write({ kind: "info", title: "Parking" });
  const { comment, post } = await posts.addComment(database.sql, reader, p.id, "  Great\r\nnews  ");
  assert.equal(comment.body, "Great\nnews");
  assert.equal(post.author, camille.id);
  await assert.rejects(posts.addComment(database.sql, reader, p.id, " "), refused("empty"));
  await assert.rejects(posts.addComment(database.sql, reader, p.id, "x".repeat(2001)), refused("too_long"));
  await assert.rejects(posts.removeComment(database.sql, asMember(ines), comment.id), refused("forbidden"));
  await assert.rejects(posts.editComment(database.sql, pub, comment.id, "Changed"), refused("forbidden"));
  await posts.editComment(database.sql, reader, comment.id, "Great news!");
  await posts.removeComment(database.sql, reader, comment.id);
  assert.equal((await posts.post(database.sql, reader, p.id, { zone })).thread.length, 0);
  await posts.restoreComment(database.sql, reader, comment.id);
  const thread = (await posts.post(database.sql, reader, p.id, { zone })).thread;
  assert.deepEqual(thread.map(c => [c.body, c.edited]), [["Great news!", true]]);
  await posts.removeComment(database.sql, pub, comment.id);
  await assert.rejects(posts.removeComment(database.sql, pub, comment.id), refused("not_found"));
});

test("Important: an explicit confirmation; the tile counts what is left; publishers see who", async () => {
  const p = await write({ kind: "announcement", title: "Office move", important: true });
  const q = await write({ kind: "info", title: "Safety drill", important: true });
  const plain = await write({ kind: "info", title: "Parking" });
  await assert.rejects(posts.confirm(database.sql, reader, plain.id), refused("invalid"));
  let counts = await posts.unconfirmedCounts(database.sql, [hugo, ines, camille]);
  assert.deepEqual([...counts], [[hugo.id, 2], [ines.id, 2], [camille.id, 0]]);
  assert.deepEqual((await frontOf()).toConfirm.map(t => t.id), [q.id, p.id]);
  await posts.confirm(database.sql, reader, p.id);
  await posts.confirm(database.sql, reader, p.id);
  counts = await posts.unconfirmedCounts(database.sql, [hugo, ines]);
  assert.deepEqual([...counts], [[hugo.id, 1], [ines.id, 2]]);
  assert.equal((await posts.post(database.sql, reader, p.id, { zone })).confirmed, true);
  await assert.rejects(posts.confirmations(database.sql, reader, p.id), refused("forbidden"));
  const list = await posts.confirmations(database.sql, asMember(sofia), p.id);
  assert.deepEqual(list.confirmed.map(c => c.member), [hugo.id]);
  await assert.rejects(posts.confirmations(database.sql, pub, plain.id), refused("not_found"));
  // A post older than 90 days no longer counts.
  const later = new Date(Date.now() + 91 * 864e5);
  assert.deepEqual([...(await posts.unconfirmedCounts(database.sql, [ines], later))], [[ines.id, 0]]);
  // A reminder once a day at most.
  await posts.claimReminder(database.sql, pub, p.id);
  await assert.rejects(posts.claimReminder(database.sql, pub, p.id), refused("too_soon"));
  await assert.rejects(posts.claimReminder(database.sql, reader, q.id), refused("forbidden"));
});

test("events: coming or not until the end of the day; answers counted", async () => {
  const future = await write({ kind: "event", title: "Team dinner", event: { day: "2099-10-15", start: "19:30" } });
  await posts.answer(database.sql, reader, future.id, "yes", { zone });
  await posts.answer(database.sql, asMember(ines), future.id, "no", { zone });
  await posts.answer(database.sql, asMember(nora), future.id, "yes", { zone });
  let d = await posts.post(database.sql, reader, future.id, { zone });
  assert.equal(d.rsvp, "yes");
  assert.equal(d.going, 2);
  assert.equal(d.eventOpen, true);
  assert.deepEqual(d.answers.map(a => [a.member, a.answer]), [[hugo.id, "yes"], [ines.id, "no"], [nora.id, "yes"]]);
  await posts.answer(database.sql, reader, future.id, null, { zone });
  d = await posts.post(database.sql, reader, future.id, { zone });
  assert.equal(d.rsvp, null);
  assert.equal(d.going, 1);
  await assert.rejects(posts.answer(database.sql, reader, future.id, "maybe", { zone }), refused("invalid"));
  const past = await write({ kind: "event", title: "Old party", event: { day: "2026-01-10" } });
  await assert.rejects(posts.answer(database.sql, reader, past.id, "yes", { zone }), refused("closed"));
  const info = await write({ kind: "info", title: "Parking" });
  await assert.rejects(posts.answer(database.sql, reader, info.id, "yes", { zone }), refused("invalid"));
  // The upcoming list: from today on, soonest first.
  const soon = await write({ kind: "event", title: "Soon", event: { day: "2099-01-02" } });
  assert.deepEqual((await frontOf()).upcoming.map(p => p.id), [soon.id, future.id]);
});

test("what is new: since the visit before this one; a visit ends after 30 minutes", async () => {
  const t0 = new Date("2026-09-01T08:00:00Z");
  assert.equal(await posts.visit(database.sql, reader, t0), null);
  assert.equal(await posts.visit(database.sql, reader, new Date(t0.getTime() + 10 * 60000)), null);
  const next = await posts.visit(database.sql, reader, new Date(t0.getTime() + 3 * 3600000));
  assert.equal(next, new Date(t0.getTime() + 10 * 60000).toISOString());
  assert.equal(await posts.visit(database.sql, reader, new Date(t0.getTime() + 3 * 3600000 + 60000)), next);
  await assert.rejects(posts.visit(database.sql, asMember(stranger)), refused("forbidden"));
});

test("files: a publisher's upload joins their post; covers are pictures; removed files are returned", async () => {
  const pic = await posts.recordUpload(database.sql, pub, { object: "uploads/aaaaaaaaaaaaaaaaaaaa.png", fileName: "team.png", type: "image/png", size: 10, role: "cover" });
  const doc = await posts.recordUpload(database.sql, pub, { object: "uploads/bbbbbbbbbbbbbbbbbbbb.pdf", fileName: "plan.pdf", type: "application/pdf", size: 20, role: "attachment" });
  const other = await posts.recordUpload(database.sql, asMember(sofia), { object: "uploads/cccccccccccccccccccc.pdf", fileName: "hers.pdf", type: "application/pdf", size: 5, role: "attachment" });
  await assert.rejects(posts.recordUpload(database.sql, reader, { object: "uploads/dddddddddddddddddddd.pdf", fileName: "x.pdf", type: "application/pdf", size: 5, role: "attachment" }), refused("forbidden"));
  await assert.rejects(posts.recordUpload(database.sql, pub, { object: "uploads/eeeeeeeeeeeeeeeeeeee.pdf", fileName: "x.pdf", type: "application/pdf", size: 5, role: "cover" }), refused("not_image"));
  // Before the post is saved, the upload is its uploader's alone.
  assert.equal((await posts.fileFor(database.sql, pub, pic.id)).fileName, "team.png");
  await assert.rejects(posts.fileFor(database.sql, reader, pic.id), refused("not_found"));
  await assert.rejects(write({ kind: "info", title: "Hers", attachments: [other.id] }), refused("file_missing"));
  await assert.rejects(write({ kind: "info", title: "Doc", cover: doc.id }), refused("not_image"));
  const p = await write({ kind: "info", title: "Plan", cover: pic.id, attachments: [doc.id] });
  let d = await posts.post(database.sql, reader, p.id, { zone });
  assert.equal(d.cover, pic.id);
  assert.deepEqual(d.attachments.map(a => a.fileName), ["plan.pdf"]);
  assert.equal((await posts.fileFor(database.sql, reader, doc.id)).object, "uploads/bbbbbbbbbbbbbbbbbbbb.pdf");
  // Another post cannot take them.
  await assert.rejects(write({ kind: "info", title: "Thief", attachments: [doc.id] }), refused("file_missing"));
  const u = await posts.updatePost(database.sql, pub, p.id, { kind: "info", title: "Plan", cover: null, attachments: [doc.id] }, { zone });
  assert.deepEqual(u.removed, ["uploads/aaaaaaaaaaaaaaaaaaaa.png"]);
  d = await posts.post(database.sql, reader, p.id, { zone });
  assert.equal(d.cover, null);
  await assert.rejects(write({ kind: "info", title: "Many", attachments: Array.from({ length: 11 }, (_, i) => String(i + 100)) }), refused("too_many"));
  // A deleted post's files are not opened.
  await posts.deletePost(database.sql, pub, p.id);
  await assert.rejects(posts.fileFor(database.sql, reader, doc.id), refused("not_found"));
});

test("purge: what was deleted 30 days ago, and uploads never used after a day", async () => {
  const kept = await write({ kind: "info", title: "Kept" });
  const old = await write({ kind: "info", title: "Old" });
  const loose = await posts.recordUpload(database.sql, pub, { object: "uploads/ffffffffffffffffffff.pdf", fileName: "x.pdf", type: "application/pdf", size: 5, role: "attachment" });
  const attached = await posts.recordUpload(database.sql, pub, { object: "uploads/gggggggggggggggggggg.pdf", fileName: "y.pdf", type: "application/pdf", size: 5, role: "attachment" });
  await posts.updatePost(database.sql, pub, old.id, { kind: "info", title: "Old", attachments: [attached.id] }, { zone });
  await database.sql`update posts set deleted_at = now() - interval '31 days' where id = ${old.id}`;
  await database.sql`update files set added_at = now() - interval '2 days' where id = ${loose.id}`;
  const objects = await posts.purge(database.sql);
  assert.deepEqual(objects.sort(), ["uploads/ffffffffffffffffffff.pdf", "uploads/gggggggggggggggggggg.pdf"]);
  assert.deepEqual((await database.sql`select id from posts`).map(r => String(r.id)), [kept.id]);
  assert.equal((await database.sql`select count(*)::int as n from files`)[0]!.n, 0);
});
