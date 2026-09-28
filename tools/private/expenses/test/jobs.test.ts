import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-jobs/[name]/route.ts";
import * as expenses from "../lib/expenses.ts";
import * as settings from "../lib/settings.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, lea } from "./support/members.ts";
import { upload } from "./support/receipts.ts";

let database: TestDatabase;
let chest: FakeChest;
let meals = "";
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, schedules: [{ name: "reminder", cron: "0 9 25 * *" }, { name: "cleanup", cron: "40 3 * * *" }] });
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
  assert.equal(await chest.run("reminder", POST), 204);
  assert.equal(chest.notifications.length, 1);
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
