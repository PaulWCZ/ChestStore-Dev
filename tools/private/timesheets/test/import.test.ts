import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { forgetFormer, formerPeople, planImport, runImport } from "../src/lib/import.ts";
import { nameFor, people as lookup } from "../src/lib/people.ts";
import { dateOrder, detect, fold, parseExport, readDate, readDuration, readTime } from "../src/shared/import-formats.ts";
import * as projects from "../src/lib/projects.ts";
import { report } from "../src/lib/reports.ts";
import { lock } from "../src/lib/settings.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";
import { refused } from "./support/refused.ts";

// Exports as the three tools write them (their columns, a few rows each).
const toggl = [
  "User,Email,Client,Project,Task,Description,Billable,Start date,Start time,End date,End time,Duration,Tags,Amount (EUR)",
  "Camille Martin,camille@example.test,Boulangerie Dupain,Site vitrine,Design,Maquettes accueil,Yes,2026-09-01,09:00:00,2026-09-01,11:30:00,02:30:00,,",
  "MOREAU Ines,ines@example.test,Boulangerie Dupain,Site vitrine,,\"Call, with the baker\",No,2026-09-01,14:00:00,2026-09-01,14:45:00,00:45:00,,",
  "Robert Unknown,robert@example.test,Garage Leroy,Flyers,,Print,Yes,2026-09-02,10:00:00,2026-09-02,11:00:00,01:00:00,,",
  "Camille Martin,camille@example.test,,,,No project here,No,2026-09-02,16:00:00,2026-09-02,16:20:00,00:20:00,,",
  "Camille Martin,camille@example.test,Boulangerie Dupain,Site vitrine,Design,Broken,Yes,not a date,09:00:00,,,01:00:00,,",
].join("\n");

const clockify = [
  "Project,Client,Description,Task,User,Group,Email,Tags,Billable,Start Date,Start Time,End Date,End Time,Duration (h),Duration (decimal),Billable Rate (EUR),Billable Amount (EUR)",
  "Brand,Garage Leroy,Logo,Design,Hugo Bernard,,hugo@example.test,,Yes,09/15/2026,02:00 PM,09/15/2026,03:30 PM,01:30:00,1.50,0,0",
  "Brand,Garage Leroy,Logo v2,Design,Hugo Bernard,,hugo@example.test,,Yes,09/16/2026,09:00 AM,09/16/2026,10:00 AM,01:00:00,1.00,0,0",
].join("\n");

const harvest = [
  "Date;Client;Project;Project Code;Task;Notes;Hours;Hours Rounded;Billable?;Invoiced?;First Name;Last Name;Roles;Employee?",
  "2026-09-10;Mairie;Signalétique;;Réunions;Point d'étape;1,5;1,5;Yes;No;Hugo;Bernard;;Yes",
  "2026-09-11;Mairie;Signalétique;;Réunions;Point d'étape;2;2;Yes;No;Léa;Dubois;;Yes",
].join("\r\n");

let database: TestDatabase;
let chest: FakeChest;
const people = everyone.map(p => ({ id: p.id, name: p.name }));
const options = { people, noProject: "No project" };
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("the three exports are told apart and read", () => {
  assert.equal(detect(toggl.split("\n")[0]!.split(",")), "toggl");
  assert.equal(detect(clockify.split("\n")[0]!.split(",")), "clockify");
  assert.equal(detect(harvest.split("\r\n")[0]!.split(";")), "harvest");
  assert.equal(detect(["Title", "Due"]), null);
  const t = parseExport(toggl);
  assert.equal(t.source, "toggl");
  assert.equal(t.rows.length, 4);
  assert.deepEqual(t.invalid, [6]);
  assert.deepEqual({ ...t.rows[0]!, line: 0 }, { line: 0, person: "Camille Martin", client: "Boulangerie Dupain", project: "Site vitrine", task: "Design", note: "Maquettes accueil", billable: true, day: "2026-09-01", start: 540, minutes: 150, rateCents: null, costCents: null, invoiced: null });
  assert.equal(t.rows[1]!.note, "Call, with the baker");
  const c = parseExport(clockify);
  assert.deepEqual(c.dates, { ambiguous: false, order: "mdy" });
  assert.deepEqual([c.rows[0]!.day, c.rows[0]!.start, c.rows[0]!.minutes], ["2026-09-15", 14 * 60, 90]);
  const h = parseExport(harvest);
  assert.deepEqual([h.rows[0]!.person, h.rows[0]!.minutes, h.rows[0]!.start, h.rows[0]!.task], ["Hugo Bernard", 90, null, "Réunions"]);
  assert.throws(() => parseExport("Title,Due\nA,B"), refused("import_invalid"));
  assert.throws(() => parseExport(""), refused("import_invalid"));
});

