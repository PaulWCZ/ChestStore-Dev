import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError, type ErrorCode } from "../lib/app-error.ts";
import * as expenses from "../lib/expenses.ts";
import { today } from "../lib/model.ts";
import { grant } from "../lib/receipts.ts";
import * as settings from "../lib/settings.ts";
import * as tell from "../lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, tom } from "./support/members.ts";
import { upload } from "./support/receipts.ts";

let database: TestDatabase;
let chest: FakeChest;
const cat: Record<string, string> = {};
const yes = async () => true;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  for (const r of await database.sql<{ id: string; key: string }[]>`select id, key from categories`) cat[r.key] = String(r.id);
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`delete from expenses`;
  await database.sql`delete from approvers`;
  chest.notifications.length = 0;
});

const spaces = (text: string) => text.replace(/\s/gu, " ");
const refuses = (code: ErrorCode) => (e: unknown) => e instanceof AppError && e.code === code;
const lunch = (extra: Partial<expenses.ExpenseInput> = {}): expenses.ExpenseInput => ({ spentOn: "2026-09-10", amount: "42,50", categoryId: cat["meals"], merchant: "Chez Paul", paidBy: "me", ...extra });

test("an employee adds an expense with its receipt, kept as sent with its SHA-256", async () => {
  const { sql } = database;
  const receipt = await upload(chest, sql, asMember(hugo), "%PDF-1.4 lunch");
  const saved = await expenses.saveExpense(sql, asMember(hugo), null, { ...lunch(), vat: "3,86", note: "With the client\nfrom Lyon", receiptName: "ticket.pdf" }, receipt);
  const e = saved.expense;
  assert.equal(e.amount, 4250);
  assert.equal(e.vat, 386);
  assert.equal(e.currency, "EUR");
  assert.equal(e.status, "draft");
  assert.equal(e.note, "With the client\nfrom Lyon");
  assert.deepEqual(e.receipt, { name: "ticket.pdf", type: "application/pdf", size: 14 });
  const [row] = await sql`select receipt_sha256 from expenses where id = ${e.id}`;
  assert.match(String(row!["receipt_sha256"]), /^[0-9a-f]{64}$/u);
  // The upload is used: nobody can put it on another expense.
  await assert.rejects(expenses.saveExpense(sql, asMember(hugo), null, lunch(), receipt), refuses("file_missing"));
  const [left] = await sql`select count(*)::int as n from uploads where object = ${receipt.object}`;
  assert.equal(left!["n"], 0);
});

test("what an expense refuses: bad amount, VAT over the amount, future date, mileage or unknown category, no role", async () => {
  const { sql } = database;
  const cases: [expenses.ExpenseInput, ErrorCode][] = [
    [lunch({ amount: "abc" }), "amount_invalid"],
    [lunch({ amount: "0" }), "amount_invalid"],
    [lunch({ amount: "2000000" }), "amount_invalid"],
    [lunch({ vat: "50" }), "vat_too_high"],
    [lunch({ spentOn: "2099-01-01" }), "date_future"],
    [lunch({ spentOn: "2026-02-30" }), "date_invalid"],
    [lunch({ categoryId: cat["mileage"] }), "category_invalid"],
    [lunch({ categoryId: "999999" }), "category_invalid"],
    [lunch({ currency: "XXX1" }), "currency_invalid"],
    [lunch({ paidBy: "boss" }), "invalid"],
    [lunch({ merchant: "x".repeat(121) }), "too_long"],
  ];
  for (const [input, code] of cases) await assert.rejects(expenses.saveExpense(sql, asMember(hugo), null, input), refuses(code), code);
  await assert.rejects(expenses.saveExpense(sql, asMember(nora), null, lunch()), refuses("forbidden"));
  await assert.rejects(expenses.saveExpense(sql, null, null, lunch()), refuses("forbidden"));
  const other = await expenses.saveExpense(sql, asMember(lea), null, lunch({ currency: "GBP" }));
  assert.equal(other.expense.currency, "GBP");
  // Someone else's draft does not exist for Hugo.
  await assert.rejects(expenses.saveExpense(sql, asMember(hugo), other.expense.id, lunch()), refuses("not_found"));
  await assert.rejects(expenses.expense(sql, asMember(camille), other.expense.id), refuses("not_found"));
});

