import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../lib/app-error.ts";
import { isLate, waited } from "../lib/model.ts";
import * as tickets from "../lib/tickets.ts";
import { migrate, testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";

// Triage: priority, tags, and how long a customer has waited.
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
let n = 0;
const open = (extra: Partial<tickets.PublicInput> = {}) => tickets.fromForm(database.sql, { name: "Ana", email: `ana${++n}@example.com`, subject: `Question ${n}`, message: "Hello", language: "en", ...extra });

test("priority: normal by default; those who answer change it; the inbox filters and sorts by it", async () => {
  const { sql } = database;
  const calm = await open();
  const fire = await open();
  const low = await open();
  assert.equal((await tickets.ticket(sql, asMember(hugo), calm.number)).priority, "normal");
  assert.equal((await tickets.setPriority(sql, asMember(hugo), fire.number, "urgent")).priority, "urgent");
  await tickets.setPriority(sql, asMember(ines), low.number, "low");
  await assert.rejects(tickets.setPriority(sql, asMember(lea), calm.number, "high"), refused("forbidden"));
  await assert.rejects(tickets.setPriority(sql, asMember(hugo), calm.number, "critical"), refused("invalid"));
  await assert.rejects(tickets.setPriority(sql, asMember(hugo), 99999, "high"), refused("not_found"));
  const urgent = await tickets.listTickets(sql, asMember(lea), "open", undefined, { priority: "urgent" });
  assert.deepEqual(urgent.map(r => r.number), [fire.number]);
  // An unknown priority filters nothing.
  assert.ok((await tickets.listTickets(sql, asMember(lea), "open", undefined, { priority: "x" })).length >= 3);
  // Most urgent first; lowest last; waiting longest breaks ties.
  const sorted = (await tickets.listTickets(sql, asMember(lea), "open", undefined, { sort: "priority" })).map(r => r.number);
  assert.equal(sorted[0], fire.number);
  assert.equal(sorted.at(-1), low.number);
  // The default order (waiting longest) is not changed by a priority.
  const natural = (await tickets.listTickets(sql, asMember(lea), "open")).map(r => r.number);
  assert.ok(natural.indexOf(calm.number) < natural.indexOf(fire.number));
});

test("tags: created on the fly, one per name whatever its case, ten a ticket, filter the inbox", async () => {
  const { sql } = database;
  const a = await open();
  const b = await open();
  const refund = await tickets.addTag(sql, asMember(hugo), a.number, "  Refund ");
  assert.equal(refund.name, "Refund");
  const again = await tickets.addTag(sql, asMember(ines), b.number, "refund");
  assert.deepEqual(again, refund);
  await tickets.addTag(sql, asMember(hugo), a.number, "REFUND");
  assert.deepEqual((await tickets.ticket(sql, asMember(lea), a.number)).tags, [refund]);
  await assert.rejects(tickets.addTag(sql, asMember(lea), a.number, "Nope"), refused("forbidden"));
  await assert.rejects(tickets.addTag(sql, asMember(hugo), a.number, " "), refused("empty"));
  await assert.rejects(tickets.addTag(sql, asMember(hugo), a.number, "x".repeat(31)), refused("too_long"));
  for (let i = 1; i < 10; i++) await tickets.addTag(sql, asMember(hugo), a.number, `Tag ${i}`);
  await assert.rejects(tickets.addTag(sql, asMember(hugo), a.number, "Eleventh"), refused("too_many"));
  // A tag the ticket already has is not an eleventh.
  await tickets.addTag(sql, asMember(hugo), a.number, "Tag 9");
  // The inbox by tag: in a folder, or every ticket (no folder).
  const inOpen = await tickets.listTickets(sql, asMember(lea), "open", undefined, { tag: refund.id });
  assert.deepEqual(inOpen.map(r => r.number).sort(), [a.number, b.number].sort());
  assert.ok(inOpen.find(r => r.number === b.number)!.tags.some(g => g.name === "Refund"));
  await tickets.setStatus(sql, asMember(hugo), b.number, "closed");
  assert.deepEqual((await tickets.listTickets(sql, asMember(lea), "open", undefined, { tag: refund.id })).map(r => r.number), [a.number]);
  assert.deepEqual((await tickets.listTickets(sql, asMember(lea), "all", undefined, { tag: refund.id })).map(r => r.number).sort(), [a.number, b.number].sort());
  assert.deepEqual(await tickets.listTickets(sql, asMember(lea), "all", undefined, { tag: "nonsense" }), []);
  await tickets.removeTag(sql, asMember(ines), a.number, refund.id);
  assert.ok(!(await tickets.ticket(sql, asMember(lea), a.number)).tags.some(g => g.id === refund.id));
  await assert.rejects(tickets.removeTag(sql, asMember(lea), b.number, refund.id), refused("forbidden"));
  const list = await tickets.tags(sql, asMember(lea));
  assert.equal(list.find(g => g.id === refund.id)?.tickets, 1);
});

test("an admin renames (merging into a tag of that name) and deletes tags, with undo", async () => {
  const { sql } = database;
  const a = await open();
  const b = await open();
  const late = await tickets.addTag(sql, asMember(hugo), a.number, "Late");
  const delay = await tickets.addTag(sql, asMember(hugo), b.number, "Delay");
  await tickets.addTag(sql, asMember(hugo), a.number, "Delay");
  await assert.rejects(tickets.renameTag(sql, asMember(hugo), late.id, "Late delivery"), refused("forbidden"));
  assert.equal((await tickets.renameTag(sql, asMember(camille), late.id, "Late delivery")).name, "Late delivery");
  assert.deepEqual((await tickets.ticket(sql, asMember(lea), a.number)).tags.map(g => g.name), ["Delay", "Late delivery"]);
  // Renamed to a name that exists: one tag, on both tickets, once each.
  const merged = await tickets.renameTag(sql, asMember(camille), late.id, "delay");
  assert.deepEqual(merged, delay);
  assert.deepEqual((await tickets.ticket(sql, asMember(lea), a.number)).tags, [delay]);
  assert.ok(!(await tickets.tags(sql, asMember(lea))).some(g => g.id === late.id));
  await assert.rejects(tickets.renameTag(sql, asMember(camille), late.id, "Gone"), refused("not_found"));
  await assert.rejects(tickets.deleteTag(sql, asMember(ines), delay.id), refused("forbidden"));
  const gone = await tickets.deleteTag(sql, asMember(camille), delay.id);
  assert.equal(gone.name, "Delay");
  assert.equal(gone.tickets.length, 2);
  assert.deepEqual((await tickets.ticket(sql, asMember(lea), b.number)).tags, []);
  await assert.rejects(tickets.restoreTag(sql, asMember(hugo), gone), refused("forbidden"));
  const back = await tickets.restoreTag(sql, asMember(camille), gone);
  assert.deepEqual((await tickets.ticket(sql, asMember(lea), a.number)).tags, [back]);
  assert.deepEqual((await tickets.ticket(sql, asMember(lea), b.number)).tags, [back]);
  await assert.rejects(tickets.restoreTag(sql, asMember(camille), { name: "X", tickets: ["abc"] }), refused("not_found"));
  // The export says both.
  await tickets.setPriority(sql, asMember(hugo), a.number, "high");
  const row = (await tickets.exportRows(sql, asMember(hugo))).find(r => r.number === a.number)!;
  assert.deepEqual([row.priority, row.tags], ["high", ["Delay"]]);
});

test("waiting since: the customer's first unanswered message; a reply ends it; a note does not", async () => {
  const { sql } = database;
  const t = await open();
  const first = (await tickets.ticket(sql, asMember(hugo), t.number)).waitingSince;
  assert.ok(first);
  await sql`update tickets set waiting_since = now() - interval '30 hours' where number = ${t.number}`;
  await tickets.customerReply(sql, t.secret, "Any news?");
  const still = (await tickets.ticket(sql, asMember(hugo), t.number)).waitingSince!;
  assert.ok(Date.now() - new Date(still).getTime() > 29 * 3600000, "still waiting since the first message");
  await tickets.note(sql, asMember(hugo), t.number, "Checking with the workshop");
  assert.equal((await tickets.ticket(sql, asMember(hugo), t.number)).waitingSince, still);
  const answered = await tickets.reply(sql, asMember(hugo), t.number, "Here is the news.");
  assert.equal(answered.ticket.waitingSince, null);
  assert.equal((await tickets.ticket(sql, asMember(hugo), t.number)).waitingSince, null);
  await tickets.customerReply(sql, t.secret, "Thanks, one more question");
  const again = (await tickets.ticket(sql, asMember(hugo), t.number)).waitingSince!;
  assert.ok(Date.now() - new Date(again).getTime() < 60000, "a new wait starts");
  // Closed without an answer, then the customer writes: a new wait.
  await sql`update tickets set waiting_since = now() - interval '3 days' where number = ${t.number}`;
  await tickets.setStatus(sql, asMember(hugo), t.number, "closed");
  assert.equal((await tickets.ticket(sql, asMember(hugo), t.number)).waitingSince, null, "shown on open tickets only");
  await tickets.customerReply(sql, t.secret, "Hello again");
  assert.ok(Date.now() - new Date((await tickets.ticket(sql, asMember(hugo), t.number)).waitingSince!).getTime() < 60000);
  // The inbox puts who has waited longest first.
  const older = await open();
  await sql`update tickets set waiting_since = now() - interval '10 days', updated_at = now() where number = ${older.number}`;
  assert.equal((await tickets.listTickets(sql, asMember(hugo), "open"))[0]?.number, older.number);
});

test("the threshold: an admin sets it (hours, or never); how long reads in whole units", async () => {
  const { sql } = database;
  assert.equal((await tickets.settings(sql)).lateHours, 24);
  await assert.rejects(tickets.saveSettings(sql, asMember(hugo), { lateHours: 4 }), refused("forbidden"));
  await assert.rejects(tickets.saveSettings(sql, asMember(camille), { lateHours: 5 }), refused("invalid"));
  await assert.rejects(tickets.saveSettings(sql, asMember(camille), { lateHours: "x" }), refused("invalid"));
  await tickets.saveSettings(sql, asMember(camille), { lateHours: 0 });
  assert.equal((await tickets.settings(sql)).lateHours, 0);
  await tickets.saveSettings(sql, asMember(camille), { lateHours: 48 });
  assert.equal((await tickets.settings(sql)).lateHours, 48);
  const now = new Date("2026-09-28T12:00:00Z");
  assert.deepEqual(waited("2026-09-28T11:59:40Z", now), { unit: "minute", count: 1 });
  assert.deepEqual(waited("2026-09-28T11:15:00Z", now), { unit: "minute", count: 45 });
  assert.deepEqual(waited("2026-09-27T09:00:00Z", now), { unit: "hour", count: 27 });
  assert.deepEqual(waited("2026-09-25T12:00:00Z", now), { unit: "day", count: 3 });
  assert.equal(isLate("2026-09-27T11:00:00Z", 24, now), true);
  assert.equal(isLate("2026-09-27T13:00:00Z", 24, now), false);
  assert.equal(isLate("2026-09-20T13:00:00Z", 0, now), false);
  assert.equal(isLate(null, 1, now), false);
});

test("the migration starts the wait of open tickets already there", async () => {
  const old = await testDatabase({ upTo: "0001_support.sql" });
  try {
    const { sql } = old;
    const ticket = async (status: string) => (await sql<{ id: string }[]>`insert into tickets (number, subject, status, customer_email, channel, secret_hash) values (nextval('ticket_numbers'), 'S', ${status}, 'x@example.com', 'form', ${String(Math.random())}) returning id`)[0]!.id;
    const unanswered = await ticket("open"), answered = await ticket("open"), waiting = await ticket("waiting");
    await sql`insert into messages (ticket_id, kind, body, created_at) values
      (${unanswered}, 'customer', 'a', now() - interval '5 hours'), (${unanswered}, 'customer', 'b', now() - interval '1 hour'),
      (${answered}, 'customer', 'a', now() - interval '5 hours'), (${answered}, 'reply', 'r', now() - interval '4 hours'), (${answered}, 'customer', 'c', now() - interval '2 hours'),
      (${waiting}, 'customer', 'a', now() - interval '5 hours')`;
    await migrate(sql);
    const since = async (id: string) => (await sql<{ h: number | null }[]>`select round(extract(epoch from now() - waiting_since) / 3600)::int as h from tickets where id = ${id}`)[0]!.h;
    assert.equal(await since(unanswered), 5);
    assert.equal(await since(answered), 2);
    assert.equal(await since(waiting), null);
    assert.equal((await sql<{ priority: string }[]>`select priority from tickets where id = ${unanswered}`)[0]!.priority, "normal");
  } finally {
    await old.close();
  }
});
