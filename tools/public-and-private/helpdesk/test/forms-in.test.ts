import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import { AppError } from "../lib/app-error.ts";
import { formsLimits, formsLink, readRequest } from "../lib/forms-in.ts";
import { limits } from "../lib/model.ts";
import * as rules from "../lib/rules.ts";
import * as tell from "../lib/tell.ts";
import * as tickets from "../lib/tickets.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

// Requests from Forms (Proposal (studio): events between tools): the event
// "forms.request", version 1 (Forms' README, "With the other tools"),
// delivered by the Chest to POST /chest-events, opens a ticket as the
// public form does — once per event and per answer, whatever it carries.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier.test", mailboxes: ["support"] }, settings: { company: "Atelier Martin", locale: "en", publicUrl: "https://support.atelier.test" } });
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
let n = 0;
// An event id of the Chest's shape (evt_ and 26 of a-z, 2-7), new each time.
const eventId = () => "evt_" + (++n).toString(32).replace(/[0-9]/gu, d => "abcdefghij"[Number(d)]!).padStart(26, "q");
const answerId = () => "k3ans" + String(++n).padStart(8, "0");
const request = (over: Record<string, unknown> = {}) => ({
  v: 1,
  form: { id: "5", title: "Contact us" },
  answer: { id: answerId(), at: "2026-09-29T10:00:00.000Z", language: "fr", path: "/chest/forms/5/answers/k3abc" },
  subject: "A quote",
  details: "Six oak chairs, delivered in October.",
  requester: { name: "Nina Roux", email: "Nina@Example.com", member: null },
  fields: [{ question: "q1dxyz", label: "Your phone number", value: "+33 6 12 34 56 78" }],
  ...over,
});
const deliver = (data: Record<string, unknown>, id?: string) => chest.deliver({ type: "forms.request", data, ...(id ? { id } : {}) }, POST);
const count = async () => (await database.sql<{ n: number }[]>`select count(*)::int as n from tickets`)[0]!.n;
const last = async () => (await database.sql<{ number: number }[]>`select number from tickets order by id desc limit 1`)[0]!.number;
const ticketOf = async (number: number) => tickets.ticket(database.sql, asMember(hugo), number);

test("a public form's request opens a ticket: the customer's address, the message, the source; confirmed by email, the team told", async () => {
  const before = await count();
  assert.equal(await deliver(request()), 204);
  assert.equal(await count(), before + 1);
  const t = await ticketOf(await last());
  assert.deepEqual([t.channel, t.status, t.customerEmail, t.customerName, t.language, t.subject, t.requester], ["forms", "open", "nina@example.com", "Nina Roux", "fr", "A quote", null]);
  assert.equal(t.messages.length, 1);
  assert.equal(t.messages[0]!.body, "Six oak chairs, delivered in October.\n\nYour phone number\u202f: +33 6 12 34 56 78", "the other answers, in the answer's language");
  assert.equal(t.messages[0]!.author, null);
  assert.equal(t.source?.form.title, "Contact us");
  assert.equal(t.source?.answer.path, "/chest/forms/5/answers/k3abc");
  assert.ok(t.waitingSince, "the customer waits for an answer");
  // Confirmed in the answer's language, with the follow-up link that opens it.
  const mail = chest.outbox.at(-1)!;
  assert.deepEqual(mail.to, ["nina@example.com"]);
  assert.match(mail.subject, /^Nous avons bien reçu votre demande/u);
  const secret = /https:\/\/support\.atelier\.test\/t\/([A-Za-z0-9_-]{32})/u.exec(mail.text)![1]!;
  assert.equal((await tickets.byLink(database.sql, secret))!.number, t.number);
  // Everyone who answers hears of it, in their language.
  const told = chest.notifications.filter(x => x.key === `ticket:${t.id}:new`);
  assert.deepEqual(told.map(x => x.member).sort(), [camille.id, hugo.id, ines.id].sort());
  assert.equal(told.find(x => x.member === hugo.id)!.title, "New request from Nina Roux");
});