test("a receipt must be the member's own upload, arrived, of an accepted type and size", async () => {
  const { sql } = database;
  await assert.rejects(grant(sql, asMember(hugo), { type: "text/html", size: 10 }), refuses("file_type"));
  await assert.rejects(grant(sql, asMember(hugo), { type: "image/jpeg", size: 11 << 20 }), refuses("file_too_large"));
  await assert.rejects(grant(sql, asMember(nora), { type: "image/jpeg", size: 10 }), refuses("forbidden"));
  const up = await grant(sql, asMember(hugo), { type: "image/jpeg", size: 10 });
  const { inspect } = await import("../lib/receipts.ts");
  await assert.rejects(inspect(sql, asMember(hugo), up.object), refuses("file_missing"));
  await assert.rejects(inspect(sql, asMember(lea), up.object), refuses("file_missing"));
  await assert.rejects(inspect(sql, asMember(hugo), "receipts/../x"), refuses("file_missing"));
  // The Chest's front holds the token to the type authorised.
  assert.equal((await chest.upload(up.url, "%PDF-1.4", "application/pdf")).status, 415);
});

test("warnings, never blocks: duplicate, no receipt, above the category's limit, receipt used twice", async () => {
  const { sql } = database;
  await settings.updateCategory(sql, asMember(camille), cat["meals"], { cap: "40" });
  const a = (await expenses.saveExpense(sql, asMember(hugo), null, lunch())).expense;
  const b = (await expenses.saveExpense(sql, asMember(hugo), null, lunch({ merchant: "chez paul" }))).expense;
  const c = (await expenses.saveExpense(sql, asMember(hugo), null, lunch({ amount: "12" }))).expense;
  const found = await expenses.warnings(sql, [a, b, c]);
  assert.deepEqual(found.get(a.id)?.map(w => w.code), ["duplicate", "no_receipt", "over_cap"]);
  assert.equal(found.get(a.id)?.at(-1)?.cap, 4000);
  assert.deepEqual(found.get(c.id)?.map(w => w.code), ["no_receipt"]);
  // The same file on two people's expenses: the approver sees it.
  const bytes = "%PDF-1.4 shared bill";
  const r1 = await upload(chest, sql, asMember(hugo), bytes);
  const r2 = await upload(chest, sql, asMember(lea), bytes);
  const h = (await expenses.saveExpense(sql, asMember(hugo), null, lunch({ amount: "30" }), r1)).expense;
  const l = (await expenses.saveExpense(sql, asMember(lea), null, lunch({ amount: "30" }), r2)).expense;
  assert.equal((await expenses.warnings(sql, [h])).get(h.id), undefined);
  assert.deepEqual((await expenses.warnings(sql, [h, l], { anyone: true })).get(l.id)?.map(w => w.code), ["receipt_reused"]);
  await settings.updateCategory(sql, asMember(camille), cat["meals"], { cap: null });
});

