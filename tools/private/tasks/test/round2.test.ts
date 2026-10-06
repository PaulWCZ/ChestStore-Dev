import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as boards from "../src/lib/boards.ts";
import { daysBetween, shifted, span, timelineStart } from "../src/shared/calendar.ts";
import * as cards from "../src/lib/cards.ts";
import { AppError } from "@argentic/chest-app";
import { en } from "../src/i18n/en.ts";
import { fr } from "../src/i18n/fr.ts";
import * as tell from "../src/lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, seen } from "./support/members.ts";

// The second severe critique: nothing of a deleted comment stays in the
// bell, in any language; "blocked
// by" between cards (a card waiting is not done unless the person says
// so); the timeline's dates; columns in the reader's language.

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
async function setup(by = hugo) {
  const b = await boards.createBoard(database.sql, asMember(by), { name: "Office move", visibility: "team" }, en.templates.columns);
  const [todo, doing, done] = await boards.columns(database.sql, b.id);
  return { b, todo: todo!, doing: doing!, done: done! };
}
// What a comment does, as the server action does it (app/chest/actions.ts).
async function comment(by: typeof hugo, cardId: string, body: string, mentions: string[]) {
  const sql = database.sql;
  const done = await cards.addComment(sql, asMember(by), cardId, body, mentions);
  const card = { id: cardId, title: done.title, boardId: done.boardId };
  await tell.mentioned(asMember(by), done.mentions, card, done.comment.body, sql, done.comment.id);
  await tell.commented(asMember(by), done.assignees.filter(a => !done.mentions.includes(a)), card, done.comment.body, sql, done.comment.id);
  return done.comment;
}
const secretIn = (text: string | undefined) => (text ?? "").includes("SECRETX");
// A notice holds the secret in any of its languages.
const holds = (n: (typeof chest.notifications)[number]) => [n.title, n.body, ...Object.values(n.translations ?? {}).flatMap(w => [w?.title, w?.body])].some(secretIn);

test("SECRETX: a deleted comment takes its bell items back, in every language", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Door code");
  await cards.setAssignees(sql, asMember(hugo), c.id, [ines.id, camille.id]);
  const said = await comment(hugo, c.id, "@Inès Moreau Door code is 4321 SECRETX", [ines.id]);
  // Inès: a mention; Camille (given the card): a comment. Both hold the words.
  assert.equal(chest.notifications.filter(holds).length, 2);
  await tell.commentGone(sql, await cards.removeComment(sql, asMember(hugo), said.id));
  assert.equal(chest.notifications.filter(holds).length, 0, "the bell holds no trace");
  // Undo: the comment and its items come back.
  await tell.commentShown(sql, await cards.restoreComment(sql, asMember(hugo), said.id));
  assert.equal(chest.notifications.filter(holds).length, 2);
  await tell.commentGone(sql, await cards.removeComment(sql, asMember(hugo), said.id));
  // The Undo is over: the comment is deleted for good, what said it with it.
  await sql`update comments set removed_at = now() - interval '11 minutes' where id = ${said.id}`;
  await cards.purgeComments(sql);
  assert.equal(chest.outbox.length, 0, "Tasks sends no email");
  assert.equal((await sql`select 1 from comment_notices`).length, 0);
});

test("an older item is left alone: deleting a comment another one replaced withdraws nothing", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Plants");
  const first = await comment(hugo, c.id, "@Inès Moreau first", [ines.id]);
  await comment(hugo, c.id, "@Inès Moreau second", [ines.id]);
  await tell.commentGone(sql, await cards.removeComment(sql, asMember(hugo), first.id));
  assert.deepEqual(chest.notifications.filter(n => n.member === ines.id).map(n => n.body), ["@Inès Moreau second"]);
});

test("each mention is an item of its own; a card done takes them all back", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Chairs");
  await comment(hugo, c.id, "@Inès Moreau how many?", [ines.id]);
  await comment(hugo, c.id, "@Inès Moreau which colour?", [ines.id]);
  assert.equal(chest.notifications.filter(n => n.member === ines.id).length, 2);
  await tell.settled(c.id, sql);
  assert.equal(chest.notifications.filter(n => n.member === ines.id).length, 0);
});

