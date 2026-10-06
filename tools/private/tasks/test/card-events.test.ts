import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { onSchedule as JOB } from "../src/lib/deliveries.ts";
import * as boards from "../src/lib/boards.ts";
import { cardEventTypes, forgetCardEvents, occurredAtFor, publishCardEvents } from "../src/lib/card-events.ts";
import * as cards from "../src/lib/cards.ts";
import { en } from "../src/i18n/en.ts";
import { importBoard } from "../src/lib/importers.ts";
import { fromTrello } from "../src/shared/parse-import.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

// Tasks → Goals ("Cards done"): tasks.card.done {card, board, boardName,
// assignees} when a card becomes done, tasks.card.reopened {card} when it
// leaves done — whatever the path (a move, the tick of My tasks and its
// Undo, "Move to board", a column made done, a column archived into
// another, a card added or copied into Done), once each, and again later
// when the Chest could not take them. Imported done cards are history:
// never told. The contract is Goals' (tools/private/goals/README.md,
// "With the other tools").

let database: TestDatabase;
let chest: FakeChest;
const chestWith = (emits: string[]) => fakeChest({ network: {},
  tool: "tasks", members: everyone, emits, capabilities: ["members", "files", "notifications"],
});
before(async () => {
  database = await testDatabase();
  chest = await chestWith([...cardEventTypes]);
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`delete from boards`;
  await database.sql`delete from card_events`;
});

async function setup(name = "Office move") {
  const b = await boards.createBoard(database.sql, asMember(hugo), { name, visibility: "team" }, en.templates.columns);
  const [todo, doing, done] = await boards.columns(database.sql, b.id);
  return { b, todo: todo!, doing: doing!, done: done! };
}
const fromNow = () => chest.published.length;
const since = (start: number) => chest.published.slice(start).map(e => ({ type: e.type, data: e.data }));
const keyPattern = (card: string, what: "done" | "reopened") => new RegExp(`^tasks:${card}:${what}:\\d{13}$`, "u");

test("the manifest's proposals declare the two events Goals reads", () => {
  const proposals = JSON.parse(readFileSync(join(import.meta.dirname, "..", "chest.proposals.json"), "utf8"));
  assert.deepEqual(proposals.emits, ["tasks.card.done", "tasks.card.reopened"]);
});

test("a card moved into Done is told with its board and people; moved back (Undo), it is reopened; done again, told again", async () => {
  const { sql } = database;
  const { b, todo, doing, done } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Book the van");
  await cards.setAssignees(sql, asMember(hugo), c.id, [ines.id, hugo.id]);
  // Between open columns: nothing to tell.
  await cards.moveCard(sql, asMember(hugo), c.id, doing.id, null, null);
  assert.equal(await publishCardEvents(sql), 0);

  let start = fromNow();
  await cards.moveCard(sql, asMember(hugo), c.id, done.id, null, null);
  assert.equal(await publishCardEvents(sql), 1);
  assert.deepEqual(since(start), [{ type: "tasks.card.done", data: { card: c.id, board: b.id, boardName: "Office move", assignees: [hugo.id, ines.id].sort() } }]);
  assert.match(chest.published.at(-1)!.key!, keyPattern(c.id, "done"));
  assert.equal(await publishCardEvents(sql), 0, "told once");

  // Moved within Done: still done, nothing to tell.
  await cards.moveCard(sql, asMember(hugo), c.id, done.id, null, null);
  assert.equal(await publishCardEvents(sql), 0);

  // The toast's Undo is a move back.
  start = fromNow();
  await cards.moveCard(sql, asMember(hugo), c.id, doing.id, null, null);
  assert.equal(await publishCardEvents(sql), 1);
  assert.deepEqual(since(start), [{ type: "tasks.card.reopened", data: { card: c.id } }]);
  assert.match(chest.published.at(-1)!.key!, keyPattern(c.id, "reopened"));

  const keys = new Set(chest.published.map(e => e.key));
  await cards.moveCard(sql, asMember(hugo), c.id, done.id, null, null);
  await publishCardEvents(sql);
  assert.equal(chest.published.at(-1)!.type, "tasks.card.done");
  assert.ok(!keys.has(chest.published.at(-1)!.key), "a new key");
});

