import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-mail/route.ts";
import * as mailer from "../lib/mailer.ts";
import * as tickets from "../lib/tickets.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";

// Email in and out, as the Chest would carry it (Proposal (studio): mail):
// received messages and bounces posted to /chest-mail, signed; what the
// tool sends read from the fake Chest's outbox.
let database: TestDatabase;
let chest: FakeChest;
const to = (request: Request) => POST(request);
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier.test", mailboxes: ["support"] }, settings: { company: "Atelier Martin", locale: "fr", publicUrl: "https://support.atelier.test" } });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(() => {
  chest.notifications.splice(0);
  chest.outbox.splice(0);
});

let n = 0;
const address = () => `client${++n}@example.com`;
const ticketOf = async (number: number) => tickets.ticket(database.sql, asMember(hugo), number);
const last = async () => (await database.sql<{ number: number }[]>`select number from tickets order by id desc limit 1`)[0]!.number;
const count = async () => (await database.sql<{ n: number }[]>`select count(*)::int as n from tickets`)[0]!.n;

test("an email to support@ opens a ticket, confirmed on its thread; the customer's answer to the confirmation lands on it", async () => {
  const from = address();
  assert.equal(await chest.receive({ mailbox: "support", from, fromName: "Anna Weber", subject: "Broken lamp", text: "The base is cracked.\n\nAnna", html: "<p>The base is <b>cracked</b>.</p><script>alert(1)</script>", attachments: [{ name: "photo.png", type: "image/png", content: "png" }, { name: "setup.exe", type: "application/x-msdownload", content: "MZ" }] }, to), 204);
  const number = await last();
  const t = await ticketOf(number);
  assert.deepEqual([t.channel, t.status, t.customerEmail, t.customerName, t.language], ["email", "open", from, "Anna Weber", "fr"]);
  const m = t.messages[0]!;
  assert.equal(m.html, "<p>The base is <b>cracked</b>.</p>");
  assert.ok(m.original, "the original .eml is kept");
  assert.deepEqual(m.attachments.map(a => a.fileName), ["photo.png"]);
  assert.deepEqual(m.dropped, [{ name: "setup.exe", reason: "type" }]);
  // Confirmed in French (the Chest's language), threaded under their email.
  const confirmation = chest.outbox.at(-1)!;
  assert.deepEqual(confirmation.to, [from]);
  assert.match(confirmation.subject, new RegExp(`^Nous avons bien reçu votre demande\u202f: Broken lamp \\[#${number}\\]$`, "u"));
  assert.match(confirmation.replyTo!, new RegExp(`^support\\+t${number}-[a-z2-7]{10}@atelier\\.test$`, "u"));
  assert.match(confirmation.inReplyTo!, /^<rcv_/u);
  assert.match(confirmation.text, /https:\/\/support\.atelier\.test\/t\/[A-Za-z0-9_-]{32}/u);
  assert.equal(chest.notifications.filter(x => x.key?.endsWith(":new")).length, 3, "everyone who answers");
  // The public page never shows the HTML, the sender, the original.
  const secret = /\/t\/([A-Za-z0-9_-]{32})/u.exec(confirmation.text)![1]!;
  const seen = (await tickets.byLink(database.sql, secret))!;
  assert.deepEqual([seen.messages[0]!.html, seen.messages[0]!.mailFrom, seen.messages[0]!.original], [null, null, false]);
  // They answer the confirmation (its thread address): same ticket.
  assert.equal(await chest.receive({ mailbox: "support", from, subject: `Re: ${confirmation.subject}`, text: "Also the shade.", thread: String(number) }, to), 204);
  assert.equal(await last(), number);
  assert.equal((await ticketOf(number)).messages.length, 2);
});

test("an agent's reply goes on the thread with the conversation's headers; the answer comes back by its headers alone", async () => {
  const from = address();
  await chest.receive({ mailbox: "support", from, subject: "Invoice copy", text: "Could you send it again?" }, to);
  const number = await last();
  const incoming = (await ticketOf(number)).messages[0]!.emailId!;
  const done = await tickets.reply(database.sql, asMember(ines), number, "Here it is.");
  const sent = await mailer.answer(done.ticket, "Here it is.", asMember(ines), "Atelier Martin", done.threading, done.messageId);
  assert.equal(sent.delivery, "email");
  await tickets.delivered(database.sql, done.messageId, sent.delivery, sent.delivery === "email" ? sent.mail : undefined);
  const reply = chest.outbox.at(-1)!;
  assert.equal(reply.inReplyTo, incoming, "answers the customer's email");
  assert.ok(reply.references!.includes(incoming) && reply.references![0] === chest.outbox.at(-2)!.messageId, "the confirmation first");
  assert.match(reply.replyTo!, new RegExp(`^support\\+t${number}-`, "u"));
  assert.equal((await ticketOf(number)).status, "waiting");
  // Their mail program answered the plain address, with the headers, and
  // their domain does not vouch for them: our message id is the proof.
  await chest.receive({ mailbox: "support", from, subject: "Re: Invoice copy", text: "Thanks!", inReplyTo: reply.messageId, references: [reply.messageId], authenticated: false }, to);
  assert.equal(await last(), number);
  const back = await ticketOf(number);
  assert.equal(back.status, "open");
  assert.ok(chest.notifications.some(x => x.member === ines.id && x.key === `ticket:${back.id}:reply`));
});

