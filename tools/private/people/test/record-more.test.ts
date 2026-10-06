import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { askChange, decideChange, waitingChange, waitingChanges, withdrawChange } from "../src/lib/changes.ts";
import { AppError } from "../src/lib/errors.ts";
import { ofRecord } from "../src/lib/journal.ts";
import { erase } from "../src/lib/lifecycle.ts";
import { endings } from "../src/lib/morning.ts";
import { employeeNumber, workDays } from "../src/shared/model.ts";
import { createRecord, linkRecord, listRecords, record, updateRecord, upcoming } from "../src/lib/records.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, nora, sofia, tom, seen } from "./support/members.ts";

// Round 3: the employee number, the work permit's end, the days worked,
// what People tells Leave of a record (events between tools), and changes
// the person asks for.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  process.env["CHEST_TOOL"] = "people";
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, capabilities: ["members", "files", "notifications"], emits: ["people.leaving", "people.leaving_cancelled", "people.record"], receivers: 1 });
});
after(async () => {
  await chest.close();
  await database.close();
});

const hr = asMember(camille);
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("employee numbers and days worked are checked as payroll writes them", () => {
  assert.deepEqual(["0017", " E-2041 ", "", null].map(employeeNumber), ["0017", "E-2041", "", ""]);
  for (const bad of ["=1+1", "a b", "x".repeat(31), 12]) assert.throws(() => employeeNumber(bad), (e: unknown) => e instanceof AppError);
  assert.deepEqual([workDays("3,1,2,1"), workDays([5]), workDays(""), workDays(null)], [[1, 2, 3], [5], null, null]);
  for (const bad of ["0", "8", "1,x", []]) assert.throws(() => workDays(bad), (e: unknown) => e instanceof AppError);
});

test("a record's employee number is unique; the work permit's end reminds HR 60 days before, and after it lapsed; days worked are kept", async () => {
  const { sql } = database;
  const a = await createRecord(sql, hr, { legalName: "DIALLO Aminata" });
  const b = await createRecord(sql, hr, { legalName: "GIRAUD Paul" });
  await updateRecord(sql, hr, a.id, { employeeNumber: "0017", workPermit: "Carte de séjour salarié n° 1", permitEnd: "2026-11-20", workingTime: "part", hours: "24", workDays: "1,2,3", startDate: "2023-09-04" });
  await assert.rejects(updateRecord(sql, hr, b.id, { employeeNumber: "0017" }), refused("number_taken"));
  await updateRecord(sql, hr, b.id, { employeeNumber: "0003" });
  const r = (await record(sql, hr, a.id)).record;
  assert.deepEqual([r.employeeNumber, r.permitEnd, r.workDays], ["0017", "2026-11-20", [1, 2, 3]]);
  assert.equal((await listRecords(sql, hr)).find(x => x.id === a.id)?.employeeNumber, "0017");
  // 60 days ahead: seen from 21 September, not from 20 September.
  assert.deepEqual((await upcoming(sql, "2026-09-21")).filter(u => u.id === a.id).map(u => [u.what, u.day]), [["permit", "2026-11-20"]]);
  assert.deepEqual((await upcoming(sql, "2026-09-20")).filter(u => u.id === a.id), []);
  // Lapsed: still said every morning until HR writes the new end.
  assert.deepEqual((await upcoming(sql, "2026-12-01")).filter(u => u.id === a.id).map(u => u.what), ["permit"]);
  chest.notifications.length = 0;
  await endings(sql, "2026-12-01");
  const told = chest.notifications.filter(n => n.member === camille.id && n.key === `record:${a.id}:permit:2026-11-20`).map(seen);
  assert.equal(told.length, 1);
  assert.match(told[0]!.title, /DIALLO Aminata a expiré le 20 novembre/u);
  // A day refused: an 8th day of the week.
  await assert.rejects(updateRecord(sql, hr, a.id, { workDays: "1,8" }), refused("invalid"));
});

test("People tells Leave what it needs of a linked record — number, first and last day, days, hours — only when one changed; never the rest", async () => {
  const { sql } = database;
  chest.published.length = 0;
  const { id } = await createRecord(sql, hr, { memberId: tom.id });
  // Created with nothing Leave needs but the member: told once.
  assert.deepEqual(chest.published.map(e => [e.type, e.data]), [["people.record", { "member": tom.id, employeeNumber: null, startDate: null, lastDay: null, workDays: null, weeklyHours: null }]]);
  await updateRecord(sql, hr, id, { employeeNumber: "0019", startDate: "2024-03-04", workingTime: "part", hours: "28", workDays: "1,2,3,4" });
  assert.deepEqual(chest.published.at(-1)?.data, { "member": tom.id, employeeNumber: "0019", startDate: "2024-03-04", lastDay: null, workDays: [1, 2, 3, 4], weeklyHours: 28 });
  // A change Leave does not need tells nothing.
  const before = chest.published.length;
  await updateRecord(sql, hr, id, { address: "1 rue de la Paix", nationality: "Britannique" });
  assert.equal(chest.published.length, before);
  await updateRecord(sql, hr, id, { endDate: "2026-12-31" });
  assert.equal((chest.published.at(-1)?.data as { lastDay: string }).lastDay, "2026-12-31");
  assert.match(chest.published.at(-1)!.key!, /^people:mbr_[a-z2-7]{26}:record:\d+$/u);
  // A record of someone without the Chest is never told.
  const other = await createRecord(sql, hr, { legalName: "NGUYEN Linh" });
  const n = chest.published.length;
  await updateRecord(sql, hr, other.id, { employeeNumber: "0026", startDate: "2026-08-20" });
  assert.equal(chest.published.length, n);
  // Linked to Hugo later: told for Hugo then.
  await linkRecord(sql, hr, other.id, hugo.id);
  assert.deepEqual(chest.published.at(-1)?.data, { "member": hugo.id, employeeNumber: "0026", startDate: "2026-08-20", lastDay: null, workDays: null, weeklyHours: null });
});

