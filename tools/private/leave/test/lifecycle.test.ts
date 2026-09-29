import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import * as balances from "../lib/balances.ts";
import * as requests from "../lib/requests.ts";
import { types } from "../lib/rules.ts";
import { setApprover, setEndDate, staffRow } from "../lib/staff.ts";
import { AppError } from "../lib/app-error.ts";
import { today } from "../lib/model.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { addDays, holidaysBetween } from "../lib/calendar.ts";
import { quietMonday, week } from "./support/dates.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, hugo, ines, tom, lea, sofia } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
let paid: string;
before(async () => {
  database = await testDatabase();
  // These tests ask without setting balances first: paid leave may go
  // below zero here (its default refusal is tested in requests.test.ts).
  await database.sql`update leave_types set overdraw = true where key = 'paid'`;
  chest = await fakeChest({ members: everyone, groups: fakeGroups });
  paid = (await types(database.sql)).find(t => t.key === "paid")!.id;
});
after(async () => {
  await chest.close();
  await database.close();
});

test("someone who leaves: their waiting requests are cancelled, their approved leave before the last day stays, their people go back to HR", async () => {
  const { sql } = database;
  await setApprover(sql, asMember(camille), hugo.id, ines.id);
  const monday = quietMonday(20);
  // Taken a month ago: before the last day, it stays.
  const past = addDays(quietMonday(0), -28);
  const approved = await requests.createRequest(sql, asMember(camille), { typeId: paid, memberId: ines.id, ...week(past) });
  const waiting = await requests.createRequest(sql, asMember(ines), { typeId: paid, ...week(addDays(monday, 21)) });
  assert.equal(await chest.emit({ type: "member.removed", data: { id: ines.id } }, POST), 204);
  assert.equal((await requests.request(sql, asMember(camille), waiting.id)).status, "cancelled");
  assert.equal((await requests.request(sql, asMember(camille), approved.id)).status, "approved");
  assert.deepEqual((await requests.history(sql, asMember(camille), waiting.id)).map(s => [s.kind, s.actor]), [["asked", ines.id], ["left", "chest"]]);
  assert.equal((await staffRow(sql, hugo.id)).approverId, null);
  // Delivered again: nothing changes.
  assert.equal(await chest.emit({ type: "access.revoked", data: { id: ines.id } }, POST), 204);
});

test("approved leave after the last day no longer counts: cancelled, its days back, HR told (the final balance 14.75 → 15.25)", async () => {
  const { sql } = database;
  await balances.setOpening(sql, asMember(camille), { memberId: sofia.id, typeId: paid, days: "15,25", onDate: today() });
  const wednesday = addDays(quietMonday(8), 2);
  const half = await requests.createRequest(sql, asMember(camille), { typeId: paid, memberId: sofia.id, start: wednesday, startHalf: "pm", end: wednesday, endHalf: "pm" });
  assert.equal(half.status, "approved");
  const left = async () => (await balances.balancesOf(sql, [sofia.id])).get(sofia.id)!.find(b => b.typeId === paid)!.left;
  assert.equal(await left(), 14.75);
  chest.notifications.length = 0;
  assert.equal(await chest.emit({ type: "member.removed", data: { id: sofia.id } }, POST), 204);
  assert.equal((await staffRow(sql, sofia.id)).endDate, today());
  assert.equal((await requests.request(sql, asMember(camille), half.id)).status, "cancelled");
  assert.deepEqual((await requests.history(sql, asMember(camille), half.id)).map(s => [s.kind, s.actor]), [["recorded", camille.id], ["after_last_day", "chest"]]);
  assert.equal(await left(), 15.25);
  const back = (await balances.ledger(sql, asMember(camille), sofia.id)).find(l => l.kind === "returned");
  assert.deepEqual(back && { days: back.days, reasonKey: back.reasonKey, requestId: back.requestId }, { days: 0.5, reasonKey: "afterLastDay", requestId: half.id });
  // HR is told, in HR's language; nothing shows on the calendar any more.
  const told = chest.notifications.find(n => n.member === camille.id);
  assert.match(told?.title ?? "", /^Départ de Sofia Rossi( \(ancien membre\))?[\u202f ]: les congés après son dernier jour ne comptent plus$/u);
  assert.equal(told?.path, `/chest/people/${sofia.id}`);
  assert.ok(!(await requests.between(sql, asMember(camille), wednesday, wednesday)).some(e => e.id === half.id));
  // Delivered again: nothing is given back twice.
  assert.equal(await chest.emit({ type: "access.revoked", data: { id: sofia.id } }, POST), 204);
  assert.equal(await left(), 15.25);
});

