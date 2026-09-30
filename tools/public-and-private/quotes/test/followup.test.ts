import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { idempotencyKey } from "@argentic/chest-sdk/mail";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-jobs/[name]/route.ts";
import { updateCompany } from "../lib/company.ts";
import { finalise, getDocument, listDocuments } from "../lib/documents.ts";
import { AppError } from "../lib/errors.ts";
import { followUp, followUpOnce } from "../lib/followup.ts";
import { entriesOf } from "../lib/journal.ts";
import { mailState } from "../lib/mailing.ts";
import { defaultAccounts } from "../lib/company.ts";
import { addPayment } from "../lib/payments.ts";
import { addMonths, makeDueDrafts, repeatInvoice, repeatOf, stopRepeat } from "../lib/repeats.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, draft, line } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, ines, lea, sofia } from "./support/members.ts";

// What the tool does by itself each morning (the "followup" schedule, or
// the first visit of the day): the late payers reminded on the company's
// rules, and the recurring invoices' drafts made and handed to billing.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier-martin.test" }, schedules: [{ name: "badges", cron: "50 6 * * *" }, { name: "followup", cron: "10 7 * * *" }] });
  await company(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("days a month apart keep their day, the 31st its month's last", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-01-31", 2), "2026-03-31");
  assert.equal(addMonths("2026-11-15", 3), "2027-02-15");
  assert.equal(addMonths("2028-02-29", 12), "2029-02-28");
});

test("reminders: off until an administrator turns them on, then one email per step, and the bell", async () => {
  const { sql } = database;
  const c = await client(sql);
  const inv = await finalise(sql, asMember(sofia), (await draft(sql, "invoice", c.id, [line("Site", 1000, 100000)])).id, "2026-08-01");
  // Due on 31 August. Off by default: nothing happens.
  assert.deepEqual(await followUp(sql, "2026-09-10"), { drafts: 0, emailed: 0, told: 0 });
  assert.equal(chest.outbox.length, 0);
  await assert.rejects(updateCompany(sql, asMember(sofia), { remindersOn: true }), refused("forbidden"));
  await assert.rejects(updateCompany(sql, asMember(camille), { reminderDays: "0, 400" }), refused("reminder_days_invalid"));
  await updateCompany(sql, asMember(camille), { remindersOn: true, reminderDays: "30, 7, 15" });
  // 10 days late: step "7 days".
  assert.deepEqual(await followUp(sql, "2026-09-10"), { drafts: 0, emailed: 1, told: 0 });
  const mail = chest.outbox.at(-1)!;
  assert.deepEqual(mail.to, ["marie@dupain.test"]);
  assert.ok(mail.subject.startsWith("Relance\u202f: facture F-2026-0001"));
  assert.ok(mail.text.startsWith("Bonjour Marie Dupain,"));
  assert.equal(mail.attachments[0]?.name, "Facture-F-2026-0001.pdf");
  // The recipient is in the key: after a restore, the invoice's id may name another one.
  assert.equal(mail.key, idempotencyKey(`reminder-${inv.id}-0-marie@dupain.test`));
  // Billing hears of it (Sofia finalised it).
  assert.ok(chest.notifications.some(n => n.member === sofia.id && n.key === `late:${inv.id}`));
  // The same day again, or the next: nothing more for this step.
  assert.deepEqual(await followUp(sql, "2026-09-11"), { drafts: 0, emailed: 0, told: 0 });
  // 16 days late: step "15 days".
  assert.equal((await followUp(sql, "2026-09-16")).emailed, 1);
  assert.equal((await getDocument(sql, asMember(lea), inv.id, "2026-09-16")).reminders, 2);
  // Paid: no more reminders.
  await addPayment(sql, asMember(sofia), inv.id, { paidOn: "2026-09-20", amount: "1200", method: "transfer" }, "2026-09-20");
  assert.equal((await followUp(sql, "2026-10-05")).emailed, 0);
});