test("dates, times and durations in the shapes the exports use", () => {
  assert.equal(readDate("2026-09-01", "mdy"), "2026-09-01");
  assert.equal(readDate("31/12/2026", "dmy"), "2026-12-31");
  assert.equal(readDate("12/31/2026", "mdy"), "2026-12-31");
  assert.equal(readDate("31.12.26", "dmy"), "2026-12-31");
  assert.equal(readDate("31/02/2026", "dmy"), null);
  assert.deepEqual(dateOrder(["03/04/2026", "05/06/2026"]), { ambiguous: true, order: "dmy" });
  assert.deepEqual(dateOrder(["13/04/2026"]), { ambiguous: false, order: "dmy" });
  assert.deepEqual(dateOrder(["2026-04-13"]), { ambiguous: false, order: "dmy" });
  assert.equal(readTime("1:30 PM"), 810);
  assert.equal(readTime("12:05 am"), 5);
  assert.equal(readTime("23:59:59"), 1439);
  assert.equal(readTime("24:00"), null);
  assert.equal(readDuration("01:30:00"), 90);
  assert.equal(readDuration("1,25"), 75);
  assert.equal(readDuration("abc"), null);
  assert.equal(fold("MOREAU  Inès"), fold("ines moreau"));
  assert.notEqual(fold("Ines Moreau"), fold("Ines Morel"));
});

test("the plan shows who is found, what will be created, what is left out; importing twice adds nothing", async () => {
  const { sql } = database;
  const m = asMember(camille);
  await projects.createProject(sql, m, { name: "Site vitrine", newClient: "boulangerie DUPAIN", tasks: ["design"] });
  // Here people not in the Chest are left out (the manager's choice).
  const skip = { ...options, former: "skip" as const };
  const plan = await planImport(sql, m, toggl, skip);
  assert.equal(plan.source, "toggl");
  assert.equal(plan.rows, 5);
  assert.equal(plan.ready, 3);
  assert.equal(plan.minutes, 150 + 45 + 20);
  assert.deepEqual(plan.people.map(p => [p.name, p.memberId, p.former, p.rows]), [["Robert Unknown", null, false, 1], ["Camille Martin", camille.id, false, 2], ["MOREAU Ines", ines.id, false, 1]]);
  assert.deepEqual(plan.newClients, []);
  assert.deepEqual(plan.newProjects, [{ client: null, name: "No project" }]);
  assert.equal(plan.newTasks, 0);
  assert.deepEqual(plan.skipped, { person: 1, locked: 0, duplicate: 0, invalid: 1, dayFull: 0 });
  const done = await runImport(sql, m, toggl, skip);
  assert.equal(done.imported, 3);
  const r = await report(sql, m, { from: "2026-09-01", to: "2026-09-02", group: "person" });
  assert.equal(r.minutes, 215);
  assert.equal(r.billableMinutes, 150);
  // Again: every row is known.
  const again = await planImport(sql, m, toggl, skip);
  assert.equal(again.ready, 0);
  assert.equal(again.skipped.duplicate, 3);
  assert.equal((await runImport(sql, m, toggl, skip)).imported, 0);
});