test("a last day set by HR in the middle of a leave cuts it at that day; the rest comes back; clearing it later changes nothing", async () => {
  const { sql } = database;
  await balances.setOpening(sql, asMember(camille), { memberId: tom.id, typeId: paid, days: "20", onDate: today() });
  const monday = quietMonday(40);
  const r = await requests.createRequest(sql, asMember(camille), { typeId: paid, memberId: tom.id, ...week(monday) });
  const later = await requests.createRequest(sql, asMember(camille), { typeId: paid, memberId: tom.id, ...week(addDays(monday, 14)) });
  const left = async () => (await balances.balancesOf(sql, [tom.id])).get(tom.id)!.find(b => b.typeId === paid)!.left;
  assert.equal(await left(), 10);
  // Hugo may not set anyone's last day.
  await assert.rejects(setEndDate(sql, asMember(hugo), tom.id, addDays(monday, 2)), (e: unknown) => e instanceof AppError && e.code === "forbidden");
  const done = await setEndDate(sql, asMember(camille), tom.id, addDays(monday, 2));
  assert.deepEqual({ cancelled: done.cancelled, cut: done.cut, days: done.days }, { cancelled: [later.id], cut: [r.id], days: 7 });
  const cut = await requests.request(sql, asMember(camille), r.id);
  assert.deepEqual([cut.status, cut.end, cut.endHalf, cut.days], ["approved", addDays(monday, 2), "pm", 3]);
  assert.equal(await left(), 17);
  assert.deepEqual((await requests.history(sql, asMember(camille), r.id)).map(s => s.kind), ["recorded", "cut"]);
  // Set again to the same day: nothing more comes back.
  assert.equal((await setEndDate(sql, asMember(camille), tom.id, addDays(monday, 2))).days, 0);
  assert.equal(await left(), 17);
  await setEndDate(sql, asMember(camille), tom.id, null);
  assert.equal(await left(), 17);
});

test("an erasure: the person disappears, the days of HR's records stay, signed 'erased'; acknowledged once", async () => {
  const { sql } = database;
  await setApprover(sql, asMember(camille), tom.id, lea.id);
  // A week already taken (before the last day, so it stays).
  let monday = addDays(quietMonday(0), -35);
  while (holidaysBetween(monday, addDays(monday, 7), { alsace: true }).size > 0) monday = addDays(monday, -7);
  const r = await requests.createRequest(sql, asMember(tom), { typeId: paid, ...week(monday), note: "Wedding in Lyon" });
  await requests.decide(sql, asMember(lea), r.id, { verdict: "approve", reason: "Congratulations Tom" });
  await balances.adjust(sql, asMember(camille), { memberId: tom.id, typeId: paid, days: 2, reason: "Tom's seniority days" });
  const erasure = "era_" + "c".repeat(26);
  const event = { type: "member.erased" as const, id: "evt_" + "d".repeat(26), data: { id: tom.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  const [row] = await sql`select member_id, note, reason, days::float as days, status from requests where id = ${r.id}`;
  assert.deepEqual({ ...row }, { member_id: "erased", note: null, reason: null, days: 5, status: "approved" });
  const lines = await sql`select member_id, kind, days::float as days, reason from ledger where request_id = ${r.id} or reason is null and member_id = 'erased' order by id`;
  assert.ok(lines.length >= 2 && lines.every(l => l["member_id"] === "erased" && l["reason"] === null));
  assert.equal((await sql`select count(*)::int as n from ledger where member_id = ${tom.id} or created_by = ${tom.id}`)[0]!["n"], 0);
  assert.equal((await sql`select count(*)::int as n from request_events where actor = ${tom.id}`)[0]!["n"], 0);
  assert.equal((await sql`select count(*)::int as n from staff where member_id = ${tom.id}`)[0]!["n"], 0);
  assert.deepEqual(chest.acknowledged, [erasure]);
  // The erased person's leave no longer shows on the calendar.
  assert.ok(!(await requests.between(sql, asMember(camille), monday, addDays(monday, 5))).some(e => e.id === r.id));
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});
