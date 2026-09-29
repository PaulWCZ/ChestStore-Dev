import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import { AppError } from "../lib/app-error.ts";
import * as balances from "../lib/balances.ts";
import { addDays, addMonths } from "../lib/calendar.ts";
import { en } from "../lib/i18n/en.ts";
import { fr } from "../lib/i18n/fr.ts";
import { planImport, planLeave, type KindNames } from "../lib/import.ts";
import { today } from "../lib/model.ts";
import * as requests from "../lib/requests.ts";
import { saveType, types } from "../lib/rules.ts";
import { setupSteps } from "../lib/setup.ts";
import { setApprover, setEmployeeNumber, setEndDate, setStartDate, setWorkDays, staffRow } from "../lib/staff.ts";
import * as tell from "../lib/tell.ts";
import { quietMonday, week } from "./support/dates.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, hugo, ines, lea, nora, sofia, tom } from "./support/members.ts";

// People as payroll needs them: last days, weeks, employee numbers; leave
// recorded for someone; the imports from Lucca's files; HR's first run.
let database: TestDatabase;
let chest: FakeChest;
let paid: string, rtt: string, sick: string, family: string, remote: string;
let kinds: KindNames[];
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, groups: fakeGroups });
  const all = await types(database.sql);
  const id = (key: string) => all.find(t => t.key === key)!.id;
  [paid, rtt, sick, family, remote] = [id("paid"), id("rtt"), id("sick"), id("family"), id("remote")];
  kinds = all.map(t => ({ typeId: t.id, key: t.key, split: t.period === "acquired", names: [t.name ?? "", ...(t.key ? [en.types[t.key], fr.types[t.key], t.key] : [])] }));
});
after(async () => {
  await chest.close();
  await database.close();
});
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
const directory = () => everyone.map(p => ({ id: p.id, name: p.name, firstName: p.firstName, lastName: p.lastName }));
const of = async (person: typeof hugo, type = paid) => (await balances.balances(database.sql, asMember(camille), person.id)).find(b => b.typeId === type)!;

test("HR's first run: three steps, ticked as they are done", async () => {
  const { sql } = database;
  let steps = await setupSteps(sql);
  assert.deepEqual(steps.list.map(s => [s.key, s.done]), [["rules", false], ["balances", false], ["approvers", false]]);
  await sql`update settings set updated_at = now(), updated_by = ${camille.id}`;
  await setStartDate(sql, asMember(camille), sofia.id, "2023-06-12");
  await setApprover(sql, asMember(camille), hugo.id, ines.id);
  steps = await setupSteps(sql);
  assert.ok(steps.done);
});

test("a person's last day, week and employee number: HR only; numbers are nobody else's", async () => {
  const { sql } = database;
  await assert.rejects(setEndDate(sql, asMember(ines), hugo.id, today()), refused("forbidden"));
  await assert.rejects(setWorkDays(sql, asMember(hugo), hugo.id, [1, 2]), refused("forbidden"));
  await assert.rejects(setWorkDays(sql, asMember(camille), hugo.id, []), refused("invalid"));
  await assert.rejects(setWorkDays(sql, asMember(camille), hugo.id, [1, 1, 9]), refused("invalid"));
  await setWorkDays(sql, asMember(camille), tom.id, [3, 1, 2]);
  assert.deepEqual((await staffRow(sql, tom.id)).workDays, [1, 2, 3]);
  await setWorkDays(sql, asMember(camille), sofia.id, [1, 2, 3, 4, 5]);
  assert.equal((await staffRow(sql, sofia.id)).workDays, null);
  await setEmployeeNumber(sql, asMember(camille), tom.id, " 0019 ");
  assert.equal((await staffRow(sql, tom.id)).employeeNumber, "0019");
  await assert.rejects(setEmployeeNumber(sql, asMember(camille), lea.id, "0019"), refused("number_taken"));
  await assert.rejects(setEmployeeNumber(sql, asMember(ines), lea.id, "0020"), refused("forbidden"));
});

