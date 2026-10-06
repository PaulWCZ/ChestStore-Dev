import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import * as mail from "@argentic/chest-sdk/mail";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { pdfOf } from "../src/lib/archive.ts";
import { company as readCompany, rememberMail } from "../src/lib/company.ts";
import { finalise, getDocument, upcomingNumber } from "../src/lib/documents.ts";
import { AppError } from "../src/shared/app-error.ts";
import { mailState } from "../src/lib/mailing.ts";
import { draftMessage, markReminded, markSent, sendDocument, sendReminder } from "../src/lib/sending.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, draft, line, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines, lea, nora, sofia } from "./support/members.ts";
import { pdfText } from "./support/pdf.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier-martin.test", suppressed: ["bounced@client.test"] } });
  database = await testDatabase();
  await company(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const context = { company: "Atelier Martin SARL", sender: "Inès Moreau", iban: "FR76 3000 6000 0112 3456 7890 189", bic: "AGRIFRPP", today };

test("a quote goes by email in the client's language, its PDF attached, and is numbered", async () => {
  const { sql } = database;
  const c = await client(sql);
  const q = await draft(sql, "quote", c.id, [line("Refonte du site", 1000, 250000)], ines);
  const message = draftMessage(await getDocument(sql, asMember(ines), q.id, today), "send", context);
  assert.equal(message.to, "marie@dupain.test");
  assert.ok(message.text.startsWith("Bonjour Marie Dupain,"));
  assert.ok(message.text.includes("Inès Moreau\nAtelier Martin SARL"));
  const result = await sendDocument(sql, asMember(ines), q.id, { ...message, subject: "Notre devis" }, today);
  assert.deepEqual(result, { delivery: "email", number: "D-2026-0001" });
  const sent = chest.outbox.at(-1)!;
  assert.deepEqual(sent.to, ["marie@dupain.test"]);
  assert.equal(sent.subject, "Notre devis");
  assert.equal(sent.fromName, "Inès Moreau — Atelier Martin SARL");
  assert.equal(sent.replyTo, "contact@atelier-martin.test");
  assert.equal(sent.attachments[0]?.name, "Devis-D-2026-0001.pdf");
  assert.equal(sent.attachments[0]?.type, "application/pdf");
  assert.ok((sent.attachments[0]?.size ?? 0) > 1000);
  const full = await getDocument(sql, asMember(lea), q.id, today);
  assert.equal(full.state, "sent");
  assert.equal(full.emailedTo, "marie@dupain.test");
  assert.equal((await readCompany(sql)).mailWorks, true);
  // The same message twice (a double click) goes once.
  await sendDocument(sql, asMember(ines), q.id, { ...message, subject: "Notre devis" }, today);
  assert.equal(chest.outbox.length, 1);
});

test("a document goes to the client's address, replies to the company's address of Settings (else the Chest's reply address)", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Petit Conseil", email: "contact@petit-conseil.test" });
  const q = await draft(sql, "quote", c.id, [line("Audit", 1000, 90000)], ines);
  const message = draftMessage(await getDocument(sql, asMember(ines), q.id, today), "send", context);
  assert.equal((await sendDocument(sql, asMember(ines), q.id, message, today)).delivery, "email");
  const sent = chest.outbox.at(-1)!;
  assert.deepEqual(sent.to, ["contact@petit-conseil.test"]);
  assert.equal(sent.replyTo, (await readCompany(sql)).email || "contact@atelier-martin.test");
  assert.equal(sent.attachments[0]?.type, "application/pdf");
});

test("a member is never a mail recipient: the Chest refuses an mbr_ address", async () => {
  await assert.rejects(mail.send({ to: nora.id, subject: "x", text: "x" }), (e: Error & { code?: string }) => e.code === "invalid_recipient");
});

test("the company's mail not connected: nothing goes, the quote stays as it was, and the dialog says send it yourself", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Sans Mail", email: "hello@sans-mail.test" });
  const q = await draft(sql, "quote", c.id, [line("Audit", 1000, 90000)], ines);
  const message = draftMessage(await getDocument(sql, asMember(ines), q.id, today), "send", context);
  const before = chest.outbox.length;
  chest.delivery.mail = "not_connected";
  try {
    assert.deepEqual((await mailState(sql)).reason, "not_connected");
    assert.equal((await sendDocument(sql, asMember(ines), q.id, message, today)).delivery, "no_mail");
  } finally {
    chest.delivery.mail = "ready";
  }
  assert.equal(chest.outbox.length, before);
  assert.equal((await getDocument(sql, asMember(ines), q.id, today)).status, "draft");
  // Sending paused for a while: send it yourself too, but the tool does
  // not take it for a Chest without mail (the morning's reminders still
  // try email, and come back the next morning).
  await rememberMail(sql, true);
  chest.delivery.mail = "suspended";
  try {
    assert.equal((await sendDocument(sql, asMember(ines), q.id, message, today)).delivery, "no_mail");
  } finally {
    chest.delivery.mail = "ready";
  }
  assert.equal((await readCompany(sql)).mailWorks, true);
  assert.equal(chest.outbox.length, before);
});

