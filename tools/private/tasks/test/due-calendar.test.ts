import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as boards from "../lib/boards.ts";
import * as cards from "../lib/cards.ts";
import { calendarWorks, sync } from "../lib/due-calendar.ts";
import { en } from "../lib/i18n/en.ts";
import { addDays } from "../lib/repeat.ts";
import { chestToday } from "../lib/clock.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, groups, hugo, ines, lea } from "./support/members.ts";

// My due dates in my calendar (Proposal (studio) "calendar"): cards and
// steps given to people who see their board, as the Chest keeps them for
// each member's one feed; gone once done, archived, deleted or undated.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications", "calendar"], calendar: { domain: "atelier.test", toolTitle: "Tasks", company: "Atelier" } });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`delete from boards`;
  await database.sql`delete from calendar_events`;
  await database.sql`delete from tool_state`;
  chest.calendar.clear();
});

async function setup(visibility: "team" | "private" = "team") {
  const b = await boards.createBoard(database.sql, asMember(hugo), { name: "Office move", visibility }, en.templates.columns);
  const [todo, doing, done] = await boards.columns(database.sql, b.id);
  return { b, todo: todo!, doing: doing!, done: done! };
}
const soon = () => addDays(chestToday(), 5);

test("a card given to someone, with a due date, is in their calendar; its step in the step's person's", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Book the van");
  await cards.updateCard(sql, asMember(hugo), c.id, { due: soon() });
  // No one on it yet: nothing is put.
  await sync(sql);
  assert.equal(chest.calendar.size, 0);
  await cards.setAssignees(sql, asMember(hugo), c.id, [ines.id]);
  const step = await cards.addItem(sql, asMember(hugo), c.id, "Call two companies");
  await cards.updateItem(sql, asMember(hugo), step.id, { assignee: hugo.id, due: soon() });
  assert.deepEqual(await sync(sql), { put: 2, removed: 0 });
  const event = chest.calendar.get(`card:${c.id}`)!;
  assert.deepEqual(event.members, [ines.id]);
  assert.deepEqual(event.title, { en: "Due: Book the van", fr: "Échéance : Book the van" });
  assert.equal(event.path, `/chest/cards/${c.id}`);
  assert.equal(event.busy, false);
  assert.equal(event.private, false);
  assert.ok("days" in event && event.days.first === soon());
  assert.deepEqual(chest.calendar.get(`step:${step.id}`)!.title, { en: "Due: Call two companies — Book the van", fr: "Échéance : Call two companies — Book the van" });
  // Nothing changed: nothing is put again.
  assert.deepEqual(await sync(sql), { put: 0, removed: 0 });
  // A due time: 30 minutes at that time, in the Chest's time zone.
  await cards.updateCard(sql, asMember(hugo), c.id, { dueTime: "14:30" });
  await sync(sql);
  const timed = chest.calendar.get(`card:${c.id}`)!;
  assert.ok("start" in timed);
  assert.equal(new Date(timed.end).getTime() - new Date(timed.start).getTime(), 30 * 60_000);
  assert.equal(await calendarWorks(sql), true);
  // Inès reads French: her feed says it in French, at 14:30 Paris time.
  assert.match(chest.feed(ines.id), /SUMMARY:Échéance\u202f: Book the van/u);
});

test("done, archived, deleted or moved: the event goes, or follows the card to its new board", async () => {
  const { sql } = database;
  const { b, todo, done } = await setup();
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Pack the archive");
  await cards.updateCard(sql, asMember(hugo), c.id, { due: soon() });
  await cards.setAssignees(sql, asMember(hugo), c.id, [hugo.id]);
  await sync(sql);
  assert.ok(chest.calendar.has(`card:${c.id}`));
  await cards.moveCard(sql, asMember(hugo), c.id, done.id, null, null);
  assert.deepEqual(await sync(sql), { put: 0, removed: 1 });
  assert.equal(chest.calendar.has(`card:${c.id}`), false);
  // Reopened, then moved to another board: the same event, its path by id.
  await cards.moveCard(sql, asMember(hugo), c.id, todo.id, null, null);
  const other = await setup();
  await cards.moveToBoard(sql, asMember(hugo), c.id, other.b.id, other.todo.id);
  await sync(sql);
  assert.equal(chest.calendar.get(`card:${c.id}`)!.path, `/chest/cards/${c.id}`);
  assert.equal(await cards.whereIs(sql, asMember(hugo), c.id), other.b.id);
  await cards.archiveCard(sql, asMember(hugo), c.id, true);
  await sync(sql);
  assert.equal(chest.calendar.has(`card:${c.id}`), false);
  await cards.archiveCard(sql, asMember(hugo), c.id, false);
  await sync(sql);
  assert.ok(chest.calendar.has(`card:${c.id}`));
  await cards.archiveCard(sql, asMember(hugo), c.id, true);
  await cards.deleteCard(sql, asMember(hugo), c.id);
  await sync(sql);
  assert.equal(chest.calendar.size, 0);
});

test("a private board: only the people who see it get its dates, marked private", async () => {
  const { sql } = database;
  const { b, todo } = await setup("private");
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Salary review");
  await cards.updateCard(sql, asMember(hugo), c.id, { due: soon() });
  // As an import does: people named on a card of a board they do not see.
  await sql`insert into card_assignees (card_id, member_id) values (${c.id}, ${ines.id}), (${c.id}, ${hugo.id}), (${c.id}, ${camille.id})`;
  await sync(sql);
  const event = chest.calendar.get(`card:${c.id}`)!;
  // Camille is a manager (sees every board); Inès does not see it.
  assert.deepEqual(event.members, [camille.id, hugo.id].sort());
  assert.equal(event.private, true);
  // Shared with the sales group (Inès): she gets it.
  await boards.setPeople(sql, asMember(hugo), b.id, { people: [hugo.id], owners: [hugo.id], groups: [groups.sales] });
  await sync(sql);
  assert.deepEqual(chest.calendar.get(`card:${c.id}`)!.members, [camille.id, hugo.id, ines.id].sort());
  // Léa (a viewer, not in it) never appears.
  assert.ok(!chest.calendar.get(`card:${c.id}`)!.members.includes(lea.id));
});

test("a Chest without the calendar: nothing breaks, the tool stops promising it", async () => {
  const { sql } = database;
  const bare = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications"], calendar: false });
  try {
    const { b, todo } = await setup();
    const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, "Order boxes");
    await cards.updateCard(sql, asMember(hugo), c.id, { due: soon() });
    await cards.setAssignees(sql, asMember(hugo), c.id, [hugo.id]);
    assert.deepEqual(await sync(sql), { put: 0, removed: 0 });
    assert.equal(await calendarWorks(sql), false);
  } finally {
    await bare.close();
  }
});
