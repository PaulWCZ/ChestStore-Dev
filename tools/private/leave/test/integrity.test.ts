import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { atLeast } from "@argentic/chest-app/testing";
import { AppError } from "../src/lib/app-error.ts";
import * as balances from "../src/lib/balances.ts";
import { compute, splitAt, type Kind } from "../src/lib/balances.ts";
import * as requests from "../src/lib/requests.ts";
import { saveType, settings, types, type LeaveType, type Settings } from "../src/lib/rules.ts";
import { zoned } from "../src/lib/spans.ts";
import { setApprover, setEndDate } from "../src/lib/staff.ts";
import { addDays } from "../src/shared/calendar.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { quietMonday, week } from "./support/dates.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, hugo, ines, lea, sofia, tom } from "./support/members.ts";

// What the review of the move found, each held by a test: an answer taken
// back never makes two requests of the same days; nothing is asked after a
// last day; a leave across a year's start is taken in each year; two
// requests at once never both pass "cannot go below zero"; the balances of
// a big company are computed in one pass; a midnight that does not exist
// moves on.
// (Two of them need a PostgreSQL server: on PGlite they are skipped.)
atLeast(7);

let database: TestDatabase;
let chest: FakeChest;
let kinds: LeaveType[];
const kind = (key: string) => kinds.find(t => t.key === key)!;
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, groups: fakeGroups });
  kinds = await types(database.sql);
  await setApprover(database.sql, asMember(camille), hugo.id, ines.id);
  await setApprover(database.sql, asMember(camille), tom.id, lea.id);
});
after(async () => {
  await chest.close();
  await database.close();
});

test("a refusal taken back waits again only if its days were not asked for meanwhile; an approval taken back drops the ask to cancel", async () => {
  const { sql } = database;
  const monday = quietMonday(30);
  const first = await requests.createRequest(sql, asMember(hugo), { typeId: kind("unpaid").id, ...week(monday) });
  await requests.decide(sql, asMember(ines), first.id, { verdict: "refuse" });
  const again = await requests.createRequest(sql, asMember(hugo), { typeId: kind("unpaid").id, ...week(monday) });
  await assert.rejects(requests.reopen(sql, asMember(ines), first.id), refused("overlap_someone"));
  assert.equal((await requests.request(sql, asMember(ines), first.id)).status, "refused", "still refused");
  assert.equal((await requests.request(sql, asMember(ines), again.id)).status, "pending");
  // An approved leave whose person asked to cancel it, taken back: waiting
  // again, with no ask left over.
  await requests.decide(sql, asMember(ines), again.id, { verdict: "approve" });
  await requests.cancel(sql, asMember(hugo), again.id);
  assert.equal((await requests.request(sql, asMember(ines), again.id)).cancelAsked, true);
  const back = await requests.reopen(sql, asMember(ines), again.id);
  assert.equal(back.status, "pending");
  assert.equal(back.cancelAsked, false);
});

test("nothing is asked, nor recorded by HR, after the person's last day: up to it, yes", async () => {
  const { sql } = database;
  const monday = quietMonday(45);
  await setEndDate(sql, asMember(camille), sofia.id, addDays(monday, 1));
  const span = week(monday);
  await assert.rejects(requests.createRequest(sql, asMember(sofia), { typeId: kind("unpaid").id, ...span }), refused("left_company"));
  await assert.rejects(requests.createRequest(sql, asMember(camille), { typeId: kind("unpaid").id, memberId: sofia.id, ...span }), refused("left_company"));
  const upTo = await requests.createRequest(sql, asMember(sofia), { typeId: kind("unpaid").id, ...span, end: addDays(monday, 1) });
  assert.equal(upTo.days, 2);
  await setEndDate(sql, asMember(camille), sofia.id, null);
});

