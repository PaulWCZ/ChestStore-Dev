import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import * as activities from "../lib/activities.ts";
import * as companies from "../lib/companies.ts";
import * as contacts from "../lib/contacts.ts";
import { formKey, readFormContact } from "../lib/from-forms.ts";
import { catalogue, format } from "../lib/i18n/index.ts";
import { answerLink, withWhen } from "../lib/page-data.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo } from "./support/members.ts";

// Forms → Clients: `forms.contact` (v1, Forms' README "With the other
// tools") finds or makes the contact and writes one line of its history,
// once per event.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});

let answers = 0;
const contact = (extra: { contact?: Record<string, unknown>; message?: string | null; form?: Record<string, unknown>; answer?: Record<string, unknown>; v?: unknown } = {}) => {
  answers++;
  const id = `k3answer${String(answers).padStart(8, "0")}`;
  return {
    v: extra.v ?? 1,
    form: { id: "5", title: "Contact us", ...extra.form },
    answer: { id, at: "2026-09-29T10:00:00.000Z", language: "fr", path: `/chest/forms/5/answers/${id}`, ...extra.answer },
    contact: { name: "Nina Roux", email: "nina@example.com", phone: null, company: null, ...extra.contact },
    message: extra.message === undefined ? "Six oak chairs, please." : extra.message,
    member: null,
  };
};
const told = (data: Record<string, unknown>, id?: string) => chest.deliver({ type: "forms.contact", source: "forms", data, ...(id ? { id } : {}) }, POST);
const byEmail = async (address: string) => (await database.sql<{ id: string }[]>`select id from contacts where lower(email) = ${address}`).map(r => String(r.id));
const formLines = async (contactId: string) => (await activities.timeline(database.sql, { contactId })).filter(a => a.kind === "form");

test("a new person: a contact of nobody's, at the company of that name (added), one line of history with the message; the managers are told", async () => {
  const { sql } = database;
  const data = contact({ contact: { name: "Nina Roux", email: "Nina.Roux@Example.com", phone: "+33 6 12 34 56 78", company: "Roux SARL" } });
  assert.equal(await told(data), 204);
  const [id] = await byEmail("nina.roux@example.com");
  assert.ok(id);
  const c = await contacts.contact(sql, asMember(camille), id);
  assert.equal(c.name, "Nina Roux");
  assert.equal(c.email, "nina.roux@example.com");
  assert.equal(c.phone, "+33 6 12 34 56 78");
  assert.equal(c.owner, null, "unassigned: nobody imported it");
  assert.equal(c.company?.name, "Roux SARL");
  assert.equal(c.lastContact, "2026-09-29T10:00:00.000Z", "in touch the day of the answer");
  assert.equal((await companies.company(sql, asMember(camille), c.company!.id)).owner, null);
  const history = await activities.timeline(sql, { contactId: id });
  assert.deepEqual(history.map(a => a.kind), ["form", "created"]);
  assert.equal(history[0]!.body, "Six oak chairs, please.");
  assert.equal(history[0]!.at, "2026-09-29T10:00:00.000Z");
  assert.deepEqual(history[0]!.data, { event: history[0]!.data["event"], formId: "5", form: "Contact us", answer: data.answer.id, path: data.answer.path });
  assert.deepEqual(history[1]!.data, { form: "Contact us" });
  // The company's page shows the line too.
  assert.ok((await activities.timeline(sql, { companyId: c.company!.id })).some(a => a.kind === "form"));
  // Camille, the manager, is told in French (the Chest writes a bell's
  // narrow spaces as plain ones).
  const bell = chest.notifications.filter(n => n.key === formKey("5", data.answer.id));
  assert.deepEqual(bell.map(n => [n.member, n.title, n.body, n.path]), [[camille.id, "Nouveau contact : Nina Roux a rempli le formulaire « Contact us »", "Six oak chairs, please.", `/chest/contacts/${id}`]]);
});

test("the line reads in each reader's language", () => {
  assert.equal(format(catalogue("en").timeline.form, { form: "Contact us" }), "Filled in the form “Contact us”");
  assert.equal(format(catalogue("fr").timeline.form, { form: "Contact us" }), "A rempli le formulaire « Contact us »");
  assert.equal(format(catalogue("en").timeline.createdForm, { form: "Contact us" }), "Added from the form “Contact us”");
});

