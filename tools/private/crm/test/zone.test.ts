import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as deals from "../src/lib/deals.ts";
import { listStages } from "../src/lib/stages.ts";
import { today, zoned } from "../src/lib/zone.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, ines } from "./support/members.ts";

// The company's days are the Chest's time zone (chest.timeZone), never the
// server's nor Paris: a Chest at UTC+14 (Kiritimati) is already on 1 October
// when UTC is still on 30 September.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ network: {}, members: everyone, chest: { timeZone: "Pacific/Kiritimati" } });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});

test("today and a next step's time are the Chest's", () => {
  assert.equal(today(new Date("2026-09-30T12:00:00Z")), "2026-10-01");
  assert.equal(zoned("2026-10-01", "09:00").toISOString(), "2026-09-30T19:00:00.000Z");
});

test("won this month counts a deal by the Chest's day it was won", async () => {
  const { sql } = database;
  const won = (await listStages(sql)).find(s => s.kind === "won")!;
  const d = await deals.addDeal(sql, asMember(ines), { title: "Late evening in UTC", value: 100000 });
  await deals.moveDeal(sql, asMember(ines), d.id, won.id, null, null, "");
  await sql`update deals set closed_at = '2026-09-30T20:00:00Z' where id = ${d.id}`;
  assert.equal((await deals.wonThisMonth(sql, asMember(ines), "2026-10-15")).mine, 100000);
  assert.equal((await deals.wonThisMonth(sql, asMember(ines), "2026-09-15")).mine, 0);
});