const s: Settings = { counting: "ouvres", alsace: false, workedHolidays: [], periodStartMonth: 6, touched: true };
const rtt: Kind = { id: "2", perYear: 0, period: "yearly", periodMonth: 1, unused: "lose" };
const rttRules = { counting: "worked" as const, period: "yearly" as const, periodMonth: 1 };
const credit = (days: number, onDate: string) => ({ kind: "adjustment" as const, days, onDate });
const took = (days: number, onDate: string, requestId: string) => ({ kind: "taken" as const, days: -days, onDate, requestId });

test("RTT across New Year: each year pays its own days — 2026 its three, 2027 its one; 2026 loses what it did not pay", () => {
  const span = { start: "2026-12-29", startHalf: "am" as const, end: "2027-01-04", endHalf: "pm" as const };
  const parts = splitAt(span, rttRules, s, null, null)!;
  assert.deepEqual(parts, [{ on: "2026-12-29", days: 3 }, { on: "2027-01-01", days: 1 }], "1 January is a public holiday");
  const lines = [credit(5, "2026-01-01"), credit(5, "2027-01-01"), took(4, "2026-12-29", "r1")];
  const split = compute(rtt, lines, { startDate: null }, s, "2027-02-01", 0, { parts: new Map([["r1", parts]]) });
  assert.equal(split.left, 4);
  assert.deepEqual(split.closes, [{ on: "2027-01-01", days: 2, lost: true, typeId: "2" }]);
  // Without the split, the whole leave was 2026's: one day too many there,
  // one too few in 2027.
  const whole = compute(rtt, lines, { startDate: null }, s, "2027-02-01");
  assert.deepEqual([whole.left, whole.closes[0]?.days], [5, 1]);
});

test("paid leave across 1 June, and payroll's balance on a day inside a leave: the days after it are booked, not taken", () => {
  const paid: Kind = { id: "1", perYear: 0, period: "acquired", unused: "lose" };
  const span = { start: "2027-05-27", startHalf: "am" as const, end: "2027-06-02", endHalf: "pm" as const };
  const parts = splitAt(span, { counting: "company", period: "acquired", periodMonth: null }, s, null, null)!;
  assert.deepEqual(parts.map(p => p.on), ["2027-05-27", "2027-06-01"]);
  assert.equal(parts.reduce((a, p) => a + p.days, 0), 5);
  // Payroll's file at the end of 28 May: Thursday and Friday taken, the rest booked.
  const onDay = splitAt(span, { counting: "company", period: "acquired", periodMonth: null }, s, null, "2027-05-28")!;
  const lines = [{ kind: "opening" as const, days: 10, onDate: "2026-06-01" }, took(5, "2027-05-27", "r2")];
  const b = compute(paid, lines, { startDate: null }, s, "2027-05-28", 0, { takenBy: "2027-05-28", parts: new Map([["r2", onDay]]) });
  assert.equal(b.booked, 3);
  assert.equal(b.left, 8);
});

test("the balances of the database split a leave across New Year too", async () => {
  const { sql } = database;
  const r = kind("rtt");
  // The next New Year at least a week ahead: 29 December to 4 January.
  const now = new Date();
  const year = now.getUTCMonth() === 11 && now.getUTCDate() > 20 ? now.getUTCFullYear() + 2 : now.getUTCFullYear() + 1;
  const span = { start: `${year - 1}-12-29`, startHalf: "am" as const, end: `${year}-01-04`, endHalf: "pm" as const };
  const made = await requests.createRequest(sql, asMember(camille), { typeId: r.id, memberId: lea.id, ...span });
  const parts = splitAt(span, r, await settings(sql), null, null)!;
  assert.equal(parts.reduce((a, p) => a + p.days, 0), made.days);
  const b = (await balances.balancesOf(sql, [lea.id], `${year}-01-15`)).get(lea.id)!.find(x => x.typeId === r.id)!;
  assert.equal(b.years.current.start, `${year}-01-01`);
  assert.equal(b.years.current.used, parts.at(-1)!.days, "the new year pays only its own days");
});

