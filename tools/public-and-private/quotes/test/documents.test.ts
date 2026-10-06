import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/shared/app-error.ts";
import {
  createDocument, decideQuote, duplicate, finalise, getDocument, invoiceFromQuote, listDocuments, markReady, receivables, removeDraft, restoreDraft,
  saveDraft, sendQuote, startCreditNote, stateOf,
} from "../src/lib/documents.ts";
import { addPayment } from "../src/lib/payments.ts";
import { archiveClient } from "../src/lib/clients.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, defaults, draft, line, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, sofia } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications"] });
  database = await testDatabase();
  await company(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("a quote: drafted by sales, numbered when sent, accepted by the client", async () => {
  const { sql } = database;
  const c = await client(sql);
  const d = await createDocument(sql, asMember(ines), "quote", c.id, defaults);
  assert.equal(d.status, "draft");
  assert.equal(d.number, null);
  assert.equal(d.language, "fr");
  assert.equal(d.validUntil, "2026-10-28");
  const saved = await saveDraft(sql, asMember(ines), d.id, {
    title: "Refonte du site vitrine",
    lines: [
      { kind: "section", description: "Conception" },
      line("Atelier de cadrage", 1000, 90000),
      line("Maquettes des pages", 3000, 45000, 2000, { unit: "jour", discount: 1000 }),
      { kind: "section", description: "Hébergement" },
      line("Hébergement annuel", 1000, 24000, 2000, { goods: false }),
    ],
  });
  // 900 + 3 × 450 × 0.9 (= 1,215) + 240 = 2,355.00; VAT 471.00.
  assert.equal(saved.net, 235500);
  assert.equal(saved.vat, 47100);
  assert.equal(saved.gross, 282600);
  const sent = await sendQuote(sql, asMember(ines), d.id, "marie@dupain.test", today);
  assert.equal(sent.status, "sent");
  assert.equal(sent.number, "D-2026-0001");
  assert.equal(sent.issueDate, today);
  assert.equal(sent.seller?.legalName, "Atelier Martin SARL");
  assert.equal(sent.buyer?.name, "Boulangerie Dupain SAS");
  // Never changed in place once sent: through its next version
  // (test/versions.test.ts).
  await assert.rejects(saveDraft(sql, asMember(ines), d.id, { title: "Refonte du site" }), refused("wrong_status"));
  const accepted = await decideQuote(sql, asMember(ines), d.id, "accepted");
  assert.equal(accepted.status, "accepted");
  await assert.rejects(saveDraft(sql, asMember(ines), d.id, { title: "x" }), refused("wrong_status"));
  // Taken back, then accepted again.
  assert.equal((await decideQuote(sql, asMember(ines), d.id, "sent")).status, "sent");
  await decideQuote(sql, asMember(ines), d.id, "accepted");
  const second = await draft(sql, "quote", c.id, [line("Logo", 1000, 50000)], ines);
  assert.equal((await sendQuote(sql, asMember(ines), second.id, null, today)).number, "D-2026-0002");
});

test("a sent quote past its validity date is expired; sending it again gives a new date", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Client expiré" });
  const q = await draft(sql, "quote", c.id, [line("Conseil", 1000, 10000)]);
  await saveDraft(sql, asMember(sofia), q.id, { validUntil: "2026-09-30" });
  await sendQuote(sql, asMember(sofia), q.id, null, today);
  const later = "2026-10-15";
  const full = await getDocument(sql, asMember(lea), q.id, later);
  assert.equal(full.state, "expired");
  const again = await sendQuote(sql, asMember(sofia), q.id, null, later);
  assert.equal(again.validUntil, "2026-11-14");
  assert.equal(again.number, full.number, "same number");
});

