import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, shownTo, type FakeChest } from "@argentic/chest-sdk/testing";
import type { Run } from "@argentic/chest-sdk/schedules";
import * as boards from "../src/lib/boards.ts";
import * as cards from "../src/lib/cards.ts";
import { chestToday } from "../src/lib/clock.ts";
import { AppError } from "@argentic/chest-app";
import { boardCsv, everything } from "../src/lib/export.ts";
import { en } from "../src/i18n/en.ts";
import { fromCsv, fromTrello, importBoard, importedCounts, previewPeople } from "../src/lib/importers.ts";
import { leave } from "../src/lib/lifecycle.ts";
import { morning } from "../src/lib/morning.ts";
import { addDays } from "../src/shared/repeat.ts";
import * as tell from "../src/lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, groups, hugo, ines, lea, nora } from "./support/members.ts";

// What the severe critique asked for: private boards shared at creation,
// columns archived with their cards (moved or kept, found by search),
// cards moved or copied to another board, steps given to people with a
// date (subtasks), a board's own fields, start dates and due times,
// comments removed with Undo, every notice in each one's language, imports private by
// default with a check of the people, one export of everything.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone.map(p => ({ ...p, email: p.firstName.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "") + "@atelier.test" })), capabilities: ["members", "files", "notifications"] });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`delete from boards`;
  await database.sql`delete from reminders`;
  chest.outbox.length = 0;
  chest.notifications.length = 0;
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
async function setup(name = "Trade show", visibility: "team" | "private" = "team", by = hugo) {
  const b = await boards.createBoard(database.sql, asMember(by), { name, visibility }, en.templates.columns);
  const [todo, doing, done] = await boards.columns(database.sql, b.id);
  return { b, todo: todo!, doing: doing!, done: done! };
}

test("a private board is shared at creation with the people and groups chosen; people without Tasks are left out", async () => {
  const { sql } = database;
  const b = await boards.createBoard(sql, asMember(hugo), { name: "Salaries", visibility: "private", people: [ines.id, nora.id, hugo.id], groups: [groups.office] }, en.templates.columns);
  assert.equal(b.visibility, "private");
  assert.deepEqual(b.people.map(p => [p.memberId, p.owner]).sort(), [[hugo.id, true], [ines.id, false]].sort());
  assert.deepEqual(b.groups, [groups.office]);
  // Inès sees it; Léa too, through her group.
  await boards.board(sql, asMember(ines), b.id);
  await boards.board(sql, asMember(lea), b.id);
  // A team board ignores a list of people.
  const team = await boards.createBoard(sql, asMember(hugo), { name: "Open", visibility: "team", people: [ines.id] }, en.templates.columns);
  assert.deepEqual(team.people.map(p => p.memberId), [hugo.id]);
  await assert.rejects(boards.createBoard(sql, asMember(hugo), { name: "Bad", visibility: "private", groups: ["nope"] }, en.templates.columns), refused("invalid"));
});

test("archiving a column moves its cards first, or keeps them with it; search with the archive finds them", async () => {
  const { sql } = database;
  const { b, todo, doing, done } = await setup();
  const one = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Post on LinkedIn");
  await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Book the stand");
  // Kept with the column: hidden, found again with the archive.
  assert.deepEqual(await boards.archiveColumn(sql, asMember(hugo), todo.id, true), { cards: 2, moved: 0 });
  assert.equal((await cards.boardCards(sql, b.id)).length, 0);
  assert.equal((await cards.searchCards(sql, asMember(ines), "LinkedIn")).length, 0);
  const found = await cards.searchCards(sql, asMember(ines), "LinkedIn", { archived: true });
  assert.deepEqual(found.map(f => [f.id, f.archived]), [[one.id, true]]);
  await boards.archiveColumn(sql, asMember(hugo), todo.id, false);
  // Moved: to "Done", they are completed; the history says so.
  assert.deepEqual(await boards.archiveColumn(sql, asMember(hugo), todo.id, true, { to: done.id }), { cards: 2, moved: 2 });
  const after = await cards.boardCards(sql, b.id);
  assert.deepEqual(after.map(c => [c.columnId, c.done]), [[done.id, true], [done.id, true]]);
  assert.equal((await cards.cardDetail(sql, asMember(hugo), one.id)).history[0]?.kind, "completed");
  await assert.rejects(boards.archiveColumn(sql, asMember(hugo), doing.id, true, { to: todo.id }), refused("not_found"));
  await assert.rejects(boards.archiveColumn(sql, asMember(lea), doing.id, true), refused("forbidden"));
});

