import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as activities from "../src/lib/activities.ts";
import * as companies from "../src/lib/companies.ts";
import * as contacts from "../src/lib/contacts.ts";
import * as deals from "../src/lib/deals.ts";
import { AppError } from "../src/lib/errors.ts";
import * as fields from "../src/lib/fields.ts";
import { en } from "../src/i18n/en.ts";
import { importTable, importVcards, recentImports, undoImport, unknownOwners } from "../src/lib/importers.ts";
import { addDays } from "../src/shared/model.ts";
import { today } from "../src/lib/zone.ts";
import { guessMapping, ownersIn, readTable } from "../src/shared/parse-import.ts";
import * as steps from "../src/lib/steps.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";

// Moving in from HubSpot or Pipedrive without losing anything: the columns
// the tool does not know, the owners the Chest does not know, the dates the
// records were created, their history — and taking an import back.
//
// The files are shaped as those tools export them (see THIRD_PARTY.md,
// "Export formats"): HubSpot's contact export ("Record ID", "Contact
// owner", "Lifecycle Stage", "Create Date"…), Pipedrive's activities export
// ("Activity - Subject", "Activity - Type", "Activity - Due date",
// "Activity - Done", "Deal - Title", "Person - Email"…) and HubSpot's notes
// ("Activity date", "Note body", "Associated Contact").
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ network: {}, members: everyone, chest: { timeZone: "Europe/Paris" } });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const mapped = (kind: "contacts" | "companies" | "deals" | "activities", text: string, custom: { id: string; label: string }[] = []) => guessMapping(kind, readTable(text).head, custom);

const hubspot = [
  "Record ID,First Name,Last Name,Email,Phone Number,Mobile Phone Number,Job Title,Company Name,Contact owner,Lifecycle Stage,Lead Status,Create Date",
  "5101,Gaëlle,Perrin,g.perrin@fromagerie-perrin.fr,04 50 11 22 33,06 11 22 33 44,Buyer,Fromagerie Perrin,Inès Moreau,Customer,Connected,2023-04-12 09:31",
  "5102,Paul,Girard,paul.girard@atelier-girard.fr,,,Owner,Atelier Girard,Paul Witczak,Lead,New,2024-11-02 16:05",
  "5103,Yann,Le Goff,yann@legoff-transports.fr,02 98 00 11 22,,,Le Goff Transports,Paul Witczak,Opportunity,In progress,15/01/2025",
].join("\n");

test("a HubSpot contacts export: unknown columns kept in the notes, unknown owners said and given as chosen, creation dates kept", async () => {
  const { sql } = database;
  const map = mapped("contacts", hubspot);
  assert.deepEqual(map, ["keep", "firstName", "lastName", "email", "phone", "phone2", "title", "company", "owner", "keep", "keep", "createdAt"]);
  // Before importing, the page asks which owners the Chest does not know.
  const named = ownersIn(readTable(hubspot), map);
  assert.deepEqual(named, [{ name: "Paul Witczak", rows: 2 }, { name: "Inès Moreau", rows: 1 }]);
  assert.deepEqual(await unknownOwners(asMember(hugo), named.map(n => n.name)), ["Paul Witczak"]);
  await assert.rejects(importTable(sql, asMember(hugo), "contacts", hubspot, map, en.stages, { ownerFallback: lea.id }), refused("invalid"), "only to someone of the team");
  const report = await importTable(sql, asMember(hugo), "contacts", hubspot, map, en.stages, { ownerFallback: "none", fileName: "hubspot-contacts.csv" });
  assert.equal(report.created, 3);
  assert.deepEqual(report.kept, ["Record ID", "Lifecycle Stage", "Lead Status"]);
  assert.deepEqual(report.owners, [{ name: "Paul Witczak", rows: 2 }]);
  assert.equal(report.ownerFallback, null);
  const list = (await contacts.listContacts(sql, asMember(lea), { q: "perrin" })).rows[0]!;
  assert.equal(list.owner, ines.id);
  assert.equal(list.phone2, "06 11 22 33 44");
  assert.equal(list.notes, "Record ID: 5101\nLifecycle Stage: Customer\nLead Status: Connected");
  assert.equal(list.createdAt.slice(0, 10), "2023-04-12");
  const girard = (await contacts.listContacts(sql, asMember(lea), { q: "girard" })).rows[0]!;
  assert.equal(girard.owner, null, "Paul Witczak's rows: unassigned, as chosen");
  const created = (await activities.timeline(sql, { contactId: girard.id })).find(a => a.kind === "created")!;
  assert.equal(created.at.slice(0, 10), "2024-11-02", "the history starts when it started");
  assert.equal((await contacts.listContacts(sql, asMember(lea), { q: "le goff" })).rows[0]!.createdAt.slice(0, 10), "2025-01-15");
});

