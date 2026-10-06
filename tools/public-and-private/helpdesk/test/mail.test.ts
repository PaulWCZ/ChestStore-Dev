import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, shownTo, type FakeChest } from "@argentic/chest-sdk/testing";
import { checkMail } from "../src/lib/mail-checks.ts";
import * as mailer from "../src/lib/mailer.ts";
import * as tickets from "../src/lib/tickets.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";

// Email to customers — people outside the company — as the Chest would
// carry it (Proposal (studio): mail, sending only): what the tool sends read
// from the fake Chest's outbox, bounces learnt by asking mail.status (the
// Chest receives no mail and posts nothing: owner's decision, 6 October
// 2026).
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier.test", replyTo: "contact@atelier.test" }, chest: { timeZone: "Europe/Paris", organization: "Atelier Martin", language: "fr", publicUrl: "https://support.atelier.test" } });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(() => {
  chest.notifications.splice(0);
  chest.outbox.splice(0);
  chest.delivery.mail = "ready";
});

let n = 0;
const address = () => `client${++n}@example.com`;
const ticketOf = async (number: number) => tickets.ticket(database.sql, asMember(hugo), number);
const request = (email: string, language = "en", subject = "Broken lamp") => tickets.fromForm(database.sql, { name: "Anna Weber", email, subject, message: "The base is cracked.", language });
// What the reply action does (src/actions.ts): a new link, the email, how it went.
async function answer(number: number, body: string, close = false) {
  const { sql } = database;
  const done = await tickets.reply(sql, asMember(hugo), number, body, { close });
  const secret = await tickets.newLink(sql, done.ticket.id);
  const sent = await mailer.answer(done.ticket, body, asMember(hugo), "Atelier Martin", `https://support.atelier.test/t/${secret}`, done.messageId);
  await tickets.delivered(sql, done.messageId, sent.delivery, sent.delivery === "email" ? sent.mail : undefined, sent.delivery === "page" ? sent.refused : undefined);
  return { done, sent, secret };
}

test("the confirmation gives the request page's link and says plainly where to write; replies to it go to the company's inbox", async () => {
  const email = address();
  const t = await request(email, "fr");
  const sent = await mailer.confirm({ number: t.number, subject: "Lampe cassée", customerEmail: email, customerName: "Anna", language: "fr" }, `https://support.atelier.test/t/${t.secret}`, "Atelier Martin");
  assert.equal(sent.delivery, "email");
  const m = chest.outbox.at(-1)!;
  assert.deepEqual(m.to, [email]);
  assert.equal(m.subject, `Nous avons bien reçu votre demande : Lampe cassée [#${t.number}]`);
  assert.ok(m.text.includes(`https://support.atelier.test/t/${t.secret}`));
  assert.match(m.text, /c’est là que vous nous écrivez à nouveau/u);
  assert.equal(m.replyTo, "contact@atelier.test", "the connector's reply address: the company's usual inbox");
  assert.equal(m.fromName, "Atelier Martin");
  // The same request confirmed twice (a retry): sent once.
  await mailer.confirm({ number: t.number, subject: "Lampe cassée", customerEmail: email, customerName: "Anna", language: "fr" }, `https://support.atelier.test/t/${t.secret}`, "Atelier Martin");
  assert.equal(chest.outbox.length, 1);
});

