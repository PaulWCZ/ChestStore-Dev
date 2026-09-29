import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import * as files from "@argentic/chest-sdk/files";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as activities from "../lib/activities.ts";
import { attach, detach, listFiles, uploadFolder } from "../lib/attachments.ts";
import { bulk } from "../lib/bulk.ts";
import * as companies from "../lib/companies.ts";
import * as contacts from "../lib/contacts.ts";
import * as deals from "../lib/deals.ts";
import { AppError } from "../lib/errors.ts";
import { companiesCsv, contactJson, contactsCsv, dealsCsv, everything } from "../lib/export.ts";
import * as fields from "../lib/fields.ts";
import { en } from "../lib/i18n/en.ts";
import { mergeCompanies, mergeContacts } from "../lib/merge.ts";
import { teamReport } from "../lib/reports.ts";
import { search } from "../lib/search.ts";
import { listStages } from "../lib/stages.ts";
import * as steps from "../lib/steps.ts";
import { today } from "../lib/model.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";

// What the second version adds: the team's own fields, long lists in pages,
// phone numbers found whatever their spacing, many records changed at once,
// duplicates merged, files, a company's legal identity, the team's report,
// the whole client book as one file.
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
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("the team's own fields: a manager sets them; values are checked, shown, filtered and exported", async () => {
  const { sql } = database;
  await assert.rejects(fields.addField(sql, asMember(hugo), { object: "companies", label: "Segment", kind: "choice", options: "SMB\nMid-market" }), refused("forbidden"));
  const segment = await fields.addField(sql, asMember(camille), { object: "companies", label: "Segment", kind: "choice", options: "SMB\nMid-market\nEnterprise" });
  const staff = await fields.addField(sql, asMember(camille), { object: "companies", label: "Employees", kind: "number" });
  const renewal = await fields.addField(sql, asMember(camille), { object: "companies", label: "Contract end", kind: "date" });
  const source = await fields.addField(sql, asMember(camille), { object: "companies", label: "Lead source", kind: "text" });
  await assert.rejects(fields.addField(sql, asMember(camille), { object: "companies", label: "segment", kind: "text" }), refused("invalid"), "a name once per kind of record");
  await assert.rejects(fields.addField(sql, asMember(camille), { object: "companies", label: "Tier", kind: "choice", options: "" }), refused("empty"));
  const a = await companies.addCompany(sql, asMember(hugo), { name: "Alpha Fournitures", custom: { [segment.id]: "smb", [staff.id]: "1 250", [renewal.id]: "2027-03-31", [source.id]: "Trade show Lyon" } });
  const b = await companies.addCompany(sql, asMember(hugo), { name: "Beta Mobilier", custom: { [segment.id]: "Enterprise", [staff.id]: "12,5" } });
  const read = await companies.company(sql, asMember(lea), a.id);
  assert.deepEqual(read.custom, { [segment.id]: "SMB", [staff.id]: 1250, [renewal.id]: "2027-03-31", [source.id]: "Trade show Lyon" }, "a choice written as its choice, a number as a number");
  await assert.rejects(companies.addCompany(sql, asMember(hugo), { name: "X", custom: { [staff.id]: "many" } }), (e: unknown) => e instanceof AppError && e.code === "bad_number" && e.values["field"] === "Employees");
  await assert.rejects(companies.addCompany(sql, asMember(hugo), { name: "X", custom: { [segment.id]: "Huge" } }), refused("invalid"));
  // Clearing one value leaves the others.
  await companies.updateCompany(sql, asMember(hugo), b.id, { custom: { [staff.id]: "" } });
  assert.deepEqual((await companies.company(sql, asMember(hugo), b.id)).custom, { [segment.id]: "Enterprise" });
  // Filters: a choice, words of a text, a range of numbers, a range of days.
  const names = async (field: fields.FieldFilter) => (await companies.listCompanies(sql, asMember(lea), { field })).rows.map(r => r.name);
  assert.deepEqual(await names({ field: segment.id, value: "Enterprise" }), ["Beta Mobilier"]);
  assert.deepEqual(await names({ field: source.id, value: "salon lyon" }), []);
  assert.deepEqual(await names({ field: source.id, value: "show ly" }), ["Alpha Fournitures"]);
  assert.deepEqual(await names({ field: staff.id, min: "1000" }), ["Alpha Fournitures"]);
  assert.deepEqual(await names({ field: staff.id, max: "10" }), []);
  assert.deepEqual(await names({ field: renewal.id, min: "2027-01-01", max: "2027-06-30" }), ["Alpha Fournitures"]);
  assert.deepEqual(await names({ field: segment.id }), ["Alpha Fournitures", "Beta Mobilier"], "filled in");
  // Exported, each field a column named as the team named it.
  const csv = await companiesCsv(sql, asMember(lea), {}, en, "en");
  const [head, first] = csv.replace(/^﻿/u, "").split("\r\n");
  assert.ok(head!.endsWith("Segment,Employees,Contract end,Lead source"));
  assert.ok(first!.startsWith("Alpha Fournitures,") && first!.endsWith("SMB,1250,2027-03-31,Trade show Lyon"));
  // A choice renamed in place is renamed on every record; a field removed
  // takes its values with it.
  await fields.updateField(sql, asMember(camille), segment.id, { options: "Small business\nMid-market\nEnterprise" });
  assert.equal((await companies.company(sql, asMember(hugo), a.id)).custom[segment.id], "Small business");
  await fields.removeField(sql, asMember(camille), renewal.id);
  assert.equal((await companies.company(sql, asMember(hugo), a.id)).custom[renewal.id], undefined);
  await fields.moveField(sql, asMember(camille), source.id, "up");
  assert.deepEqual((await fields.listFields(sql, "companies")).map(f => f.label), ["Segment", "Lead source", "Employees"]);
});

