import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import type { Run } from "@argentic/chest-sdk/schedules";
import * as boards from "../lib/boards.ts";
import * as cards from "../lib/cards.ts";
import { AppError } from "../lib/errors.ts";
import { en } from "../lib/i18n/en.ts";
import { arrange, fromCsv, fromTrello, importBoard, importedCounts, looksDone, previewPeople } from "../lib/importers.ts";
import { morning } from "../lib/morning.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

// The third severe critique: moving day. A real Trello board's "Done" list
// and its cards "marked complete" come in finished, not late; archived
// lists come archived, never dropped without a word; a private import
// says who will not see their cards; a French sheet's statuses read as a
// workflow.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone.map(p => ({ ...p, email: p.firstName.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "") + "@atelier.test" })), capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier.test" } });
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

// test/fixtures/trello-switch-day.json: a board of a French marketing team
// in the shape of Trello's board export (see THIRD_PARTY.md for what it is
// based on): lists "À faire", "En cours", "Fait" and the archived "Sprint
// de mars"; cards "marked complete" (dueComplete) in open lists.
const fixture = () => readFileSync(join(import.meta.dirname, "fixtures", "trello-switch-day.json"), "utf8");
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("column names of finished work, in English and French, and not their negations", () => {
  for (const name of ["Done", "DONE ✅", "Fait", "Faits", "Terminé", "Terminées", "Clôturé", "Closed", "Livré", "Done this week", "✓", "Completed"]) assert.equal(looksDone(name), true, name);
  for (const name of ["À faire", "To do", "En cours", "Not done", "Pas fini", "Backlog", "À valider", "Doing"]) assert.equal(looksDone(name), false, name);
});

test("a real Trello export: the Done list is done, cards marked complete go there, the archived list comes archived", () => {
  const board = fromTrello(fixture());
  assert.deepEqual(board.columns.map(c => [c.name, c.done, c.archived, c.cards.length]), [["À faire", false, false, 3], ["En cours", false, false, 2], ["Fait", true, false, 3], ["Sprint de mars", false, true, 2]]);
  const counts = importedCounts(board);
  assert.deepEqual({ columns: counts.columns, cards: counts.cards, archivedColumns: counts.archivedColumns, archivedCards: counts.archivedCards, ticked: counts.ticked }, { columns: 3, cards: 8, archivedColumns: 1, archivedCards: 2, ticked: 2 });
  const settled = arrange(board);
  assert.deepEqual(settled.columns.map(c => [c.name, c.cards.map(k => k.title)]), [
    ["À faire", ["Écrire la newsletter d’octobre", "Vieux brief vidéo"]],
    ["En cours", ["Préparer le stand du salon"]],
    ["Fait", ["Lancer la campagne de printemps", "Refaire la page Tarifs", "Choisir l’agence photo", "Publier l’offre de stage", "Relancer l’imprimeur"]],
    ["Sprint de mars", ["Maquettes du salon v1", "Réunion de lancement"]],
  ]);
  // The person says no column holds finished work: the ticked cards get a
  // done column of their own, after the open ones.
  const none = arrange(board, []);
  assert.deepEqual(none.columns.map(c => [c.name, c.done, c.archived]), [["À faire", false, false], ["En cours", false, false], ["Fait", false, false], ["✓", true, false], ["Sprint de mars", false, true]]);
  // Or chooses another one; an archived column's index is ignored.
  const other = arrange(board, [1, 3]);
  assert.deepEqual(other.columns.map(c => c.done), [false, true, false, false]);
  // "Fait" is not done any more: its card marked complete moves too.
  assert.deepEqual(other.columns[1]!.cards.map(k => k.title), ["Préparer le stand du salon", "Relancer l’imprimeur", "Publier l’offre de stage", "Lancer la campagne de printemps"]);
});

