import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { finalise, saveDraft, startCreditNote } from "../src/lib/documents.ts";
import { AppError } from "../src/lib/app-error.ts";
import { exportCsv, exportZip, period } from "../src/lib/export.ts";
import { exportJournal } from "../src/lib/journal.ts";
import { updateCompany } from "../src/lib/company.ts";
import { addPayment } from "../src/lib/payments.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, draft, line, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, lea, sofia } from "./support/members.ts";
import { pdfText } from "./support/pdf.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications"] });
  database = await testDatabase();
  await company(database.sql);
  const { sql } = database;
  const c = await client(sql);
  const a = await draft(sql, "invoice", c.id, [line("Site", 1000, 100000), line("Livre", 2000, 1000, 550)]);
  await finalise(sql, asMember(sofia), a.id, "2026-09-10");
  const b = await draft(sql, "invoice", c.id, [line("Maintenance", 1000, 50000)]);
  const fb = await finalise(sql, asMember(sofia), b.id, "2026-09-15");
  await addPayment(sql, asMember(sofia), fb.id, { paidOn: "2026-09-20", amount: "600", method: "transfer" }, today);
  const credit = await startCreditNote(sql, asMember(sofia), a.id);
  await saveDraft(sql, asMember(sofia), credit.id, { lines: [line("Geste commercial", 1000, 10000)] });
  await finalise(sql, asMember(sofia), credit.id, "2026-09-20");
  // A draft and an invoice of October are not in September's export.
  await draft(sql, "invoice", c.id, [line("Brouillon", 1000, 1)]);
  const oct = await draft(sql, "invoice", c.id, [line("Octobre", 1000, 1000)]);
  await finalise(sql, asMember(sofia), oct.id, "2026-10-02");
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("the accountant's CSV in French: ';', decimal commas, a column pair per VAT rate, credit notes negative", async () => {
  const { text, fileName, count } = await exportCsv(database.sql, asMember(lea), "fr", period("2026-09-01", "2026-09-30"), today);
  assert.equal(count, 3);
  assert.equal(fileName, "Devis-et-factures_2026-09-01_2026-09-30.csv");
  const lines = text.replace(/^﻿/u, "").trimEnd().split("\r\n");
  assert.equal(lines[0]!.replace(/ | /gu, " "), "Journal;Date;Numéro;Type;Client;SIREN client;N° TVA client;HT 20 %;TVA 20 %;HT 10 %;TVA 10 %;HT 5,5 %;TVA 5,5 %;HT 2,1 %;TVA 2,1 %;HT 0 %;Total HT;Total TVA;Total TTC;Échéance;Facture corrigée;Statut;Devise");
  assert.equal(lines[1], "VE;10/09/2026;F-2026-0001;Facture;Boulangerie Dupain SAS;812345676;FR19812345676;1000,00;200,00;;;20,00;1,10;;;;1020,00;201,10;1221,10;10/10/2026;;À payer;EUR");
  assert.equal(lines[2], "VE;15/09/2026;F-2026-0002;Facture;Boulangerie Dupain SAS;812345676;FR19812345676;500,00;100,00;;;;;;;;500,00;100,00;600,00;15/10/2026;;Payée;EUR");
  assert.equal(lines[3], "VE;20/09/2026;A-2026-0001;Avoir;Boulangerie Dupain SAS;812345676;FR19812345676;-100,00;-20,00;;;;;;;;-100,00;-20,00;-120,00;;F-2026-0001;;EUR");
  assert.equal(lines.length, 4);
});

test("in English: ',' and decimal points, ISO dates", async () => {
  const { text } = await exportCsv(database.sql, asMember(sofia), "en", period("2026-09-01", "2026-09-30"), today);
  const lines = text.replace(/^﻿/u, "").trimEnd().split("\r\n");
  assert.ok(lines[0]!.startsWith("Journal,Date,Number,Type,Client,"));
  assert.ok(lines[1]!.startsWith("SA,2026-09-10,F-2026-0001,Invoice,Boulangerie Dupain SAS,812345676,FR19812345676,1000.00,200.00,"));
});

test("who may export, and which periods", async () => {
  await assert.rejects(exportCsv(database.sql, asMember(hugo), "fr", period("2026-09-01", "2026-09-30"), today), refused("forbidden"));
  assert.throws(() => period("2026-09-30", "2026-09-01"), refused("period_invalid"));
  assert.throws(() => period("2026-09-31", "2026-10-01"), refused("date_invalid"));
});

// The entries of a ZIP: names and contents (stored, or deflated).
function unzip(bytes: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let at = 0;
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    const method = bytes.readUInt16LE(at + 8);
    const size = bytes.readUInt32LE(at + 18);
    const nameLength = bytes.readUInt16LE(at + 26);
    const extra = bytes.readUInt16LE(at + 28);
    const name = bytes.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const data = bytes.subarray(at + 30 + nameLength + extra, at + 30 + nameLength + extra + size);
    out.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    at += 30 + nameLength + extra + size;
  }
  return out;
}