test("fields on contacts and deals: in the person's data export, in the deals' CSV", async () => {
  const { sql } = database;
  const birthday = await fields.addField(sql, asMember(camille), { object: "contacts", label: "Preferred language", kind: "choice", options: "French\nEnglish" });
  const po = await fields.addField(sql, asMember(camille), { object: "deals", label: "PO number", kind: "text" });
  const p = await contacts.addContact(sql, asMember(ines), { name: "Nadia Chérif", phone: "06 12 34 56 78", phone2: "+33 4 78 42 16 90", url: "linkedin.com/in/nadia", custom: { [birthday.id]: "English" } });
  const d = await deals.addDeal(sql, asMember(ines), { title: "Counters", contact: p.id, custom: { [po.id]: "PO-2026-114" } });
  assert.equal((await deals.deal(sql, asMember(lea), d.id)).custom[po.id], "PO-2026-114");
  await deals.updateDeal(sql, asMember(ines), d.id, { custom: { [po.id]: "PO-2026-115" } });
  const out = await dealsCsv(sql, asMember(lea), { status: "" }, en, "en");
  assert.ok(out.split("\r\n")[0]!.endsWith(",PO number") && out.includes("PO-2026-115"));
  const json = JSON.parse((await contactJson(sql, asMember(lea), p.id, "en", en)).json);
  assert.deepEqual(json.contact.fields, { "Preferred language": "English" });
  assert.equal(json.contact.otherPhone, "+33 4 78 42 16 90");
  const table = await contactsCsv(sql, asMember(lea), { q: "nadia" }, en, "en");
  assert.ok(table.includes("+33 4 78 42 16 90,linkedin.com/in/nadia"));
});

test("a phone number is found whatever its spacing, with +33 or 0033", async () => {
  const { sql } = database;
  const co = await companies.addCompany(sql, asMember(hugo), { name: "Boulangeries Durand", phone: "04 78 42 16 90" });
  const p = await contacts.addContact(sql, asMember(hugo), { name: "Claire Durand", phone: "06.22.41.90.13", company: co.id });
  for (const q of ["0478421690", "+33 4 78 42 16 90", "0033478421690", "+33 (0)4 78 42 16 90", "04 78 42"]) {
    assert.deepEqual((await search(sql, asMember(lea), q)).companies.map(c => c.name), ["Boulangeries Durand"], q);
  }
  assert.deepEqual((await search(sql, asMember(lea), "0622419013")).contacts.map(c => c.id), [p.id]);
  assert.deepEqual((await contacts.listContacts(sql, asMember(lea), { q: "06 22 41 90 13" })).rows.map(c => c.id), [p.id]);
  assert.deepEqual((await companies.listCompanies(sql, asMember(lea), { q: "+33478421690" })).rows.map(c => c.id), [co.id]);
});

