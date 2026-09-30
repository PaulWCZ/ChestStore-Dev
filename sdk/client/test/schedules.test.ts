import assert from "node:assert/strict";
import { test } from "node:test";
import { checkSchedules, describeCron, handle, nextRun, parseCron, verify } from "../src/schedules.js";
import { fakeChest } from "../src/testing.js";

test("cron lines: fields, ranges, lists, steps; the next run in the Chest's time zone", () => {
  assert.ok(parseCron("30 7 * * 1-5"));
  assert.ok(parseCron("*/15 8-18 * * 1,3,5"));
  assert.equal(parseCron("60 * * * *"), null);
  assert.equal(parseCron("* * *"), null);
  assert.equal(parseCron("a b c d e"), null);
  // Friday 2 October 2026, 08:00 in Paris (06:00 UTC): the next weekday
  // 07:30 in Paris is Monday 5 October, 05:30 UTC (summer time).
  assert.equal(nextRun("30 7 * * 1-5", new Date("2026-10-02T06:00:00Z"), "Europe/Paris")?.toISOString(), "2026-10-05T05:30:00.000Z");
  // After the change to winter time (25 October), 07:30 is 06:30 UTC.
  assert.equal(nextRun("30 7 * * *", new Date("2026-10-26T00:00:00Z"), "Europe/Paris")?.toISOString(), "2026-10-26T06:30:00.000Z");
  // Day of month or day of week, as cron reads both.
  assert.equal(nextRun("0 9 1 * 1", new Date("2026-10-02T12:00:00Z"), "UTC")?.toISOString(), "2026-10-05T09:00:00.000Z");
  assert.equal(nextRun("0 0 30 2 *", new Date("2026-01-01T00:00:00Z"), "UTC"), null);
});

test("a manifest's schedules: names, lines, at most eight, not more often than every 15 minutes", () => {
  assert.deepEqual(checkSchedules([{ name: "morning", cron: "30 7 * * 1-5" }, { name: "purge", cron: "0 3 * * *" }]), []);
  assert.deepEqual(checkSchedules([{ name: "often", cron: "*/5 * * * *" }]), ["schedule often runs more often than every 15 minutes"]);
  assert.deepEqual(checkSchedules([{ name: "Bad Name", cron: "0 3 * * *" }]).length, 1);
  assert.deepEqual(checkSchedules([{ name: "a", cron: "0 3 * * *" }, { name: "a", cron: "0 4 * * *" }]), ["schedule a twice"]);
  assert.equal(checkSchedules([]).length, 1);
  assert.equal(checkSchedules(Array.from({ length: 9 }, (_, i) => ({ name: "s" + i, cron: "0 3 * * *" }))).length, 1);
  assert.equal(describeCron("30 7 * * 1-5"), "weekdays at 07:30");
  assert.equal(describeCron("0 6 * * *"), "every day at 06:00");
  assert.equal(describeCron("15 * * * *"), "every hour at :15");
});

test("a run is delivered signed, to its own path, once per call; others are refused", async () => {
  const chest = await fakeChest({ schedules: [{ name: "morning", cron: "30 7 * * 1-5" }], chest: { timeZone: "Europe/Paris" } });
  try {
    const seen: string[] = [];
    const app = async (request: Request) => new Response(null, { status: await handle(request, { morning: run => { seen.push(`${run.name}:${run.attempt}:${run.timeZone}`); } }) });
    assert.equal(await chest.run("morning", app), 204);
    assert.equal(await chest.run("morning", app, { attempt: 2 }), 204);
    assert.deepEqual(seen, ["morning:1:Europe/Paris", "morning:2:Europe/Paris"]);
    assert.deepEqual(chest.runs.map(r => r.status), [204, 204]);
    // Not signed, or sent to another schedule's path: not the Chest's.
    assert.equal(await handle(new Request("http://tool/chest-jobs/morning", { method: "POST", body: "{}" }), {}), 401);
    const failing = async (request: Request) => {
      try {
        return new Response(null, { status: await handle(request, { morning: () => { throw new Error("boom"); } }) });
      } catch {
        return new Response(null, { status: 500 });
      }
    };
    assert.equal(await chest.run("morning", failing), 500);
    const noHandler = async (request: Request) => new Response(null, { status: await handle(request, {}) });
    assert.equal(await chest.run("morning", noHandler), 404);
    const moved = async (request: Request) => new Response(null, { status: (await verify(new Request(request.url.replace("morning", "other"), { method: "POST", headers: request.headers, body: await request.text() }))) ? 204 : 401 });
    assert.equal(await chest.run("morning", moved), 401);
    await assert.rejects(chest.run("nightly", app), /no schedule named nightly/u);
  } finally {
    await chest.close();
  }
});
