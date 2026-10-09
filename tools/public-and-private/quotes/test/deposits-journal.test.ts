import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { decideQuote, finalise, getDocument, invoiceFromQuote, saveDraft, sendQuote, startCreditNote } from "../src/lib/documents.ts";
import { period } from "../src/lib/export.ts";
import { exportJournal } from "../src/lib/journal.ts";
import { revenue } from "../src/lib/revenue.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, draft, line, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, lea, sofia } from "./support/members.ts";

// Deposits in the accountant's entries. A deposit invoice ("facture
// d'acompte") is not a sale yet: the seller debits the client (411) and
// credits the deposits received (4191 "Clients – avances et acomptes reçus
// sur commandes") and the VAT; the final invoice's lines taking the deposit
// back debit 4191, which returns to zero. A credit note cancelling a
// deposit invoice reverses the deposit invoice exactly: it debits 4191, not
// the sales accounts (706/707) — otherwise 4191 stays in credit and sales
// are reduced by a sale that was never recorded. (French chart of accounts,
// account 4191; the studio's reading from general accounting knowledge —
// the pages describing 4191 could not be opened from the studio on
// 2026-09-29, only a search summary: "debited by credit of account 411
// after the invoice is established, to settle the deposit".)

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

type Row = { piece: string; account: string; debit: number; credit: number };

async function journal(): Promise<Row[]> {
  const { text } = await exportJournal(database.sql, asMember(lea), "en", period("2026-01-01", "2026-12-31"));
  const rows = text.replace(/^﻿/u, "").trimEnd().split("\r\n").slice(1).map(r => r.split(","));
  const cents = (s: string) => (s === "" ? 0 : Math.round(Number(s) * 100));
  return rows.map(r => ({ piece: r[2]!, account: r[4]!, debit: cents(r[11]!), credit: cents(r[12]!) }));
}
const balance = (rows: Row[], account: string) => rows.filter(r => r.account === account).reduce((s, r) => s + r.credit - r.debit, 0);

async function acceptedQuote(name: string) {
  const { sql } = database;
  const c = await client(sql, { name, siren: "", vatNumber: "" });
  const q = await draft(sql, "quote", c.id, [line("Site", 1000, 200000)], hugo);
  await sendQuote(sql, asMember(hugo), q.id, null, today);
  await decideQuote(sql, asMember(hugo), q.id, "accepted");
  return q.id;
}

test("a deposit invoice cancelled by a credit note: 4191 back to zero, sales untouched, each entry balanced", async () => {
  const { sql } = database;
  const q = await acceptedQuote("Acompte Annulé SARL");
  const deposit = await finalise(sql, asMember(sofia), (await invoiceFromQuote(sql, asMember(sofia), q, 3000)).id, today);
  const credit = await finalise(sql, asMember(sofia), (await startCreditNote(sql, asMember(sofia), deposit.id)).id, today);
  const rows = (await journal()).filter(r => r.piece === deposit.number || r.piece === credit.number);
  for (const piece of [deposit.number, credit.number]) {
    const entry = rows.filter(r => r.piece === piece);
    assert.equal(entry.reduce((s, r) => s + r.debit, 0), entry.reduce((s, r) => s + r.credit, 0), `${piece} balanced`);
  }
  // 30 % of 2,000.00 = 600.00 excl. VAT into the deposits received, then out.
  assert.deepEqual(rows.filter(r => r.piece === deposit.number && r.account === "419100").map(r => [r.debit, r.credit]), [[0, 60000]]);
  assert.deepEqual(rows.filter(r => r.piece === credit.number && r.account === "419100").map(r => [r.debit, r.credit]), [[60000, 0]]);
  assert.equal(balance(rows, "419100"), 0);
  assert.equal(rows.filter(r => r.account === "706000" || r.account === "707000").length, 0, "no sale recorded, none reversed");
  assert.equal(balance(rows, "445710"), 0);
  assert.equal(balance(rows, "411000"), 0);
});

test("deposit, then its final invoice: 4191 back to zero, the whole sale in 706", async () => {
  const { sql } = database;
  const q = await acceptedQuote("Acompte Soldé SARL");
  const deposit = await finalise(sql, asMember(sofia), (await invoiceFromQuote(sql, asMember(sofia), q, 3000)).id, today);
  const final = await finalise(sql, asMember(sofia), (await invoiceFromQuote(sql, asMember(sofia), q, null)).id, today);
  const rows = (await journal()).filter(r => r.piece === deposit.number || r.piece === final.number);
  assert.equal(balance(rows, "419100"), 0);
  assert.equal(balance(rows, "706000"), 200000);
});

test("a deposit cancelled, then the whole quote invoiced: 4191 at zero, the sale once; revenue agrees", async () => {
  const { sql } = database;
  const q = await acceptedQuote("Acompte Puis Solde SARL");
  const deposit = await finalise(sql, asMember(sofia), (await invoiceFromQuote(sql, asMember(sofia), q, 3000)).id, today);
  const credit = await finalise(sql, asMember(sofia), (await startCreditNote(sql, asMember(sofia), deposit.id)).id, today);
  const final = await finalise(sql, asMember(sofia), (await invoiceFromQuote(sql, asMember(sofia), q, null)).id, today);
  const rows = (await journal()).filter(r => [deposit.number, credit.number, final.number].includes(r.piece));
  assert.equal(balance(rows, "419100"), 0);
  assert.equal(balance(rows, "706000"), 200000);
  // The desk's revenue counts what the entries count as sales, in all.
  const all = await journal();
  const r = (await revenue(sql, asMember(lea), today, "EUR"))!;
  assert.equal(r.thisMonth, balance(all, "706000") + balance(all, "707000"));
});

test("a credit note of the final invoice, edited before it is issued: its lines taking the deposit back keep their mark, 4191 moves, 706 by the whole sale", async () => {
  const { sql } = database;
  const q = await acceptedQuote("Acompte Puis Avoir SARL");
  const deposit = await finalise(sql, asMember(sofia), (await invoiceFromQuote(sql, asMember(sofia), q, 3000)).id, today);
  const final = await finalise(sql, asMember(sofia), (await invoiceFromQuote(sql, asMember(sofia), q, null)).id, today);
  const started = await startCreditNote(sql, asMember(sofia), final.id);
  // The paper's autosave sends every line back, marks included.
  const shown = await getDocument(sql, asMember(sofia), started.id, today);
  assert.ok(shown.lines.some(l => l.depositOf === deposit.id), "the credit note's copy of the deposit line is marked");
  await saveDraft(sql, asMember(sofia), started.id, { title: "Avoir", lines: shown.lines.map(l => ({ ...l })) });
  const credit = await finalise(sql, asMember(sofia), started.id, today);
  const kept = await getDocument(sql, asMember(sofia), credit.id, today);
  assert.ok(kept.lines.some(l => l.depositOf === deposit.id), "kept through the edit");
  const rows = (await journal()).filter(r => r.piece === credit.number);
  assert.equal(rows.reduce((s, r) => s + r.debit, 0), rows.reduce((s, r) => s + r.credit, 0), "balanced");
  assert.equal(balance(rows, "706000"), -200000, "the whole sale reversed, not 1,400.00");
  assert.equal(balance(rows, "419100"), 60000, "the deposit taken back is owed again");
});
