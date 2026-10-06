import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { AppError } from "../src/lib/app-error.ts";
import { addComment, comments, editComment, removeComment, restoreComment } from "../src/lib/comments.ts";
import { closeCycle, createCycle, deleteCycle, reopenCycle, setCurrent, updateCycle } from "../src/lib/cycles.ts";
import { addKeyResult, archiveKeyResult, checkIn, undoCheckIn, updateKeyResult } from "../src/lib/key-results.ts";
import { nextQuarter, quarterOf } from "../src/lib/model.ts";
import { archiveObjective, carryOver, createObjective, readObjective, restoreObjective, saveRetro, updateObjective } from "../src/lib/objectives.ts";
import { cycleObjectives, cycles, objectiveById, ownedBy, waitingCounts } from "../src/lib/read.ts";
import { addAllGroups, addGroupTeam, addTeam, archiveTeam, renameTeam, saveSettings, settings, teams } from "../src/lib/teams.ts";
import { clockAt } from "../src/lib/tell.ts";
import { today } from "../src/lib/time.ts";
import { asMember } from "./support/member.ts";
import { camille, groups, hugo, ines, nora, sofia } from "./support/members.ts";
import { companyObjective, running, world, type World } from "./support/world.ts";

let w: World;
before(async () => { w = await world(); });
after(async () => { await w.close(); });

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const admin = asMember(camille), inesM = asMember(ines), hugoM = asMember(hugo), sofiaM = asMember(sofia), noraM = asMember(nora);

test("cycles: admins create them (the first is current), change them, pick the current one; members cannot", async () => {
  const { sql } = w.database;
  const q = quarterOf(today());
  await assert.rejects(createCycle(sql, hugoM, q), refused("forbidden"));
  await assert.rejects(createCycle(sql, admin, { ...q, endsOn: q.startsOn }), refused("dates_order"));
  await assert.rejects(createCycle(sql, admin, { ...q, name: "  " }), refused("empty"));
  const first = await createCycle(sql, admin, q);
  assert.equal(first.current, true);
  const next = await createCycle(sql, admin, nextQuarter(q.endsOn));
  assert.equal(next.current, false);
  await setCurrent(sql, admin, next.id);
  assert.deepEqual((await cycles(sql)).filter(c => c.current).map(c => c.id), [next.id]);
  await setCurrent(sql, admin, first.id);
  await assert.rejects(setCurrent(sql, hugoM, next.id), refused("forbidden"));
  const renamed = await updateCycle(sql, admin, next.id, { name: "Next quarter" });
  assert.equal(renamed.name, "Next quarter");
  await deleteCycle(sql, admin, next.id);
  await assert.rejects(deleteCycle(sql, admin, "999999"), refused("not_found"));
  await assert.rejects(deleteCycle(sql, admin, "x"), refused("not_found"));
  await sql`delete from cycles`;
});

test("teams: admins add the Chest's groups (their names are the Chest's) or named teams; members cannot", async () => {
  const { sql } = w.database;
  await assert.rejects(addTeam(sql, hugoM, "Workshop"), refused("forbidden"));
  const workshop = await addTeam(sql, admin, " Workshop ");
  assert.equal(workshop.name, "Workshop");
  await assert.rejects(addTeam(sql, admin, "workshop"), refused("team_exists"));
  await assert.rejects(addGroupTeam(sql, admin, "grp_" + "z".repeat(26)), refused("not_found"));
  await assert.rejects(addGroupTeam(sql, admin, "sales"), refused("invalid"));
  const sales = await addGroupTeam(sql, admin, groups.sales);
  assert.deepEqual([sales.name, sales.members?.length], ["Sales", 2]);
  assert.equal(await addAllGroups(sql, admin), 1);
  assert.equal(await addAllGroups(sql, admin), 0);
  await assert.rejects(renameTeam(sql, admin, sales.id, "Sellers"), refused("forbidden"));
  await renameTeam(sql, admin, workshop.id, "The workshop");
  await archiveTeam(sql, admin, workshop.id, true);
  assert.deepEqual((await teams(sql)).map(t => t.name), ["Office", "Sales"]);
  assert.equal((await teams(sql, { archived: true })).length, 3);
  await archiveTeam(sql, admin, workshop.id, false);
  await sql`delete from teams`;
});

