import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { today } from "../lib/clock.ts";
import { addEntry } from "../lib/entries.ts";
import * as projects from "../lib/projects.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, nora } from "./support/members.ts";
import { refused } from "./support/refused.ts";

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

test("a manager creates a client's project with its tasks, rate and budget", async () => {
  const { sql } = database;
  const p = await projects.createProject(sql, asMember(camille), {
    name: "  Website  redesign ", newClient: "Boulangerie Dupain", color: "coral", billable: true, rateCents: 8500,
    budget: { kind: "hours", minutes: 40 * 60 }, tasks: ["Design", "Development", "design", " "],
  });
  assert.equal(p.name, "Website redesign");
  assert.equal(p.clientName, "Boulangerie Dupain");
  assert.deepEqual(p.tasks.map(k => k.name), ["Design", "Development"]);
  assert.deepEqual(p.budget, { kind: "hours", minutes: 2400 });
  assert.equal(p.rateCents, 8500);
  assert.ok(p.everyone);
  // Same name for the same client: refused; for another client: fine.
  await assert.rejects(projects.createProject(sql, asMember(camille), { name: "website REDESIGN", clientId: p.clientId }), refused("duplicate"));
  await projects.createProject(sql, asMember(camille), { name: "Website redesign", newClient: "Garage Leroy" });
  await assert.rejects(projects.createProject(sql, asMember(camille), { name: "X", newClient: "boulangerie dupain" }), refused("duplicate"));
});

test("what a manager writes is checked on the server; members and people without a role change nothing", async () => {
  const { sql } = database;
  await assert.rejects(projects.createProject(sql, asMember(hugo), { name: "Mine" }), refused("forbidden"));
  await assert.rejects(projects.createProject(sql, asMember(nora), { name: "Mine" }), refused("forbidden"));
  await assert.rejects(projects.createProject(sql, null, { name: "Mine" }), refused("forbidden"));
  await assert.rejects(projects.createProject(sql, asMember(camille), { name: "" }), refused("empty"));
  await assert.rejects(projects.createProject(sql, asMember(camille), { name: "x".repeat(81) }), refused("too_long"));
  await assert.rejects(projects.createProject(sql, asMember(camille), { name: "Bad", color: "pink" }), refused("invalid"));
  await assert.rejects(projects.createProject(sql, asMember(camille), { name: "Bad", rateCents: -1 }), refused("invalid"));
  await assert.rejects(projects.createProject(sql, asMember(camille), { name: "Bad", rateCents: 12.5 }), refused("invalid"));
  await assert.rejects(projects.createProject(sql, asMember(camille), { name: "Bad", budget: { kind: "hours", minutes: 0 } }), refused("invalid"));
  await assert.rejects(projects.createProject(sql, asMember(camille), { name: "Bad", budget: { kind: "gold" } }), refused("invalid"));
  await assert.rejects(projects.createProject(sql, asMember(camille), { name: "Bad", clientId: "999999" }), refused("not_found"));
  await assert.rejects(projects.createProject(sql, asMember(camille), { name: "Bad", people: ["camille"] }), refused("invalid"));
  await assert.rejects(projects.createProject(sql, asMember(camille), { name: "Bad", tasks: Array.from({ length: 51 }, (_, i) => "t" + i) }), refused("too_many"));
  await assert.rejects(projects.listProjects(sql, asMember(hugo)), refused("forbidden"));
  await assert.rejects(projects.project(sql, asMember(camille), "'; drop table projects; --"), refused("not_found"));
  await assert.rejects(projects.addTask(sql, asMember(ines), "1", "Sneaky"), refused("forbidden"));
  await assert.rejects(projects.archiveProject(sql, asMember(ines), "1", true), refused("forbidden"));
  await assert.rejects(projects.createClient(sql, asMember(ines), "Sneaky"), refused("forbidden"));
});

