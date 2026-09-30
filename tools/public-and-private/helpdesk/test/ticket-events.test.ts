import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST as JOB } from "../app/chest-jobs/[name]/route.ts";
import { erase } from "../lib/lifecycle.ts";
import { forgetTicketEvents, occurredAtFor, publishTicketEvents, ticketEventTypes } from "../lib/ticket-events.ts";
import * as tickets from "../lib/tickets.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

// Support → Goals ("Tickets solved"): helpdesk.ticket.solved {ticket,
// assignee} when a ticket is solved, helpdesk.ticket.reopened {ticket}
// when a solved one leaves "closed" — whatever the path (a reply that
// closes, bulk and its Undo, the customer writing again), once each, and
// again later when the Chest could not take them. The contract is Goals'
// (tools/private/goals/README.md, "With the other tools").

let database: TestDatabase;
let chest: FakeChest;
const chestWith = (emits: string[]) => fakeChest({ chest: { timeZone: "Europe/Paris" }, 
  tool: "helpdesk", members: everyone, emits, capabilities: ["members", "files", "notifications"],
  schedules: [{ name: "cleanup", cron: "15 3 * * *" }, { name: "late", cron: "*/15 * * * *" }],
  chest: { timeZone: "Europe/Paris", organization: "Atelier Martin", language: "en" },
});
before(async () => {
  database = await testDatabase();
  chest = await chestWith([...ticketEventTypes]);
});
after(async () => {
  await chest.close();
  await database.close();
});

const answers = async () => true;
const request = (subject: string) => tickets.fromForm(database.sql, { name: "Jean Petit", email: "jean@example.com", subject, message: "It flickers.", language: "en" });
const fromNow = () => chest.published.length;
const since = (start: number) => chest.published.slice(start).map(e => ({ type: e.type, data: e.data }));
const keyPattern = (ticket: number, what: "solved" | "reopened") => new RegExp(`^helpdesk:${ticket}:${what}:\\d{13}$`, "u");

test("the manifest's proposals declare the two events Goals reads", () => {
  const proposals = JSON.parse(readFileSync(join(import.meta.dirname, "..", "chest.proposals.json"), "utf8"));
  assert.deepEqual(proposals.emits, ["helpdesk.ticket.solved", "helpdesk.ticket.reopened"]);
});

test("a reply that closes solves the ticket, for the agent who answered; the customer writing again reopens it", async () => {
  const { sql } = database;
  const t = await request("Broken lamp");
  let start = fromNow();
  await tickets.reply(sql, asMember(hugo), t.number, "A new bulb is on its way.", { close: true });
  assert.equal(await publishTicketEvents(sql), 1);
  assert.deepEqual(since(start), [{ type: "helpdesk.ticket.solved", data: { ticket: String(t.number), assignee: hugo.id } }]);
  assert.match(chest.published.at(-1)!.key!, keyPattern(t.number, "solved"));
  assert.equal(await publishTicketEvents(sql), 0, "told once");

  start = fromNow();
  await tickets.customerReply(sql, t.secret, "Still dark, sorry.");
  assert.equal(await publishTicketEvents(sql), 1);
  assert.deepEqual(since(start), [{ type: "helpdesk.ticket.reopened", data: { ticket: String(t.number) } }]);
  assert.match(chest.published.at(-1)!.key!, keyPattern(t.number, "reopened"));

  // Solved again: published again, under a new key (Goals keeps the latest).
  const keys = new Set(chest.published.map(e => e.key));
  await tickets.reply(sql, asMember(ines), t.number, "Fixed on site.", { close: true });
  await publishTicketEvents(sql);
  const again = chest.published.at(-1)!;
  assert.deepEqual({ type: again.type, data: again.data }, { type: "helpdesk.ticket.solved", data: { ticket: String(t.number), assignee: hugo.id } }, "the ticket's agent");
  assert.ok(!keys.has(again.key), "a new key");
});

test("the status menu and bulk: closed is solved (null when nobody had it); Undo reopens; open ↔ waiting says nothing", async () => {
  const { sql } = database;
  const a = await request("Invoice missing");
  const b = await request("Wrong size");
  await tickets.setStatus(sql, asMember(camille), a.number, "waiting");
  await tickets.setStatus(sql, asMember(camille), a.number, "open");
  assert.equal(await publishTicketEvents(sql), 0, "not solved");

  const start = fromNow();
  const done = await tickets.bulk(sql, asMember(camille), [a.number, b.number], { kind: "status", status: "closed" }, answers);
  await publishTicketEvents(sql);
  assert.deepEqual(since(start).sort((x, y) => String(x.data["ticket"]).localeCompare(String(y.data["ticket"]))), [
    { type: "helpdesk.ticket.solved", data: { ticket: String(a.number), assignee: null } },
    { type: "helpdesk.ticket.solved", data: { ticket: String(b.number), assignee: null } },
  ]);
  const mid = fromNow();
  await tickets.unbulk(sql, asMember(camille), done.before);
  await publishTicketEvents(sql);
  assert.deepEqual(since(mid).map(e => e.type), ["helpdesk.ticket.reopened", "helpdesk.ticket.reopened"]);

  // A solved ticket marked as spam is taken back; closing spam solves nothing.
  await tickets.setStatus(sql, asMember(camille), a.number, "closed");
  await tickets.setStatus(sql, asMember(camille), a.number, "spam");
  await tickets.setStatus(sql, asMember(camille), a.number, "closed");
  const last = fromNow();
  await publishTicketEvents(sql);
  assert.deepEqual(since(last).map(e => e.type), ["helpdesk.ticket.solved", "helpdesk.ticket.reopened"]);
});