test("objectives: company ones by admins; team ones by the team (anyone for a named team); personal ones only when turned on, one's own", async () => {
  const { sql } = w.database;
  const { cycle, sales, workshop } = await running(w);
  await assert.rejects(createObjective(sql, hugoM, { cycleId: cycle.id, level: "company", title: "Grow" }), refused("forbidden"));
  const company = await companyObjective(w, cycle.id);
  assert.equal(company.keyResults.length, 2);
  await assert.rejects(createObjective(sql, sofiaM, { cycleId: cycle.id, level: "team", teamId: sales.id, title: "Sell more" }), refused("forbidden"));
  const salesGoal = await createObjective(sql, inesM, { cycleId: cycle.id, level: "team", teamId: sales.id, parentId: company.id, title: "Sign 12 shops in Lyon" });
  assert.equal(salesGoal.owner, ines.id);
  const shop = await createObjective(sql, sofiaM, { cycleId: cycle.id, level: "team", teamId: workshop.id, title: "Deliver on time" });
  await assert.rejects(createObjective(sql, noraM, { cycleId: cycle.id, level: "team", teamId: workshop.id, title: "x" }), refused("forbidden"));
  await assert.rejects(createObjective(sql, hugoM, { cycleId: cycle.id, level: "personal", title: "Learn Italian" }), refused("personal_off"));
  assert.deepEqual(await settings(sql), { personal: false });
  await assert.rejects(saveSettings(sql, hugoM, { personal: true }), refused("forbidden"));
  await saveSettings(sql, admin, { personal: true });
  const mine = await createObjective(sql, hugoM, { cycleId: cycle.id, level: "personal", parentId: salesGoal.id, title: "Learn the new quoting tool" });
  assert.equal(mine.owner, hugo.id);
  await assert.rejects(createObjective(sql, hugoM, { cycleId: cycle.id, level: "personal", owner: ines.id, title: "For Inès" }), refused("forbidden"));
  // Alignment: a team's to a company objective; a person's to a company or team one; same cycle.
  await assert.rejects(createObjective(sql, inesM, { cycleId: cycle.id, level: "team", teamId: sales.id, parentId: shop.id, title: "x" }), refused("parent_invalid"));
  await assert.rejects(createObjective(sql, admin, { cycleId: cycle.id, level: "company", parentId: company.id, title: "x" }), refused("parent_invalid"));
  await assert.rejects(createObjective(sql, hugoM, { cycleId: cycle.id, level: "personal", parentId: mine.id, title: "x" }), refused("parent_invalid"));
  await assert.rejects(createObjective(sql, inesM, { cycleId: cycle.id, level: "team", teamId: sales.id, parentId: "999999", title: "x" }), refused("parent_invalid"));
  // Bounds and nonsense.
  await assert.rejects(createObjective(sql, inesM, { cycleId: cycle.id, level: "team", teamId: sales.id, title: "x".repeat(201) }), refused("too_long"));
  await assert.rejects(createObjective(sql, inesM, { cycleId: cycle.id, level: "team", teamId: sales.id, title: "x", keyResults: Array.from({ length: 11 }, () => ({ title: "k", kind: "milestone" })) }), refused("too_many"));
  await assert.rejects(createObjective(sql, inesM, { cycleId: cycle.id, level: "team", teamId: sales.id, title: "x", owner: "mbr_" + "q".repeat(26) }), refused("invalid"));
  await assert.rejects(createObjective(sql, inesM, { cycleId: cycle.id, level: "boss", title: "x" }), refused("invalid"));
  await assert.rejects(createObjective(sql, inesM, { cycleId: "'; drop table cycles; --", level: "team", title: "x" }), refused("not_found"));
  await assert.rejects(createObjective(sql, noraM, { cycleId: cycle.id, level: "team", teamId: workshop.id, title: "x" }), refused("forbidden"));
  const all = await cycleObjectives(sql, cycle.id, clockAt(), null);
  assert.deepEqual(all.map(o => o.level), ["company", "team", "team", "personal"]);
  await archiveTeam(sql, admin, workshop.id, true);
  await assert.rejects(createObjective(sql, sofiaM, { cycleId: cycle.id, level: "team", teamId: workshop.id, title: "x" }), refused("team_archived"));
});

test("an objective is changed by its owner or an admin; removed with undo", async () => {
  const { sql } = w.database;
  const [cycle] = (await cycles(sql)).filter(c => c.current);
  const all = await cycleObjectives(sql, cycle!.id, clockAt(), null);
  const salesGoal = all.find(o => o.title === "Sign 12 shops in Lyon")!;
  await assert.rejects(updateObjective(sql, hugoM, salesGoal.id, { title: "Mine now" }), refused("forbidden"));
  const done = await updateObjective(sql, inesM, salesGoal.id, { title: "Sign 12 shops in Lyon and Grenoble", owner: hugo.id });
  assert.deepEqual([done.previousOwner, done.owner], [ines.id, hugo.id]);
  await updateObjective(sql, admin, salesGoal.id, { owner: ines.id, parentId: null });
  assert.equal((await objectiveById(sql, salesGoal.id, clockAt(), null))!.parentId, null);
  await archiveObjective(sql, inesM, salesGoal.id);
  await assert.rejects(readObjective(sql, inesM, salesGoal.id), refused("not_found"));
  await assert.rejects(restoreObjective(sql, hugoM, salesGoal.id), refused("forbidden"));
  await restoreObjective(sql, inesM, salesGoal.id);
  assert.equal((await readObjective(sql, noraM, salesGoal.id).catch(e => e)).code, "forbidden");
});