test("the same event delivered again (the same id), or the same answer published again: never a second contact nor a second line", async () => {
  const data = contact({ contact: { email: "twice@example.com", name: "Twice" } });
  const id = "evt_" + "t".repeat(26);
  assert.equal(await told(data, id), 204);
  assert.equal(await told(data, id), 204);
  // Past the Chest's own memory of handled ids (another id, same answer).
  assert.equal(await told(data), 204);
  const ids = await byEmail("twice@example.com");
  assert.equal(ids.length, 1);
  assert.equal((await formLines(ids[0]!)).length, 1);
  assert.equal(chest.notifications.filter(n => n.key === formKey("5", data.answer.id)).length, 1);
  // Two deliveries at the same moment: one line all the same.
  const again = contact({ contact: { email: "twice@example.com" } });
  // (A handler that fails makes the route fail: the Chest reads a 500.)
  const both = await Promise.all([told(again, "evt_" + "u".repeat(26)).catch(() => 500), told(again, "evt_" + "u".repeat(26)).catch(() => 500)]);
  assert.ok(both.includes(204), "one of them handled: " + both.join(","));
  if (both.some(s => s !== 204)) assert.equal(await told(again, "evt_" + "u".repeat(26)), 204, "the one refused comes again and finds the first");
  assert.equal((await formLines(ids[0]!)).length, 2);
});

test("a known person, by email whatever its case: their contact, their owner told; what the team wrote stays, only the empty is filled in", async () => {
  const { sql } = database;
  const co = await companies.addCompany(sql, asMember(hugo), { name: "Menuiserie Blanc" });
  const known = await contacts.addContact(sql, asMember(hugo), { name: "Julie Blanc (owner)", email: "julie@blanc.test", company: co.id });
  const data = contact({ contact: { name: "julie", email: "JULIE@blanc.test", phone: "06 11 22 33 44", company: "Another Co" }, message: "Call me back." });
  assert.equal(await told(data), 204);
  assert.deepEqual(await byEmail("julie@blanc.test"), [known.id]);
  const c = await contacts.contact(sql, asMember(camille), known.id);
  assert.equal(c.name, "Julie Blanc (owner)", "the team's name stays");
  assert.equal(c.phone, "06 11 22 33 44", "an empty phone is filled in");
  assert.equal(c.company?.name, "Menuiserie Blanc", "the company stays");
  assert.equal(c.owner, hugo.id);
  assert.equal((await formLines(known.id))[0]?.body, "Call me back.");
  assert.equal((await sql`select 1 from companies where name = 'Another Co'`).length, 0, "no company made for a known person who has one");
  const bell = chest.notifications.filter(n => n.key === formKey("5", data.answer.id));
  assert.deepEqual(bell.map(n => [n.member, n.title]), [[hugo.id, "Julie Blanc (owner) filled in the form “Contact us”"]]);
});

test("a known person by phone, spaced or international; a company found by name, accents and case aside", async () => {
  const { sql } = database;
  const co = await companies.addCompany(sql, asMember(hugo), { name: "Boulangerie Durand" });
  const known = await contacts.addContact(sql, asMember(hugo), { name: "Paul Durand", phone: "04 78 42 16 90" });
  assert.equal(await told(contact({ contact: { name: "P. Durand", email: null, phone: "+33 4 78 42 16 90", company: "BOULANGERIE DURAND" } })), 204);
  const c = await contacts.contact(sql, asMember(camille), known.id);
  assert.equal((await formLines(known.id)).length, 1);
  assert.equal(c.phone, "04 78 42 16 90", "the phone as the team wrote it");
  assert.equal(c.company?.id, co.id, "a contact without a company gets the one of that name");
  // A new person at a known company: that company, not a second one.
  assert.equal(await told(contact({ contact: { name: "Anne Durand", email: "anne@durand.test", company: "boulangérie durand" } })), 204);
  const [anne] = await byEmail("anne@durand.test");
  assert.equal((await contacts.contact(sql, asMember(camille), anne!)).company?.id, co.id);
  assert.equal((await sql`select 1 from companies where crm_fold(name) = crm_fold('Boulangerie Durand')`).length, 1);
});

test("a phone only: a contact named by it when no name was given; no message, no body", async () => {
  const { sql } = database;
  assert.equal(await told(contact({ contact: { name: null, email: null, phone: "07 00 11 22 33" }, message: null })), 204);
  const [row] = await sql<{ id: string; name: string }[]>`select id, name from contacts where phone = '07 00 11 22 33'`;
  assert.equal(row?.name, "07 00 11 22 33");
  const [line] = await formLines(String(row!.id));
  assert.equal(line?.body, "");
});

