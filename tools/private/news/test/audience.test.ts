import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { tally, type Reader } from "../lib/audience.ts";
import { AppError } from "../lib/errors.ts";
import * as posts from "../lib/posts.ts";
import { search } from "../lib/search.ts";
import * as tell from "../lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, groups, hugo, ines, lea, nora, sofia } from "./support/members.ts";

// A post kept to groups: its audience, its author and the Chest's admins
// see it; nobody else, whatever their role — not the post, its comments,
// reactions, files, calendar, search results, nor its bell item. Only its
// audience is told, asked to confirm and counted.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ chest: { timeZone: "Europe/Paris" }, members: everyone, groups: fakeGroups, capabilities: ["members", "files", "notifications"] });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate posts, files, reactions, comments, confirmations, rsvps, visits, digests, digest_runs restart identity cascade`;
  chest.notifications.length = 0;
  chest.badges.clear();
});

const zone = "Europe/Paris";
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
const readerOf = (m: typeof hugo): Reader => ({ id: m.id, name: m.name, photo: null, locale: "en", role: m.role, groups: m.groups });

// Sofia (publisher, Office) writes for Sales: Hugo and Inès are Sales;
// Léa and Nora are in no group; Camille is an admin (Office).
async function forSales(input: Partial<posts.PostInput> = {}) {
  return posts.createPost(database.sql, asMember(sofia), { kind: "announcement", title: "Sales targets", body: "Quarterly **objectifs** for the team.", groups: [groups.sales], ...input }, { zone });
}

test("a post for Sales: its members, its author and the admins see it; nobody else does, anywhere", async () => {
  const p = await forSales();
  const everyonePost = await posts.createPost(database.sql, asMember(camille), { kind: "info", title: "Coffee machine" }, { zone });
  const doc = await posts.recordUpload(database.sql, asMember(sofia), { object: "uploads/ffffffffffffffffffff.pdf", fileName: "targets.pdf", type: "application/pdf", size: 5, role: "attachment" });
  await posts.updatePost(database.sql, asMember(sofia), p.id, { kind: "announcement", title: "Sales targets", body: "Quarterly **objectifs** for the team.", groups: [groups.sales], attachments: [doc.id] }, { zone });
  const c = await posts.addComment(database.sql, asMember(hugo), p.id, "Merci pour les objectifs");

  for (const who of [hugo, ines, sofia, camille]) {
    const front = await posts.front(database.sql, asMember(who), { zone });
    assert.deepEqual(front.posts.map(x => x.id).sort(), [p.id, everyonePost.id].sort(), who.name);
    const seen = await posts.post(database.sql, asMember(who), p.id, { zone });
    assert.deepEqual(seen.groups, [groups.sales]);
    assert.equal(seen.thread.length, 1);
    assert.equal((await posts.fileFor(database.sql, asMember(who), doc.id)).fileName, "targets.pdf");
    assert.equal((await search(database.sql, asMember(who), "objectifs")).length, 1, who.name);
  }
  // Sofia wrote it for Sales, Camille is an admin: neither is its audience.
  assert.equal((await posts.post(database.sql, asMember(hugo), p.id, { zone })).forMe, true);
  assert.equal((await posts.post(database.sql, asMember(sofia), p.id, { zone })).forMe, false);
  assert.equal((await posts.post(database.sql, asMember(camille), p.id, { zone })).forMe, false);

  // Léa and Nora (no group), and Sofia's fellow publisher outside Sales.
  const other = asMember({ ...sofia, id: "mbr_otherpublisheraaaaaaaaaaa", isAdmin: false });
  for (const outsider of [asMember(lea), asMember(nora), other]) {
    const front = await posts.front(database.sql, outsider, { zone });
    assert.deepEqual(front.posts.map(x => x.id), [everyonePost.id]);
    await assert.rejects(posts.post(database.sql, outsider, p.id, { zone }), refused("not_found"));
    await assert.rejects(posts.react(database.sql, outsider, p.id, "heart", true), refused("not_found"));
    await assert.rejects(posts.addComment(database.sql, outsider, p.id, "Hello"), refused("not_found"));
    await assert.rejects(posts.fileFor(database.sql, outsider, doc.id), refused("not_found"));
    await assert.rejects(posts.removeComment(database.sql, outsider, c.comment.id), refused("not_found"));
    assert.deepEqual(await search(database.sql, outsider, "objectifs"), []);
    assert.deepEqual(await search(database.sql, outsider, "Sales targets"), []);
  }
  // A publisher outside it cannot change, pin, delete or bring it back.
  await assert.rejects(posts.updatePost(database.sql, other, p.id, { kind: "info", title: "Mine now" }, { zone }), refused("not_found"));
  await assert.rejects(posts.setPinned(database.sql, other, p.id, true), refused("not_found"));
  await assert.rejects(posts.deletePost(database.sql, other, p.id), refused("not_found"));
  await assert.rejects(posts.draftOf(database.sql, other, p.id, { zone }), refused("not_found"));
  await posts.deletePost(database.sql, asMember(sofia), p.id);
  await assert.rejects(posts.restorePost(database.sql, other, p.id), refused("not_found"));
  await posts.restorePost(database.sql, asMember(camille), p.id);
});

