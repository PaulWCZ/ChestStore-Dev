import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/lib/app-error.ts";
import * as forms from "../src/lib/forms.ts";
import { take } from "../src/lib/respond.ts";
import { cleanRoutes, contactEvent, eventLimits, readRoutes, requestEvent, type ContactEvent, type RequestEvent } from "../src/lib/routes.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { form, opts, q } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, tom } from "./support/members.ts";

// An answer that also makes a contact in Clients or opens a ticket in
// Support: the form's author maps the questions (Settings), Forms publishes
// forms.contact / forms.request (the contract in lib/routes.ts and the
// README's "With the other tools"); the receivers come later.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  process.env["CHEST_TOOL"] = "forms";
  chest = await fakeChest({
    members: everyone,
    capabilities: ["members", "files", "notifications"],
    emits: ["forms.answered", "forms.contact", "forms.request"],
    receivers: 1,
    chest: { organization: "Atelier Martin" },
    network: {},
  });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (fn: () => unknown, code: string) => assert.throws(fn, (e: unknown) => e instanceof AppError && e.code === code, code);

const name = q("short", "Your name");
const mail = q("email", "Your email");
const phone = q("phone", "Your phone");
const company = q("short", "Your company");
const message = q("long", "Your message");
const topic = q("dropdown", "What is it about?", { options: opts("A quote", "An order") });
const lunch = q("yesno", "Lunch?");
const contactForm = form([name, mail, phone, company, topic, message, lunch], "Contact us");

test("the mapping: questions the form has, of the right kind; a contact needs an email or a phone, a public ticket an email", () => {
  const pub = { anonymous: false, audience: "public" as const };
  const routes = cleanRoutes({ contact: { name: name.id, email: mail.id, phone: name.id, company: "zzzzzzzz", message: message.id }, request: null }, contactForm, pub);
  // A short answer cannot give a phone; a question the form has not is left out.
  assert.deepEqual(routes.contact, { name: name.id, email: mail.id, phone: null, company: null, message: message.id });
  assert.equal(routes.request, null);
  refused(() => cleanRoutes({ contact: { name: name.id } }, contactForm, pub), "route_contact");
  refused(() => cleanRoutes({ request: { subject: topic.id, details: message.id } }, contactForm, pub), "route_request");
  // A team form's ticket comes from the member who answers.
  assert.deepEqual(cleanRoutes({ request: { subject: topic.id, details: message.id } }, contactForm, { anonymous: false, audience: "team" }).request, { subject: topic.id, details: message.id, email: null, name: null });
  // Never for an anonymous form.
  assert.deepEqual(cleanRoutes({ contact: { email: mail.id } }, contactForm, { anonymous: true, audience: "team" }), { contact: null, request: null });
  refused(() => cleanRoutes("contact", contactForm, pub), "invalid");
  // What the database holds is read defensively.
  assert.deepEqual(readRoutes({ contact: { email: "<x>" }, request: 3 }), { contact: { name: null, email: null, phone: null, company: null, message: null }, request: null });
});

test("forms.contact (v1): who to reach, the message, where it comes from; nothing without an email or a phone", () => {
  const f = { id: "7", anonymous: false };
  const answer = { id: "abcdefghijklmnop", createdAt: "2026-09-29T10:00:00.000Z", language: "fr", respondent: null, data: { [name.id]: "  Nina Roux ", [mail.id]: "Nina@Example.com", [company.id]: "Roux SARL", [message.id]: "Un devis pour six chaises.", [lunch.id]: true } };
  const route = { name: name.id, email: mail.id, phone: phone.id, company: company.id, message: message.id };
  const event = contactEvent(f, contactForm, answer, route) as ContactEvent;
  assert.deepEqual(event, {
    v: 1,
    form: { id: "7", title: "Contact us" },
    answer: { id: "abcdefghijklmnop", at: "2026-09-29T10:00:00.000Z", language: "fr", path: "/chest/forms/7/answers/abcdefghijklmnop" },
    contact: { name: "Nina Roux", email: "nina@example.com", phone: null, company: "Roux SARL" },
    message: "Un devis pour six chaises.",
    member: null,
  });
  // No way to reach them: no contact.
  assert.equal(contactEvent(f, contactForm, { ...answer, data: { [name.id]: "Nina" } }, route), null);
  // A phone alone is enough.
  assert.equal(contactEvent(f, contactForm, { ...answer, data: { [phone.id]: "+33 6 12 34 56 78" } }, route)?.contact.phone, "+33 6 12 34 56 78");
  // Never over the Chest's 16 KiB: the message gives way.
  const long = contactEvent(f, contactForm, { ...answer, data: { ...answer.data, [message.id]: "é".repeat(20000) } }, route)!;
  assert.ok(Buffer.byteLength(JSON.stringify(long)) <= eventLimits.bytes);
  assert.ok(long.message === null || [...long.message].length <= eventLimits.message);
  assert.equal(contactEvent({ ...f, anonymous: true }, contactForm, answer, route), null);
});

