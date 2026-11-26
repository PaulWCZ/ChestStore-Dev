import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/lib/app-error.ts";
import * as b from "../src/lib/booking.ts";
import { importCalendly, readTime } from "../src/lib/import.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { openHost } from "./support/host.ts";
import { asMember } from "./support/member.ts";
import { everyone, ines, nora } from "./support/members.ts";

// Moving from Calendly: the meetings still to come, from its "Scheduled
// events" export (test/fixtures: its columns as Calendly's help names
// them; see lib/import.ts).

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate hosts, bookings, settings cascade`;
});

const monday = Date.parse("2026-10-05T06:00:00Z");
const file = readFileSync(join(import.meta.dirname, "fixtures", "calendly-scheduled-events.csv"), "utf8");

test("times as Calendly writes them, read in the zone chosen", () => {
  assert.equal(readTime("2026-10-06 10:00 am", "Europe/Paris")?.toISOString(), "2026-10-06T08:00:00.000Z");
  assert.equal(readTime("2026-10-06 12:30 pm", "Europe/Paris")?.toISOString(), "2026-10-06T10:30:00.000Z");
  assert.equal(readTime("2026-10-06 12:15 am", "UTC")?.toISOString(), "2026-10-06T00:15:00.000Z");
  assert.equal(readTime("10/6/2026 2:00 pm", "America/New_York")?.toISOString(), "2026-10-06T18:00:00.000Z");
  assert.equal(readTime("2026-10-06T10:00:00+02:00", "UTC")?.toISOString(), "2026-10-06T08:00:00.000Z");
  assert.equal(readTime("2026-02-30 10:00", "UTC"), null);
  assert.equal(readTime("13:00 pm", "UTC"), null);
});

test("a Calendly export: meetings to come become bookings (matched to types by name), a taken time is listed, past and cancelled ones skipped, a second import adds nothing", async () => {
  const sql = database.sql;
  await openHost(sql, asMember(ines), { title: "Meeting", slug: "meeting" });
  const call = await b.createType(sql, asMember(ines), { title: "Project call", slug: "project-call", description: "", duration: 30, locationKind: "video", location: "https://meet.example.com/ines", bufferBefore: 0, bufferAfter: 0, noticeMinutes: 0, windowDays: 60, color: "sky", active: true });
  const done = await importCalendly(sql, asMember(ines), file, "Europe/Paris", monday);
  assert.equal(done.imported, 2);
  assert.deepEqual(done.conflicts, [{ name: "Sarah Klein", start: "2026-10-06T08:00:00.000Z" }]);
  // Tom cancelled, Anna's is past, a row without an address.
  assert.equal(done.skipped, 3);
  const [marie, lucas] = done.bookings;
  assert.equal(marie!.typeId, call.id);
  assert.equal(marie!.source, "import");
  assert.equal(marie!.startsAt.toISOString(), "2026-10-06T08:00:00.000Z");
  assert.equal(lucas!.guestName, "Garnier, Lucas");
  assert.equal(lucas!.typeId, null);
  assert.equal(lucas!.title, "Showroom visit");
  assert.equal(lucas!.location, "14 rue des Arts, Lyon");
  assert.equal(lucas!.duration, 60);
  // The time taken is taken for the page too.
  const host = (await b.hostOf(sql, ines.id))!;
  assert.ok(!(await b.freeTimes(sql, host, call, "2026-10-06", "2026-10-06", monday)).some(s => s.start === "2026-10-06T08:00:00.000Z"));
  const again = await importCalendly(sql, asMember(ines), file, "Europe/Paris", monday);
  assert.equal(again.imported, 0);
  await assert.rejects(importCalendly(sql, asMember(ines), "Name,Date\nA,B", "Europe/Paris", monday), (e: unknown) => e instanceof AppError && e.code === "import_unreadable");
  await assert.rejects(importCalendly(sql, asMember(nora), file, "Europe/Paris", monday), (e: unknown) => e instanceof AppError && e.code === "forbidden");
});
