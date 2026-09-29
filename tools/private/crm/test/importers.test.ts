import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as companies from "../lib/companies.ts";
import * as contacts from "../lib/contacts.ts";
import * as deals from "../lib/deals.ts";
import { AppError } from "../lib/errors.ts";
import { contactsCsv, contactsVcf, dealsCsv } from "../lib/export.ts";
import { en } from "../lib/i18n/en.ts";
import { fr } from "../lib/i18n/fr.ts";
import { importTable, importVcards } from "../lib/importers.ts";
import { guessMapping, readTable } from "../lib/parse-import.ts";
import { parseVcards } from "../lib/vcard.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";

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
const mapped = (kind: "contacts" | "companies" | "deals" | "activities", text: string) => guessMapping(kind, readTable(text).head);
// The counts of a report (the rest is checked where it matters).
const counts = (r: { created: number; companies: number; contacts: number; duplicates: number; skipped: unknown[] }) => ({ created: r.created, companies: r.companies, contacts: r.contacts, duplicates: r.duplicates, skipped: r.skipped });

test("a HubSpot contacts export: companies made on the way, owners matched by name, duplicates linked, bad rows said", async () => {
  const { sql } = database;
  const csv = [
    "Record ID,First Name,Last Name,Email,Phone Number,Job Title,Associated Company,Contact owner",
    "101,Claire,Durand,claire@durand.fr,01 23 45 67 89,Buyer,Boulangeries Durand (5551),Inès Moreau",
    "102,Marc,Durand,marc@durand.fr,,CEO,Boulangeries Durand (5551),Someone Unknown",
    "103,Bad,Email,not-an-email,,,,",
    "104,Claire,Again,CLAIRE@durand.fr,,,,",
  ].join("\n");
  await assert.rejects(importTable(sql, asMember(lea), "contacts", csv, mapped("contacts", csv), en.stages), refused("forbidden"));
  const report = await importTable(sql, asMember(hugo), "contacts", csv, mapped("contacts", csv), en.stages);
  assert.deepEqual(counts(report), { created: 2, companies: 1, contacts: 0, duplicates: 1, skipped: [{ line: 4, error: "bad_email" }] });
  // An owner the Chest does not know is said, with who received the rows.
  assert.deepEqual(report.owners, [{ name: "Someone Unknown", rows: 1 }]);
  assert.equal(report.ownerFallback, hugo.id);
  // A column the tool does not know went to the notes, and is said.
  assert.deepEqual(report.kept, ["Record ID"]);
  const list = await contacts.listContacts(sql, asMember(hugo), {});
  assert.deepEqual(list.rows.map(c => [c.name, c.company?.name, c.owner, c.notes]), [["Claire Durand", "Boulangeries Durand", ines.id, "Record ID: 101"], ["Marc Durand", "Boulangeries Durand", hugo.id, "Record ID: 102"]]);
});

test("a Pipedrive deals export in French: stages, won and lost, amounts, people found or made", async () => {
  const { sql } = database;
  const csv = [
    "Affaire - Titre;Affaire - Valeur;Affaire - Organisation;Affaire - Personne à contacter;Affaire - Étape;Affaire - Statut;Affaire - Date de clôture prévue;Affaire - Raison de perte",
    "Pains pour la cantine;12 500,50;Boulangeries Durand;Claire Durand;Proposition;open;15/11/2026;",
    "Fours;8000;Nouvelle Boulangerie;Nadia Chérif;Négociation;lost;;Trop cher",
    ";100;;;;;;",
  ].join("\n");
  const map = mapped("deals", csv);
  assert.deepEqual(map.slice(0, 3), ["title", "value", "company"]);
  // "Personne à contacter" is not a header we know: mapped by hand.
  map[3] = "contact";
  const report = await importTable(sql, asMember(camille), "deals", csv, map, fr.stages);
  assert.deepEqual(counts(report), { created: 2, companies: 1, contacts: 1, duplicates: 0, skipped: [{ line: 4, error: "empty" }] });
  const all = await deals.listDeals(sql, asMember(camille), { status: "" });
  const bread = all.rows.find(d => d.title === "Pains pour la cantine")!;
  assert.equal(bread.value, 1250050);
  assert.equal(bread.expectedClose, "2026-11-15");
  assert.equal(bread.contact?.name, "Claire Durand");
  const ovens = all.rows.find(d => d.title === "Fours")!;
  assert.equal(ovens.reason, "Trop cher");
  assert.ok(ovens.closedAt);
  // Exported in French, the formula-looking cell neutralised.
  await deals.updateDeal(sql, asMember(camille), bread.id, { title: "=HYPERLINK(\"x\")" });
  const out = await dealsCsv(sql, asMember(lea), {}, fr, "fr");
  assert.ok(out.startsWith("﻿Intitulé,Entreprise,Contact,Montant"));
  assert.ok(out.includes("\"'=HYPERLINK(\"\"x\"\")\""));
  assert.ok(out.includes("Perdue"));
});

test("a companies file and an address book (vCard); a file of the wrong kind is refused", async () => {
  const { sql } = database;
  const csv = "Company name,Website URL,City,Postal Code,Industry\nBoulangeries Durand,durand.fr,Lyon,69002,Food\nGarage Martin,garage-martin.fr,Nantes,44000,Cars\n";
  const report = await importTable(sql, asMember(hugo), "companies", csv, mapped("companies", csv), en.stages);
  assert.deepEqual(counts(report), { created: 1, companies: 0, contacts: 0, duplicates: 1, skipped: [] });
  const garage = (await companies.listCompanies(sql, asMember(hugo), { q: "garage" })).rows[0]!;
  const read = await companies.company(sql, asMember(hugo), garage.id);
  assert.deepEqual([read.postcode, read.city, read.address], ["44000", "Nantes", ""]);
  await assert.rejects(importTable(sql, asMember(hugo), "companies", csv, ["website", "", "", "", ""], en.stages), refused("import_invalid"));
  await assert.rejects(importTable(sql, asMember(hugo), "companies", csv, ["name", "name", "", "", ""], en.stages), refused("import_invalid"));
  await assert.rejects(importTable(sql, asMember(hugo), "pets", csv, [], en.stages), refused("import_invalid"));
  const vcf = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Nadia Chérif\r\nEMAIL:nadia@nb.fr\r\nORG:Nouvelle Boulangerie\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:3.0\r\nFN:Luc Bernard\r\nEMAIL:luc@garage-martin.fr\r\nORG:Garage Martin\r\nEND:VCARD\r\n";
  const cards = await importVcards(sql, asMember(hugo), vcf);
  assert.deepEqual(counts(cards), { created: 1, companies: 0, contacts: 0, duplicates: 1, skipped: [] });
  await assert.rejects(importVcards(sql, asMember(hugo), "nothing"), refused("vcard_invalid"));
  // And they leave as vCards, read back the same.
  const out = parseVcards(await contactsVcf(sql, asMember(lea), { q: "luc" }));
  assert.deepEqual(out.map(c => [c.name, c.email, c.company]), [["Luc Bernard", "luc@garage-martin.fr", "Garage Martin"]]);
  const table = await contactsCsv(sql, asMember(lea), {}, en, "en");
  assert.ok(table.split("\r\n")[0]!.startsWith("﻿Name,Email,Phone,Other phone,Web,Job title,Company"));
});
