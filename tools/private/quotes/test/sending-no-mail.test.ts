import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { company as readCompany } from "../lib/company.ts";
import { finalise, getDocument } from "../lib/documents.ts";
import { markSent, sendDocument, sendReminder } from "../lib/sending.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, draft, line, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { everyone, ines, sofia } from "./support/members.ts";

// A Chest that cannot send email yet (no "mail" capability): nothing goes,
// the tool says so, and the member sends the PDF themselves.
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

test("without the Chest's mail: the quote is not marked sent, it keeps its number, and is sent by hand", async () => {
  const { sql } = database;
  const c = await client(sql);
  const q = await draft(sql, "quote", c.id, [line("Audit", 1000, 90000)], ines);
  const result = await sendDocument(sql, asMember(ines), q.id, { to: "marie@dupain.test", subject: "Devis", text: "Bonjour" }, today);
  assert.deepEqual(result, { delivery: "no_mail", number: "D-2026-0001" });
  let full = await getDocument(sql, asMember(ines), q.id, today);
  assert.equal(full.status, "draft");
  assert.equal(full.sentAt, null);
  assert.equal((await readCompany(sql)).mailWorks, false);
  await markSent(sql, asMember(ines), q.id, today);
  full = await getDocument(sql, asMember(ines), q.id, today);
  assert.equal(full.status, "sent");
  assert.equal(full.number, "D-2026-0001");
});

test("without the Chest's mail: an invoice and a reminder are not recorded as sent", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Sans e-mail" });
  const inv = await draft(sql, "invoice", c.id, [line("Mission", 1000, 90000)]);
  await finalise(sql, asMember(sofia), inv.id, today);
  const message = { to: "marie@dupain.test", subject: "Facture", text: "Bonjour" };
  assert.equal((await sendDocument(sql, asMember(sofia), inv.id, message, today)).delivery, "no_mail");
  assert.equal((await getDocument(sql, asMember(sofia), inv.id, today)).sentAt, null);
  assert.equal((await sendReminder(sql, asMember(sofia), inv.id, message, "2026-12-01")).delivery, "no_mail");
  assert.equal((await getDocument(sql, asMember(sofia), inv.id, today)).reminders, 0);
  // The PDF was still kept when it was drawn.
  assert.ok((await getDocument(sql, asMember(sofia), inv.id, today)).pdfObject);
});
