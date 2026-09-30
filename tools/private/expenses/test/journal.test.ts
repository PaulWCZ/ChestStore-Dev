import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, withMember, type FakeChest } from "@argentic/chest-sdk/testing";
import { GET as csvRoute } from "../app/chest/export/csv/route.ts";
import { GET as journalRoute } from "../app/chest/export/journal/route.ts";
import * as expenses from "../lib/expenses.ts";
import { fecAmount, fecColumns } from "../lib/journal.ts";
import * as settings from "../lib/settings.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";

// The accounting entries (FEC layout), the flat rates and hotel nights in
// the exports, and the export by the month of payment.
let database: TestDatabase;
let chest: FakeChest;
const cat: Record<string, string> = {};
const ids: Record<string, string> = {};
const yes = async () => true;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  const { sql } = database;
  for (const r of await sql<{ id: string; key: string }[]>`select id, key from categories`) cat[r.key] = String(r.id);
  const [night] = await sql<{ id: string }[]>`select id from allowances where key = 'night_other'`;
  await settings.setMemberAccount(sql, asMember(camille), hugo.id, "421BERNARD");
  await settings.updateSettings(sql, asMember(camille), { journal: { code: "NF" } });
  ids["lunch"] = (await expenses.saveExpense(sql, asMember(hugo), null, { spentOn: "2026-09-10", amount: "42,50", vat: "3,86", categoryId: cat["meals"], merchant: "Chez Paul", guestNames: ["M. Garnier (Garnier & Fils)"] })).expense.id;
  ids["hotel"] = (await expenses.saveExpense(sql, asMember(hugo), null, { spentOn: "2026-09-11", amount: "240", vat: "21,82", categoryId: cat["lodging"], merchant: "Hôtel du Parc", paidBy: "company", nights: "2" })).expense.id;
  ids["london"] = (await expenses.saveExpense(sql, asMember(lea), null, { spentOn: "2026-09-12", amount: "12,50", vat: "2,08", currency: "GBP", rate: "1,1653", categoryId: cat["travel"], merchant: "TfL" })).expense.id;
  ids["tokyo"] = (await expenses.saveExpense(sql, asMember(lea), null, { spentOn: "2026-09-13", amount: "4000", currency: "JPY", categoryId: cat["meals"], merchant: "Ramen" })).expense.id;
  ids["flat"] = (await expenses.saveAllowance(sql, asMember(hugo), null, { spentOn: "2026-09-14", allowanceId: String(night!.id), units: 3, note: "Chantier Nantes" })).id;
  await expenses.submit(sql, asMember(hugo), [ids["lunch"]!, ids["hotel"]!, ids["flat"]!], yes);
  await expenses.submit(sql, asMember(lea), [ids["london"]!, ids["tokyo"]!], yes);
  await expenses.decide(sql, asMember(camille), Object.values(ids), "approve");
  const august = (await expenses.saveExpense(sql, asMember(hugo), null, { spentOn: "2026-08-30", amount: "7", categoryId: cat["other"], merchant: "Kiosque" })).expense.id;
  await expenses.submit(sql, asMember(hugo), [august], yes);
  await expenses.decide(sql, asMember(camille), [august], "approve");
  ids["august"] = august;
  await expenses.markPaid(sql, asMember(camille), [ids["lunch"]!, august], "2026-09-28");
});
after(async () => {
  await chest.close();
  await database.close();
});

const get = (route: typeof csvRoute, path: string, who: typeof camille) => route(withMember(new Request("http://tool.test" + path), who));

