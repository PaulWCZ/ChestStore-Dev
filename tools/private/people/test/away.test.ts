import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { onEvent as POST } from "../src/lib/deliveries.ts";
import { awayOf, awayText, awayToday, purgeAway, readLeave, type Span } from "../src/lib/away.ts";
import { catalogue, format, formatDay } from "../src/i18n/index.ts";
import { addDays } from "../src/shared/model.ts";
import { today } from "../src/lib/zone.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { everyone, hugo, id, ines, lea, tom } from "./support/members.ts";

// Leave → People: "Away · back on …" on the card and the profile.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});

const told = (type: "leave.approved" | "leave.cancelled", data: Record<string, unknown>, extra: { source?: string; occurredAt?: string } = {}) =>
  chest.deliver({ type, source: extra.source ?? "leave", data, ...(extra.occurredAt ? { occurredAt: extra.occurredAt } : {}) }, POST);
const span = (from: string, to: string, fromHalf: Span["fromHalf"] = "am", toHalf: Span["toHalf"] = "pm"): Span => ({ from, to, fromHalf, toHalf });

// 2026-10-05 is a Monday; 2026-10-09 a Friday.
test("away today and back when: whole days, half days, weekends and leaves that follow each other", () => {
  assert.equal(awayToday([span("2026-10-05", "2026-10-07")], "2026-10-08"), null);
  assert.deepEqual(awayToday([span("2026-10-05", "2026-10-07")], "2026-10-06"), { today: "day", back: { day: "2026-10-08", half: "am" } });
  // Until Friday: back on Monday.
  assert.deepEqual(awayToday([span("2026-10-07", "2026-10-09")], "2026-10-09"), { today: "day", back: { day: "2026-10-12", half: "am" } });
  // Ends at noon: back that afternoon.
  assert.deepEqual(awayToday([span("2026-10-05", "2026-10-07", "am", "am")], "2026-10-06"), { today: "day", back: { day: "2026-10-07", half: "pm" } });
  // This morning only; this afternoon only.
  assert.deepEqual(awayToday([span("2026-10-06", "2026-10-06", "am", "am")], "2026-10-06"), { today: "am", back: { day: "2026-10-06", half: "pm" } });
  assert.deepEqual(awayToday([span("2026-10-06", "2026-10-06", "pm", "pm")], "2026-10-06"), { today: "pm", back: { day: "2026-10-07", half: "am" } });
  // Two leaves back to back (a request per week): back after the second.
  assert.deepEqual(awayToday([span("2026-10-05", "2026-10-09"), span("2026-10-12", "2026-10-14")], "2026-10-07"), { today: "day", back: { day: "2026-10-15", half: "am" } });
  // "day" or no half at all: the whole day ("day" is what Rooms also reads).
  assert.deepEqual(awayToday([span("2026-10-06", "2026-10-06", "day", "day")], "2026-10-06")?.today, "day");
});

test("the badge's words, in both languages", () => {
  // Dates as this runtime's Intl writes them ("Mon 12 Oct", "lun. 12 oct.").
  const short = (d: string, locale: "en" | "fr") => formatDay(d, locale, { weekday: "short", day: "numeric", month: "short" });
  const words = (locale: "en" | "fr", spans: Span[], now: string) => awayText(awayToday(spans, now)!, now, catalogue(locale).away, d => short(d, locale), format);
  assert.equal(words("en", [span("2026-10-07", "2026-10-09")], "2026-10-08"), `Away · back on ${short("2026-10-12", "en")}`);
  assert.equal(words("fr", [span("2026-10-07", "2026-10-09")], "2026-10-08"), `Absence · retour le ${short("2026-10-12", "fr")}`);
  assert.equal(words("en", [span("2026-10-06", "2026-10-06", "am", "am")], "2026-10-06"), "Away this morning");
  assert.equal(words("en", [span("2026-10-06", "2026-10-06", "pm", "pm")], "2026-10-06"), "Away this afternoon");
  // Friday afternoon off: back on Monday morning, nothing more to say.
  assert.equal(words("fr", [span("2026-10-09", "2026-10-09", "pm", "pm")], "2026-10-09"), "Absence cet après-midi");
  assert.equal(words("en", [span("2026-10-06", "2026-10-08", "pm", "pm")], "2026-10-06"), `Away this afternoon · back on ${short("2026-10-09", "en")}`);
  assert.equal(words("en", [span("2026-10-05", "2026-10-07", "am", "am")], "2026-10-06"), `Away · back on ${short("2026-10-07", "en")} afternoon`);
});