test("reminders by the bell only, when the company says so or the client has no address", async () => {
  const { sql } = database;
  await updateCompany(sql, asMember(camille), { remindersEmail: false });
  const c = await client(sql, { name: "Sans e-mail SARL", email: "", siren: "", vatNumber: "" });
  const inv = await finalise(sql, asMember(camille), (await draft(sql, "invoice", c.id, [line("Site", 1000, 50000)])).id, "2026-09-01");
  const sent = chest.outbox.length;
  const run = await followUp(sql, "2026-10-09");
  assert.equal(run.told, 1);
  assert.equal(chest.outbox.length, sent);
  // Camille finalised it and is still an issuer (admin): she hears of it.
  assert.ok(chest.notifications.some(n => n.member === camille.id && n.key === `late:${inv.id}` && n.title.includes("en retard de 8 jours")));
  await updateCompany(sql, asMember(camille), { remindersOn: false, remindersEmail: true });
});

test("a recurring invoice: a draft each period, handed to billing, never finalised by itself", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Maintenance SAS", siren: "", vatNumber: "" });
  const source = await finalise(sql, asMember(sofia), (await draft(sql, "invoice", c.id, [line("Maintenance du site — trimestre 3", 1000, 30000)])).id, "2026-09-30");
  await assert.rejects(repeatInvoice(sql, asMember(ines), source.id, "quarter", null, "2026-09-30"), refused("forbidden"));
  await assert.rejects(repeatInvoice(sql, asMember(sofia), source.id, "weekly", null, "2026-09-30"), refused("invalid"));
  await assert.rejects(repeatInvoice(sql, asMember(sofia), source.id, "month", "2026-09-01", "2026-09-30"), refused("date_invalid"));
  const r = await repeatInvoice(sql, asMember(sofia), source.id, "quarter", null, "2026-09-30");
  assert.equal(r.nextOn, "2026-12-30");
  assert.equal((await repeatOf(sql, source.id))?.repeat.every, "quarter");
  // Nothing before its day.
  assert.equal(await makeDueDrafts(sql, "2026-12-29"), 0);
  assert.equal(await makeDueDrafts(sql, "2026-12-30"), 1);
  assert.equal(await makeDueDrafts(sql, "2026-12-31"), 0);
  const drafts = (await listDocuments(sql, asMember(lea), { types: ["invoice"], clientId: c.id }, "2026-12-30")).filter(d => d.status === "draft");
  assert.equal(drafts.length, 1);
  const made = await getDocument(sql, asMember(lea), drafts[0]!.id, "2026-12-30");
  assert.equal(made.gross, 36000);
  assert.ok(made.readyAt);
  assert.equal(made.lines[0]!.description, "Maintenance du site — trimestre 3");
  assert.equal((await repeatOf(sql, made.id))?.sourceNumber, source.number);
  assert.ok(chest.notifications.some(n => n.member === sofia.id && n.key === `ready:${made.id}`));
  // Asleep for two quarters: both drafts come, not more.
  assert.equal(await makeDueDrafts(sql, "2027-07-01"), 2);
  assert.equal((await repeatOf(sql, source.id))?.repeat.nextOn, "2027-09-30");
  // Stopped: no more.
  await stopRepeat(sql, asMember(sofia), r.id);
  assert.equal(await makeDueDrafts(sql, "2028-01-01"), 0);
  // A deposit invoice does not repeat.
  const dep = await draft(sql, "invoice", c.id, [line("Acompte", 1000, 1000)]);
  await sql`update documents set deposit_percent = 3000 where id = ${dep.id}`;
  const depFinal = await finalise(sql, asMember(sofia), dep.id, "2027-12-31");
  await assert.rejects(repeatInvoice(sql, asMember(sofia), depFinal.id, "month", null, "2027-12-31"), refused("repeat_invalid"));
});