test("what a draft may hold is bounded and checked on the server", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Bornes" });
  const d = await createDocument(sql, asMember(hugo), "quote", c.id, defaults);
  await assert.rejects(saveDraft(sql, asMember(hugo), d.id, { lines: [line("x", -1, 100)] }), refused("quantity_invalid"));
  await assert.rejects(saveDraft(sql, asMember(hugo), d.id, { lines: [line("x", 1000, 1.5)] }), refused("amount_invalid"));
  await assert.rejects(saveDraft(sql, asMember(hugo), d.id, { lines: [line("x", 1000, 100, 1900)] }), refused("rate_invalid"));
  await assert.rejects(saveDraft(sql, asMember(hugo), d.id, { lines: [line("x", 1000, 100, 2000, { discount: 10001 })] }), refused("discount_invalid"));
  await assert.rejects(saveDraft(sql, asMember(hugo), d.id, { lines: Array.from({ length: 301 }, () => line("x", 1000, 1)) }), refused("too_many"));
  await assert.rejects(saveDraft(sql, asMember(hugo), d.id, { lines: [line("x".repeat(2001), 1000, 1)] }), refused("too_long"));
  await assert.rejects(saveDraft(sql, asMember(hugo), d.id, { lines: "nope" }), refused("invalid"));
  await assert.rejects(saveDraft(sql, asMember(hugo), d.id, { language: "de" }), refused("invalid"));
  await assert.rejects(saveDraft(sql, asMember(hugo), d.id, { validUntil: "2026-13-01" }), refused("date_invalid"));
  await assert.rejects(saveDraft(sql, asMember(hugo), d.id, { vatTreatment: "zero" }), refused("invalid"));
  await assert.rejects(saveDraft(sql, asMember(hugo), d.id, { lines: [line("Big", 1_000_000_000, 9_999_999_999)] }), refused("total_too_large"));
  await assert.rejects(saveDraft(sql, asMember(hugo), "'; drop table documents; --", {}), refused("not_found"));
  await assert.rejects(saveDraft(sql, asMember(hugo), "999999", {}), refused("not_found"));
  // Numbering needs a client, lines, and a description on each line.
  const empty = await createDocument(sql, asMember(hugo), "quote", null, defaults);
  await assert.rejects(sendQuote(sql, asMember(hugo), empty.id, null, today), refused("no_client"));
  await saveDraft(sql, asMember(hugo), empty.id, { clientId: c.id });
  await assert.rejects(sendQuote(sql, asMember(hugo), empty.id, null, today), refused("no_lines"));
  await saveDraft(sql, asMember(hugo), empty.id, { lines: [line("Ok", 1000, 100), line("", 1000, 100)] });
  await assert.rejects(sendQuote(sql, asMember(hugo), empty.id, null, today), (e: unknown) => e instanceof AppError && e.code === "line_empty" && e.values["line"] === 2);
  const noAddress = await client(sql, { name: "Sans adresse", address: "", city: "" });
  await saveDraft(sql, asMember(hugo), empty.id, { clientId: noAddress.id, lines: [line("Ok", 1000, 100)] });
  await assert.rejects(sendQuote(sql, asMember(hugo), empty.id, null, today), refused("client_incomplete"));
  await archiveClient(sql, asMember(hugo), noAddress.id, true);
  await assert.rejects(saveDraft(sql, asMember(hugo), empty.id, { clientId: noAddress.id }), refused("client_archived"));
});

