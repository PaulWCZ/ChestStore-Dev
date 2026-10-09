import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { fromMarkdown } from "../src/lib/markdown.ts";
import { lines, normalize } from "../src/lib/doc.ts";
import * as editing from "../src/lib/editing.ts";
import * as history from "../src/lib/history.ts";
import * as pages from "../src/lib/pages.ts";
import * as pins from "../src/lib/pins.ts";
import { search } from "../src/lib/search.ts";
import * as spaces from "../src/lib/spaces.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, groups, hugo, ines, lea, nora, tom } from "./support/members.ts";

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

const md = (text: string) => normalize(fromMarkdown(text));

async function write(pageId: string, who = ines, title?: string, text = "Some words.") {
  const p = await pages.page(database.sql, asMember(who), pageId);
  const opened = await editing.startEditing(database.sql, asMember(who), pageId);
  assert.equal(opened.status, "editing");
  return editing.publish(database.sql, asMember(who), pageId, { title: title ?? p.title, doc: md(text), baseVersion: p.version });
}

test("spaces: editors create and change them; readers and people without a role cannot", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(ines), { name: "  Handbook  ", description: "How we work" });
  assert.equal(s.name, "Handbook");
  assert.equal(s.access, "write");
  await assert.rejects(spaces.createSpace(sql, asMember(hugo), { name: "Mine" }), /forbidden/u);
  await assert.rejects(spaces.createSpace(sql, asMember(nora), { name: "Mine" }), /forbidden/u);
  await assert.rejects(spaces.createSpace(sql, asMember(ines), { name: "   " }), /empty/u);
  await assert.rejects(spaces.createSpace(sql, asMember(ines), { name: "x".repeat(81) }), /too_long/u);
  await assert.rejects(spaces.updateSpace(sql, asMember(hugo), s.id, { name: "Hacked" }), /forbidden/u);
  const renamed = await spaces.updateSpace(sql, asMember(tom), s.id, { name: "Company handbook" });
  assert.equal(renamed.name, "Company handbook");
  assert.equal((await spaces.space(sql, asMember(hugo), s.id)).access, "read");
  await assert.rejects(spaces.space(sql, asMember(nora), s.id), /not_found/u);
  await assert.rejects(spaces.space(sql, asMember(ines), "1; drop table pages"), /not_found/u);
});

test("a space kept to a group is invisible to others, even by its pages' ids", async () => {
  const { sql } = database;
  const hr = await spaces.createSpace(sql, asMember(camille), { name: "HR", visibility: "groups", groups: [groups.office] });
  const p = await pages.createPage(sql, asMember(camille), { spaceId: hr.id, title: "Salaries 2026" });
  await write(p.id, camille, undefined, "The salary grid, confidential.");
  assert.ok(!(await spaces.listSpaces(sql, asMember(ines))).some(s => s.id === hr.id));
  await assert.rejects(pages.page(sql, asMember(ines), p.id), /not_found/u);
  await assert.rejects(pages.page(sql, asMember(lea), p.id), /not_found/u);
  assert.deepEqual(await search(sql, asMember(ines), "salary"), []);
  assert.equal((await search(sql, asMember(camille), "salary")).length, 1);
  await assert.rejects(spaces.updateSpace(sql, asMember(camille), hr.id, { visibility: "groups", groups: [] }), /invalid/u);
  await assert.rejects(spaces.updateSpace(sql, asMember(camille), hr.id, { groups: ["grp_bad"] }), /invalid/u);
  // Opened to everyone, it shows.
  await spaces.updateSpace(sql, asMember(camille), hr.id, { visibility: "everyone" });
  assert.equal((await pages.page(sql, asMember(lea), p.id)).title, "Salaries 2026");
});

