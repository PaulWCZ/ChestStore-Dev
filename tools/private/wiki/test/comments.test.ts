import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import * as members from "@argentic/chest-sdk/members";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { chestEvents as POST } from "../src/calls.ts";
import * as comments from "../src/lib/comments.ts";
import { normalize } from "../src/lib/doc.ts";
import * as editing from "../src/lib/editing.ts";
import { fromMarkdown } from "../src/lib/markdown.ts";
import { linkParts } from "../src/lib/model.ts";
import * as pages from "../src/lib/pages.ts";
import * as spaces from "../src/lib/spaces.ts";
import * as tell from "../src/lib/tell.ts";
import * as watching from "../src/lib/watching.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, groups, hugo, ines, lea, nora, tom } from "./support/members.ts";

// Comments and watching: who may read, write, change and remove a comment —
// exactly who may read the page — and who is told in the bell, once per
// page and reason, never about a page they cannot read.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(() => {
  chest.notifications.splice(0);
  members.forget();
});

async function openSpace(name = "Handbook") {
  return spaces.createSpace(database.sql, asMember(ines), { name });
}
async function newPage(spaceId: string, who = ines, title = "Holidays") {
  return pages.createPage(database.sql, asMember(who), { spaceId, title });
}
const itemsOf = (member: string, key: string) => chest.notifications.filter(n => n.member === member && n.key === key);

test("everyone who reads a page may comment on it, readers too; no role, no comments", async () => {
  const { sql } = database;
  const s = await openSpace();
  const p = await newPage(s.id);
  const { comment } = await comments.addComment(sql, asMember(hugo), p.id, "  Does this count\r\nweekends?  ");
  assert.equal(comment.body, "Does this count\nweekends?");
  assert.equal(comment.author, hugo.id);
  await comments.addComment(sql, asMember(ines), p.id, "No, working days only.");
  assert.deepEqual((await comments.comments(sql, asMember(lea), p.id)).map(c => c.author), [hugo.id, ines.id]);
  await assert.rejects(comments.addComment(sql, asMember(nora), p.id, "Hello"), /not_found/u);
  await assert.rejects(comments.comments(sql, asMember(nora), p.id), /not_found/u);
  await assert.rejects(comments.comments(sql, null, p.id), /not_found/u);
  await assert.rejects(comments.addComment(sql, asMember(hugo), p.id, "   "), /empty/u);
  await assert.rejects(comments.addComment(sql, asMember(hugo), p.id, "x".repeat(5001)), /too_long/u);
  await assert.rejects(comments.addComment(sql, asMember(hugo), p.id, 42), /invalid/u);
  await assert.rejects(comments.addComment(sql, asMember(hugo), "999999", "Hello"), /not_found/u);
});

test("comments follow the space's access: kept to a group, gone for the others — even by a comment's id", async () => {
  const { sql } = database;
  const hr = await spaces.createSpace(sql, asMember(camille), { name: "HR", visibility: "groups", groups: [groups.sales] });
  const p = await newPage(hr.id, camille, "Salaries");
  const { comment } = await comments.addComment(sql, asMember(hugo), p.id, "Is the grid for 2026?");
  // Léa (tech) and Tom (tech, an editor) do not see the space.
  for (const who of [lea, tom]) {
    await assert.rejects(comments.comments(sql, asMember(who), p.id), /not_found/u);
    await assert.rejects(comments.addComment(sql, asMember(who), p.id, "Me too"), /not_found/u);
    await assert.rejects(comments.editComment(sql, asMember(who), comment.id, "Changed"), /not_found/u);
    await assert.rejects(comments.removeComment(sql, asMember(who), comment.id), /not_found/u);
    await assert.rejects(comments.restoreComment(sql, asMember(who), comment.id), /not_found/u);
  }
  // Camille (the Chest's admin) sees it and may remove it.
  assert.equal((await comments.comments(sql, asMember(camille), p.id)).length, 1);
});