test("only the projects open to someone are offered to them, with their open tasks", async () => {
  const { sql } = database;
  const open = await projects.createProject(sql, asMember(camille), { name: "Open to all", tasks: ["A", "B"] });
  const named = await projects.createProject(sql, asMember(camille), { name: "Only Inès", everyone: false, people: [ines.id] });
  const closed = await projects.createProject(sql, asMember(camille), { name: "Closed" });
  await projects.archiveProject(sql, asMember(camille), closed.id, true);
  await projects.archiveTask(sql, asMember(camille), open.tasks[1]!.id, true);
  const forHugo = await projects.offeredProjects(sql, asMember(hugo));
  const forInes = await projects.offeredProjects(sql, asMember(ines));
  const forCamille = await projects.offeredProjects(sql, asMember(camille));
  assert.ok(forHugo.some(p => p.id === open.id) && !forHugo.some(p => p.id === named.id || p.id === closed.id));
  assert.deepEqual(forHugo.find(p => p.id === open.id)!.tasks.map(k => k.name), ["A"]);
  assert.ok(forInes.some(p => p.id === named.id));
  assert.ok(forCamille.some(p => p.id === named.id) && !forCamille.some(p => p.id === closed.id));
  await assert.rejects(projects.offeredProjects(sql, asMember(nora)), refused("forbidden"));
  // Writing on it follows the same rule.
  await assert.rejects(projects.writable(sql, asMember(hugo), named.id, null), refused("not_offered"));
  await assert.rejects(projects.writable(sql, asMember(hugo), closed.id, null), refused("not_offered"));
  await assert.rejects(projects.writable(sql, asMember(hugo), open.id, open.tasks[1]!.id), refused("not_offered"));
  await assert.rejects(projects.writable(sql, asMember(hugo), open.id, "999999"), refused("not_found"));
  assert.deepEqual(await projects.writable(sql, asMember(hugo), open.id, open.tasks[0]!.id), { projectId: open.id, taskId: open.tasks[0]!.id, billable: true });
  // Named people change: Hugo is added, Inès removed.
  await projects.updateProject(sql, asMember(camille), named.id, { name: "Only Hugo", everyone: false, people: [hugo.id] });
  assert.ok((await projects.offeredProjects(sql, asMember(hugo))).some(p => p.id === named.id));
  assert.ok(!(await projects.offeredProjects(sql, asMember(ines))).some(p => p.id === named.id));
  // Opened again, archived projects come back.
  await projects.archiveProject(sql, asMember(camille), closed.id, false);
  assert.ok((await projects.offeredProjects(sql, asMember(hugo))).some(p => p.id === closed.id));
});

test("a project's budget shows what it used: hours, and billable hours at its rate", async () => {
  const { sql } = database;
  const p = await projects.createProject(sql, asMember(camille), { name: "Budgeted", rateCents: 6000, budget: { kind: "money", cents: 100000 } });
  await addEntry(sql, asMember(hugo), { projectId: p.id, day: today(), minutes: 90 });
  await addEntry(sql, asMember(ines), { projectId: p.id, day: today(), minutes: 30, billable: false });
  const read = await projects.project(sql, asMember(camille), p.id);
  assert.deepEqual(read.used, { minutes: 120, billableMinutes: 90, cents: 9000 });
  assert.equal(projects.budgetShare(read), 0.09);
  assert.equal(projects.amount(45, 10000), 7500);
  assert.equal(projects.amount(45, null), 0);
});

test("clients are renamed and hidden; tasks are added, renamed and closed", async () => {
  const { sql } = database;
  const c = await projects.createClient(sql, asMember(camille), "Mairie");
  await projects.renameClient(sql, asMember(camille), c.id, "Mairie de Lyon");
  await assert.rejects(projects.renameClient(sql, asMember(camille), c.id, "Garage Leroy"), refused("duplicate"));
  await projects.archiveClient(sql, asMember(camille), c.id, true);
  const list = await projects.listClients(sql, asMember(camille));
  assert.ok(list.find(x => x.id === c.id)?.archived);
  const p = await projects.createProject(sql, asMember(camille), { name: "Tasks", clientId: c.id });
  const task = await projects.addTask(sql, asMember(camille), p.id, "Meetings");
  await assert.rejects(projects.addTask(sql, asMember(camille), p.id, "meetings"), refused("duplicate"));
  await projects.renameTask(sql, asMember(camille), task.id, "Calls");
  await projects.archiveTask(sql, asMember(camille), task.id, true);
  assert.deepEqual((await projects.project(sql, asMember(camille), p.id)).tasks, [{ id: task.id, name: "Calls", archived: true }]);
  const example = await projects.example(sql, asMember(camille), { client: "Example client", project: "Website", tasks: ["Design", "Development", "Meetings"] });
  assert.equal(example.tasks.length, 3);
  await assert.rejects(projects.example(sql, asMember(hugo), { client: "x", project: "y", tasks: [] }), refused("forbidden"));
});
