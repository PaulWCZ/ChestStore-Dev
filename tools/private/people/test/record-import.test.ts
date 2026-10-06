import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/lib/errors.ts";
import { ofRecord } from "../src/lib/journal.ts";
import { applyRecords, plan, previewRecords, readContract, readHeader, readSex, readWorkingTime } from "../src/lib/record-import.ts";
import { createRecord, listRecords, record, updateRecord } from "../src/lib/records.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, nora, tom } from "./support/members.ts";

// Importing HR records from Lucca, BambooHR or HR's own spreadsheet.
let database: TestDatabase;
let chest: FakeChest;
const withEmail = everyone.map(m => ({ ...m, email: m.firstName.toLowerCase() + "@atelier.test" }));
before(async () => {
  process.env["CHEST_TOOL"] = "people";
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: withEmail, capabilities: ["members", "members.email", "notifications"], emits: ["people.record"], receivers: 1 });
});
after(async () => {
  await chest.close();
  await database.close();
});

const hr = asMember(camille);
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

// A French HR file as Lucca Core HR exports it (semicolons, day-first dates,
// "Nom" and "Prénom" apart, an address in parts) — the columns named in
// Lucca's help, plus one People does not keep.
const lucca = [
  "Matricule;Nom;Prénom;E-mail professionnel;Civilité;Date de naissance;Nationalité;Poste;Type de contrat;Temps de travail;Heures hebdomadaires;Date d'entrée;Date de fin de contrat;Titre de séjour;Date d'expiration du titre;Adresse ligne 1;Code postal;Ville;Contact d'urgence;Téléphone d'urgence;Mutuelle",
  "0019;Walker;Thomas;tom@atelier.test;M.;01/12/1991;Britannique;Developer;CDI;Temps partiel;28;04/03/2024;;Titre de séjour talent n° 99;30/11/2026;1 rue Neuve;69001;Lyon;Jane Walker;+44 7700 900123;Alan",
  "0017;DIALLO;Aminata;;Mme;30/01/1995;Sénégalaise;Warehouse operator;CDD;Temps partiel;24;04/09/2023;31/12/2026;Carte de séjour salarié n° 75;15/11/2026;;;;Moussa Diallo;07 12 34 56 78;Harmonie",
  "0024;Petit;Nora;;Madame;11/02/2000;Française;Sales assistant;Stage;;;01/09/2026;01/03/2026;;;;;;;;",
  "0030;Moreau;;;Martien;;;;Contrat bizarre;;99;31/13/2020;;;;;;;;;",
].join("\n");

test("headers and values as Lucca and BambooHR write them", () => {
  assert.deepEqual(readHeader(["Employee #", "First Name", "Last Name", "Gender", "Hire Date", "Employment Status", "Address Line 1", "Zip", "City", "Emergency Contact Name", "T-Shirt Size"]),
    ["employeeNumber", "first", "last", "sex", "startDate", "workingTime", "street", "postcode", "city", "emergencyName", "skip"]);
  // "Nom" alone is the whole name.
  assert.deepEqual(readHeader(["Nom", "Matricule"]), ["legalName", "employeeNumber"]);
  assert.deepEqual(["CDI", "cdd", "Contrat d'apprentissage", "Stagiaire", "Intérim", "Mis à disposition", "Full-Time"].map(readContract), ["permanent", "fixed_term", "apprenticeship", "internship", "temporary", "seconded", null]);
  assert.deepEqual(["Mme", "M.", "Female", "homme", "X"].map(readSex), ["female", "male", "female", "male", null]);
  assert.deepEqual(["Full-Time", "Temps partiel", "100 %", "mi-temps"].map(readWorkingTime), ["full", "part", "full", null]);
});

