import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { onEvent as POST } from "../src/lib/deliveries.ts";
import * as activities from "../src/lib/activities.ts";
import * as companies from "../src/lib/companies.ts";
import * as contacts from "../src/lib/contacts.ts";
import { formKey, readFormContact, sameName } from "../src/lib/from-forms.ts";
import { dismissLead, formLinesToCheck, keepApart, leads, markChecked, maybeSame, moveLine, restoreLead, takeLead } from "../src/lib/leads.ts";
import { catalogue, format } from "../src/i18n/index.ts";
import { answerLink, withWhen } from "../src/lib/page-data.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora } from "./support/members.ts";

// Forms → Clients: `forms.contact` (v1, Forms' README "With the other
// tools") finds or makes the contact and writes one line of its history,
// once per event.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ network: {}, members: everyone });
  database = await testDatabase();
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
  const data = contact({ contact: { name: "Nina Roux", email: "Nina.Roux@Example.com", phone: "+33 6 98 76 54 32", company: "Roux SARL" } });
  assert.equal(await told(data), 204);
  const [id] = await byEmail("nina.roux@example.com");
  assert.ok(id);
  const c = await contacts.contact(sql, asMember(camille), id);
  assert.equal(c.name, "Nina Roux");
  assert.equal(c.email, "nina.roux@example.com");
  assert.equal(c.phone, "+33 6 98 76 54 32");
  assert.equal(c.owner, null, "unassigned: nobody imported it");
  assert.equal(c.company?.name, "Roux SARL");
  assert.equal(c.lastContact, "2026-09-29T10:00:00.000Z", "in touch the day of the answer");
  assert.equal((await companies.company(sql, asMember(camille), c.company!.id)).owner, null);
  const history = await activities.timeline(sql, { contactId: id });
  assert.deepEqual(history.map(a => a.kind), ["form", "created"]);
  assert.equal(history[0]!.body, "Six oak chairs, please.");
  assert.equal(history[0]!.at, "2026-09-29T10:00:00.000Z");
  assert.deepEqual(history[0]!.data, { event: history[0]!.data["event"], formId: "5", form: "Contact us", answer: data.answer.id, path: data.answer.path, who: { name: "Nina Roux", email: "nina.roux@example.com", phone: "+33 6 98 76 54 32", company: "Roux SARL" } });
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

