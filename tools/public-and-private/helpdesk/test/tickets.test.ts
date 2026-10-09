import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, shownTo, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/lib/app-error.ts";
import * as attachments from "../src/lib/attachments.ts";
import * as mailer from "../src/lib/mailer.ts";
import * as tell from "../src/lib/tell.ts";
import * as tickets from "../src/lib/tickets.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier.test" } });
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
  await assert.rejects(tickets.fromForm(sql, form({ email: "Nina <nina@example.com>" })), refused("invalid_email"));
  await assert.rejects(tickets.fromForm(sql, form({ email: "nina@[192.0.2.1]" })), refused("invalid_email"));
  await assert.rejects(tickets.fromForm(sql, form({ email: "nina..roux@example.com" })), refused("invalid_email"));
  await assert.rejects(tickets.fromForm(sql, form({ email: "  " })), refused("empty"));
  // The part before the @ as typed, the domain lower-cased.
  const typed = await tickets.fromForm(sql, form({ email: " Nina.Roux@Example.COM ", subject: "Typed" }));
  assert.equal((await tickets.byLink(sql, typed.secret))?.customerEmail, "Nina.Roux@example.com");
  await assert.rejects(tickets.fromForm(sql, form({ message: " " })), refused("empty"));
  await assert.rejects(tickets.fromForm(sql, form({ message: "x".repeat(10001) })), refused("too_long"));
});

test("a request's link is counted per hour and per use: a flood on one link never touches another, and the count frees itself", async () => {
  const { sql } = database;
  const one = await tickets.fromForm(sql, form());
  const two = await tickets.fromForm(sql, form({ email: "two@example.com" }));
  const at = new Date("2026-10-06T10:15:00Z");
  for (let i = 0; i < tickets.publicLimits.downloadsPerLink; i++) await tickets.linkGuard(sql, one.id, "download", at);
  await assert.rejects(tickets.linkGuard(sql, one.id, "download", at), refused("limit"));
  await assert.rejects(tickets.linkGuard(sql, one.id, "download", at), refused("limit"));
  // Another use of the same link, another link: their own counts.
  await tickets.linkGuard(sql, one.id, "file", at);
  await tickets.linkGuard(sql, two.id, "download", at);
  // A refusal is not counted, and a count given back is free again; the
  // next hour the link takes its full count again.
  const counted = await tickets.linkGuard(sql, two.id, "file", at);
  await counted.release();
  const next = new Date("2026-10-06T11:00:00Z");
  for (let i = 0; i < tickets.publicLimits.downloadsPerLink; i++) await tickets.linkGuard(sql, one.id, "download", next);
  await assert.rejects(tickets.linkGuard(sql, one.id, "download", next), refused("limit"));
});

test("a Chest that takes no visitors' files: the public pages know it before offering any, a grant says so plainly", async () => {
  const { sql } = database;
  assert.equal(await attachments.publicUploadsOn(), false);
  await assert.rejects(attachments.visitorGrant(sql, {}, "image/png", 10), refused("files_off"));
});

test("replies go by email, in the customer's language, with the link of their request page; without mail, on the page only", async () => {
  const { sql } = database;
  const t = await tickets.fromForm(sql, form());
  const ticket = (await tickets.byLink(sql, t.secret))!;
  const first = await mailer.confirm(ticket, `https://helpdesk.atelier.test/t/${t.secret}`, "Atelier Martin");
  assert.equal(first.delivery, "email");
  assert.match(chest.outbox[0]!.subject, /^Nous avons bien reçu votre demande\u202f: Broken lamp \[#\d+\]$/u);
  assert.match(chest.outbox[0]!.text, new RegExp(t.secret));
  const done = await tickets.reply(sql, asMember(ines), t.number, "Sorry! A new one is on its way.");
  assert.equal(done.ticket.status, "waiting");
  assert.equal(done.ticket.assignee, ines.id);
  const sent = await mailer.answer(done.ticket, "Sorry! A new one is on its way.", asMember(ines), "Atelier Martin", "https://support.atelier.test/t/link", done.messageId);
  assert.equal(sent.delivery, "email");
  assert.equal(chest.outbox[1]!.replyTo, "contact@atelier.test", "replies go to the company's usual inbox");
  assert.equal(chest.outbox[1]!.fromName, "Inès — Atelier Martin");
  assert.match(chest.outbox[1]!.subject, /^Re: Broken lamp \[#\d+\]$/u);
  await assert.rejects(tickets.reply(sql, asMember(lea), t.number, "No"), refused("forbidden"));
  // A Chest without mail: nothing sent, the answer is on the page.
  const bare = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["members"] });
  try {
    assert.deepEqual(await mailer.answer(done.ticket, "…", asMember(ines), "", "https://support.atelier.test/t/link", "1"), { delivery: "page" });
  } finally {
    await bare.close();
  }
});

test("the inbox: folders, search, assignment to people who answer, the bell and the tile", async () => {
  const { sql } = database;
  const t = await tickets.fromForm(sql, form({ email: "zoe@example.com", subject: "Where is my parcel", message: "Tracking number 4471" }));
  await tell.newTicket({ id: t.id, number: t.number, subject: "Where is my parcel", customerName: "Zoé", customerEmail: "zoe@example.com" }, "Tracking number 4471");
  assert.deepEqual(chest.notifications.map(n => n.member).sort(), [camille.id, hugo.id, ines.id].sort());
  assert.ok(chest.notifications.some(n => n.member === ines.id && shownTo(n, "fr").title === "Nouvelle demande de Zoé"));
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
  // An address stored under an older, looser rule is erased all the same.
  await sql`update tickets set customer_email = 'old..rule@example.com' where number = ${(await tickets.fromForm(sql, form({ email: "later@example.com" }))).number}`;
  assert.equal((await tickets.eraseCustomer(sql, asMember(camille), "Old..Rule@example.com")).tickets, 1);
});
