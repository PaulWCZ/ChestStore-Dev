import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { AppError } from "../lib/app-error.ts";
import { guess, matchPerson, personKey, plan, previewImport, readNumber, readSheet, runImport, undoImport } from "../lib/import.ts";
import { cycleObjectives, checkIns } from "../lib/read.ts";
import { clockAt } from "../lib/tell.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, sofia } from "./support/members.ts";
import { running, world, type World } from "./support/world.ts";

// Importing a company's goals: Lattice's goals file (the columns of its
// "Bulk Upload Active Goals via CSV" template, as its help centre lists
// them), Goals' own export in French, and a hand-made spreadsheet.
let w: World;
before(async () => { w = await world(); });
after(async () => { await w.close(); });

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const admin = asMember(camille);
const people = [camille, ines, hugo, sofia].map(p => ({ id: p.id, name: p.name }));

test("numbers as spreadsheets write them, in both conventions", () => {
  assert.equal(readNumber("1,200.50", false), 1200.5);
  assert.equal(readNumber("12,500", false), 12500);
  assert.equal(readNumber("12,5", false), 12.5);
  assert.equal(readNumber("1 200,5", true), 1200.5);
  assert.equal(readNumber("1.200", true), 1200);
  assert.equal(readNumber("18 000 €", true), 18000);
  assert.equal(readNumber("35%", false), 35);
  assert.equal(readNumber("", false), null);
  assert.ok(Number.isNaN(readNumber("about ten", false)));
});

test("people are found by name, or by the name in their address; an unknown or ambiguous one is not", () => {
  assert.equal(matchPerson(personKey("Inès Moreau"), people), ines.id);
  assert.equal(matchPerson(personKey("moreau ines"), people), ines.id);
  assert.equal(matchPerson(personKey("ines.moreau@atelier-martin.fr"), people), ines.id);
  assert.equal(matchPerson(personKey("jean.dupont@atelier-martin.fr"), people), null);
  assert.equal(matchPerson(personKey("Martin"), [...people, { id: "mbr_x", name: "Paul Martin" }]), null);
});

