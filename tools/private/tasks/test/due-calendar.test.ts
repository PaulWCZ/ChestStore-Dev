import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as boards from "../src/lib/boards.ts";
import * as cards from "../src/lib/cards.ts";
import { calendarWorks, sync } from "../src/lib/due-calendar.ts";
import { en } from "../src/i18n/en.ts";
import { addDays } from "../src/shared/repeat.ts";
import { chestToday } from "../src/lib/clock.ts";
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
  chest = await fakeChest({ network: {}, members: everyone, capabilities: ["members", "files", "notifications", "calendar"], calendar: { domain: "atelier.test", toolTitle: "Tasks", company: "Atelier" } });
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
  const bare = await fakeChest({ network: {}, members: everyone, capabilities: ["members", "files", "notifications"], calendar: false });
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

test("a first sync of many due dates goes 100 a call (putMany) and puts each one", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const due = soon();
  const ids = (await sql<{ id: string }[]>`
    insert into cards (board_id, column_id, title, position, due_on, created_by)
    select ${b.id}, ${todo.id}, 'Box ' || n, lpad(n::text, 4, '0'), ${due}::date, ${hugo.id} from generate_series(1, 150) n
    returning id::text as id`).map(r => r.id);
  await sql`insert into card_assignees (card_id, member_id) select unnest(${ids}::bigint[]), ${ines.id}`;
  assert.deepEqual(await sync(sql, { max: 200 }), { put: 150, removed: 0 });
  assert.equal(chest.calendar.size, 150);
  assert.deepEqual(chest.calendar.get(`card:${ids[149]}`)!.members, [ines.id]);
  assert.deepEqual(await sync(sql, { max: 200 }), { put: 0, removed: 0 });
});

// The Chest answers each event of a batch (studio.16). It checks again what
// the SDK checked — its clock, its rules — so it may refuse one the tool
// sent: here one event is spoilt on its way (as a Chest whose rules moved
// would refuse it). The others are put and remembered; the refused one is
// not remembered as put, and the next run tries it again.
test("one event the Chest refuses in a batch: the others are put, that one is not remembered and is tried again", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  const made = [];
  for (const title of ["Van", "Boxes", "Keys"]) {
    const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, title);
    await cards.updateCard(sql, asMember(hugo), c.id, { due: soon() });
    await cards.setAssignees(sql, asMember(hugo), c.id, [ines.id]);
    made.push(c);
  }
  const spoilt = `card:${made[1]!.id}`;
  const real = globalThis.fetch;
  let batches = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (init?.method === "PUT" && url.pathname.endsWith("/calendar/events") && typeof init.body === "string") {
      batches++;
      const body = JSON.parse(init.body) as { events: Record<string, unknown>[] };
      for (const e of body.events) if (e["key"] === spoilt) e["days"] = { first: "2026-13-40", last: "2026-13-40" };
      return real(input, { ...init, body: JSON.stringify(body) });
    }
    return real(input, init);
  }) as typeof fetch;
  try {
    assert.deepEqual(await sync(sql), { put: 2, removed: 0 });
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(batches, 1, "one call for the three, no event-by-event fallback");
  assert.ok(chest.calendar.has(`card:${made[0]!.id}`));
  assert.ok(chest.calendar.has(`card:${made[2]!.id}`));
  assert.equal(chest.calendar.has(spoilt), false);
  const kept = (await sql<{ key: string }[]>`select key from calendar_events order by key`).map(r => r.key);
  assert.equal(kept.includes(spoilt), false, "a refused event is never remembered as put");
  assert.equal(kept.length, 2);
  assert.equal(await calendarWorks(sql), true, "one refused event does not turn the calendar off");
  // The next run tries it again, and only it.
  assert.deepEqual(await sync(sql), { put: 1, removed: 0 });
  assert.ok(chest.calendar.has(spoilt));
});

test("the Chest full (5,000 events): new ones refused one by one are not remembered, and go once there is room", async () => {
  const { sql } = database;
  const { b, todo } = await setup();
  for (let i = 0; i < 4999; i++) chest.calendar.set(`other:${i}`, { key: `other:${i}`, members: [ines.id], title: { en: "x" }, days: { first: soon(), last: soon() }, busy: false, private: false, updated: new Date().toISOString(), sequence: 0 } as never);
  const made = [];
  for (const title of ["Van", "Boxes", "Keys"]) {
    const c = await cards.addCard(sql, asMember(hugo), b.id, todo.id, title);
    await cards.updateCard(sql, asMember(hugo), c.id, { due: soon() });
    await cards.setAssignees(sql, asMember(hugo), c.id, [ines.id]);
    made.push(c);
  }
  assert.deepEqual(await sync(sql), { put: 1, removed: 0 });
  assert.equal((await sql`select 1 from calendar_events`).length, 1);
  for (let i = 0; i < 10; i++) chest.calendar.delete(`other:${i}`);
  assert.deepEqual(await sync(sql), { put: 2, removed: 0 });
  for (const c of made) assert.ok(chest.calendar.has(`card:${c.id}`));
});