test("key results: added by the objective's owner, bounded; the kind is fixed once checked in", async () => {
  const { sql } = w.database;
  const [cycle] = (await cycles(sql)).filter(c => c.current);
  const salesGoal = (await cycleObjectives(sql, cycle!.id, clockAt(), null)).find(o => o.title.startsWith("Sign 12"))!;
  await assert.rejects(addKeyResult(sql, hugoM, salesGoal.id, { title: "x", kind: "number", target: "3" }), refused("forbidden"));
  await assert.rejects(addKeyResult(sql, inesM, salesGoal.id, { title: "Shops", kind: "number", start: "3", target: "3" }), refused("same_values"));
  await assert.rejects(addKeyResult(sql, inesM, salesGoal.id, { title: "Shops", kind: "number", target: "lots" }), refused("invalid_number"));
  await assert.rejects(addKeyResult(sql, inesM, salesGoal.id, { title: "Shops", kind: "number", target: "3", weight: 7 }), refused("invalid"));
  const shops = await addKeyResult(sql, inesM, salesGoal.id, { title: "Shops signed", kind: "number", unit: "shops", start: "0", target: "12", owner: hugo.id, weight: 2 });
  const returns = await addKeyResult(sql, inesM, salesGoal.id, { title: "Returns", kind: "percent", start: "8", target: "3" });
  const revenue = await addKeyResult(sql, inesM, salesGoal.id, { title: "Revenue", kind: "money", start: "0", target: "40000" });
  const o = (await objectiveById(sql, salesGoal.id, clockAt(), null))!;
  assert.deepEqual(o.keyResults.map(k => [k.title, k.owner, k.current, k.weight]), [["Shops signed", hugo.id, 0, 2], ["Returns", ines.id, 8, 1], ["Revenue", ines.id, 0, 1]]);
  assert.equal(o.keyResults[2]!.currency, "EUR");
  assert.equal(o.progress, 0);
  await checkIn(sql, inesM, returns.id, { value: "5,5", confidence: "at_risk", note: "Better packaging" });
  await assert.rejects(updateKeyResult(sql, inesM, returns.id, { kind: "number" }), refused("invalid"));
  await updateKeyResult(sql, inesM, returns.id, { target: "2" });
  const kr = (await objectiveById(sql, salesGoal.id, clockAt(), null))!.keyResults.find(k => k.id === returns.id)!;
  assert.deepEqual([kr.start, kr.target, kr.current], [8, 2, 5.5]);
  await updateKeyResult(sql, inesM, revenue.id, { title: "Revenue from shops", kind: "number", unit: "orders", target: "50" });
  const changed = (await objectiveById(sql, salesGoal.id, clockAt(), null))!.keyResults.find(k => k.id === revenue.id)!;
  assert.deepEqual([changed.kind, changed.unit, changed.currency, changed.current], ["number", "orders", null, 0]);
  await archiveKeyResult(sql, inesM, revenue.id, true);
  await assert.rejects(archiveKeyResult(sql, hugoM, shops.id, true), refused("forbidden"));
  assert.equal((await objectiveById(sql, salesGoal.id, clockAt(), null))!.keyResults.length, 2);
  await archiveKeyResult(sql, inesM, revenue.id, false);
  await archiveKeyResult(sql, inesM, revenue.id, true);
});

