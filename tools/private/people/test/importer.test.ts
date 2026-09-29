import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { directory } from "../lib/directory.ts";
import { AppError } from "../lib/errors.ts";
import { directoryCsv } from "../lib/export.ts";
import { en } from "../lib/i18n/en.ts";
import { fr } from "../lib/i18n/fr.ts";
import { applyImport, dateOrder, plan, previewImport, readDate, readHeader } from "../lib/importer.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toCsv, unquote } from "../lib/csv.ts";
import { addField, listFields } from "../lib/fields.ts";
import type { Colleague } from "../lib/people.ts";
import { profile, updateJob } from "../lib/profiles.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, sofia, tom } from "./support/members.ts";

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
const colleagues: Colleague[] = everyone.map(m => ({ id: m.id, name: m.name, firstName: m.firstName, lastName: m.lastName, photo: null, role: m.role, locale: "en", email: "" }));
const withEmails: Colleague[] = colleagues.map(c => ({ ...c, email: c.firstName.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase() + "@example.test" }));
const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

test("BambooHR's employee report: 'Employee #' left out, First/Last Name, 'Reporting to', US dates asked, matched by work email", () => {
  // Columns as BambooHR's standard reports write them (sources in THIRD_PARTY.md).
  const csv = fixture("bamboohr-employee-report.csv");
  const p = plan(csv, withEmails);
  assert.equal(p.missing, null);
  assert.deepEqual(p.targets, ["skip", "first", "last", "skip", "title", "team", "skip", "office", "manager", "startDate", "email", "phone", "skip", "skip"]);
  // Every date could be day- or month-first: HR is asked; BambooHR's guess is month-first.
  assert.deepEqual([p.askDateOrder, p.dateOrder], [true, "mdy"]);
  const hugoRow = p.rows.find(r => r.memberId === hugo.id)!;
  assert.deepEqual(hugoRow.changes, { title: "Account Manager", team: "Sales", office: "Lyon", manager: "Moreau, Inès", startDate: "2023-10-03" });
  assert.equal(hugoRow.managerId, ines.id);
  assert.equal(p.rows.find(r => r.memberId === lea.id)?.changes.startDate, "2022-02-06");
  assert.deepEqual(p.rows.find(r => r.name === "Jean Inconnu")?.skip, "not_found");
  // HR says the file is day-first: the same cells read the other way.
  const dayFirst = plan(csv, withEmails, [], { targets: p.targets, dateOrder: "dmy" });
  assert.equal(dayFirst.rows.find(r => r.memberId === hugo.id)?.changes.startDate, "2023-03-10");
  // The mobile phone instead of the work phone: HR maps the columns.
  const targets = [...p.targets];
  targets[11] = "skip";
  targets[12] = "phone";
  assert.equal(plan(csv, withEmails, [], { targets }).rows.find(r => r.memberId === hugo.id)?.changes.phone, "+33 6 98 76 54 32");
  // A mapping of another width, or twice the same column: refused.
  assert.throws(() => plan(csv, withEmails, [], { targets: ["name"] }), refused("import_invalid"));
  assert.throws(() => plan(csv, withEmails, [], { targets: targets.map(() => "title") }), refused("import_invalid"));
  // Without addresses from the Chest, names still match (accents aside).
  assert.equal(plan(csv, colleagues).rows.filter(r => r.memberId && !r.skip).length, 5);
});

test("Lucca's export: semicolons, Nom + Prénom in capitals, 'Matricule' left out, day-first dates", () => {
  const p = plan(fixture("lucca-collaborateurs.csv"), colleagues);
  assert.deepEqual(p.targets, ["skip", "last", "first", "title", "team", "office", "manager", "startDate", "email"]);
  assert.equal(p.askDateOrder, false);
  assert.deepEqual(p.rows.map(r => [r.memberId, r.managerId, r.changes.startDate]), [[nora.id, ines.id, "2026-09-22"], [sofia.id, camille.id, "2024-02-01"]]);
});

test("header words and date orders", () => {
  assert.deepEqual(readHeader(["Employee #", "Name", "Supervisor"]), ["skip", "name", "manager"]);
  assert.deepEqual(readHeader(["Unknown", "Nom", "T-shirt"], [{ id: "4", label: "T-Shirt", editor: "person", kind: "text", options: [], alertDays: null }]), ["skip", "name", "x:4"]);
  assert.equal(dateOrder(["13/01/2024", "02/03/2024"]), "dmy");
  assert.equal(dateOrder(["01/13/2024"]), "mdy");
  assert.equal(dateOrder(["01/02/2024"]), "ambiguous");
  assert.equal(dateOrder(["2024-01-02", "05/05/2024"]), "none");
});

test("phones leave as they are; formulas behind a quote, taken back on import", () => {
  const csv = toCsv([["+33 6 98 76 54 32", "-12", "=HYPERLINK(\"x\")", "+cmd|' /C calc'!A0", "@SUM(A1)"]]);
  assert.equal(csv, "\uFEFF+33 6 98 76 54 32,-12,\"'=HYPERLINK(\"\"x\"\")\",'+cmd|' /C calc'!A0,'@SUM(A1)\r\n");
  assert.equal(unquote("'=A1"), "=A1");
  assert.equal(unquote("'bonjour"), "'bonjour");
});