test("a part-timer's leave is counted on their week: to the day before they are back", async () => {
  const { sql } = database;
  await setApprover(sql, asMember(camille), tom.id, lea.id);
  const monday = quietMonday(30);
  // Tom works Monday to Wednesday: Monday to Wednesday off costs a full week.
  const r = await requests.createRequest(sql, asMember(tom), { typeId: paid, start: monday, startHalf: "am", end: addDays(monday, 2), endHalf: "pm" });
  assert.equal(r.days, 5);
  // His Thursday alone costs nothing.
  await assert.rejects(requests.createRequest(sql, asMember(tom), { typeId: paid, start: addDays(monday, 10), startHalf: "am", end: addDays(monday, 10), endHalf: "pm" }), refused("no_days"));
  // RTT: only the days he works.
  const t = await requests.createRequest(sql, asMember(tom), { typeId: rtt, ...week(addDays(monday, 14)) });
  assert.equal(t.days, 3);
});

test("HR, or the person's approver, records leave for them: approved at once, the person told; nobody else may", async () => {
  const { sql } = database;
  chest.notifications.length = 0;
  const monday = quietMonday(60);
  const r = await requests.createRequest(sql, asMember(camille), { typeId: sick, ...week(monday), memberId: nora.id });
  assert.equal(r.memberId, nora.id);
  assert.equal(r.status, "approved");
  assert.equal(r.decidedBy, camille.id);
  assert.deepEqual((await requests.history(sql, asMember(camille), r.id)).map(s => [s.kind, s.actor]), [["recorded", camille.id]]);
  await tell.recorded(sql, asMember(camille), r);
  assert.equal(chest.notifications.find(n => n.member === nora.id)?.title, "Camille Martin recorded leave for you");
  // Ines answers Hugo's requests: she records his; not Tom's.
  const h = await requests.createRequest(sql, asMember(ines), { typeId: paid, ...week(monday), memberId: hugo.id });
  assert.equal(h.status, "approved");
  assert.equal((await of(hugo)).pending, 0);
  await assert.rejects(requests.createRequest(sql, asMember(ines), { typeId: paid, ...week(monday), memberId: tom.id }), refused("not_found"));
  await assert.rejects(requests.createRequest(sql, asMember(sofia), { typeId: paid, ...week(monday), memberId: hugo.id }), refused("not_found"));
  await assert.rejects(requests.createRequest(sql, asMember(camille), { typeId: paid, ...week(monday), memberId: hugo.id }), refused("overlap_someone"));
});

test("a family event for someone part-time counts only the days they work, not the paid-leave rule (Mon–Wed, Mon 2 – Thu 5: 3 days, not 5)", async () => {
  const { sql } = database;
  const monday = quietMonday(120);
  await setWorkDays(sql, asMember(camille), lea.id, [1, 2, 3]);
  try {
    const q = await requests.quote(sql, asMember(lea), { typeId: family, start: monday, startHalf: "am", end: addDays(monday, 3), endHalf: "pm", event: "wedding" });
    assert.equal(q.days, 3);
    // Paid leave over the same days keeps the legal rule: to the day before she is back.
    const p = await requests.quote(sql, asMember(lea), { typeId: paid, start: monday, startHalf: "am", end: addDays(monday, 2), endHalf: "pm" });
    assert.equal(p.days, 5);
  } finally {
    await setWorkDays(sql, asMember(camille), lea.id, null);
  }
});