test("the ZIP holds each document's PDF and the spreadsheet", async () => {
  const { stream, fileName } = await exportZip(database.sql, asMember(lea), "fr", period("2026-09-01", "2026-09-30"), today);
  assert.equal(fileName, "Devis-et-factures_2026-09-01_2026-09-30.zip");
  const bytes = Buffer.from(await new Response(stream).arrayBuffer());
  const entries = unzip(bytes);
  assert.deepEqual([...entries.keys()], ["Facture-F-2026-0001.pdf", "Facture-F-2026-0002.pdf", "Avoir-A-2026-0001.pdf", "Devis-et-factures_2026-09-01_2026-09-30.csv",
    "ecritures-ventes_2026-09-01_2026-09-30.csv", "clients.csv", "catalogue.csv"]);
  assert.ok(entries.get("clients.csv")!.toString("utf8").includes("Boulangerie Dupain SAS;Entreprise;Marie Dupain"));
  assert.ok(pdfText(entries.get("Avoir-A-2026-0001.pdf")!).includes("Avoir sur la facture F-2026-0001 du 10/09/2026."));
  // Each PDF was kept in the Chest's files on the way.
  assert.ok(chest.files.has("documents/2026/F-2026-0001.pdf"));
});

test("the accountant's entries: one balanced entry per document, in the columns of the FEC", async () => {
  const { sql } = database;
  const [c] = await sql<{ id: number }[]>`select id from clients order by id limit 1`;
  const aux = "C" + String(c!.id).padStart(5, "0");
  const { text, fileName, count } = await exportJournal(sql, asMember(lea), "fr", period("2026-09-01", "2026-09-30"));
  assert.equal(count, 3);
  assert.equal(fileName, "ecritures-ventes_2026-09-01_2026-09-30.csv");
  const rows = text.replace(/^\ufeff/u, "").trimEnd().split("\r\n").map(r => r.split(";"));
  assert.deepEqual(rows[0], ["JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib", "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise"]);
  const brief = rows.slice(1).map(r => [r[2], r[4], r[6], r[11], r[12]].join(" "));
  assert.deepEqual(brief, [
    `F-2026-0001 411000 ${aux} 1221,10 0,00`,
    "F-2026-0001 706000  0,00 1020,00",
    "F-2026-0001 445710  0,00 200,00",
    "F-2026-0001 445710  0,00 1,10",
    `F-2026-0002 411000 ${aux} 600,00 0,00`,
    "F-2026-0002 706000  0,00 500,00",
    "F-2026-0002 445710  0,00 100,00",
    `A-2026-0001 411000 ${aux} 0,00 120,00`,
    "A-2026-0001 706000  100,00 0,00",
    "A-2026-0001 445710  20,00 0,00",
  ]);
  assert.deepEqual(rows[1]!.slice(0, 4), ["VE", "Ventes", "F-2026-0001", "20260910"]);
  assert.equal(rows[1]![10], "Facture F-2026-0001 Boulangerie Dupain SAS");
  // Each entry balances.
  for (const n of ["F-2026-0001", "F-2026-0002", "A-2026-0001"]) {
    const mine = rows.slice(1).filter(r => r[2] === n);
    const sum = (i: number) => mine.reduce((s2, r) => s2 + Number(r[i]!.replace(",", ".")) * 100, 0);
    assert.equal(Math.round(sum(11)), Math.round(sum(12)), n);
  }
  // The company's own accounts and the client's code in the books.
  await updateCompany(sql, asMember(camille), { accounts: { journal: "VT", client: "41100000", services: "70600000", vat: { "2000": "44571200", "550": "44571055" } } });
  await sql`update clients set account = 'DUPAIN' where id = ${c!.id}`;
  const again = (await exportJournal(sql, asMember(lea), "en", period("2026-09-01", "2026-09-10"))).text.replace(/^\ufeff/u, "").trimEnd().split("\r\n").map(r => r.split(","));
  assert.deepEqual(again.slice(1).map(r => [r[0], r[4], r[6], r[11], r[12]].join(" ")), [
    "VT 41100000 DUPAIN 1221.10 0.00", "VT 70600000  0.00 1020.00", "VT 44571200  0.00 200.00", "VT 44571055  0.00 1.10",
  ]);
  await assert.rejects(updateCompany(sql, asMember(camille), { accounts: { client: "411 ?" } }), refused("account_invalid"));
  await assert.rejects(exportJournal(sql, asMember(hugo), "fr", period("2026-09-01", "2026-09-30")), refused("forbidden"));
});
