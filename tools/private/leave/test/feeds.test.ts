import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import { busySnapshot } from "../lib/busy-snapshot.ts";
import { shareBusy } from "../lib/busy.ts";
import { addDays } from "../lib/calendar.ts";
import { putAll, state, sync, type Row } from "../lib/leave-calendar.ts";
import * as requests from "../lib/requests.ts";
import { types } from "../lib/rules.ts";
import { keepInLine } from "../lib/share.ts";
import { instants, zoned } from "../lib/spans.ts";
import { setApprover } from "../lib/staff.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { quietMonday, week } from "./support/dates.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, hugo, ines, lea, tom } from "./support/members.ts";

// Approved leave in each person's Chest calendar feed (the calendar
// proposal), and their busy times told to Booking (leave.busy).
let database: TestDatabase;
let chest: FakeChest;
let paid: string, sick: string;
const zone = "Europe/Paris";
before(async () => {
  database = await testDatabase();
  await database.sql`update leave_types set overdraw = true where key = 'paid'`;
  chest = await fakeChest({
    tool: "leave", members: everyone, groups: fakeGroups, timeZone: zone,
    capabilities: ["members", "notifications", "calendar"], calendar: { domain: "atelier.test", toolTitle: "Leave", company: "Atelier Martin" },
    emits: ["leave.approved", "leave.cancelled", "leave.busy"], receivers: 1,
  });
  const all = await types(database.sql);
  paid = all.find(t => t.key === "paid")!.id;
  sick = all.find(t => t.key === "sick")!.id;
  await setApprover(database.sql, asMember(camille), hugo.id, ines.id);
  await setApprover(database.sql, asMember(camille), tom.id, lea.id);
});
after(async () => {
  await chest.close();
  await database.close();
});

const busyOf = (member: string) => chest.published.filter(e => e.type === "leave.busy" && e.data["member"] === member);
const utc = (d: Date) => d.toISOString().slice(0, 16) + "Z";

test("a day in Paris as instants: midnight and noon, summer and winter, and across the change of the clocks", () => {
  assert.equal(zoned("2026-03-02", 12, zone).toISOString(), "2026-03-02T11:00:00.000Z");
  assert.equal(zoned("2026-07-01", 0, zone).toISOString(), "2026-06-30T22:00:00.000Z");
  // A leave on Saturday 28 March 2026 ends at midnight after it: the clocks
  // go forward on the 29th, at 02:00.
  assert.deepEqual(instants({ start: "2026-03-28", startHalf: "am", end: "2026-03-29", endHalf: "pm" }, zone), { start: new Date("2026-03-27T23:00:00.000Z"), end: new Date("2026-03-29T22:00:00.000Z") });
  assert.deepEqual(instants({ start: "2026-10-12", startHalf: "pm", end: "2026-10-12", endHalf: "pm" }, zone), { start: new Date("2026-10-12T10:00:00.000Z"), end: new Date("2026-10-12T22:00:00.000Z") });
});

test("approved, a week is in the person's feed as 'Off', private, whole days — never its kind nor its note; waiting, it is not", async () => {
  const { sql } = database;
  const monday = quietMonday(21);
  const r = await requests.createRequest(sql, asMember(hugo), { typeId: paid, ...week(monday), note: "Lisbon with the family" });
  await keepInLine(sql);
  assert.equal(chest.calendar.size, 0);
  assert.equal(busyOf(hugo.id).length, 0);
  await requests.decide(sql, asMember(ines), r.id, { verdict: "approve" });
  await keepInLine(sql);
  const e = chest.calendar.get(`leave:${r.id}`);
  assert.ok(e);
  assert.deepEqual([e.members, e.title, "days" in e ? e.days : null, e.private, e.busy, e.path], [[hugo.id], { en: "Off", fr: "Absent" }, { first: monday, last: addDays(monday, 4) }, true, true, `/chest/requests/${r.id}`]);
  assert.equal(await state(sql), "on");
  const feed = chest.feed(hugo.id);
  assert.match(feed, /SUMMARY:Off/u);
  assert.match(feed, /CLASS:PRIVATE/u);
  assert.doesNotMatch(feed, /Lisbon|Paid|payé/iu);
  // Only in his own feed.
  assert.doesNotMatch(chest.feed(ines.id), /SUMMARY:Off/u);
  assert.match(chest.feed(hugo.id, { locale: "fr" }), /SUMMARY:Absent/u);
});