test("long lists come in pages of 100, in the order asked; pickers search as one types", async () => {
  const { sql } = database;
  await sql`insert into companies (name, created_by, created_at) select 'Zeta ' || lpad(n::text, 3, '0'), ${hugo.id}, now() - make_interval(days => n) from generate_series(1, 250) n`;
  const first = await companies.listCompanies(sql, asMember(lea), { q: "zeta" });
  assert.equal(first.total, 250);
  assert.equal(first.rows.length, 100);
  assert.equal(first.rows[0]!.name, "Zeta 001");
  const third = await companies.listCompanies(sql, asMember(lea), { q: "zeta" }, { page: "3" });
  assert.deepEqual([third.page, third.rows.length, third.rows[0]!.name], [3, 50, "Zeta 201"]);
  const newest = await companies.listCompanies(sql, asMember(lea), { q: "zeta" }, { sort: "created" });
  assert.equal(newest.rows[0]!.name, "Zeta 001");
  assert.equal((await companies.listCompanies(sql, asMember(lea), { q: "zeta" }, { page: "junk" })).page, 1);
  // The picker: close names first, the 250th found by typing.
  assert.deepEqual((await companies.companyChoices(sql, asMember(lea), "zeta 25")).map(c => c.name)[0], "Zeta 250");
  assert.equal((await companies.companyChoices(sql, asMember(lea), "")).length, 8);
  const co = await companies.addCompany(sql, asMember(hugo), { name: "Omega Bureaux" });
  const mine = await contacts.addContact(sql, asMember(hugo), { name: "Olivier Omega", company: co.id });
  await contacts.addContact(sql, asMember(hugo), { name: "Olga Nobody" });
  await contacts.addContact(sql, asMember(hugo), { name: "Oscar Elsewhere", company: (await companies.addCompany(sql, asMember(hugo), { name: "Elsewhere" })).id });
  const people = await contacts.contactChoices(sql, asMember(lea), "o", co.id);
  assert.equal(people[0]!.id, mine.id, "the company's people first");
  assert.ok(!people.some(x => x.name === "Oscar Elsewhere"), "not another company's");
  assert.equal(people.find(x => x.id === mine.id)?.companyName, "Omega Bureaux");
  await assert.rejects(companies.companyChoices(sql, asMember({ ...lea, role: null }), "x"), refused("forbidden"));
});

test("many at once: given, tagged, untagged, deleted — each checked as if alone", async () => {
  const { sql } = database;
  const mine = await contacts.addContact(sql, asMember(ines), { name: "Bulk One", tags: "fair" });
  const hers = await contacts.addContact(sql, asMember(ines), { name: "Bulk Two" });
  const his = await contacts.addContact(sql, asMember(hugo), { name: "Bulk Three" });
  await assert.rejects(bulk(sql, asMember(lea), "contacts", [mine.id], { kind: "tag", tag: "x" }), refused("forbidden"));
  assert.deepEqual((await bulk(sql, asMember(ines), "contacts", [mine.id, hers.id, his.id], { kind: "tag", tag: "Fair 2026" })).done, 3);
  assert.deepEqual((await contacts.contact(sql, asMember(lea), mine.id)).tags, ["fair", "Fair 2026"]);
  await bulk(sql, asMember(ines), "contacts", [mine.id, hers.id], { kind: "untag", tag: "FAIR" });
  assert.deepEqual((await contacts.contact(sql, asMember(lea), mine.id)).tags, ["Fair 2026"]);
  // Giving to someone else: whoever may assign; to someone of the team.
  await assert.rejects(bulk(sql, asMember(ines), "contacts", [mine.id], { kind: "assign", owner: lea.id }), refused("invalid"));
  const given = await bulk(sql, asMember(ines), "contacts", [mine.id, hers.id], { kind: "assign", owner: hugo.id });
  assert.equal(given.done, 2);
  assert.equal((await contacts.contact(sql, asMember(lea), hers.id)).owner, hugo.id);
  // Deleting: a salesperson only what they own (now Hugo's, all three).
  const gone = await bulk(sql, asMember(ines), "contacts", [mine.id, his.id], { kind: "delete" });
  assert.deepEqual([gone.done, gone.skipped], [0, 2]);
  const done = await bulk(sql, asMember(hugo), "contacts", [mine.id, his.id, "999999"], { kind: "delete" });
  assert.deepEqual([done.done, done.skipped], [2, 1]);
  await assert.rejects(contacts.contact(sql, asMember(hugo), mine.id), refused("not_found"));
  // Deals: given, each by who may change it.
  const d1 = await deals.addDeal(sql, asMember(hugo), { title: "Bulk deal A" });
  const d2 = await deals.addDeal(sql, asMember(ines), { title: "Bulk deal B" });
  const moved = await bulk(sql, asMember(hugo), "deals", [d1.id, d2.id], { kind: "assign", owner: ines.id });
  assert.deepEqual([moved.done, moved.skipped, moved.given.map(g => g.title)], [1, 1, ["Bulk deal A"]]);
  assert.equal((await activities.timeline(sql, { dealId: d1.id }))[0]?.kind, "owner");
  const all = await bulk(sql, asMember(camille), "deals", [d1.id, d2.id], { kind: "assign", owner: null });
  assert.equal(all.done, 2);
  await assert.rejects(bulk(sql, asMember(camille), "deals", [d1.id], { kind: "delete" }), refused("invalid"));
  await assert.rejects(bulk(sql, asMember(camille), "contacts", Array.from({ length: 501 }, (_, i) => String(i + 1)), { kind: "tag", tag: "x" }), refused("too_many"));
});

