import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { chestEvents as POST } from "../src/calls.ts";
import { addDays } from "../src/shared/calendar.ts";
import { today } from "../src/lib/today.ts";
import * as requests from "../src/lib/requests.ts";
import { types } from "../src/lib/rules.ts";
import * as share from "../src/lib/share.ts";
import { setApprover, setEndDate } from "../src/lib/staff.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { quietMonday, week } from "./support/dates.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, hugo, ines, lea, sofia, tom } from "./support/members.ts";

// What Rooms and People hear of approved leave (leave.approved /
// leave.cancelled, events between tools): every way a leave stops standing
// or is shortened — an answer taken back, a last day set by HR, by People,
// or the Chest's own when someone leaves — is told, and only absences are.
let database: TestDatabase;
let chest: FakeChest;
let paid: string, remote: string;
before(async () => {
  database = await testDatabase();
  await database.sql`update leave_types set overdraw = true where key = 'paid'`;
  chest = await fakeChest({ network: {}, tool: "leave", members: everyone, groups: fakeGroups, emits: ["leave.approved", "leave.cancelled", "leave.busy"], receivers: 2 });
  const all = await types(database.sql);
  paid = all.find(t => t.key === "paid")!.id;
  remote = all.find(t => t.key === "remote")!.id;
  for (const p of [hugo, tom, sofia]) await setApprover(database.sql, asMember(camille), p.id, ines.id);
});
after(async () => {
  await chest.close();
  await database.close();
});

const told = (request: string) => chest.published.filter(e => (e.type === "leave.approved" || e.type === "leave.cancelled") && e.data["request"] === request);
const last = (request: string) => told(request).at(-1);

// An approved leave for someone, recorded by HR.
async function approvedLeave(who: string, span: { start: string; startHalf: string; end: string; endHalf: string }, typeId = paid): Promise<string> {
  const r = await requests.createRequest(database.sql, asMember(camille), { typeId, memberId: who, ...span } as requests.RequestInput);
  if (r.status !== "approved") await requests.decide(database.sql, asMember(camille), r.id, { verdict: "approve" });
  return r.id;
}

test("an approved absence is told once, as who and which days — never its kind nor its note", async () => {
  const monday = quietMonday(21);
  const id = await approvedLeave(hugo.id, week(monday));
  await share.keepInLine(database.sql);
  assert.equal(told(id).length, 1);
  assert.equal(last(id)!.type, "leave.approved");
  assert.deepEqual(last(id)!.data, { member: hugo.id, from: monday, to: addDays(monday, 4), fromHalf: "am", toHalf: "pm", request: id });
  await share.keepInLine(database.sql);
  assert.equal(told(id).length, 1, "nothing changed, nothing told again");
});

test("remote work is not an absence: never told as leave (Rooms would mark the person Off)", async () => {
  const monday = quietMonday(28);
  const id = await approvedLeave(tom.id, { start: monday, startHalf: "am", end: monday, endHalf: "pm" }, remote);
  const r = await requests.request(database.sql, asMember(camille), id);
  assert.equal(r.status, "approved");
  await share.keepInLine(database.sql);
  assert.equal(told(id).length, 0);
});

test("a last day HR sets cuts a leave: cancelled, then approved for the days that remain; a leave after it: cancelled", async () => {
  const monday = quietMonday(35);
  const across = await approvedLeave(sofia.id, week(monday));
  const afterIt = await approvedLeave(sofia.id, week(addDays(monday, 14)));
  await share.keepInLine(database.sql);
  const end = addDays(monday, 1);
  const done = await setEndDate(database.sql, asMember(camille), sofia.id, end);
  assert.deepEqual([done.cut, done.cancelled], [[across], [afterIt]]);
  await share.keepInLine(database.sql);
  assert.deepEqual(told(across).map(e => e.type), ["leave.approved", "leave.cancelled", "leave.approved"]);
  assert.deepEqual(last(across)!.data, { member: sofia.id, from: monday, to: end, fromHalf: "am", toHalf: "pm", request: across });
  assert.deepEqual(told(afterIt).map(e => e.type), ["leave.approved", "leave.cancelled"]);
  // The keys are distinct: a receiver keeps each word.
  assert.equal(new Set(told(across).map(e => e.key)).size, 3);
});

