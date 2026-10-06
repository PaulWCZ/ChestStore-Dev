import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { atLeast } from "@argentic/chest-app/testing";
import { AppError } from "../src/lib/app-error.ts";
import { reopenCycle, closeCycle, updateCycle } from "../src/lib/cycles.ts";
import { checkIn, undoCheckIn, updateKeyResult } from "../src/lib/key-results.ts";
import { addDays } from "../src/lib/model.ts";
import { carryOver, createObjective, roomIn } from "../src/lib/objectives.ts";
import { objectiveById, waitingCounts } from "../src/lib/read.ts";
import { remindAll, waitingFor } from "../src/lib/remind.ts";
import { refreshFed } from "../src/lib/sources.ts";
import { clockAt, refreshBadges } from "../src/lib/tell.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines } from "./support/members.ts";
import { running, world, type World } from "./support/world.ts";

// What the review of the move found, each held by a test (run them on
// PostgreSQL: TEST_DATABASE_URL).
atLeast(5);
let w: World;
before(async () => { w = await world({ groups: true }); });
after(async () => { await w.close(); });

const admin = asMember(camille);
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const paul = "mbr_paul" + "a".repeat(22);
const doneCards = async (n: number, at = new Date()) => {
  const { sql } = w.database;
  for (let i = 0; i < n; i++) await sql`insert into fed_events (kind, ref, members, at) values ('tasks.card', ${"C-" + Math.random().toString(36).slice(2)}, '{}', ${at})`;
  await refreshFed(sql);
};
const valueOf = async (objectiveId: string, krId: string) => (await objectiveById(w.database.sql, objectiveId, clockAt(), null))!.keyResults.find(k => k.id === krId)!.current;

let cycleId = "", objectiveId = "", fedId = "";

test("an update of a value another tool feeds keeps the tool's value; taking it back keeps it too", async () => {
  const { sql } = w.database;
  const { cycle } = await running(w);
  cycleId = cycle.id;
  const o = await createObjective(sql, admin, { cycleId, level: "company", title: "Ship", keyResults: [{ title: "Cards done", source: "tasks.done", start: "0", target: "50", owner: ines.id }] });
  objectiveId = o.id;
  fedId = o.keyResults[0]!.id;
  await doneCards(3);
  assert.equal(await valueOf(objectiveId, fedId), 3);
  const done = await checkIn(sql, asMember(ines), fedId, { value: "999", confidence: "at_risk", note: "" });
  assert.equal(done.value, 3, "the update records the tool's value, not what was typed");
  // A card done between the update and its Undo.
  await doneCards(1);
  assert.equal(await valueOf(objectiveId, fedId), 4);
  await undoCheckIn(sql, asMember(ines), done.id);
  assert.equal(await valueOf(objectiveId, fedId), 4, "Undo counts again, never 0 or an old update's value");
});

test("changing a cycle's dates, or reopening it, counts its fed values again", async () => {
  const { sql } = w.database;
  // A card done before the cycle: not counted, until the cycle starts earlier.
  const [row] = await sql<{ starts_on: string; ends_on: string }[]>`select starts_on, ends_on from cycles where id = ${cycleId}`;
  const before = addDays(row!.starts_on, -20);
  await doneCards(2, new Date(before + "T10:00:00Z"));
  assert.equal(await valueOf(objectiveId, fedId), 4);
  await updateCycle(sql, admin, cycleId, { startsOn: addDays(row!.starts_on, -30), endsOn: row!.ends_on });
  assert.equal(await valueOf(objectiveId, fedId), 6);
  // Closed, it is frozen; a card done meanwhile counts once it reopens.
  await closeCycle(sql, admin, cycleId);
  await sql`insert into fed_events (kind, ref, members, at) values ('tasks.card', 'C-late', '{}', now())`;
  await reopenCycle(sql, admin, cycleId);
  assert.equal(await valueOf(objectiveId, fedId), 7);
  await updateCycle(sql, admin, cycleId, { startsOn: row!.starts_on, endsOn: row!.ends_on });
});

test("who waits for an update: never someone who left, never a value another tool feeds", async () => {
  const { sql } = w.database;
  const o = await createObjective(sql, admin, {
    cycleId, level: "company", title: "Grow",
    keyResults: [{ title: "Customers", kind: "number", start: "0", target: "20", owner: hugo.id }, { title: "Partners", kind: "number", start: "0", target: "5", owner: hugo.id }],
  });
  // Paul left the Chest; nothing told Goals yet (no event, not in `departed`).
  await sql`update key_results set owner = ${paul} where id = ${o.keyResults[1]!.id}`;
  await sql`update key_results set created_at = now() - interval '10 days'`;
  const clock = clockAt();
  const waiting = await waitingFor(sql, admin, clock);
  assert.deepEqual(waiting.map(x => x.title).sort(), ["Customers"]);
  assert.equal(await remindAll(sql, admin, clock), 1, "only Hugo is reminded");
  const counts = await refreshBadges(sql, null);
  assert.equal(counts.get(hugo.id), 1);
  assert.equal(counts.has(paul), false, "no tile for someone who left");
  assert.equal(counts.get(ines.id) ?? 0, 0, "the fed key result does not wait");
  // Once Goals is told (member.removed), the SQL leaves them out too.
  await sql`insert into departed (member_id) values (${paul})`;
  assert.equal((await waitingCounts(sql, [paul], clock)).get(paul), 0);
});

test("a cycle takes 500 objectives at most, carried over or written at once", async () => {
  const { sql } = w.database;
  const [counted] = await sql<{ n: number }[]>`select count(*)::int as n from objectives where cycle_id = ${cycleId} and archived_at is null`;
  const n = counted!.n;
  await sql`
    insert into objectives (cycle_id, level, owner, title, created_by)
    select ${cycleId}, 'company', ${camille.id}, 'Filler ' || i, ${camille.id} from generate_series(1, ${500 - n}) i`;
  await assert.rejects(createObjective(sql, admin, { cycleId, level: "company", title: "One too many" }), refused("too_many"));
  // Two at once, with one place left: one passes, never both.
  await sql`delete from objectives where title = 'Filler 1'`;
  const both = await Promise.allSettled([
    createObjective(sql, admin, { cycleId, level: "company", title: "First" }),
    createObjective(sql, admin, { cycleId, level: "company", title: "Second" }),
  ]);
  assert.equal(both.filter(r => r.status === "fulfilled").length, 1);
  await assert.rejects(sql.begin(tx => roomIn(tx, cycleId, 1)), refused("too_many"));
  // Carried into a full cycle: refused too.
  const [made] = await sql<{ id: string }[]>`insert into cycles (name, starts_on, ends_on, created_by) values ('Next', current_date + 100, current_date + 190, ${camille.id}) returning id::text`;
  const next = made!.id;
  const [filler] = await sql<{ id: string }[]>`select id::text from objectives where cycle_id = ${cycleId} and title = 'Filler 2'`;
  const one = filler!.id;
  const carried = await carryOver(sql, admin, one, next);
  await assert.rejects(carryOver(sql, admin, carried, cycleId), refused("too_many"));
});

test("a key result's kind changes only while nobody updated it", async () => {
  const { sql } = w.database;
  const [kr] = await sql<{ id: string }[]>`select k.id::text from key_results k where k.title = 'Customers'`;
  await checkIn(sql, asMember(hugo), kr!.id, { value: "2", confidence: "on_track", note: "" });
  await assert.rejects(updateKeyResult(sql, admin, kr!.id, { kind: "percent", start: "0", target: "100" }), refused("invalid"));
});
