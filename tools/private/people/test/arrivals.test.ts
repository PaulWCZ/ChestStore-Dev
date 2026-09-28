import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import * as members from "@argentic/chest-sdk/members";
import { fakeChest, type FakeChest, type FakeMember } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import * as arrivals from "../lib/arrivals.ts";
import { AppError } from "../lib/errors.ts";
import * as j from "../lib/journeys.ts";
import { addDays } from "../lib/model.ts";
import { profile } from "../lib/profiles.ts";
import { today } from "../lib/zone.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, id, ines, sofia } from "./support/members.ts";

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

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const hr = asMember(camille);
const hire = (data: Record<string, unknown>, source = "hiring") => chest.deliver({ type: "hiring.hired", source, data }, POST);
const cancel = (candidate: string) => chest.deliver({ type: "hiring.hire_cancelled", source: "hiring", data: { candidate } }, POST);
const lucie = { candidate: "cand_42", name: "Lucie Garnier", email: "lucie@example.com", job: "Sales associate", team: "Sales", place: "Lyon", startDate: "2026-11-02", hiredBy: ines.id };

async function template() {
  const t = await j.createTemplate(database.sql, hr, { kind: "onboarding", name: "Newcomer" });
  await j.addTemplateItem(database.sql, hr, t.id, { text: "Order the laptop", role: "hr", offset: -7 });
  await j.addTemplateItem(database.sql, hr, t.id, { text: "Lunch with the team", role: "manager", offset: 0 });
  await j.addTemplateItem(database.sql, hr, t.id, { text: "Fill in your profile", role: "person", offset: 1 });
  return t;
}

test("a hire told by Hiring becomes an arrival; HR is told in their language; the email is not kept", async () => {
  const { sql } = database;
  assert.equal(await hire(lucie), 204);
  const list = await arrivals.listArrivals(sql, hr);
  assert.deepEqual(list.map(a => [a.name, a.job, a.team, a.place, a.startDate, a.status, a.hiredBy]), [["Lucie Garnier", "Sales associate", "Sales", "Lyon", "2026-11-02", "expected", ines.id]]);
  const told = chest.notifications.filter(n => n.key === `arrival:${list[0]!.id}`);
  assert.deepEqual(told.map(n => [n.member, n.title]).sort(), [
    [camille.id, "Recrutement : Lucie Garnier arrive le 2 novembre comme Sales associate"],
    [sofia.id, "Hiring: Lucie Garnier joins on 2 November as Sales associate"],
  ]);
  const columns = (await sql`select column_name from information_schema.columns where table_name = 'arrivals'`).map(c => c["column_name"]);
  assert.ok(!columns.includes("email"), "no email column");
  // Told again (a new event, a new date): the same arrival, brought up to date.
  assert.equal(await hire({ ...lucie, startDate: "2026-11-09" }), 204);
  const again = await arrivals.listArrivals(sql, hr);
  assert.deepEqual(again.map(a => a.startDate), ["2026-11-09"]);
  await assert.rejects(arrivals.listArrivals(sql, asMember(hugo)), refused("forbidden"));
});

test("events of another shape, or from another tool, change nothing", async () => {
  const { sql } = database;
  const before = (await arrivals.listArrivals(sql, hr)).length;
  for (const bad of [
    { ...lucie, candidate: "c 1" },
    { ...lucie, candidate: "c2", name: "" },
    { ...lucie, candidate: "c3", startDate: "2026-02-30" },
    { ...lucie, candidate: "c4", hiredBy: "Camille" },
    { ...lucie, candidate: "c5", email: 42 },
    { ...lucie, candidate: "c6", job: 7 },
    { ...lucie, candidate: "c7", name: "x".repeat(121) },
  ]) assert.equal(await hire(bad), 204);
  // A "hiring." event that another tool would send is refused by the SDK.
  assert.equal(await hire({ ...lucie, candidate: "c8" }, "leave"), 401);
  assert.equal(await cancel("nobody"), 204);
  assert.equal((await arrivals.listArrivals(sql, hr)).length, before);
  assert.deepEqual(arrivals.readHired({ ...lucie, team: null, place: null, startDate: null, email: null }), { candidate: "cand_42", name: "Lucie Garnier", job: "Sales associate", team: "", place: "", startDate: null, hiredBy: ines.id });
});