test("send, then the named approver approves; the owner hears it in their language; badges follow", async () => {
  const { sql } = database;
  await settings.setApprover(sql, asMember(camille), hugo.id, ines.id, yes);
  const a = (await expenses.saveExpense(sql, asMember(hugo), null, lunch())).expense;
  const b = (await expenses.saveExpense(sql, asMember(hugo), null, lunch({ amount: "18", merchant: "SNCF", categoryId: cat["travel"] }))).expense;
  await assert.rejects(expenses.submit(sql, asMember(hugo), [], yes), refuses("nothing_selected"));
  await assert.rejects(expenses.submit(sql, asMember(lea), [a.id], yes), refuses("not_found"));
  const sent = await expenses.submit(sql, asMember(hugo), [a.id, b.id], yes);
  assert.equal(sent.approver, ines.id);
  await tell.sent(sql, asMember(hugo), sent);
  assert.deepEqual(chest.notifications.map(n => [n.member, spaces(n.title), n.key]), [[ines.id, "Hugo Bernard a envoyé 2 dépenses · 60,50 €", `waiting:${hugo.id}`]]);
  assert.equal(chest.badges.get(ines.id), 2);
  // Sent: no more changes, no second sending.
  await assert.rejects(expenses.saveExpense(sql, asMember(hugo), a.id, lunch()), refuses("not_draft"));
  await assert.rejects(expenses.submit(sql, asMember(hugo), [a.id], yes), refuses("not_draft"));
  await assert.rejects(expenses.remove(sql, asMember(hugo), a.id), refuses("not_draft"));
  // Who decides: not Hugo, not Tom (another approver), not Léa.
  await assert.rejects(expenses.decide(sql, asMember(hugo), [a.id], "approve"), refuses("forbidden"));
  await assert.rejects(expenses.decide(sql, asMember(tom), [a.id], "approve"), refuses("not_found"));
  await assert.rejects(expenses.decide(sql, asMember(lea), [a.id], "approve"), refuses("forbidden"));
  assert.deepEqual((await expenses.waiting(sql, asMember(ines))).map(e => e.id), [a.id, b.id]);
  assert.deepEqual((await expenses.waiting(sql, asMember(tom))).map(e => e.id), []);
  const decisions = await expenses.decide(sql, asMember(ines), [a.id, b.id], "approve");
  await tell.decided(sql, asMember(ines), decisions, "approve");
  assert.equal((await expenses.expense(sql, asMember(hugo), a.id)).expense.status, "approved");
  assert.deepEqual(chest.notifications.map(n => [n.member, n.title]), [[hugo.id, "Inès Moreau approved 2 expenses · €60.50"]]);
  assert.equal(chest.badges.get(ines.id), undefined);
  await assert.rejects(expenses.decide(sql, asMember(ines), [a.id], "approve"), refuses("not_submitted"));
  // The approver still sees what they approved; history says who did what.
  const seen = await expenses.expense(sql, asMember(ines), a.id);
  assert.deepEqual(seen.history.map(h => [h.kind, h.actor]), [["created", hugo.id], ["submitted", hugo.id], ["approved", ines.id]]);
});

test("a refusal needs a reason and brings the expense back to its owner's drafts, with it", async () => {
  const { sql } = database;
  const a = (await expenses.saveExpense(sql, asMember(lea), null, lunch())).expense;
  const sent = await expenses.submit(sql, asMember(lea), [a.id], yes);
  assert.equal(sent.approver, null); // nobody named: the accountants
  await tell.sent(sql, asMember(lea), sent);
  assert.equal(chest.badges.get(camille.id), 1);
  await assert.rejects(expenses.decide(sql, asMember(camille), [a.id], "refuse", "  "), refuses("reason_needed"));
  await assert.rejects(expenses.decide(sql, asMember(ines), [a.id], "refuse", "No"), refuses("not_found"));
  const decisions = await expenses.decide(sql, asMember(camille), [a.id], "refuse", "The date is missing on the receipt");
  await tell.decided(sql, asMember(camille), decisions, "refuse", "The date is missing on the receipt");
  const back = (await expenses.expense(sql, asMember(lea), a.id)).expense;
  assert.equal(back.status, "draft");
  assert.equal(back.refusedReason, "The date is missing on the receipt");
  const bell = chest.notifications.find(n => n.member === lea.id)!;
  assert.equal(spaces(bell.title), "Camille Martin a refusé une dépense : Chez Paul · 42,50 €");
  assert.equal(bell.body, "The date is missing on the receipt");
  assert.equal(chest.badges.get(lea.id), 1);
  assert.equal(chest.badges.get(camille.id), undefined);
  // The accountant no longer sees a draft; Léa fixes it and sends it again.
  await assert.rejects(expenses.expense(sql, asMember(camille), a.id), refuses("not_found"));
  await expenses.saveExpense(sql, asMember(lea), a.id, lunch({ spentOn: "2026-09-11" }));
  const again = await expenses.submit(sql, asMember(lea), [a.id], yes);
  await tell.sent(sql, asMember(lea), again);
  assert.equal((await expenses.expense(sql, asMember(lea), a.id)).expense.refusedReason, null);
  assert.equal(chest.badges.get(lea.id), undefined);
  assert.equal(chest.notifications.some(n => n.key === `refused:${a.id}`), false);
});

test("an approver who may no longer approve is passed over: the accountants get it", async () => {
  const { sql } = database;
  await settings.setApprover(sql, asMember(camille), hugo.id, tom.id, yes);
  const a = (await expenses.saveExpense(sql, asMember(hugo), null, lunch())).expense;
  const sent = await expenses.submit(sql, asMember(hugo), [a.id], async () => false);
  assert.equal(sent.approver, null);
  await assert.rejects(settings.setApprover(sql, asMember(camille), hugo.id, lea.id, async () => false), refuses("approver_invalid"));
  await assert.rejects(settings.setApprover(sql, asMember(camille), hugo.id, hugo.id, yes), refuses("approver_invalid"));
  await assert.rejects(settings.setApprover(sql, asMember(ines), hugo.id, ines.id, yes), refuses("forbidden"));
  // Naming someone moves what waits to them.
  const previous = await settings.setApprover(sql, asMember(camille), hugo.id, ines.id, yes);
  assert.deepEqual(previous, []);
  assert.deepEqual((await expenses.waiting(sql, asMember(ines))).map(e => e.id), [a.id]);
});

