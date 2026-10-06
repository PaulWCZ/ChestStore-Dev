import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { keepUnlinkedDays, purgeArrivals } from "../src/lib/arrivals.ts";
import { addDays } from "../src/shared/model.ts";
import { today } from "../src/lib/zone.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { everyone } from "./support/members.ts";

// A Chest far from UTC (Kiritimati, UTC+14), whose database sessions are
// in its zone, as a Chest makes them: the tool's today and the database's
// current_date are one day, and a moment read as a day (told_at::date) is
// the Chest's day, not UTC's.
const zone = "Pacific/Kiritimati";
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase({ timeZone: zone });
  chest = await fakeChest({ network: {}, tool: "people", chest: { timeZone: zone }, members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("today is the Chest's day, and the database's current_date is the same", async () => {
  const [row] = await database.sql<{ day: string }[]>`select current_date::text as day`;
  assert.equal(today(), row!.day);
});

test("an arrival never linked, told a minute after the Chest's midnight, is kept until its 90 days are over in the Chest's days", async () => {
  const { sql } = database;
  const now = today();
  const told = addDays(now, -keepUnlinkedDays);
  // 00:01 in Kiritimati that day: still the day before in UTC.
  await sql`insert into arrivals (source, ref, name, told_at) values ('hiring', 'cand_zone', 'Lucie Garnier', ${new Date(`${told}T00:01:00+14:00`)})`;
  assert.equal(await purgeArrivals(sql, now), 0, "told exactly 90 of the Chest's days ago: kept");
  assert.equal(await purgeArrivals(sql, addDays(now, 1)), 1, "a day later: gone");
});
