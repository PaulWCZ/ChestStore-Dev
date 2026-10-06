import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as boards from "../src/lib/boards.ts";
import * as cards from "../src/lib/cards.ts";
import { chestToday } from "../src/lib/clock.ts";
import { AppError } from "../src/core/tool.ts";
import { en } from "../src/i18n/en.ts";
import { addDays, firstDue, nextDue } from "../src/shared/repeat.ts";
import { catchUp } from "../src/lib/repeats.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines, lea } from "./support/members.ts";

// Recurring cards: done, a repeating card makes its next one in the first
// column — once, whichever way it was done — and takes it back when
// reopened by mistake.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, chest: { timeZone: "Pacific/Auckland" } });
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
async function setup() {
  const b = await boards.createBoard(database.sql, asMember(hugo), { name: "Office" }, en.templates.columns);
  const [todo, doing, done] = await boards.columns(database.sql, b.id);
  return { b, todo: todo!, doing: doing!, done: done! };
}

test("done, a repeating card makes the next one: first column, same words, people, labels, checklist unticked, next date", async () => {
  const { sql } = database;
  const { b, todo, doing, done } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, doing.id, "Water the plants");
  const day = chestToday();
  await cards.updateCard(sql, asMember(hugo), c.id, { description: "The big ones by the window", due: day });
  await cards.setAssignees(sql, asMember(hugo), c.id, [ines.id, hugo.id]);
  const label = await boards.addLabel(sql, asMember(hugo), b.id, { name: "Office", color: "leaf" });
  await cards.setLabel(sql, asMember(hugo), c.id, label.id, true);
  const item = await cards.addItem(sql, asMember(hugo), c.id, "Fill the can");
  await cards.updateItem(sql, asMember(hugo), item.id, { done: true });
  const weekly = { every: "week", days: [1, 4] };
  await cards.setRepeat(sql, asMember(hugo), c.id, weekly);

  const moved = await cards.moveCard(sql, asMember(ines), c.id, done.id, null, null);
  assert.ok(moved.next);
  const next = await cards.cardDetail(sql, asMember(hugo), moved.next);
  assert.equal(next.columnId, todo.id);
  assert.equal(next.title, "Water the plants");
  assert.equal(next.description, "The big ones by the window");
  assert.deepEqual(next.assignees, [hugo.id, ines.id].sort());
  assert.deepEqual(next.labels, [label.id]);
  assert.deepEqual(next.items.map(i => [i.text, i.done]), [["Fill the can", false]]);
  assert.equal(next.due, nextDue({ every: "week", days: [1, 4] }, day, day));
  assert.deepEqual(next.repeat, weekly);
  assert.equal(next.next, null);
  assert.deepEqual(next.history.map(h => h.kind), ["repeat_made"]);
  const old = await cards.cardDetail(sql, asMember(hugo), c.id);
  assert.deepEqual(old.next, { id: moved.next, due: next.due, done: false, archived: false });
  assert.ok(old.history.some(h => h.kind === "repeat_next" && h.data["due"] === next.due));
  // The rule of a card whose next one is made no longer changes.
  await assert.rejects(cards.setRepeat(sql, asMember(hugo), c.id, null), refused("invalid"));
});

test("moved within done, reopened after its next one was worked on, done again: still one next card", async () => {
  const { sql } = database;
  const { b, todo, doing, done } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Weekly report");
  await cards.setRepeat(sql, asMember(hugo), c.id, { every: "weekday" });
  const first = await cards.moveCard(sql, asMember(hugo), c.id, done.id, null, null);
  assert.ok(first.next);
  // The next one is worked on: a reopened card keeps it.
  await cards.addComment(sql, asMember(ines), first.next, "Started");
  const reopened = await cards.moveCard(sql, asMember(hugo), c.id, doing.id, null, null);
  assert.equal(reopened.takenBack, null);
  const again = await cards.moveCard(sql, asMember(hugo), c.id, done.id, null, null);
  assert.equal(again.next, null);
  const count = await sql<{ n: number }[]>`select count(*)::int as n from cards where board_id = ${b.id} and title = 'Weekly report'`;
  assert.equal(count[0]!.n, 2);
});