test("a known person by phone and the same name (accents, case and word order aside), spaced or international; a company found by name, accents and case aside", async () => {
  const { sql } = database;
  const co = await companies.addCompany(sql, asMember(hugo), { name: "Boulangerie Durand" });
  const known = await contacts.addContact(sql, asMember(hugo), { name: "Paul Durand", phone: "04 78 42 16 90" });
  assert.equal(await told(contact({ contact: { name: "DURAND Paul", email: null, phone: "+33 4 78 42 16 90", company: "BOULANGERIE DURAND" } })), 204);
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

test("names compare as people write them", () => {
  assert.ok(sameName("Nina Roux", "nina roux"));
  assert.ok(sameName("Hélène Lefèvre", "HELENE LEFEVRE"));
  assert.ok(sameName("Roux, Nina", "Nina Roux"));
  assert.ok(!sameName("Nina Roux", "Claire Durand"));
  assert.ok(!sameName("P. Durand", "Paul Durand"), "an initial is not a name: a person checks");
  assert.ok(!sameName("", ""), "no name is nobody's");
});

// Round 3's blocker (critique of 2026-09-29), with Forms' real event: a
// visitor whose phone is a client's (a switchboard, a shared shop line, a
// mistyped digit) was filed in that client's history.
test("privacy: Nina Roux's answer, whose phone is Claire Durand's, is never filed on Claire — a new contact, marked as maybe the same person, and her own second answer finds her", async () => {
  const { sql } = database;
  const claire = await contacts.addContact(sql, asMember(hugo), { name: "Claire Durand", email: "claire.durand@atelier-durand.fr", phone: "06 12 34 56 78" });
  const nina = {
    v: 1,
    form: { id: "101", title: "Contactez-nous" },
    answer: { id: "s54tfe3tahshinv1", at: "2026-09-29T20:45:27.301Z", language: "fr", path: "/chest/forms/101/answers/s54tfe3tahshinv1" },
    contact: { name: "Nina Roux", email: "nina.roux@gmail.com", phone: "06 12 34 56 78", company: null },
    message: "Bonjour, je voudrais un devis pour six chaises en chêne.\nMerci",
    member: null,
  };
  assert.equal(await told(nina), 204);
  assert.equal((await formLines(claire.id)).length, 0, "nothing of Nina's in Claire's file");
  const [ninaId] = await byEmail("nina.roux@gmail.com");
  assert.ok(ninaId, "Nina is a contact of her own");
  const made = await contacts.contact(sql, asMember(camille), ninaId!);
  assert.equal(made.name, "Nina Roux");
  assert.equal(made.phone, "06 12 34 56 78");
  assert.equal(made.owner, null);
  assert.deepEqual(await maybeSame(sql, ninaId!), { id: claire.id, name: "Claire Durand", phone: "06 12 34 56 78" });
  const [line] = await formLines(ninaId!);
  assert.equal(line!.body, "Bonjour, je voudrais un devis pour six chaises en chêne.\nMerci");
  assert.deepEqual(line!.data["who"], { name: "Nina Roux", email: "nina.roux@gmail.com", phone: "06 12 34 56 78", company: "" });
  // Claire's owner is not told; the managers are, of a new contact that
  // may be Claire.
  const bell = chest.notifications.filter(n => n.key === formKey("101", "s54tfe3tahshinv1"));
  assert.deepEqual(bell.map(n => [n.member, n.title, n.body]), [[camille.id, "Nouveau contact : Nina Roux a rempli le formulaire « Contactez-nous »", "Peut-être la même personne que Claire Durand (même téléphone) : vérifiez avant d’appeler. Bonjour, je voudrais un devis pour six chaises en chêne. Merci"]], "(the bell writes a message on one line)");
  // She is a lead in My day.
  assert.ok((await leads(sql, asMember(hugo))).rows.some(l => l.id === ninaId && l.maybe?.name === "Claire Durand"));

  // Her second answer, from her work address and her company, same phone:
  // the same name at that number — Nina, never Claire.
  const second = { ...nina, answer: { ...nina.answer, id: "second0000000002", at: "2026-10-01T08:00:00.000Z", path: "/chest/forms/101/answers/second0000000002" }, contact: { ...nina.contact, email: "n.roux@roux-menuiserie.fr", company: "Roux Menuiserie" }, message: "Finalement 8 chaises, livraison avant Noël ?" };
  assert.equal(await told(second), 204);
  assert.equal((await formLines(claire.id)).length, 0);
  assert.equal((await formLines(ninaId!)).length, 2);
  assert.equal((await contacts.contact(sql, asMember(camille), ninaId!)).email, "nina.roux@gmail.com", "the address the team has stays");
  // The other address is on the line, and a manager is asked to check it.
  const check = await formLinesToCheck(sql, asMember(camille));
  const listed = check.rows.find(r => r.contact.id === ninaId);
  assert.equal(listed?.why, "email");
  assert.equal(listed?.who?.email, "n.roux@roux-menuiserie.fr");
  await assert.rejects(formLinesToCheck(sql, asMember(hugo)), /forbidden/u, "a salesperson does not check");

  // Nobody's data leaks by erasure: deleting Claire leaves Nina's words.
  await contacts.deleteContact(sql, asMember(camille), claire.id);
  assert.equal((await formLines(ninaId!)).length, 2);
  assert.equal(await maybeSame(sql, ninaId!), null, "the mark goes with Claire");
});

test("the same phone, no name given: a new contact marked as maybe the other, never filed on them", async () => {
  const { sql } = database;
  const shop = await contacts.addContact(sql, asMember(hugo), { name: "Standard Menuiserie Blanc", phone: "01 45 00 00 00" });
  assert.equal(await told(contact({ contact: { name: null, email: null, phone: "01 45 00 00 00" }, message: "Rappelez-moi" })), 204);
  assert.equal((await formLines(shop.id)).length, 0);
  const [row] = await sql<{ id: string; maybe_same: string | null }[]>`select id, maybe_same from contacts where phone = '01 45 00 00 00' and id <> ${shop.id}`;
  assert.equal(String(row!.maybe_same), shop.id);
  // "Not the same person": the mark goes.
  await keepApart(sql, asMember(hugo), row!.id);
  assert.equal(await maybeSame(sql, String(row!.id)), null);
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
    chest.installTool("forms", { teamUrl: "https://forms.atelier-martin.fr" });
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

test("leads: a contact a form made waits in My day until taken, given or set aside; each role's rights", async () => {
  const { sql } = database;
  assert.equal(await told(contact({ contact: { name: "Lead One", email: "lead.one@example.com", company: "Lead Co" } })), 204);
  assert.equal(await told(contact({ contact: { name: "Lead Two", email: "lead.two@example.com" } })), 204);
  const [one] = await byEmail("lead.one@example.com");
  const [two] = await byEmail("lead.two@example.com");
  const inbox = await leads(sql, asMember(hugo));
  assert.ok(inbox.rows.some(l => l.id === one && l.company === "Lead Co" && l.form === "Contact us" && l.message === "Six oak chairs, please."));
  // A viewer reads, never takes; a member without a role reads nothing.
  await assert.rejects(takeLead(sql, asMember(lea), one), /forbidden/u);
  await assert.rejects(leads(sql, asMember(nora)), /forbidden/u);
  // Hugo takes it: his, with the company the form made; off the list.
  const taken = await takeLead(sql, asMember(hugo), one);
  assert.equal(taken.owner, hugo.id);
  const c = await contacts.contact(sql, asMember(camille), one!);
  assert.equal(c.owner, hugo.id);
  assert.equal((await companies.company(sql, asMember(camille), c.company!.id)).owner, hugo.id, "the company the form made goes with it");
  assert.ok(!(await leads(sql, asMember(hugo))).rows.some(l => l.id === one));
  assert.deepEqual((await activities.timeline(sql, { contactId: one! })).filter(a => a.kind === "owner").map(a => a.data), [{ from: null, to: hugo.id }]);
  // Taken already: Inès cannot take it too.
  await assert.rejects(takeLead(sql, asMember(ines), one), /not_found/u);
  // "Not a lead", then Undo.
  await dismissLead(sql, asMember(ines), two);
  assert.ok(!(await leads(sql, asMember(hugo))).rows.some(l => l.id === two));
  await restoreLead(sql, asMember(ines), two);
  assert.ok((await leads(sql, asMember(hugo))).rows.some(l => l.id === two));
  // Camille gives it to Inès: Inès is told.
  await takeLead(sql, asMember(camille), two, ines.id);
  assert.equal((await contacts.contact(sql, asMember(camille), two!)).owner, ines.id);
  // Someone who is not of the team cannot be given it.
  assert.equal(await told(contact({ contact: { name: "Lead Three", email: "lead.three@example.com" } })), 204);
  const [three] = await byEmail("lead.three@example.com");
  await assert.rejects(takeLead(sql, asMember(camille), three, lea.id), /invalid/u);
  // A contact given an owner any other way leaves the list too.
  await contacts.updateContact(sql, asMember(camille), three, { owner: hugo.id });
  assert.ok(!(await leads(sql, asMember(hugo))).rows.some(l => l.id === three));
});

test("the check: lines filed before Clients kept who filled the form in, on a contact the form did not make, are listed; a manager says 'right person' or moves the line", async () => {
  const { sql } = database;
  // A line of the previous version (no `who`) on a contact of the team's:
  // it may be a mis-filing of the old phone rule.
  const old = await contacts.addContact(sql, asMember(hugo), { name: "Old Client", phone: "05 55 55 55 55" });
  const [oldLine] = await sql<{ id: string }[]>`insert into activities (kind, body, data, contact_id, author) values ('form', 'Old words', ${sql.json({ event: "evt_old", formId: "5", form: "Contact us", answer: "oldanswer1", path: "/chest/forms/5/answers/oldanswer1" })}, ${old.id}, 'chest') returning id`;
  // A line of the previous version that made its contact: surely right.
  const [made] = await sql<{ id: string }[]>`insert into contacts (name, email, owner, created_by) values ('Made By Form', 'made@example.com', null, 'chest') returning id`;
  await sql`insert into activities (kind, body, data, contact_id, author) values ('form', '', ${sql.json({ event: "evt_old2", formId: "5", form: "Contact us", answer: "oldanswer2", path: "" })}, ${made!.id}, 'chest')`;
  const list = await formLinesToCheck(sql, asMember(camille));
  const mine = list.rows.filter(r => r.contact.id === old.id || r.contact.id === String(made!.id));
  assert.deepEqual(mine.map(r => [r.id, r.why]), [[String(oldLine!.id), "before"]]);
  // "Right person", then Undo.
  await markChecked(sql, asMember(camille), oldLine!.id);
  assert.ok(!(await formLinesToCheck(sql, asMember(camille))).rows.some(r => r.id === String(oldLine!.id)));
  await markChecked(sql, asMember(camille), oldLine!.id, false);
  assert.ok((await formLinesToCheck(sql, asMember(camille))).rows.some(r => r.id === String(oldLine!.id)));
  await assert.rejects(markChecked(sql, asMember(hugo), oldLine!.id), /forbidden/u);
  // Moved to the contact it belongs to: gone from the check and from Old Client's file.
  const right = await contacts.addContact(sql, asMember(hugo), { name: "Right Person" });
  await assert.rejects(moveLine(sql, asMember(camille), oldLine!.id, old.id), /same_record/u);
  await assert.rejects(moveLine(sql, asMember(camille), oldLine!.id, "new"), /invalid/u, "an old line holds nothing to make a contact from");
  await moveLine(sql, asMember(camille), oldLine!.id, right.id);
  assert.equal((await formLines(old.id)).length, 0);
  assert.equal((await formLines(right.id))[0]?.body, "Old words");
  assert.ok(!(await formLinesToCheck(sql, asMember(camille))).rows.some(r => r.id === String(oldLine!.id)));

  // A new line with another address: moved to a new contact made of what the form gave.
  const julie = await contacts.addContact(sql, asMember(hugo), { name: "Julie Martin", email: "julie@martin.test", phone: "03 33 33 33 33" });
  assert.equal(await told(contact({ contact: { name: "julie martin", email: "jm@other.test", phone: "03 33 33 33 33" }, message: "Hello" })), 204);
  const [line] = await formLines(julie.id);
  assert.ok(line, "same phone, same name: Julie");
  const listed = (await formLinesToCheck(sql, asMember(camille))).rows.find(r => r.id === line!.id);
  assert.equal(listed?.why, "email");
  const moved = await moveLine(sql, asMember(camille), line!.id, "new");
  const fresh = await contacts.contact(sql, asMember(camille), moved.contact);
  assert.deepEqual([fresh.name, fresh.email, fresh.phone, fresh.owner], ["julie martin", "jm@other.test", "03 33 33 33 33", null]);
  assert.ok((await leads(sql, asMember(hugo))).rows.some(l => l.id === moved.contact), "a lead to take");
  assert.equal((await formLines(julie.id)).length, 0);
});
