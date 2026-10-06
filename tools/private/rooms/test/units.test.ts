import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeChest } from "@argentic/chest-sdk/testing";
import { atLeast } from "@argentic/chest-app/testing";
import { conflict } from "../src/lib/booking-rules.ts";
import { bookableDays, formDays, lockOf, shownDay } from "../src/lib/context.ts";
import { db, provide, type Sql } from "../src/lib/db.ts";
import { directory, matchable } from "../src/lib/directory.ts";
import { cut } from "../src/lib/notify.ts";
import { instantOf, isZone, wall } from "../src/lib/wall-clock.ts";
import { windowsZone } from "../src/lib/windows-zones.ts";
import { zone } from "../src/lib/zone.ts";
import { AppError } from "../src/shared/app-error.ts";
import { everyone, hugo, nora } from "./support/members.ts";

// The small rules the pages, the files and the bell share, alone.
atLeast(8);

const rules = { daysAhead: 14, maxDeskDays: null, repeatWeeks: 12, dayStart: 420, dayEnd: 1200, weekdays: [1, 2, 3, 4, 5], keepMonths: 12, visitorDays: 30, checkIn: false };

test("the day a page shows: ?day= within a year either side, else the next working day; the strip and the form's days", () => {
  const c = { today: "2026-10-09", rules };
  assert.equal(shownDay("2026-10-14", c), "2026-10-14");
  assert.equal(shownDay("2028-01-01", c), "2026-10-09", "too far: today, a working day");
  assert.equal(shownDay("2026-02-31", c), "2026-10-09", "not a day");
  assert.equal(shownDay(undefined, { today: "2026-10-10", rules }), "2026-10-12", "a Saturday: Monday");
  assert.deepEqual(bookableDays(c, 3), ["2026-10-09", "2026-10-12", "2026-10-13"]);
  assert.equal(formDays(c, false).at(-1), "2026-10-23");
  assert.ok(formDays(c, true).length > 60, "admins: three months");
});

test("why a day cannot be booked: over, closed, not open yet (and the day it opens); admins have no window", () => {
  const c = { today: "2026-10-07", rules };
  assert.deepEqual(lockOf(c, "2026-10-06", false), { why: "past" });
  assert.deepEqual(lockOf(c, "2026-10-10", false), { why: "closed" });
  assert.deepEqual(lockOf(c, "2026-10-30", false), { why: "notYet", opens: "2026-10-16" });
  assert.equal(lockOf(c, "2026-10-30", true), null);
  assert.equal(lockOf(c, "2026-10-21", false), null);
});

test("a time PostgreSQL refused because someone took it is a code: taken, or already booked (one desk per person)", () => {
  const taken = conflict({ code: "23P01", constraint_name: "desk_taken" });
  assert.ok(taken instanceof AppError);
  assert.equal(taken.code, "taken");
  assert.equal(conflict({ code: "23P01", constraint_name: "room_taken" })?.code, "taken");
  assert.equal(conflict({ code: "23P01", constraint_name: "desk_already" })?.code, "already_booked");
  assert.equal(conflict({ code: "23505" }), null);
  assert.equal(conflict(new Error("other")), null);
});

test("the database: one pool, or the connection the tests give", () => {
  const given = { given: true } as unknown as Sql;
  provide(given);
  assert.equal(db(), given);
  provide(undefined);
});

test("the bell's texts are cut at a number of characters (not UTF-16 units), with an ellipsis", () => {
  assert.equal(cut("Salle  Atlas", 40), "Salle Atlas");
  assert.equal(cut("é".repeat(10), 5), "éééé…");
  assert.equal(cut("👍".repeat(10), 3), "👍👍…");
});

test("an imported calendar's times: zones read by name or by Windows' name; wall clocks across daylight saving", () => {
  assert.equal(isZone("Europe/Paris"), true);
  assert.equal(isZone("Mars/Olympus"), false);
  assert.equal(windowsZone("Romance Standard Time"), "Europe/Paris");
  assert.equal(windowsZone("Nowhere Standard Time"), null);
  // The night the clocks go back in Paris: 02:30 happens twice; the first is kept.
  assert.equal(instantOf("2026-10-25", 150, "Europe/Paris").toISOString(), "2026-10-25T00:30:00.000Z");
  assert.deepEqual(wall(Date.parse("2026-10-25T02:30:00Z"), "Europe/Paris"), { date: "2026-10-25", minutes: 210, weekday: 0 });
  // The night they go forward, 02:30 does not exist: it reads as 03:30.
  assert.equal(wall(instantOf("2026-03-29", 150, "Europe/Paris"), "Europe/Paris").minutes, 210);
});

test("the people who have Rooms, by name, for the pickers; the importers' list keeps addresses on the server", async () => {
  const chest = await fakeChest({ network: {}, tool: "rooms", members: everyone.map(m => ({ ...m, email: `${m.firstName.toLowerCase()}@atelier.test` })), capabilities: ["members", "members.email"] });
  try {
    const found = await directory();
    assert.ok(found.some(p => p.id === hugo.id));
    assert.ok(!found.some(p => p.id === nora.id), "without a role: not offered");
    assert.ok(found.every(p => !("email" in p)), "no address in what pages receive");
    assert.ok((await matchable()).some(p => p.email === "hugo@atelier.test"));
  } finally {
    await chest.close();
  }
});

test("the office's zone is the Chest's", async () => {
  const chest = await fakeChest({ network: {}, tool: "rooms", chest: { timeZone: "America/Montreal" } });
  try {
    assert.equal(zone(), "America/Montreal");
  } finally {
    await chest.close();
  }
});
