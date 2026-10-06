import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/lib/app-error.ts";
import { addDays, holidaysBetween, weekday } from "../src/shared/calendar.ts";
import { payroll } from "../src/lib/payroll.ts";
import * as requests from "../src/lib/requests.ts";
import { archiveType, daysOff, saveType, settings, types, updateSettings } from "../src/lib/rules.ts";
import { setApprover } from "../src/lib/staff.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, hugo, ines, sofia } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, groups: fakeGroups });
});
after(async () => {
  await chest.close();
  await database.close();
});
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("a fresh tool: jours ouvrés, 1 June, seven kinds of leave, paid leave earning 25 days as N-1 / N", async () => {
  const s = await settings(database.sql);
  assert.deepEqual(s, { counting: "ouvres", alsace: false, workedHolidays: [], periodStartMonth: 6, touched: false });
  const all = await types(database.sql);
  assert.deepEqual(all.map(t => t.key), ["paid", "rtt", "unpaid", "sick", "other", "family", "remote"]);
  const paid = all[0]!;
  assert.equal(paid.perYear, 25);
  assert.ok(paid.balance && paid.approval && paid.halfDays);
  assert.deepEqual([paid.period, paid.periodMonth, paid.unused, paid.overdraw, paid.away], ["acquired", null, "carry", false, true]);
  // RTT: the days of a calendar year, counted on the days the person works.
  const rtt = all[1]!;
  assert.deepEqual([rtt.period, rtt.periodMonth, rtt.counting], ["yearly", 1, "worked"]);
  const sick = all[3]!;
  assert.ok(!sick.approval && !sick.notes && !sick.balance && sick.counting === "calendar");
  // Family events need an answer, in whole days; remote work is declared,
  // counted on worked days, and is not an absence.
  const family = all[5]!;
  assert.ok(family.approval && !family.halfDays && !family.balance && family.away);
  // … and count only the days the person works (art. L3142-4 covers the
  // days they would have worked), not the paid-leave rule.
  assert.equal(family.counting, "worked");
  const remote = all[6]!;
  assert.ok(!remote.approval && !remote.away && remote.counting === "worked");
});

test("a kind's year: HR chooses N-1 / N, a calendar year or one running balance, its first month, and what happens to days left", async () => {
  const { sql } = database;
  const rtt = (await types(sql)).find(t => t.key === "rtt")!;
  const lost = await saveType(sql, asMember(camille), rtt.id, { unused: "lose", periodMonth: 4 });
  assert.deepEqual([lost.period, lost.periodMonth, lost.unused], ["yearly", 4, "lose"]);
  await assert.rejects(saveType(sql, asMember(camille), rtt.id, { unused: "pay" }), refused("invalid"));
  await assert.rejects(saveType(sql, asMember(camille), rtt.id, { period: "monthly" }), refused("invalid"));
  await assert.rejects(saveType(sql, asMember(camille), rtt.id, { periodMonth: 13 }), refused("invalid"));
  await assert.rejects(saveType(sql, asMember(camille), rtt.id, { counting: "hours" }), refused("invalid"));
  await assert.rejects(saveType(sql, asMember(hugo), rtt.id, { unused: "carry" }), refused("forbidden"));
  const back = await saveType(sql, asMember(camille), rtt.id, { unused: "carry", periodMonth: 1, overdraw: false });
  assert.deepEqual([back.unused, back.periodMonth, back.overdraw], ["carry", 1, false]);
  await saveType(sql, asMember(camille), rtt.id, { overdraw: true });
  // A kind without a balance has no year.
  const unpaid = (await types(sql)).find(t => t.key === "unpaid")!;
  assert.equal((await saveType(sql, asMember(camille), unpaid.id, { period: "acquired" })).period, "running");
});