test("an edited comment: the bell says its new words", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Wi-Fi");
  const said = await comment(hugo, c.id, "@Inès Moreau the password is SECRETX", [ines.id]);
  await tell.commentShown(sql, await cards.editComment(sql, asMember(hugo), said.id, "@Inès Moreau ask me for the password"));
  assert.equal(chest.notifications.filter(holds).length, 0);
  assert.match(chest.notifications.find(n => n.member === ines.id)?.body ?? "", /ask me for the password/u);
});

test("blocked by: a card waits for others of its board; no loop, no other board, no card twice", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const truck = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Book the truck");
  const clients = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Tell the clients");
  const drinks = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Drinks");
  await cards.addBlocker(sql, asMember(hugo), clients.id, truck.id);
  await cards.addBlocker(sql, asMember(hugo), clients.id, truck.id); // once
  await cards.addBlocker(sql, asMember(hugo), drinks.id, clients.id);
  // A loop, directly or through another card, is refused.
  await assert.rejects(cards.addBlocker(sql, asMember(hugo), truck.id, clients.id), refused("cycle"));
  await assert.rejects(cards.addBlocker(sql, asMember(hugo), truck.id, drinks.id), refused("cycle"));
  await assert.rejects(cards.addBlocker(sql, asMember(hugo), truck.id, truck.id), refused("invalid"));
  // A card of another board is not one it can wait for.
  const other = await boards.createBoard(sql, asMember(hugo), { name: "Other", visibility: "team" }, en.templates.columns);
  const [otherTodo] = await boards.columns(sql, other.id);
  const elsewhere = await cards.addCard(sql, asMember(hugo), other.id, otherTodo!.id, "Elsewhere");
  await assert.rejects(cards.addBlocker(sql, asMember(hugo), truck.id, elsewhere.id), refused("not_found"));
  // Léa only reads the board.
  await assert.rejects(cards.addBlocker(sql, asMember(lea), truck.id, drinks.id), refused("forbidden"));
  const summary = (await cards.boardCards(sql, b.id)).find(x => x.id === clients.id)!;
  assert.deepEqual([summary.blockedBy, summary.waiting], [[truck.id], 1]);
  const detail = await cards.cardDetail(sql, asMember(hugo), clients.id);
  assert.deepEqual(detail.blockers.map(l => l.title), ["Book the truck"]);
  assert.deepEqual(detail.blocking.map(l => l.title), ["Drinks"]);
  assert.match(JSON.stringify(detail.history), /blocker_added/u);
  await cards.removeBlocker(sql, asMember(hugo), drinks.id, clients.id);
  assert.equal((await cards.cardDetail(sql, asMember(hugo), drinks.id)).blockers.length, 0);
});

test("a card waiting for an open card is not marked done, unless forced; its blocker done frees it and tells its people", async () => {
  const { sql } = database;
  const { b, todo, done } = await setup();
  const truck = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Book the truck");
  const clients = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Tell the clients");
  await cards.setAssignees(sql, asMember(hugo), clients.id, [ines.id]);
  await cards.addBlocker(sql, asMember(hugo), clients.id, truck.id);
  await assert.rejects(cards.moveCard(sql, asMember(hugo), clients.id, done.id, null, null), (e: unknown) => e instanceof AppError && e.code === "blocked" && e.values["title"] === "Book the truck" && e.values["count"] === 1);
  // Forced: done, and the history says so.
  await cards.moveCard(sql, asMember(hugo), clients.id, done.id, null, null, { force: true });
  assert.equal((await cards.cardDetail(sql, asMember(hugo), clients.id)).history[0]?.kind, "completed_anyway");
  await cards.moveCard(sql, asMember(hugo), clients.id, todo.id, null, null);
  // The truck done: the clients' card waits for nothing; Inès is told.
  await cards.moveCard(sql, asMember(hugo), truck.id, done.id, null, null);
  const free = await cards.freed(sql, truck.id);
  assert.deepEqual(free.map(f => [f.title, f.assignees]), [["Tell the clients", [ines.id]]]);
  await tell.unblocked({ title: "Book the truck" }, free);
  assert.equal(seen(chest.notifications.at(-1)!).title, "Vous pouvez commencer «\u202fTell the clients\u202f»");
  assert.equal((await cards.boardCards(sql, b.id)).find(x => x.id === clients.id)?.waiting, 0);
  await cards.moveCard(sql, asMember(hugo), clients.id, done.id, null, null);
  // Reopened, the truck blocks it again — for a card not yet done.
  assert.deepEqual(await cards.waitingOn(sql, truck.id), [clients.id]);
});