test("never a stranger in someone else's ticket: [#number] or the subject count only from the same, vouched-for sender", async () => {
  const anna = address();
  await chest.receive({ mailbox: "support", from: anna, subject: "Delivery date", text: "When?" }, to);
  const number = await last();
  const before = await count();
  // Someone else quotes the number: a new ticket.
  await chest.receive({ mailbox: "support", from: address(), subject: `Re: Delivery date [#${number}]`, text: "Me too" }, to);
  assert.equal(await count(), before + 1);
  // A forged Anna (her domain does not vouch): a new ticket too.
  await chest.receive({ mailbox: "support", from: anna, subject: `Re: Delivery date [#${number}]`, text: "Forged", authenticated: false }, to);
  assert.equal(await count(), before + 2);
  // The real Anna, with the number: her ticket.
  await chest.receive({ mailbox: "support", from: anna, subject: `Re: Delivery date [#${number}]`, text: "Any news?" }, to);
  assert.equal(await count(), before + 2);
  // The real Anna writes again under the same subject (a new email, no
  // headers): her open ticket.
  await chest.receive({ mailbox: "support", from: anna, subject: "delivery  date", text: "Still waiting" }, to);
  assert.equal(await count(), before + 2);
  assert.equal((await ticketOf(number)).messages.length, 3);
  // A new subject is a new request.
  await chest.receive({ mailbox: "support", from: anna, subject: "Another question", text: "Hi" }, to);
  assert.equal(await count(), before + 3);
  // A thread address someone made up: not ours, a new ticket.
  await chest.receive({ mailbox: "support", from: address(), subject: "x", text: "y", deliveredTo: `support+t${number}-aaaaaaaaaa@atelier.test` }, to);
  assert.equal(await count(), before + 4);
});

test("an out-of-office answer never opens a ticket, reopens nothing, tells no one, is never answered", async () => {
  const from = address();
  await chest.receive({ mailbox: "support", from, subject: "Question", text: "Hello" }, to);
  const number = await last();
  await tickets.reply(database.sql, asMember(hugo), number, "Answer", { close: true });
  chest.notifications.splice(0);
  chest.outbox.splice(0);
  const before = await count();
  await chest.receive({ mailbox: "support", from, subject: "Automatic reply: Re: Question", text: "I am away until Monday.", thread: String(number), auto: true }, to);
  const t = await ticketOf(number);
  assert.equal(t.status, "closed");
  assert.equal(t.waitingSince, null);
  assert.ok(t.messages.at(-1)!.auto);
  await chest.receive({ mailbox: "support", from: address(), subject: "Out of office", text: "Away", auto: true }, to);
  assert.equal(await count(), before, "no ticket");
  assert.deepEqual([chest.notifications.length, chest.outbox.length], [0, 0]);
});

test("robots never get a confirmation, and one address gets three an hour at most", async () => {
  await chest.receive({ mailbox: "support", from: "no-reply@shop.example", subject: "Your order", text: "Shipped" }, to);
  assert.equal(chest.outbox.length, 0);
  const from = address();
  for (let i = 0; i < 5; i++) await chest.receive({ mailbox: "support", from, subject: `Loop ${i}`, text: "Thanks for your message" }, to);
  assert.equal(chest.outbox.filter(m => m.to[0] === from).length, 3);
});

test("spam goes to the spam folder, unconfirmed and untold; the same delivery twice is filed once", async () => {
  const before = await count();
  await chest.receive({ mailbox: "support", from: address(), subject: "WIN", text: "Click", spam: 6 }, to);
  assert.equal((await ticketOf(await last())).status, "spam");
  assert.deepEqual([chest.outbox.length, chest.notifications.length], [0, 0]);
  const from = address();
  assert.equal(await chest.receive({ mailbox: "support", from, subject: "Once", text: "Hi", id: "rcv_aaaaaaaaaaaaaaaaaaaaaaaaaa" }, to), 204);
  assert.equal(await chest.receive({ mailbox: "support", from, subject: "Once", text: "Hi", id: "rcv_aaaaaaaaaaaaaaaaaaaaaaaaaa" }, to), 204);
  assert.equal(await count(), before + 2);
  // A delivery not signed by the Chest is refused.
  assert.equal((await POST(new Request("http://tool.test/chest-mail", { method: "POST", body: "{}" }))).status, 401);
});

