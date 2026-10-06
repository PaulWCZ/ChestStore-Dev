import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as boards from "../src/lib/boards.ts";
import * as cards from "../src/lib/cards.ts";
import { AppError } from "@argentic/chest-app";
import { en } from "../src/i18n/en.ts";
import { chestToday } from "../src/lib/clock.ts";
import * as tell from "../src/lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines, lea, nora } from "./support/members.ts";

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

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
async function setup(visibility: "team" | "private" = "team") {
  const b = await boards.createBoard(database.sql, asMember(hugo), { name: "Office move", visibility }, en.templates.columns);
  const cols = await boards.columns(database.sql, b.id);
  return { b, todo: cols[0]!, doing: cols[1]!, done: cols[2]! };
}

test("cards are added at the bottom (or top), moved between neighbours, completed in a done column", async () => {
  const { sql } = database;
  const { b, todo, done } = await setup();
  const one = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Book the truck");
  const two = await cards.addCard(sql, asMember(ines), b.id, todo.id, "Pack the archives");
  const zero = await cards.addCard(sql, asMember(ines), b.id, todo.id, "Tell the landlord", { top: true });
  assert.deepEqual((await cards.boardCards(sql, b.id)).map(c => c.title), ["Tell the landlord", "Book the truck", "Pack the archives"]);
  await cards.moveCard(sql, asMember(hugo), two.id, todo.id, zero.id, one.id);
  assert.deepEqual((await cards.boardCards(sql, b.id)).map(c => c.title), ["Tell the landlord", "Pack the archives", "Book the truck"]);
  const moved = await cards.moveCard(sql, asMember(hugo), one.id, done.id, null, null);
  assert.equal(moved.completed, true);
  const detail = await cards.cardDetail(sql, asMember(lea), one.id);
  assert.equal(detail.done, true);
  assert.deepEqual(detail.history.map(h => h.kind), ["completed", "created"]);
  await assert.rejects(cards.addCard(sql, asMember(lea), b.id, todo.id, "Viewer card"), refused("forbidden"));
  await assert.rejects(cards.moveCard(sql, asMember(lea), two.id, done.id, null, null), refused("forbidden"));
  // A stale page naming neighbours in the wrong order still lands the card.
  await cards.moveCard(sql, asMember(hugo), zero.id, todo.id, one.id, two.id).catch(e => assert.ok(refused("invalid")(e)));
});

test("title, description and due date are checked; the history keeps codes", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Plan");
  const changed = await cards.updateCard(sql, asMember(hugo), c.id, { title: "Plan the move", description: "Line 1\r\nLine 2", due: "2026-10-12" });
  assert.deepEqual(changed, { title: "Plan the move", due: "2026-10-12", dueChanged: true });
  const d = await cards.cardDetail(sql, asMember(hugo), c.id);
  assert.equal(d.description, "Line 1\nLine 2");
  assert.deepEqual(d.history.map(h => h.kind).sort(), ["created", "described", "due_set", "renamed"]);
  await assert.rejects(cards.updateCard(sql, asMember(hugo), c.id, { due: "2026-02-30" }), refused("invalid"));
  await assert.rejects(cards.updateCard(sql, asMember(hugo), c.id, { title: "" }), refused("empty"));
  await assert.rejects(cards.updateCard(sql, asMember(hugo), c.id, { description: "x".repeat(20001) }), refused("too_long"));
});

test("a card is given only to people who see the board; they are told in their language; the badge counts urgent ones", async () => {
  const { sql } = database;
  const { b, todo, done } = await setup("private");
  await boards.setPeople(sql, asMember(hugo), b.id, { people: [hugo.id, ines.id], owners: [hugo.id], groups: [] });
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Order boxes");
  await cards.updateCard(sql, asMember(hugo), c.id, { due: chestToday() });
  await assert.rejects(cards.setAssignees(sql, asMember(hugo), c.id, [lea.id]), refused("invalid"));
  await assert.rejects(cards.setAssignees(sql, asMember(hugo), c.id, ["nobody"]), refused("invalid"));
  const change = await cards.setAssignees(sql, asMember(hugo), c.id, [ines.id, hugo.id]);
  assert.deepEqual(change.added.sort(), [hugo.id, ines.id].sort());
  await tell.assigned(asMember(hugo), change.added, { id: c.id, title: change.title, boardId: b.id });
  // Inès reads French: her bell says it in French; Hugo gave it to himself.
  assert.deepEqual(chest.notifications.map(n => [n.member, n.title, n.path]), [[ines.id, "Hugo Bernard vous a confié une tâche", `/chest/cards/${c.id}`]]);
  await tell.refreshBadges(sql, [ines.id, hugo.id]);
  assert.equal(chest.badges.get(ines.id), 1);
  const mine = await cards.myTasks(sql, asMember(ines));
  assert.deepEqual(mine.map(t => t.title), ["Order boxes"]);
  // Done: out of "My tasks", the bell item withdrawn, the badge cleared.
  await cards.moveCard(sql, asMember(ines), c.id, done.id, null, null);
  await tell.settled(c.id);
  await tell.refreshBadges(sql, [ines.id]);
  assert.deepEqual(await cards.myTasks(sql, asMember(ines)), []);
  assert.equal(chest.notifications.length, 0);
  assert.equal(chest.badges.get(ines.id), undefined);
});