test("the entries: 18 FEC columns, one balanced entry per expense, each person's account", async () => {
  const response = await get(journalRoute, "/chest/export/journal?month=2026-09", camille);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Disposition") ?? "", /Notes-de-frais_2026-09_ecritures\.txt/u);
  const rows = (await response.text()).replace(/\r\n$/u, "").split("\r\n").map(l => l.split("\t"));
  assert.deepEqual(rows[0], [...fecColumns]);
  assert.ok(rows.every(r => r.length === 18), "18 columns on every line");
  const entry = (id: string) => rows.filter(r => r[2] === "E" + id);
  assert.equal(entry(ids["august"]!).length, 0); // spent in August
  // The lunch: expense net, deductible VAT (meals 100 %), Hugo's own account.
  assert.deepEqual(entry(ids["lunch"]!).map(r => [r[0], r[1], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[11], r[12], r[16], r[17]]), [
    ["NF", "Notes de frais", "20260910", "625700", "Repas", "", "", "E" + ids["lunch"], "20260910", "38,64", "0,00", "", ""],
    ["NF", "Notes de frais", "20260910", "445660", "TVA déductible", "", "", "E" + ids["lunch"], "20260910", "3,86", "0,00", "", ""],
    ["NF", "Notes de frais", "20260910", "421000", "Personnel, notes de frais", "421BERNARD", "Hugo Bernard", "E" + ids["lunch"], "20260910", "0,00", "42,50", "", ""],
  ]);
  assert.equal(entry(ids["lunch"]!)[0]![10], "Hugo Bernard Chez Paul");
  assert.match(entry(ids["lunch"]!)[0]![15]!, /^\d{8}$/u); // ValidDate: the approval's day
  // The hotel on the company card: VAT not recoverable (0 %), the card's account.
  assert.deepEqual(entry(ids["hotel"]!).map(r => [r[4], r[11], r[12]]), [["625600", "240,00", "0,00"], ["467000", "0,00", "240,00"]]);
  // London in pounds at Léa's rate: euros, the pounds on the credit line, no VAT deducted.
  assert.deepEqual(entry(ids["london"]!).map(r => [r[4], r[6], r[11], r[12], r[16], r[17]]), [["625100", "", "14,57", "0,00", "", ""], ["421000", "", "0,00", "14,57", "12,50", "GBP"]]);
  // Tokyo has no rate: left out.
  assert.equal(entry(ids["tokyo"]!).length, 0);
  // The flat rate: 3 nights × 56.80, its own account.
  assert.deepEqual(entry(ids["flat"]!).map(r => [r[4], r[5], r[11], r[12]]), [["625100", "Nuit et petit-déjeuner, autres départements (URSSAF)", "170,40", "0,00"], ["421000", "Personnel, notes de frais", "0,00", "170,40"]]);
  // Every entry balances.
  const cents = (s: string) => Number(s.replace(",", ""));
  for (const id of Object.values(ids).filter(i => i !== ids["august"])) {
    const lines = entry(id);
    assert.equal(lines.reduce((sum, r) => sum + cents(r[11]!), 0), lines.reduce((sum, r) => sum + cents(r[12]!), 0), "balanced " + id);
  }
  assert.equal((await get(journalRoute, "/chest/export/journal?month=2026-09", ines)).status, 403);
});

test("the spreadsheet says the flat rate, the nights, the rate and the guests; by the month of payment", async () => {
  const text = await (await get(csvRoute, "/chest/export/csv?month=2026-09", { ...camille, language: "en" })).text();
  assert.match(text, /"Night and breakfast, elsewhere in France \(URSSAF\), 3 nights × 56\.80 EUR, Chantier Nantes"/u);
  assert.match(text, /,2 nights,/u);
  assert.match(text, /,12\.50,GBP,1\.1653,14\.57,/u);
  assert.match(text, /,4000,JPY,,,/u);
  assert.match(text, /,M\. Garnier \(Garnier & Fils\)\r?$/mu);
  // Paid back in September: the lunch, and August's newspaper.
  const paid = (await (await get(csvRoute, "/chest/export/csv?month=2026-09&by=paid", camille)).text()).trim().split("\r\n");
  assert.deepEqual(paid.slice(1).map(l => l.split(";")[0]), ["30/08/2026", "10/09/2026"]);
  assert.equal((await expenses.exportMonths(database.sql, asMember(camille), "paid")).map(m => m.month).join(), "2026-09");
  assert.equal(await expenses.exportWithoutRate(database.sql, asMember(camille), { from: "2026-09-01", to: "2026-10-01" }), 1);
});

test("FEC amounts: a decimal comma, no grouping; currencies without decimals", () => {
  assert.equal(fecAmount(123456, "EUR"), "1234,56");
  assert.equal(fecAmount(5, "EUR"), "0,05");
  assert.equal(fecAmount(4000, "JPY"), "4000");
  assert.equal(fecAmount(0, "EUR"), "0,00");
});
