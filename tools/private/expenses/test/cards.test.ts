import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError, type ErrorCode } from "../src/shared/app-error.ts";
import { guessCardMapping, readCardLines, readSigned, cardDateOrder } from "../src/shared/card-read.ts";
import { labelWords, match, merchantFromLabel, score, type Candidate, type CardPayment } from "../src/lib/card-match.ts";
import * as cards from "../src/lib/cards.ts";
import { parseCsv } from "../src/shared/csv-read.ts";
import * as expenses from "../src/lib/expenses.ts";
import { erase } from "../src/lib/lifecycle.ts";
import * as settings from "../src/lib/settings.ts";
import * as tell from "../src/lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, tom } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
const cat: Record<string, string> = {};
const yes = async () => true;
const team = new Set([camille.id, ines.id, hugo.id, lea.id, tom.id]);
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, network: {}, chest: { publicUrl: null } });
  for (const r of await database.sql<{ id: string; key: string }[]>`select id, key from categories`) cat[r.key] = String(r.id);
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  const { sql } = database;
  await sql`delete from card_statements`;
  await sql`delete from expenses`;
  await sql`delete from rates`;
  chest.notifications.length = 0;
});

const refuses = (code: ErrorCode) => (e: unknown) => e instanceof AppError && e.code === code;
const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

test("statements: the columns of a French bank export and of a Qonto-like export are guessed; payments, refunds and unreadable lines told apart", () => {
  // A French bank's card statement: semicolons, day-first dates, comma decimals, spending negative.
  const bankRows = parseCsv(fixture("card-bank-fr.csv"));
  const bank = guessCardMapping(bankRows[0]!);
  assert.deepEqual(bank, { date: 0, label: 2, amount: 3, currency: 4 });
  assert.equal(cardDateOrder(bankRows.slice(1), bank), "dmy");
  const read = readCardLines(bankRows.slice(1), bank, "dmy", "EUR");
  assert.deepEqual(read.lines.map(l => [l.date, l.amount, l.currency]), [["2026-09-02", 12900, "EUR"], ["2026-09-03", 8640, "EUR"], ["2026-09-12", 3850, "GBP"], ["2026-09-24", 1450, "EUR"], ["2026-09-24", 1450, "EUR"]]);
  assert.equal(read.refunds, 1);
  assert.deepEqual(read.unreadable, [4]);
  // Debit and credit columns: the debits are the payments.
  const split = parseCsv("Date opération;Libellé;Débit;Crédit\n05/09/2026;CB TOTAL;62,30;\n06/09/2026;AVOIR TOTAL;;10,00\n");
  const m = guessCardMapping(split[0]!);
  assert.deepEqual([m.date, m.label, m.debit, m.amount], [0, 1, 2, undefined]);
  const r2 = readCardLines(split.slice(1), m, "dmy", "EUR");
  assert.deepEqual(r2.lines.map(l => l.amount), [6230]);
  assert.equal(r2.refunds, 1);
  // Qonto's default columns (settlement date, counterparty name, total
  // amount), and a card holder column.
  const qonto = parseCsv(fixture("card-qonto.csv"));
  const q = guessCardMapping(qonto[0]!);
  assert.deepEqual([q.date, q.label, q.amount, q.currency, q.holder], [0, 1, 2, 3, 4]);
  const r3 = readCardLines(qonto.slice(1), q, cardDateOrder(qonto.slice(1), q), "EUR");
  assert.deepEqual(r3.lines.map(l => [l.date, l.label, l.amount, l.holder]), [["2026-09-08", "Big Mamma", 12400, "Tom Walker"], ["2026-09-22", "Air France", 18760, "Inès Moreau"]]);
  assert.equal(r3.refunds, 1);
  // A file of spending only (no negative amount): every amount is a payment.
  const only = readCardLines([["2026-09-01", "A", "12.00"], ["2026-09-02", "B", "3.50"]], { date: 0, label: 1, amount: 2 }, "ymd", "EUR");
  assert.deepEqual(only.lines.map(l => l.amount), [1200, 350]);
  // Signs as statements write them.
  assert.deepEqual(["-42,50", "−42.50", "42,50-", "(42.50)", "+42,50", "1 234,56 €", "", "abc"].map(v => readSigned(v, "EUR")), [-4250, -4250, -4250, -4250, 4250, 123456, null, null]);
});

