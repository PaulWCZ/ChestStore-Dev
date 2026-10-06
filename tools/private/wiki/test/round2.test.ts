import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import * as members from "@argentic/chest-sdk/members";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as comments from "../src/lib/comments.ts";
import { forgetGroups, companyGroups } from "../src/lib/groups.ts";
import { confluenceDate } from "../src/lib/html.ts";
import { en } from "../src/i18n/en.ts";
import { importFiles } from "../src/lib/importer.ts";
import * as pages from "../src/lib/pages.ts";
import * as reads from "../src/lib/reads.ts";
import * as reviews from "../src/lib/reviews.ts";
import { search, stopWords, units, words } from "../src/lib/search.ts";
import * as spaces from "../src/lib/spaces.ts";
import { deleteSynonyms, listSynonyms, parseTerms, saveSynonyms, synonymTerms } from "../src/lib/synonyms.ts";
import * as tell from "../src/lib/tell.ts";
import { writeZip } from "../src/lib/zip.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, groups, hugo, ines, lea, tom } from "./support/members.ts";

// The second severe critique: read-and-acknowledged and review reminders
// by email; every group of the Chest; French search without noise and with
// words that mean the same; replies, resolve and comments on a passage; a
// deleted comment leaves the bell; Confluence pages keep their date.

let database: TestDatabase;
let chest: FakeChest;
const warehouse = "grp_warehouse" + "a".repeat(17);
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({
    network: {},
    members: everyone.map(p => ({ ...p, email: p.firstName.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "") + "@lumen.test", ...(p.id === hugo.id ? { groups: [...p.groups, warehouse] } : {}) })),
    capabilities: ["members", "files", "notifications", "mail", "groups"],
    mail: { domain: "lumen.test" },
    // The runs below are read on the Chest's clock (SDK 0.4: a run has no
    // zone of its own).
    chest: { timeZone: "Europe/Paris", publicUrl: null },
    groups: [
      { id: groups.office, name: "Office", members: [camille.id] },
      { id: groups.sales, name: "Sales", members: [ines.id, hugo.id] },
      { id: groups.tech, name: "Tech", members: [tom.id, lea.id] },
      // A group that does not give the wiki: only seen with "groups".
      { id: warehouse, name: "Warehouse", members: [hugo.id], grants: false },
    ],
  });
  await database.sql.unsafe(readFileSync(join(import.meta.dirname, "..", "seed", "sample.sql"), "utf8")).simple();
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(() => {
  chest.notifications.splice(0);
  chest.outbox.length = 0;
  members.forget();
  forgetGroups();
});

const titles = async (q: string) => (await search(database.sql, asMember(hugo), q)).map(h => h.title.map(s => s.text).join(""));

test("French search: little words never count; 'note de frais' puts the Expense policy first", async () => {
  const found = await titles("note de frais");
  // Round 3 added the French "Se faire rembourser ses frais" to the sample,
  // which holds "note de frais" as typed: the two expense pages come first.
  assert.deepEqual(found.slice(0, 2).sort(), ["Expense policy", "Se faire rembourser ses frais"], found.join(", "));
  // Not every page holding "de".
  assert.ok(!found.includes("Préparer un rendez-vous client"), found.join(", "));
  assert.ok(found.length <= 6, found.join(", "));
  const wifi = await titles("mot de passe wifi");
  assert.equal(wifi[0], "Wi-Fi and printers");
  assert.ok(wifi.length <= 6, wifi.join(", "));
  // A query of little words only still searches them.
  assert.equal(units(words("de la"), []).length, 2);
  assert.deepEqual(units(words("la charte du télétravail"), []).map(u => ("parts" in u ? u.parts.join("") : "")), ["charte", "télétravail"]);
  assert.ok(stopWords.has("the") && stopWords.has("de") && !stopWords.has("tt"));
});

test("words that mean the same: vacances → congés/holidays, tt → télétravail, remboursement → notes de frais", async () => {
  assert.equal((await titles("vacances"))[0], "Holidays and time off");
  assert.equal((await titles("tt"))[0], "Charte télétravail");
  // The two expense pages first (the French one holds the word as typed).
  for (const q of ["remboursement", "frais"]) assert.deepEqual((await titles(q)).slice(0, 2).sort(), ["Expense policy", "Se faire rembourser ses frais"], q);
  // Several words of one term are one word of the query ("notes de frais").
  const terms = await synonymTerms(database.sql);
  const u = units(words("notes de frais wifi"), terms);
  assert.equal(u.length, 2);
  assert.ok("synonyms" in u[0]!);
});

