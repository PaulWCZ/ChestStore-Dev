import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../lib/errors.ts";
import { addNote, listNotes, removeNote, restoreNote, setPinned } from "../lib/notes.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, nora } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("a member posts a note; everyone with a role reads it, newest first, pinned on top", async () => {
  const { sql } = database;
  const first = await addNote(sql, asMember(hugo), "  First  ");
  assert.equal(first.body, "First");
  const second = await addNote(sql, asMember(ines), "Second\r\nline");
  assert.equal(second.body, "Second\nline");
  await setPinned(sql, asMember(camille), first.id, true);
  const list = await listNotes(sql, asMember(ines));
  assert.deepEqual(list.map(n => n.body), ["First", "Second\nline"]);
  assert.equal(list[0]?.author, hugo.id);
  await assert.rejects(listNotes(sql, asMember(nora)), refused("forbidden"));
});

test("what is written is bounded and checked on the server", async () => {
  const { sql } = database;
  await assert.rejects(addNote(sql, asMember(hugo), "   "), refused("empty"));
  await assert.rejects(addNote(sql, asMember(hugo), "x".repeat(501)), refused("too_long"));
  await assert.rejects(addNote(sql, asMember(hugo), 42), refused("invalid"));
  await assert.rejects(addNote(sql, asMember(nora), "hello"), refused("forbidden"));
  await assert.rejects(addNote(sql, null, "hello"), refused("forbidden"));
  await assert.rejects(setPinned(sql, asMember(hugo), "1", true), refused("forbidden"));
  await assert.rejects(removeNote(sql, asMember(hugo), "'; drop table notes; --"), refused("not_found"));
});

test("an author deletes their note and undoes it; a manager deletes anyone's; a member not", async () => {
  const { sql } = database;
  const note = await addNote(sql, asMember(ines), "Mine");
  await assert.rejects(removeNote(sql, asMember(hugo), note.id), refused("forbidden"));
  await removeNote(sql, asMember(ines), note.id);
  assert.ok(!(await listNotes(sql, asMember(ines))).some(n => n.id === note.id));
  await restoreNote(sql, asMember(ines), note.id);
  assert.ok((await listNotes(sql, asMember(ines))).some(n => n.id === note.id));
  await removeNote(sql, asMember(camille), note.id);
  await assert.rejects(removeNote(sql, asMember(camille), note.id), refused("not_found"));
});