test("a change asked by the person: address and emergency contact only; HR accepts (the record changes) or declines; one waits at a time", async () => {
  const { sql } = database;
  const { id } = await createRecord(sql, hr, { memberId: nora.id });
  await updateRecord(sql, hr, id, { address: "3 rue des Lilas\n69003 Lyon", emergencyName: "Anne Petit" });
  // Only Nora asks for her own record; only the askable fields.
  await assert.rejects(askChange(sql, asMember(hugo), id, { address: "x" }), refused("not_found"));
  await assert.rejects(askChange(sql, asMember(ines), id, { address: "x" }), refused("not_found"));
  await assert.rejects(askChange(sql, asMember(nora), id, { job: "Boss" }), refused("invalid"));
  await assert.rejects(askChange(sql, asMember(nora), id, { address: "3 rue des Lilas\n69003 Lyon" }), refused("empty"));
  chest.notifications.length = 0;
  const asked = await askChange(sql, asMember(nora), id, { address: "8 quai Rambaud\n69002 Lyon", emergencyName: "Anne Petit", emergencyPhone: "06 12 34 56 78", note: "J’ai déménagé." });
  // Only what differs is asked.
  assert.deepEqual(asked.changes, { address: "8 quai Rambaud\n69002 Lyon", emergencyPhone: "06 12 34 56 78" });
  await assert.rejects(askChange(sql, asMember(nora), id, { address: "ailleurs" }), refused("already_asked"));
  // HR hears it; the record does not change yet.
  assert.deepEqual(chest.notifications.filter(n => n.key === `change:${asked.id}`).map(n => n.member).sort(), [camille.id, sofia.id].sort());
  assert.equal((await record(sql, hr, id)).record.address, "3 rue des Lilas\n69003 Lyon");
  assert.equal((await waitingChange(sql, asMember(nora), id))?.id, asked.id);
  assert.equal(await waitingChange(sql, asMember(hugo), id), null);
  assert.deepEqual((await waitingChanges(sql, hr)).map(w => w.legalName), ["Nora Petit"]);
  await assert.rejects(waitingChanges(sql, asMember(nora)), refused("forbidden"));
  await assert.rejects(decideChange(sql, asMember(nora), asked.id, true), refused("forbidden"));
  // Accepted: the record changes; the journal names the fields, never the values.
  await decideChange(sql, hr, asked.id, true);
  const now = (await record(sql, hr, id)).record;
  assert.deepEqual([now.address, now.emergencyPhone], ["8 quai Rambaud\n69002 Lyon", "06 12 34 56 78"]);
  const log = await ofRecord(sql, id);
  assert.deepEqual(log.filter(e => e.action.startsWith("change_")).map(e => [e.action, e.fields]), [["change_accepted", ["address", "emergencyPhone"]], ["change_asked", ["address", "emergencyPhone"]]]);
  assert.ok(!JSON.stringify(log).includes("Rambaud"));
  const [kept] = await sql<{ changes: unknown }[]>`select changes from record_requests where id = ${asked.id}`;
  assert.deepEqual(kept!.changes, ["address", "emergencyPhone"]);
  assert.equal(chest.notifications.filter(n => n.member === nora.id && n.key === `change:${asked.id}:answer`).length, 1);
  await assert.rejects(decideChange(sql, hr, asked.id, false), refused("not_found"));
  // Declined with a word; withdrawn by the person.
  const second = await askChange(sql, asMember(nora), id, { emergencyRelation: "Mère" });
  await decideChange(sql, hr, second.id, false, "Envoyez-moi un justificatif.");
  assert.equal((await record(sql, hr, id)).record.emergencyRelation, "");
  const third = await askChange(sql, asMember(nora), id, { emergencyRelation: "Mère" });
  await assert.rejects(withdrawChange(sql, asMember(hugo), third.id), refused("not_found"));
  await withdrawChange(sql, asMember(nora), third.id);
  assert.equal(await waitingChange(sql, hr, id), null);
});

test("an erasure takes the person's asked changes with it", async () => {
  const { sql } = database;
  const { id } = await createRecord(sql, hr, { memberId: ines.id });
  await askChange(sql, asMember(ines), id, { address: "1 place Bellecour" });
  await erase(sql, ines.id, "2026-09-29");
  const [left] = await sql<{ n: number }[]>`select count(*)::int as n from record_requests where member_id = ${ines.id}`;
  assert.equal(left!.n, 0);
});