test("every field of Leave's event is checked", () => {
  const good = { member: hugo.id, from: "2026-10-05", to: "2026-10-07", fromHalf: "am", toHalf: "pm", request: "42" };
  assert.deepEqual(readLeave(good), { ...good });
  assert.deepEqual(readLeave({ ...good, fromHalf: undefined, toHalf: null }), { ...good, fromHalf: "day", toHalf: "day" });
  for (const bad of [
    { ...good, member: "Hugo" },
    { ...good, from: "2026-02-30" },
    { ...good, to: "2026-10-01" },
    { ...good, toHalf: "evening" },
    { ...good, request: "4 2" },
    { ...good, request: 42 },
    { ...good, from: "2020-01-01", to: "2026-10-07" },
  ]) assert.equal(readLeave(bad), null, JSON.stringify(bad));
});

test("a leave approved in Leave shows the person away; cancelled, it goes — and a late approval cannot bring it back", async () => {
  const { sql } = database;
  const now = today();
  const leave = { member: hugo.id, from: addDays(now, -1), to: addDays(now, 2), fromHalf: "am", toHalf: "pm", request: "42" };
  assert.equal(await told("leave.approved", leave, { occurredAt: new Date(Date.now() - 60_000).toISOString() }), 204);
  assert.deepEqual([...(await awayOf(sql, [hugo.id, ines.id], now)).keys()], [hugo.id]);
  // Only the dates: never the kind of leave nor a note.
  const columns = (await sql`select column_name from information_schema.columns where table_name = 'away' order by column_name`).map(c => c["column_name"]);
  assert.deepEqual(columns, ["cancelled", "from_day", "from_half", "member_id", "request", "to_day", "to_half", "told_at"]);
  // Approved again with new dates (the same request): the new dates.
  assert.equal(await told("leave.approved", { ...leave, to: addDays(now, 5) }, { occurredAt: new Date(Date.now() - 30_000).toISOString() }), 204);
  assert.equal((await sql`select to_char(to_day, 'YYYY-MM-DD') as d from away where request = '42'`)[0]!["d"], addDays(now, 5));
  assert.equal(await told("leave.cancelled", leave), 204);
  assert.equal((await awayOf(sql, [hugo.id], now)).size, 0);
  // The first approval, delivered again late: still cancelled.
  assert.equal(await told("leave.approved", leave, { occurredAt: new Date(Date.now() - 60_000).toISOString() }), 204);
  assert.equal((await awayOf(sql, [hugo.id], now)).size, 0);
  // Approved again later (a new fact): away again.
  assert.equal(await told("leave.approved", leave), 204);
  assert.equal((await awayOf(sql, [hugo.id], now)).size, 1);
});