test("search reads comments, checklists and labels too", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Supplier");
  await cards.addComment(sql, asMember(ines), c.id, "Their phone: 04 78 12 34 56");
  await cards.addItem(sql, asMember(hugo), c.id, "Ask for the brochure");
  const l = await boards.addLabel(sql, asMember(hugo), b.id, { name: "Catering", color: "sun" });
  await cards.setLabel(sql, asMember(hugo), c.id, l.id, true);
  for (const q of ["04 78 12", "brochure", "catering"]) assert.deepEqual((await cards.searchCards(sql, asMember(lea), q)).map(x => x.id), [c.id], q);
});

test("a card moves to another board with its comments and checklist; labels follow by name; people who cannot see it are taken off", async () => {
  const { sql } = database;
  const from = await setup("Triage");
  const to = await setup("HR", "private");
  await boards.setPeople(sql, asMember(hugo), to.b.id, { people: [hugo.id, ines.id], owners: [hugo.id], groups: [] });
  const c = await cards.addCard(sql, asMember(hugo), from.b.id, from.todo.id, "New laptop for Léa");
  const urgent = await boards.addLabel(sql, asMember(hugo), from.b.id, { name: "Urgent", color: "tomato" });
  await boards.addLabel(sql, asMember(hugo), to.b.id, { name: "urgent", color: "sky" });
  await cards.setLabel(sql, asMember(hugo), c.id, urgent.id, true);
  await cards.setAssignees(sql, asMember(hugo), c.id, [ines.id, camille.id]);
  await cards.addComment(sql, asMember(ines), c.id, "Ordered");
  const step = await cards.addItem(sql, asMember(hugo), c.id, "Install");
  // A viewer may not; a board one cannot write to is refused.
  await assert.rejects(cards.moveToBoard(sql, asMember(lea), c.id, to.b.id, to.todo.id), refused("forbidden"));
  const moved = await cards.moveToBoard(sql, asMember(hugo), c.id, to.b.id, to.doing.id);
  // Camille is a manager: she sees every board and stays.
  assert.deepEqual(moved.dropped, []);
  const d = await cards.cardDetail(sql, asMember(hugo), c.id);
  assert.equal(d.boardId, to.b.id);
  assert.equal(d.columnId, to.doing.id);
  assert.deepEqual(d.labels, [(await boards.labels(sql, to.b.id))[0]!.id]);
  assert.equal(d.thread.length, 1);
  assert.deepEqual(d.items.map(i => i.id), [step.id]);
  assert.equal(d.history[0]?.kind, "moved_board");
  assert.deepEqual(d.history[0]?.data, { from: "Triage", to: "HR" });
  // Back to a team board, then to a private one Inès does not see: she is taken off.
  const secret = await setup("Secret", "private");
  await cards.moveToBoard(sql, asMember(hugo), c.id, from.b.id, from.todo.id);
  const again = await cards.moveToBoard(sql, asMember(hugo), c.id, secret.b.id, secret.todo.id);
  assert.deepEqual(again.dropped, [ines.id]);
  assert.deepEqual((await cards.cardDetail(sql, asMember(hugo), c.id)).assignees, [camille.id]);
  // Ines no longer sees the card at all.
  await assert.rejects(cards.cardDetail(sql, asMember(ines), c.id), refused("not_found"));
});

