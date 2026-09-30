import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, withMember, type FakeChest } from "@argentic/chest-sdk/testing";
import { GET } from "../app/chest/reports/export/route.ts";
import { addDays, mondayOf, todayIn } from "../lib/days.ts";
import { addEntry } from "../lib/entries.ts";
import * as projects from "../lib/projects.ts";
import { exportRows, report, reportPeople } from "../lib/reports.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, nora } from "./support/members.ts";
import { refused } from "./support/refused.ts";

let database: TestDatabase;
let chest: FakeChest;
let site: projects.Project;
let brand: projects.Project;
let internal: projects.Project;
// The fake Chest's day (its zone, UTC, is the test database's too).
const monday = mondayOf(todayIn("UTC"));
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  const { sql } = database;
  const m = asMember(camille);
  site = await projects.createProject(sql, m, { name: "Site", newClient: "Dupain", tasks: ["Design", "Dev"], rateCents: 9000, budget: { kind: "hours", minutes: 600 } });
  brand = await projects.createProject(sql, m, { name: "Brand", clientId: site.clientId, rateCents: 12000 });
  internal = await projects.createProject(sql, m, { name: "Internal", billable: false });
  await addEntry(sql, asMember(hugo), { projectId: site.id, taskId: site.tasks[0]!.id, day: monday, minutes: 120, note: "=cmd|' /C calc'!A0" });
  await addEntry(sql, asMember(hugo), { projectId: internal.id, day: addDays(monday, 1), minutes: 60 });
  await addEntry(sql, asMember(ines), { projectId: brand.id, day: monday, minutes: 90, note: "Logo; colours" });
  await addEntry(sql, asMember(ines), { projectId: site.id, day: addDays(monday, 1), minutes: 30, billable: false });
  await addEntry(sql, asMember(ines), { projectId: site.id, day: addDays(monday, -14), minutes: 45 });
});
after(async () => {
  await chest.close();
  await database.close();
});

const week = { from: monday, to: addDays(monday, 6) };

test("a manager sees everyone's time: totals, billable, amounts, a bar per day", async () => {
  const r = await report(database.sql, asMember(camille), { ...week, group: "project" });
  assert.equal(r.minutes, 300);
  assert.equal(r.billableMinutes, 210);
  // 2 h at 90 + 1.5 h at 120; the unbilled half hour and internal time count nothing.
  assert.equal(r.cents, 18000 + 18000);
  assert.equal(r.bars.length, 7);
  assert.deepEqual(r.bars[0], { day: monday, billable: 210, other: 0 });
  assert.deepEqual(r.bars[1], { day: addDays(monday, 1), billable: 0, other: 90 });
  const line = r.lines.find(l => l.projectId === site.id)!;
  assert.equal(line.minutes, 150);
  assert.equal(line.cents, 18000);
  // The budget counts all its time, not only this week's.
  assert.deepEqual(line.budget, { kind: "hours", used: 195, of: 600 });
  assert.ok(r.priced);
});

test("grouped by client, person or task; filtered by person and billable", async () => {
  const { sql } = database;
  const m = asMember(camille);
  const byClient = await report(sql, m, { ...week, group: "client" });
  assert.deepEqual(byClient.lines.map(l => [l.clientName, l.minutes]), [["Dupain", 240], [null, 60]]);
  const byPerson = await report(sql, m, { ...week, group: "person" });
  assert.deepEqual(byPerson.lines.map(l => [l.memberId, l.minutes]).sort(), [[hugo.id, 180], [ines.id, 120]].sort());
  const byTask = await report(sql, m, { ...week, group: "task" });
  assert.ok(byTask.lines.some(l => l.taskName === "Design" && l.minutes === 120));
  assert.equal((await report(sql, m, { ...week, person: ines.id })).minutes, 120);
  assert.equal((await report(sql, m, { ...week, billable: "non" })).minutes, 90);
  assert.equal((await report(sql, m, { ...week, clientId: site.clientId })).minutes, 240);
  assert.equal((await report(sql, m, { ...week, projectId: brand.id })).minutes, 90);
  const long = await report(sql, m, { from: addDays(monday, -70), to: week.to });
  assert.equal(long.unit, "week");
  assert.equal(long.minutes, 345);
  assert.deepEqual((await reportPeople(sql, m)).sort(), [hugo.id, ines.id].sort());
});