test("a BambooHR-style export: names matched accents and order aside, US dates recognised, problems said", () => {
  const csv = [
    "Employee Name,Job Title,Department,Reports To,Work Phone,Location,Hire Date",
    "Ines Moreau,Head of sales,Sales,Camille Martin,+33 6 11 22 33 44,Lyon,03/01/2021",
    "BERNARD Hugo,Account manager,Sales,Inès Moreau,call me,Lyon,12/15/2023",
    "Jean Inconnu,Ghost,,,,,",
    "Hugo Bernard,Twice,,,,,",
    "Léa Dubois,Developer,Tech,Léa Dubois,,Remote,",
  ].join("\n");
  const p = plan(csv, colleagues);
  assert.deepEqual(p.columns, ["title", "team", "manager", "phone", "office", "startDate"]);
  assert.equal(p.dateOrder, "mdy");
  assert.deepEqual(p.rows.map(r => [r.line, r.memberId, r.skip]), [[2, ines.id, null], [3, hugo.id, null], [4, null, "not_found"], [5, hugo.id, "duplicate"], [6, lea.id, null]]);
  assert.deepEqual(p.rows[0]!.changes, { title: "Head of sales", team: "Sales", manager: "Camille Martin", phone: "+33 6 11 22 33 44", office: "Lyon", startDate: "2021-03-01" });
  assert.deepEqual(p.rows[1]!.problems, ["phone"]);
  assert.equal(p.rows[1]!.changes.startDate, "2023-12-15");
  assert.deepEqual(p.rows[4]!.problems, ["manager_self"]);
});

test("French spreadsheets: semicolons, Prénom + Nom, day-first dates", () => {
  const csv = "Prénom;Nom;Poste;Équipe;Date d’arrivée\nnora;petit;Assistante commerciale;Ventes;22/09/2026\n";
  const p = plan(csv, colleagues);
  assert.deepEqual(p.rows.map(r => [r.memberId, r.changes]), [[nora.id, { title: "Assistante commerciale", team: "Ventes", startDate: "2026-09-22" }]]);
  assert.equal(readDate("2024-02-29", "dmy"), "2024-02-29");
  assert.equal(readDate("5.4.2020", "dmy"), "2020-04-05");
  assert.throws(() => readDate("tomorrow", "dmy"), refused("invalid"));
  // Nothing to import, or nobody named: the plan asks HR what the columns hold.
  assert.equal(plan("Name\nHugo Bernard\n", colleagues).missing, "field");
  assert.equal(plan("Title,Team\nx,y\n", colleagues).missing, "name");
  assert.throws(() => plan("Name,Title\n", colleagues), refused("import_invalid"));
  assert.throws(() => plan(42, colleagues), refused("import_invalid"));
});

test("the import writes what is matched, leaves loops out, only for HR; the export round-trips", async () => {
  const { sql } = database;
  const hr = asMember(camille);
  await updateJob(sql, hr, camille.id, { managerId: tom.id });
  const csv = "Name,Title,Manager,Start date\nTom Walker,CTO,Camille Martin,2019-01-07\nHugo Bernard,Sales,Tom Walker,\n";
  await assert.rejects(previewImport(sql, asMember(hugo), csv), refused("forbidden"));
  await assert.rejects(applyImport(sql, asMember(hugo), csv), refused("forbidden"));
  assert.equal((await previewImport(sql, hr, csv)).rows.length, 2);
  const done = await applyImport(sql, hr, csv);
  assert.deepEqual(done, { updated: 2, skipped: 0, loops: ["Tom Walker"] });
  const t = await profile(sql, hr, tom.id);
  assert.deepEqual([t.title, t.startDate, t.managerId], ["CTO", "2019-01-07", null]);
  assert.equal((await profile(sql, hr, hugo.id)).managerId, tom.id);
  // Again: nothing changes.
  assert.equal((await applyImport(sql, hr, csv)).updated, 0);
  // Export, in each language, read back by the import.
  await sql`update profiles set title = '=HYPERLINK("x")' where member_id = ${hugo.id}`;
  await updateJob(sql, hr, hugo.id, { phone: "+33 6 98 76 54 32" });
  const shirt = await addField(sql, hr, { label: "T-shirt", editor: "person" });
  await sql`insert into field_values (member_id, field_id, value) values (${tom.id}, ${shirt.id}, 'M')`;
  const { entries: fresh } = await directory(sql, hr);
  const extras = await listFields(sql, hr);
  for (const words of [en.exportColumns, fr.exportColumns]) {
    const text = directoryCsv(fresh, words, extras);
    assert.ok(text.includes(",+33 6 98 76 54 32,"), "phone as it is");
    const extra = plan(text, colleagues, extras);
    assert.equal(extra.rows.find(r => r.memberId === tom.id)?.extras[shirt.id], "M");
    assert.equal(extra.rows.find(r => r.memberId === hugo.id)?.changes.phone, "+33 6 98 76 54 32");
    assert.equal(extra.rows.find(r => r.memberId === hugo.id)?.changes.title, '=HYPERLINK("x")');
    assert.ok(text.includes(`"'=HYPERLINK(""x"")"`), "formula quoted");
    const back = plan(text, colleagues);
    assert.deepEqual(back.columns, ["title", "team", "manager", "phone", "office", "startDate"]);
    assert.equal(back.rows.find(r => r.memberId === tom.id)?.changes.startDate, "2019-01-07");
    assert.equal(back.rows.find(r => r.memberId === hugo.id)?.managerId, tom.id);
  }
});