test("HR starts the arrival checklist before access; linked, the profile and the checklist become the member's", async () => {
  const { sql } = database;
  const t = await template();
  const [a] = await arrivals.listArrivals(sql, hr);
  const started = await j.startJourney(sql, hr, { arrivalId: a!.id, managerId: ines.id, templateId: t.id, anchor: "2026-11-09" });
  const before = await j.journey(sql, hr, started.id);
  assert.equal(before.personId, null);
  assert.equal(before.arrivalName, "Lucie Garnier");
  assert.deepEqual(before.items.map(i => [i.text, i.assignee]), [["Order the laptop", camille.id], ["Lunch with the team", ines.id], ["Fill in your profile", null]]);
  // Her manager-to-be sees it; others do not.
  assert.equal((await j.journey(sql, asMember(ines), started.id)).id, started.id);
  await assert.rejects(j.journey(sql, asMember(hugo), started.id), refused("not_found"));
  await assert.rejects(j.startJourney(sql, hr, { arrivalId: "999999", templateId: t.id, anchor: "2026-11-09" }), refused("not_found"));
  // Lucie gets the tool; the page suggests her by name; HR links.
  const newcomer: FakeMember = { id: id("lucie"), firstName: "Lucie", lastName: "Garnier", name: "Lucie Garnier", photo: null, role: "member", isAdmin: false, isBuilder: false, groups: [], locale: "fr" };
  chest.members.push(newcomer);
  members.forget();
  const found = arrivals.suggestions(await arrivals.listArrivals(sql, hr), [{ id: newcomer.id, name: "lucie GARNIER" }, { id: hugo.id, name: "Hugo Bernard" }]);
  assert.deepEqual([...found.get(a!.id)!].map(p => p.id), [newcomer.id]);
  await assert.rejects(arrivals.linkArrival(sql, asMember(hugo), a!.id, newcomer.id), refused("forbidden"));
  await assert.rejects(arrivals.linkArrival(sql, hr, a!.id, "mbr_" + "q".repeat(26)), refused("not_member"));
  const linked = await arrivals.linkArrival(sql, hr, a!.id, newcomer.id);
  assert.deepEqual(linked.journeys, [started.id]);
  const p = await profile(sql, hr, newcomer.id);
  assert.deepEqual([p.title, p.team, p.office, p.startDate, p.managerId], ["Sales associate", "Sales", "Lyon", "2026-11-09", ines.id]);
  const after = await j.journey(sql, asMember(newcomer), started.id);
  assert.equal(after.personId, newcomer.id);
  assert.equal(after.items.at(-1)!.assignee, newcomer.id);
  // Nothing personal left of the arrival; told again, nothing changes.
  const [row] = await sql`select status, name, job, team, place, start_date, member_id from arrivals where id = ${a!.id}`;
  assert.deepEqual({ ...row }, { status: "linked", name: "", job: "", team: "", place: "", start_date: null, member_id: newcomer.id });
  assert.equal(await hire(lucie), 204);
  assert.equal((await arrivals.listArrivals(sql, hr)).length, 0);
  await assert.rejects(arrivals.linkArrival(sql, hr, a!.id, newcomer.id), refused("not_found"));
});

test("a hire cancelled: gone if nothing started; otherwise marked cancelled, its checklist stopped, HR told; HR removes it", async () => {
  const { sql } = database;
  await hire({ ...lucie, candidate: "cand_50", name: "Marc Petit" });
  assert.equal(await cancel("cand_50"), 204);
  assert.equal((await arrivals.listArrivals(sql, hr)).some(a => a.name === "Marc Petit"), false);
  await hire({ ...lucie, candidate: "cand_51", name: "Julie Roux" });
  const a = (await arrivals.listArrivals(sql, hr)).find(x => x.name === "Julie Roux")!;
  const t = await template();
  const started = await j.startJourney(sql, hr, { arrivalId: a.id, templateId: t.id, anchor: "2026-11-16" });
  assert.equal(await cancel("cand_51"), 204);
  const kept = (await arrivals.listArrivals(sql, hr)).find(x => x.id === a.id)!;
  assert.equal(kept.status, "cancelled");
  assert.equal((await j.journey(sql, hr, started.id)).stopped, true);
  const told = chest.notifications.filter(n => n.key === `arrival:${a.id}` && n.member === sofia.id);
  assert.deepEqual(told.map(n => [n.title, n.body]), [["Hiring: Julie Roux’s hire was cancelled", "The checklist started for them is stopped."]]);
  await assert.rejects(j.startJourney(sql, hr, { arrivalId: a.id, templateId: t.id, anchor: "2026-11-16" }), refused("not_found"));
  await assert.rejects(arrivals.removeArrival(sql, asMember(hugo), a.id), refused("forbidden"));
  const removed = await arrivals.removeArrival(sql, hr, a.id);
  assert.deepEqual(removed.journeys.map(x => x.id), [started.id]);
  await assert.rejects(j.journey(sql, hr, started.id), refused("not_found"));
});

test("never linked: an arrival and its checklists are deleted 90 days after the start date", async () => {
  const { sql } = database;
  const now = today();
  await hire({ ...lucie, candidate: "cand_60", name: "Old Hire", startDate: addDays(now, -91) });
  await hire({ ...lucie, candidate: "cand_61", name: "Recent Hire", startDate: addDays(now, -89) });
  assert.equal(await arrivals.purgeArrivals(sql, now), 1);
  const names = (await arrivals.listArrivals(sql, hr)).map(a => a.name);
  assert.ok(!names.includes("Old Hire") && names.includes("Recent Hire"));
});
