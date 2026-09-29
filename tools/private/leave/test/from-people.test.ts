import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import { addDays } from "../lib/calendar.ts";
import { readLeaving, readRecord } from "../lib/from-people.ts";
import * as requests from "../lib/requests.ts";
import { types } from "../lib/rules.ts";
import { setEmployeeNumber, setEndDate, setWorkDays, staffRow } from "../lib/staff.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { quietMonday, week } from "./support/dates.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, hugo, lea, sofia, tom } from "./support/members.ts";

// People → Leave (events between tools): HR writes a person's employee
// number, first day, last day and working week once, in People's HR
// record, and Leave takes them.
let database: TestDatabase;
let chest: FakeChest;
let paid: string;
before(async () => {
  process.env["CHEST_TOOL"] = "leave";
  database = await testDatabase();
  await database.sql`update leave_types set overdraw = true where key = 'paid'`;
  chest = await fakeChest({ members: everyone, groups: fakeGroups });
  paid = (await types(database.sql)).find(t => t.key === "paid")!.id;
});
after(async () => {
  await chest.close();
  await database.close();
});

const record = (data: Record<string, unknown>, occurredAt?: string) => chest.deliver({ type: "people.record", data, ...(occurredAt ? { occurredAt } : {}) }, POST);
const leaving = (data: Record<string, unknown>, occurredAt?: string) => chest.deliver({ type: "people.leaving", data, ...(occurredAt ? { occurredAt } : {}) }, POST);
const stays = (member: string, occurredAt?: string) => chest.deliver({ type: "people.leaving_cancelled", data: { member }, ...(occurredAt ? { occurredAt } : {}) }, POST);
const full = (member: string, more: Record<string, unknown> = {}) => ({ member, employeeNumber: null, startDate: null, lastDay: null, workDays: null, weeklyHours: null, ...more });

test("People's events are read field by field; another shape changes nothing", () => {
  const ok = readRecord(full(tom.id, { employeeNumber: " 0019 ", startDate: "2024-03-04", workDays: [4, 1, 2, 3], weeklyHours: 28 }));
  assert.deepEqual(ok, { member: tom.id, employeeNumber: "0019", startDate: "2024-03-04", lastDay: null, workDays: [1, 2, 3, 4] });
  // Sunday (ISO 7) is Leave's 0.
  assert.deepEqual(readRecord(full(tom.id, { workDays: [6, 7] }))?.workDays, [0, 6]);
  for (const bad of [
    null, [], full("mbr_x"), full(tom.id, { startDate: "2024-02-30" }), full(tom.id, { lastDay: "2020-01-01", startDate: "2024-01-01" }),
    full(tom.id, { workDays: [0] }), full(tom.id, { workDays: [1, 1] }), full(tom.id, { workDays: [] }), full(tom.id, { employeeNumber: "x".repeat(31) }),
    full(tom.id, { weeklyHours: 90 }), full(tom.id, { employeeNumber: 17 }),
  ]) assert.equal(readRecord(bad), null, JSON.stringify(bad));
  assert.deepEqual(readLeaving({ member: tom.id, lastDay: "2026-12-31" }), { member: tom.id, lastDay: "2026-12-31" });
  assert.equal(readLeaving({ member: tom.id, lastDay: "soon" }), null);
});

test("a record told by People fills the number, first day and week HR would type twice; what People does not say stays; an older event changes nothing", async () => {
  const { sql } = database;
  await setWorkDays(sql, asMember(camille), lea.id, [1, 2, 3]);
  assert.equal(await record(full(tom.id, { employeeNumber: "0019", startDate: "2024-03-04", workDays: [1, 2, 3, 4], weeklyHours: 28 }), "2026-09-29T10:00:00Z"), 204);
  const t = await staffRow(sql, tom.id);
  assert.deepEqual([t.employeeNumber, t.startDate, t.workDays, t.endDate, t.fromPeople], ["0019", "2024-03-04", [1, 2, 3, 4], null, true]);
  // A full week is Leave's default (null).
  await record(full(tom.id, { workDays: [1, 2, 3, 4, 5] }), "2026-09-29T10:01:00Z");
  assert.equal((await staffRow(sql, tom.id)).workDays, null);
  // Not said: kept as HR set it here.
  await record(full(lea.id), "2026-09-29T10:02:00Z");
  assert.deepEqual((await staffRow(sql, lea.id)).workDays, [1, 2, 3]);
  // Delivered late: an event older than the last one applied changes nothing.
  await record(full(tom.id, { startDate: "2020-01-01" }), "2026-09-29T09:00:00Z");
  assert.equal((await staffRow(sql, tom.id)).startDate, "2024-03-04");
  // A number already someone else's here is left (HR sees both).
  await setEmployeeNumber(sql, asMember(camille), sofia.id, "0021");
  await record(full(tom.id, { employeeNumber: "0021" }), "2026-09-29T10:03:00Z");
  assert.equal((await staffRow(sql, tom.id)).employeeNumber, "0019");
  // Another shape: accepted (the Chest stops retrying) and ignored.
  assert.equal(await record({ member: tom.id, startDate: 12 }, "2026-09-29T10:04:00Z"), 204);
  assert.equal((await staffRow(sql, tom.id)).startDate, "2024-03-04");
});