test("matching: same person, amounts within tolerance, dates in the window, the label's words decide", () => {
  const p = (key: string, date: string, amount: number, label: string, currency = "EUR"): CardPayment => ({ key, member: hugo.id, date, label, amount, currency });
  const c = (id: string, date: string, amount: number, merchant: string, extra: Partial<Candidate> = {}): Candidate => ({ id, member: hugo.id, date, merchant, amount, currency: "EUR", base: amount, baseCurrency: "EUR", ...extra });
  // Exact amount, same day.
  assert.ok(score(p("a", "2026-09-10", 4250, "CB BISTROT DU COIN 10/09"), c("1", "2026-09-10", 4250, "Le Bistrot du Coin"))!.score >= 10);
  // Settled three days later: still found.
  assert.ok(score(p("a", "2026-09-13", 4250, "CB SNCF"), c("1", "2026-09-10", 4250, "Train")));
  // Out of the window, another person, too far in amount: never.
  assert.equal(score(p("a", "2026-09-20", 4250, "X"), c("1", "2026-09-10", 4250, "X")), null);
  assert.equal(score(p("a", "2026-09-10", 4250, "X"), c("1", "2026-09-10", 4250, "X", { member: lea.id })), null);
  assert.equal(score(p("a", "2026-09-10", 4250, "X"), c("1", "2026-09-10", 5000, "X")), null);
  // A tip (within 2 %): only with the shop's name or the same day and more.
  assert.equal(score(p("a", "2026-09-12", 4300, "CB RESTAURANT"), c("1", "2026-09-10", 4250, "Chez Paul")), null);
  assert.ok(score(p("a", "2026-09-10", 4300, "CB CHEZ PAUL"), c("1", "2026-09-10", 4250, "Chez Paul")));
  // An expense in pounds, against the card's euros (its amount converted).
  assert.ok(score(p("a", "2026-09-12", 4486, "HEATHROW EXPRESS"), c("1", "2026-09-12", 3850, "Heathrow Express", { currency: "GBP", base: 4480, baseCurrency: "EUR" })));
  // Two lunches of the same amount the same week: each goes to its own.
  const pairs = match(
    [p("zinc", "2026-09-18", 1450, "CB LE PETIT ZINC"), p("janou", "2026-09-18", 1450, "CB CHEZ JANOU")],
    [c("10", "2026-09-17", 1450, "Chez Janou"), c("11", "2026-09-17", 1450, "Le Petit Zinc")],
  );
  assert.deepEqual([...pairs].sort(), [["janou", "10"], ["zinc", "11"]]);
  // One expense, two identical payments: one match, the other waits.
  assert.equal(match([p("x", "2026-09-10", 900, "CB CAFE"), p("y", "2026-09-10", 900, "CB CAFE")], [c("1", "2026-09-10", 900, "Café")]).size, 1);
  // Words and the shop's name from a label.
  assert.deepEqual(labelWords("CB CARREFOUR CITY 24/09 CARTE X1234"), ["carrefour", "city"]);
  assert.equal(merchantFromLabel("CB CARREFOUR CITY 24/09 CARTE X1234"), "CARREFOUR CITY");
  assert.equal(merchantFromLabel("PAIEMENT PAR CARTE 4974XXXXXXXX1234 UBER *TRIP"), "UBER *TRIP");
  assert.equal(merchantFromLabel("CB"), "CB");
});

async function expense(member: typeof hugo, day: string, amount: string, merchant: string, extra: Partial<expenses.ExpenseInput> = {}): Promise<string> {
  return (await expenses.saveExpense(database.sql, asMember(member), null, { spentOn: day, amount, categoryId: cat["meals"], merchant, paidBy: "company", ...extra })).expense.id;
}

