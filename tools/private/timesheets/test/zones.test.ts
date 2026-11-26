import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { today } from "../src/lib/clock.ts";
import { addDays, mondayOf } from "../src/shared/days.ts";
import { toolStart } from "../src/lib/weeks.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { everyone } from "./support/members.ts";

// A Chest far from UTC (Kiritimati, UTC+14), whose database sessions are
// in its zone, as a Chest makes them: the tool's today and the database's
// current_date are one day, and a moment is read as the Chest's day.
const zone = "Pacific/Kiritimati";
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase({ timeZone: zone });
  chest = await fakeChest({ members: everyone, chest: { timeZone: zone } });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("today is the Chest's day, and the database's current_date is the same", async () => {
  const [row] = await database.sql<{ day: string }[]>`select current_date::text as day`;
  assert.equal(today(), row!.day);
});

test("a project made a minute after the Chest's Monday midnight starts that week, not UTC's previous one", async () => {
  const monday = addDays(mondayOf(today()), -7);
  await database.sql`insert into projects (name, created_at) values ('Early', ${new Date(`${monday}T00:01:00+14:00`)})`;
  assert.equal(await toolStart(database.sql), monday);
});