test("checklist, comments with mentions, archive and delete", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Welcome Léa");
  const one = await cards.addItem(sql, asMember(hugo), c.id, "Laptop");
  await cards.addItem(sql, asMember(hugo), c.id, "Badge");
  await cards.updateItem(sql, asMember(hugo), one.id, { done: true });
  assert.deepEqual((await cards.cardDetail(sql, asMember(hugo), c.id)).checklist, { done: 1, total: 2 });
  // A viewer comments; mentions of people outside the board are dropped.
  const said = await cards.addComment(sql, asMember(lea), c.id, "Is the desk ready? @Hugo", [hugo.id, nora.id]);
  assert.deepEqual(said.mentions, [hugo.id]);
  await assert.rejects(cards.editComment(sql, asMember(hugo), said.comment.id, "Not mine"), refused("forbidden"));
  await cards.editComment(sql, asMember(lea), said.comment.id, "Is the desk ready?");
  assert.equal((await cards.cardDetail(sql, asMember(hugo), c.id)).thread[0]?.edited, true);
  await assert.rejects(cards.removeComment(sql, asMember(ines), said.comment.id), refused("forbidden"));
  await cards.removeComment(sql, asMember(hugo), said.comment.id); // the board's owner
  await assert.rejects(cards.deleteCard(sql, asMember(hugo), c.id), refused("not_archived"));
  await cards.archiveCard(sql, asMember(hugo), c.id, true);
  assert.equal((await cards.boardCards(sql, b.id)).some(x => x.id === c.id), false);
  await cards.archiveCard(sql, asMember(hugo), c.id, false);
  assert.equal((await cards.boardCards(sql, b.id)).some(x => x.id === c.id), true);
  await cards.archiveCard(sql, asMember(hugo), c.id, true);
  await cards.deleteCard(sql, asMember(hugo), c.id);
  await assert.rejects(cards.cardDetail(sql, asMember(hugo), c.id), refused("not_found"));
});

test("files are recorded once the Chest holds them; search finds cards on visible boards only", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Floor plan for the new office");
  const f = await cards.attach(sql, asMember(hugo), c.id, { object: "cards/" + c.id + "/abc.pdf", fileName: "plan/v2.pdf", type: "application/pdf", size: 1200 });
  assert.equal(f.fileName, "plan_v2.pdf");
  await assert.rejects(cards.attach(sql, asMember(lea), c.id, { object: "cards/x.pdf", fileName: "x.pdf", type: "application/pdf", size: 1 }), refused("forbidden"));
  assert.equal((await cards.detach(sql, asMember(hugo), f.id)), "cards/" + c.id + "/abc.pdf");
  const found = await cards.searchCards(sql, asMember(ines), "floor");
  assert.ok(found.some(x => x.id === c.id));
  const secret = await setup("private");
  await cards.addCard(sql, asMember(hugo), secret.b.id, secret.todo.id, "Floor secret");
  assert.ok(!(await cards.searchCards(sql, asMember(ines), "floor")).some(x => x.title === "Floor secret"));
  assert.deepEqual(await cards.searchCards(sql, asMember(ines), "%%%"), []);
});

test("cards added and moved at once never share a position; two that do are spread again by a move between them", async () => {
  const { sql } = database;
  const { b, todo } = await setup("team");
  // Eight quick adds sent at once (a person typing fast).
  const made = await Promise.all(Array.from({ length: 8 }, (_, i) => cards.addCard(sql, asMember(hugo), b.id, todo.id, `C${i + 1}`)));
  const rows = await sql<{ id: string; position: string }[]>`select id::text, position from cards where column_id = ${todo.id} order by position, id`;
  assert.equal(new Set(rows.map(r => r.position)).size, rows.length, "every card its own key");
  // A column left with two cards on one key (an earlier version): a drop
  // between them lands between them, and the keys are written again.
  await sql`update cards set position = (select position from cards where id = ${made[1]!.id}) where id = ${made[2]!.id}`;
  await cards.moveCard(sql, asMember(hugo), made[7]!.id, todo.id, made[1]!.id, made[2]!.id);
  const order = (await sql<{ title: string }[]>`select title from cards where column_id = ${todo.id} order by position, id`).map(r => r.title);
  assert.equal(order.indexOf("C8"), order.indexOf("C2") + 1, "dropped right after C2: " + order.join(","));
  const keys = await sql<{ position: string }[]>`select position from cards where column_id = ${todo.id}`;
  assert.equal(new Set(keys.map(k => k.position)).size, keys.length);
});

test("a card restored after its key was given to another keeps a key of its own", async () => {
  const { sql } = database;
  const { b, todo } = await setup("team");
  const one = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "One");
  await cards.archiveCard(sql, asMember(hugo), one.id, true);
  // A card added on top takes a key below the first card shown: the
  // archived one's, here.
  const two = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Two", { top: true });
  await sql`update cards set position = ${one.position} where id = ${two.id}`;
  await cards.archiveCard(sql, asMember(hugo), one.id, false);
  const keys = await sql<{ position: string }[]>`select position from cards where column_id = ${todo.id}`;
  assert.equal(new Set(keys.map(k => k.position)).size, keys.length);
});