test("an English client gets an English email; a message is checked", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Harbour Ltd", language: "en", contact: "", email: "accounts@harbour.test", country: "GB", siren: "", vatNumber: "" });
  const q = await draft(sql, "quote", c.id, [line("Consulting", 2000, 80000)], hugo);
  const upcoming = await upcomingNumber(sql, "quote", today);
  const message = { ...draftMessage(await getDocument(sql, asMember(hugo), q.id, today), "send", { ...context, sender: "Hugo Bernard", upcoming }), upcoming };
  assert.ok(message.text.startsWith("Hello,\n\nPlease find attached our quote " + upcoming));
  assert.equal(message.subject, `Quote ${upcoming} — Atelier Martin SARL`);
  await assert.rejects(sendDocument(sql, asMember(hugo), q.id, { ...message, to: "" }, today), refused("no_email"));
  await assert.rejects(sendDocument(sql, asMember(hugo), q.id, { ...message, to: "nope" }, today), refused("email_invalid"));
  await assert.rejects(sendDocument(sql, asMember(hugo), q.id, { ...message, subject: "" }, today), refused("empty"));
  await assert.rejects(sendDocument(sql, asMember(lea), q.id, message, today), refused("forbidden"));
  await assert.rejects(sendDocument(sql, asMember(hugo), q.id, { ...message, to: "bounced@client.test" }, today), refused("suppressed"));
  // Refused before anything went: the quote is still a draft.
  assert.equal((await getDocument(sql, asMember(hugo), q.id, today)).status, "draft");
  // A refused attempt kept the number it took: the quote sends with it.
  const kept = (await getDocument(sql, asMember(hugo), q.id, today)).number;
  assert.equal(kept, upcoming);
  assert.equal((await sendDocument(sql, asMember(hugo), q.id, message, today)).number, kept);
  // Another quote takes the number announced: the email says the true one.
  const q2 = await draft(sql, "quote", c.id, [line("Second", 1000, 100)], hugo);
  const announced = await upcomingNumber(sql, "quote", today);
  const second = { ...draftMessage(await getDocument(sql, asMember(hugo), q2.id, today), "send", { ...context, upcoming: announced }), upcoming: announced };
  const other = await draft(sql, "quote", c.id, [line("Other", 1000, 100)], hugo);
  await markSent(sql, asMember(hugo), other.id, today);
  const { number } = await sendDocument(sql, asMember(hugo), q2.id, second, today);
  assert.notEqual(number, announced);
  assert.equal(chest.outbox.at(-1)?.subject, `Quote ${number} — Atelier Martin SARL`);
  assert.ok(chest.outbox.at(-1)?.text.includes(`our quote ${number}`));
  assert.equal(chest.outbox.at(-1)?.attachments[0]?.name, `Quote-${number}.pdf`);
});

test("an invoice is sent once finalised, from the PDF kept when it was issued", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Envoi facture", email: "compta@envoi.test" });
  const inv = await draft(sql, "invoice", c.id, [line("Mission", 1000, 100000)]);
  const message = { to: "compta@envoi.test", subject: "Facture", text: "Bonjour" };
  await assert.rejects(sendDocument(sql, asMember(sofia), inv.id, message, today), refused("not_final"));
  const f = await finalise(sql, asMember(sofia), inv.id, today);
  await assert.rejects(sendDocument(sql, asMember(hugo), inv.id, message, today), refused("forbidden"));
  assert.equal((await sendDocument(sql, asMember(sofia), inv.id, message, today)).delivery, "email");
  const full = await getDocument(sql, asMember(lea), inv.id, today);
  assert.ok(full.sentAt);
  assert.equal(full.pdfObject, `documents/2026/${f.number}.pdf`);
  const stored = chest.files.get(full.pdfObject!)!;
  assert.equal(full.pdfSha256, createHash("sha256").update(stored.data).digest("hex"));
  // Downloading it again gives the very bytes kept.
  const again = await pdfOf(sql, asMember(lea), inv.id, "2027-03-01");
  assert.deepEqual(Buffer.from(again.bytes), Buffer.from(stored.data));
  assert.equal(again.fileName, `Facture-${f.number}.pdf`);
  const text = pdfText(again.bytes);
  assert.ok(text.includes(`N° ${f.number}`) && text.includes("Envoi facture"));
});

test("a reminder, by email or by hand, is counted on the invoice", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Relance", email: "compta@relance.test" });
  const inv = await draft(sql, "invoice", c.id, [line("Mission", 1000, 50000)]);
  await finalise(sql, asMember(sofia), inv.id, today);
  const later = "2026-11-15";
  const message = draftMessage(await getDocument(sql, asMember(sofia), inv.id, later), "reminder", context);
  assert.ok(message.subject.startsWith("Relance\u202f: facture F-2026-"));
  assert.ok(message.text.includes("il reste 600,00 € à payer") || message.text.replace(/\s/gu, " ").includes("il reste 600,00 € à payer"));
  await assert.rejects(sendReminder(sql, asMember(ines), inv.id, message, later), refused("forbidden"));
  assert.equal((await sendReminder(sql, asMember(sofia), inv.id, message, later)).delivery, "email");
  await markReminded(sql, asMember(sofia), inv.id);
  const full = await getDocument(sql, asMember(sofia), inv.id, later);
  assert.equal(full.reminders, 2);
  assert.ok(full.remindedAt);
});

test("sent by hand: the member downloads the PDF and says so", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "À la main", email: "" });
  const q = await draft(sql, "quote", c.id, [line("Audit", 1000, 90000)], ines);
  const { number } = await markSent(sql, asMember(ines), q.id, today);
  assert.match(number ?? "", /^D-2026-\d{4}$/u);
  const full = await getDocument(sql, asMember(ines), q.id, today);
  assert.equal(full.status, "sent");
  assert.equal(full.emailedTo, null);
});