test("a manager turns unknown columns into the team's own fields, of the kind their values look like", async () => {
  const { sql } = database;
  const file = [
    "Company name,Industry,Number of Employees,Customer since,Segment,SIREN",
    "Imprimerie Roux,Printing,42,2021-06-01,SMB,552 100 554",
    "Hôtel Méridien Sud,Hospitality,180,2019-02-15,Mid-market,",
    "Coopérative du Val,Agriculture,12,,SMB,",
    "Studio Blanc,Architecture,8,2024-09-30,SMB,",
  ].join("\n");
  const map = mapped("companies", file);
  assert.deepEqual(map, ["name", "industry", "keep", "keep", "keep", "siren"]);
  map[2] = "new"; map[3] = "new"; map[4] = "new";
  await assert.rejects(importTable(sql, asMember(hugo), "companies", file, map, en.stages), refused("forbidden"), "a new field: a manager");
  const report = await importTable(sql, asMember(camille), "companies", file, map, en.stages);
  assert.deepEqual(report.fields, ["Number of Employees", "Customer since", "Segment"]);
  const made = await fields.listFields(sql, "companies");
  assert.deepEqual(made.map(f => [f.label, f.kind, f.options]), [["Number of Employees", "number", []], ["Customer since", "date", []], ["Segment", "choice", ["SMB", "Mid-market"]]]);
  const roux = (await companies.listCompanies(sql, asMember(lea), { q: "roux" })).rows[0]!;
  assert.deepEqual(roux.custom, { [made[0]!.id]: 42, [made[1]!.id]: "2021-06-01", [made[2]!.id]: "SMB" });
  assert.equal(roux.siren, "552100554");
  // A second file finds the same fields by their names.
  const again = "Company name,Segment\nGarage Nord,Mid-market\n";
  assert.deepEqual(mapped("companies", again, made), ["name", `custom:${made[2]!.id}`]);
});

test("those already here: kept as they were, or their empty details filled in when asked", async () => {
  const { sql } = database;
  const existing = await contacts.addContact(sql, asMember(hugo), { name: "Claire Durand", email: "claire@durand.fr" });
  const file = "Name,Email,Job Title,Phone\nClaire Durand,claire@durand.fr,Buyer,04 78 00 00 00\n";
  const kept = await importTable(sql, asMember(hugo), "contacts", file, mapped("contacts", file), en.stages);
  assert.deepEqual([kept.duplicates, kept.updated], [1, 0]);
  assert.equal((await contacts.contact(sql, asMember(hugo), existing.id)).title, "");
  const filled = await importTable(sql, asMember(hugo), "contacts", file, mapped("contacts", file), en.stages, { fillEmpty: true });
  assert.deepEqual([filled.duplicates, filled.updated], [1, 1]);
  const read = await contacts.contact(sql, asMember(hugo), existing.id);
  assert.deepEqual([read.title, read.phone], ["Buyer", "04 78 00 00 00"]);
  await contacts.updateContact(sql, asMember(hugo), existing.id, { title: "Head buyer" });
  const third = await importTable(sql, asMember(hugo), "contacts", "Name,Email,Job Title\nClaire Durand,claire@durand.fr,Intern\n", ["name", "email", "title"], en.stages, { fillEmpty: true });
  assert.equal(third.updated, 0, "nothing written is overwritten");
  assert.equal((await contacts.contact(sql, asMember(hugo), existing.id)).title, "Head buyer");
});

