import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { balancesOf } from "../src/lib/balances.ts";
import { addDays } from "../src/shared/calendar.ts";
import { sync } from "../src/lib/leave-calendar.ts";
import * as requests from "../src/lib/requests.ts";
import { types } from "../src/lib/rules.ts";
import { keepInLine } from "../src/lib/share.ts";
import { zoned } from "../src/lib/spans.ts";
import { setApprover } from "../src/lib/staff.ts";
import { today } from "../src/lib/today.ts";
import { zonesOf } from "../src/lib/zones.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { quietMonday, week } from "./support/dates.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, hugo, ines, lea, nora, tom } from "./support/members.ts";

// A Chest far from UTC (Kiritimati, UTC+14: another day than UTC's from
// 10:00 to midnight UTC), whose database sessions are in its zone, as a
// Chest makes them — and Tom, who works from Montréal. The days of leave
// are the company's; the hours of a day off are the person's.
const zone = "Pacific/Kiritimati";
const montreal = "America/Montreal";
let database: TestDatabase;
let chest: FakeChest;
let paid: string, rtt: string;
before(async () => {
  database = await testDatabase({ timeZone: zone });
  chest = await fakeChest({ network: {},
    tool: "leave", chest: { timeZone: zone },
    members: everyone.map(m => (m.id === tom.id ? { ...m, timeZone: montreal } : m)), groups: fakeGroups,
    capabilities: ["members", "notifications", "calendar"], calendar: { domain: "atelier.test" },
    emits: ["leave.approved", "leave.cancelled", "leave.busy"], receivers: 1,
  });
  const all = await types(database.sql);
  paid = all.find(t => t.key === "paid")!.id;
  rtt = all.find(t => t.key === "rtt")!.id;
  await database.sql`update leave_types set overdraw = true where key = 'paid'`;
  await setApprover(database.sql, asMember(camille), hugo.id, ines.id);
  await setApprover(database.sql, asMember(camille), tom.id, lea.id);
});
after(async () => {
  await chest.close();
  await database.close();
});
const utc = (d: Date) => d.toISOString().slice(0, 16) + "Z";
const busyOf = (member: string) => chest.published.filter(e => e.type === "leave.busy" && e.data["member"] === member);

test("today is the Chest's day, and the database's current_date is the same day", async () => {
  const [row] = await database.sql<{ day: string }[]>`select current_date::text as day`;
  assert.equal(today(), row!.day);
  assert.equal(today(), new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date()));
});

test("a week off: the same days for everyone, busy from each person's own midnight", async () => {
  const { sql } = database;
  const monday = quietMonday(21);
  for (const [who, approver] of [[hugo, ines], [tom, lea]] as const) {
    const r = await requests.createRequest(sql, asMember(who), { typeId: paid, ...week(monday) });
    assert.equal(r.days, 5);
    await requests.decide(sql, asMember(approver), r.id, { verdict: "approve" });
  }
  await keepInLine(sql);
  // Hugo has no zone of his own: the Chest's. Tom's is Montréal's.
  assert.deepEqual(busyOf(hugo.id).at(-1)!.data["spans"], [[utc(zoned(monday, 0, zone)), utc(zoned(addDays(monday, 5), 0, zone))]]);
  assert.deepEqual(busyOf(tom.id).at(-1)!.data["spans"], [[utc(zoned(monday, 0, montreal)), utc(zoned(addDays(monday, 5), 0, montreal))]]);
  // Whole days in the feed are days, in no zone.
  const events = [...chest.calendar.values()].filter(e => e.members[0] === tom.id);
  assert.deepEqual(events.map(e => ("days" in e ? e.days : null)), [{ first: monday, last: addDays(monday, 4) }]);
});

test("a half day ends at the person's noon, and moves when they change zone", async () => {
  const { sql } = database;
  const day = addDays(quietMonday(35), 2);
  const r = await requests.createRequest(sql, asMember(tom), { typeId: paid, start: day, startHalf: "am", end: day, endHalf: "am" });
  assert.equal(r.days, 0.5);
  await requests.decide(sql, asMember(lea), r.id, { verdict: "approve" });
  await keepInLine(sql);
  const e = chest.calendar.get(`leave:${r.id}`)!;
  assert.ok("start" in e);
  assert.deepEqual([new Date(e.start).toISOString(), new Date(e.end).toISOString()], [zoned(day, 0, montreal).toISOString(), zoned(day, 12, montreal).toISOString()]);
  // Tom moves to Tokyo: his half day is put again at Tokyo's hours; his
  // week of whole days is not put again.
  const member = chest.members.find(m => m.id === tom.id)!;
  member.timeZone = "Asia/Tokyo";
  chest.clearCaches();
  try {
    assert.deepEqual(await sync(sql), { put: 1, removed: 0 });
    const moved = chest.calendar.get(`leave:${r.id}`)!;
    assert.ok("start" in moved);
    assert.equal(new Date(moved.end).toISOString(), zoned(day, 12, "Asia/Tokyo").toISOString());
  } finally {
    member.timeZone = montreal;
    chest.clearCaches();
  }
});

test("payroll's balances on a day end at the Chest's midnight, not UTC's", async () => {
  const { sql } = database;
  const day = today();
  // A line HR wrote a minute after the Chest's midnight today — still
  // "yesterday" in UTC (Kiritimati is 14 hours ahead).
  await sql`insert into ledger (member_id, type_id, kind, days, on_date, reason, created_by, created_at)
    values (${nora.id}, ${rtt}, 'adjustment', 3, ${day}, 'Given', ${camille.id}, ${new Date(zoned(day, 0, zone).getTime() + 60_000)})`;
  const left = async (on: string) => (await balancesOf(sql, [nora.id], on)).get(nora.id)!.find(b => b.typeId === rtt)!.left;
  assert.equal((await left(day)) - (await left(addDays(day, -1))), 3);
});

test("each person's zone is the Chest's answer for them; someone it does not answer for keeps the Chest's", async () => {
  const zoneOf = await zonesOf([tom.id, hugo.id, "mbr_" + "z".repeat(26)]);
  assert.equal(zoneOf(tom.id), montreal);
  assert.equal(zoneOf(hugo.id), zone);
  assert.equal(zoneOf("mbr_" + "z".repeat(26)), zone);
});
