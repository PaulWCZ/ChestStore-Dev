import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../lib/errors.ts";
import { en } from "../lib/i18n/en.ts";
import { fr } from "../lib/i18n/fr.ts";
import { ofRecord, ofRegister } from "../lib/journal.ts";
import { endings } from "../lib/morning.ts";
import { numbers, workersOf } from "../lib/numbers.ts";
import {
  addDocument, createForEveryone, createRecord, deleteRecord, documentUpload, linkRecord, listRecords, missing, openDocument, purgeRecords, record, recordIdOf,
  removeDocument, updateRecord, upcoming,
} from "../lib/records.ts";
import { mentions, register, registerCsv, registerGaps } from "../lib/register.ts";
import { plainName } from "../lib/people.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, paul, sofia, tom } from "./support/members.ts";
import { updateJob } from "../lib/profiles.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications"] });
});
after(async () => {
  await chest.close();
  await database.close();
});

const hr = asMember(camille);
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("a record: HR creates and edits it, its person reads it, nobody else — every other reading noted, field names only", async () => {
  const { sql } = database;
  await updateJob(sql, hr, nora.id, { title: "Sales assistant", startDate: "2026-09-22", managerId: ines.id });
  await assert.rejects(createRecord(sql, asMember(nora), { memberId: nora.id }), refused("forbidden"));
  await assert.rejects(createRecord(sql, hr, { memberId: "mbr_" + "z".repeat(26) }), refused("not_member"));
  const { id } = await createRecord(sql, hr, { memberId: nora.id });
  // Filled with what People knew, for HR to check.
  const first = (await record(sql, hr, id)).record;
  assert.deepEqual([first.legalName, first.job, first.startDate, first.contract], ["Nora Petit", "Sales assistant", "2026-09-22", "permanent"]);
  // Creating it again answers the same record.
  assert.equal((await createRecord(sql, hr, { memberId: nora.id })).id, id);

  const changed = await updateRecord(sql, hr, id, {
    legalName: "PETIT Nora Marie", sex: "female", birthDate: "1998-04-02", nationality: "Française", qualification: "Employée, niveau 2", contract: "fixed_term",
    workingTime: "part", hours: "24,5", trialEnd: "2026-10-21", contractEnd: "2027-03-21", emergencyName: "Paul Petit", emergencyRelation: "Frère", emergencyPhone: "06 11 22 33 44", address: "3 rue des Lilas\n69003 Lyon",
  });
  assert.equal(changed.changed.length, 14);
  assert.deepEqual((await updateRecord(sql, hr, id, { nationality: "Française" })).changed, []);
  // Refusals, each with its code.
  await assert.rejects(updateRecord(sql, hr, id, { contract: "zero_hours" }), refused("invalid"));
  await assert.rejects(updateRecord(sql, hr, id, { endDate: "2026-01-01" }), refused("dates"));
  await assert.rejects(updateRecord(sql, hr, id, { hours: "80" }), refused("invalid"));
  await assert.rejects(updateRecord(sql, hr, id, { salary: "3000" }), refused("invalid"));
  await assert.rejects(updateRecord(sql, hr, id, { tutorId: "mbr_" + "z".repeat(26) }), refused("not_member"));
  await assert.rejects(updateRecord(sql, asMember(ines), id, { nationality: "x" }), refused("forbidden"));

  // Nora reads her own; Inès (her manager) and Hugo are told it does not exist.
  const mine = await record(sql, asMember(nora), id);
  assert.equal(mine.access, "read");
  assert.equal(mine.record.hours, 24.5);
  await assert.rejects(record(sql, asMember(ines), id), refused("not_found"));
  await assert.rejects(record(sql, asMember(hugo), id), refused("not_found"));
  await assert.rejects(record(sql, asMember(paul), id), refused("not_found"));
  assert.equal(await recordIdOf(sql, asMember(ines), nora.id), null);
  assert.equal(await recordIdOf(sql, asMember(nora), nora.id), id);
  await assert.rejects(listRecords(sql, asMember(nora)), refused("forbidden"));

  // The journal: Camille created, changed and read it (once for two quick
  // readings); Nora's own readings are not noted; never a value.
  await record(sql, hr, id);
  const log = await ofRecord(sql, id);
  assert.deepEqual(log.map(e => [e.actor, e.action]).reverse(), [[camille.id, "created"], [camille.id, "viewed"], [camille.id, "changed"]]);
  assert.ok(log.find(e => e.action === "changed")!.fields.includes("emergencyPhone"));
  assert.equal(JSON.stringify(log).includes("Lilas"), false);
});

