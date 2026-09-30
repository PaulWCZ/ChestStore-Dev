import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as contacts from "../lib/contacts.ts";
import * as deals from "../lib/deals.ts";
import { en } from "../lib/i18n/en.ts";
import { fr } from "../lib/i18n/fr.ts";
import { leave } from "../lib/lifecycle.ts";
import { addDays, today } from "../lib/model.ts";
import { calendarWorks, publishStep, reconcile } from "../lib/step-calendar.ts";
import * as steps from "../lib/steps.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

// Timed next steps in their owner's Chest calendar (Proposal (studio): the
// calendar bridge): put when planned with a time, changed with the step,
// taken out when done, deleted, moved to no time, or left to nobody.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  process.env["CHEST_TIMEZONE"] = "Europe/Paris";
  chest = await fakeChest({ members: everyone, capabilities: ["members", "notifications", "files", "calendar"] });
});
after(async () => {
  await chest.close();
  await database.close();
});

const day = addDays(today(), 3);

test("a step with a time goes into its owner's calendar, in both languages, 30 minutes", async () => {
  const { sql } = database;
  const d = await deals.addDeal(sql, asMember(ines), { title: "Showroom lighting" });
  const { step } = await steps.addStep(sql, asMember(ines), { deal: d.id }, { text: "Call Claire", due: day, time: "14:30" });
  await publishStep(sql, step.id);
  const event = chest.calendar.get(`step:${step.id}`);
  assert.ok(event && "start" in event);
  assert.deepEqual(event.members, [ines.id]);
  assert.equal(event.title.en, "Call Claire · Showroom lighting");
  assert.equal(event.title.fr, "Call Claire · Showroom lighting");
  assert.equal(event.description?.fr, fr.calendar.description);
  assert.equal(event.path, `/chest/deals/${d.id}`);
  // 14:30 in Paris, whatever the season, for 30 minutes.
  const start = new Date(event.start);
  assert.equal(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(start), "14:30");
  assert.equal(new Date(event.end).getTime() - start.getTime(), 30 * 60_000);
  assert.equal(await calendarWorks(sql), true);
  // Changed with the step, given to someone else: moved to their calendar.
  await steps.updateStep(sql, asMember(camille), step.id, { text: "Call Claire back", due: day, time: "16:00", owner: hugo.id });
  await publishStep(sql, step.id);
  const moved = chest.calendar.get(`step:${step.id}`)!;
  assert.deepEqual(moved.members, [hugo.id]);
  assert.equal(moved.title.en, "Call Claire back · Showroom lighting");
  assert.equal(moved.sequence, 1);
  // Done: out of the calendar; reopened (Undo): back.
  await steps.completeStep(sql, asMember(hugo), step.id);
  await publishStep(sql, step.id);
  assert.equal(chest.calendar.has(`step:${step.id}`), false);
  await steps.reopenStep(sql, asMember(hugo), step.id);
  await publishStep(sql, step.id);
  assert.equal(chest.calendar.has(`step:${step.id}`), true);
  // No time any more: a to-do, not an appointment.
  await steps.updateStep(sql, asMember(camille), step.id, { text: "Call Claire back", due: day, time: null });
  await publishStep(sql, step.id);
  assert.equal(chest.calendar.has(`step:${step.id}`), false);
});

test("a step without a time, or of one's own without a time, stays out", async () => {
  const { sql } = database;
  const { step } = await steps.addStep(sql, asMember(ines), null, { text: "Prepare the stand", due: day });
  await publishStep(sql, step.id);
  assert.equal(chest.calendar.has(`step:${step.id}`), false);
  const own = await steps.addStep(sql, asMember(ines), null, { text: "Dentist", due: day, time: "09:00" });
  await publishStep(sql, own.step.id);
  const event = chest.calendar.get(`step:${own.step.id}`)!;
  assert.equal(event.title.en, "Dentist");
  assert.equal(event.path, "/chest");
});