test("who edits a space: every editor, or only some groups and people — the others read it", async () => {
  const { sql } = database;
  const sales = await spaces.createSpace(sql, asMember(ines), { name: "Sales desk" });
  const p = await pages.createPage(sql, asMember(tom), { spaceId: sales.id, title: "Price list" });
  // Ines keeps it to the sales group; Tom (tech) now reads it.
  const kept = await spaces.updateSpace(sql, asMember(ines), sales.id, { editing: "some", editors: [groups.sales] });
  assert.equal(kept.editing, "some");
  assert.deepEqual(kept.editors, [groups.sales]);
  assert.equal((await spaces.space(sql, asMember(tom), sales.id)).access, "read");
  await assert.rejects(pages.createPage(sql, asMember(tom), { spaceId: sales.id, title: "Mine" }), /forbidden/u);
  await assert.rejects(editing.startEditing(sql, asMember(tom), p.id), /forbidden/u);
  await assert.rejects(pages.deletePage(sql, asMember(tom), p.id), /forbidden/u);
  await assert.rejects(spaces.updateSpace(sql, asMember(tom), sales.id, { editing: "editors" }), /forbidden/u);
  assert.equal((await pages.page(sql, asMember(tom), p.id)).title, "Price list");
  assert.ok(!(await pages.trash(sql, asMember(tom))).some(x => x.id === p.id));
  // Named by person, Tom writes again; a reader named stays a reader.
  await spaces.updateSpace(sql, asMember(ines), sales.id, { editors: [groups.sales, tom.id, hugo.id] });
  assert.equal((await spaces.space(sql, asMember(tom), sales.id)).access, "write");
  assert.equal((await spaces.space(sql, asMember(hugo), sales.id)).access, "read");
  // Whoever narrows the list stays on it; the admins always write.
  const narrowed = await spaces.updateSpace(sql, asMember(tom), sales.id, { editors: [groups.sales] });
  assert.ok(narrowed.editors.includes(tom.id));
  assert.equal((await spaces.space(sql, asMember(camille), sales.id)).access, "write");
  await assert.rejects(spaces.updateSpace(sql, asMember(ines), sales.id, { editors: ["mbr_bad"] }), /invalid/u);
  // Back to every editor: the list goes.
  const open = await spaces.updateSpace(sql, asMember(ines), sales.id, { editing: "editors" });
  assert.deepEqual(open.editors, []);
  assert.equal((await spaces.space(sql, asMember(tom), sales.id)).access, "write");
});

test("pages: a tree, created, moved, never under themselves", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(ines), { name: "Tree" });
  const a = await pages.createPage(sql, asMember(ines), { spaceId: s.id, title: "A" });
  const b = await pages.createPage(sql, asMember(ines), { spaceId: s.id, title: "B" });
  const a1 = await pages.createPage(sql, asMember(ines), { spaceId: s.id, parentId: a.id, title: "A1" });
  await assert.rejects(pages.createPage(sql, asMember(hugo), { spaceId: s.id, title: "No" }), /forbidden/u);
  await assert.rejects(pages.createPage(sql, asMember(ines), { spaceId: s.id, title: "" }), /empty/u);
  // B first, then A.
  await pages.movePage(sql, asMember(ines), b.id, { spaceId: s.id, parentId: null, index: 0 });
  const top = (await pages.tree(sql, asMember(ines), [s.id])).filter(n => n.parentId === null).map(n => n.title);
  assert.deepEqual(top, ["B", "A"]);
  // A under its own child: refused.
  await assert.rejects(pages.movePage(sql, asMember(ines), a.id, { spaceId: s.id, parentId: a1.id }), /cycle/u);
  await assert.rejects(pages.movePage(sql, asMember(ines), a.id, { spaceId: s.id, parentId: a.id }), /cycle/u);
  await assert.rejects(pages.movePage(sql, asMember(hugo), a.id, { spaceId: s.id, parentId: b.id }), /forbidden/u);
  // A (with A1) to another space.
  const other = await spaces.createSpace(sql, asMember(ines), { name: "Other" });
  await pages.movePage(sql, asMember(ines), a.id, { spaceId: other.id, parentId: null });
  assert.equal((await pages.page(sql, asMember(ines), a1.id)).spaceId, other.id);
  assert.deepEqual((await pages.ancestors(sql, a1.id)).map(x => x.title), ["A"]);
  // A space with pages is not deleted; an empty one is.
  await assert.rejects(spaces.deleteSpace(sql, asMember(ines), other.id), /not_empty/u);
});

