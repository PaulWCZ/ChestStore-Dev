import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-jobs/[name]/route.ts";
import * as expenses from "../lib/expenses.ts";
import * as cards from "../lib/cards.ts";
import * as settings from "../lib/settings.ts";
import * as tell from "../lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, lea } from "./support/members.ts";
import { upload } from "./support/receipts.ts";

let database: TestDatabase;
let chest: FakeChest;
let meals = "";
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone.map(p => ({ ...p, email: p.firstName.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "") + "@atelier.test" })), capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier.test" }, schedules: [{ name: "reminder", cron: "0 9 25 * *" }, { name: "cleanup", cron: "40 3 * * *" }] });
  meals = String((await database.sql`select id from categories where key = 'meals'`)[0]!["id"]);
});
after(async () => {
  await chest.close();
  await database.close();
});

test("on the 25th, everyone with drafts is reminded, in their language, once", async () => {
  const { sql } = database;
  await expenses.saveExpense(sql, asMember(hugo), null, { spentOn: "2026-09-10", amount: "12", categoryId: meals });
  await expenses.saveExpense(sql, asMember(hugo), null, { spentOn: "2026-09-11", amount: "8,50", categoryId: meals });
  const sent = (await expenses.saveExpense(sql, asMember(lea), null, { spentOn: "2026-09-11", amount: "3", categoryId: meals })).expense;
  await expenses.submit(sql, asMember(lea), [sent.id], async () => true);
  assert.equal(await chest.run("reminder", POST), 204);
  assert.deepEqual(chest.notifications.map(n => [n.member, n.title, n.body, n.key]), [[hugo.id, "Send your expenses before the end of the month", "2 drafts · €20.50", "reminder"]]);
  // By email too: Hugo his drafts; Camille, the accountant, Léa's expense
  // waiting for her; in each one's language (Camille reads French).
  assert.deepEqual(chest.outbox.map(m => [m.to[0], m.subject]).sort(), [["camille@atelier.test", "1 dépense attend votre validation"], ["hugo@atelier.test", "Send your expenses before the end of the month"]]);
  assert.match(chest.outbox.find(m => m.to[0] === "hugo@atelier.test")!.text, /2 drafts · €20\.50/u);
  assert.equal(await chest.run("reminder", POST), 204);
  assert.equal(chest.notifications.length, 1);
  assert.equal(chest.outbox.length, 2);
  // Turned off by the accountant: nothing.
  await settings.updateSettings(sql, asMember(camille), { reminder: false });
  chest.notifications.length = 0;
  assert.equal(await chest.run("reminder", POST), 204);
  assert.equal(chest.notifications.length, 0);
});

test("every night, unused uploads after a day and deleted drafts after a week go, with their files", async () => {
  const { sql } = database;
  const old = await upload(chest, sql, asMember(hugo));
  const fresh = await upload(chest, sql, asMember(hugo));
  await sql`update uploads set created_at = now() - interval '2 days' where object = ${old.object}`;
  const receipt = await upload(chest, sql, asMember(hugo));
  const gone = (await expenses.saveExpense(sql, asMember(hugo), null, { spentOn: "2026-09-10", amount: "4", categoryId: meals }, receipt)).expense;
  await expenses.remove(sql, asMember(hugo), gone.id);
  await sql`update expenses set deleted_at = now() - interval '8 days' where id = ${gone.id}`;
  assert.equal(await chest.run("cleanup", POST), 204);
  assert.ok(!chest.files.has(old.object) && chest.files.has(fresh.object));
  assert.ok(!chest.files.has(receipt.object));
  assert.equal((await sql`select 1 from expenses where id = ${gone.id}`).length, 0);
  assert.equal(await POST(new Request("http://tool.test/chest-jobs/reminder", { method: "POST" })).then(r => r.status), 401);
});

test("email beside the bell: expenses sent to approve, a card payment's receipt; once each", async () => {
  const { sql } = database;
  await sql`delete from expenses`;
  chest.outbox.length = 0;
  const lunch = (await expenses.saveExpense(sql, asMember(hugo), null, { spentOn: "2026-09-12", merchant: "Big Mamma", amount: "42,50", categoryId: meals })).expense;
  const sent = await expenses.submit(sql, asMember(hugo), [lunch.id], async () => true);
  await tell.sent(sql, asMember(hugo), sent);
  const toCamille = chest.outbox.filter(m => m.to[0] === "camille@atelier.test");
  assert.equal(toCamille.length, 1);
  assert.equal(toCamille[0]!.subject, "Hugo Bernard a envoyé une dépense · 42,50 €");
  assert.match(toCamille[0]!.text, /Big Mamma · 42,50 €/u);
  assert.match(toCamille[0]!.text, /\/chest\/approve/u);
  // A company card payment with no expense: its holder is asked by email.
  const team = new Set(everyone.filter(p => p.role).map(p => p.id));
  const made = await cards.importStatement(sql, asMember(camille), { lines: [{ date: "2026-09-15", label: "UBER *TRIP", amount: 2340, currency: "EUR", member: hugo.id }] }, team);
  await tell.cardReceipts(sql, made.owners);
  await tell.cardReceipts(sql, made.owners);
  const toHugo = chest.outbox.filter(m => m.to[0] === "hugo@atelier.test");
  assert.equal(toHugo.length, 1);
  assert.equal(toHugo[0]!.subject, "Receipt needed: UBER *TRIP · €23.40");
});