test("each role's rights on documents", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Droits" });
  // A viewer reads, never writes; no role, nothing.
  await assert.rejects(createDocument(sql, asMember(lea), "quote", c.id, defaults), refused("forbidden"));
  await assert.rejects(createDocument(sql, asMember(nora), "quote", c.id, defaults), refused("forbidden"));
  await assert.rejects(listDocuments(sql, asMember(nora), { types: ["quote"] }, today), refused("forbidden"));
  await assert.rejects(listDocuments(sql, null, { types: ["quote"] }, today), refused("forbidden"));
  // Sales prepare invoices, never finalise them.
  const inv = await draft(sql, "invoice", c.id, [line("Travaux", 1000, 100000)], hugo);
  await assert.rejects(finalise(sql, asMember(hugo), inv.id, today), refused("forbidden"));
  await assert.rejects(finalise(sql, asMember(lea), inv.id, today), refused("forbidden"));
  await assert.rejects(saveDraft(sql, asMember(lea), inv.id, { title: "x" }), refused("forbidden"));
  const readied = await markReady(sql, asMember(hugo), inv.id);
  assert.ok(readied.readyAt);
  const done = await finalise(sql, asMember(sofia), inv.id, today);
  assert.match(done.number ?? "", /^F-2026-\d{4}$/u);
  // A credit note is billing's.
  await assert.rejects(startCreditNote(sql, asMember(ines), inv.id), refused("forbidden"));
  assert.equal((await getDocument(sql, asMember(lea), inv.id, today)).state, "unpaid");
});

test("finalising gives the next number of the year and freezes the invoice for good", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Gel" });
  const inv = await draft(sql, "invoice", c.id, [line("Prestation", 2000, 50000)]);
  const [before] = await sql<{ last: number }[]>`select last from counters where type = 'invoice' and year = 2026`;
  const f = await finalise(sql, asMember(sofia), inv.id, today);
  assert.equal(f.number, `F-2026-${String((before?.last ?? 0) + 1).padStart(4, "0")}`);
  assert.equal(f.status, "final");
  assert.equal(f.issueDate, today);
  assert.equal(f.dueDate, "2026-10-28");
  assert.equal(f.gross, 120000);
  assert.equal(f.finalisedBy, sofia.id);
  await assert.rejects(finalise(sql, asMember(sofia), inv.id, today), refused("not_draft"));
  await assert.rejects(saveDraft(sql, asMember(sofia), inv.id, { title: "changed" }), refused("not_draft"));
  await assert.rejects(removeDraft(sql, asMember(sofia), inv.id), refused("not_draft"));
  // The database itself refuses any change of a finalised invoice…
  const frozen = (e: unknown) => (e as { code?: string }).code === "QF001";
  await assert.rejects(sql`update documents set gross = 1 where id = ${inv.id}`, frozen);
  await assert.rejects(sql`update documents set number = 'F-2026-9999' where id = ${inv.id}`, frozen);
  await assert.rejects(sql`update documents set status = 'draft' where id = ${inv.id}`, frozen);
  await assert.rejects(sql`update documents set buyer = '{}'::jsonb where id = ${inv.id}`, frozen);
  await assert.rejects(sql`update documents set created_by = ${hugo.id} where id = ${inv.id}`, frozen);
  await assert.rejects(sql`delete from documents where id = ${inv.id}`, frozen);
  await assert.rejects(sql`update lines set unit_price = 1 where document_id = ${inv.id}`, frozen);
  await assert.rejects(sql`delete from lines where document_id = ${inv.id}`, frozen);
  await assert.rejects(sql`insert into lines (document_id, position, kind, description) values (${inv.id}, 99, 'line', 'sneaky')`, frozen);
  // …but lets through what happens after: sending, reminders, the stored
  // PDF (once), an erasure.
  await sql`update documents set sent_at = now(), emailed_to = 'a@b.test', reminders = reminders + 1 where id = ${inv.id}`;
  await sql`update documents set pdf_object = 'documents/2026/x.pdf', pdf_sha256 = 'abc' where id = ${inv.id}`;
  await assert.rejects(sql`update documents set pdf_object = 'documents/2026/y.pdf' where id = ${inv.id}`, frozen);
  await sql`update documents set created_by = 'erased', finalised_by = 'erased' where id = ${inv.id}`;
  // Changing the company or the client later does not change the invoice.
  await sql`update clients set name = 'Renamed' where id = ${c.id}`;
  const full = await getDocument(sql, asMember(lea), inv.id, today);
  assert.equal(full.buyer?.name, "Gel");
  assert.equal(full.lines.length, 1);
});