test("a card is copied, here or elsewhere: title, dates, people, labels, fields, checklists unticked; not comments", async () => {
  const { sql } = database;
  const { b, todo, done } = await setup();
  const budget = await boards.addField(sql, asMember(hugo), b.id, { name: "Budget", kind: "number" });
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Monthly report");
  const next = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Other");
  await cards.updateCard(sql, asMember(hugo), c.id, { due: "2026-10-30", dueTime: "09:30", start: "2026-10-20" });
  await cards.setAssignees(sql, asMember(hugo), c.id, [ines.id]);
  await cards.setValue(sql, asMember(hugo), c.id, budget.id, "1 200,50");
  const list = await cards.addChecklist(sql, asMember(hugo), c.id, "Before sending");
  const item = await cards.addItem(sql, asMember(hugo), c.id, "Check the figures", { checklist: list.id });
  await cards.updateItem(sql, asMember(hugo), item.id, { done: true });
  await cards.addComment(sql, asMember(hugo), c.id, "Sent last month");
  const copy = await cards.duplicateCard(sql, asMember(hugo), c.id, b.id, todo.id);
  const d = await cards.cardDetail(sql, asMember(hugo), copy.id);
  assert.deepEqual([d.title, d.due, d.dueTime, d.start, d.assignees, d.values[budget.id]], ["Monthly report", "2026-10-30", "09:30", "2026-10-20", [ines.id], "1200.50"]);
  assert.deepEqual(d.checklists.map(l => l.title), ["Before sending"]);
  assert.deepEqual(d.items.map(i => [i.text, i.done, i.checklistId === d.checklists[0]!.id]), [["Check the figures", false, true]]);
  assert.equal(d.thread.length, 0);
  // Right under the card it copies.
  assert.deepEqual((await cards.boardCards(sql, b.id)).map(x => x.id), [c.id, copy.id, next.id]);
  // Copied into a done column, it is done.
  const doneCopy = await cards.duplicateCard(sql, asMember(hugo), c.id, b.id, done.id);
  assert.equal((await cards.cardDetail(sql, asMember(hugo), doneCopy.id)).done, true);
});

test("a step of a checklist given to someone with a date is a subtask: in their My tasks, their tile, freed when they leave", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Open the new office");
  const step = await cards.addItem(sql, asMember(hugo), c.id, "Get the keys");
  const day = chestToday();
  const change = await cards.updateItem(sql, asMember(hugo), step.id, { assignee: ines.id, due: day });
  assert.equal(change.assigned, ines.id);
  // Only people who see the board; no one else.
  await assert.rejects(cards.updateItem(sql, asMember(hugo), step.id, { assignee: nora.id }), refused("invalid"));
  await assert.rejects(cards.updateItem(sql, asMember(hugo), step.id, { assignee: "someone" }), refused("invalid"));
  await assert.rejects(cards.updateItem(sql, asMember(lea), step.id, { done: true }), refused("forbidden"));
  assert.deepEqual((await cards.mySteps(sql, asMember(ines))).map(s => [s.text, s.cardTitle, s.due]), [["Get the keys", "Open the new office", day]]);
  assert.equal((await cards.urgentCounts(sql, [ines.id])).get(ines.id), 1);
  // Told in her language, by the bell (the Chest mails it if she chose so).
  await tell.stepAssigned(asMember(hugo), ines.id, { id: step.id, text: "Get the keys" }, change.card);
  assert.equal(shownTo(chest.notifications.at(-1)!, "fr").title, "Hugo Bernard vous a confié une étape de « Open the new office »");
  // Ticked: out of her list.
  await cards.updateItem(sql, asMember(ines), step.id, { done: true });
  assert.deepEqual(await cards.mySteps(sql, asMember(ines)), []);
  await cards.updateItem(sql, asMember(ines), step.id, { done: false });
  await leave(sql, ines.id);
  assert.equal((await cards.cardDetail(sql, asMember(hugo), c.id)).items[0]?.assignee, null);
});

