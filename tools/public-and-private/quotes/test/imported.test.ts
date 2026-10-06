import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { pdfOf } from "../src/lib/archive.ts";
import { desk } from "../src/lib/desk.ts";
import { finalise, getDocument, listDocuments, overdueCount, startCreditNote } from "../src/lib/documents.ts";
import { AppError } from "../src/lib/app-error.ts";
import { exportCsv } from "../src/lib/export.ts";
import { importTable, undoImport } from "../src/lib/importers.ts";
import { exportJournal } from "../src/lib/journal.ts";
import { continueSequence } from "../src/lib/numbering.ts";
import { dateOf, guessMapping, readTable } from "../src/lib/parse-import.ts";
import { addPayment } from "../src/lib/payments.ts";
import { draftMessage, sendReminder } from "../src/lib/sending.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, draft, line } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, ines, lea, sofia } from "./support/members.ts";

// Switching day: the invoices the previous tool issued and that are not
// paid yet come here to be collected. They keep their own numbers, in a
// series of their own: this tool's gap-free numbering is untouched, and
// they are never renumbered, finalised, drawn or credited here.

let database: TestDatabase;
let chest: FakeChest;
const today = "2026-09-29";
const options = { currency: "EUR", defaultLanguage: "fr" as const, today };
before(async () => {
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier-martin.test" } });
  database = await testDatabase();
  await company(database.sql);
  await client(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const fixture = readFileSync(join(import.meta.dirname, "fixtures", "open-invoices.csv"), "utf8");
const mapping = () => guessMapping("invoices", readTable(fixture).head);

test("days as sheets write them, day first, never month first", () => {
  assert.equal(dateOf("14/07/2026"), "2026-07-14");
  assert.equal(dateOf("14.07.2026"), "2026-07-14");
  assert.equal(dateOf("2026-07-14"), "2026-07-14");
  assert.equal(dateOf("2026-07-14T10:00:00"), "2026-07-14");
  assert.equal(dateOf("31/02/2026"), null);
  assert.equal(dateOf("07/14/2026"), null);
  assert.equal(dateOf("hier"), null);
});

test("the columns of an export are matched from their French names", () => {
  assert.deepEqual(mapping(), ["number", "issueDate", "client", "siren", "title", "dueDate", "net", "gross", "paid"]);
});

test("only billing brings invoices to collect", async () => {
  await assert.rejects(importTable(database.sql, asMember(ines), "invoices", fixture, mapping(), options), refused("forbidden"));
  await assert.rejects(importTable(database.sql, asMember(lea), "invoices", fixture, mapping(), options), refused("forbidden"));
});

let batch = "";
test("open invoices come with their numbers; paid ones and bad rows are said", async () => {
  const { sql } = database;
  const report = await importTable(sql, asMember(sofia), "invoices", fixture, mapping(), options);
  assert.equal(report.created, 3);
  assert.equal(report.paid, 1);
  assert.equal(report.duplicates, 1);
  assert.deepEqual(report.skipped.map(s => [s.line, s.error]), [[6, "date_invalid"]]);
  // Dupain was found by its SIREN; the bookshop and the new client added.
  assert.equal(report.clients, 2);
  batch = report.batch!;
  const rows = await listDocuments(sql, asMember(lea), { types: ["invoice"] }, today);
  const byNumber = new Map(rows.map(r => [r.number, r]));
  const a = byNumber.get("F-2026-0341")!;
  assert.equal(a.status, "imported");
  assert.equal(a.clientName, "Boulangerie Dupain SAS");
  assert.equal(a.gross, 120000);
  assert.equal(a.net, 100000);
  assert.equal(a.state, "overdue");
  assert.equal(a.due, 120000);
  const b = byNumber.get("F-2026-0344")!;
  assert.equal(b.paid, 100000);
  assert.equal(b.due, 200000);
  assert.equal(b.state, "overdue");
  const c = byNumber.get("F-2026-0346")!;
  assert.equal(c.state, "unpaid");
  assert.equal(c.dueDate, "2026-09-30");
  // On the desk and the tile: money to collect, overdue.
  const d = await desk(sql, asMember(sofia), today);
  assert.equal(d.toCollect.due, 120000 + 200000 + 96000);
  assert.equal(d.overdue.count, 2);
  assert.equal(await overdueCount(sql, today), 2);
  // The same file again: nothing doubles.
  const again = await importTable(sql, asMember(sofia), "invoices", fixture, mapping(), options);
  assert.equal(again.created, 0);
  assert.equal(again.duplicates, 4);
});

test("the numbering is untouched: its own sequence starts at 1, and may still be continued", async () => {
  const { sql } = database;
  const [counters] = await sql<{ n: number }[]>`select count(*)::int as n from counters`;
  assert.equal(counters!.n, 0);
  await continueSequence(sql, asMember(camille), "invoice", "348", today);
  const c = (await sql<{ id: number }[]>`select id from clients where siren = '812345676'`)[0]!;
  const own = await draft(sql, "invoice", String(c.id), [line("Maintenance", 1000, 10000)]);
  const done = await finalise(sql, asMember(sofia), own.id, today);
  assert.equal(done.number, "F-2026-0348");
});

test("an imported invoice is collected here, never issued here", async () => {
  const { sql } = database;
  const [row] = await sql<{ id: number }[]>`select id from documents where number = 'F-2026-0344' and status = 'imported'`;
  const id = String(row!.id);
  await assert.rejects(finalise(sql, asMember(sofia), id, today), refused("not_draft"));
  await assert.rejects(startCreditNote(sql, asMember(sofia), id), refused("not_final"));
  await assert.rejects(pdfOf(sql, asMember(sofia), id, today), refused("no_pdf"));
  // The database keeps it as imported.
  await assert.rejects(sql`update documents set gross = 1 where id = ${id}`, (e: unknown) => String((e as Error).message).includes("frozen"));
  // Its reminder goes without an attachment, and says nothing is attached.
  const full = await getDocument(sql, asMember(sofia), id, today);
  const message = draftMessage(full, "reminder", { company: "Atelier Martin SARL", sender: "Sofia Rossi", iban: "", bic: "", today });
  assert.ok(!message.text.includes("ci-jointe"));
  assert.ok(message.text.includes("F-2026-0344"));
  await sendReminder(sql, asMember(sofia), id, { ...message, to: "compta@librairie.test" }, today);
  assert.equal(chest.outbox.at(-1)!.attachments.length, 0);
  assert.equal((await getDocument(sql, asMember(sofia), id, today)).reminders, 1);
  // A payment settles it.
  const paid = await addPayment(sql, asMember(sofia), id, { paidOn: today, amount: "2000", method: "transfer" }, today);
  assert.equal(paid.due, 0);
  assert.equal((await getDocument(sql, asMember(lea), id, today)).state, "paid");
});

test("the accountant's files hold only what this tool issued", async () => {
  const { sql } = database;
  const p = { from: "2026-01-01", to: "2026-12-31" };
  const csv = await exportCsv(sql, asMember(lea), "fr", p, today);
  assert.ok(!csv.text.includes("F-2026-0341"));
  assert.ok(csv.text.includes("F-2026-0348"));
  const journal = await exportJournal(sql, asMember(lea), "fr", p);
  assert.ok(!journal.text.includes("F-2026-0341"));
});

test("an import is undone while nothing was recorded on it", async () => {
  const { sql } = database;
  // This import had a payment and a reminder since: it stays.
  await assert.rejects(undoImport(sql, asMember(sofia), batch), refused("import_used"));
  await assert.rejects(undoImport(sql, asMember(ines), batch), refused("forbidden"));
  const text = "N° facture,Date,Client,Total TTC,Reste à payer\nOLD-12,01/09/2026,Autre Client,500,500\n";
  const r = await importTable(sql, asMember(sofia), "invoices", text, guessMapping("invoices", readTable(text).head), options);
  assert.equal(r.created, 1);
  const [doc] = await sql<{ due_date: string }[]>`select due_date from documents where number = 'OLD-12'`;
  // No due date given: the company's payment terms (30 days).
  assert.equal(doc!.due_date, "2026-10-01");
  assert.deepEqual(await undoImport(sql, asMember(sofia), r.batch), { removed: 1 });
  assert.equal((await sql`select 1 from documents where number = 'OLD-12'`).length, 0);
  await assert.rejects(undoImport(sql, asMember(sofia), r.batch), refused("not_found"));
});

test("a row with a total that is not money, or a future date, is refused", async () => {
  const text = "Numéro;Date;Client;Total TTC\nX-1;01/09/2026;A;douze\nX-2;01/12/2030;A;10\nX-3;01/09/2026;A;-5\n";
  const r = await importTable(database.sql, asMember(sofia), "invoices", text, guessMapping("invoices", readTable(text).head), options);
  assert.equal(r.created, 0);
  assert.deepEqual(r.skipped.map(s => s.error), ["amount_invalid", "date_invalid", "amount_invalid"]);
});
