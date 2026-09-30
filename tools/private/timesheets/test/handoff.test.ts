import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import { addDays, mondayOf, todayIn } from "../lib/days.ts";
import * as entries from "../lib/entries.ts";
import * as handoff from "../lib/handoff.ts";
import * as projects from "../lib/projects.ts";
import { foundEntries, report } from "../lib/reports.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";
import { refused } from "./support/refused.ts";

// Billable time to Quotes (events between tools), and the notes' search.
let database: TestDatabase;
let chest: FakeChest;
// The fake Chest's day (its zone, UTC, is the test database's too).
const monday = mondayOf(todayIn("UTC"));
const from = addDays(monday, -14), to = addDays(monday, -8);
before(async () => {
  database = await testDatabase();
  process.env["CHEST_TOOL"] = "timesheets";
  chest = await fakeChest({ members: everyone, emits: ["timesheets.billable", "timesheets.billable_cancelled"], receivers: 1 });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("a project's billable time of a period goes to Quotes once, as lines per task and rate; Quotes' answer invoices it", async () => {
  const { sql } = database;
  const m = asMember(camille);
  const site = await projects.createProject(sql, m, { newClient: "Boulangerie Durand", name: "Site vitrine", rateCents: 9000, tasks: ["Design", "Développement"] });
  const [design, dev] = site.tasks;
  const a = await entries.addEntry(sql, asMember(hugo), { projectId: site.id, taskId: design!.id, day: from, minutes: 90, note: "Maquettes" });
  await entries.addEntry(sql, asMember(ines), { projectId: site.id, taskId: design!.id, day: addDays(from, 1), minutes: 30 });
  await entries.addEntry(sql, asMember(hugo), { projectId: site.id, taskId: dev!.id, day: addDays(from, 2), minutes: 120 });
  await entries.addEntry(sql, asMember(hugo), { projectId: site.id, day: addDays(from, 3), minutes: 60, billable: false });
  const later = await entries.addEntry(sql, asMember(hugo), { projectId: site.id, day: addDays(to, 1), minutes: 45 });
  // Only managers; a period is checked.
  await assert.rejects(handoff.sendBillable(sql, asMember(hugo), { projectId: site.id, from, to }), refused("forbidden"));
  await assert.rejects(handoff.sendBillable(sql, m, { projectId: site.id, from: to, to: from }), refused("bad_period"));
  assert.deepEqual((await handoff.sendable(sql, m, from, to)).map(s => [s.projectName, s.minutes, s.cents, s.entries]), [["Site vitrine", 240, 36000, 3]]);
  const sent = await handoff.sendBillable(sql, m, { projectId: site.id, from, to });
  assert.deepEqual([sent.entries, sent.minutes, sent.receivers], [3, 240, 1]);
  const event = chest.published.at(-1)!;
  assert.equal(event.type, "timesheets.billable");
  const [made] = await sql<{ sent_at: Date }[]>`select sent_at from handoffs where id = ${sent.handoff}`;
  assert.equal(event.key, `timesheets:billable:${sent.handoff}:${made!.sent_at.getTime()}`, "the key carries when it was made");
  assert.equal(event.occurredAt, made!.sent_at.toISOString(), "occurredAt: when it was made (studio.16)");
  const data = event.data as unknown as handoff.Billable;
  assert.equal(data.version, 1);
  assert.deepEqual(data.project, { id: site.id, name: "Site vitrine" });
  assert.equal(data.client?.name, "Boulangerie Durand");
  assert.deepEqual(data.period, { from, to });
  assert.deepEqual([data.currency, data.minutes, data.amount, data.entries], ["EUR", 240, 36000, 3]);
  assert.deepEqual(data.lines.map(l => [l.label, l.minutes, l.rate, l.amount, l.entries]), [["Design", 120, 9000, 18000, 2], ["Développement", 120, 9000, 18000, 1]]);
  assert.ok(!JSON.stringify(data).includes("Hugo"), "people are never named in the event");
  // Sent: never twice; locked while it waits; nothing left to send.
  assert.deepEqual(await handoff.sendable(sql, m, from, to), []);
  await assert.rejects(handoff.sendBillable(sql, m, { projectId: site.id, from, to }), refused("nothing_to_send"));
  await assert.rejects(entries.updateEntry(sql, asMember(hugo), a.id, { projectId: site.id, taskId: design!.id, day: from, minutes: 60 }), refused("invoiced"));
  await assert.rejects(entries.deleteEntry(sql, asMember(hugo), a.id), refused("invoiced"));
  // Taken back: free again, Quotes told; sent again, a new hand-off.
  await assert.rejects(handoff.cancelHandoff(sql, asMember(hugo), sent.handoff), refused("forbidden"));
  await handoff.cancelHandoff(sql, m, sent.handoff);
  assert.deepEqual(chest.published.at(-1)!.type, "timesheets.billable_cancelled");
  const [gone] = await sql<{ cancelled_at: Date }[]>`select cancelled_at from handoffs where id = ${sent.handoff}`;
  assert.equal(chest.published.at(-1)!.key, `timesheets:billable:${sent.handoff}:${made!.sent_at.getTime()}:cancelled`);
  assert.equal(chest.published.at(-1)!.occurredAt, gone!.cancelled_at.toISOString());
  await assert.rejects(handoff.cancelHandoff(sql, m, sent.handoff), refused("handoff_state"));
  await entries.updateEntry(sql, asMember(hugo), a.id, { projectId: site.id, taskId: design!.id, day: from, minutes: 60, note: "Maquettes" });
  const again = await handoff.sendBillable(sql, m, { projectId: site.id, from, to });
  assert.notEqual(again.handoff, sent.handoff);
  assert.equal(again.minutes, 210);
  // Quotes answers: the time is invoiced (rates written on it), once.
  const answer = { type: "quotes.invoiced" as const, source: "quotes", data: { handoff: again.handoff, invoice: "F2026-014", path: "/chest/invoices/14" } };
  assert.equal(await chest.deliver(answer, POST), 204);
  assert.equal(await chest.deliver(answer, POST), 204);
  const rows = await sql<{ n: number }[]>`select count(*)::int as n from entries where handoff_id = ${again.handoff} and invoiced_at is not null and rates_fixed and bill_rate_cents = 9000`;
  assert.equal(rows[0]!.n, 3);
  const listed = (await handoff.recentHandoffs(sql, m)).find(h => h.id === again.handoff)!;
  assert.deepEqual([listed.invoiced, listed.invoiceRef], [true, "F2026-014"]);
  await assert.rejects(handoff.cancelHandoff(sql, m, again.handoff), refused("handoff_state"));
  // Time after the period, and non-billable time, were never part of it.
  assert.equal((await sql<{ h: string | null }[]>`select handoff_id::text as h from entries where id = ${later.id}`)[0]!.h, null);
  // An answer for no hand-off, or malformed, changes nothing.
  assert.equal(await handoff.invoiced(sql, { handoff: "999999" }), false);
  assert.equal(await handoff.invoiced(sql, { handoff: "x; drop table" }), false);
});

test("the notes' search: the report, the entries found and the CSV follow it; a member finds only their own", async () => {
  const { sql } = database;
  const p = await projects.createProject(sql, asMember(camille), { name: "Tournage parc" });
  const day = addDays(monday, -30);
  await entries.addEntry(sql, asMember(hugo), { projectId: p.id, day, minutes: 150, note: "Repérage au parc Montsouris" });
  await entries.addEntry(sql, asMember(ines), { projectId: p.id, day, minutes: 60, note: "Repérage lumière" });
  await entries.addEntry(sql, asMember(hugo), { projectId: p.id, day, minutes: 30, note: "Montage" });
  const q = { from: addDays(day, -1), to: addDays(day, 1), q: "repérage" };
  assert.equal((await report(sql, asMember(camille), q)).minutes, 210);
  assert.deepEqual((await foundEntries(sql, asMember(camille), q)).map(f => f.note).sort(), ["Repérage au parc Montsouris", "Repérage lumière"]);
  assert.deepEqual((await foundEntries(sql, asMember(hugo), q)).map(f => f.note), ["Repérage au parc Montsouris"]);
  assert.equal((await report(sql, asMember(camille), { ...q, q: "100%" })).minutes, 0);
  assert.deepEqual(await foundEntries(sql, asMember(camille), { ...q, q: "r" }), []);
});

test("after a restore, a hand-off id given again to other time still reaches Quotes (the key carries when it was made)", async () => {
  const { sql } = database;
  const m = asMember(camille);
  const shop = await projects.createProject(sql, m, { newClient: "Fleurs Martin", name: "Boutique", rateCents: 8000 });
  await entries.addEntry(sql, asMember(hugo), { projectId: shop.id, day: from, minutes: 60 });
  const first = await handoff.sendBillable(sql, m, { projectId: shop.id, from, to });
  // The backup was taken before that hand-off: its id is given again, to other time.
  await sql`update entries set handoff_id = null where handoff_id = ${first.handoff}`;
  await sql`delete from handoffs where id = ${first.handoff}`;
  await sql`select setval(pg_get_serial_sequence('handoffs', 'id'), ${Number(first.handoff) - 1}, ${Number(first.handoff) > 1})`;
  await entries.addEntry(sql, asMember(ines), { projectId: shop.id, day: addDays(from, 1), minutes: 30 });
  const again = await handoff.sendBillable(sql, m, { projectId: shop.id, from, to });
  assert.equal(again.handoff, first.handoff, "the same id, other time");
  assert.equal(again.minutes, 90);
  assert.equal(chest.published.filter(e => e.type === "timesheets.billable" && (e.data as { handoff: string }).handoff === first.handoff).length, 2, "published, not refused as the first one's key");
});

test("occurredAt is given when the Chest would take it: not ahead of this clock, not older than 24 hours less five minutes", () => {
  const now = Date.parse("2026-10-01T10:00:00Z");
  assert.deepEqual(handoff.occurred(new Date(now - 1000), now), { occurredAt: new Date(now - 1000) });
  assert.deepEqual(handoff.occurred(new Date(now + 1000), now), {}, "the database's clock ahead: without it");
  assert.deepEqual(handoff.occurred(new Date(now - 24 * 3600_000 + 60_000), now), {}, "within the margin");
  assert.deepEqual(handoff.occurred(new Date(now - 23 * 3600_000), now), { occurredAt: new Date(now - 23 * 3600_000) });
});
