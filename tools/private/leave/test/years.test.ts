import assert from "node:assert/strict";
import { test } from "node:test";
import { compute, type Kind } from "../lib/balances.ts";
import { afterRequest, daysLeft, leftIfApproved } from "../lib/left.ts";

// Paid leave as French pay slips show it: earned during a reference period
// (1 June to 31 May) as "being earned" (CP N), taken from the next one as
// "acquired" (CP N-1); days taken come out of the oldest first; at the end
// of a period, the acquired days left over are carried over or lost; nothing
// is earned after a person's last day. All pure: the dates are fixed here.

const paid: Kind = { id: "1", perYear: 25, period: "acquired", unused: "carry" };
const lose: Kind = { ...paid, unused: "lose" };
const june = { periodStartMonth: 6 };
const since2025 = { startDate: "2025-06-01" };
const took = (days: number, onDate: string, requestId = "r" + onDate) => ({ kind: "taken" as const, days: -days, onDate, requestId });

test("a year worked is acquired on 1 June; what is earned since is being earned", () => {
  const b = compute(paid, [], since2025, june, "2026-09-28");
  assert.equal(b.months, 15);
  assert.equal(b.acquired, 25);
  assert.equal(b.earning, 6.25);
  assert.equal(b.left, 31.25);
  assert.equal(b.earnedThisPeriod, 6.25);
  assert.equal(b.deadline, null);
  assert.deepEqual(b.years.last, { start: "2025-06-01", credited: 25, used: 0, left: 25 });
  assert.deepEqual(b.years.current, { start: "2026-06-01", credited: 6.25, used: 0, left: 6.25 });
  // On 31 May the twelfth month is not complete yet; on 1 June it is, and
  // it moves: being earned becomes acquired.
  assert.deepEqual([compute(paid, [], since2025, june, "2026-05-31").earning, compute(paid, [], since2025, june, "2026-05-31").acquired], [22.92, 0]);
  assert.deepEqual([compute(paid, [], since2025, june, "2026-06-01").earning, compute(paid, [], since2025, june, "2026-06-01").acquired], [0, 25]);
});

test("days taken come out of the acquired days first, then out of those being earned (taken early)", () => {
  const b = compute(paid, [took(5, "2026-07-06")], since2025, june, "2026-09-28");
  assert.deepEqual([b.acquired, b.earning, b.left], [20, 6.25, 26.25]);
  const early = compute(paid, [took(27, "2026-07-06")], since2025, june, "2026-09-28");
  assert.deepEqual([early.acquired, early.earning, early.left], [0, 4.25, 4.25]);
  assert.deepEqual(early.years.current, { start: "2026-06-01", credited: 6.25, used: 2, left: 4.25 });
  // Leave given back (cancelled) no longer counts.
  const back = compute(paid, [took(5, "2026-07-06", "7"), { kind: "returned", days: 5, onDate: "2026-07-06", requestId: "7" }], since2025, june, "2026-09-28");
  assert.equal(back.left, 31.25);
  // Leave approved for next summer, in the next period: it takes this
  // period's days first (they will be acquired by then).
  const next = compute(paid, [took(10, "2027-07-05")], since2025, june, "2026-09-28");
  assert.deepEqual([next.acquired, next.earning], [15, 6.25]);
});

test("the end of a period: acquired days not taken are carried over, or lost when HR chose so", () => {
  const lines = [took(5, "2026-07-06")];
  const carried = compute(paid, lines, since2025, june, "2027-06-15");
  assert.deepEqual([carried.acquired, carried.carried, carried.earning, carried.left], [45, 20, 0, 45]);
  assert.deepEqual(carried.closes, [{ on: "2027-06-01", days: 20, lost: false, typeId: "1" }]);
  const lost = compute(lose, lines, since2025, june, "2027-06-15");
  assert.deepEqual([lost.acquired, lost.carried, lost.left], [25, 0, 25]);
  assert.deepEqual(lost.closes, [{ on: "2027-06-01", days: 20, lost: true, typeId: "1" }]);
  assert.equal(lost.deadline, "2028-05-31");
  // Before the end, the acquired days are to take before 31 May.
  assert.equal(compute(lose, lines, since2025, june, "2026-09-28").deadline, "2027-05-31");
  // Leave after the end cannot take lost days: it takes the new ones.
  const after = compute(lose, [took(5, "2026-07-06"), took(3, "2027-07-05")], since2025, june, "2027-06-15");
  assert.equal(after.acquired, 22);
});