test("an event and a scheduled post for Sales stay out of everyone else's side and calendar", async () => {
  const e = await forSales({ kind: "event", title: "Sales dinner", event: { day: tomorrow, start: "19:30", end: "", place: "Le Zinc" } });
  const later = await forSales({ title: "New commissions", publishAt: { day: tomorrow, time: "09:00" } });
  assert.deepEqual((await posts.front(database.sql, asMember(hugo), { zone })).upcoming.map(x => x.id), [e.id]);
  assert.deepEqual((await posts.front(database.sql, asMember(lea), { zone })).upcoming, []);
  await assert.rejects(posts.eventFor(database.sql, asMember(lea), e.id), refused("not_found"));
  await assert.rejects(posts.answer(database.sql, asMember(lea), e.id, "yes", { zone }), refused("not_found"));
  await posts.answer(database.sql, asMember(hugo), e.id, "yes", { zone });
  // Scheduled: its author and the admins, not a publisher outside Sales.
  assert.deepEqual((await posts.front(database.sql, asMember(sofia), { zone })).scheduled.map(x => x.id), [later.id]);
  assert.deepEqual((await posts.front(database.sql, asMember(camille), { zone })).scheduled.map(x => x.id), [later.id]);
  const other = asMember({ ...sofia, id: "mbr_otherpublisheraaaaaaaaaaa" });
  assert.deepEqual((await posts.front(database.sql, other, { zone })).scheduled, []);
});

test("Important for Sales: only Sales is told, asked, counted; the author and admins are not asked", async () => {
  const p = await forSales({ important: true });
  await tell.announce(database.sql);
  const told = chest.notifications.filter(n => n.key === `post:${p.id}:important`).map(n => n.member).sort();
  assert.deepEqual(told, [hugo.id, ines.id].sort());
  // The tile and the strip: Sales only.
  const counts = await posts.unconfirmedCounts(database.sql, [hugo, ines, lea, camille, sofia]);
  assert.deepEqual([...counts], [[hugo.id, 1], [ines.id, 1], [lea.id, 0], [camille.id, 0], [sofia.id, 0]]);
  assert.equal(chest.badges.get(hugo.id), 1);
  assert.equal(chest.badges.get(lea.id), undefined);
  assert.deepEqual((await posts.front(database.sql, asMember(hugo), { zone })).toConfirm.map(x => x.id), [p.id]);
  assert.deepEqual((await posts.front(database.sql, asMember(camille), { zone })).toConfirm, []);
  // Only its audience confirms.
  await assert.rejects(posts.confirm(database.sql, asMember(camille), p.id), refused("invalid"));
  await posts.confirm(database.sql, asMember(hugo), p.id);
  // Read by 1 of 2: counted on Sales.
  const list = await posts.confirmations(database.sql, asMember(sofia), p.id);
  const people = everyone.filter(m => m.role !== null).map(readerOf);
  const counted = tally(list.post, list.confirmed, people);
  assert.deepEqual(counted.confirmed.map(c => c.member), [hugo.id]);
  assert.deepEqual(counted.pending.map(x => x.id), [ines.id]);
});