test("his busy times go to Booking: whole days in Paris as UTC minutes, times only", async () => {
  const told = busyOf(hugo.id);
  assert.equal(told.length, 1);
  const [e] = told;
  const monday = quietMonday(21);
  assert.deepEqual(Object.keys(e!.data).sort(), ["at", "from", "member", "spans", "to", "v"]);
  assert.equal(e!.data["v"], 1);
  assert.deepEqual(e!.data["spans"], [[utc(zoned(monday, 0, zone)), utc(zoned(addDays(monday, 5), 0, zone))]]);
  const text = JSON.stringify(e!.data);
  assert.doesNotMatch(text, /Lisbon|paid|approved|ines/iu);
  // Said once: nothing changed, nothing told again.
  await keepInLine(database.sql);
  assert.equal(busyOf(hugo.id).length, 1);
  assert.equal(chest.calendar.size, 1);
});

test("a half day is noon to midnight in the calendar and in the busy times", async () => {
  const { sql } = database;
  const day = addDays(quietMonday(35), 2);
  const r = await requests.createRequest(sql, asMember(hugo), { typeId: paid, start: day, startHalf: "pm", end: day, endHalf: "pm" });
  await requests.decide(sql, asMember(ines), r.id, { verdict: "approve" });
  await keepInLine(sql);
  const e = chest.calendar.get(`leave:${r.id}`)!;
  assert.ok("start" in e);
  assert.deepEqual([new Date(e.start).toISOString(), new Date(e.end).toISOString()], [zoned(day, 12, zone).toISOString(), zoned(addDays(day, 1), 0, zone).toISOString()]);
  const spans = busyOf(hugo.id).at(-1)!.data["spans"] as string[][];
  assert.equal(spans.length, 2);
  assert.deepEqual(spans[1], [utc(zoned(day, 12, zone)), utc(zoned(addDays(day, 1), 0, zone))]);
});

test("an approval taken back, a refusal, a cancellation: the event goes, the busy times follow; told free once", async () => {
  const { sql } = database;
  const [week1, half] = (await requests.mine(sql, asMember(hugo))).filter(r => r.status === "approved").sort((a, b) => a.start.localeCompare(b.start));
  await requests.reopen(sql, asMember(ines), week1!.id);
  await keepInLine(sql);
  assert.equal(chest.calendar.has(`leave:${week1!.id}`), false);
  assert.equal((busyOf(hugo.id).at(-1)!.data["spans"] as unknown[]).length, 1);
  await requests.decide(sql, asMember(ines), week1!.id, { verdict: "refuse", reason: "Stock-taking" });
  // Hugo cancels the half day; Inès confirms.
  assert.equal(await requests.cancel(sql, asMember(hugo), half!.id), "asked");
  await requests.settleCancel(sql, asMember(ines), half!.id, { accept: true });
  await keepInLine(sql);
  assert.equal(chest.calendar.size, 0);
  const told = busyOf(hugo.id).length;
  assert.deepEqual(busyOf(hugo.id).at(-1)!.data["spans"], []);
  await keepInLine(sql);
  assert.equal(busyOf(hugo.id).length, told, "free is said once");
});

test("sick leave, recorded at once, is 'Off' too — the feed never says sick", async () => {
  const { sql } = database;
  const monday = quietMonday(49);
  const r = await requests.createRequest(sql, asMember(tom), { typeId: sick, start: monday, startHalf: "am", end: addDays(monday, 1), endHalf: "pm" });
  assert.equal(r.status, "approved");
  await keepInLine(sql);
  assert.match(chest.feed(tom.id), /SUMMARY:Off/u);
  assert.doesNotMatch(chest.feed(tom.id), /sick|malad/iu);
  assert.equal(busyOf(tom.id).length, 1);
});

