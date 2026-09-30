import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import { wholeDays } from "../lib/away.ts";
import * as desks from "../lib/desk-bookings.ts";
import { presenceOf, setPresence } from "../lib/presence.ts";
import { erase } from "../lib/lifecycle.ts";
import { purge } from "../lib/settings.ts";
import { addDays, today } from "../lib/model.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines } from "./support/members.ts";
import { office, workday, zone } from "./support/places.ts";

let database: TestDatabase;
let chest: FakeChest;
let o: Awaited<ReturnType<typeof office>>;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  o = await office(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

const told = (type: "leave.approved" | "leave.cancelled", data: Record<string, unknown>, occurredAt?: Date) =>
  chest.deliver({ type, source: "leave", data, ...(occurredAt ? { occurredAt: occurredAt.toISOString() } : {}) }, POST);

test("half days are left alone: a leave from the afternoon, or to noon, marks only its whole days", () => {
  assert.deepEqual(wholeDays({ from: "2026-10-05", to: "2026-10-07", fromHalf: "pm", toHalf: "am" }, "2026-10-01"), ["2026-10-06"]);
  assert.deepEqual(wholeDays({ from: "2026-10-05", to: "2026-10-05", fromHalf: "day", toHalf: "day" }, "2026-10-01"), ["2026-10-05"]);
  // Nothing before today.
  assert.deepEqual(wholeDays({ from: "2026-09-28", to: "2026-10-02", fromHalf: "day", toHalf: "day" }, "2026-10-01"), ["2026-10-01", "2026-10-02"]);
});

test("a leave approved in Leave: those days read Off, the desk is freed; cancelled, the days come back — not what the person set since", async () => {
  const { sql } = database;
  const a = workday(2), b = workday(3);
  await setPresence(sql, asMember(hugo), { day: a, status: "office" }, zone);
  const desk = await desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[0], day: a }, zone);
  assert.equal(await told("leave.approved", { member: hugo.id, from: a, to: b, fromHalf: "day", toHalf: "day", request: "42" }), 204);
  const seen = (await presenceOf(sql, [hugo.id], a, b)).get(hugo.id)!;
  assert.equal(seen.get(a)?.status, "off");
  assert.equal(seen.get(b)?.status, "off");
  const [kept] = await sql`select cancelled_at from desk_bookings where id = ${desk.id}`;
  assert.ok(kept!["cancelled_at"], "desk freed");
  // Hugo says he comes on the second day after all: that stays his.
  await setPresence(sql, asMember(hugo), { day: b, status: "office" }, zone);
  assert.equal(await told("leave.cancelled", { member: hugo.id, from: a, to: b, request: "42" }), 204);
  const after = (await presenceOf(sql, [hugo.id], a, b)).get(hugo.id);
  assert.equal(after?.get(a), undefined);
  assert.equal(after?.get(b)?.status, "office");
});

test("an event of another shape is accepted and changes nothing", async () => {
  assert.equal(await told("leave.approved", { member: "someone", from: "x", to: "y", request: "1" }), 204);
});

// Leave shortens a leave as leave.cancelled then leave.approved for the
// days that remain — the same request, the same moment (its README, "With
// the other tools"). Events come at least once, not always in order: Rooms
// keeps each request's latest word by occurredAt, and at the same moment an
// approval wins, so the remaining days stay whichever arrives last.
// Days in a row from today (a leave covers weekends too).
const inDays = (n: number) => addDays(today(zone), n);
const offDays = async (member: string, from: string, to: string) => {
  const seen = (await presenceOf(database.sql, [member], from, to)).get(member);
  return [...(seen?.entries() ?? [])].filter(([, p]) => p.status === "off").map(([d]) => d).sort();
};

test("a leave shortened, told in order: cancelled then approved for the days that remain — those stay Off, the others open again", async () => {
  const a = inDays(5), b = inDays(6), c = inDays(7), d = inDays(8);
  const t0 = new Date(Date.now() - 60 * 60_000), t1 = new Date(Date.now() - 30 * 60_000);
  const whole = { member: ines.id, from: a, to: d, fromHalf: "day", toHalf: "day", request: "cut-1" };
  await told("leave.approved", whole, t0);
  assert.deepEqual(await offDays(ines.id, a, d), [a, b, c, d]);
  await told("leave.cancelled", whole, t1);
  await told("leave.approved", { ...whole, to: b }, t1);
  assert.deepEqual(await offDays(ines.id, a, d), [a, b]);
});

