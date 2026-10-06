import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, shownTo, type FakeChest } from "@argentic/chest-sdk/testing";
import { atLeast } from "@argentic/chest-app/testing";
import * as expenses from "../src/lib/expenses.ts";
import * as cards from "../src/lib/cards.ts";
import * as settings from "../src/lib/settings.ts";
import * as tell from "../src/lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, lea } from "./support/members.ts";
import { upload } from "./support/receipts.ts";
import { deliver, server } from "./support/server.ts";

atLeast(3);

let database: TestDatabase;
let chest: FakeChest;
let meals = "";
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications"], network: {}, chest: { publicUrl: null } });
  await server();
  meals = String((await database.sql`select id from categories where key = 'meals'`)[0]!["id"]);
});
after(async () => {
  await chest.close();
  await database.close();
});

test("on the 25th, everyone with drafts is reminded, in every language, once — and nothing is mailed by the tool", async () => {
  const { sql } = database;
  await expenses.saveExpense(sql, asMember(hugo), null, { spentOn: "2026-09-10", amount: "12", categoryId: meals });
  await expenses.saveExpense(sql, asMember(hugo), null, { spentOn: "2026-09-11", amount: "8,50", categoryId: meals });
  const sent = (await expenses.saveExpense(sql, asMember(lea), null, { spentOn: "2026-09-11", amount: "3", categoryId: meals })).expense;
  await expenses.submit(sql, asMember(lea), [sent.id], async () => true);
  assert.equal(await chest.run("reminder", deliver), 204);
  assert.deepEqual(chest.notifications.map(n => [n.member, n.title, n.body, n.key]), [[hugo.id, "Send your expenses before the end of the month", "2 drafts · €20.50", "reminder"]]);
  assert.deepEqual(shownTo(chest.notifications[0]!, "fr"), { title: "Envoyez vos notes de frais avant la fin du mois", body: "2 brouillons · 20,50 €" });
  // Approvers get no reminder of their own: Léa's expense waits in
  // Camille's inbox since it was sent, and on the tile.
  assert.equal(chest.outbox.length, 0);
  assert.equal(await chest.run("reminder", deliver), 204);
  assert.equal(chest.notifications.length, 1);
  // Turned off by the accountant: nothing.
  await settings.updateSettings(sql, asMember(camille), { reminder: false });
  chest.notifications.length = 0;
  assert.equal(await chest.run("reminder", deliver), 204);
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
  assert.equal(await chest.run("cleanup", deliver), 204);
  assert.ok(!chest.files.has(old.object) && chest.files.has(fresh.object));
  assert.ok(!chest.files.has(receipt.object));
  assert.equal((await sql`select 1 from expenses where id = ${gone.id}`).length, 0);
  // Not signed by the Chest: refused; a schedule without a handler: 404.
  assert.equal(await deliver(new Request("https://expenses-chest.chest.test/chest-schedules", { method: "POST", body: "{}" })).then(r => r.status), 401);
  assert.equal(await chest.run("nothing", deliver), 404);
});

test("expenses sent to approve and a card payment's receipt: one notice each, in every language, named", async () => {
  const { sql } = database;
  await sql`delete from expenses`;
  chest.notifications.length = 0;
  const lunch = (await expenses.saveExpense(sql, asMember(hugo), null, { spentOn: "2026-09-12", merchant: "Big Mamma", amount: "42,50", categoryId: meals })).expense;
  const sent = await expenses.submit(sql, asMember(hugo), [lunch.id], async () => true);
  await tell.sent(sql, asMember(hugo), sent);
  const toCamille = chest.notifications.filter(n => n.member === camille.id);
  assert.equal(toCamille.length, 1);
  assert.equal(toCamille[0]!.path, "/chest/approve");
  assert.equal(shownTo(toCamille[0]!, "fr").title.replace(/\s/gu, " "), "Hugo Bernard a envoyé une dépense · 42,50 €");
  assert.equal(toCamille[0]!.title, "Hugo Bernard sent an expense · €42.50");
  assert.match(shownTo(toCamille[0]!, "fr").body!.replace(/\s/gu, " "), /Big Mamma · 42,50 €/u);
  // A company card payment with no expense: its holder is asked, the
  // payment named; asked twice, still one item.
  const team = new Set(everyone.filter(p => p.role).map(p => p.id));
  const made = await cards.importStatement(sql, asMember(camille), { lines: [{ date: "2026-09-15", label: "UBER *TRIP", amount: 2340, currency: "EUR", member: hugo.id }] }, team);
  await tell.cardReceipts(sql, made.owners);
  await tell.cardReceipts(sql, made.owners);
  const toHugo = chest.notifications.filter(n => n.member === hugo.id && n.key === `card:${hugo.id}`);
  assert.equal(toHugo.length, 1);
  assert.equal(toHugo[0]!.title, "A company card payment needs its receipt");
  assert.match(toHugo[0]!.body!, /UBER \*TRIP · €23\.40/u);
  assert.equal(chest.outbox.length, 0);
});