test("records for everyone at once, someone without the Chest, linking, and a record made by mistake", async () => {
  const { sql } = database;
  const made = await createForEveryone(sql, hr);
  assert.equal(made, everyone.length - 1);
  assert.equal(await createForEveryone(sql, hr), 0);
  const outside = await createRecord(sql, hr, { legalName: "  Marc   Lefèvre " });
  assert.equal((await record(sql, hr, outside.id)).record.legalName, "Marc Lefèvre");
  await assert.rejects(createRecord(sql, hr, { legalName: "" }), refused("empty"));
  // Linked to a member already having a record: refused; unlinking works.
  await assert.rejects(linkRecord(sql, hr, outside.id, hugo.id), refused("invalid"));
  await linkRecord(sql, hr, outside.id, null);
  // Someone who worked here stays (the register); a mistake goes.
  await updateRecord(sql, hr, outside.id, { startDate: "2025-02-03" });
  await assert.rejects(deleteRecord(sql, hr, outside.id, "2026-09-29"), refused("started"));
  await updateRecord(sql, hr, outside.id, { startDate: "2026-12-01" });
  await deleteRecord(sql, hr, outside.id, "2026-09-29");
  await assert.rejects(record(sql, hr, outside.id), refused("not_found"));
});

test("documents: uploaded by HR through the Chest, opened by HR and the person only, removed with their file", async () => {
  const { sql } = database;
  const id = (await listRecords(sql, hr)).find(r => r.memberId === nora.id)!.id;
  await assert.rejects(documentUpload(sql, asMember(nora), id, { type: "application/pdf", size: 1000 }), refused("forbidden"));
  await assert.rejects(documentUpload(sql, hr, id, { type: "application/x-msdownload", size: 1000 }), refused("type_refused"));
  await assert.rejects(documentUpload(sql, hr, id, { type: "application/pdf", size: 30 << 20 }), refused("too_large"));
  const pdf = new TextEncoder().encode("%PDF-1.4\n% contrat\n");
  const up = await documentUpload(sql, hr, id, { type: "application/pdf", size: pdf.length });
  const sent = await chest.upload(up.url, pdf, "application/pdf");
  assert.equal(sent.status, 201);
  const { name } = await sent.json() as { name: string };
  assert.match(name, new RegExp(`^records/${id}/`, "u"));
  // Only an object of this record's folder is accepted.
  await assert.rejects(addDocument(sql, hr, id, { object: "records/999/0123456789abcdef0123.pdf", name: "x.pdf", kind: "contract" }), refused("invalid"));
  const doc = await addDocument(sql, hr, id, { object: name, name: "Contrat CDD.pdf", kind: "contract" });
  assert.deepEqual([doc.kind, doc.type, doc.size], ["contract", "application/pdf", pdf.length]);
  assert.match(await openDocument(sql, asMember(nora), id, doc.id), /_chest\/files/u);
  assert.match(await openDocument(sql, hr, id, doc.id), /_chest\/files/u);
  await assert.rejects(openDocument(sql, asMember(ines), id, doc.id), refused("not_found"));
  const log = await ofRecord(sql, id);
  assert.ok(log.some(e => e.action === "document_opened" && e.actor === camille.id && e.fields[0] === "contract"));
  assert.equal(log.some(e => e.action === "document_opened" && e.actor === nora.id), false);
  await removeDocument(sql, hr, id, doc.id);
  assert.equal(chest.files.has(name), false);
  await assert.rejects(removeDocument(sql, hr, id, doc.id), refused("not_found"));
});