test("the same event again, or another event for the same answer, opens nothing and tells no one twice", async () => {
  const data = request();
  const id = eventId();
  assert.equal(await deliver(data, id), 204);
  const number = await last();
  const total = await count();
  chest.notifications.splice(0);
  chest.outbox.splice(0);
  // The Chest delivers again (the same id): at least once.
  assert.equal(await deliver(data, id), 204);
  // Forms published again after a day (a new id, the same answer).
  assert.equal(await deliver(data), 204);
  // Two deliveries at once.
  const twin = request();
  const twinId = eventId();
  assert.deepEqual(await Promise.all([deliver(twin, twinId), deliver(twin, twinId)]), [204, 204]);
  assert.equal(await count(), total + 1, "only the new answer opened a ticket");
  assert.equal(await last(), number + 1);
  assert.equal(chest.outbox.length, 1, "one confirmation, for the new answer");
  assert.equal(chest.notifications.filter(x => x.key?.endsWith(":new")).length, 3);
  // Even once the Chest's journal of handled events is forgotten.
  await database.sql`delete from chest_events`;
  assert.equal(await deliver(data, id), 204);
  assert.equal(await count(), total + 1);
});

test("a team form's request comes from the colleague: their member id only, never a name or an address; no email", async () => {
  // Ines has Support: she is named; the address and name in the event are not kept.
  assert.equal(await deliver(request({ requester: { name: "Inès Moreau", email: "ines@company.test", member: ines.id }, answer: { id: answerId(), at: "2026-09-29T10:00:00.000Z", language: "en", path: null } })), 204);
  const number = await last();
  const t = await ticketOf(number);
  assert.deepEqual([t.channel, t.customerEmail, t.customerName, t.requester, t.language], ["forms", "", "", ines.id, "en"]);
  const [row] = await database.sql`select * from tickets where number = ${number}`;
  assert.ok(!JSON.stringify(row).includes("ines@company.test") && !JSON.stringify(row).includes("Inès"), "nothing of the colleague but their id");
  assert.equal(chest.outbox.length, 0, "no email to a colleague");
  assert.equal(chest.notifications.find(x => x.member === hugo.id && x.key === `ticket:${t.id}:new`)!.title, "New request from Inès Moreau");
  // Someone without Support: "a colleague".
  const stranger = "mbr_" + "s".repeat(26);
  assert.equal(await deliver(request({ requester: { name: null, email: null, member: stranger } })), 204);
  const other = await ticketOf(await last());
  assert.equal(other.requester, stranger);
  assert.equal(chest.notifications.find(x => x.member === hugo.id && x.key === `ticket:${other.id}:new`)!.title, "New request from A colleague");
  // Answered: Ines hears of it in the bell (she has Support).
  const done = await tickets.reply(database.sql, asMember(hugo), number, "On it.");
  assert.equal(done.ticket.requester, ines.id);
  await tell.colleagueAnswered(done.ticket, asMember(hugo));
  assert.ok(chest.notifications.some(x => x.member === ines.id && x.key === `ticket:${t.id}:answered`));
  // Their other requests are theirs, not every colleague's.
  assert.deepEqual((await ticketOf(number)).others.map(o => o.number), []);
  // No address to correct; never merged with another colleague's request.
  await assert.rejects(tickets.setCustomer(database.sql, asMember(hugo), number, { email: "ines@company.test", name: "Ines" }), refused("forbidden"));
  await assert.rejects(tickets.merge(database.sql, asMember(hugo), other.number, number), refused("merge_other_customer"));
  // Erased: the request stays, no longer theirs.
  const erasure = "era_" + "e".repeat(26);
  assert.equal(await chest.emit({ type: "member.erased", data: { id: ines.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } }, POST), 204);
  assert.equal((await ticketOf(number)).requester, "erased");
});

test("the rules on arrival run on a request from Forms, as on the public form", async () => {
  const answers = async (id: string) => [hugo.id, ines.id, camille.id].includes(id);
  const rule = await rules.saveRule(database.sql, asMember(camille), { field: "text", value: "facture", tag: "Invoice", priority: "high", assignee: hugo.id }, answers);
  assert.equal(await deliver(request({ subject: "Ma facture", requester: { name: "Paul", email: "paul@example.com", member: null } })), 204);
  const t = await ticketOf(await last());
  assert.deepEqual([t.priority, t.assignee, t.tags.map(g => g.name)], ["high", hugo.id, ["Invoice"]]);
  assert.deepEqual(chest.notifications.filter(x => x.key === `ticket:${t.id}:new`).map(x => x.member), [hugo.id], "only the one a rule gave it to");
  await rules.removeRule(database.sql, asMember(camille), rule.id);
});

