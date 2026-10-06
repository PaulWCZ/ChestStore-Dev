import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { atLeast } from "@argentic/chest-app/testing";
import { dealReopened, dealWon } from "../src/lib/crm.ts";
import { db } from "../src/lib/db.ts";
import { formChoices } from "../src/lib/form-data.ts";
import { checkIn } from "../src/lib/key-results.ts";
import { context } from "../src/lib/page-data.ts";
import { checkIns, objectiveById } from "../src/lib/read.ts";
import { clockAt } from "../src/lib/tell.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, sofia } from "./support/members.ts";
import { companyObjective, running, world, type World } from "./support/world.ts";

// What pages read before they render, and the rules that must hold in SQL
// when two people act at once (run on PostgreSQL with TEST_DATABASE_URL).
atLeast(5);
let w: World;
before(async () => { w = await world({ groups: true }); });
after(async () => { await w.close(); });

test("the database answers days as text, as the Chest's zone counts them", async () => {
  const [row] = await db()<{ day: string; today: string }[]>`select date '2027-01-04' as day, current_date as today`;
  assert.equal(row!.day, "2027-01-04");
  assert.match(row!.today, /^\d{4}-\d{2}-\d{2}$/u);
  assert.equal(row!.today, clockAt().today, "current_date is the Chest's today");
});

test("a page's context: the cycles in the reader's words, the teams, names of the people it shows", async () => {
  const { sql } = w.database;
  const { cycle, sales } = await running(w);
  const ctx = await context(sql, asMember(camille));
  assert.deepEqual(ctx.cycles.map(c => c.id), [cycle.id]);
  assert.match(ctx.cycles[0]!.name, /^T\d 20\d\d$/u, "Camille reads French");
  assert.equal((await context(sql, asMember(hugo))).cycles[0]!.name.startsWith("Q"), true);
  assert.equal(ctx.teams.get(sales.id), "Sales");
  const people = await ctx.people([ines.id]);
  assert.equal(people.get(ines.id)?.name, "Inès Moreau");
  assert.equal(people.get(camille.id)?.name, "Camille Martin", "the reader is always named");
});

test("the objective form offers only what this person may write", async () => {
  const { sql } = w.database;
  const [cycle] = (await context(sql, asMember(camille))).cycles;
  await companyObjective(w, cycle!.id);
  const ctx = await context(sql, asMember(sofia));
  const sofias = await formChoices(sql, asMember(sofia), cycle!.id, ctx.teamList, ctx.clock);
  assert.deepEqual(sofias.levels, ["team"]);
  assert.deepEqual(sofias.teams.map(x => [x.name, x.writable]), [["Sales", false], ["Workshop", true]], "Sales is a group she is not in");
  assert.deepEqual(sofias.parents.map(p => p.level), ["company"]);
  const camilles = await formChoices(sql, asMember(camille), cycle!.id, ctx.teamList, ctx.clock);
  assert.deepEqual(camilles.levels, ["company", "team"]);
  assert.equal(camilles.personal, false);
});

test("updates of one key result at once: each kept, its value always the latest's", async () => {
  const { sql } = w.database;
  const [cycle] = (await context(sql, asMember(camille))).cycles;
  const o = await companyObjective(w, cycle!.id, "Two at once");
  const k = o.keyResults[0]!;
  // Inès and an admin update together, many times over (on PostgreSQL the
  // updates overlap; PGlite takes them one at a time).
  const rounds = 20;
  for (let round = 0; round < rounds; round++) {
    await Promise.all([
      checkIn(sql, asMember(ines), k.id, { value: String(10 + round), confidence: "on_track", note: "" }),
      checkIn(sql, asMember(camille), k.id, { value: String(100 + round), confidence: "at_risk", note: "" }),
      checkIn(sql, asMember(camille), k.id, { value: String(200 + round), confidence: "off_track", note: "" }),
    ]);
    const read = await objectiveById(sql, o.id, clockAt(), null);
    const history = (await checkIns(sql, [k.id], 1)).get(k.id)!;
    assert.equal(read!.keyResults.find(x => x.id === k.id)!.current, history.at(-1)!.value, `round ${round}: the key result says what its latest update says`);
  }
  const history = (await checkIns(sql, [k.id], 100)).get(k.id)!;
  assert.equal(history.length, rounds * 3);
});

test("Clients' deals: a malformed event is ignored, a reopened deal no longer counts", async () => {
  const { sql } = w.database;
  const at = new Date().toISOString();
  await dealWon(sql, { id: "evt_1", type: "crm.deal.won", source: "crm", occurredAt: at, data: { deal: "bad ref!", amount: "lots" } });
  await dealWon(sql, { id: "evt_2", type: "crm.deal.won", source: "crm", occurredAt: at, data: { deal: "D-9", amount: 125000, currency: "EUR", title: "never kept" } });
  assert.deepEqual([...await sql`select deal, amount_cents::int as cents, currency from crm_deals`], [{ deal: "D-9", cents: 125000, currency: "EUR" }]);
  await dealReopened(sql, { id: "evt_3", type: "crm.deal.reopened", source: "crm", occurredAt: at, data: { deal: "D-9" } });
  const [row] = await sql<{ won_at: Date | null }[]>`select won_at from crm_deals where deal = 'D-9'`;
  assert.equal(row!.won_at, null);
});