test("a page moved to a space its commenter cannot read hides its comments from them, their own too", async () => {
  const { sql } = database;
  const open = await openSpace("Open");
  const kept = await spaces.createSpace(sql, asMember(camille), { name: "Office only", visibility: "groups", groups: [groups.office] });
  const p = await newPage(open.id);
  const { comment } = await comments.addComment(sql, asMember(hugo), p.id, "Where is the form?");
  await pages.movePage(sql, asMember(camille), p.id, { spaceId: kept.id });
  await assert.rejects(comments.comments(sql, asMember(hugo), p.id), /not_found/u);
  await assert.rejects(comments.editComment(sql, asMember(hugo), comment.id, "Edited"), /not_found/u);
  await assert.rejects(comments.removeComment(sql, asMember(hugo), comment.id), /not_found/u);
  assert.equal((await comments.comments(sql, asMember(camille), p.id))[0]!.body, "Where is the form?");
});

test("a page in the trash has no comments for anyone", async () => {
  const { sql } = database;
  const s = await openSpace();
  const p = await newPage(s.id);
  const { comment } = await comments.addComment(sql, asMember(hugo), p.id, "Thanks!");
  await pages.deletePage(sql, asMember(ines), p.id);
  await assert.rejects(comments.comments(sql, asMember(ines), p.id), /not_found/u);
  await assert.rejects(comments.addComment(sql, asMember(ines), p.id, "Back"), /not_found/u);
  await assert.rejects(comments.editComment(sql, asMember(hugo), comment.id, "Changed"), /not_found/u);
});

test("each person edits their own comment; editors of the page remove any, with undo; readers only their own", async () => {
  const { sql } = database;
  const s = await openSpace();
  const p = await newPage(s.id);
  const { comment: mine } = await comments.addComment(sql, asMember(hugo), p.id, "Typo in the table");
  const { comment: theirs } = await comments.addComment(sql, asMember(lea), p.id, "See https://example.com/policy.");
  const edited = await comments.editComment(sql, asMember(hugo), mine.id, "Typo in the second table");
  assert.equal(edited.body, "Typo in the second table");
  assert.ok(edited.editedAt);
  // Nobody edits someone else's words, not even an editor or an admin.
  await assert.rejects(comments.editComment(sql, asMember(ines), mine.id, "Hijacked"), /forbidden/u);
  await assert.rejects(comments.editComment(sql, asMember(camille), mine.id, "Hijacked"), /forbidden/u);
  await assert.rejects(comments.editComment(sql, asMember(hugo), mine.id, " "), /empty/u);
  // A reader removes their own, not someone else's.
  await assert.rejects(comments.removeComment(sql, asMember(hugo), theirs.id), /forbidden/u);
  await comments.removeComment(sql, asMember(hugo), mine.id);
  assert.deepEqual((await comments.comments(sql, asMember(hugo), p.id)).map(c => c.id), [theirs.id]);
  await assert.rejects(comments.editComment(sql, asMember(hugo), mine.id, "Again"), /not_found/u);
  // Undo, by who removed it (or could).
  await assert.rejects(comments.restoreComment(sql, asMember(lea), mine.id), /forbidden/u);
  await comments.restoreComment(sql, asMember(hugo), mine.id);
  assert.equal((await comments.comments(sql, asMember(hugo), p.id)).length, 2);
  // An editor of the page removes a reader's comment.
  await comments.removeComment(sql, asMember(tom), theirs.id);
  await comments.restoreComment(sql, asMember(tom), theirs.id);
  await comments.removeComment(sql, asMember(tom), theirs.id);
  // Past the hour of undo, it is gone for good.
  await sql`update page_comments set removed_at = now() - interval '2 hours' where id = ${theirs.id}`;
  await assert.rejects(comments.restoreComment(sql, asMember(tom), theirs.id), /not_found/u);
  await comments.purgeRemoved(sql);
  assert.equal((await sql`select count(*)::int as n from page_comments where id = ${theirs.id}`)[0]!["n"], 0);
});

