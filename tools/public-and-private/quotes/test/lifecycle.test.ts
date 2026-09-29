import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import { decideQuote, finalise, getDocument, sendQuote } from "../lib/documents.ts";
import { addPayment } from "../lib/payments.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, draft, line, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, lea, sofia } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  await company(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

test("leaving changes nothing: the documents are the company's", async () => {
  const { sql } = database;
  const c = await client(sql);
  const q = await draft(sql, "quote", c.id, [line("Audit", 1000, 90000)], hugo);
  assert.equal(await chest.emit({ type: "access.revoked", data: { id: hugo.id } }, POST), 204);
  assert.equal(await chest.emit({ type: "member.removed", data: { id: hugo.id } }, POST), 204);
  assert.equal((await getDocument(sql, asMember(lea), q.id, today)).createdBy, hugo.id);
});

test("an erasure replaces the person's id everywhere — finalised invoices included — and is acknowledged once", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Effacement" });
  const q = await draft(sql, "quote", c.id, [line("Conseil", 1000, 90000)], sofia);
  await sendQuote(sql, asMember(sofia), q.id, null, today);
  await decideQuote(sql, asMember(sofia), q.id, "accepted");
  const inv = await draft(sql, "invoice", c.id, [line("Conseil", 1000, 90000)], sofia);
  await finalise(sql, asMember(sofia), inv.id, today);
  await addPayment(sql, asMember(sofia), inv.id, { paidOn: today, amount: "100", method: "transfer" }, today);
  const other = await draft(sql, "invoice", c.id, [line("Autre", 1000, 100)], camille);
  const erasure = "era_" + "a".repeat(26);
  const event = { type: "member.erased" as const, id: "evt_" + "b".repeat(26), data: { id: sofia.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  assert.deepEqual(chest.acknowledged, [erasure]);
  const quote = await getDocument(sql, asMember(lea), q.id, today);
  assert.equal(quote.createdBy, "erased");
  assert.equal(quote.decidedBy, "erased");
  assert.equal(quote.sentBy, "erased");
  const invoice = await getDocument(sql, asMember(lea), inv.id, today);
  assert.equal(invoice.createdBy, "erased");
  assert.equal(invoice.finalisedBy, "erased");
  assert.equal(invoice.status, "final");
  assert.equal(invoice.gross, 108000);
  assert.equal(invoice.payments[0]?.createdBy, "erased");
  assert.equal((await getDocument(sql, asMember(lea), other.id, today)).createdBy, camille.id);
  const [left] = await sql<{ n: number }[]>`
    select (select count(*) from documents where ${sofia.id} in (created_by, finalised_by, sent_by, decided_by))
         + (select count(*) from payments where created_by = ${sofia.id})
         + (select count(*) from clients where created_by = ${sofia.id})
         + (select count(*) from company where updated_by = ${sofia.id}) as n`;
  assert.equal(Number(left?.n), 0);
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});