test("what goes in bulk is caught up: a deal deleted, a contact deleted, a member gone", async () => {
  const { sql } = database;
  const d = await deals.addDeal(sql, asMember(ines), { title: "Reception desk" });
  const a = await steps.addStep(sql, asMember(ines), { deal: d.id }, { text: "Send the plan", due: day, time: "10:00" });
  const c = await contacts.addContact(sql, asMember(ines), { name: "Paul Girard" });
  const b = await steps.addStep(sql, asMember(ines), { contact: c.id }, { text: "Ask for the budget", due: day, time: "11:00" });
  const h = await steps.addStep(sql, asMember(hugo), null, { text: "Hugo's own", due: day, time: "12:00" });
  const first = await reconcile(sql);
  assert.ok(first.put >= 3);
  assert.equal((await reconcile(sql)).put, 0, "nothing changed: nothing put again");
  await deals.deleteDeal(sql, asMember(ines), d.id);
  await contacts.deleteContact(sql, asMember(ines), c.id);
  await leave(sql, hugo.id);
  const done = await reconcile(sql);
  assert.equal(done.removed, 3);
  for (const s of [a.step, b.step, h.step]) assert.equal(chest.calendar.has(`step:${s.id}`), false);
  // A contact renamed: its steps' titles follow.
  const c2 = await contacts.addContact(sql, asMember(ines), { name: "Anne Petit" });
  const s2 = await steps.addStep(sql, asMember(ines), { contact: c2.id }, { text: "Call", due: day, time: "15:00" });
  await publishStep(sql, s2.step.id);
  await contacts.updateContact(sql, asMember(ines), c2.id, { name: "Anne Petit-Roux" });
  await reconcile(sql);
  assert.equal(chest.calendar.get(`step:${s2.step.id}`)!.title.en, "Call · Anne Petit-Roux");
});

test("a first sync goes in batches of 100 (calendar.putMany, SDK studio.15); the Chest answers each event (studio.16): a refused step is not remembered, the others are", async () => {
  const { sql } = database;
  await reconcile(sql);
  const made: string[] = [];
  for (let i = 0; i < 230; i++) made.push((await steps.addStep(sql, asMember(i % 2 ? ines : hugo), null, { text: `Call ${i}`, due: day, time: "09:00" })).step.id);
  // One of them three years ahead (as an old import may hold): the Chest
  // refuses that event alone.
  await sql`update steps set due_on = due_on + interval '3 years' where id = ${made[150]!}`;
  const calls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.url.startsWith(chest.api) && new URL(request.url).pathname.startsWith("/calendar/events")) calls.push(`${request.method} ${new URL(request.url).pathname}`);
    return real(input, init);
  }) as typeof fetch;
  let done;
  try {
    done = await reconcile(sql);
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(done.put, 229);
  for (const id of made) assert.equal(chest.calendar.has(`step:${id}`), id !== made[150], id);
  // The steps go by day: three batches (100, 100, 30); the last holds the
  // refused one, and still goes in one call — no step sent one by one.
  assert.deepEqual(calls, ["PUT /calendar/events", "PUT /calendar/events", "PUT /calendar/events"]);
  assert.equal(await calendarWorks(sql), true);
  // Only what the Chest took is remembered as put.
  const remembered = new Set((await sql<{ step_id: string }[]>`select step_id::text as step_id from step_events where step_id = any(${made}::bigint[])`).map(r => r.step_id));
  assert.equal(remembered.size, 229);
  assert.equal(remembered.has(made[150]!), false, "the refused step is not taken for put");
  // Nothing changed: only the refused one is tried again, and still refused.
  assert.equal((await reconcile(sql)).put, 0);
  // Brought back within reach: put at the next run.
  await sql`update steps set due_on = due_on - interval '3 years' where id = ${made[150]!}`;
  assert.equal((await reconcile(sql)).put, 1);
  assert.equal(chest.calendar.has(`step:${made[150]!}`), true);
  await sql`delete from steps where id = any(${made}::bigint[])`;
  await reconcile(sql);
});

test("a Chest without the calendar: the steps stand, the tool knows it", async () => {
  const { sql } = database;
  const other = await fakeChest({ members: everyone, capabilities: ["members", "notifications", "files"] });
  try {
    const { step } = await steps.addStep(sql, asMember(ines), null, { text: "Somewhere", due: day, time: "08:00" });
    await publishStep(sql, step.id);
    assert.equal(await calendarWorks(sql), false);
    assert.equal(other.calendar.size, 0);
    // A run tries once, not once per step.
    const run = await reconcile(sql);
    assert.equal(run.put, 0);
  } finally {
    await other.close();
  }
  assert.equal(en.step.inCalendar.length > 0, true);
});