test("a family event says which one; a kind that may not go below zero refuses more than is left", async () => {
  const { sql } = database;
  const monday = quietMonday(90);
  await assert.rejects(requests.createRequest(sql, asMember(sofia), { typeId: family, ...week(monday) }), refused("no_event"));
  await assert.rejects(requests.createRequest(sql, asMember(sofia), { typeId: family, ...week(monday), event: "party" }), refused("no_event"));
  await assert.rejects(requests.createRequest(sql, asMember(sofia), { typeId: paid, ...week(monday), event: "wedding" }), refused("invalid"));
  const w = await requests.createRequest(sql, asMember(sofia), { typeId: family, start: monday, startHalf: "am", end: addDays(monday, 3), endHalf: "pm", event: "wedding" });
  assert.equal(w.event, "wedding");
  assert.equal(w.days, 4);
  await balances.setOpening(sql, asMember(camille), { memberId: sofia.id, typeId: rtt, days: 2 });
  await saveType(sql, asMember(camille), rtt, { overdraw: false });
  try {
    await assert.rejects(requests.createRequest(sql, asMember(sofia), { typeId: rtt, ...week(addDays(monday, 7)) }), refused("not_enough"));
    await requests.createRequest(sql, asMember(sofia), { typeId: rtt, start: addDays(monday, 7), startHalf: "am", end: addDays(monday, 8), endHalf: "pm" });
    // Two days waiting: nothing more may be asked.
    await assert.rejects(requests.createRequest(sql, asMember(sofia), { typeId: rtt, start: addDays(monday, 9), startHalf: "am", end: addDays(monday, 9), endHalf: "am" }), refused("not_enough"));
  } finally {
    await saveType(sql, asMember(camille), rtt, { overdraw: true });
  }
  // Remote work: recorded at once, and colleagues see it as such.
  const home = await requests.createRequest(sql, asMember(sofia), { typeId: remote, start: addDays(monday, 14), startHalf: "am", end: addDays(monday, 14), endHalf: "pm" });
  assert.equal(home.status, "approved");
  const seen = (await requests.between(sql, asMember(hugo), addDays(monday, 14), addDays(monday, 14))).find(e => e.id === home.id)!;
  assert.deepEqual([seen.typeId, seen.away], [remote, false]);
});

test("someone who leaves: their last day is set, nothing is earned after it, no leave after it", async () => {
  const { sql } = database;
  await setStartDate(sql, asMember(camille), lea.id, addMonths(today(), -14));
  const before = await of(lea);
  assert.equal(before.months, 14);
  assert.equal(await chest.emit({ type: "member.removed", data: { id: lea.id } }, POST), 204);
  assert.equal((await staffRow(sql, lea.id)).endDate, today());
  const now = await of(lea);
  assert.equal(now.until, today());
  assert.equal(now.left, before.left);
  // A last day HR set first is kept.
  await setEndDate(sql, asMember(camille), sofia.id, addDays(today(), 20));
  assert.equal(await chest.emit({ type: "access.revoked", data: { id: sofia.id } }, POST), 204);
  assert.equal((await staffRow(sql, sofia.id)).endDate, addDays(today(), 20));
  await assert.rejects(requests.createRequest(sql, asMember(sofia), { typeId: paid, ...week(quietMonday(40)) }), refused("left_company"));
  await setEndDate(sql, asMember(camille), sofia.id, null);
});

test("Lucca's balances: Nom and Prénom joined, CP N-1 and CP N, start dates and employee numbers; an unknown column asked about", async () => {
  const plan = planImport(fixture("lucca-balances.csv"), kinds.filter(k => k.typeId === paid || k.typeId === rtt), directory());
  assert.deepEqual(plan.columns.map(c => c.field), ["number", "lastName", "firstName", "start", `b:${paid}:acquired`, `b:${paid}:earning`, `b:${rtt}:total`, "ignore"]);
  assert.ok(plan.columns.every(c => c.known));
  assert.deepEqual(plan.rows.map(r => [r.memberId, r.problem]), [[ines.id, null], [lea.id, null], [tom.id, null], [null, "unknown"]]);
  assert.deepEqual(plan.rows[0]!.values, [{ typeId: paid, days: 12.5, earning: 8.33 }, { typeId: rtt, days: 4, earning: null }]);
  assert.equal(plan.rows[0]!.start, "2021-09-06");
  assert.equal(plan.rows[0]!.number, "0007");
  // Known numbers recognise a line; a number that is someone else's is said.
  const withNumbers = directory().map(p => ({ ...p, employeeNumber: p.id === tom.id ? "0019" : p.id === hugo.id ? "0012" : null }));
  const byNumber = planImport(fixture("lucca-balances.csv"), kinds, withNumbers);
  assert.deepEqual(byNumber.rows.map(r => r.problem), [null, "number_taken", null, "unknown"]);
  assert.equal(planImport("Matricule;RTT\n0019;3\n", kinds, withNumbers).rows[0]!.memberId, tom.id);
  // A header nobody knows: shown, then mapped by HR.
  const odd = "Salarié;Solde congés annuels\nInès Moreau;7,5\n";
  const asked = planImport(odd, kinds, directory());
  assert.deepEqual([asked.rows, asked.columns.map(c => [c.field, c.known])], [[], [["name", true], ["ignore", false]]]);
  assert.throws(() => planImport("Salarié;Email\nInès Moreau;x\n", kinds, directory()), refused("import_invalid"));
  assert.equal(planImport("Employee;Annual leave balance\nInès Moreau;7,5\n", kinds, directory()).columns[1]!.field, `b:${paid}:total`);
  const mapped = planImport(odd, kinds, directory(), { 1: `b:${paid}:acquired` });
  assert.deepEqual(mapped.rows[0]!.values, [{ typeId: paid, days: 7.5, earning: null }]);
  assert.equal(planImport("Name;Paid leave\nInès Moreau;3\n", kinds, directory(), { 1: "b:999:total" }).columns[1]!.field, `b:${paid}:total`);
  // Applied: two parts of paid leave, as of the file's day.
  const { sql } = database;
  const rows = plan.rows.filter(r => r.problem === null && r.memberId).flatMap(r => r.values.map(v => ({ memberId: r.memberId!, ...v })));
  await balances.openings(sql, asMember(camille), rows, today(), "Lucca");
  const b = await of(ines);
  assert.deepEqual([b.acquired, b.earning, b.left], [12.5, 8.33, 20.83]);
});