test("ticked by mistake then undone: the untouched next card is taken back, and made again when done", async () => {
  const { sql } = database;
  const { b, todo, done } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Pay the rent");
  await cards.setRepeat(sql, asMember(hugo), c.id, { every: "month", day: 31 });
  const made = await cards.moveCard(sql, asMember(hugo), c.id, done.id, null, null);
  const undo = await cards.moveCard(sql, asMember(hugo), c.id, todo.id, null, null);
  assert.equal(undo.takenBack, made.next);
  await assert.rejects(cards.cardDetail(sql, asMember(hugo), made.next), refused("not_found"));
  assert.equal((await cards.cardDetail(sql, asMember(hugo), c.id)).next, null);
  const redo = await cards.moveCard(sql, asMember(hugo), c.id, done.id, null, null);
  assert.ok(redo.next && redo.next !== made.next);
});

test("a card that starts repeating without a date gets one; a repeat set on a done card makes the next one at once", async () => {
  const { sql } = database;
  const { b, done } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, done.id, "Close the month");
  const set = await cards.setRepeat(sql, asMember(hugo), c.id, { every: "month", day: 1 });
  assert.equal(set.due, firstDue({ every: "month", day: 1 }, chestToday()));
  assert.ok(set.next);
  const d = await cards.cardDetail(sql, asMember(hugo), c.id);
  assert.deepEqual(d.history.map(h => h.kind).sort(), ["created", "due_set", "repeat_next", "repeat_set"]);
});

test("stopping a repeat: done, the card makes nothing", async () => {
  const { sql } = database;
  const { b, todo, done } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Order coffee");
  await cards.setRepeat(sql, asMember(hugo), c.id, { every: "day" });
  await cards.setRepeat(sql, asMember(hugo), c.id, { every: "week", days: [2] });
  await cards.setRepeat(sql, asMember(hugo), c.id, { every: "week", days: [2, 3] });
  // The history says it started once, not each day ticked.
  assert.equal((await cards.cardDetail(sql, asMember(hugo), c.id)).history.filter(h => h.kind === "repeat_set").length, 1);
  await cards.setRepeat(sql, asMember(hugo), c.id, null);
  assert.equal((await cards.cardDetail(sql, asMember(hugo), c.id)).repeat, null);
  assert.equal((await cards.moveCard(sql, asMember(hugo), c.id, done.id, null, null)).next, null);
  assert.ok((await cards.cardDetail(sql, asMember(hugo), c.id)).history.some(h => h.kind === "repeat_stopped"));
});

test("a column marked done completes its repeating cards: each makes its next one; unmarked, they take them back", async () => {
  const { sql } = database;
  const { b, todo, doing } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, doing.id, "Backup the server");
  await cards.setRepeat(sql, asMember(hugo), c.id, { every: "week", days: [5] });
  await boards.updateColumn(sql, asMember(hugo), doing.id, { done: true });
  const d = await cards.cardDetail(sql, asMember(hugo), c.id);
  assert.ok(d.next);
  assert.equal((await cards.cardDetail(sql, asMember(hugo), d.next.id)).columnId, todo.id);
  await boards.updateColumn(sql, asMember(hugo), doing.id, { done: false });
  assert.equal((await cards.cardDetail(sql, asMember(hugo), c.id)).next, null);
});

test("an archived repeating card never repeats; the morning's catch-up makes each missing next card once", async () => {
  const { sql } = database;
  const { b, todo, done } = await setup();
  const archived = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Old routine");
  await cards.setRepeat(sql, asMember(hugo), archived.id, { every: "day" });
  await cards.archiveCard(sql, asMember(hugo), archived.id, true);
  // Completed without its next one (as by an older version of Tasks).
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Check the mail");
  await sql`update cards set repeat = ${sql.json({ every: "day" })}, column_id = ${done.id}, completed_at = now(), due_on = '2026-09-25' where id = ${c.id}`;
  const day = "2026-09-28";
  const made = await catchUp(sql, day);
  assert.equal(made.length, 1);
  assert.equal((await cards.cardDetail(sql, asMember(hugo), made[0]!)).due, day);
  assert.deepEqual(await catchUp(sql, day), []);
  assert.deepEqual(await catchUp(sql, addDays(day, 1)), []);
  assert.equal((await cards.cardDetail(sql, asMember(hugo), archived.id)).next, null);
});

test("only who works on the board sets a repeat; a rule out of the choices is refused", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Plan");
  await assert.rejects(cards.setRepeat(sql, asMember(lea), c.id, { every: "day" }), refused("forbidden"));
  await assert.rejects(cards.setRepeat(sql, asMember(hugo), c.id, { every: "fortnight" }), refused("invalid"));
  await assert.rejects(cards.setRepeat(sql, null, c.id, { every: "day" }), refused("not_found"));
});