test("the Chest's own last day (a member removed) cancels what comes after — told to the other tools", async () => {
  const start = addDays(today(), 7);
  const id = await approvedLeave(tom.id, { start, startHalf: "am", end: addDays(start, 2), endHalf: "pm" });
  await share.keepInLine(database.sql);
  assert.equal(last(id)!.type, "leave.approved");
  assert.equal(await chest.emit({ type: "member.removed", data: { id: tom.id } }, POST), 204);
  assert.equal(last(id)!.type, "leave.cancelled");
  assert.deepEqual(last(id)!.data, { member: tom.id, from: start, to: addDays(start, 2), fromHalf: "am", toHalf: "pm", request: id });
});

test("a last day People sets (people.leaving) cuts and cancels — told to the other tools", async () => {
  const monday = quietMonday(56);
  const id = await approvedLeave(lea.id, week(monday));
  await share.keepInLine(database.sql);
  assert.equal(await chest.deliver({ type: "people.leaving", data: { member: lea.id, lastDay: addDays(monday, -3) } }, POST), 204);
  assert.equal(last(id)!.type, "leave.cancelled");
});

test("an approval taken back is told as cancelled; approved again, told again under a new key", async () => {
  const monday = quietMonday(63);
  const id = await approvedLeave(hugo.id, week(monday));
  await share.keepInLine(database.sql);
  await requests.reopen(database.sql, asMember(camille), id);
  await share.keepInLine(database.sql);
  assert.equal(last(id)!.type, "leave.cancelled");
  await requests.decide(database.sql, asMember(camille), id, { verdict: "approve" });
  await share.keepInLine(database.sql);
  assert.deepEqual(told(id).map(e => e.type), ["leave.approved", "leave.cancelled", "leave.approved"]);
  assert.equal(new Set(told(id).map(e => e.key)).size, 3);
});

test("leave told before this version (or remote work told as leave then) is put right once", async () => {
  const monday = quietMonday(70);
  const id = await approvedLeave(hugo.id, week(monday));
  const home = await approvedLeave(hugo.id, { start: addDays(monday, 7), startHalf: "am", end: addDays(monday, 7), endHalf: "pm" }, remote);
  await share.keepInLine(database.sql);
  // As migration 0006 leaves them: told, days unknown.
  await database.sql`update shared_leave set raw = 'unknown' where request_id = ${id}`;
  await database.sql`insert into shared_leave (request_id, member_id, raw) values (${home}, ${hugo.id}, 'unknown')`;
  await share.keepInLine(database.sql);
  assert.deepEqual(told(id).map(e => e.type), ["leave.approved", "leave.cancelled", "leave.approved"]);
  assert.deepEqual(told(home).map(e => e.type), ["leave.cancelled"]);
  await share.keepInLine(database.sql);
  assert.equal(told(id).length, 3);
});

test("a kind marked 'not away' afterwards: its approved leave is taken back from the other tools", async () => {
  const monday = quietMonday(84);
  const other = (await types(database.sql)).find(t => t.key === "other")!.id;
  const id = await approvedLeave(hugo.id, week(monday), other);
  await share.keepInLine(database.sql);
  assert.equal(last(id)!.type, "leave.approved");
  await database.sql`update leave_types set away = false where id = ${other}`;
  await share.keepInLine(database.sql);
  assert.equal(last(id)!.type, "leave.cancelled");
  await database.sql`update leave_types set away = true where id = ${other}`;
});

test("a Chest that cannot take the events yet: they wait in order, and go at the next run", async () => {
  const monday = quietMonday(112);
  await chest.close();
  chest = await fakeChest({ network: {}, tool: "leave", members: everyone, groups: fakeGroups });
  const id = await approvedLeave(hugo.id, week(monday));
  await share.keepInLine(database.sql);
  await requests.reopen(database.sql, asMember(camille), id);
  await share.keepInLine(database.sql);
  assert.equal(told(id).length, 0);
  assert.equal((await database.sql`select 1 from leave_outbox where published_at is null and data->>'request' = ${id}`).length, 2);
  await chest.close();
  chest = await fakeChest({ network: {}, tool: "leave", members: everyone, groups: fakeGroups, emits: ["leave.approved", "leave.cancelled", "leave.busy"], receivers: 2 });
  await share.keepInLine(database.sql);
  assert.deepEqual(told(id).map(e => e.type), ["leave.approved", "leave.cancelled"]);
  assert.equal((await database.sql`select 1 from leave_outbox where published_at is null`).length, 0);
  // Published a day ago: forgotten.
  await share.forgetOld(database.sql, new Date(Date.now() + 25 * 3_600_000));
  assert.equal((await database.sql`select 1 from leave_outbox where data->>'request' = ${id}`).length, 0);
});

