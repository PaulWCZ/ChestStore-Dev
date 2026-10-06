import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { lineKey, proposeFor, readBank, recordBankLine } from "../src/lib/bank.ts";
import { bankDay, decodeStatement, guessBankMapping, linesOf, readStatement } from "../src/lib/bank-parse.ts";
import { finalise, getDocument } from "../src/lib/documents.ts";
import { AppError } from "../src/lib/app-error.ts";
import { removePayment, restorePayment } from "../src/lib/payments.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, draft, line, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, lea, sofia } from "./support/members.ts";

// A bank statement matched to the invoices still to collect: the file as a
// bank exports it (the account's details above the header, Latin-1, ";",
// decimal commas, a debit and a credit column — or one signed amount), each
// payment received proposed with the invoice it pays, recorded on a tap,
// never twice.

const fixture = (name: string) => new Uint8Array(readFileSync(join(import.meta.dirname, "fixtures", name)));
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("a French bank's export: the header found under the account's details, Latin-1 read, credits and debits", () => {
  const text = decodeStatement(fixture("bank-statement-fr.csv"));
  assert.ok(text.includes("Libellé"), "Windows-1252 decoded");
  const statement = readStatement(text);
  assert.equal(statement.skippedAbove, 4);
  assert.deepEqual(statement.head.slice(0, 4), ["Date", "Libellé", "Débit euros", "Crédit euros"]);
  const mapping = guessBankMapping(statement.head);
  assert.deepEqual(mapping.slice(0, 4), ["date", "label", "debit", "credit"]);
  const { lines, problems } = linesOf(statement, mapping);
  assert.deepEqual(problems, []);
  assert.deepEqual(lines.map(l => [l.line, l.date, l.amount]), [[6, "2026-09-25", 200000], [7, "2026-09-26", -41200], [8, "2026-09-26", 96000], [9, "2026-09-27", 5000]]);
  assert.equal(lines[0]!.label, "VIR SEPA LIBRAIRIE DES MOTS REF F-2026-0344");
});

test("a signed amount, ISO dates, a reference column; a wrong day is said", () => {
  const statement = readStatement(decodeStatement(fixture("bank-statement-signed.csv")));
  const mapping = guessBankMapping(statement.head);
  assert.deepEqual(mapping, ["date", "label", "amount", "reference"]);
  const { lines, problems } = linesOf(statement, mapping);
  assert.deepEqual(lines.map(l => [l.date, l.amount, l.reference]), [["2026-09-25", 120000, "Invoice F-2026-0341"], ["2026-09-26", -4590, ""]]);
  assert.deepEqual(problems, [{ line: 4, error: "date_invalid" }]);
});

test("days as banks write them", () => {
  assert.equal(bankDay("28/09/2026"), "2026-09-28");
  assert.equal(bankDay("28/09/26"), "2026-09-28");
  assert.equal(bankDay("28.09.2026"), "2026-09-28");
  assert.equal(bankDay("2026-09-28"), "2026-09-28");
  assert.equal(bankDay("2026-09-28T10:00:00"), "2026-09-28");
  assert.equal(bankDay("31/02/2026"), null);
  assert.equal(bankDay("hier"), null);
});