test("HR changes the rules; switching to jours ouvrables gives paid leave 30 days a year; nobody else may", async () => {
  const { sql } = database;
  await assert.rejects(updateSettings(sql, asMember(ines), { alsace: true }), refused("forbidden"));
  await assert.rejects(updateSettings(sql, asMember(camille), { counting: "weekly" }), refused("invalid"));
  await assert.rejects(updateSettings(sql, asMember(camille), { workedHolidays: ["myBirthday"] }), refused("invalid"));
  await assert.rejects(updateSettings(sql, asMember(camille), { periodStartMonth: 13 }), refused("invalid"));
  const s = await updateSettings(sql, asMember(camille), { counting: "ouvrables", alsace: true, workedHolidays: ["whitMonday", "whitMonday"], periodStartMonth: 1 });
  assert.deepEqual(s, { counting: "ouvrables", alsace: true, workedHolidays: ["whitMonday"], periodStartMonth: 1, touched: true });
  assert.equal((await types(sql)).find(t => t.key === "paid")!.perYear, 30);
  assert.ok(!daysOff(s, "2026-05-25", "2026-05-25").has("2026-05-25"));
  assert.ok(daysOff(s, "2026-04-03", "2026-04-03").has("2026-04-03"));
  await updateSettings(sql, asMember(camille), { counting: "ouvres", alsace: false, workedHolidays: [], periodStartMonth: 6 });
  assert.equal((await types(sql)).find(t => t.key === "paid")!.perYear, 25);
});

test("HR adds, renames, hides and shows kinds of leave; at least one stays", async () => {
  const { sql } = database;
  await assert.rejects(saveType(sql, asMember(hugo), null, { name: "Wedding" }), refused("forbidden"));
  await assert.rejects(saveType(sql, asMember(camille), null, { name: "" }), refused("empty"));
  await assert.rejects(saveType(sql, asMember(camille), null, { name: "Wedding", color: "neon" }), refused("invalid"));
  const wedding = await saveType(sql, asMember(camille), null, { name: "Wedding", color: "rose", balance: false, halfDays: false });
  assert.equal(wedding.name, "Wedding");
  assert.equal(wedding.key, null);
  assert.equal(wedding.perYear, 0);
  const paid = (await types(sql)).find(t => t.key === "paid")!;
  assert.equal((await saveType(sql, asMember(camille), paid.id, { name: "CP" })).name, "CP");
  assert.equal((await saveType(sql, asMember(camille), paid.id, { name: "" })).name, null);
  await archiveType(sql, asMember(camille), wedding.id, true);
  assert.ok(!(await types(sql)).some(t => t.id === wedding.id));
  assert.ok((await types(sql, { archived: true })).some(t => t.id === wedding.id && t.archived));
  for (const t of await types(sql)) if (t.key !== "other") await archiveType(sql, asMember(camille), t.id, true);
  const other = (await types(sql)).find(t => t.key === "other")!;
  await assert.rejects(archiveType(sql, asMember(camille), other.id, true), refused("last_type"));
  for (const t of await types(sql, { archived: true })) if (t.key) await archiveType(sql, asMember(camille), t.id, false);
});

test("the payroll export: approved absences of a month, the days inside it, HR only", async () => {
  const { sql } = database;
  await setApprover(sql, asMember(camille), hugo.id, ines.id);
  const paid = (await types(sql)).find(t => t.key === "paid")!.id;
  // Asked without a balance set: paid leave may go below zero here.
  await saveType(sql, asMember(camille), paid, { overdraw: true });
  // Two approved leaves around the turn of a month, one refused, one waiting.
  const month = addDays(new Date().toISOString().slice(0, 8) + "01", 62).slice(0, 7);
  const first = month + "-01";
  const across = await requests.createRequest(sql, asMember(hugo), { typeId: paid, start: addDays(first, -3), startHalf: "am", end: addDays(first, 2), endHalf: "pm" });
  await requests.decide(sql, asMember(ines), across.id, { verdict: "approve" });
  let workday = addDays(first, 8);
  while (weekday(workday) === 0 || weekday(workday) === 6 || holidaysBetween(workday, workday).size > 0) workday = addDays(workday, 1);
  const refusedOne = await requests.createRequest(sql, asMember(hugo), { typeId: paid, start: workday, startHalf: "am", end: workday, endHalf: "pm" });
  await requests.decide(sql, asMember(ines), refusedOne.id, { verdict: "refuse" });
  await requests.createRequest(sql, asMember(sofia), { typeId: paid, start: workday, startHalf: "am", end: workday, endHalf: "pm" });
  const rows = await payroll(sql, asMember(camille), month);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.memberId, hugo.id);
  assert.ok(rows[0]!.daysInMonth > 0 && rows[0]!.daysInMonth <= rows[0]!.days);
  await assert.rejects(payroll(sql, asMember(ines), month), refused("forbidden"));
  await assert.rejects(payroll(sql, asMember(camille), "2026-13"), refused("invalid"));
});