test("merging duplicates: the kept one gains the other's deals, history, steps and missing details", async () => {
  const { sql } = database;
  const keep = await companies.addCompany(sql, asMember(ines), { name: "Garage Martin", phone: "02 40 00 00 01", tags: "cars" });
  const dup = await companies.addCompany(sql, asMember(ines), { name: "Garage Martin SARL", website: "garage-martin.fr", city: "Nantes", siren: "123456789", tags: "cars, west", notes: "Imported" });
  const luc = await contacts.addContact(sql, asMember(ines), { name: "Luc Martin", email: "luc@garage-martin.fr", company: dup.id });
  const d = await deals.addDeal(sql, asMember(ines), { title: "Lockers", company: dup.id });
  const note = await activities.log(sql, asMember(ines), { company: dup.id }, "note", "Called the front desk");
  await assert.rejects(mergeCompanies(sql, asMember(hugo), dup.id, keep.id), refused("forbidden"), "not Hugo's to delete");
  await assert.rejects(mergeCompanies(sql, asMember(ines), keep.id, keep.id), refused("same_record"));
  await mergeCompanies(sql, asMember(ines), dup.id, keep.id);
  await assert.rejects(companies.company(sql, asMember(ines), dup.id), refused("not_found"));
  const kept = await companies.company(sql, asMember(ines), keep.id);
  assert.deepEqual([kept.phone, kept.website, kept.city, kept.siren, kept.tags, kept.notes], ["02 40 00 00 01", "garage-martin.fr", "Nantes", "123456789", ["cars", "west"], "Imported"]);
  assert.equal((await contacts.contact(sql, asMember(ines), luc.id)).company?.id, keep.id);
  assert.equal((await deals.deal(sql, asMember(ines), d.id)).company?.id, keep.id);
  const history = await activities.timeline(sql, { companyId: keep.id });
  assert.ok(history.some(a => a.id === note.id));
  assert.equal(history[0]?.kind, "merged");
  assert.equal(history[0]?.data["name"], "Garage Martin SARL");
  // People: the second phone, the steps and the history follow.
  const twin = await contacts.addContact(sql, asMember(ines), { name: "L. Martin", phone: "06 99 88 77 66", title: "Owner" });
  const step = await steps.addStep(sql, asMember(ines), { contact: twin.id }, { text: "Call Luc", due: today() });
  await contacts.updateContact(sql, asMember(ines), luc.id, { phone: "02 40 11 22 33" });
  await mergeContacts(sql, asMember(ines), twin.id, luc.id);
  const person = await contacts.contact(sql, asMember(ines), luc.id);
  assert.deepEqual([person.phone, person.phone2, person.title, person.step?.id], ["02 40 11 22 33", "06 99 88 77 66", "Owner", step.step.id]);
});

test("files on a record: the browser sends them to the Chest, the tool records them; removed by who added them or a manager", async () => {
  const { sql } = database;
  const d = await deals.addDeal(sql, asMember(hugo), { title: "Signed quote deal" });
  await assert.rejects(uploadFolder(sql, asMember(lea), { deal: d.id }, 10), refused("forbidden"));
  await assert.rejects(uploadFolder(sql, asMember(hugo), { deal: d.id }, 26 << 20), refused("file_too_large"));
  const folder = await uploadFolder(sql, asMember(hugo), { deal: d.id }, 10);
  assert.equal(folder, `deals/${d.id}/`);
  const up = await files.uploadUrl(folder, { maxSize: 25 << 20 });
  const sent = await chest.upload(up.url, "%PDF-1.4 signed", "application/pdf");
  assert.equal(sent.status, 201);
  const { name } = await sent.json() as { name: string };
  const held = (await files.stat(name))!;
  // Only an object of this record's folder.
  await assert.rejects(attach(sql, asMember(hugo), { deal: "999999" }, { object: held.name, fileName: "x.pdf", type: held.type, size: held.size }), refused("not_found"));
  const other = await deals.addDeal(sql, asMember(hugo), { title: "Other" });
  await assert.rejects(attach(sql, asMember(hugo), { deal: other.id }, { object: held.name, fileName: "x.pdf", type: held.type, size: held.size }), refused("invalid"));
  const file = await attach(sql, asMember(hugo), { deal: d.id }, { object: held.name, fileName: "Devis signé.pdf", type: held.type, size: held.size });
  assert.deepEqual((await listFiles(sql, asMember(lea), { deal: d.id })).map(f => [f.name, f.addedBy]), [["Devis signé.pdf", hugo.id]]);
  await assert.rejects(detach(sql, asMember(ines), file.id), refused("forbidden"));
  assert.equal(await detach(sql, asMember(camille), file.id), held.name);
  // A person deleted takes their files with them (the objects to delete are said).
  const p = await contacts.addContact(sql, asMember(hugo), { name: "File Person" });
  const up2 = await files.uploadUrl(await uploadFolder(sql, asMember(hugo), { contact: p.id }, 5), {});
  const n2 = (await (await chest.upload(up2.url, "hello", "text/plain")).json() as { name: string }).name;
  await attach(sql, asMember(hugo), { contact: p.id }, { object: n2, fileName: "cv.txt", type: "text/plain", size: 5 });
  const gone = await contacts.deleteContact(sql, asMember(hugo), p.id);
  assert.deepEqual(gone.objects, [n2]);
});