test("an accountant nobody approves approves their own; with an approver named, they cannot", async () => {
  const { sql } = database;
  const a = (await expenses.saveExpense(sql, asMember(camille), null, lunch())).expense;
  await expenses.submit(sql, asMember(camille), [a.id], yes);
  await expenses.decide(sql, asMember(camille), [a.id], "approve");
  assert.equal((await expenses.expense(sql, asMember(camille), a.id)).expense.decidedBy, camille.id);
  await settings.setApprover(sql, asMember(camille), camille.id, ines.id, yes);
  const b = (await expenses.saveExpense(sql, asMember(camille), null, lunch({ amount: "10" }))).expense;
  await expenses.submit(sql, asMember(camille), [b.id], yes);
  await assert.rejects(expenses.decide(sql, asMember(camille), [b.id], "approve"), refuses("self_approval"));
});

test("the accountant pays back what was approved and paid with one's own money; company card never", async () => {
  const { sql } = database;
  const mine = (await expenses.saveExpense(sql, asMember(hugo), null, lunch())).expense;
  const card = (await expenses.saveExpense(sql, asMember(hugo), null, lunch({ amount: "80", paidBy: "company", merchant: "Hotel" }))).expense;
  const draft = (await expenses.saveExpense(sql, asMember(hugo), null, lunch({ amount: "5" }))).expense;
  await expenses.submit(sql, asMember(hugo), [mine.id, card.id], yes);
  await expenses.decide(sql, asMember(camille), [mine.id, card.id], "approve");
  assert.deepEqual((await expenses.toPay(sql, asMember(camille))).map(e => e.id), [mine.id]);
  await assert.rejects(expenses.toPay(sql, asMember(ines)), refuses("forbidden"));
  await assert.rejects(expenses.markPaid(sql, asMember(ines), [mine.id], today()), refuses("forbidden"));
  await assert.rejects(expenses.markPaid(sql, asMember(camille), [card.id], today()), refuses("not_approved"));
  await assert.rejects(expenses.markPaid(sql, asMember(camille), [draft.id], today()), refuses("not_approved"));
  await assert.rejects(expenses.markPaid(sql, asMember(camille), [mine.id], "2099-01-01"), refuses("date_future"));
  const done = await expenses.markPaid(sql, asMember(camille), [mine.id], "2026-09-28");
  await tell.paid(sql, asMember(camille), done, "2026-09-28");
  assert.equal((await expenses.expense(sql, asMember(hugo), mine.id)).expense.paidOn, "2026-09-28");
  assert.deepEqual(chest.notifications.map(n => [n.member, n.title]), [[hugo.id, "Paid back: €42.50, on 28 September"]]);
  // Undo.
  assert.deepEqual(await expenses.unmarkPaid(sql, asMember(camille), [mine.id]), [hugo.id]);
  assert.equal((await expenses.expense(sql, asMember(hugo), mine.id)).expense.status, "approved");
  await assert.rejects(expenses.unmarkPaid(sql, asMember(camille), [mine.id]), refuses("invalid"));
});

test("a deleted draft can be restored; only drafts are deleted, only by their owner", async () => {
  const { sql } = database;
  const a = (await expenses.saveExpense(sql, asMember(hugo), null, lunch())).expense;
  await assert.rejects(expenses.remove(sql, asMember(lea), a.id), refuses("not_found"));
  await expenses.remove(sql, asMember(hugo), a.id);
  assert.deepEqual((await expenses.mine(sql, asMember(hugo))).map(e => e.id), []);
  await assert.rejects(expenses.restore(sql, asMember(lea), a.id), refuses("not_found"));
  await expenses.restore(sql, asMember(hugo), a.id);
  assert.deepEqual((await expenses.mine(sql, asMember(hugo))).map(e => e.id), [a.id]);
});

