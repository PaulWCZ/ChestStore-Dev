import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { decideQuote, finalise, invoiceFromQuote, saveDraft, sendQuote, startCreditNote } from "../lib/documents.ts";
import { change, revenue } from "../lib/revenue.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, draft, line, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, sofia } from "./support/members.ts";

// Revenue at a glance on the desk: what the accounting entries count as
// sales — issued invoices less credit notes, a deposit counted with its
// final invoice — this month against last month and a year ago, and since
// January by client and by salesperson; for whoever reads the books.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications"] });
  await company(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

test("only whoever reads the books sees the revenue", async () => {
  const { sql } = database;
  assert.equal(await revenue(sql, asMember(ines), today, "EUR"), null);
  assert.ok(await revenue(sql, asMember(lea), today, "EUR"));
  assert.ok(await revenue(sql, asMember(sofia), today, "EUR"));
  assert.ok(await revenue(sql, asMember(camille), today, "EUR"));
});

test("sales of the month, less credit notes; a deposit counts once, with its final invoice", async () => {
  const { sql } = database;
  const dupain = await client(sql);
  const roux = await client(sql, { name: "Studio Roux", siren: "", vatNumber: "" });
  // A plain invoice written by billing: 1,000.00 excl. VAT.
  const plain = await draft(sql, "invoice", roux.id, [line("Conseil", 1000, 100000)], sofia);
  await finalise(sql, asMember(sofia), plain.id, today);
  // Hugo's quote of 2,000.00, invoiced as a 30 % deposit then the balance.
  const q = await draft(sql, "quote", dupain.id, [line("Site", 1000, 200000)], hugo);
  await sendQuote(sql, asMember(hugo), q.id, null, today);
  await decideQuote(sql, asMember(hugo), q.id, "accepted");
  const deposit = await invoiceFromQuote(sql, asMember(sofia), q.id, 3000);
  await finalise(sql, asMember(sofia), deposit.id, today);
  let r = (await revenue(sql, asMember(lea), today, "EUR"))!;
  assert.equal(r.thisMonth, 100000, "a deposit is not a sale yet");
  const balance = await invoiceFromQuote(sql, asMember(sofia), q.id, null);
  await finalise(sql, asMember(sofia), balance.id, today);
  r = (await revenue(sql, asMember(lea), today, "EUR"))!;
  assert.equal(r.thisMonth, 300000, "the quote counts in full with its final invoice");
  // A partial credit note of the plain invoice: 400.00 back.
  const credit = await startCreditNote(sql, asMember(sofia), plain.id);
  await saveDraft(sql, asMember(sofia), credit.id, { lines: [line("Conseil", 1000, 40000)] });
  await finalise(sql, asMember(sofia), credit.id, today);
  r = (await revenue(sql, asMember(lea), today, "EUR"))!;
  assert.equal(r.thisMonth, 260000);
  assert.equal(r.yearToDate, 260000);
  assert.equal(r.month, "2026-09");
  assert.equal(r.lastMonthKey, "2026-08");
  assert.equal(r.lastYearKey, "2025-09");
  assert.equal(r.lastMonth, 0);
  assert.deepEqual(r.byClient, [{ name: "Boulangerie Dupain SAS", net: 200000 }, { name: "Studio Roux", net: 60000 }]);
  // The quote's author is the salesperson of its invoices.
  assert.deepEqual(r.bySeller, [{ id: hugo.id, net: 200000 }, { id: sofia.id, net: 60000 }]);
  // Another currency is not added in.
  assert.equal((await revenue(sql, asMember(lea), today, "CHF"))!.thisMonth, 0);
  // Next month, this one is "last month".
  const later = (await revenue(sql, asMember(lea), "2026-10-02", "EUR"))!;
  assert.equal(later.thisMonth, 0);
  assert.equal(later.lastMonth, 260000);
});

test("the change is in whole percents, never of nothing", () => {
  assert.equal(change(100000, 112000), 12);
  assert.equal(change(100000, 50000), -50);
  assert.equal(change(0, 50000), null);
});
