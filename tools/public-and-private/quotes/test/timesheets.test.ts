import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { chestEvents as POST } from "../src/lib/deliveries.ts";
import { chestSchedules as JOB } from "../src/lib/deliveries.ts";
import { finalise, getDocument } from "../src/lib/documents.ts";
import { handoffOf, invoicedHandoff, occurredAtFor, publishPending, readBillable } from "../src/lib/timesheets.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, lea, sofia } from "./support/members.ts";

// Timesheets → Quotes: the billable time of a project and a period becomes
// one draft invoice per hand-off (never two), for the client of that name;
// taken back, the draft goes (an issued invoice stays, billing told);
// issued, Quotes answers `quotes.invoiced` once.

let database: TestDatabase;
let chest: FakeChest;
// The Chest this tool runs on; `emits: []` plays one that refuses the
// event (not approved yet, or down), as the SDK's publish then throws.
const chestWith = (emits: string[]) => fakeChest({
  tool: "quotes", members: everyone, emits, tools: { timesheets: true }, chest: { organization: "Atelier Martin", currency: "EUR", language: "fr" },
});
before(async () => {
  chest = await chestWith(["quotes.invoiced"]);
  database = await testDatabase();
  await company(database.sql);
  await client(database.sql, { name: "Boulangerie Dupain SAS" });
});
after(async () => {
  await chest.close();
  await database.close();
});

const billable = (handoff: string, extra: Record<string, unknown> = {}) => ({
  version: 1, handoff,
  project: { id: "3", name: "Site vitrine" }, client: { id: "2", name: "boulangerie  DUPAIN sas" },
  period: { from: "2026-09-01", to: "2026-09-30" }, currency: "EUR", minutes: 570, amount: 81000, entries: 14,
  lines: [
    { label: "Design", task: { id: "7", name: "Design" }, minutes: 450, rate: 9000, amount: 67500, entries: 12 },
    { label: "Réunions", task: { id: "8", name: "Réunions" }, minutes: 120, rate: 6750, amount: 13500, entries: 2 },
  ],
  source: { tool: "timesheets", path: "/chest/projects/3" },
  ...extra,
});
const told = (type: "timesheets.billable" | "timesheets.billable_cancelled", data: Record<string, unknown>) => chest.deliver({ type, source: "timesheets", data }, POST);
const draftOf = async (handoff: string) => (await database.sql<{ document_id: number | null }[]>`select document_id from handoffs where handoff = ${handoff}`)[0]?.document_id ?? null;