test("a duplicate closed by a merge is not solved", async () => {
  const { sql } = database;
  const a = await request("Order 88");
  const b = await request("Order 88 again");
  const start = fromNow();
  await tickets.merge(sql, asMember(camille), b.number, a.number);
  await publishTicketEvents(sql);
  assert.deepEqual(since(start), []);
});

test("a Chest that refuses the events: the action is kept, the events wait, and the late schedule tells them once", async () => {
  const { sql } = database;
  const t = await request("No invoice");
  await chest.close();
  chest = await chestWith([]);
  await tickets.reply(sql, asMember(hugo), t.number, "Here it is.", { close: true });
  assert.equal(await publishTicketEvents(sql), 0);
  assert.equal(chest.published.length, 0);
  assert.equal((await tickets.byLink(sql, t.secret))?.status, "closed", "the reply is kept");

  await chest.close();
  chest = await chestWith([...ticketEventTypes]);
  assert.equal(await chest.run("late", JOB), 204);
  assert.deepEqual(chest.published.map(e => ({ type: e.type, data: e.data })), [{ type: "helpdesk.ticket.solved", data: { ticket: String(t.number), assignee: hugo.id } }]);
  assert.equal(await chest.run("late", JOB), 204);
  assert.equal(chest.published.length, 1, "once");
});

test("erased: the agent's id leaves what waits; what was told a day ago, or refused for a week, is forgotten", async () => {
  const { sql } = database;
  const t = await request("Parcel lost");
  await tickets.reply(sql, asMember(ines), t.number, "Sent again.", { close: true });
  await erase(sql, ines.id);
  const [waiting] = await sql<{ assignee: string | null }[]>`select assignee from ticket_events where published_at is null and ticket = ${t.number}`;
  assert.equal(waiting!.assignee, null);
  await publishTicketEvents(sql);
  assert.deepEqual(chest.published.at(-1)!.data, { ticket: String(t.number), assignee: null });

  await sql`insert into ticket_events (type, ticket, at) values ('helpdesk.ticket.reopened', 1, now() - interval '8 days')`;
  const [stored] = await sql<{ n: number }[]>`select count(*)::int as n from ticket_events`;
  assert.ok(stored!.n > 1);
  await forgetTicketEvents(sql, new Date(Date.now() + 2 * 86_400_000));
  const [left] = await sql<{ n: number }[]>`select count(*)::int as n from ticket_events`;
  assert.equal(left!.n, 0);
});

// studio.16: the Chest keeps when it happened (occurredAt), so Goals counts
// a ticket solved late on a cycle's last day in that cycle even when it is
// told after midnight. Within 24 hours the true time goes with it; older (a
// Chest down for a night), it goes without — the Chest refuses older times.
test("a late event carries when the ticket was solved; one older than a day goes without it", async () => {
  const { sql } = database;
  const recent = await request("Late by forty minutes");
  const old = await request("Late by a day and more");
  await chest.close();
  chest = await chestWith([]);
  await tickets.reply(sql, asMember(hugo), recent.number, "Done.", { close: true });
  await tickets.reply(sql, asMember(hugo), old.number, "Done too.", { close: true });
  assert.equal(await publishTicketEvents(sql), 0);
  const solvedAt = new Date(Date.now() - 40 * 60_000);
  await sql`update ticket_events set at = ${solvedAt} where ticket = ${recent.number} and published_at is null`;
  await sql`update ticket_events set at = ${new Date(Date.now() - 25 * 3_600_000)} where ticket = ${old.number} and published_at is null`;

  await chest.close();
  chest = await chestWith([...ticketEventTypes]);
  assert.equal(await chest.run("late", JOB), 204);
  const late = chest.published.find(e => e.data["ticket"] === String(recent.number))!;
  assert.equal(late.occurredAt, solvedAt.toISOString(), "the real time of the change");
  assert.match(late.key!, new RegExp(`:${solvedAt.getTime()}$`, "u"));
  const older = chest.published.find(e => e.data["ticket"] === String(old.number))!;
  assert.ok(older, "an event older than a day is still told");
  assert.ok(Date.now() - new Date(older.occurredAt).getTime() < 60_000, "without its time: the Chest's own");
  // The helper, at its edges.
  const now = Date.parse("2026-09-30T12:00:00Z");
  assert.ok(occurredAtFor(new Date(now - 23 * 3_600_000), now));
  assert.equal(occurredAtFor(new Date(now - 24 * 3_600_000), now), undefined);
  assert.equal(occurredAtFor(new Date(now - 23 * 3_600_000 - 56 * 60_000), now), undefined, "five minutes of margin for the clocks");
});
