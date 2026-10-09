import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, withMember, type FakeChest } from "@argentic/chest-sdk/testing";
import { fetchApp as GET } from "./support/app.ts";
import { today } from "../src/lib/clock.ts";
import { addDays, mondayOf, todayIn } from "../src/shared/days.ts";
import { addEntry } from "../src/lib/entries.ts";
import { erase } from "../src/lib/lifecycle.ts";
import * as projects from "../src/lib/projects.ts";
import { history, origin, peopleRates, projectRates, rateLock, rateOn, rateUse, removeStep, setRate } from "../src/lib/rates.ts";
import { rateDayProblem } from "../src/shared/rate-day.ts";
import { catalogue } from "../src/i18n/index.ts";
import { report } from "../src/lib/reports.ts";
import { lock } from "../src/lib/settings.ts";
import { migrate, testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, nora } from "./support/members.ts";
import { refused } from "./support/refused.ts";

let database: TestDatabase;
let chest: FakeChest;
// The fake Chest's day (its zone, UTC, is the test database's too).
const base = addDays(mondayOf(todayIn("UTC")), -70);
const later = addDays(base, 35);
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});

const m = () => asMember(camille);
const period = { from: base, to: addDays(later, 6) };

test("a new rate applies from its day on: the time before keeps the amount it had", async () => {
  const { sql } = database;
  const p = await projects.createProject(sql, m(), { name: "History", rateCents: 8000 });
  await addEntry(sql, asMember(hugo), { projectId: p.id, day: base, minutes: 60 });
  await addEntry(sql, asMember(hugo), { projectId: p.id, day: later, minutes: 60 });
  assert.equal((await report(sql, m(), { ...period, projectId: p.id })).cents, 16000);
  // The rate goes up from `later`: January's invoice stays as it was.
  await projects.updateProject(sql, m(), p.id, { name: "History", rateCents: 10000, rateFrom: later });
  const r = await report(sql, m(), { ...period, projectId: p.id });
  assert.equal(r.cents, 8000 + 10000);
  assert.deepEqual((await history(sql, { kind: "bill", projectId: p.id, memberId: null })).map(s => [s.from, s.cents]), [[origin, 8000], [later, 10000]]);
  assert.equal((await projects.project(sql, m(), p.id)).used.cents, 18000);
  // Without a day, a changed rate applies from today (the project has time).
  await projects.updateProject(sql, m(), p.id, { name: "History", rateCents: 12000 });
  assert.deepEqual((await history(sql, { kind: "bill", projectId: p.id, memberId: null })).at(-1), { from: today(), cents: 12000, setBy: camille.id });
  assert.equal((await report(sql, m(), { ...period, projectId: p.id })).cents, 18000);
  // The same rate again changes nothing.
  await projects.updateProject(sql, m(), p.id, { name: "History", rateCents: 12000, rateFrom: later });
  assert.equal((await history(sql, { kind: "bill", projectId: p.id, memberId: null })).length, 3);
  // The column the previous version reads follows today's rate.
  assert.equal((await sql<{ rate_cents: string }[]>`select rate_cents::text from projects where id = ${p.id}`)[0]!.rate_cents, "12000");
});