test("a Pipedrive activities export: history on the right deal and person, open to-dos become next steps", async () => {
  const { sql } = database;
  const co = await companies.addCompany(sql, asMember(ines), { name: "Nouvelle Boulangerie" });
  const nadia = await contacts.addContact(sql, asMember(ines), { name: "Nadia Chérif", email: "nadia@nouvelle-boulangerie.fr", company: co.id });
  const d = await deals.addDeal(sql, asMember(ines), { title: "Ovens for the new shop", contact: nadia.id });
  const soon = addDays(today(), 3);
  const file = [
    "Activity - Subject,Activity - Type,Activity - Due date,Activity - Due time,Activity - Done,Activity - Note,Activity - Assigned to user,Deal - Title,Person - Name,Person - Email,Organization - Name",
    `First call,Call,2025-03-04,10:30,Done,"Needs two ovens, budget 20k",Inès Moreau,Ovens for the new shop,Nadia Chérif,nadia@nouvelle-boulangerie.fr,Nouvelle Boulangerie`,
    `Showroom visit,Meeting,2025-03-18,14:00,Done,Liked the deck oven,Former Colleague,,Nadia Chérif,nadia@nouvelle-boulangerie.fr,Nouvelle Boulangerie`,
    `Send the revised quote,Task,${soon},09:00,To do,,Inès Moreau,Ovens for the new shop,,,`,
    `Old reminder,Task,2019-01-10,,To do,Never done,Inès Moreau,,,,Nouvelle Boulangerie`,
    `Lost lead,Call,2025-01-01,,Done,,Inès Moreau,,Nobody Known,nobody@example.com,Unknown Company`,
  ].join("\n");
  const map = mapped("activities", file);
  assert.deepEqual(map, ["subject", "type", "date", "time", "done", "text", "owner", "deal", "contact", "contactEmail", "company"]);
  const report = await importTable(sql, asMember(ines), "activities", file, map, en.stages);
  assert.deepEqual([report.created, report.steps, report.skipped], [4, 1, [{ line: 6, error: "not_found" }]]);
  const onDeal = await activities.timeline(sql, { dealId: d.id });
  const call = onDeal.find(a => a.kind === "call")!;
  assert.equal(call.body, "First call\n\nNeeds two ovens, budget 20k");
  assert.equal(call.author, ines.id, "the teammate named is its author");
  assert.equal(call.at, "2025-03-04T09:30:00.000Z", "10:30 in Paris");
  const onPerson = await activities.timeline(sql, { contactId: nadia.id });
  const visit = onPerson.find(a => a.kind === "meeting")!;
  assert.equal(visit.data["by"], "Former Colleague", "someone not in the team keeps their name");
  assert.equal(visit.author, ines.id);
  assert.ok((await activities.timeline(sql, { companyId: co.id })).some(a => a.kind === "note" && a.body.includes("Never done")), "an old open to-do is history, not a late step");
  const open = await steps.openSteps(sql, { dealId: d.id });
  assert.deepEqual(open.map(s => [s.text, s.due, s.time, s.owner]), [["Send the revised quote", soon, "09:00", ines.id]]);
  assert.equal((await contacts.contact(sql, asMember(ines), nadia.id)).lastContact, "2025-03-18T13:00:00.000Z");
});

test("HubSpot notes: the note body on the associated contact, at its date", async () => {
  const { sql } = database;
  const p = await contacts.addContact(sql, asMember(hugo), { name: "Marc Lemaire", email: "marc@lemaire.fr" });
  const file = "Activity date,Note body,Associated Contact,Associated Company\n12/02/2025,Asked for references,Marc Lemaire (4421),\n";
  const map = mapped("activities", file);
  assert.deepEqual(map, ["date", "text", "contact", "company"]);
  const report = await importTable(sql, asMember(hugo), "activities", file, map, en.stages);
  assert.equal(report.created, 1);
  const note = (await activities.timeline(sql, { contactId: p.id })).find(a => a.kind === "note")!;
  assert.deepEqual([note.body, note.at.slice(0, 10)], ["Asked for references", "2025-02-12"]);
});

test("undo an import: everything it added goes, within a day, by its author or a manager", async () => {
  const { sql } = database;
  const file = "Deal Name,Associated Company,Associated Contact,Amount,Deal Stage\nUndo deal 1,Undo Company,Undo Person,1000,Proposal\nUndo deal 2,Undo Company,,2000,\n";
  const report = await importTable(sql, asMember(hugo), "deals", file, mapped("deals", file), en.stages, { fileName: "deals.csv" });
  assert.deepEqual([report.created, report.companies, report.contacts], [2, 1, 1]);
  const dealId = (await deals.listDeals(sql, asMember(hugo), { q: "undo deal 1", status: "" })).rows[0]!.id;
  await activities.log(sql, asMember(ines), { deal: dealId }, "call", "Logged after the import");
  await steps.addStep(sql, asMember(hugo), { deal: dealId }, { text: "Follow up", due: today() });
  const recent = await recentImports(sql, asMember(hugo));
  const line = recent.find(r => r.id === report.importId)!;
  assert.deepEqual([line.fileName, line.created, line.undoable], ["deals.csv", 4, true]);
  assert.equal((await recentImports(sql, asMember(ines))).find(r => r.id === report.importId)!.undoable, false, "not Inès's");
  await assert.rejects(undoImport(sql, asMember(ines), report.importId), refused("forbidden"));
  await assert.rejects(undoImport(sql, asMember(lea), report.importId), refused("forbidden"));
  const undone = await undoImport(sql, asMember(camille), report.importId);
  assert.equal(undone.removed, 4);
  assert.equal(undone.steps.length, 1, "its open steps settled");
  assert.equal((await deals.listDeals(sql, asMember(hugo), { q: "undo deal", status: "" })).total, 0);
  assert.equal((await companies.listCompanies(sql, asMember(hugo), { q: "undo company" })).total, 0);
  assert.equal((await contacts.listContacts(sql, asMember(hugo), { q: "undo person" })).total, 0);
  await assert.rejects(undoImport(sql, asMember(camille), report.importId), refused("not_found"), "once");
  // After a day, it stays.
  const later = await importVcards(sql, asMember(hugo), "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Late Card\r\nEND:VCARD\r\n");
  await sql`update imports set created_at = now() - interval '25 hours' where id = ${later.importId}`;
  await assert.rejects(undoImport(sql, asMember(hugo), later.importId), refused("too_late"));
});