test("editors keep the synonyms: add, change, delete (and back); readers cannot", async () => {
  const { sql } = database;
  await assert.rejects(listSynonyms(sql, asMember(hugo)), /forbidden/u);
  await assert.rejects(saveSynonyms(sql, asMember(hugo), null, "a, b"), /forbidden/u);
  assert.ok((await listSynonyms(sql, asMember(ines))).length >= 30, "about thirty to start");
  assert.deepEqual(parseTerms("  Plante, plantes ;plante\nverdure "), ["Plante", "plantes", "verdure"]);
  await assert.rejects(saveSynonyms(sql, asMember(ines), null, "seul"), /synonyms_few/u);
  const made = await saveSynonyms(sql, asMember(ines), null, "plante verte, ficus");
  assert.deepEqual(made.words, ["plante verte", "ficus"]);
  const changed = await saveSynonyms(sql, asMember(ines), made.id, "plante verte, ficus, monstera");
  assert.equal(changed.words.length, 3);
  assert.deepEqual(await deleteSynonyms(sql, asMember(ines), made.id), ["plante verte", "ficus", "monstera"]);
  await assert.rejects(deleteSynonyms(sql, asMember(ines), made.id), /not_found/u);
});

test("every group of the Chest, with the groups permission: one that does not give the wiki too", async () => {
  const names = (await companyGroups()).map(g => g.name);
  assert.deepEqual(names, ["Office", "Sales", "Tech", "Warehouse"]);
  // Hugo is asked to confirm through a group that does not give the wiki.
  const s = await spaces.createSpace(database.sql, asMember(camille), { name: "Warehouse rules" });
  const p = await pages.createPage(database.sql, asMember(camille), { spaceId: s.id, title: "Forklift safety" });
  const page = await reads.ask(database.sql, asMember(camille), p.id, { groups: [warehouse] });
  const state = await reads.readState(database.sql, asMember(camille), p.id);
  assert.equal(await tell.readAsked(asMember(camille), page, state.asked!), 1);
  assert.deepEqual(chest.notifications.map(n => n.member), [hugo.id]);
});

test("asked to confirm: by email too, in each one's language; reminders go to those who have not, by email", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(camille), { name: "Rules " + Math.random() });
  const p = await pages.createPage(sql, asMember(camille), { spaceId: s.id, title: "Règlement intérieur 2026" });
  const page = await reads.ask(sql, asMember(camille), p.id, {});
  const state = await reads.readState(sql, asMember(camille), p.id);
  assert.equal(await tell.readAsked(asMember(camille), page, state.asked!), 4);
  // Inès, Tom, Hugo, Léa: one email each, nobody sees the others.
  assert.equal(chest.outbox.length, 4);
  assert.ok(chest.outbox.every(m => m.to.length === 1));
  const toLea = chest.outbox.find(m => m.to[0] === "lea@lumen.test")!;
  assert.match(toLea.subject, /Camille Martin vous demande de lire/u);
  assert.match(toLea.text, /confirmer/u);
  assert.match(chest.outbox.find(m => m.to[0] === "hugo@lumen.test")!.subject, /asks you to read/u);
  // Hugo confirms; a reminder goes to the three others only.
  await reads.confirm(sql, asMember(hugo), p.id);
  chest.outbox.length = 0;
  const asked = (await reads.readState(sql, asMember(camille), p.id)).asked!;
  assert.equal(await tell.remindReaders(sql, page, asked, "2026-10-01"), 3);
  assert.deepEqual(chest.outbox.map(m => m.to[0]).sort(), ["ines@lumen.test", "lea@lumen.test", "tom@lumen.test"]);
  assert.match(chest.outbox.find(m => m.to[0] === "tom@lumen.test")!.subject, /^Reminder: please read/u);
  // The same day again: the Chest's key sends nothing twice.
  await tell.remindReaders(sql, page, asked, "2026-10-01");
  assert.equal(chest.outbox.length, 3);
  // The morning schedule reminds a week after the ask, twice at most.
  chest.outbox.length = 0;
  await sql`update pages set read_asked_at = now() - interval '8 days', read_reminded_at = null, read_reminders = 0 where id = ${p.id}`;
  const run = await tell.reviews(sql, { id: "run_" + "a".repeat(26), name: "reviews", scheduledAt: "2026-10-09T05:40:00Z", attempt: 1 });
  assert.ok(run.reminded >= 3);
  assert.equal(chest.outbox.filter(m => m.subject.includes("Règlement intérieur 2026")).length, 3);
  const again = await tell.reviews(sql, { id: "run_" + "b".repeat(26), name: "reviews", scheduledAt: "2026-10-10T05:40:00Z", attempt: 1 });
  assert.equal(again.reminded, 0, "not again the next day");
});

test("a page due for its check: its owner is told by email too", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(tom), { name: "Checks " + Math.random() });
  const p = await pages.createPage(sql, asMember(tom), { spaceId: s.id, title: "Fire drill" });
  await reviews.setReview(sql, asMember(tom), p.id, 3);
  await sql`update pages set reviewed_at = now() - interval '4 months' where id = ${p.id}`;
  await tell.reviews(sql);
  const letter = chest.outbox.find(m => m.to[0] === "tom@lumen.test" && /Fire drill/u.test(m.subject));
  assert.ok(letter, chest.outbox.map(m => m.subject).join(" | "));
  assert.match(letter.text, /Review reminder/u);
});