test("a member sees only their own time, whatever they ask", async () => {
  const { sql } = database;
  const r = await report(sql, asMember(hugo), { ...week, person: ines.id, group: "person" });
  assert.equal(r.minutes, 180);
  assert.deepEqual(r.lines.map(l => l.memberId), [hugo.id]);
  assert.ok((await exportRows(sql, asMember(hugo), { ...week, person: ines.id })).every(e => e.memberId === hugo.id));
  assert.deepEqual(await reportPeople(sql, asMember(hugo)), [hugo.id]);
  await assert.rejects(report(sql, asMember(nora), week), refused("forbidden"));
  await assert.rejects(report(sql, asMember(camille), { from: week.to, to: week.from }), refused("bad_period"));
  await assert.rejects(report(sql, asMember(camille), { from: "2024-01-01", to: "2026-01-01" }), refused("bad_period"));
  await assert.rejects(report(sql, asMember(camille), { ...week, person: "robert" }), refused("invalid"));
});

test("the CSV is in the reader's language: French with ';' and decimal commas, no formula runs", async () => {
  const url = `http://tool.test/chest/reports/export?preset=custom&from=${week.from}&to=${week.to}`;
  const fr = await GET(withMember(new Request(url), camille));
  assert.equal(fr.status, 200);
  assert.match(fr.headers.get("Content-Disposition") ?? "", /temps-/u);
  const text = await fr.text();
  const lines = text.replace(/^﻿/u, "").trim().split("\r\n");
  assert.equal(lines[0], "Date;Personne;Client;Projet;Tâche;Note;Heures;Facturable;Taux horaire;Montant;Coût horaire;Coût;Facturé;Début;Fin");
  assert.ok(lines.some(l => l.includes("Hugo Bernard;Dupain;Site;Design;'=cmd|' /C calc'!A0;2;Oui;90;180;;;Non;")), text);
  assert.ok(lines.some(l => l.includes("Inès Moreau;Dupain;Brand;;\"Logo; colours\";1,5;Oui;120;180;;;Non;")), text);
  assert.ok(lines.some(l => l.includes(";0,5;Non;;;;;Non;")), text);
  // English, for a member: commas, dots, their own rows, no rates.
  const en = await GET(withMember(new Request(url), hugo));
  const rows = (await en.text()).replace(/^﻿/u, "").trim().split("\r\n");
  assert.equal(rows[0], "Date,Person,Client,Project,Task,Note,Hours,Billable,Start,End");
  assert.equal(rows.length, 3);
  assert.ok(rows.every(r => !r.includes("Inès")));
  // Without the Chest's assertion: nothing.
  assert.equal((await GET(new Request(url))).status, 401);
  assert.equal((await GET(withMember(new Request(url), nora))).status, 403);
});

test("the CSV follows preset= alone (last week: nothing of this week)", async () => {
  const url = "http://tool.test/chest/reports/export?preset=lastWeek";
  const rows = (await (await GET(withMember(new Request(url), { ...camille, language: "en" }))).text()).replace(/^﻿/u, "").trim().split("\r\n");
  const lastMonday = addDays(monday, -7);
  assert.ok(rows.slice(1).every(r => r >= lastMonday && r < monday), rows.join("\n"));
  assert.match((await GET(withMember(new Request(url), camille))).headers.get("Content-Disposition") ?? "", new RegExp(`temps-${lastMonday}-${addDays(lastMonday, 6)}`, "u"));
});