test("a hand-off becomes one draft invoice for the client of that name, handed to billing, linked back", async () => {
  const { sql } = database;
  const before = chest.notifications.length;
  assert.equal(await told("timesheets.billable", billable("12")), 204);
  const id = await draftOf("12");
  assert.ok(id);
  const full = await getDocument(sql, asMember(lea), id, today);
  assert.equal(full.type, "invoice");
  assert.equal(full.status, "draft");
  assert.equal(full.client?.name, "Boulangerie Dupain SAS", "matched by name, accents and case aside");
  assert.equal(full.createdBy, "tool:timesheets");
  assert.ok(full.readyAt, "handed to billing");
  assert.equal(full.title, "Site vitrine, du 1 septembre 2026 au 30 septembre 2026");
  assert.deepEqual(full.lines.map(l => [l.description, l.quantity, l.unit, l.unitPrice, l.vatRate, l.net]), [
    ["Design", 7500, "heure", 9000, 2000, 67500],
    ["Réunions", 2000, "heure", 6750, 2000, 13500],
  ]);
  assert.equal(full.net, 81000);
  assert.equal(full.gross, 97200);
  const bell = chest.notifications.slice(before);
  assert.deepEqual(new Set(bell.map(n => n.member)), new Set([camille.id, sofia.id]), "billing and admins told");
  assert.equal(bell[0]!.path, `/chest/documents/${id}`);
  assert.deepEqual(await handoffOf(sql, String(id)), { project: "Site vitrine", client: "boulangerie DUPAIN sas", link: "https://timesheets-chest.chest.test/chest/projects/3" });
  // Delivered again: nothing more.
  assert.equal(await told("timesheets.billable", billable("12")), 204);
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from documents where created_by = 'tool:timesheets'`;
  assert.equal(count!.n, 1);
});

test("no client of that name: the draft asks to choose one", async () => {
  const { sql } = database;
  await told("timesheets.billable", billable("13", { client: { id: "9", name: "Studio Inconnu" } }));
  const full = await getDocument(sql, asMember(lea), (await draftOf("13"))!, today);
  assert.equal(full.clientId, null);
  assert.equal((await handoffOf(sql, full.id))?.client, "Studio Inconnu");
});

test("untrusted data: anything of another shape is accepted and ignored", async () => {
  const bad = [
    billable("x1"), billable("0"), billable("14", { version: 2 }), billable("15", { lines: [] }), billable("16", { currency: "euro" }),
    billable("17", { lines: [{ label: "A", minutes: -5, rate: 100 }] }), billable("18", { lines: [{ label: "A", minutes: 60, rate: "9000" }] }),
    billable("19", { project: null }), billable("20", { lines: Array.from({ length: 301 }, () => ({ label: "A", minutes: 60, rate: 1 })) }),
  ];
  for (const data of bad) {
    assert.equal(readBillable(data), null, JSON.stringify(data).slice(0, 80));
    assert.equal(await told("timesheets.billable", data), 204);
  }
  const [n] = await database.sql<{ n: number }[]>`select count(*)::int as n from handoffs where handoff in ('14','15','16','17','18','19','20')`;
  assert.equal(n!.n, 0);
  // A path Timesheets does not serve is dropped; a missing rate is 0.
  const odd = readBillable(billable("21", { source: { path: "//evil.example" }, lines: [{ label: "Sans taux", minutes: 30, rate: null }] }))!;
  assert.equal(odd.path, "");
  assert.deepEqual(odd.lines, [{ label: "Sans taux", minutes: 30, rate: 0 }]);
});

test("taken back before it is issued: the draft goes, and never comes back for that hand-off", async () => {
  const { sql } = database;
  await told("timesheets.billable", billable("30"));
  const id = await draftOf("30");
  assert.ok(id);
  assert.equal(await told("timesheets.billable_cancelled", { version: 1, handoff: "30" }), 204);
  assert.equal(await draftOf("30"), null);
  assert.equal((await sql`select 1 from documents where id = ${id}`).length, 0);
  await told("timesheets.billable", billable("30"));
  assert.equal(await draftOf("30"), null, "the same hand-off never makes a second draft");
});

test("issued: Timesheets hears quotes.invoiced once; taken back after, the invoice stays and billing is told", async () => {
  const { sql } = database;
  await told("timesheets.billable", billable("40"));
  const id = String(await draftOf("40"));
  const issued = await finalise(sql, asMember(sofia), id, today);
  assert.equal(await invoicedHandoff(sql, id, sofia.id), true);
  const sent = chest.published.filter(e => e.type === "quotes.invoiced");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0]!.data, { handoff: "40", invoice: issued.number, path: `/chest/documents/${id}`, by: sofia.id });
  assert.equal(sent[0]!.key, "quotes:invoiced:40");
  assert.equal(await invoicedHandoff(sql, id, sofia.id), false, "once");
  assert.equal(await publishPending(sql), 0);
  const before = chest.notifications.length;
  await told("timesheets.billable_cancelled", { version: 1, handoff: "40" });
  assert.equal((await getDocument(sql, asMember(lea), id, today)).status, "final", "an issued invoice is kept");
  const bell = chest.notifications.slice(before);
  assert.ok(bell.some(n => n.member === sofia.id && n.title.includes(issued.number!) && n.path === `/chest/documents/${id}`), "billing told");
});

test("the Chest refuses quotes.invoiced when the invoice is issued: the next morning's follow-up tells Timesheets, once", async () => {
  const { sql } = database;
  await told("timesheets.billable", billable("50"));
  const id = String(await draftOf("50"));
  await chest.close();
  chest = await chestWith([]);
  const issued = await finalise(sql, asMember(sofia), id, today);
  assert.equal(await invoicedHandoff(sql, id, sofia.id), false, "refused: not told yet");
  assert.equal(chest.published.length, 0);
  const [waiting] = await sql<{ published_at: Date | null }[]>`select published_at from handoffs where handoff = '50'`;
  assert.equal(waiting!.published_at, null, "kept to tell later");
  // The invoice is issued all the same.
  assert.equal((await getDocument(sql, asMember(lea), id, today)).status, "final");

  // The next morning, on a Chest that takes it: the "followup" schedule.
  await chest.close();
  chest = await chestWith(["quotes.invoiced"]);
  assert.equal(await chest.run("followup", JOB), 204);
  const sent = chest.published.filter(e => e.type === "quotes.invoiced");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0]!.data, { handoff: "50", invoice: issued.number, path: `/chest/documents/${id}`, by: sofia.id }, "who issued it, from the invoice");
  assert.equal(sent[0]!.key, "quotes:invoiced:50");
  const [done] = await sql<{ published_at: Date | null }[]>`select published_at from handoffs where handoff = '50'`;
  assert.ok(done!.published_at, "marked told");
  // The follow-up again (or the first visit of the day): nothing more.
  assert.equal(await chest.run("followup", JOB), 204);
  assert.equal(await publishPending(sql), 0);
  assert.equal(chest.published.filter(e => e.type === "quotes.invoiced").length, 1, "published once");
});

test("told late, quotes.invoiced keeps the time the invoice was issued; past 24 hours it goes without it", async () => {
  const { sql } = database;
  // Issued now on a Chest that refused; told 3 hours later.
  await told("timesheets.billable", billable("60"));
  const id = String(await draftOf("60"));
  await finalise(sql, asMember(sofia), id, today);
  const issuedAt = (await sql<{ finalised_at: Date }[]>`select finalised_at from documents where id = ${id}`)[0]!.finalised_at;
  const later = issuedAt.getTime() + 3 * 3600_000;
  assert.equal(await invoicedHandoff(sql, id, null, later), true);
  const [late] = chest.published.filter(e => e.type === "quotes.invoiced" && (e.data as { handoff: string }).handoff === "60");
  assert.equal(late!.occurredAt, issuedAt.toISOString(), "the time it was issued, not the time it was told");

  // Told 30 hours after it was issued: the Chest would refuse that time; told without it.
  await told("timesheets.billable", billable("61"));
  const old = String(await draftOf("61"));
  await finalise(sql, asMember(sofia), old, today);
  const oldAt = (await sql<{ finalised_at: Date }[]>`select finalised_at from documents where id = ${old}`)[0]!.finalised_at;
  const before = Date.now();
  assert.equal(await publishPending(sql, oldAt.getTime() + 30 * 3600_000), 1);
  const [older] = chest.published.filter(e => e.type === "quotes.invoiced" && (e.data as { handoff: string }).handoff === "61");
  assert.ok(Date.parse(older!.occurredAt) >= before - 1000, "the Chest's time of the publish");
  assert.equal(occurredAtFor(new Date(Date.now() - 24 * 3600_000 + 60_000)), undefined, "within the margin of the 24 hours: without it");
  assert.equal(occurredAtFor(null), undefined);
});
