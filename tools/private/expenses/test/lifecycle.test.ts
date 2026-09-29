import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import * as bank from "../lib/bank.ts";
import * as expenses from "../lib/expenses.ts";
import * as settings from "../lib/settings.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";
import { upload } from "./support/receipts.ts";

let database: TestDatabase;
let chest: FakeChest;
let meals = "";
const yes = async () => true;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  meals = String((await database.sql`select id from categories where key = 'meals'`)[0]!["id"]);
});
after(async () => {
  await chest.close();
  await database.close();
});

const lunch = (amount: string) => ({ spentOn: "2026-09-10", amount, categoryId: meals, merchant: "Bistrot", note: "With my sister-in-law" });

test("an approver who leaves: the people they approved, and what waits for them, go to the accountants", async () => {
  const { sql } = database;
  await settings.setApprover(sql, asMember(camille), hugo.id, ines.id, yes);
  const a = (await expenses.saveExpense(sql, asMember(hugo), null, lunch("30"))).expense;
  await expenses.submit(sql, asMember(hugo), [a.id], yes);
  assert.equal(await chest.emit({ type: "access.revoked", data: { id: ines.id } }, POST), 204);
  assert.equal(await settings.approverOf(sql, hugo.id), null);
  assert.deepEqual((await expenses.waiting(sql, asMember(camille))).map(e => [e.id, e.approver]), [[a.id, null]]);
  assert.equal(chest.badges.get(camille.id), 1);
  const detail = await expenses.expense(sql, asMember(camille), a.id);
  assert.deepEqual(detail.history.at(-1), { ...detail.history.at(-1)!, actor: "chest", kind: "reassigned" });
});

test("someone who leaves: what they sent still waits, for the accountant to approve and pay", async () => {
  const { sql } = database;
  const a = (await expenses.saveExpense(sql, asMember(lea), null, lunch("12"))).expense;
  await expenses.submit(sql, asMember(lea), [a.id], yes);
  assert.equal(await chest.emit({ type: "member.removed", data: { id: lea.id } }, POST), 204);
  await expenses.decide(sql, asMember(camille), [a.id], "approve");
  await expenses.markPaid(sql, asMember(camille), [a.id], "2026-09-28");
  assert.equal((await expenses.expense(sql, asMember(camille), a.id)).expense.owner, lea.id);
});

test("an erasure keeps the accounting records under 'erased', deletes notes, drafts and their receipts, and is acknowledged once", async () => {
  const { sql } = database;
  await settings.setVehicle(sql, asMember(hugo), { kind: "car", power: "4", electric: false });
  await settings.setApprover(sql, asMember(camille), hugo.id, camille.id, yes);
  const kept = (await expenses.saveExpense(sql, asMember(hugo), null, lunch("25"), await upload(chest, sql, asMember(hugo)))).expense;
  const draftReceipt = await upload(chest, sql, asMember(hugo));
  const draft = (await expenses.saveExpense(sql, asMember(hugo), null, lunch("8"), draftReceipt)).expense;
  const unused = await upload(chest, sql, asMember(hugo));
  await expenses.submit(sql, asMember(hugo), [kept.id], yes);
  await expenses.decide(sql, asMember(camille), [kept.id], "approve");
  const withHugo = (await expenses.saveExpense(sql, asMember(lea), null, { ...lunch("30"), guestMembers: [hugo.id, camille.id] })).expense;
  await bank.setBankDetails(sql, asMember(hugo), hugo.id, { iban: "FR76 3000 6000 0112 3456 7890 189" });
  await settings.setMemberAccount(sql, asMember(camille), hugo.id, "421BERNARD");
  await expenses.setPriorDistance(sql, asMember(hugo), { year: Number(new Date().getFullYear()), distance: "120" });
  const erasure = "era_" + "c".repeat(26);
  const event = { type: "member.erased" as const, id: "evt_" + "d".repeat(26), data: { id: hugo.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  assert.deepEqual(chest.acknowledged, [erasure]);
  const [row] = await sql`select member_id, note, amount_cents, receipt_object, status from expenses where id = ${kept.id}`;
  assert.deepEqual({ ...row }, { member_id: "erased", note: "", amount_cents: "2500", receipt_object: row!["receipt_object"], status: "approved" });
  assert.ok(chest.files.has(String(row!["receipt_object"])), "the kept receipt stays");
  assert.equal((await sql`select 1 from expenses where id = ${draft.id}`).length, 0);
  assert.ok(!chest.files.has(draftReceipt.object) && !chest.files.has(unused.object), "drafts' and unused receipts go");
  const left = await sql`
    select (select count(*) from history where actor = ${hugo.id})::int + (select count(*) from vehicles where member_id = ${hugo.id})::int
      + (select count(*) from approvers where member_id = ${hugo.id} or approver_id = ${hugo.id})::int + (select count(*) from claims where member_id = ${hugo.id})::int
      + (select count(*) from expenses where member_id = ${hugo.id} or decided_by = ${hugo.id} or approver_id = ${hugo.id})::int
      + (select count(*) from bank_accounts where owner = ${hugo.id})::int + (select count(*) from member_accounts where member_id = ${hugo.id})::int
      + (select count(*) from prior_distances where member_id = ${hugo.id})::int as n`;
  assert.equal(left[0]!["n"], 0);
  // As someone else's guest, a former member.
  assert.deepEqual((await expenses.expense(sql, asMember(lea), withHugo.id)).expense.guests.members, ["erased", camille.id]);
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});
