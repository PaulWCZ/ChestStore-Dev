import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { atLeast } from "@argentic/chest-app/testing";
import { en } from "../src/i18n/en.ts";
import * as activities from "../src/lib/activities.ts";
import * as companies from "../src/lib/companies.ts";
import * as deals from "../src/lib/deals.ts";
import { AppError } from "../src/lib/errors.ts";
import { importTable } from "../src/lib/importers.ts";
import { checkExport, exportSetting, mayExport, setExport } from "../src/lib/settings.ts";
import { decimalMark, parseAmount } from "../src/shared/amount.ts";
import { parseCsv, toCsv } from "../src/shared/csv.ts";
import { guessMapping, readTable } from "../src/shared/parse-import.ts";
import { isPosition } from "../src/shared/position.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";

// The review of the move to the studio stack (round 4): big imports, the
// board's columns, amounts, the company's currency, two moves of one deal
// at once, the formula guard, who may download the lists.
atLeast(7);
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  // A Chest in dollars: what the tool writes follows it.
  chest = await fakeChest({ network: {}, members: everyone, chest: { currency: "USD" } });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("an import of 5,000 deals takes seconds, and a write beside it answers at once", async () => {
  const { sql } = database;
  const p = await companies.addCompany(sql, asMember(hugo), { name: "Beside the import" });
  const file = ["Deal Name,Amount,Deal Stage", ...Array.from({ length: 5000 }, (_, i) => `Bulk deal ${i + 1},${(i % 90) + 10} 000,Qualified`)].join("\n");
  const started = performance.now();
  const running = importTable(sql, asMember(camille), "deals", file, guessMapping("deals", readTable(file).head), en.stages, { fileName: "big.csv" });
  // Another member logs a call while it runs (on a server: its own
  // connection; PGlite serves one at a time).
  let beside = 0;
  if (database.kind === "server") {
    await new Promise(resolve => setTimeout(resolve, 300));
    const t0 = performance.now();
    await activities.log(sql, asMember(hugo), { company: p.id }, "call", "");
    beside = performance.now() - t0;
  }
  const report = await running;
  const took = performance.now() - started;
  assert.equal(report.created, 5000);
  assert.ok(took < 60_000, `the import took ${Math.round(took)} ms`);
  if (database.kind === "server") assert.ok(beside < 2000, `a call logged beside it took ${Math.round(beside)} ms`);
  const [row] = await sql<{ n: number; currencies: string[] }[]>`select count(*)::int as n, array_agg(distinct currency) as currencies from deals where import_id = ${report.importId}`;
  assert.deepEqual([row!.n, row!.currencies], [5000, ["USD"]], "imported deals are in the company's currency");
});

test("the board: a column shows its first 100 cards, its count and totals are all of its deals, per currency", async () => {
  const { sql } = database;
  const board = await deals.boardDeals(sql, asMember(lea));
  const totals = await deals.boardTotals(sql, asMember(lea));
  const qualified = (await sql<{ id: string }[]>`select id from stages where key = 'qualified'`)[0]!.id;
  assert.equal(board.filter(d => d.stageId === String(qualified)).length, deals.boardCap);
  const column = totals.find(t => t.stageId === String(qualified))!;
  assert.equal(column.count, 5000);
  assert.deepEqual(column.totals.map(t => t.currency), ["USD"]);
  const [sum] = await sql<{ v: string }[]>`select sum(value_cents)::text as v from deals where stage_id = ${qualified}`;
  assert.equal(column.totals[0]!.value, Number(sum!.v));
  // A deal added by hand: the company's currency too.
  const d = await deals.addDeal(sql, asMember(hugo), { title: "Dollars", value: 120000 });
  assert.equal(d.currency, "USD");
});