test("check-ins: by the key result's owner (or an admin), a value and a confidence; progress follows; the latest can be taken back", async () => {
  const { sql } = w.database;
  const [cycle] = (await cycles(sql)).filter(c => c.current);
  const salesGoal = (await cycleObjectives(sql, cycle!.id, clockAt(), null)).find(o => o.title.startsWith("Sign 12"))!;
  const shops = salesGoal.keyResults.find(k => k.title === "Shops signed")!;
  await assert.rejects(checkIn(sql, inesM, shops.id, { value: "3", confidence: "on_track" }), refused("forbidden"));
  await assert.rejects(checkIn(sql, hugoM, shops.id, { value: "3" }), refused("invalid"));
  await assert.rejects(checkIn(sql, hugoM, shops.id, { value: "three", confidence: "on_track" }), refused("invalid_number"));
  await assert.rejects(checkIn(sql, hugoM, shops.id, { value: "3", confidence: "on_track", note: "x".repeat(501) }), refused("too_long"));
  const first = await checkIn(sql, hugoM, shops.id, { value: "3", confidence: "on_track", note: "Two in Lyon" });
  assert.equal(first.progress, 0.25);
  const second = await checkIn(sql, hugoM, shops.id, { value: "6", confidence: "at_risk" });
  await assert.rejects(undoCheckIn(sql, hugoM, first.id), refused("too_late"));
  await assert.rejects(undoCheckIn(sql, inesM, second.id), refused("forbidden"));
  await undoCheckIn(sql, hugoM, second.id);
  let kr = (await objectiveById(sql, salesGoal.id, clockAt(), null))!.keyResults.find(k => k.id === shops.id)!;
  assert.deepEqual([kr.current, kr.confidence, kr.thisWeek], [3, "on_track", true]);
  await sql`update check_ins set created_at = now() - interval '2 hours' where id = ${first.id}`;
  await assert.rejects(undoCheckIn(sql, hugoM, first.id), refused("too_late"));
  await undoCheckIn(sql, admin, first.id);
  kr = (await objectiveById(sql, salesGoal.id, clockAt(), null))!.keyResults.find(k => k.id === shops.id)!;
  assert.deepEqual([kr.current, kr.confidence], [0, null]);
  await checkIn(sql, admin, shops.id, { value: 4, confidence: "on_track" });
  const website = (await cycleObjectives(sql, cycle!.id, clockAt(), null)).find(o => o.level === "company")!.keyResults.find(k => k.kind === "milestone")!;
  await assert.rejects(checkIn(sql, hugoM, website.id, { value: "0.5", confidence: "on_track" }), refused("invalid"));
  const launched = await checkIn(sql, hugoM, website.id, { value: "1", confidence: "on_track" });
  assert.equal(launched.progress, 1);
});

test("the objective's progress is the weighted mean of its key results; confidence is the worst; quiet key results are stale", async () => {
  const { sql } = w.database;
  const [cycle] = (await cycles(sql)).filter(c => c.current);
  const salesGoal = (await cycleObjectives(sql, cycle!.id, clockAt(), null)).find(o => o.title.startsWith("Sign 12"))!;
  // Shops 4/12 (weight 2) and Returns 8 → 5.5 of 2 (weight 1).
  const expected = ((4 / 12) * 2 + (2.5 / 6)) / 3;
  assert.ok(Math.abs(salesGoal.progress! - expected) < 1e-9);
  assert.equal(salesGoal.confidence, "at_risk");
  const returns = salesGoal.keyResults.find(k => k.title === "Returns")!;
  await sql`update check_ins set created_at = now() - interval '20 days' where key_result_id = ${returns.id}`;
  const later = (await objectiveById(sql, salesGoal.id, clockAt(), null))!;
  assert.equal(later.keyResults.find(k => k.id === returns.id)!.stale, true);
  assert.equal(later.stale, true);
});

test("what waits for my check-in this week: mine, running, not reached, older than this week, not checked in since Monday", async () => {
  const { sql } = w.database;
  const clock = clockAt();
  await sql`update key_results set created_at = now() - interval '30 days'`;
  const counts = await waitingCounts(sql, [ines.id, hugo.id, sofia.id], clock);
  // Inès: Customers signed (company), Returns (checked in 20 days ago). Hugo: Shops checked in now, Website done.
  assert.deepEqual([counts.get(ines.id), counts.get(hugo.id), counts.get(sofia.id)], [2, 0, 0]);
  const owned = await ownedBy(sql, ines.id, clock);
  assert.ok(owned.some(o => o.title.startsWith("Sign 12")));
  assert.ok(owned.some(o => o.level === "company"));
});

