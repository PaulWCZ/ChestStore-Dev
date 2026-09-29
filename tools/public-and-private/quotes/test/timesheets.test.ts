import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import { finalise, getDocument } from "../lib/documents.ts";
import { handoffOf, invoicedHandoff, publishPending, readBillable } from "../lib/timesheets.ts";
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
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ tool: "quotes", members: everyone, emits: ["quotes.invoiced"], tools: { timesheets: true }, settings: { company: "Atelier Martin", currency: "EUR", locale: "fr" } });
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