test("nothing is earned after the last day; the balance on that day stays", () => {
  const b = compute(paid, [], { ...since2025, endDate: "2026-07-31" }, june, "2026-09-28");
  assert.equal(b.months, 14);
  assert.deepEqual([b.acquired, b.earning, b.until], [25, 4.17, "2026-07-31"]);
  assert.equal(compute(paid, [], { ...since2025, endDate: "2026-07-31" }, june, "2027-03-01").left, b.left);
});

test("an opening states both parts on a day (Lucca's CP N-1 and CP N); earning goes on from there", () => {
  const opening = [
    { kind: "opening" as const, days: 12, onDate: "2026-09-01", bucket: "acquired" as const, createdAt: "t1" },
    { kind: "opening" as const, days: 6.25, onDate: "2026-09-01", bucket: "earning" as const, createdAt: "t1" },
  ];
  const b = compute(paid, opening, { startDate: "2019-03-04" }, june, "2026-09-28");
  assert.deepEqual([b.acquired, b.earning, b.left, b.since, b.sinceOpening], [12, 6.25, 18.25, "2026-09-01", true]);
  assert.equal(compute(paid, opening, { startDate: "2019-03-04" }, june, "2026-10-05").earning, 8.33);
  // A later opening written on its own replaces both.
  const again = compute(paid, [...opening, { kind: "opening", days: 3, onDate: "2026-09-10", bucket: null, createdAt: "t2" }], { startDate: null }, june, "2026-09-28");
  assert.deepEqual([again.acquired, again.earning], [3, 0]);
  // The first behaviour, one running balance, is unchanged.
  const running = compute({ id: "2", perYear: 25 }, opening, { startDate: null }, june, "2026-10-05");
  assert.equal(running.left, 20.33);
});

test("RTT by calendar year: this year's days, lost on 1 January when HR chose so", () => {
  const rtt: Kind = { id: "3", perYear: 0, period: "yearly", periodMonth: 1, unused: "lose" };
  const lines = [{ kind: "adjustment" as const, days: 10, onDate: "2026-01-05" }, took(3, "2026-03-02")];
  const now = compute(rtt, lines, { startDate: null }, june, "2026-09-28");
  assert.deepEqual([now.left, now.acquired, now.earning, now.deadline], [7, 7, 0, "2026-12-31"]);
  const next = compute(rtt, lines, { startDate: null }, june, "2027-01-10");
  assert.deepEqual([next.left, next.closes], [0, [{ on: "2027-01-01", days: 7, lost: true, typeId: "3" }]]);
  assert.equal(compute(rtt, [...lines, { kind: "adjustment", days: 10, onDate: "2027-01-02" }], { startDate: null }, june, "2027-01-10").left, 10);
});

test("for payroll's file, leave after the day is booked apart, not taken", () => {
  const b = compute(paid, [took(5, "2026-12-01")], since2025, june, "2026-09-28", 0, { takenBy: "2026-09-28" });
  assert.deepEqual([b.booked, b.left, b.years.last!.used], [5, 31.25, 0]);
});

test("leave imported with balances that already counted it: nothing comes off, but cancelling it gives the days back", () => {
  const imported = [took(5, "2026-12-21", "8"), { kind: "adjustment" as const, days: 5, onDate: "2026-12-21", requestId: "8" }];
  assert.equal(compute(paid, imported, since2025, june, "2026-09-28").left, 31.25);
  assert.equal(compute(paid, [...imported, { kind: "returned", days: 5, onDate: "2026-12-21", requestId: "8" }], since2025, june, "2026-09-28").left, 36.25);
});

test("one 'left' everywhere; what the approver sees counts the person's earlier waiting requests", () => {
  const b = { left: 7.25, pending: 2 };
  assert.equal(daysLeft(b), 7.25);
  assert.equal(leftIfApproved(b), 5.25);
  const waiting = [{ id: "12", start: "2026-10-08", days: 2 }, { id: "15", start: "2026-11-09", days: 4 }];
  assert.deepEqual(afterRequest(7.25, waiting, { id: "12", start: "2026-10-08" }), { after: 5.25, before: 0, others: 1 });
  assert.deepEqual(afterRequest(7.25, waiting, { id: "15", start: "2026-11-09" }), { after: 1.25, before: 1, others: 0 });
});