test("importing a statement: matched to their expense, or a draft asking its holder for the receipt; imported twice, recognised; undone while untouched", async () => {
  const { sql } = database;
  const hotel = await expense(hugo, "2026-09-02", "129", "Mercure Lyon Part-Dieu");
  const own = await expense(hugo, "2026-09-03", "86,40", "Brasserie Georges", { paidBy: "me" });
  const lines = [
    { date: "2026-09-04", label: "CB MERCURE LYON 02/09", amount: 12900, currency: "EUR", member: hugo.id },
    { date: "2026-09-03", label: "CB BRASSERIE GEORGES", amount: 8640, currency: "EUR", member: hugo.id },
    { date: "2026-09-24", label: "CB PRET A MANGER", amount: 1450, currency: "EUR", member: hugo.id },
    { date: "2026-09-24", label: "CB PRET A MANGER", amount: 1450, currency: "EUR", member: hugo.id },
    { date: "2026-09-12", label: "HEATHROW EXPRESS", amount: 3850, currency: "GBP", member: lea.id },
  ];
  // Only accountants; holders must be people of the tool; lines are checked.
  await assert.rejects(cards.importStatement(sql, asMember(ines), { lines }, team), refuses("forbidden"));
  await assert.rejects(cards.importStatement(sql, asMember(hugo), { lines }, team), refuses("forbidden"));
  await assert.rejects(cards.importStatement(sql, asMember(camille), { lines: [] }, team), refuses("statement_empty"));
  await assert.rejects(cards.importStatement(sql, asMember(camille), { lines: [{ ...lines[0], member: "mbr_nobodyaaaaaaaaaaaaaaaaaaaa" }] }, team), refuses("invalid"));
  await assert.rejects(cards.importStatement(sql, asMember(camille), { lines: [{ ...lines[0], date: "2026-02-30" }] }, team), refuses("date_invalid"));
  await assert.rejects(cards.importStatement(sql, asMember(camille), { lines: [{ ...lines[0], amount: 12.5 }] }, team), refuses("amount_invalid"));
  await assert.rejects(cards.importStatement(sql, asMember(camille), { lines: [{ ...lines[0], currency: "XXY" }] }, team), refuses("currency_invalid"));
  await sql`insert into rates (currency, rate_micro, updated_by) values ('GBP', 1165300, ${camille.id})`;
  const done = await cards.importStatement(sql, asMember(camille), { fileName: "releve-septembre.csv", lines }, team);
  assert.deepEqual([done.payments, done.matched, done.created, done.known], [5, 2, 3, 0]);
  assert.deepEqual(done.owners.sort(), [hugo.id, lea.id].sort());
  // Hugo's drafts: paid with the company card, the shop from the label,
  // "other" until he picks, no receipt yet; Léa's pounds converted at the
  // company's rate.
  const mine = await expenses.mine(sql, asMember(hugo));
  const made = mine.filter(e => e.fromCard);
  assert.equal(made.length, 2);
  assert.ok(made.every(e => e.status === "draft" && e.paidBy === "company" && e.merchant === "PRET A MANGER" && e.categoryId === cat["other"] && e.receipt === null && e.amount === 1450));
  const london = (await expenses.mine(sql, asMember(lea))).find(e => e.fromCard)!;
  assert.deepEqual([london.currency, london.amount, london.base, london.baseCurrency], ["GBP", 3850, 4486, "EUR"]);
  // The expense claimed with his own money is flagged for the approver.
  const warned = await expenses.warnings(sql, mine);
  assert.ok(warned.get(own)?.some(w => w.code === "card_own_money"));
  assert.equal(warned.get(hotel)?.some(w => w.code === "card_own_money") ?? false, false);
  // The holders asked in their bell, the tile counts what they owe.
  await tell.cardReceipts(sql, done.owners);
  assert.ok(chest.notifications.some(n => n.key === `card:${hugo.id}` && n.member === hugo.id));
  assert.deepEqual([...(await cards.receiptsOwed(sql))].sort(), [[hugo.id, 2], [lea.id, 1]].sort());
  assert.equal((await expenses.waitingCounts(sql, [hugo.id], [])).get(hugo.id), 2);
  // The accountant's page.
  const overview = await cards.cardOverview(sql, asMember(camille));
  assert.equal(overview.waiting.length, 3);
  assert.deepEqual(overview.ownMoney.map(l => l.expense), [own]);
  assert.deepEqual(overview.statements.map(s => [s.fileName, s.payments, s.matched, s.created, s.done]), [["releve-septembre.csv", 5, 2, 3, 0]]);
  await assert.rejects(cards.cardOverview(sql, asMember(ines)), refuses("forbidden"));
  // Checked: off the list; Undo brings it back.
  const ownLine = overview.ownMoney[0]!.id;
  await assert.rejects(cards.checkLine(sql, asMember(hugo), ownLine, true), refuses("forbidden"));
  await cards.checkLine(sql, asMember(camille), ownLine, true);
  assert.equal((await cards.cardOverview(sql, asMember(camille))).ownMoney.length, 0);
  await cards.checkLine(sql, asMember(camille), ownLine, false);
  assert.equal((await cards.cardOverview(sql, asMember(camille))).ownMoney.length, 1);
  // The same statement again (an overlapping export): nothing new.
  const again = await cards.importStatement(sql, asMember(camille), { lines }, team);
  assert.deepEqual([again.payments, again.matched, again.created, again.known], [0, 0, 0, 5]);
  // Undo of the first statement: its drafts go, the matched expenses stay.
  await cards.undoStatement(sql, asMember(camille), again.statement);
  const owners = await cards.undoStatement(sql, asMember(camille), done.statement);
  assert.deepEqual(owners.sort(), [hugo.id, lea.id].sort());
  assert.equal((await expenses.mine(sql, asMember(hugo))).length, 2);
  assert.equal((await sql`select 1 from card_lines`).length, 0);
  await tell.settleCardReceipts(sql, owners);
  assert.equal(chest.notifications.some(n => n.key === `card:${hugo.id}`), false);
  await assert.rejects(cards.undoStatement(sql, asMember(camille), done.statement), refuses("not_found"));
  await assert.rejects(cards.undoStatement(sql, asMember(ines), "1"), refuses("forbidden"));
});

