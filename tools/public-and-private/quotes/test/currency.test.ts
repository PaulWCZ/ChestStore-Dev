import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/shared/app-error.ts";
import { company as readCompany, updateCompany } from "../src/lib/company.ts";
import { desk } from "../src/lib/desk.ts";
import { createDocument, decideQuote, finalise, getDocument, invoiceFromQuote, saveDraft, sendQuote, startCreditNote } from "../src/lib/documents.ts";
import { addItem, updateItem } from "../src/lib/items.ts";
import { revenue } from "../src/lib/revenue.ts";
import { renderPdf } from "../src/pdf/document.ts";
import { einvoiceXml } from "../src/lib/einvoice.ts";
import { totalsBy } from "../src/shared/money.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, defaults, line, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, sofia } from "./support/members.ts";

// SDK 0.7.0 has no Chest currency (the owner's decision: a company may work
// in several). Quotes keeps its own default currency (Settings), every
// document and catalogue item keeps its own code, and no total adds two
// currencies.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications"], chest: { organization: "Atelier Martin", language: "fr" } });
  database = await testDatabase();
  await company(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("the default currency is the tool's own setting: EUR until an administrator changes it; a known ISO 4217 code only", async () => {
  const { sql } = database;
  assert.equal((await readCompany(sql)).currency, "EUR");
  await assert.rejects(updateCompany(sql, asMember(camille), { currency: "EURO" }), refused("currency_invalid"));
  await assert.rejects(updateCompany(sql, asMember(camille), { currency: "XYZ" }), refused("currency_invalid"));
  await assert.rejects(updateCompany(sql, asMember(sofia), { currency: "GBP" }), refused("forbidden"));
  const c = await updateCompany(sql, asMember(camille), { currency: "GBP" });
  assert.equal(c.currency, "GBP");
  // The share capital keeps the currency it was written in.
  assert.equal(c.capital, 1000000);
  assert.equal(c.capitalCurrency, "EUR");
  // A new quote starts in it; the default changes nothing already made.
  const gbp = await createDocument(sql, asMember(ines), "quote", (await client(sql, { name: "Pub Ltd" })).id, defaults);
  assert.equal(gbp.currency, "GBP");
  await updateCompany(sql, asMember(camille), { currency: "EUR" });
  assert.equal((await getDocument(sql, asMember(ines), gbp.id, today)).currency, "GBP");
});

test("a catalogue item keeps its currency: made in the default of the day, its price read and changed in it", async () => {
  const { sql } = database;
  const eur = await addItem(sql, asMember(hugo), { name: "Journée", unitPrice: "650,00", vatRate: 2000 }, "EUR");
  const jpy = await addItem(sql, asMember(hugo), { name: "Atelier Tokyo", unitPrice: "120000", vatRate: 0 }, "JPY");
  assert.deepEqual([eur.currency, eur.unitPrice], ["EUR", 65000]);
  assert.deepEqual([jpy.currency, jpy.unitPrice], ["JPY", 120000], "no decimals in yen");
  const cheaper = await updateItem(sql, asMember(hugo), jpy.id, { unitPrice: "100000" });
  assert.deepEqual([cheaper.currency, cheaper.unitPrice], ["JPY", 100000]);
});

test("a draft quote or invoice takes another currency with its lines; an invoice of a quote and a credit note keep their source's", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Swiss SA" });
  const q = await createDocument(sql, asMember(ines), "quote", c.id, defaults);
  assert.equal(q.currency, "EUR");
  await assert.rejects(saveDraft(sql, asMember(ines), q.id, { currency: "CHF" }), refused("invalid"), "never without its lines");
  await assert.rejects(saveDraft(sql, asMember(ines), q.id, { currency: "ZZZ", lines: [] }), refused("currency_invalid"));
  const chf = await saveDraft(sql, asMember(ines), q.id, { currency: "CHF", lines: [line("Audit", 1000, 150000)] });
  assert.deepEqual([chf.currency, chf.gross], ["CHF", 180000]);
  // Sent and accepted, it becomes an invoice in francs, which keeps them.
  await sendQuote(sql, asMember(ines), q.id, null, today);
  await decideQuote(sql, asMember(ines), q.id, "accepted");
  const inv = await invoiceFromQuote(sql, asMember(sofia), q.id, null);
  assert.equal(inv.currency, "CHF");
  await assert.rejects(saveDraft(sql, asMember(sofia), inv.id, { currency: "EUR", lines: [line("Audit", 1000, 150000)] }), refused("invalid"));
  // Outside the euro an invoice states its rate; then it is issued and credited, in francs.
  await saveDraft(sql, asMember(sofia), inv.id, { eurRate: 940000 });
  await finalise(sql, asMember(sofia), inv.id, today);
  const credit = await startCreditNote(sql, asMember(sofia), inv.id);
  assert.equal(credit.currency, "CHF");
  await assert.rejects(saveDraft(sql, asMember(sofia), credit.id, { currency: "EUR", lines: [] }), refused("invalid"));
  // An invoice written here: back to the euro, its rate dropped.
  const own = await createDocument(sql, asMember(sofia), "invoice", c.id, defaults);
  await saveDraft(sql, asMember(sofia), own.id, { currency: "USD", lines: [line("Licence", 1000, 10000)] });
  await saveDraft(sql, asMember(sofia), own.id, { eurRate: 1_082_300 });
  const back = await saveDraft(sql, asMember(sofia), own.id, { currency: "EUR", lines: [line("Licence", 1000, 10000)] });
  assert.deepEqual([back.currency, back.eurRate], ["EUR", null]);
});