test("bounces: the reply and the ticket say it, its author hears of it; the Chest then refuses the address, said on the next reply", async () => {
  const from = address();
  await chest.receive({ mailbox: "support", from, subject: "Wrong address soon", text: "Hi" }, to);
  const number = await last();
  const done = await tickets.reply(database.sql, asMember(hugo), number, "Hello");
  const sent = await mailer.answer(done.ticket, "Hello", asMember(hugo), "", done.threading, done.messageId);
  assert.equal(sent.delivery, "email");
  await tickets.delivered(database.sql, done.messageId, "email", sent.delivery === "email" ? sent.mail : undefined);
  const mailId = chest.outbox.at(-1)!.id;
  assert.equal(await chest.bounce(mailId, to, { permanent: true }), 204);
  const t = await ticketOf(number);
  assert.equal(t.bounce?.permanent, true);
  assert.match(t.messages.find(m => m.kind === "reply")!.bounce!.reason, /does not exist/u);
  assert.ok(chest.notifications.some(x => x.member === hugo.id && x.key === `ticket:${t.id}:bounced` && x.title === `An email about ticket ${number} did not arrive`));
  const again = await tickets.reply(database.sql, asMember(hugo), number, "Hello again");
  const refused = await mailer.answer(again.ticket, "Hello again", asMember(hugo), "", again.threading, again.messageId);
  assert.equal(refused.delivery, "page");
  assert.equal(refused.delivery === "page" && refused.refused?.reason, "suppressed");
  // Fixing the address clears the warning.
  await tickets.setCustomer(database.sql, asMember(hugo), number, { email: address(), name: "" });
  assert.equal((await ticketOf(number)).bounce, null);
  await assert.rejects(tickets.setCustomer(database.sql, asMember(lea), number, { email: address(), name: "" }));
});

test("a confirmation that bounces marks the ticket: the customer mistyped their address", async () => {
  const t = await tickets.fromForm(database.sql, { name: "Typo", email: "typo@exmaple.com", subject: "Help", message: "Please", language: "en" });
  const sent = await mailer.confirm({ number: t.number, subject: "Help", customerEmail: "typo@exmaple.com", customerName: "Typo", language: "en" }, "https://x/t/y", "");
  assert.equal(sent.delivery, "email");
  if (sent.delivery === "email") await tickets.confirmed(database.sql, t.id, sent.mail);
  await chest.bounce(chest.outbox.at(-1)!.id, to);
  assert.equal((await ticketOf(t.number)).bounce?.recipient, "typo@exmaple.com");
});

test("a merged ticket's email goes to the ticket it was merged into; erasing a customer deletes their emails' originals and files", async () => {
  const from = address();
  await chest.receive({ mailbox: "support", from, subject: "First", text: "One" }, to);
  const a = await last();
  await chest.receive({ mailbox: "support", from, subject: "Second", text: "Two", attachments: [{ name: "doc.pdf", type: "application/pdf", content: "%PDF" }] }, to);
  const b = await last();
  await tickets.merge(database.sql, asMember(hugo), b, a);
  await chest.receive({ mailbox: "support", from, subject: "Re: Second", text: "Three", thread: String(b) }, to);
  assert.deepEqual((await ticketOf(a)).messages.filter(m => m.kind === "customer").map(m => m.body), ["One", "Two", "Three"]);
  const objects = (await database.sql<{ o: string }[]>`select original as o from messages m join tickets t on t.id = m.ticket_id where lower(t.customer_email) = ${from} and original is not null union all select a.object from attachments a join messages m on m.id = a.message_id join tickets t on t.id = m.ticket_id where lower(t.customer_email) = ${from}`).map(r => r.o);
  assert.equal(objects.length, 4);
  const gone = await tickets.eraseCustomer(database.sql, asMember(camille), from);
  assert.equal(gone.tickets, 2);
  assert.deepEqual(gone.objects.sort(), objects.sort());
  assert.equal((await tickets.erasures(database.sql, asMember(camille)))[0]!.by, camille.id);
  await assert.rejects(tickets.erasures(database.sql, asMember(hugo)));
});

test("a customer's confirmation and the answers to them are transactional: they arrive even when the address is a member's who chose no email", async () => {
  const { sql } = database;
  // Camille (a member, camille@company.test) writes to support as a customer.
  const member = chest.members.find(m => m.id === camille.id)!;
  member.mailPreference = "none";
  chest.clearCaches();
  try {
    const t = await tickets.fromForm(sql, { name: "Camille Martin", email: camille.email!, subject: "Order 12", message: "Where is it?", language: "en" });
    const ticket = (await tickets.byLink(sql, t.secret))!;
    const held = chest.held.length;
    assert.equal((await mailer.confirm(ticket, `https://support.atelier.test/t/${t.secret}`, "Atelier Martin")).delivery, "email");
    const done = await tickets.reply(sql, asMember(hugo), t.number, "On its way.", {});
    assert.equal((await mailer.answer(done.ticket, "On its way.", asMember(hugo), "Atelier Martin", done.threading, done.messageId)).delivery, "email");
    assert.deepEqual(chest.outbox.slice(-2).map(m => m.to), [[camille.email], [camille.email]]);
    assert.equal(chest.held.length, held, "nothing held back");
  } finally {
    delete member.mailPreference;
    chest.clearCaches();
  }
});