test("edit lock: one editor at a time; idle 15 minutes, another may take over; nothing is lost", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(ines), { name: "Locks" });
  const p = await pages.createPage(sql, asMember(ines), { spaceId: s.id, title: "Expenses" });
  assert.equal((await editing.startEditing(sql, asMember(ines), p.id)).status, "editing");
  await editing.saveDraft(sql, asMember(ines), p.id, { title: "Expenses", doc: md("Draft of Inès"), baseVersion: 1 });
  // Tom finds it taken, and cannot take over an active lock.
  const tomSees = await editing.startEditing(sql, asMember(tom), p.id, { takeOver: true });
  assert.equal(tomSees.status, "locked");
  assert.equal(tomSees.status === "locked" && tomSees.lock.memberId, ines.id);
  assert.equal(tomSees.status === "locked" && tomSees.lock.idle, false);
  await assert.rejects(editing.publish(sql, asMember(tom), p.id, { title: "Expenses", doc: md("Tom's"), baseVersion: 1 }), /locked/u);
  // Inès leaves it for 16 minutes: Tom takes over when he asks to.
  await sql`update page_locks set active_at = now() - interval '16 minutes' where page_id = ${p.id}`;
  const again = await editing.startEditing(sql, asMember(tom), p.id);
  assert.equal(again.status === "locked" && again.lock.idle, true);
  assert.equal((await editing.startEditing(sql, asMember(tom), p.id, { takeOver: true })).status, "editing");
  const saved = await editing.publish(sql, asMember(tom), p.id, { title: "Expenses", doc: md("Tom's version"), baseVersion: 1 });
  assert.equal(saved.version, 2);
  // Inès's draft is still hers; her next draft save says the page moved on.
  const back = await editing.startEditing(sql, asMember(ines), p.id);
  assert.equal(back.status === "editing" && back.draft?.baseVersion, 1);
  assert.equal(back.status === "editing" && back.version, 2);
  // She saves anyway: Tom's version stays in the history, and she is told.
  const hers = await editing.publish(sql, asMember(ines), p.id, { title: "Expenses", doc: md("Draft of Inès"), baseVersion: 1 });
  assert.equal(hers.replaced, tom.id);
  assert.deepEqual((await history.versions(sql, asMember(hugo), p.id)).map(v => v.author), [ines.id, tom.id, ines.id]);
  // Readers never edit.
  await assert.rejects(editing.startEditing(sql, asMember(hugo), p.id), /forbidden/u);
  await assert.rejects(editing.saveDraft(sql, asMember(hugo), p.id, { title: "x", doc: md("x"), baseVersion: 1 }), /forbidden/u);
});

test("saving nothing new writes no version; stopping gives the lock back and drops the draft", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(tom), { name: "Quiet" });
  const p = await pages.createPage(sql, asMember(tom), { spaceId: s.id, title: "Same" });
  await write(p.id, tom, "Same", "One line.");
  const same = await write(p.id, tom, "Same", "One line.");
  assert.equal(same.changed, false);
  assert.equal(same.version, 2);
  await editing.startEditing(sql, asMember(tom), p.id);
  await editing.saveDraft(sql, asMember(tom), p.id, { title: "Same", doc: md("Unsaved"), baseVersion: 2 });
  assert.equal((await editing.myDrafts(sql, asMember(tom))).length, 1);
  await editing.stopEditing(sql, asMember(tom), p.id);
  assert.equal(await editing.lockOf(sql, p.id), null);
  assert.equal((await editing.myDrafts(sql, asMember(tom))).length, 0);
  await assert.rejects(editing.publish(sql, asMember(tom), p.id, { title: "", doc: md("x"), baseVersion: 2 }), /empty/u);
  await assert.rejects(editing.publish(sql, asMember(tom), p.id, { title: "t", doc: { type: "nope" }, baseVersion: 2 }), /invalid/u);
});