test("replies, resolve, a comment on a passage; a deleted comment leaves the bell at once", async () => {
  const { sql } = database;
  const top = await comments.addComment(sql, asMember(hugo), "8", "Is this still true?", { quote: "   la politique\n  de sécurité " });
  assert.equal(top.comment.quote, "la politique de sécurité");
  const answer = await comments.addComment(sql, asMember(ines), "8", "Yes, checked in June.", { parentId: top.comment.id });
  assert.equal(answer.comment.parentId, top.comment.id);
  assert.deepEqual(answer.thread, [hugo.id]);
  // A reply to a reply joins the same conversation; a quote on a reply is ignored.
  const more = await comments.addComment(sql, asMember(hugo), "8", "Thanks", { parentId: answer.comment.id, quote: "x" });
  assert.equal(more.comment.parentId, top.comment.id);
  assert.equal(more.comment.quote, null);
  // Resolved by its author or an editor, not by another reader.
  await assert.rejects(comments.resolveComment(sql, asMember(lea), top.comment.id, true), /forbidden/u);
  await assert.rejects(comments.resolveComment(sql, asMember(ines), answer.comment.id, true), /invalid/u);
  const done = await comments.resolveComment(sql, asMember(ines), top.comment.id, true);
  assert.equal(done.resolvedBy, ines.id);
  // A new reply opens it again.
  await comments.addComment(sql, asMember(lea), "8", "One more question", { parentId: top.comment.id });
  assert.equal((await comments.comments(sql, asMember(hugo), "8")).find(c => c.id === top.comment.id)?.resolvedAt, null);
  // Removing the top hides its replies.
  await comments.removeComment(sql, asMember(hugo), top.comment.id);
  assert.ok(!(await comments.comments(sql, asMember(hugo), "8")).some(c => c.parentId === top.comment.id));
  await comments.restoreComment(sql, asMember(hugo), top.comment.id);

  // SECRETX: the words of a deleted comment leave every bell.
  const page = await pages.page(sql, asMember(camille), "8");
  const said = await comments.addComment(sql, asMember(tom), "8", "@Camille Martin door code 4321 SECRETX");
  await tell.commented(sql, asMember(tom), page, said.comment, [camille.id]);
  assert.ok(chest.notifications.some(n => (n.body ?? "").includes("SECRETX")));
  const gone = await comments.removeComment(sql, asMember(tom), said.comment.id);
  await tell.commentGone(sql, gone.id);
  assert.ok(!chest.notifications.some(n => (n.body ?? "").includes("SECRETX")));
  // Undo: back in the bell.
  await comments.restoreComment(sql, asMember(tom), said.comment.id);
  await tell.commentShown(sql, said.comment.id, page);
  assert.ok(chest.notifications.some(n => (n.body ?? "").includes("SECRETX")));
});

test("a Confluence export keeps each page's date; imports stay out of Recently updated", async () => {
  assert.equal(confluenceDate("Created by Camille Martin, last modified on Sep 02, 2026", new Date("2026-09-29"))?.toISOString().slice(0, 10), "2026-09-02");
  assert.equal(confluenceDate("Créé par Inès, dernière modification le 14 janv. 2025")?.toISOString().slice(0, 10), "2025-01-14");
  assert.equal(confluenceDate("Created by Tom on 2024-03-10, last modified by Léa on 2025-06-30")?.toISOString().slice(0, 10), "2025-06-30");
  assert.equal(confluenceDate("last modified on Feb 30, 2026"), null);
  assert.equal(confluenceDate("last modified on Sep 02, 2099", new Date("2026-09-29")), null);
  const { sql } = database;
  const root = join(import.meta.dirname, "fixtures", "confluence");
  const { readdirSync, statSync } = await import("node:fs");
  const { relative } = await import("node:path");
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
  const data = writeZip(walk(root).map(f => ({ name: relative(root, f), data: readFileSync(f) })));
  const done = await importFiles(sql, asMember(ines), { spaceName: "Imported handbook", files: [{ name: "export.html.zip", data }], words: { untitled: "Untitled", attachments: "Attachments" } });
  const [holidays] = await sql<{ id: string; updated_at: Date }[]>`select id, updated_at from pages where space_id = ${done.spaceId} and title = 'Holidays and time off'`;
  assert.equal(holidays!.updated_at.toISOString().slice(0, 10), "2026-09-02");
  const [version] = await sql<{ created_at: Date; kind: string }[]>`select created_at, kind from page_versions where page_id = ${holidays!.id}`;
  assert.deepEqual([version!.created_at.toISOString().slice(0, 10), version!.kind], ["2026-09-02", "imported"]);
  const home = await pages.recent(sql, asMember(ines), { limit: 50, withoutImports: true });
  assert.ok(!home.some(p => p.spaceId === done.spaceId), "none of the import on the home page");
  assert.ok((await pages.recent(sql, asMember(ines), { spaceId: done.spaceId, limit: 50 })).length > 0, "its space lists them");
  void en;
});
