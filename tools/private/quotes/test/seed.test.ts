import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { missing, company } from "../lib/company.ts";
import { listDocuments } from "../lib/documents.ts";
import { totals } from "../lib/totals.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, lea } from "./support/members.ts";

// The sample data loads on the tool's schema, and says what it claims: a
// complete company, every state of quote and invoice, totals as the tool
// computes them, numbers without gaps.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  await database.sql.unsafe(readFileSync(join(import.meta.dirname, "..", "seed", "sample.sql"), "utf8")).simple();
});
after(async () => {
  await chest.close();
  await database.close();
});


test("the sample company is complete, with 6 clients and 12 items", async () => {
  const { sql } = database;
  assert.deepEqual(missing(await company(sql)), []);
  const [counts] = await sql<{ clients: number; items: number }[]>`select (select count(*) from clients)::int as clients, (select count(*) from items)::int as items`;
  assert.deepEqual({ ...counts }, { clients: 6, items: 12 });
});

test("quotes and invoices in every state, totals as the tool computes them, no gap in the numbers", async () => {
  const { sql } = database;
  const today = new Date().toISOString().slice(0, 10);
  const docs = await listDocuments(sql, asMember(lea), { types: ["quote", "invoice", "credit"] }, today);
  const states = (type: string) => docs.filter(d => d.type === type).map(d => d.state).sort();
  assert.deepEqual(states("quote"), ["accepted", "accepted", "accepted", "draft", "draft", "expired", "refused", "sent"]);
  assert.deepEqual(states("invoice"), ["draft", "overdue", "paid", "paid", "partly_paid", "unpaid", "unpaid"]);
  assert.deepEqual(states("credit"), ["final"]);
  for (const d of docs) {
    const lines = await sql<{ kind: "line" | "section"; quantity: number; unit_price: number; discount: number; vat_rate: number }[]>`select kind, quantity, unit_price, discount, vat_rate from lines where document_id = ${d.id} order by position`;
    const t = totals(lines.map(l => ({ kind: l.kind, quantity: l.quantity, unitPrice: l.unit_price, discount: l.discount, vatRate: l.vat_rate })), { noVat: d.vatTreatment === "reverse_charge" });
    assert.equal(d.gross, t.gross, `${d.number ?? d.title}`);
  }
  const numbers = (type: string) => docs.filter(d => d.type === type && d.number).map(d => Number(d.number!.slice(-4))).sort((a, b) => a - b);
  assert.deepEqual(numbers("invoice"), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(numbers("quote"), [1, 2, 3, 4, 5, 6]);
  // Invoice numbers follow their dates.
  const byNumber = docs.filter(d => d.type === "invoice" && d.number).sort((a, b) => a.number!.localeCompare(b.number!));
  assert.deepEqual(byNumber.map(d => d.issueDate), [...byNumber.map(d => d.issueDate)].sort());
});