test("car trips: the year's earlier trips set the band; a trip added before others moves them; approved ones stay", async () => {
  const { sql } = database;
  await assert.rejects(expenses.saveTrip(sql, asMember(hugo), null, { spentOn: "2026-03-01", from: "Paris", to: "Lyon", distance: "465" }), refuses("no_vehicle"));
  await settings.setVehicle(sql, asMember(hugo), { kind: "car", power: "5", electric: false });
  await assert.rejects(settings.setVehicle(sql, asMember(hugo), { kind: "car", power: "12", electric: false }), refuses("invalid"));
  // 4,800 km in spring, approved.
  const spring = await expenses.saveTrip(sql, asMember(hugo), null, { spentOn: "2026-03-01", from: "Paris", to: "Tour", distance: "4800" });
  assert.equal(spring.amount, 305_280);
  assert.equal(spring.trip?.scaleYear, 2025); // no 2026 scale yet: the latest before
  await expenses.submit(sql, asMember(hugo), [spring.id], yes);
  await expenses.decide(sql, asMember(camille), [spring.id], "approve");
  // A 400 km trip in June crosses 5,000 km.
  const june = await expenses.saveTrip(sql, asMember(hugo), null, { spentOn: "2026-06-10", from: "Paris", to: "Rouen", distance: "200", roundTrip: true });
  assert.equal(june.trip?.distance, 4000);
  assert.equal(june.amount, 325_140 - 305_280);
  // A trip in May, entered later: June moves further along the scale; spring does not change.
  const may = await expenses.saveTrip(sql, asMember(hugo), null, { spentOn: "2026-05-02", from: "Paris", to: "Orly", distance: "100" });
  assert.equal(may.amount, 311_640 - 305_280);
  const juneAfter = (await expenses.expense(sql, asMember(hugo), june.id)).expense;
  assert.equal(juneAfter.amount, (5_300 * 357 / 10 + 139_500) - 311_640);
  assert.equal((await expenses.expense(sql, asMember(hugo), spring.id)).expense.amount, 305_280);
  // Deleting May brings June back.
  await expenses.remove(sql, asMember(hugo), may.id);
  assert.equal((await expenses.expense(sql, asMember(hugo), june.id)).expense.amount, 325_140 - 305_280);
  // Another year starts again at zero; an electric car: +20 %.
  await settings.setVehicle(sql, asMember(hugo), { kind: "car", power: "5", electric: true });
  const next = await expenses.saveTrip(sql, asMember(hugo), null, { spentOn: "2025-12-30", from: "A", to: "B", distance: "100" });
  assert.equal(next.amount, Math.round(100 * 636 * 1.2 / 10));
  assert.equal(await expenses.yearDistance(sql, hugo.id, 2026), 48_000 + 4_000);
  await assert.rejects(expenses.saveTrip(sql, asMember(hugo), null, { spentOn: "2026-03-01", from: "A", to: "B", distance: "-3" }), refuses("distance_invalid"));
  await assert.rejects(expenses.saveTrip(sql, asMember(hugo), null, { spentOn: "2026-03-01", from: "", to: "B", distance: "3" }), refuses("empty"));
  await assert.rejects(expenses.saveTrip(sql, asMember(hugo), null, { spentOn: "2026-03-01", from: "A", to: "B", distance: "6000", roundTrip: true }), refuses("distance_invalid"));
});

test("an edited scale changes the trips not yet approved", async () => {
  const { sql } = database;
  await settings.setVehicle(sql, asMember(lea), { kind: "car", power: "4", electric: false });
  const trip = await expenses.saveTrip(sql, asMember(lea), null, { spentOn: "2026-02-02", from: "A", to: "B", distance: "10" });
  assert.equal(trip.amount, 606);
  const current = await settings.scaleFor(sql, 2026);
  const data = structuredClone(current.data);
  data.car.rows.find(r => r.power === "4")!.bands[0][0] = 700;
  await assert.rejects(settings.saveScale(sql, asMember(ines), 2026, data, "x"), refuses("forbidden"));
  await settings.saveScale(sql, asMember(camille), 2026, data, "impots.gouv.fr, 2027-04-01");
  await expenses.recomputeAllTrips(sql);
  const after = (await expenses.expense(sql, asMember(lea), trip.id)).expense;
  assert.equal(after.amount, 700);
  assert.equal(after.trip?.scaleYear, 2026);
  await sql`delete from mileage_scales where year = 2026`;
});
