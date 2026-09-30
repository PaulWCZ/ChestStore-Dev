import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { POST } from "../app/chest-events/route.ts";
import { AppError } from "../lib/app-error.ts";
import { erase } from "../lib/lifecycle.ts";
import { checkIn, updateKeyResult } from "../lib/key-results.ts";
import { createObjective } from "../lib/objectives.ts";
import { noCycleWords, whoStarts } from "../lib/people.ts";
import { cycleObjectives, objectiveById } from "../lib/read.ts";
import { forgetMemberGroups, groupsOf, readerFor } from "../lib/groups.ts";
import { knownBoards } from "../lib/sources.ts";
import { addGroupTeam, chestGroups, forgetGroups } from "../lib/teams.ts";
import { clockAt } from "../lib/tell.ts";
import { unitFor, valueText } from "../lib/values.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, sofia } from "./support/members.ts";
import { running, world, type World } from "./support/world.ts";

// Key results fed by the store's other tools (lib/sources.ts): cards done
// in Tasks, tickets solved in Support, people hired in Hiring — counted in
// the cycle's dates, on one board or all, all of them or only the owner's.
// And the coherence fixes: every group of the Chest as a team, units read
// by their own language's rule, the admins named on an empty page.
let w: World;
before(async () => { w = await world({ groups: true }); });
after(async () => { await w.close(); });

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const admin = asMember(camille);
const deliver = (type: string, data: Record<string, unknown>, occurredAt = new Date().toISOString()) => w.chest.deliver({ type, data, occurredAt } as never, POST);

test("cards done, tickets solved and hires follow what the tools tell — per board, per owner, undone when reopened", async () => {
  const { sql } = w.database;
  const { cycle } = await running(w);
  const o = await createObjective(sql, admin, {
    cycleId: cycle.id, level: "company", title: "Ship and serve",
    keyResults: [
      { title: "Cards done", source: "tasks.done", unit: "card/cards", start: "0", target: "50", owner: ines.id },
      { title: "Website cards Inès finished", source: "tasks.done", scope: "B-web", mine: true, unit: "card/cards", start: "0", target: "10", owner: ines.id },
      { title: "Tickets solved by Hugo", source: "helpdesk.solved", mine: true, start: "0", target: "100", owner: hugo.id },
      { title: "People hired", source: "hiring.hired", start: "0", target: "3", owner: camille.id },
    ],
  });
  const read = async () => (await objectiveById(sql, o.id, clockAt(), null))!.keyResults.map(k => k.current);
  assert.deepEqual(await read(), [0, 0, 0, 0]);
  assert.equal(await deliver("tasks.card.done", { card: "C-1", board: "B-web", boardName: "Website", assignees: [ines.id, hugo.id] }), 204);
  await deliver("tasks.card.done", { card: "C-2", board: "B-web", boardName: "Website", assignees: [hugo.id] });
  await deliver("tasks.card.done", { card: "C-3", board: "B-shop", boardName: "Shop", assignees: [] });
  await deliver("tasks.card.done", { card: "C-old", board: "B-web", assignees: [ines.id] }, "2020-01-15T10:00:00Z");
  await deliver("helpdesk.ticket.solved", { ticket: "T-1", assignee: hugo.id });
  await deliver("helpdesk.ticket.solved", { ticket: "T-2", assignee: ines.id });
  await deliver("helpdesk.ticket.solved", { ticket: "T-3", assignee: null });
  // Hiring's own shape: Goals keeps the candidate and who hired, nothing else.
  await deliver("hiring.hired", { candidate: "K-1", name: "Jean Dupont", email: "jean@example.test", job: "Designer", team: null, place: null, startDate: null, hiredBy: camille.id });
  assert.deepEqual(await read(), [3, 1, 1, 1]);
  const kept = await sql`select * from fed_events where kind = 'hiring.hire'`;
  assert.ok(!JSON.stringify(kept).includes("Jean"), "no candidate's name kept");
  // Undone: a card reopened, a ticket reopened, a hire cancelled.
  await deliver("tasks.card.reopened", { card: "C-1" });
  await deliver("helpdesk.ticket.reopened", { ticket: "T-1" });
  await deliver("hiring.hire_cancelled", { candidate: "K-1" });
  assert.deepEqual(await read(), [2, 0, 0, 0]);
  // Done again (the same card): counted once.
  await deliver("tasks.card.done", { card: "C-1", board: "B-web", boardName: "Website (new name)", assignees: [ines.id] });
  await deliver("tasks.card.done", { card: "C-1", board: "B-web", boardName: "Website (new name)", assignees: [ines.id] });
  assert.deepEqual(await read(), [3, 1, 0, 0]);
  // Nonsense is accepted and ignored.
  assert.equal(await deliver("tasks.card.done", { card: "bad ref!", board: "B-web", assignees: ["not a member"] }), 204);
  assert.equal(await deliver("helpdesk.ticket.solved", { ticket: "T-9", assignee: 42 }), 204);
  assert.deepEqual(await read(), [3, 1, 0, 0]);
  // The boards heard of, with their last name, for the form.
  assert.deepEqual(await knownBoards(sql), [{ id: "B-shop", name: "Shop" }, { id: "B-web", name: "Website (new name)" }]);
  // The owner changes: "only theirs" follows them.
  const [, web, tickets] = (await objectiveById(sql, o.id, clockAt(), null))!.keyResults;
  await updateKeyResult(sql, admin, web!.id, { owner: hugo.id });
  assert.equal((await read())[1], 1, "C-2 was Hugo's; C-1 now Inès's only");
  // An update keeps the tool's value, whatever is typed.
  const done = await checkIn(sql, asMember(hugo), tickets!.id, { value: "57", confidence: "on_track" });
  assert.equal(done.value, 0);
  // A board only for Tasks; "only theirs" only where the event names people.
  await assert.rejects(updateKeyResult(sql, admin, tickets!.id, { scope: "bad ref!" }), refused("invalid"));
  await updateKeyResult(sql, admin, tickets!.id, { source: "crm.won_count", mine: true });
  const row = (await sql`select source, source_mine from key_results where id = ${tickets!.id}`)[0]!;
  assert.deepEqual([row["source"], row["source_mine"]], ["crm.won_count", false]);
  // Erased: their id leaves what the tools told.
  await erase(sql, ines.id);
  assert.equal((await sql`select count(*)::int as n from fed_events where ${ines.id} = any(members)`)[0]!["n"], 0);
  await sql`delete from cycles`;
  await sql`delete from teams`;
});