test("clients, projects and tasks are created as needed; people are matched by full name", async () => {
  const { sql } = database;
  const m = asMember(camille);
  const skip = { ...options, former: "skip" as const };
  const plan = await planImport(sql, m, harvest, skip);
  assert.deepEqual(plan.newClients, ["Mairie"]);
  assert.deepEqual(plan.newProjects, [{ client: "Mairie", name: "Signalétique" }]);
  assert.equal(plan.newTasks, 1);
  assert.equal(plan.ready, 1); // Léa has no access in the tests' Chest, and is left out here
  assert.equal((await runImport(sql, m, harvest, skip)).imported, 1);
  const list = await projects.listProjects(sql, m);
  const p = list.find(x => x.name === "Signalétique")!;
  assert.equal(p.clientName, "Mairie");
  assert.deepEqual(p.tasks.map(k => k.name), ["Réunions"]);
  const c = await runImport(sql, m, clockify, skip);
  assert.equal(c.imported, 2);
  assert.ok((await projects.listProjects(sql, m)).some(x => x.name === "Brand" && x.clientName === "Garage Leroy"));
});

test("locked days and full days are left out; the date order can be chosen; only managers import", async () => {
  const { sql } = database;
  const m = asMember(camille);
  const file = [
    "User,Email,Client,Project,Task,Description,Billable,Start date,Start time,End date,End time,Duration,Tags",
    "Hugo Bernard,,Acme,Ops,,Old,Yes,03/04/2025,09:00,03/04/2025,10:00,01:00:00,",
    "Hugo Bernard,,Acme,Ops,,Long,Yes,05/06/2025,00:00,05/06/2025,20:00,20:00:00,",
    "Hugo Bernard,,Acme,Ops,,Longer,Yes,05/06/2025,20:00,05/06/2025,23:59,05:00:00,",
  ].join("\n");
  const dmy = await planImport(sql, m, file, options);
  assert.deepEqual(dmy.dates, { ambiguous: true, order: "dmy" });
  assert.equal(dmy.from, "2025-04-03");
  const mdy = await planImport(sql, m, file, { ...options, order: "mdy" });
  assert.equal(mdy.from, "2025-03-04");
  assert.equal(mdy.skipped.dayFull, 1);
  await lock(sql, m, "2025-04-30");
  const locked = await planImport(sql, m, file, options);
  assert.equal(locked.skipped.locked, 1);
  await lock(sql, m, null);
  await assert.rejects(planImport(sql, asMember(hugo), file, options), refused("forbidden"));
  await assert.rejects(runImport(sql, asMember(hugo), file, options), refused("forbidden"));
  await assert.rejects(planImport(sql, m, 42, options), refused("import_invalid"));
  await assert.rejects(planImport(sql, m, "x".repeat(6 << 20), options), refused("import_too_big"));
});

// Harvest's detailed time export with its money columns (Billable Rate,
// Billable Amount, Cost Rate, Cost Amount, Currency, Invoiced?, Approved?),
// as Harvest's help centre lists them (support.getharvest.com, "Detailed
// time and detailed expense reports", read 2026-09-29).
const harvestMoney = [
  "Date,Client,Project,Project Code,Task,Notes,Hours,Hours Rounded,Billable?,Invoiced?,Approved?,First Name,Last Name,Roles,Employee?,Billable Rate,Billable Amount,Cost Rate,Cost Amount,Currency,External Reference URL",
  "2025-01-13,Garage Leroy,Brochure,GL-01,Design,Cover and inside pages,3.5,3.5,Yes,Yes,Yes,Hugo,Bernard,Designer,Yes,95.00,332.50,45.00,157.50,Euro - EUR,",
  "2025-01-14,Garage Leroy,Brochure,GL-01,Design,Print files,2,2,Yes,No,Yes,Julien,Roux,Designer,No,110.00,220.00,50.00,100.00,Euro - EUR,",
  "2025-01-15,Garage Leroy,Brochure,GL-01,Meetings,Kick-off,1,1,No,No,Yes,Julien,Roux,Designer,No,0,0,50.00,50.00,Euro - EUR,",
  "2025-02-03,Garage Leroy,Brochure,GL-01,Design,Reprint,1.5,1.5,Yes,No,No,Hugo,Bernard,Designer,Yes,95.00,142.50,45.00,67.50,Euro - EUR,",
].join("\n");