test("an agent's answer carries a working link to the request page, where the customer writes back; the email says where replies go", async () => {
  const email = address();
  const t = await request(email);
  const { sent, secret } = await answer(t.number, "Here is a new base.");
  assert.equal(sent.delivery, "email");
  const m = chest.outbox.at(-1)!;
  assert.equal(m.subject, `Re: Broken lamp [#${t.number}]`);
  assert.ok(m.text.startsWith("Here is a new base.\n\n—\nHugo, Atelier Martin"));
  assert.ok(m.text.includes(`Please answer on your request page, where the whole conversation is kept:\nhttps://support.atelier.test/t/${secret}`));
  assert.ok(m.text.includes("(A reply to this email goes to Atelier Martin’s usual inbox, not to this conversation.)"));
  assert.equal(m.replyTo, "contact@atelier.test");
  // Nothing threads it back into Support: the Chest receives no mail.
  assert.deepEqual(Object.keys(m).filter(k => !["id", "messageId", "from", "fromName", "to", "cc", "subject", "text", "html", "replyTo", "attachments", "key", "status"].includes(k)), []);
  // The new link opens the same request, and writing there reaches the team.
  assert.equal((await tickets.byLink(database.sql, secret))!.number, t.number);
  assert.equal((await tickets.byLink(database.sql, t.secret))!.number, t.number, "the first link still works");
  await tickets.customerReply(database.sql, secret, "Thanks, it fits.");
  const after = await ticketOf(t.number);
  assert.equal(after.status, "open");
  assert.deepEqual(after.messages.filter(x => x.kind === "customer").map(x => x.body), ["The base is cracked.", "Thanks, it fits."]);
  assert.equal(after.messages.find(x => x.kind === "reply")!.delivery, "email");
});

test("without the company's mail connected, nothing is lost: the answer is on the request page and the team's page says so", async () => {
  chest.delivery.mail = "not_connected";
  const t = await request(address());
  assert.equal((await mailer.confirm({ number: t.number, subject: "Broken lamp", customerEmail: "x@example.com", customerName: "", language: "en" }, "https://support.atelier.test/t/x", "")).delivery, "page");
  const { sent } = await answer(t.number, "Answer on the page");
  assert.equal(sent.delivery, "page");
  assert.equal(chest.outbox.length, 0);
  const reply = (await ticketOf(t.number)).messages.find(x => x.kind === "reply")!;
  assert.equal(reply.delivery, "page");
  assert.deepEqual(await mailer.mailState(), { ok: false, reason: "not_connected", replyTo: "contact@atelier.test" });
  chest.delivery.mail = "ready";
  assert.deepEqual(await mailer.mailState(), { ok: true, reason: null, replyTo: "contact@atelier.test" });
});

test("bounces: learnt from mail.status on the schedule; the reply and the ticket say it, its author hears of it in their language; the Chest then refuses the address", async () => {
  const { sql } = database;
  const t = await request(address());
  await answer(t.number, "Hello");
  const mailId = chest.outbox.at(-1)!.id;
  await sql`delete from mail_checks where mail_id <> ${mailId}`;
  // Still on its way: asked, nothing said.
  assert.deepEqual(await checkMail(sql), { asked: 1, bounced: 0 });
  chest.bounce(mailId, { permanent: true });
  // Asked again only once it has aged (a quarter of its age since the last question).
  assert.deepEqual(await checkMail(sql), { asked: 0, bounced: 0 });
  const later = new Date(Date.now() + 3_600_000);
  assert.deepEqual(await checkMail(sql, later), { asked: 1, bounced: 1 });
  const ticket = await ticketOf(t.number);
  assert.equal(ticket.bounce?.reason, "bounced");
  assert.equal(ticket.bounce?.recipient, ticket.customerEmail);
  assert.equal(ticket.messages.find(m => m.kind === "reply")!.bounce!.reason, "bounced");
  const told = chest.notifications.find(x => x.member === hugo.id && x.key === `ticket:${ticket.id}:bounced`)!;
  assert.equal(told.title, `An email about ticket ${t.number} did not arrive`);
  assert.equal(shownTo(told, "fr").title, `Un e-mail de la demande ${t.number} n’est pas arrivé`);
  assert.deepEqual(await checkMail(sql, new Date(Date.now() + 7_200_000)), { asked: 0, bounced: 0 }, "a message is followed until it is settled");
  const again = await answer(t.number, "Hello again");
  assert.equal(again.sent.delivery, "page");
  assert.equal(again.sent.delivery === "page" && again.sent.refused?.reason, "suppressed");
  // Fixing the address clears the warning.
  await tickets.setCustomer(sql, asMember(hugo), t.number, { email: address(), name: "" });
  assert.equal((await ticketOf(t.number)).bounce, null);
  await assert.rejects(tickets.setCustomer(sql, asMember(lea), t.number, { email: address(), name: "" }));
});