test("the headers say which column is which: Lattice's file, Goals' French export, a spreadsheet", () => {
  const lattice = guess(readSheet(fixture("lattice-goals.csv")).headers);
  assert.equal(lattice.preset, "lattice");
  assert.equal(lattice.mapping.objective, 0);
  assert.equal(lattice.mapping.keyResult, 0);
  assert.deepEqual([lattice.mapping.owner, lattice.mapping.rowKind, lattice.mapping.kind, lattice.mapping.why, lattice.mapping.start, lattice.mapping.current, lattice.mapping.target], [1, 2, 3, 7, 8, 9, 10]);
  const ours = guess(readSheet(fixture("goals-export-fr.csv")).headers);
  assert.equal(ours.preset, "goals");
  assert.deepEqual([ours.mapping.level, ours.mapping.team, ours.mapping.objective, ours.mapping.parent, ours.mapping.owner, ours.mapping.keyResult, ours.mapping.krOwner, ours.mapping.kind, ours.mapping.start, ours.mapping.target, ours.mapping.current, ours.mapping.unit, ours.mapping.confidence], [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 14]);
  const sheet = guess(readSheet(fixture("sheet.csv")).headers);
  assert.equal(sheet.preset, "sheet");
  assert.deepEqual([sheet.mapping.objective, sheet.mapping.keyResult, sheet.mapping.owner, sheet.mapping.start, sheet.mapping.target, sheet.mapping.current, sheet.mapping.unit, sheet.mapping.team], [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("a plan of Lattice's file: key results under the objective above, types and amounts read, owners matched or listed", () => {
  const sheet = readSheet(fixture("lattice-goals.csv"));
  const p = plan(sheet, guess(sheet.headers).mapping, { people, teams: [], existing: [], personal: false, currency: "EUR", chosen: {} });
  assert.deepEqual(p.objectives.map(o => [o.title, o.keyResults.length]), [["Grow revenue in the Lyon region", 3], ["Make the workshop safer", 2]]);
  const [a, b, c] = p.objectives[0]!.keyResults;
  assert.deepEqual([a!.kind, a!.start, a!.current, a!.target], ["number", 0, 4, 20]);
  assert.deepEqual([b!.kind, b!.current, b!.target], ["money", 12500, 50000]);
  assert.equal(c!.kind, "milestone");
  assert.equal(p.objectives[1]!.keyResults[1]!.kind, "percent");
  assert.equal(p.objectives[0]!.why, "Lyon is our second market");
  const byKey = new Map(p.owners.map(o => [o.written, o.match]));
  assert.equal(byKey.get("ines.moreau@atelier-martin.fr"), ines.id);
  assert.equal(byKey.get("jean.dupont@atelier-martin.fr"), null);
  assert.deepEqual(p.problems, []);
});

test("an admin imports a spreadsheet into the cycle: rows left out are said, unknown owners given to someone, a new team made", async () => {
  const { sql } = w.database;
  const { cycle } = await running(w);
  const text = fixture("sheet.csv");
  await assert.rejects(previewImport(sql, asMember(hugo), { text, cycleId: cycle.id }), refused("forbidden"));
  await assert.rejects(previewImport(sql, admin, { text: "just one line", cycleId: cycle.id }), refused("import_invalid"));
  await assert.rejects(previewImport(sql, admin, { text: "a,b\n" + "x,y\n".repeat(2100), cycleId: cycle.id }), refused("import_too_big"));
  const preview = await previewImport(sql, admin, { text, cycleId: cycle.id });
  assert.deepEqual(preview.plan.problems, [{ row: 6, code: "target_missing" }]);
  const unknown = preview.plan.owners.find(o => o.written === "Nobody Known")!;
  assert.equal(unknown.match, null);
  const done = await runImport(sql, admin, { text, mapping: preview.mapping, cycleId: cycle.id, owners: { [unknown.key]: sofia.id } });
  assert.equal(done.objectives.length, 3);
  assert.equal(done.keyResults, 4);
  const all = await cycleObjectives(sql, cycle.id, clockAt());
  const keep = all.find(o => o.title === "Keep every customer we have")!;
  assert.equal(keep.level, "team");
  assert.deepEqual(keep.keyResults.map(k => [k.title, k.kind, k.unit, k.current, k.owner]), [
    ["Customers lost", "number", "customer/customers", 1, hugo.id],
    ["Customers called every month", "number", "", 12, hugo.id],
    ["Reviews answered within a day", "percent", "", 60, sofia.id],
  ]);
  assert.equal(all.find(o => o.title === "Hire a second welder")!.keyResults[0]!.kind, "milestone");
  // Again: what is already there is not added twice.
  const again = await previewImport(sql, admin, { text, cycleId: cycle.id });
  assert.ok(again.plan.objectives.every(o => o.exists));
  await assert.rejects(runImport(sql, admin, { text, mapping: again.mapping, cycleId: cycle.id }), refused("import_nothing"));
  // Undo takes the import back.
  assert.equal(await undoImport(sql, admin, done.objectives), 3);
  assert.equal((await cycleObjectives(sql, cycle.id, clockAt())).length, 0);
  await sql`delete from cycles`;
  await sql`delete from teams`;
});

test("Goals' own French export comes back: levels, teams, what it supports, values with decimal commas, confidence as a first check-in", async () => {
  const { sql } = w.database;
  const { cycle } = await running(w);
  const text = fixture("goals-export-fr.csv");
  const preview = await previewImport(sql, admin, { text, cycleId: cycle.id });
  assert.deepEqual(preview.plan.newTeams, ["Atelier"]);
  assert.deepEqual(preview.plan.owners.filter(o => o.match === null).map(o => o.written).sort(), ["Léa Garnier", "Tom Walker"]);
  const done = await runImport(sql, admin, { text, mapping: preview.mapping, cycleId: cycle.id });
  const all = await cycleObjectives(sql, cycle.id, clockAt());
  const company = all.find(o => o.level === "company")!;
  const team = all.find(o => o.level === "team")!;
  assert.equal(team.parentId, company.id);
  assert.equal(company.owner, camille.id); // not found: the admin who imported
  assert.deepEqual(company.keyResults.map(k => [k.kind, k.start, k.target, k.current, k.unit, k.confidence]), [["percent", 82, 98, 90, "", "on_track"], ["number", 8, 5, 6.5, "jour/jours", "at_risk"]]);
  assert.equal(team.keyResults[0]!.kind, "milestone");
  const history = await checkIns(sql, company.keyResults.map(k => k.id));
  assert.equal([...history.values()].flat().length, 2);
  assert.ok(done.objectives.length === 2);
  await sql`delete from cycles`;
  await sql`delete from teams`;
});

test("a mapping must name the objective's column and real columns; a closed cycle takes nothing", async () => {
  const { sql } = w.database;
  const { cycle } = await running(w);
  const text = fixture("sheet.csv");
  await assert.rejects(runImport(sql, admin, { text, mapping: { keyResult: 1 }, cycleId: cycle.id }), refused("import_no_objective"));
  await assert.rejects(runImport(sql, admin, { text, mapping: { objective: 40 }, cycleId: cycle.id }), refused("invalid"));
  await sql`update cycles set closed_at = now() where id = ${cycle.id}`;
  await assert.rejects(previewImport(sql, admin, { text, cycleId: cycle.id }), refused("closed"));
  await sql`delete from cycles`;
  await sql`delete from teams`;
});