test("web addresses in a comment become links; the rest stays text", () => {
  assert.deepEqual(linkParts("Read https://example.com/a?b=1, then (http://x.org/y_(z))."), [
    { text: "Read " },
    { text: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
    { text: ", then (" },
    { text: "http://x.org/y_(z)", href: "http://x.org/y_(z)" },
    { text: ")." },
  ]);
  assert.deepEqual(linkParts("javascript:alert(1) and ftp://x and <b>bold</b>"), [{ text: "javascript:alert(1) and ftp://x and <b>bold</b>" }]);
  assert.deepEqual(linkParts("https:// nothing"), [{ text: "https:// nothing" }]);
  assert.deepEqual(linkParts(""), []);
});

test("a new comment tells the page's author, earlier commenters and watchers — once per page, never the writer", async () => {
  const { sql } = database;
  const s = await openSpace();
  const p = await newPage(s.id, ines, "Expenses");
  await watching.setWatching(sql, asMember(lea), p.id, true);
  const first = await comments.addComment(sql, asMember(hugo), p.id, "Is the limit per day?");
  assert.deepEqual((await tell.commented(sql, asMember(hugo), first.page, first.comment)).sort(), [ines.id, lea.id].sort());
  const key = `comments:${p.id}`;
  const told = itemsOf(ines.id, key);
  assert.equal(told.length, 1);
  assert.equal(told[0]!.title, "Hugo Bernard a commenté « Expenses »"); // Inès reads French
  assert.equal(told[0]!.body, "Is the limit per day?");
  assert.equal(told[0]!.path, `/chest/pages/${p.id}#comment-${first.comment.id}`);
  assert.equal(itemsOf(hugo.id, key).length, 0);
  // Inès answers: Hugo (an earlier commenter) and Léa are told; Inès is not;
  // Léa's item is replaced, not doubled.
  const second = await comments.addComment(sql, asMember(ines), p.id, "Per meal.");
  await tell.commented(sql, asMember(ines), second.page, second.comment);
  assert.equal(itemsOf(hugo.id, key).length, 1);
  assert.equal(itemsOf(hugo.id, key)[0]!.title, "Inès Moreau commented on “Expenses”");
  assert.equal(itemsOf(lea.id, key).length, 1);
  assert.equal(itemsOf(lea.id, key)[0]!.body, "Per meal.");
  assert.equal(itemsOf(ines.id, key).length, 1);
});

test("nobody is told about a page they cannot read: a watcher outside the space's groups gets nothing", async () => {
  const { sql } = database;
  const s = await openSpace("Sales corner");
  const p = await newPage(s.id, ines, "Pricing");
  await watching.setWatching(sql, asMember(lea), p.id, true);
  await comments.addComment(sql, asMember(lea), p.id, "Old prices?");
  await spaces.updateSpace(sql, asMember(ines), s.id, { visibility: "groups", groups: [groups.sales] });
  const c = await comments.addComment(sql, asMember(hugo), p.id, "Updated in March.");
  assert.deepEqual(await tell.commented(sql, asMember(hugo), c.page, c.comment), [ines.id]);
  const saved = await save(p.id, ines, "New prices.");
  assert.deepEqual(await tell.saved(sql, asMember(ines), saved), []);
  assert.equal(chest.notifications.filter(n => n.member === lea.id).length, 0);
});

async function save(pageId: string, who: typeof ines, text: string) {
  const { sql } = database;
  const p = await pages.page(sql, asMember(who), pageId);
  await editing.startEditing(sql, asMember(who), pageId);
  await editing.publish(sql, asMember(who), pageId, { title: p.title, doc: normalize(fromMarkdown(text)), baseVersion: p.version });
  return pages.page(sql, asMember(who), pageId);
}

test("watching: one switch; watchers are told when someone else saves, one item per page", async () => {
  const { sql } = database;
  const s = await openSpace();
  const p = await newPage(s.id, ines, "Wi-Fi");
  assert.equal(await watching.isWatching(sql, asMember(hugo), p.id), false);
  assert.equal(await watching.setWatching(sql, asMember(hugo), p.id, true), true);
  assert.equal(await watching.setWatching(sql, asMember(hugo), p.id, true), true);
  assert.equal(await watching.isWatching(sql, asMember(hugo), p.id), true);
  await watching.setWatching(sql, asMember(tom), p.id, true);
  await assert.rejects(watching.setWatching(sql, asMember(nora), p.id, true), /not_found/u);
  await assert.rejects(watching.setWatching(sql, asMember(hugo), p.id, "yes"), /invalid/u);
  // Tom saves: Hugo is told, Tom is not.
  const saved = await save(p.id, tom, "The code is on the fridge.");
  assert.deepEqual(await tell.saved(sql, asMember(tom), saved), [hugo.id]);
  await tell.saved(sql, asMember(tom), await save(p.id, tom, "The code changed."));
  const key = `saved:${p.id}`;
  assert.equal(itemsOf(hugo.id, key).length, 1);
  assert.equal(itemsOf(hugo.id, key)[0]!.title, "Tom Walker updated “Wi-Fi”");
  assert.equal(itemsOf(tom.id, key).length, 0);
  // Hugo stops watching: nothing more.
  assert.equal(await watching.setWatching(sql, asMember(hugo), p.id, false), false);
  chest.notifications.splice(0);
  await tell.saved(sql, asMember(ines), await save(p.id, ines, "Ask the office."));
  assert.deepEqual(chest.notifications.map(n => n.member), [tom.id]);
});

test("a page put in the trash takes back what the bell said about it; a move takes it back from those who lost it", async () => {
  const { sql } = database;
  const s = await openSpace();
  const p = await newPage(s.id, ines, "Parking");
  await watching.setWatching(sql, asMember(hugo), p.id, true);
  const c = await comments.addComment(sql, asMember(tom), p.id, "Two more spaces now.");
  await tell.commented(sql, asMember(tom), c.page, c.comment);
  assert.equal(chest.notifications.length, 2);
  const { ids } = await pages.deletePage(sql, asMember(ines), p.id);
  await tell.forget(sql, ids);
  assert.equal(chest.notifications.length, 0);
  await pages.restorePage(sql, asMember(ines), p.id);
  // Told again, then moved to a space kept to the office: Hugo (sales) and
  // Inès (sales) lose their items; Camille keeps hers.
  await watching.setWatching(sql, asMember(camille), p.id, true);
  const again = await comments.addComment(sql, asMember(tom), p.id, "And bikes.");
  await tell.commented(sql, asMember(tom), again.page, again.comment);
  assert.deepEqual(chest.notifications.map(n => n.member).sort(), [camille.id, hugo.id, ines.id].sort());
  const kept = await spaces.createSpace(sql, asMember(camille), { name: "Office", visibility: "groups", groups: [groups.office] });
  await pages.movePage(sql, asMember(camille), p.id, { spaceId: kept.id });
  await tell.moved(sql, p.id, kept.id);
  assert.deepEqual(chest.notifications.map(n => n.member), [camille.id]);
});

test("leaving stops watching; an erasure signs comments 'Former member'", async () => {
  const { sql } = database;
  const s = await openSpace();
  const p = await newPage(s.id, ines, "Onboarding");
  await watching.setWatching(sql, asMember(lea), p.id, true);
  await comments.addComment(sql, asMember(lea), p.id, "Add the badge step.");
  assert.equal(await chest.emit({ type: "access.revoked", data: { id: lea.id } }, POST), 204);
  assert.equal((await sql`select count(*)::int as n from page_watchers where member_id = ${lea.id}`)[0]!["n"], 0);
  assert.equal((await comments.comments(sql, asMember(ines), p.id))[0]!.author, lea.id);
  const erasure = "era_" + "e".repeat(26);
  assert.equal(await chest.emit({ type: "member.erased", data: { id: lea.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } }, POST), 204);
  const [c] = await comments.comments(sql, asMember(ines), p.id);
  assert.equal(c!.author, "erased");
  assert.equal(c!.body, "Add the badge step.");
  for (const table of ["page_comments", "page_watchers", "pages"]) {
    const [row] = await sql.unsafe(`select count(*)::int as n from ${table} t where row_to_json(t)::text like $1`, [`%${lea.id}%`]);
    assert.equal(row!["n"], 0, table);
  }
});

test("a comment naming someone with @ tells them on their own — once, only if they may read the page", async () => {
  const { sql } = database;
  const s = await openSpace("Mentions");
  const p = await newPage(s.id, ines, "Parking");
  const kept = await spaces.createSpace(sql, asMember(camille), { name: "Office only", visibility: "groups", groups: [groups.office] });
  const hidden = await newPage(kept.id, camille, "Pay");
  const c = await comments.addComment(sql, asMember(tom), p.id, "@Hugo Bernard can you check the bikes? cc @Léa Dubois");
  const told = await tell.commented(sql, asMember(tom), c.page, c.comment, [hugo.id, lea.id, tom.id]);
  assert.deepEqual(itemsOf(hugo.id, `mention:${p.id}`).length, 1);
  assert.equal(itemsOf(lea.id, `mention:${p.id}`)[0]?.title, "Tom Walker vous a mentionné sur « Parking »");
  assert.equal(itemsOf(tom.id, `mention:${p.id}`).length, 0); // never oneself
  // Inès, the author, gets the usual item; Hugo is not told twice.
  assert.equal(itemsOf(ines.id, `comments:${p.id}`).length, 1);
  assert.equal(itemsOf(hugo.id, `comments:${p.id}`).length, 0);
  assert.ok(told.includes(hugo.id) && told.includes(ines.id));
  // Named on a page they cannot read: nothing.
  const secret = await comments.addComment(sql, asMember(camille), hidden.id, "@Hugo Bernard");
  await tell.commented(sql, asMember(camille), secret.page, secret.comment, [hugo.id]);
  assert.equal(itemsOf(hugo.id, `mention:${hidden.id}`).length, 0);
  // The page in the trash: the mention goes too.
  const { ids } = await pages.deletePage(sql, asMember(ines), p.id);
  await tell.forget(sql, ids);
  assert.equal(itemsOf(hugo.id, `mention:${p.id}`).length, 0);
});

// The page re-reads itself only when its stamp changed (src/islands/Page.tsx,
// AutoRefresh): a comment, an edit, a lock change it; nothing else does.
test("a page's stamp changes with what its reader sees, not otherwise; the tree's branches come on demand", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(tom), { name: "Stamps " + Math.random() });
  const p = await pages.createPage(sql, asMember(tom), { spaceId: s.id, title: "Stamped" });
  const child = await pages.createPage(sql, asMember(tom), { spaceId: s.id, parentId: p.id, title: "Inside" });
  const first = await pages.pageStamp(sql, asMember(hugo), p.id);
  assert.equal(await pages.pageStamp(sql, asMember(hugo), p.id), first, "nothing changed");
  await comments.addComment(sql, asMember(lea), p.id, "A question");
  const second = await pages.pageStamp(sql, asMember(hugo), p.id);
  assert.notEqual(second, first, "a comment");
  await editing.startEditing(sql, asMember(tom), p.id);
  assert.notEqual(await pages.pageStamp(sql, asMember(hugo), p.id), second, "someone edits it");
  await assert.rejects(pages.pageStamp(sql, asMember(nora), p.id), /not_found/u);
  const nodes = await pages.tree(sql, asMember(hugo), [s.id]);
  assert.deepEqual(pages.shownTree(nodes, null).map(n => [n.title, n.more]), [["Stamped", true]], "the top, saying it holds more");
  assert.deepEqual(pages.shownTree(nodes, p.id).map(n => n.title), ["Stamped", "Inside"], "the current page's branch");
  assert.deepEqual((await pages.branchOf(sql, asMember(hugo), p.id)).map(n => [n.id, n.more]), [[child.id, false]]);
});