test("a confirmation that bounces marks the ticket: the customer mistyped their address", async () => {
  const t = await tickets.fromForm(database.sql, { name: "Typo", email: "typo@exmaple.com", subject: "Help", message: "Please", language: "en" });
  const sent = await mailer.confirm({ number: t.number, subject: "Help", customerEmail: "typo@exmaple.com", customerName: "Typo", language: "en" }, "https://x/t/y", "");
  assert.equal(sent.delivery, "email");
  if (sent.delivery === "email") await tickets.confirmed(database.sql, t.id, sent.mail);
  chest.bounce(chest.outbox.at(-1)!.id, { complained: true });
  await checkMail(database.sql, new Date(Date.now() + 60_000));
  assert.equal((await ticketOf(t.number)).bounce?.recipient, "typo@exmaple.com");
  assert.equal((await ticketOf(t.number)).bounce?.reason, "complained");
});

test("erasing a customer deletes their requests, their links and their files", async () => {
  const { sql } = database;
  const from = address();
  const a = await request(from);
  await answer(a.number, "One");
  await request(from, "en", "Second");
  const gone = await tickets.eraseCustomer(sql, asMember(camille), from);
  assert.equal(gone.tickets, 2);
  assert.equal((await sql`select count(*)::int as n from ticket_links l where not exists (select 1 from tickets t where t.id = l.ticket_id)`)[0]!["n"], 0);
  assert.equal(await tickets.byLink(sql, a.secret), null);
  assert.equal((await tickets.erasures(sql, asMember(camille)))[0]!.by, camille.id);
  await assert.rejects(tickets.erasures(sql, asMember(hugo)));
});

test("mail goes to customers' addresses only, never to a member: a colleague's request is answered in Support and the bell", async () => {
  const { sql } = database;
  const before = chest.outbox.length;
  const t = await tickets.fromForms(sql, { event: "evt_mail_test_1", source: { form: { id: "f1", title: "IT" }, answer: { id: "a1", path: null } }, subject: "Laptop", body: "Broken screen", email: null, name: "", member: camille.id, language: "fr" });
  assert.ok(t);
  assert.equal(chest.outbox.length, before);
  for (const m of chest.outbox) assert.ok(!m.to.some(a => a.startsWith("mbr_")));
});

test("a customer's answer by email (it reached the company's inbox): an agent adds it, it is the customer's message — on their page, reopening the request, waiting on the team", async () => {
  const { sql } = database;
  const t = await request(address());
  await answer(t.number, "Could you send a photo?", true);
  assert.equal((await ticketOf(t.number)).status, "closed");
  await tickets.theirEmail(sql, asMember(ines), t.number, "  Here it is, the crack is on the left.  ");
  const after = await ticketOf(t.number);
  assert.equal(after.status, "open", "a solved request reopens");
  assert.ok(after.waitingSince, "the wait for an answer starts");
  const last = after.messages.at(-1)!;
  assert.equal(last.kind, "customer");
  assert.equal(last.author, ines.id, "who copied it is recorded");
  assert.equal(last.body, "Here it is, the crack is on the left.");
  // The customer sees it on their request page as their own message.
  const page = await tickets.byLink(sql, t.secret);
  assert.equal(page!.messages.at(-1)!.body, "Here it is, the crack is on the left.");
  // Never on a colleague's request, a spam, nor by someone who only reads.
  const colleague = await tickets.fromForms(sql, { event: "evt_theiremailaaaaaaaaaaaaaaaa", source: { form: { id: "f1", title: "IT" }, answer: { id: "a2", path: null } }, subject: "Laptop", body: "Broken screen", email: null, name: "", member: camille.id, language: "fr" });
  await assert.rejects(tickets.theirEmail(sql, asMember(hugo), colleague.number, "x"), { code: "forbidden" });
  await assert.rejects(tickets.theirEmail(sql, asMember(lea), t.number, "x"), { code: "forbidden" });
  await assert.rejects(tickets.theirEmail(sql, asMember(hugo), t.number, "   "), { code: "empty" });
});