test("erased: what was told of them and what waits is forgotten, nothing more is said of them", async () => {
  const monday = quietMonday(133);
  const id = await approvedLeave(hugo.id, week(monday));
  await share.keepInLine(database.sql);
  const before = chest.published.length;
  const event = { type: "member.erased" as const, id: "evt_" + "f".repeat(26), data: { id: hugo.id, erasure: "era_" + "f".repeat(26), deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(chest.published.slice(before).filter(e => JSON.stringify(e.data).includes(hugo.id) && e.type !== "leave.busy").length, 0);
  assert.equal((await database.sql`select 1 from shared_leave where member_id = ${hugo.id}`).length, 0);
  assert.equal((await database.sql`select 1 from leave_outbox where data->>'member' = ${hugo.id}`).length, 0);
  assert.equal(told(id).length, 1);
});

test("each word carries the time of its change; a shortened leave's approval is strictly later than its cancellation", async () => {
  const monday = quietMonday(140);
  const id = await approvedLeave(ines.id, week(monday));
  const t0 = Date.now();
  await share.keepInLine(database.sql);
  const approved = Date.parse(last(id)!.occurredAt);
  assert.ok(approved <= Date.now() && approved >= t0 - 60_000, "the time of the change, within the window");
  await setEndDate(database.sql, asMember(camille), ines.id, addDays(monday, 1));
  await share.keepInLine(database.sql);
  const [, cancelled, again] = told(id);
  assert.deepEqual([cancelled!.type, again!.type], ["leave.cancelled", "leave.approved"]);
  const outbox = await database.sql<{ type: string; at: Date }[]>`select type, at from leave_outbox where data->>'request' = ${id} order by id`;
  // What the Chest keeps is what the outbox says, to the millisecond.
  assert.deepEqual([cancelled!.occurredAt, again!.occurredAt], outbox.slice(1).map(o => o.at.toISOString()));
  assert.ok(Date.parse(again!.occurredAt) > Date.parse(cancelled!.occurredAt), "the approval after its cancellation");
  for (const e of [cancelled!, again!]) assert.ok(Date.parse(e.occurredAt) >= Date.now() - 24 * 3_600_000 && Date.parse(e.occurredAt) <= Date.now() + 60_000);
});

test("a word that waited: its time while the Chest takes it (under 23 hours), the Chest's own after", async () => {
  const monday = quietMonday(147);
  await chest.close();
  chest = await fakeChest({ network: {}, tool: "leave", members: everyone, groups: fakeGroups });
  const late = await approvedLeave(camille.id, week(addDays(monday, 7)));
  const old = await approvedLeave(camille.id, week(monday));
  await share.keepInLine(database.sql);
  const twentyMinutes = new Date(Date.now() - 20 * 60_000);
  await database.sql`update leave_outbox set at = ${twentyMinutes} where published_at is null and data->>'request' = ${late}`;
  await database.sql`update leave_outbox set at = now() - interval '25 hours' where published_at is null and data->>'request' = ${old}`;
  await chest.close();
  chest = await fakeChest({ network: {}, tool: "leave", members: everyone, groups: fakeGroups, emits: ["leave.approved", "leave.cancelled", "leave.busy"], receivers: 2 });
  const before = Date.now();
  await share.publish(database.sql);
  assert.equal(last(late)!.occurredAt, twentyMinutes.toISOString());
  assert.ok(Date.parse(last(old)!.occurredAt) >= before - 1000, "too old for the Chest: stamped when taken");
});

test("a request's words written together are judged together: never an old approval after a newly stamped cancellation", () => {
  const now = Date.parse("2026-09-30T12:00:00Z");
  const hours = (h: number) => new Date(now - h * 3_600_000);
  assert.deepEqual(share.occurredAtFor(hours(1), hours(1), now), hours(1));
  assert.equal(share.occurredAtFor(hours(23.5), hours(23.5), now), undefined);
  // The cancellation just past the window, its approval a millisecond later just inside: both without.
  const first = new Date(now - share.occurredWindowMs - 1);
  assert.equal(share.occurredAtFor(first, first, now), undefined);
  assert.equal(share.occurredAtFor(first, new Date(first.getTime() + 1), now), undefined);
  // A database clock far ahead: without, rather than refused for ever.
  assert.equal(share.occurredAtFor(new Date(now + 120_000), new Date(now + 120_000), now), undefined);
});
