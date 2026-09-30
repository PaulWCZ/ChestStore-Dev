import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest, type FakeMember } from "@argentic/chest-sdk/testing";
import { POST as chestEvents } from "../app/chest-events/route.ts";
import { eventKey, syncEvent } from "../lib/agenda.ts";
import { everyone as everyoneWithNews, tally } from "../lib/audience.ts";
import { forgetViewer, freezeViews, recordView, shown, views } from "../lib/views.ts";
import { AppError } from "../lib/errors.ts";
import { chestGroups, forgetGroups } from "../lib/groups.ts";
import { setDigestEmail } from "../lib/preferences.ts";
import * as posts from "../lib/posts.ts";
import { search } from "../lib/search.ts";
import { learned } from "../lib/state.ts";
import * as tell from "../lib/tell.ts";
import { startDigest } from "../lib/digest.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, groups, hugo, ines, lea, nora, sofia, stranger, workshop } from "./support/members.ts";

// What makes a post reach people: email beside the bell (Proposal (studio):
// mail), the 10 seconds of "Undo" before anything leaves, audiences of any
// group (Proposal (studio): groups read) and of people picked by hand, two
// languages, the Chest's calendar (Proposal (studio): calendar), and what a
// publisher sees of it — counts only.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
});
after(async () => {
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate posts, files, reactions, comments, confirmations, rsvps, visits, digests, digest_runs, post_views, preferences, chest_state restart identity cascade`;
  forgetGroups();
});

const zone = "Europe/Paris";
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const withWorkshop = (m: FakeMember, into: boolean) => ({ ...m, groups: into ? [...m.groups, groups.workshop] : m.groups.filter(g => g !== groups.workshop) });

async function open(options: { members?: FakeMember[]; mail?: boolean; calendar?: boolean; groupsRead?: boolean; perDay?: number } = {}) {
  const { mail = true, calendar = true, groupsRead = true } = options;
  const members = options.members ?? everyone;
  chest = await fakeChest({
    members,
    groups: [...fakeGroups, { ...workshop, members: members.filter(m => m.groups.includes(groups.workshop)).map(m => m.id) }],
    capabilities: ["members", "files", "notifications", ...(mail ? ["mail"] : []), ...(calendar ? ["calendar"] : []), ...(groupsRead ? ["groups"] : [])],
    mail: { domain: "atelier.test", ...(options.perDay ? { perDay: options.perDay } : {}) },
    calendar: { domain: "atelier.test", toolTitle: "News", company: "Atelier" },
  });
  return chest;
}
const pub = asMember(camille);

test("an Important post goes by email to its audience, once, in each person's language, with its text and a link", async () => {
  await open();
  try {
    const p = await posts.createPost(database.sql, pub, {
      kind: "announcement", title: "Office move", body: "We move on **2 November**.\n\n- Pack your desk", important: true, locale: "en",
      versions: [{ locale: "fr", title: "Déménagement", body: "Nous déménageons le **2 novembre**." }],
    }, { zone });
    await posts.confirm(database.sql, asMember(lea), p.id);
    await tell.announce(database.sql);
    // Everyone with a role but the author and Léa (she confirmed already).
    const to = chest.outbox.map(m => m.to[0]).sort();
    assert.deepEqual(to, [hugo, ines, nora, sofia].map(m => m.email).sort());
    const english = chest.outbox.find(m => m.to[0] === hugo.email)!;
    assert.equal(english.subject, "Important: Office move");
    assert.match(english.text, /We move on 2 November\.\n\n• Pack your desk/u);
    assert.match(english.text, /click “I have read it”/u);
    assert.match(english.text, /Camille Martin marked this post Important/u);
    const french = chest.outbox.find(m => m.to[0] === ines.email)!;
    assert.equal(french.subject, "Important\u202f: Déménagement");
    assert.match(french.text, /Nous déménageons le 2 novembre\./u);
    // The bell speaks each language too.
    assert.equal(chest.notifications.find(n => n.member === ines.id)!.title, "Important\u202f: Déménagement");
    assert.equal(chest.notifications.find(n => n.member === hugo.id)!.title, "Important: Office move");
    // Told again (its audience changed): nobody is emailed twice.
    await database.sql`update posts set announced_at = null where id = ${p.id}`;
    await tell.announce(database.sql);
    assert.equal(chest.outbox.length, 4);
    assert.equal((await posts.post(database.sql, pub, p.id, { zone })).emailed, 4);
    assert.equal(await learned(database.sql, "mail"), "on");
    // A reminder goes by email too, to those who have not confirmed.
    const { confirmed } = await posts.confirmations(database.sql, pub, p.id);
    const pending = tally({ ...p, author: camille.id, people: [] }, confirmed, (await everyoneWithNews()).people).pending;
    await tell.remind(database.sql, { id: p.id, title: "Office move", body: "We move.", locale: "en", versions: [], author: camille.id }, pending, "2026-10-01");
    assert.equal(chest.outbox.filter(m => m.subject === "Reminder: Office move").length, 2, "Hugo and Sofia (English)");
  } finally {
    await chest.close();
  }
});

test("the day's email quota or a Chest without email never stops the bell; the composer learns it", async () => {
  await open({ perDay: 2 });
  try {
    const p = await posts.createPost(database.sql, pub, { kind: "announcement", title: "Fire drill", important: true }, { zone });
    await tell.announce(database.sql);
    assert.equal(chest.outbox.length, 2);
    assert.equal(chest.notifications.filter(n => n.key === `post:${p.id}:important`).length, 5, "everyone told in the bell");
    const seen = await posts.post(database.sql, pub, p.id, { zone });
    assert.equal(seen.emailed, 2);
    assert.equal(seen.emailShort, true);
  } finally {
    await chest.close();
  }
  await open({ mail: false });
  try {
    const p = await posts.createPost(database.sql, pub, { kind: "announcement", title: "Fire drill again", important: true }, { zone });
    await tell.announce(database.sql);
    assert.equal(chest.outbox.length, 0);
    assert.equal(chest.notifications.filter(n => n.key === `post:${p.id}:important`).length, 5);
    assert.equal(await learned(database.sql, "mail"), "off");
  } finally {
    await chest.close();
  }
});

test("a new Important post waits 10 seconds: Undo takes it back and nothing leaves", async () => {
  await open();
  try {
    const now = new Date();
    const doc = await posts.recordUpload(database.sql, pub, { object: "uploads/aaaaaaaaaaaaaaaaaaaa.pdf", fileName: "plan.pdf", type: "application/pdf", size: 3, role: "attachment" });
    const held = await posts.createPost(database.sql, pub, { kind: "announcement", title: "Typo in the title", important: true, attachments: [doc.id] }, { zone, now, hold: true });
    assert.equal(held.undoUntil, new Date(now.getTime() + 10_000).toISOString());
    // Nobody sees it, nobody is told.
    assert.ok(!(await posts.front(database.sql, asMember(hugo), { zone })).posts.some(x => x.id === held.id));
    assert.deepEqual(await tell.announce(database.sql, new Date(now.getTime() + 5_000)), { told: [], waiting: [] });
    const mine = await posts.post(database.sql, pub, held.id, { zone, now: new Date(now.getTime() + 5_000) });
    assert.equal(mine.sending, true);
    // Only its author takes it back; its file is hers again.
    await assert.rejects(posts.recall(database.sql, asMember(sofia), held.id, new Date(now.getTime() + 5_000)), refused("too_late"));
    await posts.recall(database.sql, pub, held.id, new Date(now.getTime() + 5_000));
    await assert.rejects(posts.post(database.sql, pub, held.id, { zone }), refused("not_found"));
    assert.equal((await posts.fileFor(database.sql, pub, doc.id)).fileName, "plan.pdf");
    assert.equal(chest.notifications.length + chest.outbox.length, 0);
    // Left alone, it goes out when its seconds are over.
    const sent = await posts.createPost(database.sql, pub, { kind: "announcement", title: "Right title", important: true }, { zone, now, hold: true });
    assert.deepEqual(await tell.announce(database.sql, new Date(now.getTime() + 10_000)), { told: [sent.id], waiting: [] });
    assert.equal(chest.outbox.length, 5);
    await assert.rejects(posts.recall(database.sql, pub, sent.id, new Date(now.getTime() + 11_000)), refused("too_late"));
    // A post that tells nobody is not held; nor is one scheduled.
    const plain = await posts.createPost(database.sql, pub, { kind: "info", title: "Coffee" }, { zone, now, hold: true });
    assert.equal(plain.undoUntil, null);
    assert.equal(plain.published, true);
  } finally {
    await chest.close();
  }
});

test("any group of the Chest, even one that does not give News, and people picked by hand", async () => {
  const bob = withWorkshop(nora, true);
  await open({ members: everyone.map(m => (m.id === nora.id ? bob : m)) });
  try {
    const listed = await chestGroups();
    assert.ok(listed !== "unavailable" && listed.some(g => g.id === groups.workshop), "the Workshop is offered");
    const p = await posts.createPost(database.sql, pub, { kind: "announcement", title: "Workshop closed Friday", important: true, groups: [groups.workshop], people: [lea.id] }, { zone });
    for (const [who, sees] of [[bob, true], [lea, true], [hugo, false], [ines, false], [camille, true]] as const) {
      const front = await posts.front(database.sql, asMember(who), { zone });
      assert.equal(front.posts.some(x => x.id === p.id), sees, who.name);
    }
    await tell.announce(database.sql);
    assert.deepEqual(chest.notifications.filter(n => n.key === `post:${p.id}:important`).map(n => n.member).sort(), [lea.id, nora.id].sort());
    assert.deepEqual(chest.outbox.map(m => m.to[0]).sort(), [lea.email, nora.email].sort());
    // Someone without News cannot be picked; one who left stays on the post.
    await assert.rejects(posts.createPost(database.sql, pub, { kind: "info", title: "x", people: [stranger.id.replace("tom", "zed")] }, { zone }), refused("no_person"));
    await assert.rejects(posts.createPost(database.sql, pub, { kind: "info", title: "x", people: ["lea"] }, { zone }), refused("no_person"));
  } finally {
    await chest.close();
  }
  // Without the "groups" permission, only the groups that give News.
  await open({ groupsRead: false });
  try {
    await assert.rejects(posts.createPost(database.sql, pub, { kind: "info", title: "x", groups: [groups.workshop] }, { zone }), refused("no_group"));
  } finally {
    await chest.close();
  }
});

test("leaving a group takes the post's bell item away; a removed group too", async () => {
  const bob = withWorkshop(nora, true);
  const cast = everyone.map(m => (m.id === nora.id ? bob : m));
  await open({ members: cast });
  try {
    const p = await posts.createPost(database.sql, pub, { kind: "announcement", title: "Workshop safety", important: true, groups: [groups.workshop] }, { zone });
    await tell.announce(database.sql);
    assert.ok(chest.notifications.some(n => n.member === nora.id && n.key === `post:${p.id}:important`));
    assert.equal(chest.badges.get(nora.id), 1);
    // Nora moves to the office: the Chest says so.
    const person = chest.members.find(m => m.id === nora.id)!;
    person.groups = [];
    chest.groups.find(g => g.id === groups.workshop)!.members = [];
    assert.equal(await chest.emit({ type: "member.updated", data: { id: nora.id, changed: ["groups"] } }, chestEvents), 204);
    assert.ok(!chest.notifications.some(n => n.member === nora.id && n.key === `post:${p.id}:important`));
    assert.equal(chest.badges.get(nora.id), undefined);
    // Back in the workshop, then the group goes: the same.
    person.groups = [groups.workshop];
    chest.groups.find(g => g.id === groups.workshop)!.members = [nora.id];
    await tell.refreshBadges(database.sql, [{ id: nora.id, groups: [groups.workshop] }]);
    await database.sql`update posts set announced_at = null where id = ${p.id}`;
    await tell.announce(database.sql);
    assert.ok(chest.notifications.some(n => n.member === nora.id && n.key === `post:${p.id}:important`));
    person.groups = [];
    chest.groups.splice(chest.groups.findIndex(g => g.id === groups.workshop), 1);
    assert.equal(await chest.emit({ type: "group.removed", data: { id: groups.workshop } }, chestEvents), 204);
    assert.ok(!chest.notifications.some(n => n.member === nora.id && n.key === `post:${p.id}:important`));
    // The group's name is read again.
    const listed = await chestGroups();
    assert.ok(listed !== "unavailable" && !listed.some(g => g.id === groups.workshop));
  } finally {
    await chest.close();
  }
});

test("two languages: each reader sees theirs, search finds either, a version left empty is none", async () => {
  await open();
  try {
    const p = await posts.createPost(database.sql, asMember(sofia), {
      kind: "info", title: "Parking rules", body: "Park on level -2.", locale: "en",
      versions: [{ locale: "fr", title: "Règles du parking", body: "Garez-vous au niveau -2." }],
    }, { zone });
    const fr = await posts.post(database.sql, asMember(ines), p.id, { zone });
    assert.equal(fr.title, "Règles du parking");
    assert.equal(fr.locale, "fr");
    const en = (await posts.front(database.sql, asMember(hugo), { zone })).posts.find(x => x.id === p.id)!;
    assert.equal(en.title, "Parking rules");
    assert.equal((await search(database.sql, asMember(hugo), "garez")).length, 1, "found by its French words");
    assert.equal((await search(database.sql, asMember(ines), "parking"))[0]!.title.map(s => s.text).join(""), "Règles du parking");
    // A version with a text needs its headline; an empty one is dropped; the
    // post's own language is not a version.
    await assert.rejects(posts.createPost(database.sql, pub, { kind: "info", title: "x", locale: "en", versions: [{ locale: "fr", title: "", body: "texte" }] }, { zone }), refused("empty"));
    await assert.rejects(posts.createPost(database.sql, pub, { kind: "info", title: "x", locale: "en", versions: [{ locale: "en", title: "y" }] }, { zone }), refused("invalid"));
    await assert.rejects(posts.createPost(database.sql, pub, { kind: "info", title: "x", locale: "de" }, { zone }), refused("invalid"));
    const empty = await posts.createPost(database.sql, pub, { kind: "info", title: "Only French", locale: "fr", versions: [{ locale: "en", title: "", body: "" }] }, { zone });
    assert.deepEqual((await posts.post(database.sql, asMember(hugo), empty.id, { zone })).versions, []);
    assert.equal((await posts.post(database.sql, asMember(hugo), empty.id, { zone })).title, "Only French", "the post's own words for an English reader");
  } finally {
    await chest.close();
  }
});

test("stemmed search: move finds moving, déménager finds déménagement", async () => {
  await open();
  try {
    await posts.createPost(database.sql, pub, { kind: "info", title: "We are moving", body: "Déménagement le 2 novembre." }, { zone });
    assert.equal((await search(database.sql, asMember(hugo), "move")).length, 1);
    assert.equal((await search(database.sql, asMember(hugo), "déménager")).length, 1);
    assert.equal((await search(database.sql, asMember(hugo), "zebra")).length, 0);
  } finally {
    await chest.close();
  }
});

test("views are a number of people only: counted once each, among the audience, shown from 5 as of the last full hour, frozen after 30 days", async () => {
  await open();
  try {
    const { sql } = database;
    const t0 = new Date("2026-10-01T09:00:00Z");
    const p = await posts.createPost(sql, pub, { kind: "info", title: "Canteen menu" }, { zone, now: t0 });
    const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
    const detail = await posts.post(sql, pub, p.id, { zone, now: at(1) });
    // Its author is never counted; a second visit is not counted twice.
    assert.equal(await recordView(sql, asMember(camille), detail, at(5)), false);
    for (const m of [hugo, ines, lea, nora]) assert.equal(await recordView(sql, asMember(m), detail, at(10)), true);
    await recordView(sql, asMember(hugo), detail, at(12));
    assert.equal((await sql`select count(*)::int as n from post_views`)[0]!.n, 4);
    // Below 5: never shown.
    assert.deepEqual(await views(sql, p.id, at(120)), { count: null });
    // Sofia at 10:40: counted from 11:00, not at once (nobody sees it rise).
    await recordView(sql, asMember(sofia), detail, at(100));
    assert.deepEqual(await views(sql, p.id, at(110)), { count: null });
    assert.deepEqual(await views(sql, p.id, at(121)), { count: 5 });
    // What is stored names nobody: no member id, one fingerprint each.
    const stored = JSON.stringify(await sql`select * from post_views`);
    assert.doesNotMatch(stored, /mbr_/u);
    // After 30 days the count is kept, the key and the fingerprints go.
    await freezeViews(sql, new Date(t0.getTime() + 31 * 864e5));
    assert.equal((await sql`select count(*)::int as n from post_views`)[0]!.n, 0);
    const [kept] = await sql<{ view_key: string | null; views_kept: number }[]>`select view_key, views_kept from posts where id = ${p.id}`;
    assert.deepEqual({ ...kept }, { view_key: null, views_kept: 5 });
    assert.deepEqual(await views(sql, p.id, new Date(t0.getTime() + 40 * 864e5)), { count: 5 });
    assert.equal(await recordView(sql, asMember(stranger), detail, at(200)), false);
    // A post kept to some people: only they are counted.
    const kept2 = await posts.createPost(sql, pub, { kind: "info", title: "For Hugo", people: [hugo.id] }, { zone, now: t0 });
    const d2 = await posts.post(sql, pub, kept2.id, { zone, now: at(1) });
    assert.equal(await recordView(sql, asMember(ines), d2, at(10)), false);
    assert.equal(await recordView(sql, asMember(hugo), d2, at(10)), true);
    // An erasure deletes the person's fingerprints at once.
    await forgetViewer(sql, hugo.id);
    assert.equal((await sql`select count(*)::int as n from post_views where post_id = ${kept2.id}`)[0]!.n, 0);
    assert.equal(shown(4), null);
    assert.equal(shown(5), 5);
  } finally {
    await chest.close();
  }
});

test("coming to an event puts it in the Chest's calendar; seats fill, then a waiting list", async () => {
  await open();
  try {
    const e = await posts.createPost(database.sql, pub, { kind: "event", title: "Seminar", locale: "en", versions: [{ locale: "fr", title: "Séminaire", body: "" }], event: { day: "2026-12-01", lastDay: "2026-12-02", place: "Lyon", seats: 1 } }, { zone });
    const first = await posts.answer(database.sql, asMember(hugo), e.id, "yes", { zone });
    assert.deepEqual(first, { answer: "yes", promoted: null });
    await syncEvent(database.sql, e.id);
    const put = chest.calendar.get(eventKey(e.id))!;
    assert.deepEqual(put.members, [hugo.id]);
    assert.deepEqual(put.title, { en: "Seminar", fr: "Séminaire" });
    assert.deepEqual("days" in put ? put.days : null, { first: "2026-12-01", last: "2026-12-02" });
    // Full: Inès waits; Hugo takes his answer back, she gets the seat.
    assert.deepEqual(await posts.answer(database.sql, asMember(ines), e.id, "yes", { zone }), { answer: "wait", promoted: null });
    assert.deepEqual(await posts.answer(database.sql, asMember(hugo), e.id, null, { zone }), { answer: null, promoted: ines.id });
    await syncEvent(database.sql, e.id);
    assert.deepEqual(chest.calendar.get(eventKey(e.id))!.members, [ines.id]);
    // Deleted: gone from the calendar.
    await posts.deletePost(database.sql, pub, e.id);
    await syncEvent(database.sql, e.id);
    assert.equal(chest.calendar.has(eventKey(e.id)), false);
    await assert.rejects(posts.createPost(database.sql, pub, { kind: "event", title: "x", event: { day: "2026-12-01", seats: 0 } }, { zone }), refused("bad_seats"));
    await assert.rejects(posts.createPost(database.sql, pub, { kind: "event", title: "x", event: { day: "2026-12-01", lastDay: "2026-11-30" } }, { zone }), refused("bad_date"));
  } finally {
    await chest.close();
  }
  // Without the calendar: nothing fails, News remembers it.
  await open({ calendar: false });
  try {
    const e = await posts.createPost(database.sql, pub, { kind: "event", title: "Dinner", event: { day: "2026-12-01" } }, { zone });
    await posts.answer(database.sql, asMember(hugo), e.id, "yes", { zone });
    await syncEvent(database.sql, e.id);
    assert.equal(await learned(database.sql, "calendar"), "off");
  } finally {
    await chest.close();
  }
});

test("a changed text keeps its earlier version; asked to confirm again, earlier confirmations stop counting", async () => {
  await open();
  try {
    const p = await posts.createPost(database.sql, pub, { kind: "announcement", title: "Mutual insurance", body: "From 1 January.", important: true }, { zone });
    await tell.announce(database.sql);
    await posts.confirm(database.sql, asMember(hugo), p.id);
    await tell.confirmed(database.sql, hugo, p.id);
    // A typo fixed: kept as a version; Hugo's confirmation still counts.
    await posts.updatePost(database.sql, pub, p.id, { kind: "announcement", title: "Mutual insurance", body: "From 1 January 2027.", important: true }, { zone });
    const history = await posts.revisions(database.sql, pub, p.id);
    assert.deepEqual(history.map(h => [h.version, h.body]), [[1, "From 1 January."]]);
    await assert.rejects(posts.revisions(database.sql, asMember(hugo), p.id), refused("forbidden"));
    assert.equal((await posts.confirmations(database.sql, pub, p.id)).confirmed.length, 1);
    // The price changed: everyone is asked again.
    const saved = await posts.updatePost(database.sql, pub, p.id, { kind: "announcement", title: "Mutual insurance", body: "From 1 January 2027, 30 € a month.", important: true, reconfirm: true }, { zone });
    assert.equal(saved.reconfirm, true);
    const list = await posts.confirmations(database.sql, pub, p.id);
    assert.deepEqual(list.confirmed, []);
    assert.deepEqual(list.earlier.map(e => [e.member, e.version]), [[hugo.id, 1]]);
    const seen = await posts.post(database.sql, asMember(hugo), p.id, { zone });
    assert.equal(seen.confirmed, false);
    assert.equal(seen.confirmedEarlier, true);
    await tell.announce(database.sql);
    assert.ok(chest.notifications.some(n => n.member === hugo.id && n.key === `post:${p.id}:important`), "Hugo is told again");
    assert.ok(chest.outbox.filter(m => m.to[0] === hugo.email).length === 2, "and emailed the new version");
    await posts.confirm(database.sql, asMember(hugo), p.id);
    assert.equal((await posts.confirmations(database.sql, pub, p.id)).confirmed[0]!.version, 3);
  } finally {
    await chest.close();
  }
});

test("replies and mentions: one level, and only people who see the post are told", async () => {
  await open();
  try {
    const p = await posts.createPost(database.sql, asMember(sofia), { kind: "info", title: "Sales party", groups: [groups.sales] }, { zone });
    const first = await posts.addComment(database.sql, asMember(hugo), p.id, `Can we bring partners, @[${ines.id}] and @[${lea.id}]?`);
    assert.deepEqual(first.mentioned, [ines.id, lea.id]);
    await tell.commented(asMember(hugo), first);
    // Inès (Sales) is told she is mentioned; Léa cannot see the post; Sofia
    // (its author) hears of the comment.
    assert.deepEqual(chest.notifications.filter(n => n.key === `post:${p.id}:mention`).map(n => n.member), [ines.id]);
    assert.equal(chest.notifications.find(n => n.member === ines.id)!.body, "Can we bring partners, @Inès Moreau and @Léa Dubois?");
    assert.ok(chest.notifications.some(n => n.member === sofia.id && n.key === `post:${p.id}:comments`));
    const reply = await posts.addComment(database.sql, asMember(ines), p.id, "Yes!", first.comment.id);
    assert.equal(reply.parentAuthor, hugo.id);
    await tell.commented(asMember(ines), reply);
    assert.ok(chest.notifications.some(n => n.member === hugo.id && n.key === `post:${p.id}:replies`));
    await assert.rejects(posts.addComment(database.sql, asMember(hugo), p.id, "A reply to a reply", reply.comment.id), refused("not_found"));
    // A comment removed takes its replies with it, and brings them back.
    await posts.removeComment(database.sql, asMember(hugo), first.comment.id);
    assert.equal((await posts.post(database.sql, asMember(sofia), p.id, { zone })).thread.length, 0);
    await posts.restoreComment(database.sql, asMember(hugo), first.comment.id);
    assert.deepEqual((await posts.post(database.sql, asMember(sofia), p.id, { zone })).thread.map(c => c.parentId), [null, first.comment.id]);
  } finally {
    await chest.close();
  }
});

test("pinned until a day: then it is no longer first", async () => {
  await open();
  try {
    const old = await posts.createPost(database.sql, pub, { kind: "info", title: "Office closed for the holidays", pinned: true, pinnedUntil: "2099-01-02" }, { zone });
    const news = await posts.createPost(database.sql, pub, { kind: "info", title: "Newer" }, { zone });
    assert.equal((await posts.front(database.sql, asMember(hugo), { zone })).posts[0]!.id, old.id);
    const later = new Date("2099-01-03T12:00:00Z");
    const front = await posts.front(database.sql, asMember(hugo), { zone, now: later });
    assert.equal(front.posts[0]!.id, news.id);
    assert.equal(front.posts.find(x => x.id === old.id)!.pinned, false);
    await assert.rejects(posts.createPost(database.sql, pub, { kind: "info", title: "x", pinned: true, pinnedUntil: "2020-01-01" }, { zone }), refused("bad_date"));
  } finally {
    await chest.close();
  }
});

test("the weekly digest by email too, unless the person turned it off", async () => {
  await open();
  try {
    const run = { scheduledAt: new Date().toISOString(), timeZone: zone };
    await posts.createPost(database.sql, pub, { kind: "info", title: "Canteen menu", locale: "en", versions: [{ locale: "fr", title: "Menu de la cantine", body: "" }] }, { zone, now: new Date(Date.now() - 864e5) });
    await setDigestEmail(database.sql, asMember(hugo), false);
    await assert.rejects(setDigestEmail(database.sql, asMember(stranger), false), refused("forbidden"));
    await startDigest(database.sql, run);
    const to = chest.outbox.map(m => m.to[0]);
    assert.ok(!to.includes(hugo.email), "Hugo turned it off");
    assert.ok(to.includes(ines.email) && to.includes(sofia.email));
    const french = chest.outbox.find(m => m.to[0] === ines.email)!;
    assert.match(french.subject, /Cette semaine dans les Actualités\u202f: 1 publication/u);
    assert.match(french.text, /• Menu de la cantine/u);
  } finally {
    await chest.close();
  }
});

test("an older post made Important later is told to its audience then, once", async () => {
  await open();
  try {
    // Published 10 days ago, not Important: nobody was told.
    const p = await posts.createPost(database.sql, pub, { kind: "announcement", title: "Parking rules", body: "Park on the left." }, { zone, now: new Date(Date.now() - 10 * 864e5) });
    await tell.announce(database.sql);
    assert.equal(chest.notifications.length, 0);
    // Made Important today: its audience is told now, in the bell and by email.
    const saved = await posts.updatePost(database.sql, pub, p.id, { kind: "announcement", title: "Parking rules", body: "Park on the left.", important: true }, { zone });
    assert.equal(saved.importantChanged, true);
    assert.deepEqual(await tell.announce(database.sql), { told: [p.id], waiting: [] });
    const told = chest.notifications.filter(n => n.key === `post:${p.id}:important`).map(n => n.member).sort();
    assert.deepEqual(told, [hugo.id, ines.id, lea.id, nora.id, sofia.id].sort());
    assert.equal(chest.outbox.length, 5);
    assert.equal(chest.badges.get(hugo.id), 1);
    // Once: the next passes send nothing more.
    assert.deepEqual(await tell.announce(database.sql), { told: [], waiting: [] });
    assert.equal(chest.outbox.length, 5);
    // A later change of its audience tells the new audience only by email
    // (the bell item is replaced, never doubled), and still after 7 days.
    await posts.confirm(database.sql, asMember(hugo), p.id);
    await posts.updatePost(database.sql, pub, p.id, { kind: "announcement", title: "Parking rules", body: "Park on the left.", important: true, people: [hugo.id, nora.id] }, { zone });
    assert.deepEqual(await tell.announce(database.sql), { told: [p.id], waiting: [] });
    assert.equal(chest.outbox.length, 5, "Nora was emailed already; Hugo confirmed");
    // A post made Important long after, then left for more than 7 days
    // without the Chest being reached, is no longer told: as a new one.
    await database.sql`update posts set announced_at = null, announce_due = now() - interval '8 days' where id = ${p.id}`;
    assert.deepEqual(await tell.announce(database.sql), { told: [], waiting: [] });
  } finally {
    await chest.close();
  }
});

test("each person's email preference in the Chest is honoured: none is not emailed, nor counted", async () => {
  await open({ members: everyone.map(m => (m.id === hugo.id ? { ...m, mailPreference: "none" as const } : m.id === sofia.id ? { ...m, mailPreference: "digest" as const } : m)) });
  try {
    const p = await posts.createPost(database.sql, pub, { kind: "announcement", title: "Fire drill", important: true }, { zone });
    await tell.announce(database.sql);
    const to = chest.outbox.map(m => m.to[0]).sort();
    assert.deepEqual(to, [ines, lea, nora].map(m => m.email).sort());
    assert.deepEqual(chest.held.map(h => [h.member, h.reason]).sort(), [[hugo.id, "none"], [sofia.id, "digest"]].sort());
    // Everyone is still told in the bell.
    assert.equal(chest.notifications.filter(n => n.key === `post:${p.id}:important`).length, 5);
    // Sofia gets it in the Chest's daily email; Hugo chose none.
    assert.equal((await posts.post(database.sql, pub, p.id, { zone })).emailed, 4);
  } finally {
    await chest.close();
  }
});