test("a last day from the record settles leave after it and tells HR; cleared in People, it goes — but never one HR typed here", async () => {
  const { sql } = database;
  const monday = quietMonday(30);
  const r = await requests.createRequest(sql, asMember(camille), { typeId: paid, memberId: hugo.id, ...week(monday) });
  chest.notifications.length = 0;
  const last = addDays(monday, -3);
  await record(full(hugo.id, { lastDay: last }), "2026-09-29T11:00:00Z");
  const h = await staffRow(sql, hugo.id);
  assert.deepEqual([h.endDate, h.endBy], [last, "record"]);
  assert.equal((await requests.request(sql, asMember(camille), r.id)).status, "cancelled");
  const told = chest.notifications.filter(n => n.member === camille.id && n.key === `last:${hugo.id}`);
  assert.equal(told.length, 1);
  assert.match(told[0]!.title, /^Hugo Bernard part le /u);
  // Cleared in People: the last day goes (the cancelled leave stays so).
  await record(full(hugo.id), "2026-09-29T11:01:00Z");
  assert.deepEqual([(await staffRow(sql, hugo.id)).endDate, (await staffRow(sql, hugo.id)).endBy], [null, null]);
  // One HR typed here is never cleared by People.
  await setEndDate(sql, asMember(camille), sofia.id, "2027-01-29");
  await record(full(sofia.id), "2026-09-29T11:02:00Z");
  assert.deepEqual([(await staffRow(sql, sofia.id)).endDate, (await staffRow(sql, sofia.id)).endBy], ["2027-01-29", "hr"]);
  // The record's (legal) last day wins over it.
  await record(full(sofia.id, { lastDay: "2027-01-31" }), "2026-09-29T11:03:00Z");
  assert.deepEqual([(await staffRow(sql, sofia.id)).endDate, (await staffRow(sql, sofia.id)).endBy], ["2027-01-31", "record"]);
});

test("a leaving checklist in People sets the last day unless one is set another way; stopped, it goes", async () => {
  const { sql } = database;
  await leaving({ member: lea.id, lastDay: "2027-02-26" }, "2026-09-29T12:00:00Z");
  assert.deepEqual([(await staffRow(sql, lea.id)).endDate, (await staffRow(sql, lea.id)).endBy], ["2027-02-26", "leaving"]);
  // Moved: the latest day told.
  await leaving({ member: lea.id, lastDay: "2027-03-05" }, "2026-09-29T12:01:00Z");
  assert.equal((await staffRow(sql, lea.id)).endDate, "2027-03-05");
  // An older "stays" delivered late changes nothing; the newer one clears it.
  await stays(lea.id, "2026-09-29T11:59:00Z");
  assert.equal((await staffRow(sql, lea.id)).endDate, "2027-03-05");
  await stays(lea.id, "2026-09-29T12:02:00Z");
  assert.deepEqual([(await staffRow(sql, lea.id)).endDate, (await staffRow(sql, lea.id)).endBy], [null, null]);
  // Never over the record's own last day, nor one HR typed here.
  await leaving({ member: sofia.id, lastDay: "2026-12-15" }, "2026-09-29T12:03:00Z");
  assert.equal((await staffRow(sql, sofia.id)).endDate, "2027-01-31");
  await stays(sofia.id, "2026-09-29T12:04:00Z");
  assert.equal((await staffRow(sql, sofia.id)).endDate, "2027-01-31");
});
