import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, withMember, type FakeChest } from "@argentic/chest-sdk/testing";
import { member } from "@argentic/chest-sdk/member";
import { answerLink as answer } from "../src/calls.ts";
import { withGroups } from "../src/lib/groups.ts";
import { answerToken } from "../src/lib/answer-links.ts";
import { whoPublishes } from "../src/lib/audience.ts";
import { startDigest } from "../src/lib/digest.ts";
import { AppError } from "@argentic/chest-app";
import { erase, leave } from "../src/lib/lifecycle.ts";
import * as posts from "../src/lib/posts.ts";
import * as proposals from "../src/lib/proposals.ts";
import { otherLanguage, search } from "../src/lib/search.ts";
import * as tell from "../src/lib/tell.ts";
import { today } from "../src/lib/time.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, hugo, ines, lea, sofia, stranger } from "./support/members.ts";

// GET /chest/posts/<id>/answer as src/app.tsx answers it: the member the
// Chest asserts, with all their groups.
const answerLink = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const who = member(request);
  return answer(request, who ? await withGroups(who) : null, (await params).id);
};

// The third severe critique: search and empty states in the reader's
// language; "I'm coming" in one tap from an email; posts from everyone
// (shout-outs and news), moderated by the publishers — and who sees what
// before they approve.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" },
    members: everyone,
    groups: fakeGroups,
    capabilities: ["members", "files", "notifications", "mail"],
    mail: { domain: "atelier.test" },
  });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate posts, files, reactions, comments, confirmations, rsvps, visits, digests, digest_runs, preferences, emails, proposals, chest_state restart identity cascade`;
  chest.notifications.splice(0);
  chest.outbox.length = 0;
});

const zone = "Europe/Paris";
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const pub = asMember(camille);
const write = (input: posts.PostInput) => posts.createPost(database.sql, pub, input, { zone });
const text = (segments: { text: string }[]) => segments.map(s => s.text).join("");
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

test("search shows the reader's language: headline and passage, found by a stem or a comment; the other language is named", async () => {
  const move = await write({ kind: "announcement", title: "We are moving on 2 November", body: "The new office is bigger.", locale: "en", versions: [{ locale: "fr", title: "Nous déménageons le 2 novembre", body: "Le nouveau bureau est plus grand." }] });
  await posts.addComment(database.sql, asMember(lea), move.id, "Qui s’occupe du déménagement des plantes ?");
  // Camille reads French: "déménager" finds the post by its stem (and a comment) — shown in French, the stem marked.
  const [hit] = await search(database.sql, pub, "déménager");
  assert.equal(text(hit!.title), "Nous déménageons le 2 novembre");
  assert.ok(hit!.title.some(s => s.hit && s.text === "déménageons"), JSON.stringify(hit!.title));
  assert.equal(hit!.foundIn, null);
  // Found only by a comment: the headline is still hers.
  await database.sql`update posts set body = '' where id = ${move.id}`;
  await database.sql`update post_versions set body = '' where post_id = ${move.id}`;
  const [byComment] = await search(database.sql, pub, "plantes");
  assert.equal(text(byComment!.title), "Nous déménageons le 2 novembre");
  // Words only in the English version: the French headline, and where the words were.
  const [english] = await search(database.sql, pub, "bigger");
  assert.equal(english, undefined, "the English body was emptied");
  const training = await write({ kind: "event", title: "First-aid training: 3 places", body: "Learn first aid in a morning.", locale: "en", event: { day: inDays(10), seats: 3 } });
  const [aid] = await search(database.sql, pub, "first aid");
  assert.equal(aid!.id, training.id);
  assert.equal(aid!.foundIn, null, "an English-only post has nothing else to show");
  const both = await write({ kind: "info", title: "Parking", body: "Le parking ferme à 20 h.", locale: "fr", versions: [{ locale: "en", title: "Car park", body: "The car park closes at 8 pm." }] });
  const [park] = await search(database.sql, asMember(hugo), "ferme");
  assert.equal(park!.id, both.id);
  assert.equal(text(park!.title), "Car park", "Hugo reads English");
  assert.equal(park!.foundIn, "fr", "the words are in its French version");
  // Nothing found for "secourisme": some posts exist in English only.
  assert.deepEqual(await search(database.sql, pub, "secourisme"), []);
  assert.equal(await otherLanguage(database.sql, pub), "en");
  assert.equal(await otherLanguage(database.sql, asMember(hugo)), null, "every post Hugo sees has English");
  await assert.rejects(otherLanguage(database.sql, asMember(stranger)), refused("forbidden"));
});

test("a reader's empty front page names the publishers, the Chest's administrators last", async () => {
  assert.deepEqual(await whoPublishes(), { names: ["Sofia Rossi", "Camille Martin"], more: false });
});

test("an Important event's email carries “I’m coming” and “Not coming”: one tap answers, for that person only", async () => {
  const e = await write({ kind: "event", title: "Summer party", body: "On the terrace.", locale: "en", important: true, event: { day: inDays(5), seats: 1 } });
  await tell.announce(database.sql);
  const letter = chest.outbox.find(m => m.to[0] === hugo.email)!;
  assert.match(letter.text, /Are you coming\? One click answers:/u);
  const yes = /I’m coming: (\S+)/u.exec(letter.text)![1]!;
  const no = /Not coming: (\S+)/u.exec(letter.text)![1]!;
  assert.match(yes, new RegExp(`/chest/posts/${e.id}/answer\\?a=yes&t=[A-Za-z0-9_-]{32}$`, "u"));
  const french = chest.outbox.find(m => m.to[0] === ines.email)!;
  assert.match(french.text, /Vous venez\u202f\? Un clic suffit pour répondre\u202f:/u);
  const open = (href: string, who = hugo) => answerLink(withMember(new Request(href), who), { params: Promise.resolve({ id: e.id }) });
  // Hugo taps "I'm coming": answered, then the post says so, with the answer before (Undo).
  let r = await open(yes);
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), `/chest/posts/${e.id}?answered=yes&was=none`);
  assert.deepEqual([...await database.sql`select member, answer from rsvps where post_id = ${e.id}`], [{ member: hugo.id, answer: "yes" }]);
  // The same button again: the same answer (not a toggle).
  r = await open(yes);
  assert.equal(r.headers.get("location"), `/chest/posts/${e.id}?answered=yes&was=yes`);
  // Léa opens Hugo's link: it is not hers, nothing changes.
  r = await open(yes, lea);
  assert.equal(r.headers.get("location"), `/chest/posts/${e.id}?answered=invalid`);
  assert.equal((await database.sql`select count(*)::int as n from rsvps where post_id = ${e.id}`)[0]!.n, 1);
  // A token for another button, another event or changed by a letter: nothing.
  const tampered = yes.replace(/t=(.)/u, (_m, c: string) => `t=${c === "A" ? "B" : "A"}`);
  assert.equal((await open(tampered)).headers.get("location"), `/chest/posts/${e.id}?answered=invalid`);
  assert.equal((await open(yes.replace("a=yes", "a=no"))).headers.get("location"), `/chest/posts/${e.id}?answered=invalid`);
  assert.equal((await open(yes.replace("a=yes", "a=maybe"))).headers.get("location"), `/chest/posts/${e.id}?answered=invalid`);
  // Without the Chest's assertion: nothing (the proxy answers 401 before; the route too).
  assert.equal((await answerLink(new Request(yes), { params: Promise.resolve({ id: e.id }) })).headers.get("location"), `/chest/posts/${e.id}?answered=invalid`);
  // "Not coming" frees the only seat.
  r = await open(no);
  assert.equal(r.headers.get("location"), `/chest/posts/${e.id}?answered=no&was=yes`);
  // Léa's own link: the only seat is hers.
  const leaYes = `${new URL(yes).origin}/chest/posts/${e.id}/answer?a=yes&t=${await answerToken(database.sql, e.id, "yes", lea.id)}`;
  assert.equal((await open(leaYes, lea)).headers.get("location"), `/chest/posts/${e.id}?answered=yes&was=none`);
  // Past its last day: nothing changes, the post says it is over.
  await database.sql`update posts set event_day = ${today(zone, new Date(Date.now() - 3 * 864e5))} where id = ${e.id}`;
  assert.equal((await open(yes)).headers.get("location"), `/chest/posts/${e.id}?answered=closed`);
  // A post Hugo cannot see answers "not found".
  const kept = await write({ kind: "event", title: "Board dinner", locale: "en", event: { day: inDays(3) }, people: [sofia.id] });
  const hidden = `${new URL(yes).origin}/chest/posts/${kept.id}/answer?a=yes&t=${await answerToken(database.sql, kept.id, "yes", hugo.id)}`;
  assert.equal((await answerLink(withMember(new Request(hidden), hugo), { params: Promise.resolve({ id: kept.id }) })).status, 404);
  // An Important post that is not an event has no such lines.
  await write({ kind: "announcement", title: "Fire drill", important: true, locale: "en" });
  await tell.announce(database.sql);
  assert.doesNotMatch(chest.outbox.at(-1)!.text, /I’m coming/u);
});

test("the weekly digest's email offers the answers of an event still open", async () => {
  const e = await write({ kind: "event", title: "Team lunch", locale: "en", event: { day: inDays(4) } });
  await write({ kind: "info", title: "New coffee machine", locale: "en" });
  await startDigest(database.sql, { scheduledAt: new Date(Date.now() + 60_000).toISOString() });
  const letter = chest.outbox.find(m => m.to[0] === hugo.email)!;
  assert.match(letter.text, /• New coffee machine\n• Team lunch\n {2}I’m coming: \S+answer\?a=yes&t=\S+\n {2}Not coming: \S+answer\?a=no&t=\S+\n/u);
  const link = /I’m coming: (\S+)/u.exec(letter.text)![1]!;
  const r = await answerLink(withMember(new Request(link), hugo), { params: Promise.resolve({ id: e.id }) });
  assert.equal(r.headers.get("location"), `/chest/posts/${e.id}?answered=yes&was=none`);
});

test("posts from everyone: a reader proposes; before approval only they and the publishers see it; a publisher publishes it", async () => {
  const sql = database.sql;
  // A picture of Hugo's own, uploaded for it (a reader may add a cover only).
  const picture = await posts.recordUpload(sql, asMember(hugo), { object: "uploads/aaaaaaaaaaaaaaaaaaaa.jpg", fileName: "site.jpg", type: "image/jpeg", size: 1000, role: "cover" });
  await assert.rejects(posts.recordUpload(sql, asMember(hugo), { object: "uploads/bbbbbbbbbbbbbbbbbbbb.pdf", fileName: "x.pdf", type: "application/pdf", size: 10, role: "attachment" }), refused("forbidden"));
  const made = await proposals.propose(sql, asMember(hugo), { kind: "shoutout", title: "Thank you, Léa!", body: "SECRETPROPOSAL: she fixed the van on Sunday.", colleague: lea.id, cover: picture.id });
  await tell.proposalsWaiting(sql);
  // The publishers are told how many wait; nobody else.
  const bell = chest.notifications.filter(n => n.key === tell.proposalsKey);
  assert.deepEqual(bell.map(n => n.member).sort(), [camille.id, sofia.id].sort());
  assert.equal(bell.find(n => n.member === sofia.id)!.title, "1 post waits for your approval");
  assert.equal(bell.find(n => n.member === camille.id)!.title, "1 publication attend votre validation");
  // Before approval: not a post — not on anyone's front page, not in search.
  for (const who of [hugo, lea, ines, sofia, camille]) {
    assert.equal((await posts.front(sql, asMember(who), { zone })).posts.length, 0, who.firstName);
    assert.deepEqual(await search(sql, asMember(who), "SECRETPROPOSAL"), [], who.firstName);
  }
  // Its author and the publishers see it; the other readers do not, nor its picture.
  assert.deepEqual((await proposals.mine(sql, asMember(hugo))).map(p => p.id), [made.id]);
  assert.deepEqual(await proposals.mine(sql, asMember(lea)), []);
  await assert.rejects(proposals.waiting(sql, asMember(lea)), refused("forbidden"));
  await assert.rejects(proposals.waiting(sql, asMember(hugo)), refused("forbidden"));
  assert.equal((await proposals.waiting(sql, asMember(sofia)))[0]!.body, "SECRETPROPOSAL: she fixed the van on Sunday.");
  await posts.fileFor(sql, asMember(hugo), picture.id);
  await posts.fileFor(sql, asMember(sofia), picture.id);
  await assert.rejects(posts.fileFor(sql, asMember(lea), picture.id), refused("not_found"));
  await assert.rejects(posts.fileFor(sql, asMember(stranger), picture.id), refused("forbidden"));
  // Nobody but a publisher approves; the colleague thanked cannot either; Lea cannot decline it.
  await assert.rejects(proposals.approve(sql, asMember(hugo), made.id), refused("forbidden"));
  await assert.rejects(proposals.approve(sql, asMember(lea), made.id), refused("forbidden"));
  await assert.rejects(proposals.decline(sql, asMember(lea), made.id), refused("not_found"));
  // A day later, the unused-upload purge keeps a waiting proposal's picture.
  await sql`update files set added_at = now() - interval '2 days' where id = ${picture.id}`;
  assert.deepEqual(await posts.purge(sql), []);
  // Sofia publishes it: a shout-out by Hugo, its picture as the cover.
  const done = await proposals.approve(sql, asMember(sofia), made.id);
  await tell.proposalApproved(sql, done);
  const p = await posts.post(sql, asMember(lea), done.postId, { zone });
  assert.equal(p.kind, "shoutout");
  assert.equal(p.author, hugo.id);
  assert.equal(p.welcome, lea.id);
  assert.equal(p.cover, picture.id);
  assert.equal((await sql`select approved_by from posts where id = ${done.postId}`)[0]!.approved_by, sofia.id);
  assert.equal((await posts.front(sql, asMember(ines), { zone })).posts[0]!.id, done.postId);
  assert.equal((await search(sql, asMember(ines), "SECRETPROPOSAL"))[0]!.id, done.postId);
  // Hugo is told it is published; Léa that Hugo thanks her; the publishers' item goes.
  assert.equal(chest.notifications.find(n => n.member === hugo.id && n.key === `proposal:${made.id}`)!.title, "Your post is on News: “Thank you, Léa!”");
  assert.equal(chest.notifications.find(n => n.member === lea.id && n.key === `post:${done.postId}:welcome`)!.title, "Hugo Bernard vous remercie dans les Actualités");
  assert.equal(chest.notifications.filter(n => n.key === tell.proposalsKey).length, 0);
  // It is gone from the list; approving again finds nothing.
  assert.deepEqual(await proposals.waiting(sql, asMember(sofia)), []);
  await assert.rejects(proposals.approve(sql, asMember(camille), made.id), refused("not_found"));
});

test("a publisher never approves their own proposal; declined with a reason, the author is told; Undo; taking back", async () => {
  const sql = database.sql;
  const own = await proposals.propose(sql, asMember(sofia), { kind: "info", title: "Photos of the site" });
  await assert.rejects(proposals.approve(sql, asMember(sofia), own.id), refused("forbidden"));
  const news = await proposals.propose(sql, asMember(ines), { kind: "info", title: "Le chantier de Lyon est fini", body: "Bravo à l’équipe." });
  const declined = await proposals.decline(sql, asMember(camille), news.id, "Déjà annoncé lundi.");
  await tell.proposalDeclined(sql, declined);
  const told = chest.notifications.find(n => n.member === ines.id && n.key === `proposal:${news.id}`)!;
  assert.equal(told.title, "Votre publication n’a pas été publiée\u202f: «\u202fLe chantier de Lyon est fini\u202f»");
  assert.equal(told.body, "Déjà annoncé lundi.");
  assert.equal((await proposals.mine(sql, asMember(ines)))[0]!.reason, "Déjà annoncé lundi.");
  assert.deepEqual((await proposals.waiting(sql, asMember(sofia))).map(p => p.id), [own.id]);
  await assert.rejects(proposals.approve(sql, asMember(sofia), news.id), refused("not_found"));
  // Undo: back in the list, the item leaves Inès's bell.
  const back = await proposals.restore(sql, asMember(camille), news.id);
  await tell.proposalRestored(sql, news.id, back.author);
  assert.equal(chest.notifications.filter(n => n.key === `proposal:${news.id}`).length, 0);
  assert.equal((await proposals.waiting(sql, asMember(sofia))).length, 2);
  // Inès takes it back herself: no bell; only she brings it back (a publisher cannot).
  const taken = await proposals.decline(sql, asMember(ines), news.id, "ignored");
  assert.equal(taken.byAuthor, true);
  assert.equal(taken.reason, null);
  await assert.rejects(proposals.restore(sql, asMember(camille), news.id), refused("not_found"));
  await proposals.restore(sql, asMember(ines), news.id);
  // Declined 30 days ago: gone.
  await proposals.decline(sql, asMember(camille), news.id);
  await sql`update proposals set declined_at = now() - interval '31 days' where id = ${news.id}`;
  await posts.purge(sql);
  assert.deepEqual(await proposals.mine(sql, asMember(ines)), []);
});

test("proposals: the rules — a shout-out names a colleague with News (not oneself), five waiting at most, no role no proposal", async () => {
  const sql = database.sql;
  await assert.rejects(proposals.propose(sql, asMember(hugo), { kind: "shoutout", title: "Me!", colleague: hugo.id }), refused("yourself"));
  await assert.rejects(proposals.propose(sql, asMember(hugo), { kind: "shoutout", title: "Thanks", colleague: stranger.id }), refused("no_person"));
  await assert.rejects(proposals.propose(sql, asMember(hugo), { kind: "shoutout", title: "Thanks" }), refused("no_person"));
  await assert.rejects(proposals.propose(sql, asMember(hugo), { kind: "announcement", title: "Important!" }), refused("invalid"));
  await assert.rejects(proposals.propose(sql, asMember(hugo), { kind: "info", title: "  " }), refused("empty"));
  await assert.rejects(proposals.propose(sql, asMember(stranger), { kind: "info", title: "Hello" }), refused("forbidden"));
  // Another person's upload, or a post's file, is not a proposal's picture.
  const sofiaFile = await posts.recordUpload(sql, asMember(sofia), { object: "uploads/cccccccccccccccccccc.png", fileName: "a.png", type: "image/png", size: 10, role: "cover" });
  await assert.rejects(proposals.propose(sql, asMember(hugo), { kind: "info", title: "Look", cover: sofiaFile.id }), refused("file_missing"));
  for (let i = 0; i < 5; i++) await proposals.propose(sql, asMember(hugo), { kind: "info", title: `News ${i}` });
  await assert.rejects(proposals.propose(sql, asMember(hugo), { kind: "info", title: "One more" }), refused("too_many"));
  // A publisher's composer knows shout-outs too: never oneself.
  await assert.rejects(write({ kind: "shoutout", title: "Me", welcome: camille.id }), refused("yourself"));
  const s = await write({ kind: "shoutout", title: "Thanks, Sofia", welcome: sofia.id });
  await tell.announce(sql);
  assert.equal(chest.notifications.find(n => n.member === sofia.id && n.key === `post:${s.id}:welcome`)!.title, "Camille Martin thanked you on News");
});

test("someone who leaves takes their waiting proposals with them; an erasure removes theirs and the name in others'", async () => {
  const sql = database.sql;
  await proposals.propose(sql, asMember(hugo), { kind: "info", title: "Van repaired" });
  const b = await proposals.propose(sql, asMember(ines), { kind: "shoutout", title: "Merci Hugo", colleague: hugo.id });
  await tell.proposalsWaiting(sql);
  await leave(sql, hugo.id);
  assert.deepEqual((await proposals.waiting(sql, asMember(sofia))).map(p => p.id), [b.id]);
  assert.equal(chest.notifications.find(n => n.member === sofia.id && n.key === tell.proposalsKey)!.title, "1 post waits for your approval");
  await erase(sql, hugo.id);
  assert.equal((await proposals.waiting(sql, asMember(sofia)))[0]!.colleague, "erased");
  await erase(sql, ines.id);
  assert.deepEqual(await proposals.waiting(sql, asMember(sofia)), []);
});