// The exact shapes Tasks and Support publish today (their
// lib/card-events.ts cardEventData and lib/ticket-events.ts
// ticketEventData): ids as text of digits, Tasks' assignees sorted by id,
// its board's name; Support's one assignee or null. Written out here, not
// imported: each tool stands on its own.
test("the exact events Tasks and Support publish move the key results they feed", async () => {
  const { sql } = w.database;
  await sql`delete from fed_events`;
  const { cycle } = await running(w);
  const o = await createObjective(sql, admin, {
    cycleId: cycle.id, level: "company", title: "Deliver",
    keyResults: [
      { title: "Cards done on Website", source: "tasks.done", scope: "7", unit: "card/cards", start: "0", target: "20", owner: ines.id },
      { title: "Cards Hugo finished", source: "tasks.done", mine: true, unit: "card/cards", start: "0", target: "20", owner: hugo.id },
      { title: "Tickets solved", source: "helpdesk.solved", start: "0", target: "100", owner: hugo.id },
      { title: "Tickets Hugo solved", source: "helpdesk.solved", mine: true, start: "0", target: "100", owner: hugo.id },
    ],
  });
  const read = async () => (await objectiveById(sql, o.id, clockAt(), null))!.keyResults.map(k => k.current);
  // Tasks: tasks.card.done {card, board, boardName, assignees}, key tasks:<card>:done:<ms>.
  const card = { card: "42", board: "7", boardName: "Website launch", assignees: [hugo.id, ines.id].sort() };
  assert.equal(await deliver("tasks.card.done", card), 204);
  await deliver("tasks.card.done", { card: "43", board: "7", boardName: "Website launch", assignees: [] });
  await deliver("tasks.card.done", { card: "44", board: "8", boardName: "Shop", assignees: [hugo.id] });
  // Support: helpdesk.ticket.solved {ticket, assignee}, key helpdesk:<ticket>:solved:<ms>.
  await deliver("helpdesk.ticket.solved", { ticket: "1042", assignee: hugo.id });
  await deliver("helpdesk.ticket.solved", { ticket: "1043", assignee: null });
  assert.deepEqual(await read(), [2, 2, 2, 1]);
  assert.deepEqual(await knownBoards(sql), [{ id: "8", name: "Shop" }, { id: "7", name: "Website launch" }]);
  // Reopened: {card} and {ticket}, nothing else.
  await deliver("tasks.card.reopened", { card: "42" });
  await deliver("helpdesk.ticket.reopened", { ticket: "1042" });
  assert.deepEqual(await read(), [1, 1, 1, 0]);
  // Done and solved again (a new key, a later time): counted once more.
  await deliver("tasks.card.done", card);
  await deliver("helpdesk.ticket.solved", { ticket: "1042", assignee: hugo.id });
  assert.deepEqual(await read(), [2, 2, 2, 1]);
  await sql`delete from cycles`;
  await sql`delete from teams`;
  await sql`delete from fed_events`;
});