test("totals never add two currencies: the desk gives one per currency, the default first; revenue counts the default, the others apart", async () => {
  const { sql } = database;
  assert.deepEqual(totalsBy([{ c: "USD", a: 1 }, { c: "EUR", a: 2 }, { c: "USD", a: 3 }, { c: "CHF", a: 4 }], x => x.c, x => x.a, "EUR"), [
    { currency: "EUR", amount: 2 }, { currency: "CHF", amount: 4 }, { currency: "USD", amount: 4 },
  ]);
  const c = await client(sql, { name: "Global Corp" });
  const usd = await createDocument(sql, asMember(sofia), "invoice", c.id, defaults);
  await saveDraft(sql, asMember(sofia), usd.id, { currency: "USD", lines: [line("Licence", 1000, 50000)] });
  await saveDraft(sql, asMember(sofia), usd.id, { eurRate: 1_082_300 });
  await finalise(sql, asMember(sofia), usd.id, today);
  const eur = await createDocument(sql, asMember(sofia), "invoice", c.id, defaults);
  await saveDraft(sql, asMember(sofia), eur.id, { lines: [line("Conseil", 1000, 20000)] });
  await finalise(sql, asMember(sofia), eur.id, today);
  const d = await desk(sql, asMember(sofia), today, "EUR");
  const codes = d.toCollect.due.map(x => x.currency);
  assert.equal(codes[0], "EUR", "the default first");
  assert.ok(codes.includes("USD") && new Set(codes).size === codes.length, "one total per currency");
  assert.equal(d.toCollect.due.find(x => x.currency === "USD")!.amount, 60000, "the dollars, never added to the euros");
  const sales = (await revenue(sql, asMember(camille), today, "EUR"))!;
  assert.ok(sales.yearToDate >= 20000);
  assert.deepEqual(sales.others.find(o => o.currency === "USD"), { currency: "USD", yearToDate: 50000 });
});

test("the share capital is printed in its own currency, whatever the document's", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Dollar Inc" });
  const d = await createDocument(sql, asMember(sofia), "invoice", c.id, defaults);
  await saveDraft(sql, asMember(sofia), d.id, { currency: "USD", lines: [line("Licence", 1000, 10000)] });
  await saveDraft(sql, asMember(sofia), d.id, { eurRate: 1_082_300 });
  await finalise(sql, asMember(sofia), d.id, today);
  const full = await getDocument(sql, asMember(sofia), d.id, today);
  assert.equal(full.seller?.capitalCurrency, "EUR");
  assert.ok(renderPdf({ doc: full, lines: full.lines, seller: full.seller!, buyer: full.buyer, reference: null, logo: null, today, created: new Date() }).byteLength > 1000);
  // The Factur-X's legal mention: in euros, the invoice in dollars.
  const xml = einvoiceXml({ doc: full, lines: full.lines, seller: full.seller!, buyer: full.buyer!, reference: null });
  assert.match(xml, /SARL au capital de 10\u202f000,00\u00a0€/u);
  assert.match(xml, /<ram:InvoiceCurrencyCode>USD<\/ram:InvoiceCurrencyCode>/u);
});
