import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as boards from "../src/lib/boards.ts";
import * as cards from "../src/lib/cards.ts";
import { parseCsv, toCsv } from "../src/shared/csv.ts";
import { AppError } from "@argentic/chest-app";
import { arrange, dayOf, fromCsv, fromTrello, importBoard } from "../src/lib/importers.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines, lea } from "./support/members.ts";

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

// A Trello board export, cut down to the fields the importer reads.
const trello = JSON.stringify({
  name: "Website redesign",
  lists: [{ id: "l1", name: "Backlog", pos: 1 }, { id: "l2", name: "Doing", pos: 2 }, { id: "l3", name: "Old", pos: 3, closed: true }],
  labels: [{ id: "lb1", name: "Design", color: "purple" }, { id: "lb2", name: "", color: "red" }],
  members: [{ id: "m1", fullName: "Hugo Bernard" }, { id: "m2", fullName: "Someone Else" }],
  cards: [
    { id: "c1", name: "Homepage mockup", desc: "Use the new colours", idList: "l1", pos: 2, due: "2026-10-20T10:00:00.000Z", idLabels: ["lb1"], idMembers: ["m1", "m2"] },
    { id: "c2", name: "Pick a font", idList: "l1", pos: 1, idLabels: ["lb2"], idMembers: [] },
    { id: "c3", name: "Old card", idList: "l2", pos: 1, closed: true },
  ],
  checklists: [{ id: "k1", idCard: "c1", name: "Steps", checkItems: [{ name: "Sketch", state: "complete", pos: 1 }, { name: "Review", state: "incomplete", pos: 2 }] }],
  actions: [{ type: "commentCard", date: "2026-09-01T09:00:00.000Z", data: { card: { id: "c1" }, text: "Looks great" }, memberCreator: { fullName: "Someone Else" } }],
});

test("a Trello export reads into columns, cards, labels, checklists and comments", () => {
  const board = fromTrello(trello);
  assert.equal(board.name, "Website redesign");
  // The archived list comes, archived (nothing left behind silently).
  assert.deepEqual(board.columns.map(c => [c.name, c.archived]), [["Backlog", false], ["Doing", false], ["Old", true]]);
  assert.deepEqual(board.columns[0]!.cards.map(c => c.title), ["Pick a font", "Homepage mockup"]);
  const mockup = board.columns[0]!.cards[1]!;
  assert.equal(mockup.due, "2026-10-20");
  assert.deepEqual(mockup.labels, ["Design"]);
  assert.deepEqual(mockup.people, ["Hugo Bernard", "Someone Else"]);
  assert.deepEqual(mockup.checklist, [{ text: "Sketch", done: true }, { text: "Review", done: false }]);
  assert.equal(mockup.comments[0]?.author, "Someone Else");
  assert.deepEqual(board.labels.map(l => l.color), ["grape", "tomato"]);
  assert.throws(() => fromTrello("not json"), (e: unknown) => e instanceof AppError && e.code === "import_invalid");
  assert.throws(() => fromTrello("{}"), (e: unknown) => e instanceof AppError && e.code === "import_invalid");
});

test("an Asana CSV reads sections, assignees, tags, completion and subtasks", () => {
  const csv = [
    "Task ID,Created At,Completed At,Last Modified,Name,Section/Column,Assignee,Assignee Email,Start Date,Due Date,Tags,Notes,Projects,Parent task",
    '1,2026-09-01,,2026-09-02,Write the brief,To do,Inès Moreau,ines@example.test,,2026-10-01,"Urgent,Client",Two pages,Launch,',
    "2,2026-09-01,2026-09-03,2026-09-03,Send invoices,To do,,,,,,,Launch,",
    "3,2026-09-01,,2026-09-02,Draft outline,To do,,,,,,,Launch,Write the brief",
  ].join("\n");
  const board = arrange(fromCsv(csv, "Launch"));
  assert.deepEqual(board.columns.map(c => [c.name, c.done, c.cards.map(k => k.title)]), [["To do", false, ["Write the brief"]], ["✓", true, ["Send invoices"]]]);
  const brief = board.columns[0]!.cards[0]!;
  assert.deepEqual(brief.labels, ["Urgent", "Client"]);
  assert.deepEqual(brief.checklist, [{ text: "Draft outline", done: false }]);
  assert.equal(brief.due, "2026-10-01");
  // A French sheet: semicolons, French headers, day/month/year.
  const french = fromCsv("Titre;Colonne;Échéance\nAppeler le client;À faire;05/11/2026\n", "Feuille");
  assert.equal(french.columns[0]!.cards[0]!.due, "2026-11-05");
  assert.throws(() => fromCsv("A,B\n1,2\n", "x"), (e: unknown) => e instanceof AppError && e.code === "import_invalid");
});

test("the import writes one board; people are matched by name; only those who may import", async () => {
  const { sql } = database;
  const result = await importBoard(sql, asMember(ines), fromTrello(trello), "Done");
  assert.deepEqual({ cards: result.cards, matched: result.matched, people: result.people }, { cards: 3, matched: 1, people: 2 });
  const list = await cards.boardCards(sql, result.id);
  const mockup = list.find(c => c.title === "Homepage mockup")!;
  assert.deepEqual(mockup.assignees, [hugo.id]);
  assert.deepEqual(mockup.checklist, { done: 1, total: 2 });
  const detail = await cards.cardDetail(sql, asMember(ines), mockup.id);
  assert.equal(detail.thread[0]?.importedAuthor, "Someone Else");
  assert.equal((await boards.board(sql, asMember(ines), result.id)).access, "own");
  await assert.rejects(importBoard(sql, asMember(lea), fromTrello(trello), "Done"), (e: unknown) => e instanceof AppError && e.code === "forbidden");
});

test("CSV: quotes, line breaks, semicolons; exports never carry a formula", () => {
  assert.deepEqual(parseCsv('a,"b, ""c""",d\r\n"line\nbreak",2,3\n'), [["a", 'b, "c"', "d"], ["line\nbreak", "2", "3"]]);
  assert.deepEqual(parseCsv("﻿x;y\n1;2"), [["x", "y"], ["1", "2"]]);
  assert.equal(toCsv([["=SUM(A1)", "+1", "ok", 'say "hi"']]), "﻿'=SUM(A1),'+1,ok,\"say \"\"hi\"\"\"\r\n");
  assert.equal(dayOf("2026-10-20T10:00:00Z"), "2026-10-20");
  assert.equal(dayOf("nonsense"), null);
});