test("a person's rate on a project, else the project's, else their usual rate; cost and margin for managers", async () => {
  const { sql } = database;
  const open = await projects.createProject(sql, m(), { name: "No project rate" });
  const priced = await projects.createProject(sql, m(), { name: "Priced", rateCents: 9000 });
  await setRate(sql, m(), { kind: "bill", memberId: ines.id, cents: 7000, from: origin });
  await setRate(sql, m(), { kind: "bill", memberId: ines.id, projectId: priced.id, cents: 12000, from: origin });
  await setRate(sql, m(), { kind: "cost", memberId: ines.id, cents: 4000, from: origin });
  await setRate(sql, m(), { kind: "cost", memberId: ines.id, cents: 5000, from: later });
  await addEntry(sql, asMember(ines), { projectId: open.id, day: base, minutes: 60 });
  await addEntry(sql, asMember(ines), { projectId: priced.id, day: base, minutes: 30 });
  await addEntry(sql, asMember(hugo), { projectId: priced.id, day: base, minutes: 60 });
  await addEntry(sql, asMember(ines), { projectId: open.id, day: later, minutes: 60, billable: false });
  const r = await report(sql, m(), { ...period, clientId: undefined, group: "project", person: ines.id });
  // 1 h at her usual 70, 30 min at her 120 on "Priced"; the unbilled hour counts nothing.
  assert.equal(r.cents, 7000 + 6000);
  // Every hour costs: 1.5 h at 40, then 1 h at 50 (her cost from `later`).
  assert.equal(r.costCents, 6000 + 5000);
  assert.ok(r.priced && r.costed);
  const pricedLine = (await report(sql, m(), { ...period, group: "project" })).lines.find(l => l.projectId === priced.id)!;
  assert.equal(pricedLine.cents, 6000 + 9000); // Hugo has no rate of his own: the project's
  // A member sees no money at all, not even their own.
  const own = await report(sql, asMember(ines), { ...period });
  assert.deepEqual([own.cents, own.costCents, own.priced, own.costed], [0, 0, false, false]);
  const everyoneRates = await peopleRates(sql, m());
  assert.deepEqual(everyoneRates.find(x => x.memberId === ines.id)?.cost.map(s => s.cents), [4000, 5000]);
  assert.deepEqual((await projectRates(sql, m(), priced.id)).people, [{ memberId: ines.id, steps: [{ from: origin, cents: 12000, setBy: camille.id }] }]);
  assert.equal(rateOn([{ from: origin, cents: 1, setBy: null }, { from: later, cents: null, setBy: null }], later), null);
  // A step set by mistake goes; what it covered falls back on the one before.
  await removeStep(sql, m(), { kind: "cost", memberId: ines.id, from: later });
  assert.equal((await report(sql, m(), { ...period, person: ines.id })).costCents, 4000 * 2.5);
});

test("only managers set rates; never in the locked period; the targets are checked", async () => {
  const { sql } = database;
  await assert.rejects(setRate(sql, asMember(hugo), { kind: "bill", memberId: hugo.id, cents: 1, from: today() }), refused("forbidden"));
  await assert.rejects(setRate(sql, asMember(nora), { kind: "bill", memberId: hugo.id, cents: 1, from: today() }), refused("forbidden"));
  await assert.rejects(peopleRates(sql, asMember(hugo)), refused("forbidden"));
  await assert.rejects(setRate(sql, m(), { kind: "cost", projectId: "1", cents: 1, from: today() }), refused("invalid"));
  await assert.rejects(setRate(sql, m(), { kind: "bill", cents: 1, from: today() }), refused("invalid"));
  await assert.rejects(setRate(sql, m(), { kind: "bill", memberId: "robert", cents: 1, from: today() }), refused("invalid"));
  await assert.rejects(setRate(sql, m(), { kind: "bill", memberId: hugo.id, cents: -1, from: today() }), refused("invalid"));
  await assert.rejects(setRate(sql, m(), { kind: "bill", projectId: "999999", cents: 1, from: today() }), refused("not_found"));
  await lock(sql, m(), addDays(base, 10));
  await assert.rejects(setRate(sql, m(), { kind: "bill", memberId: hugo.id, cents: 5000, from: base }), refused("rate_locked"));
  await assert.rejects(setRate(sql, m(), { kind: "bill", memberId: hugo.id, cents: 5000, from: origin }), refused("rate_locked"));
  const p = await projects.createProject(sql, m(), { name: "Locked rate", rateCents: 100 });
  await addEntry(sql, asMember(hugo), { projectId: p.id, day: later, minutes: 60 });
  await assert.rejects(projects.updateProject(sql, m(), p.id, { name: "Locked rate", rateCents: 200, rateFrom: base }), refused("rate_locked"));
  await setRate(sql, m(), { kind: "bill", memberId: hugo.id, cents: 5000, from: addDays(base, 11) });
  await lock(sql, m(), null);
});

test("the CSV gives the rate in force on each day, and managers the cost", async () => {
  const { sql } = database;
  const p = await projects.createProject(sql, m(), { name: "Csv", rateCents: 6000 });
  await addEntry(sql, asMember(tom()), { projectId: p.id, day: base, minutes: 60 });
  await projects.updateProject(sql, m(), p.id, { name: "Csv", rateCents: 9000, rateFrom: later });
  await addEntry(sql, asMember(tom()), { projectId: p.id, day: later, minutes: 30 });
  await setRate(sql, m(), { kind: "cost", memberId: tom().id, cents: 3000, from: origin });
  const url = `http://tool.test/chest/reports/export?preset=custom&from=${period.from}&to=${period.to}&person=${tom().id}`;
  const text = (await (await GET(withMember(new Request(url), { ...camille, language: "en" }))).text()).replace(/^﻿/u, "").trim().split("\r\n");
  assert.equal(text[0], "Date,Person,Client,Project,Task,Note,Hours,Billable,Hourly rate,Amount,Cost rate,Cost,Invoiced,Start,End");
  assert.ok(text.some(l => l.startsWith(`${base},Tom Walker,,Csv,,,1,Yes,60,60,30,30,No`)), text.join("\n"));
  assert.ok(text.some(l => l.startsWith(`${later},Tom Walker,,Csv,,,0.5,Yes,90,45,30,15,No`)), text.join("\n"));
});

