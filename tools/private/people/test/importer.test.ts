import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { directory } from "../lib/directory.ts";
import { AppError } from "../lib/errors.ts";
import { directoryCsv } from "../lib/export.ts";
import { en } from "../lib/i18n/en.ts";
import { fr } from "../lib/i18n/fr.ts";
import { applyImport, plan, previewImport, readDate } from "../lib/importer.ts";
import type { Colleague } from "../lib/people.ts";
import { profile, updateJob } from "../lib/profiles.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, tom } from "./support/members.ts";

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
const colleagues: Colleague[] = everyone.map(m => ({ id: m.id, name: m.name, firstName: m.firstName, lastName: m.lastName, photo: null, role: m.role, locale: "en" }));

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
  assert.throws(() => plan("Name\nHugo Bernard\n", colleagues), refused("import_invalid"));
  assert.throws(() => plan("Title,Team\nx,y\n", colleagues), refused("import_invalid"));
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
  const { entries } = await directory(sql, hr);
  for (const words of [en.exportColumns, fr.exportColumns]) {
    const text = directoryCsv(entries, words);
    assert.ok(text.includes(`"'=HYPERLINK(""x"")"`), "formula quoted");
    const back = plan(text, colleagues);
    assert.deepEqual(back.columns, ["title", "team", "manager", "phone", "office", "startDate"]);
    assert.equal(back.rows.find(r => r.memberId === tom.id)?.changes.startDate, "2019-01-07");
    assert.equal(back.rows.find(r => r.memberId === hugo.id)?.managerId, tom.id);
  }
});