test("several checklists per card: added, renamed, removed with their steps", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Event");
  const main = await cards.addItem(sql, asMember(hugo), c.id, "Budget");
  const day = await cards.addChecklist(sql, asMember(hugo), c.id, "On the day");
  await cards.addItem(sql, asMember(hugo), c.id, "Badges", { checklist: day.id });
  await cards.renameChecklist(sql, asMember(hugo), day.id, "The day itself");
  let d = await cards.cardDetail(sql, asMember(hugo), c.id);
  assert.deepEqual(d.checklists.map(l => l.title), ["The day itself"]);
  assert.deepEqual(d.items.map(i => [i.text, i.checklistId]), [["Budget", null], ["Badges", day.id]]);
  await assert.rejects(cards.addItem(sql, asMember(hugo), c.id, "Elsewhere", { checklist: "999999" }), refused("not_found"));
  await cards.removeChecklist(sql, asMember(hugo), day.id);
  d = await cards.cardDetail(sql, asMember(hugo), c.id);
  assert.deepEqual(d.items.map(i => i.id), [main.id]);
  assert.deepEqual(d.checklist, { done: 0, total: 1 });
});

test("a board's fields: text, number, one choice; checked; a choice taken away clears its values; exported", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const priority = await boards.addField(sql, asMember(hugo), b.id, { name: "Priority", kind: "choice", options: ["High", "Low", "High", " "] });
  assert.deepEqual(priority.options, ["High", "Low"]);
  const client = await boards.addField(sql, asMember(ines), b.id, { name: "Client", kind: "text" });
  const budget = await boards.addField(sql, asMember(hugo), b.id, { name: "Budget", kind: "number" });
  await assert.rejects(boards.addField(sql, asMember(hugo), b.id, { name: "Bad", kind: "date" }), refused("invalid"));
  await assert.rejects(boards.addField(sql, asMember(hugo), b.id, { name: "Empty", kind: "choice", options: [] }), refused("empty"));
  await assert.rejects(boards.addField(sql, asMember(lea), b.id, { name: "Viewer", kind: "text" }), refused("forbidden"));
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Quote");
  await cards.setValue(sql, asMember(hugo), c.id, priority.id, "High");
  await cards.setValue(sql, asMember(hugo), c.id, client.id, "Atelier Durand");
  await cards.setValue(sql, asMember(hugo), c.id, budget.id, "-12.5");
  await assert.rejects(cards.setValue(sql, asMember(hugo), c.id, priority.id, "Medium"), refused("invalid"));
  await assert.rejects(cards.setValue(sql, asMember(hugo), c.id, budget.id, "twelve"), refused("invalid"));
  assert.deepEqual((await cards.boardCards(sql, b.id))[0]!.values, { [priority.id]: "High", [client.id]: "Atelier Durand", [budget.id]: "-12.5" });
  const csv = await boardCsv(sql, asMember(hugo), b.id, en, "en");
  assert.match(csv.csv.split("\r\n")[0]!, /Priority,Client,Budget$/u);
  assert.match(csv.csv, /High,Atelier Durand,'-12\.5/u); // formula-safe
  await boards.updateField(sql, asMember(hugo), priority.id, { options: ["Low", "Medium"] });
  await cards.setValue(sql, asMember(hugo), c.id, client.id, "");
  assert.deepEqual((await cards.boardCards(sql, b.id))[0]!.values, { [budget.id]: "-12.5" });
  await boards.removeField(sql, asMember(hugo), budget.id);
  assert.deepEqual((await cards.boardCards(sql, b.id))[0]!.values, {});
});