test("a company's legal identity: SIREN or SIRET, VAT number, structured address and country code", async () => {
  const { sql } = database;
  await assert.rejects(companies.addCompany(sql, asMember(hugo), { name: "X", siren: "12345" }), refused("bad_siren"));
  await assert.rejects(companies.addCompany(sql, asMember(hugo), { name: "X", vat: "12" }), refused("bad_vat"));
  const c = await companies.addCompany(sql, asMember(hugo), { name: "Legal SAS", siren: "552 100 554 00014", vat: "fr 40 303265045", postcode: "75009", city: "Paris", country: "Allemagne", email: "Compta@Legal.fr" });
  const read = await companies.company(sql, asMember(lea), c.id);
  assert.deepEqual([read.siren, read.vat, read.country, read.email], ["55210055400014", "FR40303265045", "DE", "compta@legal.fr"]);
  await companies.updateCompany(sql, asMember(hugo), c.id, { country: "Atlantis" });
  assert.equal((await companies.company(sql, asMember(lea), c.id)).country, "Atlantis", "kept as written when unknown");
});

test("the team's report: open pipeline by person, won and lost by month, closing months, lost reasons", async () => {
  const { sql } = database;
  const stages = await listStages(sql);
  const won = stages.find(s => s.kind === "won")!, lost = stages.find(s => s.kind === "lost")!;
  const a = await deals.addDeal(sql, asMember(ines), { title: "Report A", value: "10 000", expectedClose: today() });
  const b = await deals.addDeal(sql, asMember(ines), { title: "Report B", value: "5 000" });
  const c = await deals.addDeal(sql, asMember(ines), { title: "Report C", value: "2 000" });
  await steps.addStep(sql, asMember(ines), { deal: a.id }, { text: "Late one", due: "2026-01-05" });
  await deals.moveDeal(sql, asMember(ines), b.id, won.id, null, null, "Best price");
  await deals.moveDeal(sql, asMember(ines), c.id, lost.id, null, null, "Too expensive");
  const r = await teamReport(sql, asMember(lea));
  assert.equal(r.months.length, 6);
  const line = r.owners.find(o => o.owner === ines.id)!;
  assert.ok(line.open >= 1 && line.late >= 1);
  const month = today().slice(0, 7);
  const results = r.results.find(x => x.owner === ines.id && x.month === month)!;
  assert.deepEqual([results.won, results.wonValue, results.lost, results.lostValue], [1, 500000, 1, 200000]);
  assert.ok(r.closing.find(x => x.month === month)!.value >= 1000000);
  assert.ok(r.reasons.some(x => x.reason === "Too expensive" && x.count === 1));
  await assert.rejects(teamReport(sql, asMember({ ...lea, role: null })), refused("forbidden"));
});

test("the whole client book as one ZIP of CSV files, for a manager", async () => {
  const { sql } = database;
  await assert.rejects(everything(sql, asMember(hugo), "en", en), refused("forbidden"));
  const bytes = await everything(sql, asMember(camille), "en", en);
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  const text = new TextDecoder().decode(bytes);
  for (const name of ["companies.csv", "contacts.csv", "deals.csv", "activities.csv", "next-steps.csv", "fields.csv"]) assert.ok(text.includes(name), name);
  assert.ok(text.includes("id,name,website,phone,email,address,postcode,city,country,siren,vat"));
  assert.ok(text.includes("Garage Martin"));
});
