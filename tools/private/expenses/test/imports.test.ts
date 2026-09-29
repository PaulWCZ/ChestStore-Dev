import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError, type ErrorCode } from "../lib/app-error.ts";
import { detectSeparator, guessDateOrder, guessMapping, importFields, parseCsv, readDate } from "../lib/csv-read.ts";
import * as expenses from "../lib/expenses.ts";
import { importExpenses } from "../lib/imports.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";

// Past expenses from the tool used before. The two files in fixtures/ are
// modelled on the exports those tools document (THIRD_PARTY.md: sources
// and dates): Expensify's CSV (US dates, commas, a refund, another currency,
// a person who is not in the team) and a French export in N2F's manner
// (semicolons, decimal commas, day-first dates, accents).
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});
const refuses = (code: ErrorCode) => (e: unknown) => e instanceof AppError && e.code === code;
const team = everyone.map(m => ({ id: m.id, name: m.name }));
const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

function lines(rows: string[][]): Record<string, string>[] {
  const mapping = guessMapping(rows[0]!);
  return rows.slice(1).map(r => Object.fromEntries(importFields.map(f => [f, mapping[f] === undefined ? "" : r[mapping[f]!] ?? ""])));
}

test("reading exports: the separator, quotes, the columns and the date order are found", () => {
  const expensify = parseCsv(fixture("expensify-export.csv"));
  assert.equal(expensify.length, 6);
  assert.equal(expensify[1]![5], "Airport to office, late flight");
  assert.equal(expensify[5]![2], "1,240.00");
  assert.deepEqual(guessMapping(expensify[0]!), { date: 0, person: 10, amount: 2, currency: 7, category: 3, merchant: 1, note: 5 });
  assert.equal(guessDateOrder(expensify.slice(1).map(r => r[0]!)), "mdy");
  const n2f = parseCsv(fixture("n2f-export.csv"));
  assert.equal(detectSeparator(fixture("n2f-export.csv")), ";");
  assert.deepEqual(guessMapping(n2f[0]!), { date: 0, person: 1, amount: 4, currency: 5, category: 2, merchant: 3, note: 7 });
  assert.equal(guessDateOrder(n2f.slice(1).map(r => r[0]!)), "dmy");
  assert.equal(readDate("31/03/2026", "dmy"), "2026-03-31");
  assert.equal(readDate("03/14/2026", "mdy"), "2026-03-14");
  assert.equal(readDate("2026-3-4", "dmy"), "2026-03-04");
  assert.equal(readDate("31/02/2026", "dmy"), null);
  assert.equal(readDate("soon", "dmy"), null);
  assert.deepEqual(parseCsv('﻿a,"b ""quoted""\nline",c\r\n\r\n1,2,3'), [["a", 'b "quoted"\nline', "c"], ["1", "2", "3"]]);
});

test("importing: each line becomes its person's history, paid back before; never paid, exported or imported twice", async () => {
  const { sql } = database;
  const expensify = lines(parseCsv(fixture("expensify-export.csv")));
  await assert.rejects(importExpenses(sql, asMember(ines), { lines: expensify, dateOrder: "mdy" }, team), refuses("forbidden"));
  await assert.rejects(importExpenses(sql, asMember(camille), { lines: [], dateOrder: "mdy" }, team), refuses("nothing_selected"));
  await assert.rejects(importExpenses(sql, asMember(camille), { lines: Array.from({ length: 2001 }, () => ({})), dateOrder: "mdy" }, team), refuses("too_many"));
  const first = await importExpenses(sql, asMember(camille), { lines: expensify, dateOrder: "mdy" }, team);
  assert.equal(first.imported, 3);
  assert.deepEqual(first.skipped, [{ line: 4, reason: "negative" }, { line: 5, reason: "person" }]);
  const hugos = await expenses.mine(sql, asMember(hugo));
  assert.deepEqual(hugos.map(e => [e.spentOn, e.merchant, e.amount, e.currency, e.status, e.imported]), [
    ["2026-03-18", "Pret A Manger", 1290, "EUR", "paid", true],
    ["2026-03-14", "Uber", 2340, "EUR", "paid", true],
  ]);
  const [meals, other, travel] = await Promise.all(["meals", "other", "travel"].map(async k => String((await sql`select id from categories where key = ${k}`)[0]!["id"])));
  assert.equal(hugos[0]!.categoryId, meals); // "Meals"
  assert.equal(hugos[1]!.categoryId, other); // "Taxi": not a category here
  assert.equal(hugos[1]!.note, "Airport to office, late flight");
  const london = (await expenses.mine(sql, asMember(lea)))[0]!;
  assert.deepEqual([london.amount, london.currency, london.base, london.categoryId], [2500, "GBP", null, other]);
  assert.equal((await expenses.expense(sql, asMember(hugo), hugos[0]!.id)).history[0]!.kind, "imported");
  // Again: recognised, nothing twice.
  const again = await importExpenses(sql, asMember(camille), { lines: expensify, dateOrder: "mdy" }, team);
  assert.equal(again.imported, 0);
  assert.deepEqual(again.skipped.map(s => s.reason), ["duplicate", "duplicate", "duplicate", "negative", "person"]);
  // A French export: accents and case aside, names match; categories by their French names.
  const n2f = await importExpenses(sql, asMember(camille), { lines: lines(parseCsv(fixture("n2f-export.csv"))), dateOrder: "dmy" }, team);
  assert.equal(n2f.imported, 3);
  const inès = await expenses.mine(sql, asMember(ines));
  assert.deepEqual(inès.map(e => [e.spentOn, e.amount]), [["2026-03-31", 1800], ["2026-03-05", 6230], ["2026-03-02", 14200]]);
  const parking = String((await sql`select id from categories where key = 'parking'`)[0]!["id"]);
  assert.equal(inès[0]!.categoryId, parking);
  assert.notEqual(inès[1]!.categoryId, travel);
  // History only: nothing to pay, nothing in the month's export or entries.
  assert.equal((await expenses.toPay(sql, asMember(camille))).length, 0);
  assert.equal((await expenses.exportRows(sql, asMember(camille), { from: "2026-03-01", to: "2026-04-01" })).length, 0);
  assert.equal((await expenses.exportMonths(sql, asMember(camille))).length, 0);
  // A bad date or amount is left out with its reason.
  const bad = await importExpenses(sql, asMember(camille), { lines: [{ person: "Hugo Bernard", date: "yesterday", amount: "3" }, { person: "Hugo Bernard", date: "2026-03-01", amount: "abc" }], dateOrder: "ymd" }, team);
  assert.deepEqual(bad.skipped.map(s => s.reason), ["date_invalid", "amount_invalid"]);
});