test("an erased person's time keeps its amounts; their own rates go", async () => {
  const { sql } = database;
  const p = await projects.createProject(sql, m(), { name: "Erasure" });
  await setRate(sql, m(), { kind: "bill", memberId: tom().id, cents: 6600, from: origin });
  await addEntry(sql, asMember(tom()), { projectId: p.id, day: base, minutes: 60 });
  const before = (await report(sql, m(), { ...period, projectId: p.id })).cents;
  assert.equal(before, 6600);
  await erase(sql as never, tom().id);
  assert.equal((await report(sql, m(), { ...period, projectId: p.id })).cents, 6600);
  assert.equal((await sql`select 1 from rates where member_id = ${tom().id}`).length, 0);
});

test("the migration keeps every rate the previous version had, since always", async () => {
  const old = await testDatabase({ until: "0001_timesheets.sql" });
  try {
    const { sql } = old;
    const [p] = await sql<{ id: string }[]>`insert into projects (name, rate_cents) values ('Before', 7500) returning id::text`;
    await sql`insert into entries (member_id, project_id, day, minutes, billable) values (${hugo.id}, ${p!.id}, '2024-03-04', 120, true)`;
    await migrate(sql);
    const [r] = await sql<{ rate: string }[]>`select bill_rate(${hugo.id}, ${p!.id}::bigint, '2024-03-04')::text as rate`;
    assert.equal(r!.rate, "7500");
    assert.equal((await report(sql, m(), { from: "2024-03-01", to: "2024-03-31" })).cents, 15000);
  } finally {
    await old.close();
  }
  // The rest of this file uses its own database again.
  const { provide } = await import("../src/lib/db.ts");
  provide(database.sql);
});

function tom() {
  return everyone.find(p => p.firstName === "Tom")!;
}

test("a rate's first day inside the locked period is refused with a sentence, never saved from today (critique N1)", () => {
  const lock = rateLock("2026-08-31", "en", catalogue("en"));
  assert.deepEqual(lock, { until: "2026-08-31", text: "Locked up to 31 August 2026: a new rate starts on 1 September 2026 at the earliest. To change the time before, unlock it in Settings first." });
  assert.equal(rateLock(null, "en", catalogue("en")), null);
  assert.match(rateLock("2026-08-31", "fr", catalogue("fr"))!.text, /^Verrouillé jusqu’au 31 août 2026\u202f: un nouveau taux commence au plus tôt le 1er septembre 2026\./u);
  const words = { missing: "Choose the day" };
  assert.equal(rateDayProblem("2026-08-01", lock, words), lock!.text);
  assert.equal(rateDayProblem("2026-08-31", lock, words), lock!.text);
  assert.equal(rateDayProblem("2026-09-01", lock, words), null);
  assert.equal(rateDayProblem(null, lock, words), "Choose the day");
  assert.equal(rateDayProblem("2020-01-01", null, words), null);
});

test("where a person's usual rate is used: a project's own rate, or theirs on it, wins (critique N2)", async () => {
  const { sql } = database;
  const own = await projects.createProject(sql, m(), { name: "Use: no rate" });
  const priced = await projects.createProject(sql, m(), { name: "Use: priced", rateCents: 9000 });
  const special = await projects.createProject(sql, m(), { name: "Use: special" });
  const inside = await projects.createProject(sql, m(), { name: "Use: internal", billable: false });
  const day = addDays(mondayOf(today()), -3);
  for (const p of [own, priced, special, inside]) await addEntry(sql, asMember(ines), { projectId: p.id, day, minutes: 60 });
  await setRate(sql, m(), { kind: "bill", projectId: special.id, memberId: ines.id, cents: 15000, from: origin });
  const use = await rateUse(sql, m(), [ines.id, nora.id]);
  assert.deepEqual(use.get(ines.id)?.filter(p => p.name.startsWith("Use:")).map(p => [p.name, p.source]), [
    ["Use: no rate", "own"], ["Use: priced", "project"], ["Use: special", "person_project"],
  ]);
  assert.equal(use.get(nora.id), undefined);
  await assert.rejects(rateUse(sql, asMember(hugo), [ines.id]), refused("forbidden"));
});