test("switch day: nothing finished in Trello is late the next morning, in My tasks, the reminder or the tile", async () => {
  const { sql } = database;
  const made = await importBoard(sql, asMember(hugo), fromTrello(fixture()), "Done", { visibility: "team" });
  assert.equal(made.cards, 10);
  const mine = await cards.myTasks(sql, asMember(hugo));
  // Hugo's open cards only: the stand (due 12 October); the job ad, the
  // spring campaign and the old video brief (archived) are not his work.
  assert.deepEqual(mine.map(c => c.title), ["Préparer le stand du salon"]);
  assert.deepEqual((await boards.columns(sql, made.id)).map(c => [c.name, c.done]), [["À faire", false], ["En cours", false], ["Fait", true]]);
  assert.deepEqual((await boards.columns(sql, made.id, { archived: true })).map(c => c.name), ["Sprint de mars"]);
  const run: Run = { id: "run_" + "c".repeat(26), name: "morning", scheduledAt: "2026-10-01T05:30:00.000Z", attempt: 1, timeZone: "Europe/Paris" };
  await morning(sql, run);
  // Inès: the printer was ticked done, the Tarifs page is in Fait; her
  // newsletter is due on the 20th. No reminder at all.
  assert.equal(chest.notifications.filter(n => n.member === ines.id).length, 0);
  assert.equal(chest.outbox.length, 0);
  const counts = await cards.urgentCounts(sql, [hugo.id, ines.id], "2026-10-01");
  assert.deepEqual([counts.get(hugo.id), counts.get(ines.id)], [0, 0]);
  // The person unticks "Fait": its cards come in open (their choice).
  const open = await importBoard(sql, asMember(hugo), fromTrello(fixture()), "Done", { visibility: "team", done: [] });
  const ticked = (await boards.columns(sql, open.id)).find(c => c.done)!;
  assert.equal(ticked.name, "Done");
  await assert.rejects(importBoard(sql, asMember(hugo), fromTrello(fixture()), "Done", { done: ["x"] }), refused("invalid"));
});

test("a private import: the importer is told who will not see their cards (not a manager); the tile does not count them", async () => {
  const { sql } = database;
  const board = fromTrello(fixture());
  const preview = await previewPeople(asMember(hugo), importedCounts(board).people);
  assert.deepEqual(preview, { found: ["Inès Moreau", "Hugo Bernard", "Camille Martin"], missing: ["Paul Graphiste"], hidden: ["Inès Moreau"] });
  const made = await importBoard(sql, asMember(hugo), board, "Done", { done: [] });
  // Inès has an open card due on 1 October on it, which she cannot see.
  await assert.rejects(boards.board(sql, asMember(ines), made.id), refused("not_found"));
  assert.deepEqual(await cards.myTasks(sql, asMember(ines)), []);
  assert.equal((await cards.urgentCounts(sql, [ines.id], "2026-10-25")).get(ines.id), 0);
  // Camille is a manager: she sees every board, so her cards count.
  assert.ok((await cards.urgentCounts(sql, [camille.id], "2026-10-25")).get(camille.id)! >= 1);
  await boards.setPeople(sql, asMember(hugo), made.id, { people: [hugo.id, ines.id], owners: [hugo.id], groups: [] });
  assert.equal((await cards.urgentCounts(sql, [ines.id], "2026-10-25")).get(ines.id), 2);
});

test("a French sheet: statuses Fait and Terminé are done, columns read as a workflow, completed rows go to Fait", () => {
  const csv = [
    "N°;Titre;Statut;Échéance;Terminé",
    "1;Commander les badges;En cours;02/10/2026;",
    "2;Réserver l’hôtel;À valider;03/10/2026;",
    "3;Payer l’acompte;Fait;01/09/2026;",
    "4;Envoyer le kit presse;À faire;10/10/2026;",
    "5;Imprimer les flyers;À faire;01/09/2026;oui",
  ].join("\n");
  const board = arrange(fromCsv(csv, "Salon"));
  assert.deepEqual(board.columns.map(c => [c.name, c.done, c.cards.map(k => k.title)]), [
    ["À faire", false, ["Envoyer le kit presse"]],
    ["En cours", false, ["Commander les badges"]],
    ["À valider", false, ["Réserver l’hôtel"]],
    ["Fait", true, ["Payer l’acompte", "Imprimer les flyers"]],
  ]);
  // A column the importer does not know keeps its place after "to do".
  const odd = fromCsv("Title,Status\nA,Waiting\nB,To do\nC,Done\nD,Doing\n", "x");
  assert.deepEqual(odd.columns.map(c => c.name), ["To do", "Waiting", "Doing", "Done"]);
  assert.equal(en.importer.finished, "Finished work");
});