test("an editor who leaves without saying so frees the page: at once by the leaving tab, or after two minutes unheard", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(ines), { name: "Leaving" });
  const p = await pages.createPage(sql, asMember(ines), { spaceId: s.id, title: "Parking" });
  // Tom opens the editor, types, and closes the tab: the beacon keeps his words and frees the page.
  assert.equal((await editing.startEditing(sql, asMember(tom), p.id)).status, "editing");
  assert.equal((await editing.startEditing(sql, asMember(ines), p.id)).status, "locked");
  await editing.leave(sql, asMember(tom), p.id, { title: "Parking", doc: JSON.stringify(md("Six spaces.")), baseVersion: 1 });
  assert.equal(await editing.lockOf(sql, p.id), null);
  const back = await editing.startEditing(sql, asMember(tom), p.id);
  assert.ok(back.status === "editing" && back.draft !== null && lines(back.draft.doc).join(" ").includes("Six spaces."));
  // His editor says it is open: the lock stays his, even without typing.
  await sql`update page_locks set seen_at = now() - interval '90 seconds', active_at = now() - interval '10 minutes' where page_id = ${p.id}`;
  assert.deepEqual(await editing.heartbeat(sql, asMember(tom), p.id), { lock: null, held: true });
  assert.equal((await editing.startEditing(sql, asMember(ines), p.id)).status, "locked");
  // His laptop shuts: unheard of for two minutes, the page is free — no "take over" needed.
  await sql`update page_locks set seen_at = now() - interval '3 minutes' where page_id = ${p.id}`;
  assert.equal(await editing.lockOf(sql, p.id), null);
  assert.equal((await editing.startEditing(sql, asMember(ines), p.id)).status, "editing");
  // Tom's editor wakes up: it learns who has the page now; his draft stays his.
  const woke = await editing.heartbeat(sql, asMember(tom), p.id);
  assert.equal(woke.lock?.memberId, ines.id);
  assert.equal((await sql`select 1 from drafts where page_id = ${p.id} and member_id = ${tom.id}`).length, 1);
  // Ines saves without being refused by Tom's old lock; readers cannot touch locks.
  await editing.publish(sql, asMember(ines), p.id, { title: "Parking", doc: md("Four spaces."), baseVersion: 1 });
  await assert.rejects(editing.leave(sql, asMember(hugo), p.id), /forbidden/u);
  await assert.rejects(editing.heartbeat(sql, asMember(hugo), p.id), /forbidden/u);
  // After Ines's save the page is free: a heartbeat or a draft of hers on
  // its way never takes the lock back (only opening the editor does).
  assert.equal(await editing.lockOf(sql, p.id), null);
  assert.deepEqual(await editing.heartbeat(sql, asMember(ines), p.id), { lock: null, held: false });
  assert.deepEqual(await editing.saveDraft(sql, asMember(ines), p.id, { title: "Parking", doc: md("Late."), baseVersion: 2 }), { lock: null, held: false });
  assert.equal(await editing.lockOf(sql, p.id), null, "still free: Camille may edit it");
  await sql`delete from drafts where page_id = ${p.id} and member_id = ${ines.id}`;
  // From the page, Tom drops his old draft, and Undo puts it back.
  const dropped = await editing.discardDraft(sql, asMember(tom), p.id);
  assert.ok(dropped && lines(dropped.doc).join(" ").includes("Six spaces."));
  assert.equal((await sql`select 1 from drafts where page_id = ${p.id} and member_id = ${tom.id}`).length, 0);
  await editing.keepDraft(sql, asMember(tom), p.id, { title: dropped.title, doc: JSON.stringify(dropped.doc), baseVersion: dropped.baseVersion });
  assert.equal((await sql`select 1 from drafts where page_id = ${p.id} and member_id = ${tom.id}`).length, 1);
  assert.equal(await editing.discardDraft(sql, asMember(ines), p.id), null);
});