test("the match: its number first, then the amount with the client, the amount alone, the client alone", () => {
  const open = [
    { id: "1", number: "F-2026-0007", clientName: "Garage Rossi SARL", due: 231000 },
    { id: "2", number: "F-2026-0008", clientName: "Boulangerie Dupain SAS", due: 120000 },
    { id: "3", number: "F-2026-0009", clientName: "Studio Verbeke BV", due: 120000 },
    { id: "4", number: "F-0010", clientName: "Jeanne Roux", due: 50000 },
  ];
  const at = (label: string, amount: number, reference = "") => proposeFor({ label, amount, reference }, open);
  assert.deepEqual(at("VIR GARAGE ROSSI FACT F2026 0007", 100000), { invoiceId: "1", number: "F-2026-0007", client: "Garage Rossi SARL", due: 231000, reason: "number" });
  assert.equal(at("VIR SEPA BOULANGERIE DUPAIN", 120000)?.reason, "amount_client");
  assert.equal(at("VIR SEPA BOULANGERIE DUPAIN", 120000)?.invoiceId, "2");
  // Two open invoices of that amount, no name: no guess.
  assert.equal(at("VIR SEPA 123", 120000), null);
  assert.equal(at("VIR MME J ROUX", 50000)?.reason, "amount_client");
  assert.equal(at("VIR 45", 50000)?.reason, "amount");
  assert.equal(at("VIR GARAGE ROSSI", 100000)?.reason, "client");
  // More than what is left: never proposed.
  assert.equal(at("VIR GARAGE ROSSI F-2026-0007", 300000), null);
  // A legal form alone names nobody.
  assert.equal(at("VIR SARL", 1000), null);
  assert.equal(at("money out", -5000), null);
});

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications"] });
  database = await testDatabase();
  await company(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

test("a statement read against the open invoices; each payment recorded once, on a tap", async () => {
  const { sql } = database;
  const rossi = await client(sql, { name: "Garage Rossi SARL", siren: "", vatNumber: "" });
  const inv = await draft(sql, "invoice", rossi.id, [line("Entretien", 1000, 100000)], sofia);
  const issued = await finalise(sql, asMember(sofia), inv.id, today);
  const text = `Date;Libellé;Montant\n27/09/2026;VIR SEPA GARAGE ROSSI ${issued.number};1 200,00\n27/09/2026;VIR INCONNU;15,00\n28/09/2026;PRLV EDF;-80,00\n`;
  const mapping = ["date", "label", "amount"];
  await assert.rejects(readBank(sql, asMember(hugo), text, mapping, today, "EUR"), refused("forbidden"));
  await assert.rejects(readBank(sql, asMember(sofia), text, ["label", "label", "amount"], today, "EUR"), refused("import_invalid"));
  const reading = await readBank(sql, asMember(sofia), text, mapping, today, "EUR");
  assert.equal(reading.outgoing, 1);
  assert.equal(reading.recorded, 0);
  const [first, second] = reading.proposals;
  assert.equal(first!.match?.invoiceId, issued.id);
  assert.equal(first!.match?.reason, "number");
  assert.equal(second!.match, null);

  const input = { key: first!.key, invoiceId: issued.id, date: first!.date, amount: first!.amount, label: first!.label };
  await assert.rejects(recordBankLine(sql, asMember(lea), input, today), refused("forbidden"));
  await assert.rejects(recordBankLine(sql, asMember(sofia), { ...input, key: "nope" }, today), refused("invalid"));
  const done = await recordBankLine(sql, asMember(sofia), input, today);
  assert.equal(done.due, 0);
  const full = await getDocument(sql, asMember(lea), issued.id, today);
  assert.equal(full.state, "paid");
  assert.deepEqual(full.payments.map(p => [p.paidOn, p.amount, p.method]), [["2026-09-27", 120000, "transfer"]]);
  assert.ok(full.payments[0]!.note.includes("VIR SEPA GARAGE ROSSI"));
  // Read again: the line is recorded; it is never offered nor taken twice.
  const again = await readBank(sql, asMember(sofia), text, mapping, today, "EUR");
  assert.equal(again.recorded, 1);
  assert.deepEqual(again.proposals.map(p => p.key), [second!.key]);
  await assert.rejects(recordBankLine(sql, asMember(sofia), input, today), refused("bank_line_used"));
  // The payment deleted: the line comes back; recorded again, the old one
  // cannot be restored on top.
  await removePayment(sql, asMember(sofia), done.id);
  assert.equal((await readBank(sql, asMember(sofia), text, mapping, today, "EUR")).recorded, 0);
  await recordBankLine(sql, asMember(sofia), input, today);
  await assert.rejects(restorePayment(sql, asMember(sofia), done.id), refused("bank_line_used"));
});

test("identical lines stay two payments", () => {
  const a = { date: "2026-09-27", amount: 5000, label: "VIR X", reference: "" };
  assert.notEqual(lineKey({ ...a, occurrence: 1 }), lineKey({ ...a, occurrence: 2 }));
  const statement = readStatement("Date;Libellé;Montant\n27/09/2026;VIR X;50,00\n27/09/2026;VIR X;50,00\n");
  assert.deepEqual(linesOf(statement, guessBankMapping(statement.head)).lines.map(l => l.occurrence), [1, 2]);
});