test("the staff register: hiring order, interns apart, mentions, missing details, CSV in each language; its readings noted", async () => {
  const { sql } = database;
  const all = await listRecords(sql, hr);
  const of = (m: string) => all.find(r => r.memberId === m)!.id;
  await updateRecord(sql, hr, of(camille.id), { startDate: "2019-01-07", sex: "female", birthDate: "1985-06-01", nationality: "Française", job: "Office manager", qualification: "Cadre" });
  await updateRecord(sql, hr, of(tom.id), { startDate: "2021-03-01", contract: "temporary", agency: "Intérim Plus\n12 rue du Port, 69002 Lyon", sex: "male", birthDate: "1990-02-02", nationality: "Britannique", job: "Developer", qualification: "Technicien", workPermit: "Titre de séjour salarié n° 123" });
  await updateRecord(sql, hr, of(lea.id), { startDate: "2026-06-01", contract: "internship", contractEnd: "2026-11-30", tutorId: tom.id, workplace: "Lyon" });
  await updateRecord(sql, hr, of(hugo.id), { startDate: "2020-05-04", endDate: "2026-08-31" });
  await assert.rejects(register(sql, asMember(nora), "register_viewed"), refused("forbidden"));
  const r = await register(sql, hr, "register_viewed");
  assert.deepEqual(r.employees.map(l => [l.number, l.name]).slice(0, 3), [[1, "Camille Martin"], [2, "Hugo Bernard"], [3, "Tom Walker"]]);
  assert.deepEqual(r.interns.map(l => [l.number, l.name, l.tutorId, l.contractEnd]), [[1, "Léa Dubois", tom.id, "2026-11-30"]]);
  const tomLine = r.employees.find(l => l.name === "Tom Walker")!;
  assert.equal(mentions(tomLine, fr.register.mention), "Salarié temporaire (Intérim Plus, 12 rue du Port, 69002 Lyon)");
  assert.deepEqual(r.employees.find(l => l.name === "Hugo Bernard")!.missing, ["sex", "birthDate", "nationality", "job", "qualification"]);
  assert.deepEqual(missing((await record(sql, hr, of(nora.id))).record), []);
  const nora_ = r.employees.find(l => l.name === "PETIT Nora Marie")!;
  assert.equal(mentions(nora_, en.register.mention), "Fixed-term contract · Part-time");
  for (const words of [en, fr]) {
    const csv = registerCsv(r, { ...words.register.columns, sexes: words.record.sexes, mention: words.register.mention }, id => (id === tom.id ? "Tom Walker" : ""));
    assert.ok(csv.includes(words.register.columns.employees));
    assert.ok(csv.includes("\r\n1,Léa Dubois,2026-06-01,2026-11-30,Tom Walker,Lyon\r\n"));
  }
  await register(sql, hr, "register_exported");
  assert.deepEqual((await ofRegister(sql)).map(e => e.action), ["register_exported", "register_viewed"]);
});

test("the register never leaves someone out silently: no record, no first day, gone without an exit date, an intern's tutor gone — on screen, in the CSV", async () => {
  const { sql } = database;
  const sam = await createRecord(sql, hr, { legalName: "Sam Durand" });
  const r = await register(sql, hr, "register_viewed");
  const newcomer = { id: "mbr_" + "z".repeat(26), name: "Zoé Nouvelle" };
  // Tom has left the Chest: the directory no longer lists him.
  const directory = [...everyone.filter(m => m.id !== tom.id).map(m => ({ id: m.id, name: m.name })), newcomer];
  await assert.rejects(registerGaps(sql, asMember(nora), r, directory, "2026-09-29"), refused("forbidden"));
  const g = await registerGaps(sql, hr, r, directory, "2026-09-29");
  assert.deepEqual(g.withoutRecord, [newcomer]);
  assert.ok(g.noStart.some(x => x.recordId === sam.id && x.name === "Sam Durand"));
  assert.deepEqual(g.noExit.map(x => x.name), ["Tom Walker"]);
  assert.deepEqual(g.tutorLeft.map(x => x.name), ["Léa Dubois"]);
  for (const words of [en, fr]) {
    const csv = registerCsv(r, { ...words.register.columns, sexes: words.record.sexes, mention: words.register.mention }, () => "", g, words.register.gaps);
    const tail = csv.slice(csv.indexOf(words.register.gaps.title));
    assert.ok(tail.includes(`Zoé Nouvelle,${words.register.gaps.withoutRecord}`), tail);
    assert.ok(tail.includes("Sam Durand,") && tail.includes("Tom Walker,"));
  }
  // Nothing missing: nothing added to the file.
  const none = { withoutRecord: [], noStart: [], noExit: [], tutorLeft: [] };
  assert.ok(!registerCsv(r, { ...en.register.columns, sexes: en.record.sexes, mention: en.register.mention }, () => "", none, en.register.gaps).includes(en.register.gaps.title));
  // A printed register writes a person's name, never the app's "(former member)".
  assert.equal(plainName({ id: tom.id, name: "Tom Walker", photo: null, status: "former", locale: "en" }, "fr"), "Tom Walker");
  assert.equal(plainName({ id: tom.id, name: "", photo: null, status: "erased", locale: "en" }, "en"), en.people.erased);
  await deleteRecord(sql, hr, sam.id, "2026-09-29");
});