test("history: each save a version; compare in words; restore is a new version", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(ines), { name: "History" });
  const p = await pages.createPage(sql, asMember(ines), { spaceId: s.id, title: "Holidays" });
  await write(p.id, ines, "Holidays", "You have 25 days a year.\n\nAsk your manager.");
  await write(p.id, tom, "Holiday policy", "You have 27 days a year.\n\nAsk your manager.\n\nPlan ahead.");
  const d = await history.diff(sql, asMember(hugo), p.id, 3);
  assert.deepEqual(d.titleChanged, { from: "Holidays", to: "Holiday policy" });
  const changed = d.rows.find(r => r.kind === "changed");
  assert.ok(changed && changed.kind === "changed" && changed.parts.some(x => x.change === "removed" && x.text === "25") && changed.parts.some(x => x.change === "added" && x.text === "27"));
  assert.ok(d.rows.some(r => r.kind === "added" && r.text === "Plan ahead."));
  await assert.rejects(history.restore(sql, asMember(hugo), p.id, 2), /forbidden/u);
  const r = await history.restore(sql, asMember(ines), p.id, 2);
  assert.equal(r.version, 4);
  const now = await pages.page(sql, asMember(hugo), p.id);
  assert.equal(now.title, "Holidays");
  const [latest] = await history.versions(sql, asMember(hugo), p.id);
  assert.equal(latest?.kind, "restored");
  assert.equal(latest?.restoredFrom, 2);
  await assert.rejects(history.version(sql, asMember(hugo), p.id, 99), /not_found/u);
  await assert.rejects(history.version(sql, asMember(hugo), p.id, "1 or 1=1"), /not_found/u);
});

test("compare folds long unchanged runs", () => {
  const before = Array.from({ length: 20 }, (_, i) => `line ${i}`);
  const after = [...before];
  after[10] = "line ten, changed";
  const rows = history.compare(before, after);
  assert.deepEqual(rows.map(r => r.kind), ["fold", "same", "changed", "same", "fold"]);
});

test("search: titles and words, accents and case aside, by the start of words, with the passage", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(ines), { name: "Search" });
  const p = await pages.createPage(sql, asMember(ines), { spaceId: s.id, title: "Congés payés" });
  await write(p.id, ines, "Congés payés", "Chaque salarié a droit à cinq semaines de congés. Les demandes d'été se font avant le 1er avril.");
  const q = await pages.createPage(sql, asMember(ines), { spaceId: s.id, title: "Expense policy" });
  await write(q.id, ines, "Expense policy", "Keep every receipt. Travel by train when you can.");
  const hits = await search(sql, asMember(hugo), "conges ete");
  assert.equal(hits[0]?.id, p.id);
  assert.ok(hits[0]!.snippet.some(x => x.hit && /été/iu.test(x.text)));
  assert.ok(hits[0]!.title.some(x => x.hit && x.text === "Congés"));
  assert.equal((await search(sql, asMember(hugo), "recei"))[0]?.id, q.id);
  assert.equal((await search(sql, asMember(hugo), "Expens polcy"))[0]?.id, q.id);
  assert.deepEqual(await search(sql, asMember(hugo), "'; drop table pages; --"), []);
  assert.deepEqual(await search(sql, asMember(hugo), "   "), []);
  assert.deepEqual(await search(sql, asMember(nora), "receipt"), []);
});

test("links between pages survive renames and show who links here; a gone page reads as gone", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(ines), { name: "Links" });
  const target = await pages.createPage(sql, asMember(ines), { spaceId: s.id, title: "Old name" });
  const from = await pages.createPage(sql, asMember(ines), { spaceId: s.id, title: "Index" });
  const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "See " }, { type: "pageRef", attrs: { id: target.id } }] }] };
  await editing.startEditing(sql, asMember(ines), from.id);
  await editing.publish(sql, asMember(ines), from.id, { title: "Index", doc, baseVersion: 1 });
  await write(target.id, ines, "New name", "Renamed.");
  const read = await pages.page(sql, asMember(hugo), from.id);
  assert.deepEqual([...(await pages.titles(sql, asMember(hugo), read.doc))], [[target.id, "New name"]]);
  assert.deepEqual(await pages.backlinks(sql, asMember(hugo), target.id), [{ id: from.id, title: "Index" }]);
  // The history's comparison names the linked page, not a blank.
  assert.ok(JSON.stringify((await history.diff(sql, asMember(hugo), from.id, 2)).rows).includes("See New name"));
  // The page's words name the linked page (as it was called when saved), so search finds it by it.
  assert.ok((await search(sql, asMember(hugo), "see old")).some(h => h.id === from.id));
  await pages.deletePage(sql, asMember(ines), target.id);
  assert.deepEqual([...(await pages.titles(sql, asMember(hugo), read.doc))], []);
});

