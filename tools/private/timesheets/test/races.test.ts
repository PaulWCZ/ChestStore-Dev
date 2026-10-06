import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { today } from "../src/lib/clock.ts";
import type { Query } from "../src/lib/db.ts";
import * as entries from "../src/lib/entries.ts";
import * as invoicing from "../src/lib/invoicing.ts";
import * as projects from "../src/lib/projects.ts";
import * as rates from "../src/lib/rates.ts";
import { lock } from "../src/lib/settings.ts";
import * as timers from "../src/lib/timer.ts";
import { addDays } from "../src/shared/days.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo } from "./support/members.ts";
import { refused } from "./support/refused.ts";

// Two people at once, on a real PostgreSQL (TEST_DATABASE_URL): a manager's
// act holds its transaction open while a member's save arrives; the save
// must wait for it and then see it — never land in what was just invoiced
// or locked. PGlite serves every connection from one session: these need
// a server, and are skipped without one.
const server = process.env["TEST_DATABASE_URL"] !== undefined;
let database: TestDatabase;
let chest: FakeChest;
let site: projects.Project;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, network: {} });
  site = await projects.createProject(database.sql, asMember(camille), { name: "Site", rateCents: 9000 });
});
after(async () => {
  await chest.close();
  await database.close();
});

// hold(act): runs a manager's act in a transaction kept open until
// release(); the act's locks are held meanwhile.
function hold(act: (tx: Query) => Promise<unknown>) {
  let release!: () => void;
  const released = new Promise<void>(ok => { release = ok; });
  let acted!: () => void;
  const done = new Promise<void>(ok => { acted = ok; });
  const tx = database.sql.begin(async (t: Query) => {
    await act(t);
    acted();
    await released;
  });
  return { acted: done, release, tx };
}
// settledWithin: whether a promise ended within ms (it should be waiting).
const settledWithin = (p: Promise<unknown>, ms: number) => Promise.race([p.then(() => true, () => true), new Promise(ok => setTimeout(() => ok(false), ms))]);

test("an entry being invoiced meanwhile: the member's change waits, then is refused", { skip: !server && "needs TEST_DATABASE_URL" }, async () => {
  const day = addDays(today(), -3);
  const e = await entries.addEntry(database.sql, asMember(hugo), { projectId: site.id, day, minutes: 60 });
  for (const change of [
    () => entries.updateEntry(database.sql, asMember(hugo), e.id, { projectId: site.id, day, minutes: 90 }),
    () => entries.setNote(database.sql, asMember(hugo), e.id, "after"),
    () => entries.deleteEntry(database.sql, asMember(hugo), e.id),
    () => entries.saveCell(database.sql, asMember(hugo), { projectId: site.id, taskId: null, day, minutes: 30 }),
  ]) {
    const h = hold(t => invoicing.markInvoiced(t, asMember(camille), { from: day, to: day }));
    await h.acted;
    const attempt = change();
    attempt.catch(() => {});
    // Released whatever happens: a failed check never leaves a transaction open.
    let waited: boolean;
    try {
      waited = !(await settledWithin(attempt, 300));
    } finally {
      h.release();
      await h.tx;
    }
    assert.ok(waited, "it waits for the invoicing");
    await assert.rejects(attempt, refused("invoiced"));
    // Undo, for the next change.
    await database.sql`update entries set invoiced_at = null, invoiced_by = null, rates_fixed = false, bill_rate_cents = null, cost_rate_cents = null where id = ${e.id}`;
  }
  const [row] = await database.sql<{ minutes: number; note: string; deleted: boolean }[]>`select minutes, note, deleted_at is not null as deleted from entries where id = ${e.id}`;
  assert.deepEqual([row!.minutes, row!.note, row!.deleted], [60, "", false], "nothing changed");
});

test("a period being locked meanwhile: a save, a timer stopped, a rate set there wait, then are refused", { skip: !server && "needs TEST_DATABASE_URL" }, async () => {
  const day = today();
  await timers.startTimer(database.sql, asMember(hugo), { projectId: site.id });
  await database.sql`update timers set started_at = now() - interval '30 minutes' where member_id = ${hugo.id}`;
  for (const [name, change, code] of [
    ["a cell", () => entries.saveCell(database.sql, asMember(hugo), { projectId: site.id, taskId: null, day: addDays(day, -1), minutes: 45 }), "locked"],
    ["a timer", () => timers.stopTimer(database.sql, asMember(hugo)), "locked"],
    ["a rate", () => rates.setRate(database.sql, asMember(camille), { kind: "bill", projectId: site.id, cents: 9500, from: addDays(day, -1) }), "rate_locked"],
  ] as const) {
    const h = hold(t => lock(t, asMember(camille), day));
    await h.acted;
    const attempt = change();
    attempt.catch(() => {});
    let waited: boolean;
    try {
      waited = !(await settledWithin(attempt, 300));
    } finally {
      h.release();
      await h.tx;
    }
    assert.ok(waited, `${name} waits for the lock`);
    await assert.rejects(attempt, refused(code));
    await lock(database.sql, asMember(camille), null);
  }
  const n = (await database.sql<{ n: number }[]>`select count(*)::int as n from entries where member_id = ${hugo.id} and day >= ${addDays(day, -1)}`)[0]?.n;
  assert.equal(n, 0, "nothing landed in the locked days");
});