test("an invoice needs the company's legal details before it is finalised", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Mentions" });
  const inv = await draft(sql, "invoice", c.id, [line("Prestation", 1000, 1000)]);
  await sql`update company set siren = '' where id = 1`;
  await assert.rejects(finalise(sql, asMember(sofia), inv.id, today), (e: unknown) => e instanceof AppError && e.code === "company_incomplete" && String(e.values["fields"]).includes("siren"));
  await sql`update company set siren = '853128940' where id = 1`;
  const neg = await draft(sql, "invoice", c.id, [line("Remise", 1000, -1000)]);
  await assert.rejects(finalise(sql, asMember(sofia), neg.id, today), refused("negative_total"));
  // Never a date before the last one issued (numbers follow the dates).
  await assert.rejects(finalise(sql, asMember(sofia), inv.id, "2026-09-01"), refused("date_invalid"));
  await finalise(sql, asMember(sofia), inv.id, today);
});

test("from an accepted quote: a deposit, then the balance less the deposit", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Acompte" });
  const q = await draft(sql, "quote", c.id, [line("Cuisine sur mesure", 1000, 800000, 2000, { goods: true }), line("Pose", 2000, 50000, 1000)]);
  // 8,000 at 20 % and 1,000 at 10 %.
  await assert.rejects(invoiceFromQuote(sql, asMember(hugo), q.id, null), refused("wrong_status"));
  await sendQuote(sql, asMember(hugo), q.id, null, today);
  await decideQuote(sql, asMember(hugo), q.id, "accepted");
  await assert.rejects(invoiceFromQuote(sql, asMember(lea), q.id, 3000), refused("forbidden"));
  await assert.rejects(invoiceFromQuote(sql, asMember(hugo), q.id, 0), refused("deposit_invalid"));
  await assert.rejects(invoiceFromQuote(sql, asMember(hugo), q.id, 10000), refused("deposit_invalid"));
  const deposit = await invoiceFromQuote(sql, asMember(hugo), q.id, 3000);
  assert.equal(deposit.depositPercent, 3000);
  assert.equal(deposit.quoteId, q.id);
  const depositFull = await getDocument(sql, asMember(hugo), deposit.id, today);
  const quoteNumber = (await getDocument(sql, asMember(hugo), q.id, today)).number!;
  assert.deepEqual(depositFull.lines.map(l => [l.unitPrice, l.vatRate]), [[240000, 2000], [30000, 1000]]);
  const words = depositFull.lines.map(l => l.description.replace(/\s/gu, " "));
  assert.equal(words[0], `Acompte de 30 % sur le devis ${quoteNumber} — TVA 20 %`);
  assert.equal(words[1], `Acompte de 30 % sur le devis ${quoteNumber} — TVA 10 %`);
  assert.equal(deposit.gross, 240000 * 1.2 + 30000 * 1.1);
  // A quote cannot take more than 100 % of deposits.
  await assert.rejects(invoiceFromQuote(sql, asMember(hugo), q.id, 7001), refused("deposit_invalid"));
  const dep = await finalise(sql, asMember(sofia), deposit.id, today);
  // The balance: every line of the quote, less the deposit, rate by rate.
  const balance = await invoiceFromQuote(sql, asMember(hugo), q.id, null);
  const lines = (await getDocument(sql, asMember(hugo), balance.id, today)).lines;
  assert.deepEqual(lines.slice(2).map(l => [l.unitPrice, l.vatRate]), [[-240000, 2000], [-30000, 1000]]);
  assert.ok(lines[2]!.description.includes(dep.number!));
  assert.equal(balance.net, 900000 - 270000);
  await assert.rejects(invoiceFromQuote(sql, asMember(hugo), q.id, null), refused("nothing_left"));
  await assert.rejects(invoiceFromQuote(sql, asMember(hugo), q.id, 1000), refused("nothing_left"));
  // An invoiced quote stays accepted.
  await assert.rejects(decideQuote(sql, asMember(hugo), q.id, "sent"), refused("wrong_status"));
});