test("card statement words: a draft gets the category its label suggests; the accountant edits the list", async () => {
  const { sql } = database;
  const rules = await settings.listCardRules(sql, asMember(camille));
  assert.equal(rules.find(r => r.words === "UBER")?.categoryId, cat["travel"]);
  assert.equal(rules.find(r => r.words === "UBER EATS")?.categoryId, cat["meals"]);
  await assert.rejects(settings.listCardRules(sql, asMember(ines)), refuses("forbidden"));
  const lines = [
    { date: "2026-09-10", label: "UBER *TRIP", amount: 2340, currency: "EUR", member: hugo.id },
    { date: "2026-09-11", label: "UBER *EATS PARIS", amount: 1890, currency: "EUR", member: hugo.id },
    { date: "2026-09-12", label: "CB TOTAL ST OUEN", amount: 6120, currency: "EUR", member: hugo.id },
    { date: "2026-09-13", label: "MONOPRIX PARIS 11", amount: 1275, currency: "EUR", member: hugo.id },
  ];
  await cards.importStatement(sql, asMember(camille), { lines }, team);
  const byAmount = new Map((await expenses.mine(sql, asMember(hugo))).map(e => [e.amount, e.categoryId]));
  assert.deepEqual([byAmount.get(2340), byAmount.get(1890), byAmount.get(6120), byAmount.get(1275)], [cat["travel"], cat["meals"], cat["fuel"], cat["other"]]);
  // A word of the company's own: MONOPRIX is office supplies here.
  await assert.rejects(settings.addCardRule(sql, asMember(hugo), "Monoprix", cat["supplies"]), refuses("forbidden"));
  await assert.rejects(settings.addCardRule(sql, asMember(camille), "*", cat["supplies"]), refuses("empty"));
  await assert.rejects(settings.addCardRule(sql, asMember(camille), "Monoprix", cat["mileage"]), refuses("category_invalid"));
  const added = await settings.addCardRule(sql, asMember(camille), " monoprix ", cat["supplies"]);
  assert.equal(added.words, "MONOPRIX");
  // The same words again: another category, still one rule.
  const again = await settings.addCardRule(sql, asMember(camille), "MONOPRIX", cat["meals"]);
  assert.equal(again.id, added.id);
  await cards.importStatement(sql, asMember(camille), { lines: [{ ...lines[3]!, date: "2026-09-14", amount: 990 }] }, team);
  assert.equal((await expenses.mine(sql, asMember(hugo))).find(e => e.amount === 990)?.categoryId, cat["meals"]);
  await assert.rejects(settings.removeCardRule(sql, asMember(ines), added.id), refuses("forbidden"));
  await settings.removeCardRule(sql, asMember(camille), added.id);
  await assert.rejects(settings.removeCardRule(sql, asMember(camille), added.id), refuses("not_found"));
});

test("a card payment's receipt: the holder adds it and sends; touched drafts cannot be undone away; a deleted draft is for the accountant to check", async () => {
  const { sql } = database;
  const done = await cards.importStatement(sql, asMember(camille), { lines: [
    { date: "2026-09-24", label: "CB PRET A MANGER", amount: 1450, currency: "EUR", member: hugo.id },
    { date: "2026-09-25", label: "CB MONOPRIX", amount: 2210, currency: "EUR", member: hugo.id },
  ] }, team);
  const [pret, mono] = (await expenses.mine(sql, asMember(hugo))).sort((a, b) => a.spentOn.localeCompare(b.spentOn));
  // Hugo picks the category and says what it was: the draft is his.
  await expenses.saveExpense(sql, asMember(hugo), pret!.id, { spentOn: "2026-09-24", amount: "14,50", categoryId: cat["meals"], merchant: "Pret A Manger", paidBy: "company", alone: true });
  await assert.rejects(cards.undoStatement(sql, asMember(camille), done.statement), refuses("statement_touched"));
  // Deleted: personal spending? The accountant sees it to check.
  await expenses.remove(sql, asMember(hugo), mono!.id);
  const overview = await cards.cardOverview(sql, asMember(camille));
  assert.deepEqual(overview.deleted.map(l => l.label), ["CB MONOPRIX"]);
  assert.deepEqual(overview.waiting.map(l => l.expense), [pret!.id]);
  // Sent without its receipt: out of "waiting", and the approver sees "No receipt".
  await expenses.submit(sql, asMember(hugo), [pret!.id], yes);
  assert.equal((await cards.cardOverview(sql, asMember(camille))).waiting.length, 0);
  assert.equal((await cards.receiptsOwed(sql)).size, 0);
  // Erasure keeps the company's card records, without the person.
  await erase(sql, hugo.id);
  assert.deepEqual((await sql<{ member_id: string }[]>`select distinct member_id from card_lines`).map(r => r.member_id), ["erased"]);
  assert.equal((await cards.cardOverview(sql, asMember(camille))).deleted.length, 0);
});