test("what is not a contact is accepted and ignored: another version's shape, no email nor phone, a wrong address, unknown ids", async () => {
  const { sql } = database;
  const before = (await sql<{ n: number }[]>`select count(*)::int as n from contacts`)[0]!.n;
  for (const data of [
    contact({ v: "1" }),
    contact({ contact: { email: null, phone: null } }),
    contact({ contact: { email: "not an address", phone: null } }),
    contact({ contact: { email: null, phone: "call me" } }),
    contact({ form: { id: "../5" } }),
    contact({ answer: { id: "" } }),
    { v: 1 },
  ]) assert.equal(await told(data as Record<string, unknown>), 204);
  assert.equal((await sql<{ n: number }[]>`select count(*)::int as n from contacts`)[0]!.n, before);
  // A later version adds fields: still read.
  assert.ok(readFormContact({ id: "evt_x", data: { ...contact(), v: 2, extra: { anything: true } } }));
});

test("reading bounds what it keeps: names cut, control characters out, an answer from the future is dated now, a path must be one", () => {
  const now = new Date("2026-09-29T12:00:00.000Z");
  const c = readFormContact({ id: "evt_y", data: contact({ contact: { name: "Nina‮ Roux\u0000 " + "x".repeat(300), email: "nina@example.com" }, answer: { at: "2030-01-01T00:00:00.000Z", path: "javascript:alert(1)" }, message: "Line one\r\nLine two\u0007" }) }, now)!;
  assert.equal([...c.name].length, 160);
  assert.ok(c.name.startsWith("Nina Roux x"), c.name.slice(0, 20));
  assert.equal(c.answer.at.toISOString(), now.toISOString());
  assert.equal(c.answer.path, "");
  assert.equal(c.message, "Line one\nLine two");
});

test("a signature that is not the Chest's is refused, and nothing is made", async () => {
  const { sql } = database;
  const before = (await sql<{ n: number }[]>`select count(*)::int as n from contacts`)[0]!.n;
  const forged = new Request("http://tool.test/chest-events", { method: "POST", headers: { "Content-Type": "application/json", "Chest-Event": "forged" }, body: JSON.stringify({ id: "evt_" + "f".repeat(26), type: "forms.contact", source: "forms", occurredAt: new Date().toISOString(), data: contact({ contact: { email: "forged@example.com" } }) }) });
  assert.equal((await POST(forged)).status, 401);
  assert.equal((await sql<{ n: number }[]>`select count(*)::int as n from contacts`)[0]!.n, before);
});

test("the person's data stays theirs: deleting the contact (GDPR) takes the form's line with it; their export holds it", async () => {
  const { sql } = database;
  assert.equal(await told(contact({ contact: { name: "Gone Soon", email: "gone@example.com" }, message: "Private words" })), 204);
  const [id] = await byEmail("gone@example.com");
  const exported = await contacts.exportContact(sql, asMember(camille), id);
  assert.ok(exported.activities.some(a => a.kind === "form" && a.body === "Private words"));
  await contacts.deleteContact(sql, asMember(camille), id);
  assert.equal((await sql`select 1 from activities where body = 'Private words'`).length, 0);
});

test("the line links to the answer in Forms, made when the page is shown from the stored path; no link while Forms is not installed", async () => {
  const data = contact({ contact: { name: "Léa Martin", email: "lea.linked@example.com" } });
  assert.equal(await told(data), 204);
  const [id] = await byEmail("lea.linked@example.com");
  const [line] = await formLines(id!);
  assert.equal(line!.data["path"], `/chest/forms/5/answers/${data.answer.id}`, "the path is kept, never an address");
  // This fake Chest has no Forms: the form is named without a link.
  assert.equal(withWhen([line!], "en")[0]!.link, null);
  chest.installTool("forms");
  try {
    assert.equal(withWhen([line!], "en")[0]!.link, `https://forms-chest.chest.test/chest/forms/5/answers/${data.answer.id}`);
    // Forms at a custom domain: the same stored line follows it.
    chest.installTool("forms", { team: "https://forms.atelier-martin.fr" });
    assert.equal(answerLink(line!), `https://forms.atelier-martin.fr/chest/forms/5/answers/${data.answer.id}`);
    // Only a "form" line, only a path Forms' team host would open.
    const [created] = (await activities.timeline(database.sql, { contactId: id! })).filter(a => a.kind === "created");
    assert.equal(answerLink(created!), null);
    assert.equal(answerLink({ kind: "form", data: { path: "" } }), null, "an answer that came without a path");
    assert.equal(answerLink({ kind: "form", data: { path: "/f/contact" } }), null, "not under /chest");
    assert.equal(answerLink({ kind: "form", data: { path: "//evil.example/chest" } }), null);
    assert.equal(answerLink({ kind: "form", data: { path: "/chest/../admin" } }), null);
    assert.equal(answerLink({ kind: "form", data: { path: 5 } }), null);
  } finally {
    chest.removeTool("forms");
  }
  // Removed from the Chest: no link again.
  assert.equal(answerLink(line!), null);
});