test("people who left before the Chest come in as former people; locked rows come only when asked; the old rates and invoices are kept", async () => {
  const { sql } = database;
  const m = asMember(camille);
  const parsed = parseExport(harvestMoney);
  assert.equal(parsed.currency, "EUR");
  assert.deepEqual(parsed.rows.map(r => [r.rateCents, r.costCents, r.invoiced]), [[9500, 4500, true], [11000, 5000, false], [null, 5000, false], [9500, 4500, false]]);
  await lock(sql, m, "2025-01-31");
  const plan = await planImport(sql, m, harvestMoney, options);
  // Julien Roux left before the Chest: kept, read-only, under his name.
  assert.deepEqual(plan.people.map(p => [p.name, p.memberId, p.former, p.rows]), [["Julien Roux", null, true, 2], ["Hugo Bernard", hugo.id, false, 2]]);
  // Three rows are before the lock: the plan asks, and leaves them out until told.
  assert.deepEqual(plan.locked, { rows: 3, until: "2025-01-31" });
  assert.equal(plan.skipped.locked, 3);
  assert.equal(plan.ready, 1);
  const history = await planImport(sql, m, harvestMoney, { ...options, locked: "import" });
  assert.deepEqual([history.ready, history.skipped.locked, history.rates.kept, history.invoiced], [4, 0, 4, 1]);
  assert.equal((await runImport(sql, m, harvestMoney, { ...options, locked: "import" })).imported, 4);
  const r = await report(sql, m, { from: "2025-01-01", to: "2025-02-28", group: "person" });
  // Amounts as Harvest invoiced them: 3.5 × 95 + 2 × 110 + 1.5 × 95; costs as it counted them.
  assert.equal(r.cents, 33250 + 22000 + 14250);
  assert.equal(r.costCents, 15750 + 10000 + 5000 + 6750);
  const julien = r.lines.find(l => l.memberId?.startsWith("imp_"))!;
  assert.equal(julien.minutes, 180);
  const found = await lookup([julien.memberId!]);
  assert.equal(nameFor(julien.memberId!, found, "en"), "Julien Roux (former member)");
  // Harvest's invoiced row came in invoiced: it no longer changes.
  const invoiced = await sql<{ invoiced: boolean }[]>`select invoiced_at is not null as invoiced from entries where note = 'Cover and inside pages'`;
  assert.deepEqual(invoiced.map(i => i.invoiced), [true]);
  // Again: nothing more, even for the former person.
  assert.equal((await planImport(sql, m, harvestMoney, { ...options, locked: "import" })).skipped.duplicate, 4);
  // A file in another currency keeps no rate.
  const usd = harvestMoney.replaceAll("Euro - EUR", "US Dollar - USD").replaceAll("2025-0", "2024-0");
  const other = await planImport(sql, m, usd, { ...options, locked: "import" });
  assert.deepEqual(other.rates, { kept: 0, currency: "USD", ignored: true });
  // The manager may forget a former person: the time stays, anonymous.
  const list = await formerPeople(sql, m);
  assert.deepEqual(list.map(f => [f.name, f.minutes]), [["Julien Roux", 180]]);
  await assert.rejects(formerPeople(sql, asMember(hugo)), refused("forbidden"));
  await assert.rejects(forgetFormer(sql, asMember(hugo), list[0]!.id), refused("forbidden"));
  await forgetFormer(sql, m, list[0]!.id);
  assert.equal((await report(sql, m, { from: "2025-01-01", to: "2025-02-28", person: "erased" })).minutes, 180);
  await lock(sql, m, null);
});