test("a credit note corrects a finalised invoice, never more than it", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Avoir" });
  const inv = await draft(sql, "invoice", c.id, [line("Formation", 2000, 60000), line("Supports", 10000, 1500)]);
  await assert.rejects(startCreditNote(sql, asMember(sofia), inv.id), refused("not_final"));
  const f = await finalise(sql, asMember(sofia), inv.id, today);
  assert.equal(f.gross, 162000); // (1,200 + 150) × 1.2
  const credit = await startCreditNote(sql, asMember(sofia), inv.id);
  assert.equal(credit.type, "credit");
  assert.equal(credit.invoiceId, inv.id);
  assert.equal(credit.gross, f.gross);
  // A partial credit: one day of training.
  await saveDraft(sql, asMember(sofia), credit.id, { lines: [line("Formation — une journée annulée", 1000, 60000)] });
  await assert.rejects(saveDraft(sql, asMember(sofia), credit.id, { clientId: c.id }), refused("invalid"));
  const cf = await finalise(sql, asMember(sofia), credit.id, today);
  assert.match(cf.number ?? "", /^A-2026-\d{4}$/u);
  assert.equal(cf.gross, 72000);
  const full = await getDocument(sql, asMember(lea), inv.id, today);
  assert.equal(full.credited, 72000);
  assert.equal(full.due, 90000);
  assert.equal(full.state, "unpaid");
  // What remains is 900.00: a credit of the whole invoice is refused.
  const second = await startCreditNote(sql, asMember(sofia), inv.id);
  await assert.rejects(finalise(sql, asMember(sofia), second.id, today), refused("credit_too_large"));
  await saveDraft(sql, asMember(sofia), second.id, { lines: [line("Solde", 1000, 75000)] });
  await finalise(sql, asMember(sofia), second.id, today);
  assert.equal((await getDocument(sql, asMember(lea), inv.id, today)).state, "credited");
  await assert.rejects(startCreditNote(sql, asMember(sofia), inv.id), refused("nothing_left"));
  // Frozen too.
  await assert.rejects(sql`update documents set gross = 1 where id = ${cf.id}`, (e: unknown) => (e as { code?: string }).code === "QF001");
});

test("a credit note takes back VAT only at the invoice's rates, no more than is left at each", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Avoir Taux" });
  const inv = await draft(sql, "invoice", c.id, [line("Conseil", 1000, 100000)]);
  await finalise(sql, asMember(sofia), inv.id, today);
  // 1,100.00 at 5.5 % is less than the 1,200.00 left, but the invoice
  // charged no VAT at 5.5 %.
  const odd = await startCreditNote(sql, asMember(sofia), inv.id);
  await saveDraft(sql, asMember(sofia), odd.id, { lines: [{ ...line("Conseil", 1000, 110000), vatRate: 550 }] });
  await assert.rejects(finalise(sql, asMember(sofia), odd.id, today), refused("credit_rate"));
  // Two invoices' worth of a rate: refused at that rate, with what is left said.
  const mixed = await draft(sql, "invoice", c.id, [line("Conseil", 1000, 100000), { ...line("Livre", 1000, 10000), vatRate: 550 }]);
  await finalise(sql, asMember(sofia), mixed.id, today);
  const over = await startCreditNote(sql, asMember(sofia), mixed.id);
  await saveDraft(sql, asMember(sofia), over.id, { lines: [{ ...line("Livre", 1000, 20000), vatRate: 550 }] });
  await assert.rejects(finalise(sql, asMember(sofia), over.id, today), (e: unknown) => e instanceof AppError && e.code === "credit_rate_too_large" && /100,00/u.test(String(e.values["left"])));
  await saveDraft(sql, asMember(sofia), over.id, { lines: [{ ...line("Livre", 1000, 10000), vatRate: 550 }] });
  await finalise(sql, asMember(sofia), over.id, today);
  // Nothing left at 5.5 %: another 5.5 % credit is refused, 20 % still goes.
  const again = await startCreditNote(sql, asMember(sofia), mixed.id);
  await saveDraft(sql, asMember(sofia), again.id, { lines: [{ ...line("Livre", 1000, 100), vatRate: 550 }] });
  await assert.rejects(finalise(sql, asMember(sofia), again.id, today), refused("credit_rate_too_large"));
  await saveDraft(sql, asMember(sofia), again.id, { lines: [line("Conseil", 1000, 100000)] });
  assert.equal((await finalise(sql, asMember(sofia), again.id, today)).gross, 120000);
});

