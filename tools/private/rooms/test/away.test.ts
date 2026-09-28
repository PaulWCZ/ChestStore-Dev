import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import { wholeDays } from "../lib/away.ts";
import * as desks from "../lib/desk-bookings.ts";
import { presenceOf, setPresence } from "../lib/presence.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo } from "./support/members.ts";
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

const told = (type: "leave.approved" | "leave.cancelled", data: Record<string, unknown>) => chest.deliver({ type, source: "leave", data }, POST);

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