test("every group of the Chest may become a team, not only those that give Goals", async () => {
  const { sql } = w.database;
  forgetGroups();
  const groups = await chestGroups();
  assert.deepEqual(groups.map(g => g.name).sort(), ["Office", "Sales", "Warehouse"]);
  assert.deepEqual(groups.find(g => g.name === "Warehouse")!.members, [hugo.id]);
  const team = await addGroupTeam(sql, admin, "grp_warehouseaaaaaaaaaaaaaaaaa");
  assert.equal(team.name, "Warehouse");
  await sql`delete from teams`;
});

test("a group that does not give Goals is still a team its members write for and read: its membership is asked of the Chest", async () => {
  const { sql } = w.database;
  const { cycle } = await running(w);
  forgetGroups();
  forgetMemberGroups();
  const team = await addGroupTeam(sql, admin, "grp_warehouseaaaaaaaaaaaaaaaaa");
  const hugoM = asMember(hugo), sofiaM = asMember(sofia);
  // The assertion carries only the groups that give Goals: not Warehouse.
  assert.ok(!hugoM.groups.includes("grp_warehouseaaaaaaaaaaaaaaaaa"));
  assert.ok((await groupsOf(hugoM)).includes("grp_warehouseaaaaaaaaaaaaaaaaa"));
  const o = await createObjective(sql, hugoM, { cycleId: cycle.id, level: "team", teamId: team.id, title: "Ship every order the same day", visibility: "team", keyResults: [{ title: "Orders shipped the same day", kind: "percent", start: "70", target: "95", owner: hugo.id }] });
  await assert.rejects(createObjective(sql, sofiaM, { cycleId: cycle.id, level: "team", teamId: team.id, title: "Not my team" }), refused("forbidden"));
  const clock = clockAt();
  assert.ok((await cycleObjectives(sql, cycle.id, clock, await readerFor(hugoM))).some(x => x.id === o.id), "the team reads its confidential objective");
  assert.ok(!(await cycleObjectives(sql, cycle.id, clock, await readerFor(sofiaM))).some(x => x.id === o.id), "someone outside the group does not");
  await sql`delete from cycles`;
  await sql`delete from teams`;
});

test("a unit follows its own language's rule, whoever reads it; unknown, the form for one is for 1 only", () => {
  const en = { kind: "number" as const, unit: "customer/customers", currency: null, unitLocale: "en" };
  const fr = { kind: "number" as const, unit: "client/clients", currency: null, unitLocale: "fr" };
  assert.equal(valueText(en, 0, "fr"), "0 customers", "an English unit read in French: English grammar");
  assert.equal(valueText(en, 1, "fr"), "1 customer");
  assert.equal(valueText(fr, 0, "en"), "0 client", "a French unit read in English: French grammar");
  assert.equal(valueText(fr, 2, "en"), "2 clients");
  assert.equal(unitFor("customer/customers", 0, null), "customers", "never “0 customer”");
  assert.equal(unitFor("customer/customers", 1, null), "customer");
});

test("a key result's unit is kept with its writer's language", async () => {
  const { sql } = w.database;
  const { cycle } = await running(w);
  const o = await createObjective(sql, asMember(camille), {
    cycleId: cycle.id, level: "company", title: "Signer des clients",
    keyResults: [{ title: "Nouveaux clients", kind: "number", unit: "client/clients", start: "0", target: "20", owner: ines.id }],
  });
  const k = (await objectiveById(sql, o.id, clockAt(), null))!.keyResults[0]!;
  assert.equal(k.unitLocale, "fr");
  assert.equal(valueText(k, 0, "en"), "0 client");
  await updateKeyResult(sql, admin, k.id, { unit: "customer/customers" });
  const again = (await objectiveById(sql, o.id, clockAt(), null))!.keyResults[0]!;
  assert.equal(again.unitLocale, camille.language, "rewritten: its writer’s language");
  await sql`delete from cycles`;
  await sql`delete from teams`;
});

test("a member's empty page names whom to ask", async () => {
  assert.equal(await whoStarts("en"), "Camille Martin");
  assert.equal(await noCycleWords("fr"), "Demandez à Camille Martin de lancer le premier trimestre. D’ici là, rien à fixer.");
});