test("every other path: added or copied into Done, moved to another board's Done, a column made done or not, a column archived into another", async () => {
  const { sql } = database;
  const { b, todo, doing, done } = await setup();
  const other = await setup("Trade show");

  let start = fromNow();
  const born = await cards.addCard(sql, asMember(hugo), b.id, done.id, "Already sent");
  await publishCardEvents(sql);
  assert.deepEqual(since(start), [{ type: "tasks.card.done", data: { card: born.id, board: b.id, boardName: "Office move", assignees: [] } }]);

  start = fromNow();
  const copy = await cards.duplicateCard(sql, asMember(hugo), born.id, other.b.id, other.done.id);
  await publishCardEvents(sql);
  assert.deepEqual(since(start), [{ type: "tasks.card.done", data: { card: copy.id, board: other.b.id, boardName: "Trade show", assignees: [] } }]);

  start = fromNow();
  const moving = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Print the banner");
  await cards.moveToBoard(sql, asMember(hugo), moving.id, other.b.id, other.done.id);
  await publishCardEvents(sql);
  assert.deepEqual(since(start), [{ type: "tasks.card.done", data: { card: moving.id, board: other.b.id, boardName: "Trade show", assignees: [] } }]);

  // "Doing" made a done column: its two cards are done; made open again: reopened.
  const one = await cards.addCard(sql, asMember(hugo), b.id, doing.id, "Call the mover");
  const two = await cards.addCard(sql, asMember(hugo), b.id, doing.id, "Order boxes");
  start = fromNow();
  await boards.updateColumn(sql, asMember(hugo), doing.id, { done: true });
  await publishCardEvents(sql);
  assert.deepEqual(since(start).map(e => [e.type, e.data["card"]]).sort(), [["tasks.card.done", one.id], ["tasks.card.done", two.id]].sort());
  start = fromNow();
  await boards.updateColumn(sql, asMember(hugo), doing.id, { done: false });
  await publishCardEvents(sql);
  assert.deepEqual(since(start).map(e => [e.type, e.data["card"]]).sort(), [["tasks.card.reopened", one.id], ["tasks.card.reopened", two.id]].sort());

  // Archiving "Doing" with its cards moved into Done.
  start = fromNow();
  await boards.archiveColumn(sql, asMember(hugo), doing.id, true, { to: done.id });
  await publishCardEvents(sql);
  assert.deepEqual(since(start).map(e => [e.type, e.data["card"]]).sort(), [["tasks.card.done", one.id], ["tasks.card.done", two.id]].sort());

  // Archiving or deleting a done card takes nothing back: the work was done.
  start = fromNow();
  await cards.archiveCard(sql, asMember(hugo), one.id, true);
  await publishCardEvents(sql);
  assert.deepEqual(since(start), []);
});

test("an import's done cards are history: never told", async () => {
  const { sql } = database;
  const board = fromTrello(readFileSync(join(import.meta.dirname, "fixtures", "trello-board.json"), "utf8"));
  const made = await importBoard(sql, asMember(camille), board, "Done", { visibility: "team" });
  const [doneCards] = await sql<{ n: number }[]>`select count(*)::int as n from cards where board_id = ${made.id} and completed_at is not null`;
  assert.ok(doneCards!.n > 0, "the fixture has done cards");
  const start = fromNow();
  assert.equal(await publishCardEvents(sql), 0);
  assert.deepEqual(since(start), []);
  // Once imported, a card moved out of Done is live work again: told.
  const [c] = await sql<{ id: string }[]>`select id::text as id from cards where board_id = ${made.id} and completed_at is not null limit 1`;
  const [open] = await sql<{ id: string }[]>`select id::text as id from columns where board_id = ${made.id} and not done and archived_at is null order by position limit 1`;
  await cards.archiveCard(sql, asMember(camille), c!.id, false);
  assert.equal(await publishCardEvents(sql), 0, "brought back from the archive, still done: nothing");
  await cards.moveCard(sql, asMember(camille), c!.id, open!.id, null, null);
  await publishCardEvents(sql);
  assert.deepEqual(since(start), [{ type: "tasks.card.reopened", data: { card: c!.id } }]);
});

