import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, withMember, type FakeChest } from "@argentic/chest-sdk/testing";
import { GET as fileRoute } from "../app/chest/pay/files/[id]/route.ts";
import { AppError, type ErrorCode } from "../lib/app-error.ts";
import * as bank from "../lib/bank.ts";
import * as expenses from "../lib/expenses.ts";
import { checkBic, checkIban, groupIban, mod97 } from "../lib/iban.ts";
import { erase } from "../lib/lifecycle.ts";
import { today } from "../lib/model.ts";
import * as payments from "../lib/payments.ts";
import { seal, sealing, unseal } from "../lib/seal.ts";
import { pain001, sepaAmount, sepaText } from "../lib/sepa.ts";
import * as settings from "../lib/settings.ts";
import * as tell from "../lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, tom } from "./support/members.ts";

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
  const { sql } = database;
  await sql`update expenses set payment_run_id = null`;
  await sql`delete from payment_runs`;
  await sql`delete from expenses`;
  await sql`delete from bank_accounts`;
  await sql`delete from settings`;
  await sql`delete from rates`;
  chest.notifications.length = 0;
  delete process.env["BANK_DETAILS_KEY"];
});

const refuses = (code: ErrorCode) => (e: unknown) => e instanceof AppError && e.code === code;

// A valid IBAN of any country, from its bank part: the check digits are
// 98 − (bank part + country + "00") mod 97.
function ibanOf(country: string, bban: string): string {
  const digits = (bban + country + "00").replace(/[A-Z]/gu, c => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return country + String(98 - rest).padStart(2, "0") + bban;
}

// Published examples (their check digits are right).
const hugoIban = "FR76 3000 6000 0112 3456 7890 189";
const leaIban = "DE89 3704 0044 0532 0130 00";
const companyIban = "FR14 2004 1010 0505 0001 3M02 606";

test("IBAN: the country's length and the mod-97 check digits; BIC: 8 or 11 characters", () => {
  assert.deepEqual(checkIban(hugoIban), { ok: true, iban: "FR7630006000011234567890189", country: "FR", sepa: true });
  assert.deepEqual(checkIban("de89370400440532013000"), { ok: true, iban: "DE89370400440532013000", country: "DE", sepa: true });
  assert.equal(checkIban("GB82 WEST 1234 5698 7654 32").ok, true);
  assert.equal(checkIban("BE68 5390 0754 7034").ok, true);
  assert.equal(checkIban(companyIban).ok, true);
  // One character changed, two swapped: the check digits catch it.
  assert.deepEqual(checkIban("FR76 3000 6000 0112 3456 7890 188"), { ok: false, reason: "checksum" });
  assert.deepEqual(checkIban("FR76 3000 6000 0112 3456 7809 189"), { ok: false, reason: "checksum" });
  assert.deepEqual(checkIban("FR76 3000 6000 0112 3456 7890 18"), { ok: false, reason: "length" });
  assert.deepEqual(checkIban("76FR30006000011234567890189"), { ok: false, reason: "format" });
  assert.deepEqual(checkIban(42), { ok: false, reason: "format" });
  // Outside the SEPA zone: a real IBAN, not for the transfer file.
  const brazil = ibanOf("BR", "0036030510000000067867491C1");
  assert.equal(mod97(brazil), true);
  assert.deepEqual(checkIban(brazil), { ok: true, iban: brazil, country: "BR", sepa: false });
  assert.equal(checkBic("bnpa fr pp"), "BNPAFRPP");
  assert.equal(checkBic("BDFEFRPPCCT"), "BDFEFRPPCCT");
  assert.equal(checkBic("BNPAFR"), null);
  assert.equal(checkBic("BNPAFRPP1"), null);
  assert.equal(groupIban("FR7630006000011234567890189"), "FR76 3000 6000 0112 3456 7890 189");
});

test("sealing: AES-256-GCM with the Chest variable, bound to its owner; as typed without it", () => {
  assert.equal(sealing(), false);
  assert.equal(seal("FR76", "bank:x"), "v0.FR76");
  assert.equal(unseal("v0.FR76", "bank:x"), "FR76");
  process.env["BANK_DETAILS_KEY"] = Buffer.alloc(32, 7).toString("base64");
  assert.equal(sealing(), true);
  const sealed = seal("FR7630006000011234567890189", "bank:a");
  assert.match(sealed, /^v1\./u);
  assert.equal(sealed.includes("3000"), false);
  assert.notEqual(seal("FR7630006000011234567890189", "bank:a"), sealed); // a new nonce each time
  assert.equal(unseal(sealed, "bank:a"), "FR7630006000011234567890189");
  assert.throws(() => unseal(sealed, "bank:b"), refuses("bank_sealed")); // moved to another row
  process.env["BANK_DETAILS_KEY"] = Buffer.alloc(32, 8).toString("base64");
  assert.throws(() => unseal(sealed, "bank:a"), refuses("bank_sealed")); // another key
  delete process.env["BANK_DETAILS_KEY"];
  assert.throws(() => unseal(sealed, "bank:a"), refuses("bank_sealed"));
  process.env["BANK_DETAILS_KEY"] = "short";
  assert.throws(() => seal("x", "y"), /32 bytes/u);
});

test("bank details: one's own, and every one's for the accountants; never an approver's to see; always masked", async () => {
  const { sql } = database;
  process.env["BANK_DETAILS_KEY"] = Buffer.alloc(32, 3).toString("base64");
  const saved = await bank.setBankDetails(sql, asMember(hugo), hugo.id, { iban: hugoIban, bic: "bdfefrpp" });
  assert.deepEqual({ masked: saved.masked, country: saved.country, sepa: saved.sepa, bic: saved.bic, holder: saved.holder }, { masked: "FR•• •••• 0189", country: "FR", sepa: true, bic: "BDFEFRPP", holder: "" });
  const [row] = await sql`select iban from bank_accounts where owner = ${hugo.id}`;
  assert.equal(String(row!["iban"]).includes("0189"), false, "sealed at rest");
  assert.equal((await bank.bankDetails(sql, asMember(hugo), hugo.id))?.masked, "FR•• •••• 0189");
  assert.equal((await bank.bankDetails(sql, asMember(camille), hugo.id))?.masked, "FR•• •••• 0189");
  await assert.rejects(bank.bankDetails(sql, asMember(ines), hugo.id), refuses("forbidden"));
  await assert.rejects(bank.bankDetails(sql, asMember(lea), hugo.id), refuses("forbidden"));
  await assert.rejects(bank.bankViews(sql, asMember(ines), [hugo.id]), refuses("forbidden"));
  await assert.rejects(bank.setBankDetails(sql, asMember(lea), hugo.id, { iban: leaIban }), refuses("forbidden"));
  await assert.rejects(bank.setBankDetails(sql, asMember(hugo), "company", { iban: companyIban }), refuses("forbidden"));
  await assert.rejects(bank.setBankDetails(sql, asMember(hugo), hugo.id, { iban: "FR76 3000 6000 0112 3456 7890 188" }), refuses("iban_checksum"));
  await assert.rejects(bank.setBankDetails(sql, asMember(hugo), hugo.id, { iban: "12345" }), refuses("iban_invalid"));
  await assert.rejects(bank.setBankDetails(sql, asMember(hugo), hugo.id, { iban: hugoIban, bic: "XX" }), refuses("bic_invalid"));
  await assert.rejects(bank.setBankDetails(sql, asMember(hugo), "mbr_nope", { iban: hugoIban }), refuses("invalid"));
  // The accountant enters Léa's (from payroll): Léa hears of it.
  await bank.setBankDetails(sql, asMember(camille), lea.id, { iban: leaIban, holder: "Léa et Marc Dubois" });
  await tell.bankChanged(asMember(camille), lea.id, "3000");
  assert.deepEqual(chest.notifications.map(n => [n.member, n.title.replace(/\s/gu, " ")]), [[lea.id, "Camille Martin a modifié vos coordonnées bancaires (compte finissant par 3000)"]]);
  // A person changing their own: the accountants hear of it.
  chest.notifications.length = 0;
  await tell.bankChanged(asMember(hugo), hugo.id, "0189");
  assert.deepEqual(chest.notifications.map(n => n.member), [camille.id]);
  await bank.removeBankDetails(sql, asMember(hugo), hugo.id);
  assert.equal(await bank.bankDetails(sql, asMember(hugo), hugo.id), null);
});

async function approved(member: typeof hugo, amount: string, extra: Partial<expenses.ExpenseInput> = {}): Promise<string> {
  const { sql } = database;
  const e = (await expenses.saveExpense(sql, asMember(member), null, { spentOn: "2026-09-10", amount, categoryId: cat["travel"], merchant: "SNCF " + amount, ...extra })).expense;
  await expenses.submit(sql, asMember(member), [e.id], yes);
  await expenses.decide(sql, asMember(camille), [e.id], "approve");
  return e.id;
}

async function company(): Promise<void> {
  const { sql } = database;
  await settings.updateSettings(sql, asMember(camille), { payer: "Atelier Roux & Fils" });
  await bank.setBankDetails(sql, asMember(camille), "company", { iban: companyIban });
}

test("the transfer file: one transfer per person with bank details, everything paid on the day the bank pays", async () => {
  const { sql } = database;
  assert.equal(await payments.readiness(sql, asMember(camille)), "no_company_bank");
  await assert.rejects(payments.readiness(sql, asMember(ines)), refuses("forbidden"));
  await company();
  assert.equal(await payments.readiness(sql, asMember(camille)), "ready");
  await bank.setBankDetails(sql, asMember(hugo), hugo.id, { iban: hugoIban, bic: "BDFEFRPP" });
  await bank.setBankDetails(sql, asMember(tom), tom.id, { iban: ibanOf("BR", "0036030510000000067867491C1") });
  const h1 = await approved(hugo, "42,50");
  const h2 = await approved(hugo, "18,20");
  const london = await approved(hugo, "30", { currency: "GBP" }); // no rate: not in the file
  const l1 = await approved(lea, "9,90"); // no bank details: skipped
  const t1 = await approved(tom, "12"); // outside SEPA: skipped
  const card = await approved(hugo, "99", { paidBy: "company" }); // nothing to pay back
  const execution = today();
  await assert.rejects(payments.createRun(sql, asMember(ines), { executionDate: execution }), refuses("forbidden"));
  await assert.rejects(payments.createRun(sql, asMember(camille), { executionDate: "2020-01-01" }), refuses("date_invalid"));
  await assert.rejects(payments.createRun(sql, asMember(camille), { executionDate: "2099-01-01" }), refuses("date_invalid"));
  await assert.rejects(payments.createRun(sql, asMember(camille), { executionDate: execution, members: "all" }), refuses("invalid"));
  const made = await payments.createRun(sql, asMember(camille), { executionDate: execution });
  assert.equal(made.run.count, 1);
  assert.equal(made.run.total, 6070);
  assert.deepEqual(made.skipped.sort(), [lea.id, tom.id].sort());
  assert.deepEqual(made.decisions.map(d => [d.owner, d.expenses.map(e => e.id)]), [[hugo.id, [h1, h2]]]);
  for (const id of [h1, h2]) {
    const e = (await expenses.expense(sql, asMember(hugo), id)).expense;
    assert.deepEqual([e.status, e.paidOn], ["paid", execution]);
  }
  for (const id of [london, l1, t1]) assert.equal((await expenses.expense(sql, asMember(camille), id)).expense.status, "approved");
  assert.equal((await expenses.expense(sql, asMember(camille), card)).expense.status, "approved");
  // The file, as the bank reads it.
  const { xml, fileName } = await payments.runFile(sql, asMember(camille), made.run.id);
  assert.equal(fileName, made.run.messageId + ".xml");
  assert.match(made.run.messageId, /^EXP-\d{8}-[0-9A-F]{8}$/u);
  assert.match(xml, /<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain\.001\.001\.03"/u);
  assert.match(xml, new RegExp(`<MsgId>${made.run.messageId}</MsgId>`, "u"));
  assert.equal((xml.match(/<NbOfTxs>1<\/NbOfTxs>/gu) ?? []).length, 2);
  assert.equal((xml.match(/<CtrlSum>60\.70<\/CtrlSum>/gu) ?? []).length, 2);
  assert.match(xml, /<Dbtr><Nm>Atelier Roux \+ Fils<\/Nm><\/Dbtr>/u);
  assert.match(xml, /<DbtrAcct><Id><IBAN>FR1420041010050500013M02606<\/IBAN><\/Id><\/DbtrAcct>/u);
  assert.match(xml, /<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED<\/Id><\/Othr><\/FinInstnId><\/DbtrAgt>/u);
  assert.match(xml, /<SvcLvl><Cd>SEPA<\/Cd><\/SvcLvl>/u);
  assert.match(xml, /<ChrgBr>SLEV<\/ChrgBr>/u);
  assert.match(xml, new RegExp(`<ReqdExctnDt>${execution}</ReqdExctnDt>`, "u"));
  assert.match(xml, /<InstdAmt Ccy="EUR">60\.70<\/InstdAmt>/u);
  assert.match(xml, /<CdtrAgt><FinInstnId><BIC>BDFEFRPP<\/BIC><\/FinInstnId><\/CdtrAgt>/u);
  assert.match(xml, /<Cdtr><Nm>Hugo Bernard<\/Nm><\/Cdtr>/u);
  assert.match(xml, /<IBAN>FR7630006000011234567890189<\/IBAN>/u);
  assert.match(xml, new RegExp(`<Ustrd>Expenses E${h1} E${h2}</Ustrd>`, "u")); // Hugo reads English
  assert.match(xml, new RegExp(`<EndToEndId>${made.run.messageId}-1</EndToEndId>`, "u"));
  // Downloaded again: the very same file.
  assert.equal((await payments.runFile(sql, asMember(camille), made.run.id)).xml, xml);
  await assert.rejects(payments.runFile(sql, asMember(ines), made.run.id), refuses("forbidden"));
  // Checked against the ISO 20022 schema when it is at hand (not shipped:
  // SEPA_XSD=<path to pain.001.001.03.xsd>, and xmllint).
  const xsd = process.env["SEPA_XSD"];
  if (xsd && existsSync(xsd)) {
    const file = join(mkdtempSync(join(tmpdir(), "sepa-")), "file.xml");
    writeFileSync(file, xml);
    execFileSync("xmllint", ["--noout", "--schema", xsd, file], { stdio: "pipe" });
  }
  // A line of a batch is not undone alone: the batch is cancelled.
  await assert.rejects(expenses.unmarkPaid(sql, asMember(camille), [h1]), refuses("invalid"));
  assert.deepEqual(await payments.cancelRun(sql, asMember(camille), made.run.id), [hugo.id]);
  assert.equal((await expenses.expense(sql, asMember(hugo), h1)).expense.status, "approved");
  await assert.rejects(payments.cancelRun(sql, asMember(camille), made.run.id), refuses("not_found"));
  await assert.rejects(payments.runFile(sql, asMember(camille), made.run.id), refuses("not_found"));
  assert.deepEqual((await payments.runs(sql, asMember(camille))).map(r => r.cancelled), [true]);
  // Only Léa chosen, still without bank details.
  await assert.rejects(payments.createRun(sql, asMember(camille), { executionDate: execution, members: [lea.id] }), refuses("no_bank_details"));
});

test("the file's route: accountants only, the XML as a download", async () => {
  const { sql } = database;
  await company();
  await bank.setBankDetails(sql, asMember(hugo), hugo.id, { iban: hugoIban });
  await approved(hugo, "10");
  const made = await payments.createRun(sql, asMember(camille), { executionDate: today() });
  const get = (who: typeof camille | null) => fileRoute(who ? withMember(new Request("http://tool.test/chest/pay/files/" + made.run.id), who) : new Request("http://tool.test/x"), { params: Promise.resolve({ id: made.run.id }) });
  const ok = await get(camille);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("Content-Type"), "application/xml; charset=utf-8");
  assert.match(ok.headers.get("Content-Disposition") ?? "", /attachment; filename="EXP-\d{8}-[0-9A-F]{8}\.xml"/u);
  assert.match(await ok.text(), /<InstdAmt Ccy="EUR">10\.00<\/InstdAmt>/u);
  assert.equal((await get(ines)).status, 403);
  assert.equal((await get(null)).status, 401);
});

test("transfer files are in euros; an erased person's account leaves the batches", async () => {
  const { sql } = database;
  await company();
  await bank.setBankDetails(sql, asMember(hugo), hugo.id, { iban: hugoIban });
  await approved(hugo, "10");
  const made = await payments.createRun(sql, asMember(camille), { executionDate: today() });
  await erase(sql, hugo.id);
  assert.equal((await sql`select 1 from bank_accounts where owner = ${hugo.id}`).length, 0);
  const [run] = await sql`select file::text as file from payment_runs where id = ${made.run.id}`;
  assert.equal(String(run!["file"]).includes(hugo.id), false);
  await assert.rejects(payments.runFile(sql, asMember(camille), made.run.id), refuses("file_gone"));
  await settings.updateSettings(sql, asMember(camille), { currency: "CHF" });
  assert.equal(await payments.readiness(sql, asMember(camille)), "sepa_currency");
  await assert.rejects(payments.createRun(sql, asMember(camille), { executionDate: today() }), refuses("sepa_currency"));
});

test("SEPA texts: basic Latin only, accents taken off, 70 or 140 characters; amounts with a dot", () => {
  assert.equal(sepaText("Léa Dubois-Øster & Fils — «frais»", 70), "Lea Dubois-Oster + Fils frais");
  assert.equal(sepaText("//Zoë//Straße/", 70), "Zoe/Strasse");
  assert.equal(sepaText("x".repeat(200), 140).length, 140);
  assert.equal(sepaAmount(4250), "42.50");
  assert.equal(sepaAmount(5), "0.05");
  assert.throws(() => sepaAmount(0), RangeError);
  assert.throws(() => pain001({ messageId: "X", createdAt: new Date(), payer: { name: "A", iban: "FR76", bic: null }, executionDate: "2026-09-30", transfers: [] }), RangeError);
});

test("rates: typed on the expense, or the company's; totals in the company's currency", async () => {
  const { sql } = database;
  const typed = (await expenses.saveExpense(sql, asMember(hugo), null, { spentOn: "2026-09-10", amount: "12,50", currency: "GBP", rate: "1,1653", categoryId: cat["meals"] })).expense;
  assert.deepEqual([typed.rate, typed.rateSource, typed.base, typed.baseCurrency], [1_165_300, "typed", 1457, "EUR"]);
  const none = (await expenses.saveExpense(sql, asMember(hugo), null, { spentOn: "2026-09-10", amount: "4000", currency: "JPY", categoryId: cat["meals"] })).expense;
  assert.equal(none.base, null);
  assert.equal((await expenses.warnings(sql, [none])).get(none.id)?.some(w => w.code === "no_rate"), true);
  await assert.rejects(expenses.saveExpense(sql, asMember(hugo), null, { spentOn: "2026-09-10", amount: "5", currency: "GBP", rate: "abc", categoryId: cat["meals"] }), refuses("rate_invalid"));
  // The company's rate: the expenses without their own take it.
  await assert.rejects(settings.setRate(sql, asMember(ines), "JPY", "0,006123"), refuses("forbidden"));
  await assert.rejects(settings.setRate(sql, asMember(camille), "EUR", "1"), refuses("currency_invalid"));
  await assert.rejects(settings.setRate(sql, asMember(camille), "JPY", "-1"), refuses("rate_invalid"));
  assert.equal(await settings.setRate(sql, asMember(camille), "JPY", "0,006123"), 1);
  const now = (await expenses.expense(sql, asMember(hugo), none.id)).expense;
  assert.deepEqual([now.rate, now.rateSource, now.base], [6123, "company", 2449]);
  const own = (await expenses.expense(sql, asMember(hugo), typed.id)).expense;
  assert.equal(own.rateSource, "typed"); // its own rate stays
  assert.deepEqual(expenses.totals([own, now, { amount: 700, currency: "EUR", base: 700, baseCurrency: "EUR" }]), [{ currency: "EUR", amount: 1457 + 2449 + 700 }]);
  assert.deepEqual((await settings.rates(sql)).map(r => [r.currency, r.rate]), [["JPY", 6123]]);
  // Removed: the expense that followed it has no rate again.
  await settings.setRate(sql, asMember(camille), "JPY", "");
  assert.equal((await expenses.expense(sql, asMember(hugo), none.id)).expense.base, null);
});