test("Lucca's approved leave: its absence export as it is; kinds by name or mapped; not approved lines left out", async () => {
  // The file's dates, moved to come after today.
  const shift = Number(today().slice(0, 4)) - 2026 + (today().slice(5) >= "12-01" ? 1 : 0);
  const text = fixture("lucca-absences.csv").replace(/\/(20\d\d),/gu, (_, y: string) => `/${Number(y) + shift},`);
  const people = directory().map(p => ({ ...p, employeeNumber: p.id === tom.id ? "0019" : null }));
  const plan = planLeave(text, kinds, people);
  assert.deepEqual(plan.columns.map(c => c.field), ["ignore", "number", "lastName", "firstName", "kind", "from", "fromHalf", "to", "toHalf", "status"]);
  assert.deepEqual(plan.rows.map(r => [r.memberId, r.typeId, r.problem]), [[ines.id, paid, null], [lea.id, rtt, null], [tom.id, null, "unknown_kind"], [tom.id, paid, "not_approved"]]);
  assert.deepEqual(plan.unknownKinds, ["104"]);
  assert.deepEqual([plan.rows[1]!.startHalf, plan.rows[1]!.endHalf], ["pm", "pm"]);
  const mapped = planLeave(text, kinds, people, {}, { "104": rtt });
  assert.deepEqual([mapped.rows[2]!.typeId, mapped.rows[2]!.problem, mapped.rows[2]!.endHalf], [rtt, null, "am"]);
  // Imported: approved, counted with this company's rules; the balances
  // already counted it, so nothing comes off until it is cancelled.
  const { sql } = database;
  const before = (await of(ines)).left;
  const lines = mapped.rows.filter(r => r.problem === null).map(r => ({ line: r.line, memberId: r.memberId!, typeId: r.typeId!, start: r.start!, startHalf: r.startHalf, end: r.end!, endHalf: r.endHalf }));
  await assert.rejects(requests.importLeave(sql, asMember(ines), lines, true, "Lucca"), refused("forbidden"));
  const result = await requests.importLeave(sql, asMember(camille), lines, true, "Lucca");
  assert.equal(result.done.length, 3);
  const christmas = result.done.find(r => r.memberId === ines.id)!;
  assert.equal(christmas.status, "approved");
  assert.equal((await of(ines)).left, before);
  assert.deepEqual((await requests.history(sql, asMember(camille), christmas.id)).map(s => s.kind), ["imported"]);
  await requests.settleCancel(sql, asMember(camille), christmas.id, { accept: true });
  assert.equal((await of(ines)).left, before + christmas.days);
  // Imported again: what overlaps is said, not doubled.
  const twice = await requests.importLeave(sql, asMember(camille), lines, false, "Lucca");
  assert.deepEqual(twice.skipped.map(s => s.problem), ["overlap", "overlap"]);
});