test("a deal moved to Won and to Lost at the same moment: one after the other, never both from its old stage", async () => {
  const { sql } = database;
  const [won, lost] = [(await sql<{ id: string }[]>`select id from stages where kind = 'won'`)[0]!.id, (await sql<{ id: string }[]>`select id from stages where kind = 'lost'`)[0]!.id];
  for (let i = 0; i < 6; i++) {
    const d = await deals.addDeal(sql, asMember(ines), { title: `Race ${i}` });
    const done = await Promise.allSettled([deals.moveDeal(sql, asMember(ines), d.id, won), deals.moveDeal(sql, asMember(ines), d.id, lost)]);
    assert.ok(done.every(r => r.status === "fulfilled"));
    const moves = done.map(r => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof deals.moveDeal>>>).value);
    // The second move starts where the first left the deal.
    const first = moves.find(m => m.from.kind === "open");
    const second = moves.find(m => m !== first);
    assert.ok(first && second, "one move from the open stage, the other from the closed one");
    assert.notEqual(second.from.kind, "open");
    const recorded = await sql<{ kind: string }[]>`select kind from activities where deal_id = ${d.id} and kind in ('won', 'lost') order by id`;
    assert.equal(recorded.length, 2);
    const [end] = await sql<{ kind: string }[]>`select s.kind from deals d join stages s on s.id = d.stage_id where d.id = ${d.id}`;
    assert.equal(end!.kind, second.to.kind, "it ends where the last move put it");
  }
});

test("positions stay short: 300 deals put first, then a stage written again, keep keys of a few characters", async () => {
  const { sql } = database;
  for (let i = 0; i < 300; i++) await deals.addDeal(sql, asMember(hugo), { title: `Top ${i}` });
  const lead = (await sql<{ id: string }[]>`select id from stages where key = 'lead'`)[0]!.id;
  const keys = await sql<{ position: string }[]>`select position from deals where stage_id = ${lead} order by position`;
  assert.ok(keys.every(k => isPosition(k.position)), "every key within 64 characters");
  assert.equal(new Set(keys.map(k => k.position)).size, keys.length);
});

test("amounts: a file's own decimal mark reads a lone 1,250; a silent file reads thousands", () => {
  assert.equal(decimalMark(["12,50", "1,250", "300"]), ",");
  assert.equal(decimalMark(["12.5", "1,250"]), ".");
  assert.equal(decimalMark(["1,250", "300"]), null);
  assert.equal(parseAmount("1,250", ","), 125);
  assert.equal(parseAmount("1,250", "."), 125000);
  assert.equal(parseAmount("1,250"), 125000);
  assert.throws(() => parseAmount("1,250", null), refused("amount_ambiguous"));
});

test("the formula guard: a formula is defused, a phone or a number is not; this tool's guard is taken off at import", () => {
  const csv = toCsv([["=1+2", "+33 6 12 34 56 78", "-5", "@SUM(A1)", "-hello"]]);
  assert.equal(csv, "﻿'=1+2,+33 6 12 34 56 78,-5,'@SUM(A1),'-hello\r\n");
  assert.equal(toCsv([["=1+2"]], true), "﻿=1+2\r\n", "the machine export keeps values exactly");
  assert.deepEqual(parseCsv(csv)[0], ["=1+2", "+33 6 12 34 56 78", "-5", "@SUM(A1)", "-hello"]);
});

test("who may download the lists: managers and sales by default; a manager chooses", async () => {
  const { sql } = database;
  assert.equal(await exportSetting(sql), "sales");
  assert.equal(mayExport(asMember(lea), "sales"), false);
  assert.equal(mayExport(asMember(hugo), "sales"), true);
  assert.equal(mayExport(asMember(hugo), "managers"), false);
  assert.equal(mayExport(asMember(camille), "managers"), true);
  await assert.rejects(checkExport(sql, asMember(lea)), refused("forbidden"));
  await assert.rejects(setExport(sql, asMember(hugo), "everyone"), refused("forbidden"));
  await setExport(sql, asMember(camille), "everyone");
  await checkExport(sql, asMember(lea));
  await setExport(sql, asMember(camille), "sales");
});