test("a closed cycle is frozen: no objective, key result or check-in; the retrospective and comments stay open; reopening undoes it", async () => {
  const { sql } = w.database;
  const [cycle] = (await cycles(sql)).filter(c => c.current);
  const company = (await cycleObjectives(sql, cycle!.id, clockAt(), null)).find(o => o.level === "company")!;
  const kr = company.keyResults[0]!;
  await assert.rejects(closeCycle(sql, hugoM, cycle!.id), refused("forbidden"));
  await assert.rejects(saveRetro(sql, inesM, company.id, { score: "70" }, today()), refused("forbidden"));
  await closeCycle(sql, admin, cycle!.id);
  assert.equal((await cycles(sql)).find(c => c.id === cycle!.id)!.current, false);
  await assert.rejects(checkIn(sql, inesM, kr.id, { value: "9", confidence: "on_track" }), refused("closed"));
  await assert.rejects(createObjective(sql, admin, { cycleId: cycle!.id, level: "company", title: "Late" }), refused("closed"));
  await assert.rejects(updateObjective(sql, admin, company.id, { title: "Changed" }), refused("closed"));
  await assert.rejects(addKeyResult(sql, admin, company.id, { title: "k", kind: "milestone" }), refused("closed"));
  await assert.rejects(setCurrent(sql, admin, cycle!.id), refused("closed"));
  await assert.rejects(saveRetro(sql, admin, company.id, { score: "140" }, today()), refused("invalid_score"));
  await assert.rejects(saveRetro(sql, hugoM, company.id, { score: "70" }, today()), refused("forbidden"));
  await saveRetro(sql, admin, company.id, { score: "70 %", learned: "Start the trade shows earlier." }, today());
  const again = (await objectiveById(sql, company.id, clockAt(), null))!;
  assert.deepEqual([again.score, again.learned, again.retroBy], [0.7, "Start the trade shows earlier.", camille.id]);
  await addComment(sql, hugoM, company.id, "Well done all.");
  await reopenCycle(sql, admin, cycle!.id);
  await setCurrent(sql, admin, cycle!.id);
});

test("carried over: the objective again in another open cycle, its unfinished key results starting where they stopped", async () => {
  const { sql } = w.database;
  const [cycle] = (await cycles(sql)).filter(c => c.current);
  const next = await createCycle(sql, admin, nextQuarter(cycle!.endsOn));
  const salesGoal = (await cycleObjectives(sql, cycle!.id, clockAt(), null)).find(o => o.title.startsWith("Sign 12"))!;
  await assert.rejects(carryOver(sql, hugoM, salesGoal.id, next.id), refused("forbidden"));
  await assert.rejects(carryOver(sql, inesM, salesGoal.id, cycle!.id), refused("invalid"));
  const copy = await carryOver(sql, inesM, salesGoal.id, next.id);
  assert.equal(await carryOver(sql, inesM, salesGoal.id, next.id), copy);
  const carried = (await objectiveById(sql, copy, clockAt(), null))!;
  assert.equal(carried.carriedFrom, salesGoal.id);
  assert.deepEqual(carried.keyResults.map(k => [k.title, k.start, k.current, k.target]), [["Shops signed", 4, 4, 12], ["Returns", 5.5, 5.5, 2]]);
  const company = (await cycleObjectives(sql, cycle!.id, clockAt(), null)).find(o => o.level === "company")!;
  const companyCopy = (await objectiveById(sql, await carryOver(sql, admin, company.id, next.id), clockAt(), null))!;
  // The website was launched: only the customers carry over.
  assert.deepEqual(companyCopy.keyResults.map(k => k.title), ["Customers signed"]);
  await closeCycle(sql, admin, next.id);
  await assert.rejects(carryOver(sql, inesM, salesGoal.id, next.id), refused("closed"));
});

test("comments: everyone with a role writes; authors edit theirs; authors and admins delete, with undo", async () => {
  const { sql } = w.database;
  const [cycle] = (await cycles(sql)).filter(c => c.current);
  const company = (await cycleObjectives(sql, cycle!.id, clockAt(), null)).find(o => o.level === "company")!;
  await assert.rejects(addComment(sql, noraM, company.id, "Hello"), refused("forbidden"));
  await assert.rejects(addComment(sql, hugoM, company.id, "  "), refused("empty"));
  await assert.rejects(addComment(sql, hugoM, company.id, "x".repeat(2001)), refused("too_long"));
  const { comment, objective } = await addComment(sql, sofiaM, company.id, "Can the workshop help?");
  assert.equal(objective.owner, camille.id);
  assert.ok(objective.keyResultOwners.includes(ines.id));
  await assert.rejects(editComment(sql, hugoM, comment.id, "Mine"), refused("forbidden"));
  await editComment(sql, sofiaM, comment.id, "Can the workshop help with deliveries?");
  await assert.rejects(removeComment(sql, hugoM, comment.id), refused("forbidden"));
  await removeComment(sql, admin, comment.id);
  assert.ok(!(await comments(sql, company.id)).some(c => c.id === comment.id));
  await restoreComment(sql, sofiaM, comment.id);
  const list = await comments(sql, company.id);
  assert.deepEqual(list.map(c => [c.body, c.edited]).at(-1), ["Can the workshop help with deliveries?", true]);
});
