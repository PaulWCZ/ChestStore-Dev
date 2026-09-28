import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../lib/app-error.ts";
import { check, issue } from "../lib/form-token.ts";
import * as mailer from "../lib/mailer.ts";
import { numberInSubject } from "../lib/model.ts";
import * as tell from "../lib/tell.ts";
import * as tickets from "../lib/tickets.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier.test", mailboxes: ["support"] } });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(() => {
  chest.notifications.splice(0);
  chest.outbox.splice(0);
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const form = (extra: Partial<tickets.PublicInput> = {}): tickets.PublicInput => ({ name: "Jean Client", email: "jean@example.com", subject: "Broken lamp", message: "It arrived broken.\r\nWhat now?", language: "fr", ...extra });

test("the public form opens a ticket; its link shows the thread without the team's notes", async () => {
  const { sql } = database;
  const t = await tickets.fromForm(sql, form());
  assert.ok(t.number >= 1001);
  assert.match(t.secret, /^[A-Za-z0-9_-]{32}$/u);
  await tickets.note(sql, asMember(hugo), t.number, "Customer is a reseller");
  const seen = await tickets.byLink(sql, t.secret);
  assert.equal(seen?.subject, "Broken lamp");
  assert.deepEqual(seen?.messages.map(m => [m.kind, m.body]), [["customer", "It arrived broken.\nWhat now?"]]);
  assert.equal(await tickets.byLink(sql, "x".repeat(32)), null);
  assert.equal(await tickets.byLink(sql, "short"), null);
  await assert.rejects(tickets.fromForm(sql, form({ email: "not-an-email" })), refused("invalid_email"));
  await assert.rejects(tickets.fromForm(sql, form({ message: " " })), refused("empty"));
  await assert.rejects(tickets.fromForm(sql, form({ message: "x".repeat(10001) })), refused("too_long"));
});

test("the form's guard: signed time, not too fast, a few per visitor an hour", async () => {
  const { sql } = database;
  const token = issue(Date.now() - 5000);
  check(token);
  assert.throws(() => check(issue()), refused("too_fast"));
  assert.throws(() => check(token.replace(/.$/u, "x")), refused("invalid"));
  assert.throws(() => check("123.abc"), refused("invalid"));
  for (let i = 0; i < 5; i++) await tickets.guard(sql, "203.0.113.9");
  await assert.rejects(tickets.guard(sql, "203.0.113.9"), refused("too_many"));
  await tickets.guard(sql, "198.51.100.4");
});

test("replies go by email, threaded, in the customer's language; without mail, on the page only", async () => {
  const { sql } = database;
  const t = await tickets.fromForm(sql, form());
  const ticket = (await tickets.byLink(sql, t.secret))!;
  const first = await mailer.confirm(ticket, `https://helpdesk.atelier.test/t/${t.secret}`, "Atelier Martin");
  assert.equal(first.delivery, "email");
  assert.match(chest.outbox[0]!.subject, /^Nous avons bien reçu votre demande : Broken lamp \[#\d+\]$/u);
  assert.match(chest.outbox[0]!.text, new RegExp(t.secret));
  const done = await tickets.reply(sql, asMember(ines), t.number, "Sorry! A new one is on its way.");
  assert.equal(done.ticket.status, "waiting");
  assert.equal(done.ticket.assignee, ines.id);
  const sent = await mailer.answer(done.ticket, "Sorry! A new one is on its way.", asMember(ines), "Atelier Martin", done.threading, done.messageId);
  assert.equal(sent.delivery, "email");
  assert.equal(chest.outbox[1]!.from, "support@atelier.test");
  assert.equal(chest.outbox[1]!.fromName, "Inès — Atelier Martin");
  assert.match(chest.outbox[1]!.subject, /^Re: Broken lamp \[#\d+\]$/u);
  await assert.rejects(tickets.reply(sql, asMember(lea), t.number, "No"), refused("forbidden"));
  // A Chest without mail: nothing sent, the answer is on the page.
  const bare = await fakeChest({ members: everyone, capabilities: ["members"] });
  try {
    assert.deepEqual(await mailer.answer(done.ticket, "…", asMember(ines), "", [], "1"), { delivery: "page" });
  } finally {
    await bare.close();
  }
});

test("a received email continues its ticket (headers or [#number]), reopens it, else opens one", async () => {
  const { sql } = database;
  const t = await tickets.fromForm(sql, form({ email: "anna@example.com", subject: "Invoice" }));
  const r = await tickets.reply(sql, asMember(hugo), t.number, "Here it is.");
  await tickets.delivered(sql, r.messageId, "email", { id: "msg_" + "a".repeat(26), messageId: "<sent1@atelier.test>" });
  const base = { from: { address: "anna@example.com", name: "Anna" }, text: "Thanks!", references: [], attachments: [], spam: 0 };
  const byHeader = await tickets.fromEmail(sql, { ...base, id: "rcv_1", subject: "Re: Invoice", messageId: "<in1@example.com>", inReplyTo: "<sent1@atelier.test>" }, null);
  assert.deepEqual([byHeader.number, byHeader.created], [t.number, false]);
  assert.equal((await tickets.ticket(sql, asMember(hugo), t.number)).status, "open");
  const bySubject = await tickets.fromEmail(sql, { ...base, id: "rcv_2", subject: `Re: Invoice [#${t.number}]`, messageId: "<in2@example.com>", inReplyTo: null }, numberInSubject(`Re: Invoice [#${t.number}]`));
  assert.equal(bySubject.number, t.number);
  // Someone else quoting the number does not get into Anna's ticket.
  const stranger = await tickets.fromEmail(sql, { ...base, from: { address: "eve@example.com", name: null }, id: "rcv_3", subject: `[#${t.number}]`, messageId: "<in3@example.com>", inReplyTo: null }, t.number);
  assert.equal(stranger.created, true);
  // The same email twice is filed once.
  const twice = await tickets.fromEmail(sql, { ...base, id: "rcv_2", subject: "x", messageId: "<in2@example.com>", inReplyTo: null }, null);
  assert.equal(twice.created, false);
  assert.equal((await tickets.ticket(sql, asMember(hugo), t.number)).messages.filter(m => m.kind === "customer").length, 3);
  const spam = await tickets.fromEmail(sql, { ...base, id: "rcv_4", subject: "WIN", messageId: "<spam@x>", inReplyTo: null, spam: 9 }, null);
  assert.equal((await tickets.ticket(sql, asMember(hugo), spam.number)).status, "spam");
});

test("the inbox: folders, search, assignment to people who answer, the bell and the tile", async () => {
  const { sql } = database;
  const t = await tickets.fromForm(sql, form({ email: "zoe@example.com", subject: "Where is my parcel", message: "Tracking number 4471" }));
  await tell.newTicket({ id: t.id, number: t.number, subject: "Where is my parcel", customerName: "Zoé", customerEmail: "zoe@example.com" }, "Tracking number 4471");
  assert.deepEqual(chest.notifications.map(n => n.member).sort(), [camille.id, hugo.id, ines.id].sort());
  assert.ok(chest.notifications.some(n => n.member === ines.id && n.title === "Nouvelle demande de Zoé"));
  assert.ok((await tickets.listTickets(sql, asMember(lea), "unassigned")).some(x => x.number === t.number));
  assert.ok((await tickets.listTickets(sql, asMember(lea), "open", "parcel")).some(x => x.number === t.number));
  assert.ok((await tickets.listTickets(sql, asMember(lea), "open", "4471")).some(x => x.number === t.number));
  assert.ok((await tickets.listTickets(sql, asMember(lea), "open", "zoe@example.com")).some(x => x.number === t.number));
  const answers = async (id: string) => [camille.id, ines.id, hugo.id].includes(id);
  await assert.rejects(tickets.assign(sql, asMember(hugo), t.number, lea.id, answers), refused("invalid"));
  await assert.rejects(tickets.assign(sql, asMember(lea), t.number, hugo.id, answers), refused("forbidden"));
  const moved = await tickets.assign(sql, asMember(camille), t.number, hugo.id, answers);
  await tell.assigned(asMember(camille), moved.ticket, hugo.id);
  assert.ok(!chest.notifications.some(n => n.key === `ticket:${t.id}:new`));
  assert.ok(chest.notifications.some(n => n.member === hugo.id && n.title === `Camille Martin gave you ticket ${t.number}`));
  assert.ok((await tickets.listTickets(sql, asMember(hugo), "mine")).some(x => x.number === t.number));
  const counts = await tickets.waitingCounts(sql, [hugo.id, ines.id]);
  assert.ok(counts.get(hugo.id)! >= 1);
  await assert.rejects(tickets.listTickets(sql, asMember(nora), "open"), refused("forbidden"));
});

test("the customer writes again from the link: the ticket reopens", async () => {
  const { sql } = database;
  const t = await tickets.fromForm(sql, form());
  await tickets.reply(sql, asMember(ines), t.number, "Could you send a photo?", { close: true });
  const again = await tickets.customerReply(sql, t.secret, "Here is what I see.");
  assert.equal(again.status, "open");
  await assert.rejects(tickets.customerReply(sql, "y".repeat(32), "Hello"), refused("not_found"));
});

test("saved replies, settings, a customer's erasure, and the cleanup of old closed tickets", async () => {
  const { sql } = database;
  const r = await tickets.saveReply(sql, asMember(hugo), { title: "Delivery delay", body: "Hello {customer}, …\n{agent}" });
  assert.equal(tickets.fillReply(r.body, { customer: "Jean", agent: "Hugo" }), "Hello Jean, …\nHugo");
  await assert.rejects(tickets.saveReply(sql, asMember(lea), { title: "x", body: "y" }), refused("forbidden"));
  await assert.rejects(tickets.saveSettings(sql, asMember(hugo), { formOpen: false }), refused("forbidden"));
  await tickets.saveSettings(sql, asMember(camille), { formOpen: false, companyName: "Atelier Martin", retentionMonths: 12 });
  await assert.rejects(tickets.fromForm(sql, form()), refused("closed_form"));
  await tickets.saveSettings(sql, asMember(camille), { formOpen: true });
  const old = await tickets.fromForm(sql, form({ email: "old@example.com" }));
  await tickets.setStatus(sql, asMember(hugo), old.number, "closed");
  await sql`update tickets set updated_at = now() - interval '13 months' where number = ${old.number}`;
  assert.equal((await tickets.cleanup(sql)).tickets, 1);
  const gone = await tickets.fromForm(sql, form({ email: "Erase.Me@example.com" }));
  await assert.rejects(tickets.eraseCustomer(sql, asMember(hugo), "erase.me@example.com"), refused("forbidden"));
  assert.equal((await tickets.eraseCustomer(sql, asMember(camille), "erase.me@example.com")).tickets, 1);
  assert.equal(await tickets.byLink(sql, gone.secret), null);
});