test("the first visit of the day runs the follow-up once, and the schedule runs it", async () => {
  const { sql } = database;
  await followUpOnce(sql, "2028-02-01");
  const [row] = await sql<{ followed_up_on: string }[]>`select followed_up_on from company`;
  assert.equal(row!.followed_up_on, "2028-02-01");
  assert.equal(await chest.run("followup", POST), 204);
  assert.equal(await chest.run("badges", POST), 204);
});

test("the entries of a deposit invoice and of the final invoice that takes it back", () => {
  const doc = { type: "invoice" as const, franchise: false, vatTreatment: "standard" as const, depositPercent: 3000, clientId: "12", clientAccount: "", buyerName: "Dupain" };
  const deposit = entriesOf(doc, [{ ...line("Acompte", 1000, 30000), kind: "line", itemId: null, unit: "", discount: 0, goods: false, net: 30000 } as never], defaultAccounts);
  assert.deepEqual(deposit.map(e => [e.account, e.debit, e.credit]), [["411000", 36000, 0], ["419100", 0, 30000], ["445710", 0, 6000]]);
  assert.equal(deposit[0]!.auxiliary, "C00012");
  const final = entriesOf({ ...doc, depositPercent: null }, [
    { kind: "line", itemId: null, description: "Site", quantity: 1000, unit: "", unitPrice: 100000, discount: 0, vatRate: 2000, goods: false, net: 100000 },
    { kind: "line", itemId: null, description: "Cartes", quantity: 1000, unit: "", unitPrice: 10000, discount: 0, vatRate: 2000, goods: true, net: 10000 },
    { kind: "line", itemId: null, description: "Déduction", quantity: 1000, unit: "", unitPrice: -30000, discount: 0, vatRate: 2000, goods: false, net: -30000, depositOf: "7" },
  ], defaultAccounts);
  assert.deepEqual(final.map(e => [e.account, e.debit, e.credit]), [["411000", 96000, 0], ["706000", 0, 100000], ["707000", 0, 10000], ["419100", 30000, 0], ["445710", 0, 16000]]);
  // Reverse charge: no VAT line.
  const eu = entriesOf({ ...doc, depositPercent: null, vatTreatment: "reverse_charge" }, [{ kind: "line", itemId: null, description: "Site", quantity: 1000, unit: "", unitPrice: 100000, discount: 0, vatRate: 2000, goods: false, net: 100000 }], defaultAccounts);
  assert.deepEqual(eu.map(e => [e.account, e.debit, e.credit]), [["411000", 100000, 0], ["706000", 0, 100000]]);
});

test("mail not connected in the Chest: the morning's reminders go to the bell only, and pages say why (mail.available)", async () => {
  const { sql } = database;
  assert.deepEqual(await mailState(sql), { works: true, reason: null });
  chest.delivery.mail = "not_connected";
  try {
    assert.deepEqual(await mailState(sql), { works: false, reason: "not_connected" });
    await updateCompany(sql, asMember(camille), { remindersOn: true, remindersEmail: true, reminderDays: "7" });
    const c = await client(sql, { name: "Hors ligne SARL", siren: "", vatNumber: "" });
    const inv = await finalise(sql, asMember(camille), (await draft(sql, "invoice", c.id, [line("Site", 1000, 40000)])).id, "2029-06-01");
    const sent = chest.outbox.length;
    const run = await followUp(sql, "2029-07-12");
    assert.equal(run.emailed, 0);
    assert.ok(run.told >= 1);
    assert.equal(chest.outbox.length, sent, "no email tried");
    assert.ok(chest.notifications.some(n => n.member === camille.id && n.key === `late:${inv.id}`));
    chest.delivery.mail = "suspended";
    assert.deepEqual(await mailState(sql), { works: false, reason: "suspended" });
  } finally {
    chest.delivery.mail = "ready";
    await updateCompany(sql, asMember(camille), { remindersOn: false, remindersEmail: true });
  }
  assert.deepEqual(await mailState(sql), { works: true, reason: null });
});