test("forms.request (v1): a subject (the answer, or the form's title), details, who asked, and the other answers in the reader's words", () => {
  const f = { id: "8", anonymous: false };
  const answer = { id: "ponmlkjihgfedcba", createdAt: "2026-09-29T11:00:00.000Z", language: "fr", respondent: null, data: { [mail.id]: "nina@example.com", [topic.id]: { ids: [topic.options![1]!.id] }, [message.id]: "Ma commande 1042 est arrivée abîmée.", [lunch.id]: false, [company.id]: "Roux SARL" } };
  const event = requestEvent(f, contactForm, answer, { subject: topic.id, details: message.id, email: mail.id, name: name.id }) as RequestEvent;
  assert.equal(event.subject, "An order");
  assert.equal(event.details, "Ma commande 1042 est arrivée abîmée.");
  assert.deepEqual(event.requester, { name: null, email: "nina@example.com", member: null });
  // Everything else that was answered, yes/no in the respondent's language.
  assert.deepEqual(event.fields.map(x => [x.label, x.value]), [["Your company", "Roux SARL"], ["Lunch?", "Non"]]);
  // No subject question: the form's title.
  assert.equal(requestEvent(f, contactForm, answer, { subject: null, details: message.id, email: mail.id, name: null })?.subject, "Contact us");
  // Nobody to answer: no ticket.
  assert.equal(requestEvent(f, contactForm, { ...answer, data: { [message.id]: "x" } }, { subject: null, details: message.id, email: mail.id, name: null }), null);
  // A team form: the member asks.
  assert.deepEqual(requestEvent(f, contactForm, { ...answer, respondent: hugo.id, data: { [message.id]: "Écran cassé" } }, { subject: null, details: message.id, email: null, name: null })?.requester, { name: null, email: null, member: hugo.id });
});

async function publishedForm(def: ReturnType<typeof form>, settings: Record<string, unknown>, owner = ines) {
  const { sql } = database;
  const audience = (settings["audience"] as "team" | undefined) ?? "public";
  const f = await forms.create(sql, asMember(owner), { definition: def, settings: { audience } });
  await forms.saveSettings(sql, asMember(owner), f.id, { audience, layout: "steps", accent: "berry", watchers: [owner.id], ...settings }, null);
  await forms.publish(sql, asMember(owner), f.id);
  return (await forms.bySlug(sql, f.slug))!;
}

test("an answer makes a contact and opens a ticket when the form says so, once each; Settings keep the mapping", async () => {
  const { sql } = database;
  const def = form([name, mail, topic, message], "Contact us");
  const routes = { contact: { name: name.id, email: mail.id, message: message.id }, request: { subject: topic.id, details: message.id, email: mail.id, name: name.id } };
  const { form: f } = await publishedForm(def, { routes });
  assert.deepEqual(f.routes.contact, { name: name.id, email: mail.id, phone: null, company: null, message: message.id });
  const before = chest.published.length;
  const answered = await take(sql, f, { version: f.version, answers: { [name.id]: "Nina Roux", [mail.id]: "nina@example.com", [topic.id]: { ids: [topic.options![0]!.id] }, [message.id]: "Six chaises en chêne." } }, null, "fr");
  assert.deepEqual(answered, { copy: false });
  const sent = chest.published.slice(before);
  assert.deepEqual(sent.map(e => e.type).sort(), ["forms.contact", "forms.request"]);
  const contact = sent.find(e => e.type === "forms.contact")!.data as ContactEvent;
  assert.deepEqual(contact.contact, { name: "Nina Roux", email: "nina@example.com", phone: null, company: null });
  const request = sent.find(e => e.type === "forms.request")!.data as RequestEvent;
  assert.equal(request.subject, "A quote");
  assert.equal(request.form.title, "Contact us");
  // An answer without an address: no contact, no ticket — the answer is kept.
  const quiet = await take(sql, f, { version: f.version, answers: { [name.id]: "Anonymous visitor", [topic.id]: { ids: [topic.options![1]!.id] }, [message.id]: "Hello" } }, null, "en");
  assert.deepEqual(quiet, { copy: false });
  assert.equal(chest.published.length, before + 2);
  // Off by default.
  const plain = await publishedForm(def, {});
  assert.deepEqual(plain.form.routes, { contact: null, request: null });
  await take(sql, plain.form, { version: plain.form.version, answers: { [mail.id]: "x@example.com" } }, null, "en");
  assert.equal(chest.published.length, before + 2);
});

test("a team form opens tickets for the member who answers; an anonymous form never routes; a wrong mapping is refused", async () => {
  const { sql } = database;
  const need = q("short", "What do you need?", { required: true });
  const details = q("long", "Details");
  const def = form([need, details], "IT request");
  const { form: f } = await publishedForm(def, { audience: "team", once: false, routes: { request: { subject: need.id, details: details.id } } }, camille);
  const before = chest.published.length;
  await take(sql, f, { version: f.version, answers: { [need.id]: "A charger", [details.id]: "Mine broke this morning." } }, asMember(tom), "en");
  const sent = chest.published.slice(before);
  assert.deepEqual(sent.map(e => e.type), ["forms.request"]);
  assert.deepEqual((sent[0]!.data as RequestEvent).requester, { name: null, email: null, member: tom.id });
  assert.equal((sent[0]!.data as RequestEvent).subject, "A charger");
  // Anonymous: the routes are dropped with the choice.
  const mood = q("rating", "Mood", { required: true });
  const anon = await publishedForm(form([mood, details], "Pulse"), { audience: "team", anonymous: true, routes: { request: { details: details.id } } }, camille);
  assert.deepEqual(anon.form.routes, { contact: null, request: null });
  // A contact with no way to reach the person is refused when saved.
  const other = await forms.create(sql, asMember(ines), { definition: form([name, mail], "Leads"), settings: { audience: "public" } });
  await assert.rejects(forms.saveSettings(sql, asMember(ines), other.id, { audience: "public", layout: "steps", accent: "berry", watchers: [], routes: { contact: { name: name.id } } }, null), (e: unknown) => e instanceof AppError && e.code === "route_contact");
});