test("a leave shortened, told in reverse: the approval of the remaining days first, then the cancellation of the same moment — the remaining days stay Off", async () => {
  const a = inDays(5), b = inDays(6), c = inDays(7), d = inDays(8);
  const t0 = new Date(Date.now() - 60 * 60_000), t1 = new Date(Date.now() - 30 * 60_000);
  const whole = { member: hugo.id, from: a, to: d, fromHalf: "day", toHalf: "day", request: "cut-2" };
  await told("leave.approved", whole, t0);
  assert.deepEqual(await offDays(hugo.id, a, d), [a, b, c, d]);
  // The remaining days' approval arrives first: the days cut open again.
  await told("leave.approved", { ...whole, to: b }, t1);
  assert.deepEqual(await offDays(hugo.id, a, d), [a, b]);
  // The cancellation of the same moment, delivered last, is the older word.
  await told("leave.cancelled", whole, t1);
  assert.deepEqual(await offDays(hugo.id, a, d), [a, b], "the remaining days are not dropped");
  // A cancellation that really comes later takes them back.
  await told("leave.cancelled", whole, new Date(Date.now() - 10 * 60_000));
  assert.deepEqual(await offDays(hugo.id, a, d), []);
});

test("an older word delivered late changes nothing: an approval after its cancellation, a repeat of the first approval", async () => {
  const a = inDays(10), b = inDays(11);
  const t0 = new Date(Date.now() - 60 * 60_000), t1 = new Date(Date.now() - 30 * 60_000), t2 = new Date(Date.now() - 5 * 60_000);
  const leave = { member: ines.id, from: a, to: b, fromHalf: "day", toHalf: "day", request: "late-1" };
  await told("leave.cancelled", leave, t1);
  await told("leave.approved", leave, t0);
  assert.deepEqual(await offDays(ines.id, a, b), [], "the approval came before the cancellation");
  // Approved again later (in Leave, after the cancellation): it stands.
  await told("leave.approved", leave, t2);
  assert.deepEqual(await offDays(ines.id, a, b), [a, b]);
  // The first approval delivered once more, with more days: older, ignored.
  await told("leave.approved", { ...leave, to: inDays(12) }, t0);
  assert.deepEqual(await offDays(ines.id, a, inDays(12)), [a, b]);
  // Another person's word for the same request never takes these days.
  await told("leave.cancelled", { ...leave, member: hugo.id }, new Date());
  assert.deepEqual(await offDays(ines.id, a, b), [a, b]);
});

test("Leave's words are forgotten once they cannot matter: a cancellation after a week, an approval once past", async () => {
  const { sql } = database;
  await sql`insert into leave_words (request, member_id, told_at, cancelled, to_day) values
    ('old-cancel', ${ines.id}, now() - interval '8 days', true, null),
    ('old-past', ${ines.id}, now() - interval '8 days', false, current_date - 2),
    ('old-coming', ${ines.id}, now() - interval '8 days', false, current_date + 30),
    ('new-cancel', ${ines.id}, now() - interval '1 day', true, null)`;
  await purge(sql, zone);
  const left = (await sql<{ request: string }[]>`select request from leave_words where request in ('old-cancel', 'old-past', 'old-coming', 'new-cancel') order by request`).map(r => r.request);
  assert.deepEqual(left, ["new-cancel", "old-coming"]);
});

test("an erasure forgets what Leave said of the person", async () => {
  const { sql } = database;
  const leave = { member: ines.id, from: inDays(20), to: inDays(21), fromHalf: "day", toHalf: "day", request: "erase-1" };
  await told("leave.approved", leave);
  assert.equal((await sql`select 1 from leave_words where member_id = ${ines.id}`).length > 0, true);
  await erase(sql, ines.id, zone);
  assert.equal((await sql`select 1 from leave_words where member_id = ${ines.id}`).length, 0);
});