test("a start date, and a due time that goes with its date", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Call the client");
  await assert.rejects(cards.updateCard(sql, asMember(hugo), c.id, { due: "2026-10-01", dueTime: "3pm" }), refused("invalid"));
  await cards.updateCard(sql, asMember(hugo), c.id, { due: "2026-10-01", dueTime: "15:00", start: "2026-09-30" });
  let d = await cards.cardDetail(sql, asMember(hugo), c.id);
  assert.deepEqual([d.due, d.dueTime, d.start], ["2026-10-01", "15:00", "2026-09-30"]);
  assert.ok(d.history.some(h => h.kind === "due_set" && h.data["time"] === "15:00"));
  await cards.updateCard(sql, asMember(hugo), c.id, { due: null });
  d = await cards.cardDetail(sql, asMember(hugo), c.id);
  assert.deepEqual([d.due, d.dueTime, d.start], [null, null, "2026-09-30"]);
});

test("a comment removed is hidden at once, can come back a moment, then goes for good", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Wi-Fi");
  const said = await cards.addComment(sql, asMember(ines), c.id, "The password is hunter2");
  await assert.rejects(cards.removeComment(sql, asMember(lea), said.comment.id), refused("forbidden"));
  await cards.removeComment(sql, asMember(ines), said.comment.id);
  assert.equal((await cards.cardDetail(sql, asMember(hugo), c.id)).thread.length, 0);
  assert.equal((await cards.boardCards(sql, b.id))[0]!.comments, 0);
  assert.equal((await cards.searchCards(sql, asMember(hugo), "hunter2")).length, 0);
  await assert.rejects(cards.editComment(sql, asMember(ines), said.comment.id, "x"), refused("not_found"));
  await cards.restoreComment(sql, asMember(ines), said.comment.id);
  assert.equal((await cards.cardDetail(sql, asMember(hugo), c.id)).thread.length, 1);
  // Removed long ago: deleted for good, no way back.
  await cards.removeComment(sql, asMember(hugo), said.comment.id); // the board's owner
  await sql`update comments set removed_at = now() - interval '11 minutes' where id = ${said.comment.id}`;
  await cards.purgeComments(sql);
  assert.equal((await sql`select 1 from comments where id = ${said.comment.id}`).length, 0);
  await assert.rejects(cards.restoreComment(sql, asMember(ines), said.comment.id), refused("not_found"));
});

test("no email from Tasks: a card given, a mention and the morning are notices, in English with their French; the Chest mails them by each one's choice", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Order boxes");
  const change = await cards.setAssignees(sql, asMember(hugo), c.id, [ines.id, hugo.id]);
  await tell.assigned(asMember(hugo), change.added, { id: c.id, title: "Order boxes", boardId: b.id });
  // Only Inès (Hugo gave it to himself): one notice, both languages.
  assert.deepEqual(chest.notifications.map(n => n.member), [ines.id]);
  const given = chest.notifications[0]!;
  assert.equal(given.title, "Hugo Bernard gave you a task");
  assert.equal(shownTo(given, "fr").title, "Hugo Bernard vous a confié une tâche");
  assert.equal(given.path, `/chest/cards/${c.id}`);
  assert.equal(given.key, `card:${c.id}:assigned`);
  // Mentioned: Hugo, in English (his language), with the comment's words.
  const said = await cards.addComment(sql, asMember(ines), c.id, "@Hugo Bernard which size?", [hugo.id]);
  await tell.mentioned(asMember(ines), said.mentions, { id: c.id, title: "Order boxes", boardId: b.id }, said.comment.body, sql, said.comment.id);
  assert.equal(shownTo(chest.notifications.at(-1)!, "en").title, "Inès Moreau mentioned you on “Order boxes”");
  // The morning: what is due, one notice per person, in both languages.
  await cards.updateCard(sql, asMember(hugo), c.id, { due: addDays(chestToday(), -1) });
  const run: Run = { id: "run_" + "b".repeat(26), name: "morning", scheduledAt: new Date().toISOString(), attempt: 1 };
  await morning(sql, run);
  const reminder = chest.notifications.find(n => n.key === "digest" && n.member === ines.id)!;
  assert.equal(reminder.title, "1 task late");
  assert.equal(shownTo(reminder, "fr").title, "1 tâche en retard");
  assert.match(shownTo(reminder, "fr").body ?? "", /Order boxes/u);
  // Nothing ever left by email from the tool.
  assert.equal(chest.outbox.length, 0);
});