test("what is coming up; the bell tells HR in their language; records go five years after the person left", async () => {
  const { sql } = database;
  const all = await listRecords(sql, hr);
  const noraId = all.find(r => r.memberId === nora.id)!.id;
  const soon = await upcoming(sql, "2026-10-10");
  assert.deepEqual(soon.filter(s => s.id === noraId).map(s => [s.what, s.day]), [["trial", "2026-10-21"]]);
  await endings(sql, "2026-10-10");
  const told = chest.notifications.filter(n => n.key === `record:${noraId}:trial:2026-10-21`);
  assert.deepEqual(told.map(n => n.member).sort(), [camille.id, sofia.id].sort());
  assert.equal(told.find(n => n.member === camille.id)!.title, "La période d’essai de Nora Petit se termine le 21 octobre");
  assert.equal(told.find(n => n.member === sofia.id)!.title, "Nora Petit’s trial period ends on 21 October");
  const hugoId = all.find(r => r.memberId === hugo.id)!.id;
  assert.equal(await purgeRecords(sql, "2031-08-31"), 0);
  assert.equal(await purgeRecords(sql, "2031-09-01"), 1);
  await assert.rejects(record(sql, hr, hugoId), refused("not_found"));
});

test("HR's numbers: one population everywhere — records of people here and members without one; by team, contract, months, turnover", () => {
  const directory = [
    { id: "mbr_a", team: "Sales", office: "Lyon", startDate: "2020-01-01" },
    { id: "mbr_b", team: "Sales", office: "Paris", startDate: null },
    { id: "mbr_c", team: "", office: "Lyon", startDate: "2026-04-01" },
  ];
  const records = [
    { memberId: "mbr_a", contract: "permanent" as const, startDate: "2020-01-01", endDate: null },
    { memberId: null, contract: "permanent" as const, startDate: "2020-01-01", endDate: "2026-03-15" },
    { memberId: null, contract: "fixed_term" as const, startDate: "2026-02-02", endDate: null },
    { memberId: "mbr_b", contract: "internship" as const, startDate: "2021-01-01", endDate: null },
    // Left the Chest, no exit date written: not counted today.
    { memberId: "mbr_gone", contract: "permanent" as const, startDate: "2019-05-01", endDate: null },
  ];
  const workers = workersOf(records, directory);
  assert.equal(workers.filter(w => w.gone).length, 1);
  const n = numbers(workers, "2026-09-29");
  // a (record), b (intern record), the fixed-term record without the Chest, c (no record).
  assert.equal(n.headcount, 4);
  const sum = (list: { count: number }[]) => list.reduce((x, c) => x + c.count, 0);
  assert.deepEqual([sum(n.byTeam), sum(n.byOffice), sum(n.byContract)], [4, 4, 4]);
  assert.deepEqual(n.byTeam, [{ label: "", count: 2 }, { label: "Sales", count: 2 }]);
  assert.deepEqual(n.byContract, [{ contract: "permanent", count: 1 }, { contract: "fixed_term", count: 1 }, { contract: "internship", count: 1 }, { contract: null, count: 1 }]);
  assert.equal(n.months.length, 12);
  assert.deepEqual([n.months[0]!.month, n.months[11]!.month], ["2025-10", "2026-09"]);
  assert.deepEqual(n.months.find(m => m.month === "2026-03"), { month: "2026-03", arrivals: 0, departures: 1 });
  assert.deepEqual(n.months.find(m => m.month === "2026-04"), { month: "2026-04", arrivals: 1, departures: 0 });
  // (2 arrivals + 1 departure) / 2 over the 3 employees here on 1 October
  // 2025 (a, the one who left in March, the one gone from the Chest): the
  // intern b is not an employee, left out of the turnover.
  assert.equal(n.turnover, 50);
  // An intern arriving changes the headcount, never the turnover.
  const more = numbers(workersOf([...records, { memberId: null, contract: "internship" as const, startDate: "2026-08-20", endDate: null }], directory), "2026-09-29");
  assert.deepEqual([more.headcount, more.turnover], [5, 50]);
  const none = numbers(workersOf([], directory), "2026-09-29");
  assert.deepEqual([none.fromRecords, none.headcount, none.byContract], [false, 3, [{ contract: null, count: 3 }]]);
});