test("trash: a page and its subpages go, come back with undo, or are deleted for good", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(ines), { name: "Trash" });
  const parent = await pages.createPage(sql, asMember(ines), { spaceId: s.id, title: "Parent" });
  const child = await pages.createPage(sql, asMember(ines), { spaceId: s.id, parentId: parent.id, title: "Child" });
  await assert.rejects(pages.deletePage(sql, asMember(hugo), parent.id), /forbidden/u);
  assert.equal((await pages.deletePage(sql, asMember(ines), parent.id)).pages, 2);
  await assert.rejects(pages.page(sql, asMember(hugo), child.id), /not_found/u);
  assert.deepEqual((await pages.trash(sql, asMember(ines))).filter(t => t.spaceName === "Trash").map(t => [t.title, t.below]), [["Parent", 1]]);
  assert.deepEqual(await pages.trash(sql, asMember(hugo)), []);
  await pages.restorePage(sql, asMember(ines), parent.id);
  assert.equal((await pages.page(sql, asMember(hugo), child.id)).parentId, parent.id);
  // The child alone: back at the top when its parent is still in the trash.
  await pages.deletePage(sql, asMember(ines), child.id);
  await pages.deletePage(sql, asMember(ines), parent.id);
  await pages.restorePage(sql, asMember(ines), child.id);
  assert.equal((await pages.page(sql, asMember(ines), child.id)).parentId, null);
  await assert.rejects(pages.purgePage(sql, asMember(ines), child.id), /invalid/u); // not in the trash
  await pages.purgePage(sql, asMember(ines), parent.id);
  await assert.rejects(pages.page(sql, asMember(ines), parent.id, "read", { deleted: true }), /not_found/u);
  assert.equal((await sql`select count(*)::int as n from page_versions where page_id = ${parent.id}`)[0]!["n"], 0);
});

test("recently updated: newest first, only what the reader sees", async () => {
  const { sql } = database;
  const list = await pages.recent(sql, asMember(hugo), { limit: 50 });
  assert.ok(list.length > 0);
  assert.ok(list.every((p, i) => i === 0 || list[i - 1]!.updatedAt >= p.updatedAt));
  assert.deepEqual(await pages.recent(sql, asMember(nora)), []);
});

test("the example handbook: a space and linked pages in the editor's language", async () => {
  const { sql } = database;
  const { addExample } = await import("../src/lib/starter.ts");
  const { catalogue } = await import("../src/i18n/index.ts");
  await assert.rejects(addExample(sql, asMember(hugo), catalogue("en")), /forbidden/u);
  const made = await addExample(sql, asMember(camille), catalogue("fr"));
  const first = await pages.page(sql, asMember(hugo), made.pageId);
  assert.equal(first.title, "Bienvenue");
  assert.equal(first.space.name, "Livret d’accueil");
  assert.equal((await pages.tree(sql, asMember(hugo), [made.spaceId])).length, 5);
  assert.equal((await pages.titles(sql, asMember(hugo), first.doc)).size, 2);
});

test("pinned pages: editors pin a few to the home page; readers see those they may read", async () => {
  const { sql } = database;
  const open = await spaces.createSpace(sql, asMember(ines), { name: "Pins" });
  const hr = await spaces.createSpace(sql, asMember(camille), { name: "Pins HR", visibility: "groups", groups: [groups.office] });
  const a = await pages.createPage(sql, asMember(ines), { spaceId: open.id, title: "Holidays" });
  const b = await pages.createPage(sql, asMember(camille), { spaceId: hr.id, title: "Pay days" });
  await assert.rejects(pins.setPinned(sql, asMember(hugo), a.id, true), /forbidden/u);
  assert.equal(await pins.setPinned(sql, asMember(ines), a.id, true), true);
  assert.equal(await pins.setPinned(sql, asMember(camille), b.id, true), true);
  assert.deepEqual((await pins.pinned(sql, asMember(hugo))).map(p => p.title), ["Holidays"]);
  assert.deepEqual((await pins.pinned(sql, asMember(camille))).map(p => p.title), ["Holidays", "Pay days"]);
  await pages.deletePage(sql, asMember(ines), a.id);
  assert.deepEqual((await pins.pinned(sql, asMember(hugo))).map(p => p.title), []);
  assert.equal(await pins.setPinned(sql, asMember(camille), b.id, false), false);
  assert.equal(await pins.isPinned(sql, b.id), false);
});