test("a real Trello export: several lists, the closed one archived, link attachments into the description, uploaded files counted", async () => {
  const text = readFileSync(join(import.meta.dirname, "fixtures", "trello-board.json"), "utf8");
  const board = fromTrello(text);
  assert.deepEqual(board.columns.map(c => [c.name, c.done, c.archived]), [["À faire", false, false], ["En cours", false, false], ["Terminé", true, false], ["Vieilles idées", false, true]]);
  const stand = board.columns[0]!.cards[0]!;
  assert.equal(stand.start, "2026-10-01");
  assert.equal(stand.due, "2026-10-15");
  assert.match(stand.description, /Surface \*\*9 m²\*\*, angle\.\n\n- https:\/\/www\.batimat\.com\/exposer$/u);
  assert.deepEqual(stand.people, ["Inès Moreau", "Jeanne Prestataire"]);
  assert.deepEqual(stand.comments.map(c => c.author), ["Jeanne Prestataire"]);
  const counts = importedCounts(board);
  assert.deepEqual([counts.columns, counts.cards, counts.files], [3, 4, 2]);
  // Before importing: who is found in the Chest, who is not.
  assert.deepEqual(await previewPeople(asMember(hugo), counts.people), { found: ["Inès Moreau", "Hugo Bernard"], missing: ["Jeanne Prestataire"], hidden: ["Inès Moreau"] });
  await assert.rejects(previewPeople(asMember(lea), counts.people), refused("forbidden"));
});

test("an import is private to the importer unless everyone was chosen", async () => {
  const { sql } = database;
  const board = fromTrello(readFileSync(join(import.meta.dirname, "fixtures", "trello-board.json"), "utf8"));
  const made = await importBoard(sql, asMember(hugo), board, "Done");
  const b = await boards.board(sql, asMember(hugo), made.id);
  assert.equal(b.visibility, "private");
  await assert.rejects(boards.board(sql, asMember(ines), made.id), refused("not_found"));
  const open = await importBoard(sql, asMember(hugo), board, "Done", { visibility: "team" });
  assert.equal((await boards.board(sql, asMember(ines), open.id)).visibility, "team");
  // Asana's CSV export, with its start dates.
  const asana = fromCsv("Task ID,Created At,Completed At,Last Modified,Name,Section/Column,Assignee,Assignee Email,Start Date,Due Date,Tags,Notes,Projects,Parent task\n1208,2026-09-01,,2026-09-02,Brief the printer,Doing,Hugo Bernard,hugo@example.com,2026-09-30,2026-10-05,Print,Two colours,Trade show,\n", "Trade show");
  assert.deepEqual(asana.columns[0]!.cards.map(c => [c.title, c.start, c.due]), [["Brief the printer", "2026-09-30", "2026-10-05"]]);
});

test("managers download every board at once; others may not", async () => {
  const { sql } = database;
  await setup("One");
  const secret = await setup("Two", "private", ines);
  await boards.archiveBoard(sql, asMember(ines), secret.b.id, true);
  const all = JSON.parse(await everything(sql, asMember(camille))) as { format: string; boards: { board: { name: string }; archived: boolean }[] };
  assert.equal(all.format, "chest-tasks-all/1");
  assert.deepEqual(all.boards.map(b => [b.board.name, b.archived]), [["One", false], ["Two", true]]);
  await assert.rejects(everything(sql, asMember(hugo)), refused("forbidden"));
});