test("changing the audience of an Important post tells the new audience; old confirmations are no longer counted", async () => {
  const p = await forSales({ important: true });
  await tell.announce(database.sql);
  await posts.confirm(database.sql, asMember(hugo), p.id);
  const changed = await posts.updatePost(database.sql, asMember(sofia), p.id, { kind: "announcement", title: "Sales targets", important: true, groups: [groups.office] }, { zone });
  assert.equal(changed.audienceChanged, true);
  await tell.settled(p.id);
  assert.deepEqual(chest.notifications.filter(n => n.key === `post:${p.id}:important`), []);
  await tell.announce(database.sql);
  // Office: Camille (Sofia wrote it).
  assert.deepEqual(chest.notifications.filter(n => n.key === `post:${p.id}:important`).map(n => n.member), [camille.id]);
  await assert.rejects(posts.post(database.sql, asMember(hugo), p.id, { zone }), refused("not_found"));
  const list = await posts.confirmations(database.sql, asMember(sofia), p.id);
  const counted = tally(list.post, list.confirmed, everyone.filter(m => m.role !== null).map(readerOf));
  assert.deepEqual(counted.confirmed, []);
  assert.deepEqual(counted.pending.map(x => x.id), [camille.id]);
  // The same audience again: nothing changes, nothing is told again.
  const same = await posts.updatePost(database.sql, asMember(sofia), p.id, { kind: "announcement", title: "Sales targets!", important: true, groups: [groups.office] }, { zone });
  assert.equal(same.audienceChanged, false);
  // Back to everyone.
  const all = await posts.updatePost(database.sql, asMember(sofia), p.id, { kind: "announcement", title: "Sales targets", important: true, groups: [] }, { zone });
  assert.equal(all.audienceChanged, true);
  assert.equal((await posts.post(database.sql, asMember(lea), p.id, { zone })).forMe, true);
});

test("a welcome kept to a group the colleague is not in does not tell them", async () => {
  const p = await posts.createPost(database.sql, asMember(sofia), { kind: "welcome", title: "Welcome Léa", welcome: lea.id, groups: [groups.sales] }, { zone });
  await tell.announce(database.sql);
  assert.ok(!chest.notifications.some(n => n.member === lea.id));
  const q = await posts.createPost(database.sql, asMember(sofia), { kind: "welcome", title: "Welcome Hugo", welcome: hugo.id, groups: [groups.sales] }, { zone });
  await tell.announce(database.sql);
  assert.ok(chest.notifications.some(n => n.member === hugo.id && n.key === `post:${q.id}:welcome`));
  assert.ok(p.id);
});

test("the groups of a post are checked: groups that give News, at most 16", async () => {
  await assert.rejects(forSales({ groups: ["grp_unknownaaaaaaaaaaaaaaaaaa"] }), refused("no_group"));
  await assert.rejects(forSales({ groups: ["sales"] }), refused("no_group"));
  await assert.rejects(forSales({ groups: "grp_salesaaaaaaaaaaaaaaaaaaaaa" }), refused("invalid"));
  const many = Array.from({ length: 17 }, (_, i) => "grp_" + "abcdefghijklmnopq"[i] + "a".repeat(25));
  await assert.rejects(forSales({ groups: many }), refused("too_many"));
  // Twice the same group is once.
  const p = await forSales({ groups: [groups.sales, groups.sales] });
  assert.deepEqual((await posts.post(database.sql, asMember(hugo), p.id, { zone })).groups, [groups.sales]);
  // A group that stopped giving News stays on the post it was already on.
  const kept = await forSales({ groups: [groups.sales, groups.office] });
  const saved = chest.groups.splice(0, chest.groups.length);
  try {
    await posts.updatePost(database.sql, asMember(sofia), kept.id, { kind: "info", title: "Renamed", groups: [groups.sales, groups.office] }, { zone });
    await assert.rejects(posts.updatePost(database.sql, asMember(sofia), p.id, { kind: "info", title: "Renamed", groups: [groups.sales, groups.office] }, { zone }), refused("no_group"));
  } finally {
    chest.groups.push(...saved);
  }
  // Removing a group needs no answer from the Chest.
  await posts.updatePost(database.sql, asMember(sofia), kept.id, { kind: "info", title: "Renamed", groups: [groups.sales] }, { zone });
});

test("without the Chest's answer, a post cannot be kept to a new group", async () => {
  const blind = await fakeChest({ chest: { timeZone: "Europe/Paris" }, members: everyone, groups: fakeGroups, capabilities: ["files", "notifications"] });
  try {
    await assert.rejects(forSales(), refused("unavailable"));
    // For everyone, nothing to ask.
    await posts.createPost(database.sql, asMember(sofia), { kind: "info", title: "Open to all" }, { zone });
  } finally {
    await blind.close();
  }
});