test("the plan: each row finds its record (number, then member, then legal name) or makes one — linked, or 'not in the Chest'; what it cannot read is said", async () => {
  const { sql } = database;
  // Nora has a record already; Aminata one without the Chest.
  const noraRecord = await createRecord(sql, hr, { memberId: nora.id });
  const aminata = await createRecord(sql, hr, { legalName: "DIALLO Aminata" });
  const p = await previewRecords(sql, hr, lucca);
  assert.equal(p.missing, null);
  assert.deepEqual(p.leftOut, ["Mutuelle"]);
  assert.equal(p.dateOrder, "dmy");
  const [t, a, n, bad] = p.rows;
  // Tom: a member by his address, no record yet: one made, linked.
  assert.deepEqual([t!.action, t!.memberId, t!.changes.legalName, t!.changes.contract, t!.changes.workingTime, t!.changes.hours, t!.changes.startDate, t!.changes.permitEnd, t!.changes.sex],
    ["create_member", tom.id, "WALKER Thomas", "permanent", "part", "28", "2024-03-04", "2026-11-30", "male"]);
  assert.equal(t!.changes.address, "1 rue Neuve\n69001 Lyon");
  // Aminata: her record found by her legal name.
  assert.deepEqual([a!.action, a!.recordId, a!.changes.contractEnd, a!.changes.emergencyPhone], ["update", aminata.id, "2026-12-31", "07 12 34 56 78"]);
  // Nora: her record, through her name; a contract end before the start is refused and said.
  assert.deepEqual([n!.action, n!.recordId, n!.changes.contract, n!.changes.contractEnd, n!.problems], ["update", noraRecord.id, "internship", undefined, ["dates"]]);
  // Nobody known: a new record "not in the Chest"; what is unreadable is said, not imported.
  assert.deepEqual([bad!.action, bad!.memberId, bad!.changes.legalName], ["create_other", null, "MOREAU"]);
  assert.deepEqual([...bad!.problems].sort(), ["contract", "date", "hours", "sex"]);
  await assert.rejects(previewRecords(sql, asMember(hugo), lucca), refused("forbidden"));
});

test("the import writes the records in one go, notes each in the journal (field names only) and tells Leave", async () => {
  const { sql } = database;
  chest.published.length = 0;
  const done = await applyRecords(sql, hr, lucca);
  assert.deepEqual(done, { created: 2, updated: 2, skipped: 0 });
  const all = await listRecords(sql, hr);
  const tomRecord = all.find(r => r.memberId === tom.id)!;
  const r = (await record(sql, hr, tomRecord.id)).record;
  assert.deepEqual([r.employeeNumber, r.legalName, r.nationality, r.hours, r.permitEnd, r.address], ["0019", "WALKER Thomas", "Britannique", 28, "2026-11-30", "1 rue Neuve\n69001 Lyon"]);
  assert.ok(all.some(x => x.legalName === "MOREAU" && x.memberId === null));
  const log = await ofRecord(sql, tomRecord.id);
  // (HR's opening of the record above is noted too.)
  assert.deepEqual(log.map(e => e.action), ["viewed", "imported", "created"]);
  assert.ok(log[1]!.fields.includes("employeeNumber") && !JSON.stringify(log).includes("Neuve"));
  // Leave hears Tom's number and first day (members only).
  assert.deepEqual(chest.published.filter(e => (e.data as { member: string }).member === tom.id).map(e => [(e.data as { employeeNumber: string }).employeeNumber, (e.data as { startDate: string }).startDate]), [["0019", "2024-03-04"]]);
  // Imported again: the same records, nothing new.
  assert.deepEqual(await applyRecords(sql, hr, lucca), { created: 0, updated: 0, skipped: 0 });
});

test("a number already another record's is refused and said; the mapping step may say what a column holds", async () => {
  const { sql } = database;
  const other = await createRecord(sql, hr, { legalName: "GIRAUD Paul" });
  await updateRecord(sql, hr, other.id, { employeeNumber: "0003" });
  const file = "Name;Matricule;Poste\nDIALLO Aminata;0003;Cariste\n";
  const p = await previewRecords(sql, hr, file);
  // "0003" is Paul's record: the row finds Paul's record by it.
  assert.equal(p.rows[0]!.recordId, other.id);
  // HR says the column is something else: the row finds Aminata by name.
  const mapped = await previewRecords(sql, hr, file, { targets: ["legalName", "skip", "job"] });
  assert.deepEqual([mapped.rows[0]!.action, mapped.rows[0]!.changes.job], ["update", "Cariste"]);
  assert.deepEqual(mapped.leftOut, ["Matricule"]);
  await assert.rejects(previewRecords(sql, hr, file, { targets: ["legalName", "job", "job"] }), refused("import_invalid"));
  // A file with no column saying who: asked.
  assert.equal(plan("Poste;Ville\nCariste;Lyon\n", [], []).missing, "name");
});