test("a kind that may not go below zero: two requests sent at once are not both covered by the same days", { skip: process.env["TEST_DATABASE_URL"] ? false : "a PostgreSQL server: PGlite runs one query at a time" }, async () => {
  const { sql } = database;
  const r = kind("rtt");
  await saveType(sql, asMember(camille), r.id, { overdraw: false });
  await balances.adjust(sql, asMember(camille), { memberId: tom.id, typeId: r.id, days: "5", reason: "RTT" });
  const a = quietMonday(60), b = quietMonday(90);
  const results = await Promise.allSettled([a, b].map(m => requests.createRequest(sql, asMember(tom), { typeId: r.id, start: m, startHalf: "am", end: addDays(m, 3), endHalf: "pm" })));
  assert.deepEqual(results.map(x => x.status).sort(), ["fulfilled", "rejected"]);
  const no = results.find(x => x.status === "rejected") as PromiseRejectedResult;
  assert.ok(refused("not_enough")(no.reason));
  await saveType(sql, asMember(camille), r.id, { overdraw: true });
});

test("an answer taken back and a new request at once never leave two of the same days waiting", { skip: process.env["TEST_DATABASE_URL"] ? false : "a PostgreSQL server: PGlite runs one query at a time" }, async () => {
  const { sql } = database;
  const monday = quietMonday(120);
  const first = await requests.createRequest(sql, asMember(hugo), { typeId: kind("unpaid").id, ...week(monday) });
  await requests.decide(sql, asMember(ines), first.id, { verdict: "refuse" });
  await Promise.allSettled([requests.reopen(sql, asMember(ines), first.id), requests.createRequest(sql, asMember(hugo), { typeId: kind("unpaid").id, ...week(monday) })]);
  const rows = await sql<{ n: number }[]>`select count(*)::int as n from requests where member_id = ${hugo.id} and start_date = ${monday} and status in ('pending', 'approved')`;
  assert.equal(rows[0]!.n, 1);
});

test("2,000 people and 80,000 lines: the balances in one pass", async () => {
  const { sql } = database;
  const letters = (i: number) => [i % 26, Math.floor(i / 26) % 26, Math.floor(i / 676)].map(n => String.fromCharCode(97 + n)).join("");
  const ids = Array.from({ length: 2000 }, (_, i) => "mbr_" + "x".repeat(23) + letters(i));
  const paid = kind("paid");
  await sql`insert into ledger (member_id, type_id, kind, days, on_date, created_by)
    select (${sql.array(ids)}::text[])[1 + (g % 2000)], ${paid.id}, 'adjustment', 0.5, current_date - (g % 300), ${camille.id} from generate_series(0, 79999) g`;
  global.gc?.();
  const heap = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  const found = await balances.balancesOf(sql, ids);
  const ms = performance.now() - t0;
  const grown = (process.memoryUsage().heapUsed - heap) / 2 ** 20;
  assert.equal(found.size, 2000);
  assert.equal(found.get(ids[0]!)!.find(x => x.typeId === paid.id)!.left, 20);
  assert.ok(ms < 4000, `${Math.round(ms)} ms`);
  console.log(`balancesOf, 2,000 people, 80,000 lines: ${Math.round(ms)} ms, heap +${grown.toFixed(1)} MiB`);
  await sql`delete from ledger where member_id = any(${sql.array(ids)})`.catch(() => undefined);
});

test("a midnight the clocks skip moves on to the first hour that exists; one that comes twice is the first", () => {
  assert.equal(zoned("2026-09-06", 0, "America/Santiago").toISOString(), "2026-09-06T04:00:00.000Z", "01:00 in Santiago");
  assert.equal(zoned("2026-03-29", 2, "Europe/Paris").toISOString(), "2026-03-29T01:00:00.000Z", "03:00 in Paris");
  assert.equal(zoned("2026-10-25", 2, "Europe/Paris").toISOString(), "2026-10-25T00:00:00.000Z", "the first 02:00");
  assert.equal(zoned("2026-03-02", 12, "Europe/Paris").toISOString(), "2026-03-02T11:00:00.000Z");
});