test("payments: partial, full, overdue by the Chest's date, undone", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Paiements" });
  const inv = await draft(sql, "invoice", c.id, [line("Mission", 1000, 100000)]);
  await assert.rejects(addPayment(sql, asMember(sofia), inv.id, { paidOn: today, amount: "100", method: "transfer" }, today), refused("not_final"));
  await finalise(sql, asMember(sofia), inv.id, today);
  await assert.rejects(addPayment(sql, asMember(hugo), inv.id, { paidOn: today, amount: "100", method: "transfer" }, today), refused("forbidden"));
  await assert.rejects(addPayment(sql, asMember(sofia), inv.id, { paidOn: "2026-10-01", amount: "100", method: "transfer" }, today), refused("date_invalid"));
  await assert.rejects(addPayment(sql, asMember(sofia), inv.id, { paidOn: today, amount: "0", method: "transfer" }, today), refused("payment_invalid"));
  await assert.rejects(addPayment(sql, asMember(sofia), inv.id, { paidOn: today, amount: "100", method: "bitcoin" }, today), refused("invalid"));
  await assert.rejects(addPayment(sql, asMember(sofia), inv.id, { paidOn: today, amount: "1 200,01", method: "transfer" }, today), refused("payment_too_large"));
  await addPayment(sql, asMember(sofia), inv.id, { paidOn: today, amount: "500", method: "transfer" }, today);
  assert.equal((await getDocument(sql, asMember(lea), inv.id, today)).state, "partly_paid");
  assert.equal((await getDocument(sql, asMember(lea), inv.id, "2026-11-01")).state, "overdue");
  const due = await receivables(sql, asMember(lea), today);
  assert.ok(due.some(r => r.id === inv.id && r.due === 70000));
  const { due: left } = await addPayment(sql, asMember(camille), inv.id, { paidOn: today, amount: "700,00", method: "cheque", note: "Chèque n° 123" }, today);
  assert.equal(left, 0);
  assert.equal((await getDocument(sql, asMember(lea), inv.id, "2026-11-01")).state, "paid");
  await assert.rejects(addPayment(sql, asMember(sofia), inv.id, { paidOn: today, amount: "1", method: "transfer" }, today), refused("nothing_due"));
  assert.ok(!(await receivables(sql, asMember(lea), today)).some(r => r.id === inv.id));
});

