import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { clock, today } from "../lib/clock.ts";
import { dayEntries } from "../lib/entries.ts";
import * as projects from "../lib/projects.ts";
import { lock } from "../lib/settings.ts";
import * as timers from "../lib/timer.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, nora } from "./support/members.ts";
import { refused } from "./support/refused.ts";

let database: TestDatabase;
let chest: FakeChest;
let site: projects.Project;
let other: projects.Project;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, timeZone: "Europe/Paris" });
  site = await projects.createProject(database.sql, asMember(camille), { name: "Site", tasks: ["Design"] });
  other = await projects.createProject(database.sql, asMember(camille), { name: "Other", billable: false });
});
after(async () => {
  await chest.close();
  await database.close();
});
afterEach(() => {
  clock.now = () => new Date();
});
const at = (iso: string) => { clock.now = () => new Date(iso); };

test("one timer per person, on the server: start, it survives, stop makes an entry of its day", async () => {
  const { sql } = database;
  const me = asMember(hugo);
  at("2026-09-28T21:50:00Z"); // 23:50 in Paris
  await timers.startTimer(sql, me, { projectId: site.id, taskId: site.tasks[0]!.id, note: "Mockups" });
  const running = await timers.timer(sql, me);
  assert.equal(running?.note, "Mockups");
  assert.equal(running?.taskName, "Design");
  assert.equal(running?.startedAt, "2026-09-28T21:50:00.000Z");
  assert.equal(await timers.timer(sql, asMember(ines)), null);
  at("2026-09-28T23:20:00Z"); // 01:20 the next day in Paris
  const { entry } = await timers.stopTimer(sql, me);
  assert.equal(entry?.minutes, 90);
  assert.equal(entry?.day, "2026-09-28");
  assert.equal(entry?.source, "timer");
  assert.equal(entry?.startedAt, "2026-09-28T21:50:00.000Z");
  assert.equal(entry?.endedAt, "2026-09-28T23:20:00.000Z");
  assert.equal(await timers.timer(sql, me), null);
  await assert.rejects(timers.stopTimer(sql, me), refused("no_timer"));
});

test("starting another timer stops the first one; under a minute records nothing", async () => {
  const { sql } = database;
  const me = asMember(ines);
  at("2026-09-29T07:00:00Z");
  await timers.startTimer(sql, me, { projectId: site.id, note: "First" });
  at("2026-09-29T08:00:00Z");
  const { stopped } = await timers.startTimer(sql, me, { projectId: other.id, note: "Second" });
  assert.equal(stopped?.minutes, 60);
  assert.equal(stopped?.note, "First");
  assert.equal((await timers.timer(sql, me))?.projectId, other.id);
  at("2026-09-29T08:00:20Z");
  assert.deepEqual(await timers.stopTimer(sql, me), { entry: null });
  assert.equal((await dayEntries(sql, me, "2026-09-29")).length, 1);
});

test("the running timer changes project, task and note", async () => {
  const { sql } = database;
  const me = asMember(camille);
  at("2026-09-30T07:00:00Z");
  await assert.rejects(timers.updateTimer(sql, me, { note: "x" }), refused("no_timer"));
  await timers.startTimer(sql, me, { projectId: site.id });
  await timers.updateTimer(sql, me, { projectId: other.id, note: "Planning" });
  const t = await timers.timer(sql, me);
  assert.equal(t?.projectId, other.id);
  assert.equal(t?.note, "Planning");
  assert.equal(t?.billable, false);
  at("2026-09-30T07:30:00Z");
  assert.equal((await timers.stopTimer(sql, me)).entry?.billable, false);
});

test("a forgotten timer asks when it stopped; the answer is checked", async () => {
  const { sql } = database;
  const me = asMember(hugo);
  at("2026-10-01T07:00:00Z");
  await timers.startTimer(sql, me, { projectId: site.id });
  at("2026-10-01T18:00:00Z");
  const t = (await timers.timer(sql, me))!;
  assert.ok(timers.isForgotten(t, clock.now()));
  assert.ok(!timers.isForgotten(t, new Date("2026-10-01T16:00:00Z")));
  // It must be settled before another starts.
  await assert.rejects(timers.startTimer(sql, me, { projectId: other.id }), refused("timer_too_long"));
  await assert.rejects(timers.stopTimer(sql, me, "2026-10-01T06:00:00Z"), refused("invalid"));
  await assert.rejects(timers.stopTimer(sql, me, "2026-10-02T09:00:00Z"), refused("invalid"));
  await assert.rejects(timers.stopTimer(sql, me, "tomorrow"), refused("invalid"));
  at("2026-10-02T09:00:00Z");
  await assert.rejects(timers.stopTimer(sql, me), refused("timer_too_long"));
  const { entry } = await timers.stopTimer(sql, me, "2026-10-01T15:30:00Z");
  assert.equal(entry?.minutes, 510);
  assert.equal(entry?.day, "2026-10-01");
});

test("discard, and undo the discard", async () => {
  const { sql } = database;
  const me = asMember(ines);
  at("2026-10-02T07:00:00Z");
  await timers.startTimer(sql, me, { projectId: site.id, note: "Oops" });
  const back = await timers.discardTimer(sql, me);
  assert.equal(await timers.timer(sql, me), null);
  await assert.rejects(timers.discardTimer(sql, me), refused("no_timer"));
  await timers.restoreTimer(sql, me, back);
  assert.equal((await timers.timer(sql, me))?.note, "Oops");
  await assert.rejects(timers.restoreTimer(sql, me, back), refused("invalid"));
  await timers.discardTimer(sql, me);
  await assert.rejects(timers.restoreTimer(sql, me, { ...back, startedAt: "2026-01-01T00:00:00Z" }), refused("invalid"));
  await assert.rejects(timers.restoreTimer(sql, me, { ...back, startedAt: "2026-10-03T00:00:00Z" }), refused("invalid"));
});

test("the timer follows the rights and the locked period", async () => {
  const { sql } = database;
  await assert.rejects(timers.startTimer(sql, asMember(nora), { projectId: site.id }), refused("forbidden"));
  await assert.rejects(timers.timer(sql, null), refused("forbidden"));
  const secret = await projects.createProject(sql, asMember(camille), { name: "Secret", everyone: false, people: [] });
  await assert.rejects(timers.startTimer(sql, asMember(hugo), { projectId: secret.id }), refused("not_offered"));
  // A timer started before the period was locked cannot land in it.
  clock.now = () => new Date(Date.now() - 3 * 3600_000);
  await timers.startTimer(sql, asMember(hugo), { projectId: site.id });
  clock.now = () => new Date();
  const started = (await timers.timer(sql, asMember(hugo)))!;
  const startDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(started.startedAt));
  await lock(sql, asMember(camille), startDay <= today() ? startDay : today());
  await assert.rejects(timers.stopTimer(sql, asMember(hugo)), refused("locked"));
  await lock(sql, asMember(camille), null);
  await timers.discardTimer(sql, asMember(hugo));
});