test("only members of the Chest, only Leave, only well-formed events; past leaves are forgotten, and those of someone who leaves", async () => {
  const { sql } = database;
  const now = today();
  const count = async () => Number((await sql`select count(*)::int as n from away`)[0]!["n"]);
  const before = await count();
  assert.equal(await told("leave.approved", { member: id("stranger"), from: now, to: now, request: "70" }), 204);
  assert.equal(await told("leave.approved", { member: tom.id, from: "x", to: now, request: "71" }), 204);
  assert.equal(await told("leave.approved", { member: tom.id, from: addDays(now, -9), to: addDays(now, -2), request: "72" }), 204);
  // A "leave." event another tool would send is refused by the SDK.
  assert.equal(await told("leave.approved", { member: tom.id, from: now, to: now, request: "73" }, { source: "rooms" }), 401);
  assert.equal(await count(), before);
  // Léa is away until tomorrow; the day after, it is forgotten.
  assert.equal(await told("leave.approved", { member: lea.id, from: now, to: addDays(now, 1), request: "80" }), 204);
  assert.equal(await purgeAway(sql, now), 0);
  assert.equal(await purgeAway(sql, addDays(now, 2)), 1);
  // Tom is away; then he leaves the Chest: forgotten.
  assert.equal(await told("leave.approved", { member: tom.id, from: now, to: addDays(now, 3), request: "81" }), 204);
  assert.equal(await chest.emit({ type: "member.removed", data: { id: tom.id } }, POST), 204);
  assert.equal((await sql`select 1 from away where member_id = ${tom.id}`).length, 0);
  // Inès is away; then her data is erased: forgotten too.
  assert.equal(await told("leave.approved", { member: ines.id, from: now, to: addDays(now, 3), request: "82" }), 204);
  const erasure = "era_" + "b".repeat(26);
  assert.equal(await chest.emit({ type: "member.erased", data: { id: ines.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } }, POST), 204);
  assert.equal((await sql`select 1 from away where member_id = ${ines.id}`).length, 0);
});

test("a shortened leave (cancelled, then approved for fewer days): the approval stands in either delivery order, at the same time or later", async () => {
  const { sql } = database;
  const now = today();
  const whole = { member: hugo.id, from: now, to: addDays(now, 4), fromHalf: "am", toHalf: "pm" };
  const short = { ...whole, to: addDays(now, 1) };
  const kept = async (request: string) => (await sql<{ d: string | null; cancelled: boolean }[]>`select to_char(to_day, 'YYYY-MM-DD') as d, cancelled from away where request = ${request}`)[0];
  const cases = [
    { request: "90", same: true, cancelFirst: true },
    { request: "91", same: true, cancelFirst: false },
    { request: "92", same: false, cancelFirst: true },
    { request: "93", same: false, cancelFirst: false },
  ];
  for (const c of cases) {
    const base = Date.now() - 120_000;
    assert.equal(await told("leave.approved", { ...whole, request: c.request }, { occurredAt: new Date(base).toISOString() }), 204);
    const cancelAt = new Date(base + 60_000).toISOString();
    const approveAt = new Date(base + 60_000 + (c.same ? 0 : 1)).toISOString();
    const cancel = () => told("leave.cancelled", { ...whole, request: c.request }, { occurredAt: cancelAt });
    const approve = () => told("leave.approved", { ...short, request: c.request }, { occurredAt: approveAt });
    if (c.cancelFirst) { assert.equal(await cancel(), 204); assert.equal(await approve(), 204); }
    else { assert.equal(await approve(), 204); assert.equal(await cancel(), 204); }
    assert.deepEqual(await kept(c.request), { d: addDays(now, 1), cancelled: false }, `request ${c.request}: ${c.same ? "same time" : "a millisecond later"}, ${c.cancelFirst ? "cancellation" : "approval"} delivered first`);
  }
  assert.equal((await awayOf(sql, [hugo.id], now)).size, 1);
  // A cancellation at the same time as a cancellation already kept: still cancelled (harmless).
  const at = new Date(Date.now() - 10_000).toISOString();
  assert.equal(await told("leave.cancelled", { ...whole, request: "94" }, { occurredAt: at }), 204);
  assert.equal(await told("leave.cancelled", { ...whole, request: "94" }, { occurredAt: at }), 204);
  assert.equal((await kept("94"))?.cancelled, true);
  // A later cancellation still takes an approval back.
  assert.equal(await told("leave.cancelled", { ...whole, request: "93" }, { occurredAt: new Date().toISOString() }), 204);
  assert.equal((await kept("93"))?.cancelled, true);
});
