import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as boards from "../lib/boards.ts";
import * as cards from "../lib/cards.ts";
import { AppError } from "../lib/errors.ts";
import { en } from "../lib/i18n/en.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, groups, hugo, ines, lea, nora } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, groups: [{ id: groups.office, name: "Office", members: [camille.id, lea.id] }] });
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const names = en.templates.columns;

test("a member creates a board from a template: its columns in their words, they own it", async () => {
  const { sql } = database;
  const b = await boards.createBoard(sql, asMember(hugo), { name: "  Launch  ", template: "simple" }, names);
  assert.equal(b.name, "Launch");
  assert.equal(b.access, "own");
  assert.deepEqual((await boards.columns(sql, b.id)).map(c => [c.name, c.done]), [["To do", false], ["Doing", false], ["Done", true]]);
  await assert.rejects(boards.createBoard(sql, asMember(lea), { name: "No" }, names), refused("forbidden"));
  await assert.rejects(boards.createBoard(sql, asMember(hugo), { name: "" }, names), refused("empty"));
  await assert.rejects(boards.createBoard(sql, asMember(hugo), { name: "x".repeat(81) }, names), refused("too_long"));
});

test("a private board does not exist for those outside it", async () => {
  const { sql } = database;
  const b = await boards.createBoard(sql, asMember(ines), { name: "Payroll prep", visibility: "private" }, names);
  await assert.rejects(boards.board(sql, asMember(hugo), b.id), refused("not_found"));
  assert.ok(!(await boards.listBoards(sql, asMember(hugo))).some(x => x.id === b.id));
  assert.ok((await boards.listBoards(sql, asMember(camille))).some(x => x.id === b.id));
  await boards.setPeople(sql, asMember(ines), b.id, { people: [ines.id, hugo.id], owners: [ines.id], groups: [] });
  assert.equal((await boards.board(sql, asMember(hugo), b.id)).access, "write");
  await assert.rejects(boards.updateBoard(sql, asMember(hugo), b.id, { name: "Mine now" }), refused("forbidden"));
  await assert.rejects(boards.setPeople(sql, asMember(ines), b.id, { people: [ines.id], owners: [], groups: [] }), refused("invalid"));
});

test("columns: a new one goes before Done; renaming, marking done completes its cards; moving", async () => {
  const { sql } = database;
  const b = await boards.createBoard(sql, asMember(hugo), { name: "Columns" }, names);
  const added = await boards.addColumn(sql, asMember(hugo), b.id, "Review");
  const list = await boards.columns(sql, b.id);
  assert.deepEqual(list.map(c => c.name), ["To do", "Doing", "Review", "Done"]);
  const card = await cards.addCard(sql, asMember(hugo), b.id, added.id, "Check");
  await boards.updateColumn(sql, asMember(hugo), added.id, { done: true });
  assert.equal((await cards.cardDetail(sql, asMember(hugo), card.id)).done, true);
  await boards.moveColumn(sql, asMember(hugo), added.id, null, list[0]!.id);
  assert.equal((await boards.columns(sql, b.id))[0]!.name, "Review");
  await assert.rejects(boards.addColumn(sql, asMember(lea), b.id, "Nope"), refused("forbidden"));
});

test("an archived board is read only; it is deleted only from the archive", async () => {
  const { sql } = database;
  const b = await boards.createBoard(sql, asMember(hugo), { name: "Old" }, names);
  await assert.rejects(boards.deleteBoard(sql, asMember(hugo), b.id), refused("not_archived"));
  await boards.archiveBoard(sql, asMember(hugo), b.id, true);
  await assert.rejects(boards.addColumn(sql, asMember(hugo), b.id, "More"), refused("forbidden"));
  assert.ok((await boards.listBoards(sql, asMember(hugo), { archived: true })).some(x => x.id === b.id));
  await boards.deleteBoard(sql, asMember(hugo), b.id);
  await assert.rejects(boards.board(sql, asMember(hugo), b.id), refused("not_found"));
  await assert.rejects(boards.board(sql, asMember(nora), "1"), refused("not_found"));
});

test("labels: added, renamed, removed by those who work on the board", async () => {
  const { sql } = database;
  const b = await boards.createBoard(sql, asMember(hugo), { name: "Labels" }, names);
  const l = await boards.addLabel(sql, asMember(hugo), b.id, { name: "Urgent", color: "tomato" });
  await boards.updateLabel(sql, asMember(hugo), l.id, { name: "Very urgent", color: "nope" });
  assert.deepEqual(await boards.labels(sql, b.id), [{ id: l.id, name: "Very urgent", color: "slate" }]);
  await assert.rejects(boards.removeLabel(sql, asMember(lea), l.id), refused("forbidden"));
  await boards.removeLabel(sql, asMember(hugo), l.id);
  assert.deepEqual(await boards.labels(sql, b.id), []);
});