test("20 people at most, by id; a board deleted before the event left drops it", async () => {
  const { sql } = database;
  const { b, todo, done } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Everyone's task");
  const many = Array.from({ length: 25 }, (_, i) => `mbr_${String.fromCharCode(97 + (i % 26)).repeat(26)}`.slice(0, 30));
  await sql`insert into card_assignees (card_id, member_id) select ${c.id}, unnest(${many}::text[]) on conflict do nothing`;
  const start = fromNow();
  await cards.moveCard(sql, asMember(hugo), c.id, done.id, null, null);
  await publishCardEvents(sql);
  const told = since(start)[0]!.data["assignees"] as string[];
  assert.equal(told.length, 20);
  assert.ok(told.every(id => /^mbr_[a-z2-7]{26}$/u.test(id)));

  const gone = await setup("Short-lived");
  const d = await cards.addCard(sql, asMember(hugo), gone.b.id, gone.todo.id, "Nobody will know");
  await cards.moveCard(sql, asMember(hugo), d.id, gone.done.id, null, null);
  await sql`delete from boards where id = ${gone.b.id}`;
  const later = fromNow();
  assert.equal(await publishCardEvents(sql), 0);
  assert.deepEqual(since(later), []);
  const [left] = await sql<{ n: number }[]>`select count(*)::int as n from card_events where published_at is null`;
  assert.equal(left!.n, 0, "not kept waiting");
});

test("a Chest that refuses the events: the move is kept, the events wait, and the quarter-hour schedule tells them once", async () => {
  const { sql } = database;
  const { b, todo, done } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Sign the lease");
  await chest.close();
  chest = await chestWith([]);
  await cards.moveCard(sql, asMember(camille), c.id, done.id, null, null);
  assert.equal(await publishCardEvents(sql), 0);
  assert.equal(chest.published.length, 0);
  assert.equal((await cards.cardDetail(sql, asMember(hugo), c.id)).done, true, "the move is kept");

  await chest.close();
  chest = await chestWith([...cardEventTypes]);
  assert.equal(await chest.run("mail", JOB), 204);
  assert.deepEqual(chest.published.map(e => ({ type: e.type, data: e.data })), [{ type: "tasks.card.done", data: { card: c.id, board: b.id, boardName: "Office move", assignees: [] } }]);
  assert.equal(await chest.run("mail", JOB), 204);
  assert.equal(chest.published.length, 1, "once");
});

test("what was told a day ago, or refused for a week, is forgotten", async () => {
  const { sql } = database;
  const { b, todo, done } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Return the keys");
  await cards.moveCard(sql, asMember(hugo), c.id, done.id, null, null);
  await publishCardEvents(sql);
  await sql`insert into card_events (type, card, board, at) values ('tasks.card.reopened', 1, 1, now() - interval '8 days')`;
  await forgetCardEvents(sql, new Date(Date.now() + 2 * 86_400_000));
  const [left] = await sql<{ n: number }[]>`select count(*)::int as n from card_events`;
  assert.equal(left!.n, 0);
});

// studio.16: the Chest keeps when it happened (occurredAt), so Goals counts
// a card done late on a cycle's last day in that cycle even when it is told
// after midnight. Within 24 hours the true time goes with it; older (a
// Chest down for a night), it goes without — the Chest refuses older times.
test("a late event carries when the card was done; one older than a day goes without it", async () => {
  const { sql } = database;
  const { b, todo, done } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Pay the deposit");
  await chest.close();
  chest = await chestWith([]);
  await cards.moveCard(sql, asMember(hugo), c.id, done.id, null, null);
  assert.equal(await publishCardEvents(sql), 0);
  // Done 40 minutes ago, told now by the quarter-hour schedule.
  const doneAt = new Date(Date.now() - 40 * 60_000);
  doneAt.setMilliseconds(0);
  await sql`update card_events set at = ${doneAt} where card = ${c.id}`;
  // And another, done 30 hours ago, never told (a Chest down that long).
  const c2 = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Old one");
  await sql`insert into card_events (type, card, board, at) values ('tasks.card.done', ${c2.id}, ${b.id}, now() - interval '30 hours')`;
  await chest.close();
  chest = await chestWith([...cardEventTypes]);
  assert.equal(await chest.run("mail", JOB), 204);
  const late = chest.published.find(e => e.data["card"] === c.id)!;
  assert.equal(late.occurredAt, doneAt.toISOString(), "the real time of the change");
  assert.match(late.key!, new RegExp(`:${doneAt.getTime()}$`, "u"));
  const old = chest.published.find(e => e.data["card"] === c2.id)!;
  assert.ok(old, "an event older than a day is still told");
  assert.ok(Date.now() - new Date(old.occurredAt).getTime() < 60_000, "without its time: the Chest's own");
  // The helper, at its edges.
  const now = Date.parse("2026-09-30T12:00:00Z");
  assert.ok(occurredAtFor(new Date(now - 23 * 3_600_000), now));
  assert.equal(occurredAtFor(new Date(now - 24 * 3_600_000), now), undefined);
  assert.equal(occurredAtFor(new Date(now - 23 * 3_600_000 - 56 * 60_000), now), undefined, "five minutes of margin for the clocks");
});