test("a card moved to another board leaves its links behind (they join cards of one board)", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const truck = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Book the truck");
  const clients = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Tell the clients");
  await cards.addBlocker(sql, asMember(hugo), clients.id, truck.id);
  const other = await boards.createBoard(sql, asMember(hugo), { name: "Other", visibility: "team" }, en.templates.columns);
  const [otherTodo] = await boards.columns(sql, other.id);
  await cards.moveToBoard(sql, asMember(hugo), clients.id, other.id, otherTodo!.id);
  const moved = await cards.cardDetail(sql, asMember(hugo), clients.id);
  assert.equal(moved.blockers.length, 0);
  assert.equal(moved.history[0]?.kind, "links_left");
});

test("a template's columns are named in each reader's language until renamed", async () => {
  const { sql } = database;
  // Camille (French) makes the board: Hugo reads English, Inès French.
  const b = await boards.createBoard(sql, asMember(camille), { name: "Déménagement", visibility: "team" }, fr.templates.columns);
  assert.deepEqual((await boards.columns(sql, b.id, { words: en.templates.columns })).map(c => c.name), ["To do", "Doing", "Done"]);
  assert.deepEqual((await boards.columns(sql, b.id, { words: fr.templates.columns })).map(c => c.name), ["À faire", "En cours", "Fait"]);
  const [todo, doing] = await boards.columns(sql, b.id);
  // A rename left as shown keeps the key; a real one keeps the name written.
  await boards.updateColumn(sql, asMember(camille), todo!.id, { name: "To do" });
  await boards.updateColumn(sql, asMember(camille), doing!.id, { name: "Chez le client" });
  assert.deepEqual((await boards.columns(sql, b.id, { words: en.templates.columns })).map(c => c.name), ["To do", "Chez le client", "Done"]);
  assert.deepEqual((await boards.columns(sql, b.id, { words: fr.templates.columns })).map(c => c.name), ["À faire", "Chez le client", "Fait"]);
  // My tasks and search carry the key too.
  const card = await cards.addCard(sql, asMember(camille), b.id, todo!.id, "Cartons");
  await cards.setAssignees(sql, asMember(camille), card.id, [hugo.id]);
  const [mine] = await cards.myTasks(sql, asMember(hugo));
  assert.equal(boards.columnName(mine!.columnName, mine!.columnKey, en.templates.columns), "To do");
});

test("the timeline: six weeks from a Monday; bars from start to due; dragged, both dates move (the end: the due date only)", () => {
  assert.equal(timelineStart(undefined, "2026-09-29"), "2026-09-21");
  assert.equal(timelineStart("2026-10-08", "2026-09-29"), "2026-10-05");
  assert.equal(timelineStart("2026-02-30", "2026-09-29"), "2026-09-21");
  assert.equal(daysBetween("2026-09-28", "2026-10-02"), 4);
  assert.deepEqual(span({ start: "2026-09-23", due: "2026-09-25" }, "2026-09-21"), { from: 2, to: 4, cutStart: false, cutEnd: false });
  assert.deepEqual(span({ start: null, due: "2026-09-21" }, "2026-09-21"), { from: 0, to: 0, cutStart: false, cutEnd: false });
  assert.deepEqual(span({ start: "2026-09-01", due: "2026-12-01" }, "2026-09-21"), { from: 0, to: 41, cutStart: true, cutEnd: true });
  assert.equal(span({ start: null, due: null }, "2026-09-21"), null);
  assert.equal(span({ start: null, due: "2027-01-01" }, "2026-09-21"), null);
  assert.deepEqual(shifted({ start: "2026-09-23", due: "2026-09-25" }, 3), { start: "2026-09-26", due: "2026-09-28" });
  assert.deepEqual(shifted({ start: null, due: "2026-09-25" }, -1), { start: null, due: "2026-09-24" });
  assert.deepEqual(shifted({ start: "2026-09-23", due: "2026-09-25" }, 2, true), { start: "2026-09-23", due: "2026-09-27" });
  // The end never goes before the start.
  assert.deepEqual(shifted({ start: "2026-09-23", due: "2026-09-25" }, -9, true), { start: "2026-09-23", due: "2026-09-23" });
});