test("a first sync puts many at once (100 a call), and only what changed after", async () => {
  const { sql } = database;
  const start = quietMonday(70);
  const rows = Array.from({ length: 150 }, (_, i) => addDays(start, i * 2));
  await sql`insert into requests (member_id, type_id, start_date, start_half, end_date, end_half, days, status, decided_by, decided_at)
    select ${lea.id}, ${paid}, d::date, 'am', d::date, 'pm', 1, 'approved', ${camille.id}, now() from unnest(${rows}::text[]) as d`;
  const done = await sync(sql);
  assert.equal(done.put, 150);
  assert.equal([...chest.calendar.values()].filter(e => e.members[0] === lea.id).length, 150);
  assert.deepEqual(await sync(sql), { put: 0, removed: 0 });
  // Busy: only the 90 days ahead, merged, times only.
  await shareBusy(sql);
  const snapshot = busyOf(lea.id).at(-1)!.data;
  assert.deepEqual(snapshot, { ...busySnapshot(lea.id, rows.map(d => ({ start: zoned(d, 0, zone).getTime(), end: zoned(addDays(d, 1), 0, zone).getTime() })), Date.parse(String(snapshot["at"]))) });
});

test("one event the Chest refuses in a batch: the others are put and recorded, the refused one never recorded as put", async () => {
  const { sql } = database;
  const monday = quietMonday(91);
  const row = (id: string, start: string, end: string): Row => ({ id, member_id: hugo.id, start, start_half: "am", end, end_half: "pm" });
  // A leave that ends before it starts: the SDK refuses it (invalid_event).
  const rows = [row("900001", monday, monday), row("900002", addDays(monday, 3), addDays(monday, 1)), row("900003", addDays(monday, 7), addDays(monday, 8))];
  assert.equal(await putAll(sql, rows, zone), 2);
  assert.ok(chest.calendar.has("leave:900001"));
  assert.ok(chest.calendar.has("leave:900003"));
  assert.equal(chest.calendar.has("leave:900002"), false);
  const recorded = (await sql<{ key: string }[]>`select key from calendar_events where key like 'leave:90000%' order by key`).map(r => r.key);
  assert.deepEqual(recorded, ["leave:900001", "leave:900003"]);
  await sql`delete from calendar_events where key like 'leave:90000%'`;
  for (const key of ["leave:900001", "leave:900003"]) chest.calendar.delete(key);
});

test("remote work is not an absence: neither 'Off' in the feed nor busy for Booking", async () => {
  const { sql } = database;
  const remote = (await types(sql)).find(t => t.key === "remote")!.id;
  const monday = quietMonday(77);
  const r = await requests.createRequest(sql, asMember(tom), { typeId: remote, start: monday, startHalf: "am", end: monday, endHalf: "pm" });
  assert.equal(r.status, "approved");
  const before = busyOf(tom.id).length;
  await keepInLine(sql);
  assert.equal(chest.calendar.has(`leave:${r.id}`), false);
  assert.equal(busyOf(tom.id).length, before);
});

test("erased: the events go, and what was told of them is forgotten", async () => {
  const { sql } = database;
  const event = { type: "member.erased" as const, id: "evt_" + "e".repeat(26), data: { id: lea.id, erasure: "era_" + "e".repeat(26), deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal([...chest.calendar.values()].filter(e => e.members[0] === lea.id).length, 0);
  assert.equal((await sql`select 1 from shared_busy where member_id = ${lea.id}`).length, 0);
});

test("a Chest without the calendar: nothing fails, the home stops promising it, asked again in the morning", async () => {
  const { sql } = database;
  await chest.close();
  chest = await fakeChest({ tool: "leave", members: everyone, groups: fakeGroups, timeZone: zone, calendar: false });
  const monday = quietMonday(63);
  const r = await requests.createRequest(sql, asMember(tom), { typeId: sick, start: monday, startHalf: "am", end: monday, endHalf: "pm" });
  await keepInLine(sql);
  assert.equal(await state(sql), "off");
  assert.deepEqual(await sync(sql), { put: 0, removed: 0 }, "not asked again within the hour");
  await chest.close();
  chest = await fakeChest({ tool: "leave", members: everyone, groups: fakeGroups, timeZone: zone, capabilities: ["members", "notifications", "calendar"], calendar: { domain: "atelier.test" } });
  await sync(sql, { recheck: true });
  assert.equal(await state(sql), "on");
  assert.ok(chest.calendar.has(`leave:${r.id}`));
});