test("drafts are deleted and restored; a copy starts a new draft", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Copie" });
  const q = await draft(sql, "quote", c.id, [line("Audit", 1000, 150000)], ines);
  await assert.rejects(removeDraft(sql, asMember(lea), q.id), refused("forbidden"));
  await removeDraft(sql, asMember(ines), q.id);
  await assert.rejects(getDocument(sql, asMember(ines), q.id, today), refused("not_found"));
  await restoreDraft(sql, asMember(ines), q.id);
  await sendQuote(sql, asMember(ines), q.id, null, today);
  await assert.rejects(removeDraft(sql, asMember(ines), q.id), refused("not_draft"));
  const copy = await duplicate(sql, asMember(hugo), q.id, defaults);
  assert.equal(copy.status, "draft");
  assert.equal(copy.number, null);
  assert.equal(copy.gross, 180000);
  assert.equal(copy.createdBy, hugo.id);
  const inv = await draft(sql, "invoice", c.id, [line("x", 1000, 100)]);
  const f = await finalise(sql, asMember(sofia), inv.id, today);
  const credit = await startCreditNote(sql, asMember(sofia), f.id);
  await assert.rejects(duplicate(sql, asMember(sofia), credit.id, defaults), refused("invalid"));
  await assert.rejects(duplicate(sql, asMember(lea), q.id, defaults), refused("forbidden"));
});

test("states follow the documents and the Chest's today", () => {
  const base = { validUntil: "2026-10-01", dueDate: "2026-10-01", gross: 1000 };
  assert.equal(stateOf({ ...base, type: "quote", status: "sent" }, { paid: 0, credited: 0 }, "2026-10-01"), "sent");
  assert.equal(stateOf({ ...base, type: "quote", status: "sent" }, { paid: 0, credited: 0 }, "2026-10-02"), "expired");
  assert.equal(stateOf({ ...base, type: "quote", status: "accepted" }, { paid: 0, credited: 0 }, "2026-10-02"), "accepted");
  assert.equal(stateOf({ ...base, type: "invoice", status: "draft" }, { paid: 0, credited: 0 }, "2026-10-02"), "draft");
  assert.equal(stateOf({ ...base, type: "invoice", status: "final" }, { paid: 0, credited: 0 }, "2026-10-01"), "unpaid");
  assert.equal(stateOf({ ...base, type: "invoice", status: "final" }, { paid: 400, credited: 0 }, "2026-10-01"), "partly_paid");
  assert.equal(stateOf({ ...base, type: "invoice", status: "final" }, { paid: 400, credited: 0 }, "2026-10-02"), "overdue");
  assert.equal(stateOf({ ...base, type: "invoice", status: "final" }, { paid: 600, credited: 400 }, "2026-10-02"), "paid");
  assert.equal(stateOf({ ...base, type: "invoice", status: "final" }, { paid: 0, credited: 1000 }, "2026-10-02"), "credited");
  assert.equal(stateOf({ ...base, type: "credit", status: "final" }, { paid: 0, credited: 0 }, "2026-10-02"), "final");
});

test("a new document without a client speaks its author's language; with one, the client's", async () => {
  const { sql } = database;
  const english = await createDocument(sql, asMember(hugo), "quote", null, { ...defaults, locale: "fr" });
  assert.equal(english.language, "en");
  const french = await createDocument(sql, asMember(ines), "quote", null, { ...defaults, locale: "en" });
  assert.equal(french.language, "fr");
  const c = await client(sql, { name: "English Ltd", language: "en", siren: "", vatNumber: "" });
  assert.equal((await createDocument(sql, asMember(ines), "quote", c.id, defaults)).language, "en");
});

test("the reverse charge is the client card's, not a box on each paper", async () => {
  const { sql } = database;
  const eu = await client(sql, { name: "Verbeke BV", country: "BE", siren: "", vatNumber: "BE0765432146", reverseCharge: true, language: "en" });
  const d = await createDocument(sql, asMember(ines), "quote", eu.id, defaults);
  assert.equal(d.vatTreatment, "reverse_charge");
  // The paper cannot turn it off while the card says so.
  assert.equal((await saveDraft(sql, asMember(ines), d.id, { vatTreatment: "standard" })).vatTreatment, "reverse_charge");
  // Without a client, the paper decides.
  const blank = await createDocument(sql, asMember(ines), "quote", null, defaults);
  assert.equal((await saveDraft(sql, asMember(ines), blank.id, { vatTreatment: "reverse_charge" })).vatTreatment, "reverse_charge");
});