test("untrusted data: nobody to answer, another shape, or nonsense opens nothing; texts bounded and cleaned", async () => {
  const total = await count();
  const ignored = [
    request({ requester: { name: "Nina", email: null, member: null } }),
    request({ requester: { name: "Nina", email: "not an address", member: null } }),
    request({ requester: { name: "Nina", email: "a@b", member: "mbr_NOTANID" } }),
    request({ requester: "nina@example.com" }),
    request({ v: 0 }),
    request({ v: "1" }),
    request({ form: { id: "5", title: "   " } }),
    request({ form: { id: "5; drop table tickets", title: "Contact" } }),
    request({ answer: { id: "../../x", language: "fr" } }),
    { v: 1 },
  ];
  for (const data of ignored) assert.equal(await deliver(data as Record<string, unknown>), 204);
  assert.equal(await count(), total, "nothing opened, and the Chest is not asked to deliver again");
  // Too long, invisible characters, a link back of another shape (within
  // the 64 KiB a delivery may carry).
  const huge = "x".repeat(12000);
  assert.equal(await deliver(request({
    subject: "Hello\u202e\u0007 there\n\nfriend " + huge.slice(0, 3000),
    details: "Line one\u0000\r\nLine two " + huge,
    requester: { name: "N".repeat(500), email: " Nina@Example.com ", member: null },
    answer: { id: answerId(), language: "de", path: "https://evil.example/steal" },
    fields: Array.from({ length: 30 }, (_, i) => ({ question: "q", label: "Question " + i + " " + "l".repeat(250), value: "v".repeat(1100) })),
  })), 204);
  const t = await ticketOf(await last());
  assert.equal([...t.subject].length, limits.subject);
  assert.ok(t.subject.startsWith("Hello there friend x"), "one line, no control or direction characters");
  assert.equal(t.customerName.length, limits.name);
  assert.equal(t.customerEmail, "nina@example.com");
  assert.equal(t.language, "en", "an unknown language: the Chest's");
  assert.equal(t.source?.answer.path, null, "never a link elsewhere");
  const body = t.messages[0]!.body;
  assert.ok([...body].length <= limits.body);
  assert.ok(body.startsWith("Line one\nLine two x"));
  assert.ok(!body.includes("\u0000"));
  assert.ok(body.split("\n\n")[0]!.length <= formsLimits.details);
  // A subject left out: the form's title.
  assert.equal(await deliver(request({ subject: null, details: null, fields: [] })), 204);
  const plain = await ticketOf(await last());
  assert.equal(plain.subject, "Contact us");
  assert.equal(plain.messages[0]!.body, "—");
});

test("readRequest: a team form's member wins over an address; paths of the Chest only", () => {
  const read = (data: Record<string, unknown>) => readRequest({ id: "evt_x", data }, "en");
  const team = read(request({ requester: { name: "Inès", email: "ines@company.test", member: ines.id } }))!;
  assert.deepEqual([team.member, team.email, team.name], [ines.id, null, ""]);
  for (const path of ["/chest/forms/../x", "//evil.example/x", "/chest/forms/5?x=1", "/other/5", "/chest"]) {
    assert.equal(read(request({ answer: { id: "k3", language: "en", path } }))!.source.answer.path, null, path);
  }
  assert.equal(read(request({ answer: { id: "k3", language: "en", path: "/chest/forms/5/answers/k3" } }))!.source.answer.path, "/chest/forms/5/answers/k3");
});

test("the link back to the answer: Forms' address as the Chest gives it, none while Forms is not installed", async () => {
  const path = "/chest/forms/5/answers/k3abc";
  // This fake Chest has no Forms: the ticket names the form without a link.
  assert.equal(formsLink(path), null);
  const withForms = await fakeChest({ tools: { forms: true }, settings: { publicUrl: "https://support.atelier.test" } });
  try {
    assert.equal(formsLink(path), "https://forms-chest.chest.test/chest/forms/5/answers/k3abc");
    assert.equal(formsLink(null), null);
    assert.equal(formsLink("/chest/../x"), null);
    assert.equal(formsLink("/f/contact"), null, "only an answer's page on Forms' team host");
    assert.equal(formsLink("//evil.example/chest"), null);
    // Forms at a custom domain: the stored path follows it.
    withForms.installTool("forms", { team: "https://forms.atelier-martin.fr" });
    assert.equal(formsLink(path), "https://forms.atelier-martin.fr/chest/forms/5/answers/k3abc");
    // Removed from the Chest: no link (never a dead one).
    withForms.removeTool("forms");
    assert.equal(formsLink(path), null);
  } finally {
    await withForms.close();
  }
});
