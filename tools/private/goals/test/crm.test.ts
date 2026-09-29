import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { POST } from "../app/chest-events/route.ts";
import { AppError } from "../lib/app-error.ts";
import { checkIn, updateKeyResult } from "../lib/key-results.ts";
import { createObjective } from "../lib/objectives.ts";
import { checkIns, objectiveById } from "../lib/read.ts";
import { clockAt } from "../lib/tell.ts";
import { asMember } from "./support/member.ts";
import { camille, ines } from "./support/members.ts";
import { running, world, type World } from "./support/world.ts";

// Key results fed by Clients (the CRM), through the events it publishes
// (Proposal (studio): events between tools): "Amount won" and "Deals won"
// follow each deal won or reopened in the cycle's dates; nobody types them.
let w: World;
before(async () => { w = await world(); });
after(async () => { await w.close(); });

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const admin = asMember(camille), inesM = asMember(ines);
const won = (deal: string, amount: number | null, occurredAt = new Date().toISOString(), currency = "EUR") =>
  w.chest.deliver({ type: "crm.deal.won", data: { deal, title: "Deal " + deal, amount, currency, company: null, contact: null, owner: ines.id }, occurredAt } as never, POST);

test("amount and number of deals won in the cycle follow what Clients tells", async () => {
  const { sql } = w.database;
  const { cycle } = await running(w);
  const o = await createObjective(sql, admin, {
    cycleId: cycle.id, level: "company", title: "Grow revenue",
    keyResults: [
      { title: "Revenue from new deals", source: "crm.won_amount", start: "0", target: "50000", owner: ines.id },
      { title: "Deals won", source: "crm.won_count", unit: "deal/deals", start: "0", target: "10", owner: ines.id },
    ],
  });
  const [amount, count] = o.keyResults;
  const read = async () => (await objectiveById(sql, o.id, clockAt(), null))!.keyResults.map(k => [k.kind, k.source, k.current]);
  assert.deepEqual(await read(), [["money", "crm.won_amount", 0], ["number", "crm.won_count", 0]]);
  assert.equal(await won("D-1", 1250050), 204);
  assert.equal(await won("D-2", 300000), 204);
  // Another currency is not added to euros; it is a deal won all the same.
  assert.equal(await won("D-3", 99900, undefined, "USD"), 204);
  // Won before the cycle began: not counted.
  assert.equal(await won("D-old", 500000, "2020-01-15T10:00:00Z"), 204);
  assert.deepEqual(await read(), [["money", "crm.won_amount", 15500.5], ["number", "crm.won_count", 3]]);
  // Won again (the same deal, a new amount) replaces it; reopened, it no longer counts.
  assert.equal(await won("D-2", 400000), 204);
  assert.equal(await w.chest.deliver({ type: "crm.deal.reopened", data: { deal: "D-1" } } as never, POST), 204);
  assert.deepEqual(await read(), [["money", "crm.won_amount", 4000], ["number", "crm.won_count", 2]]);
  // Nonsense is accepted and ignored.
  assert.equal(await w.chest.deliver({ type: "crm.deal.won", data: { deal: "bad ref!", amount: "lots" } } as never, POST), 204);
  // The owner's check-in keeps the CRM's value, whatever is typed, and says how sure they are.
  const done = await checkIn(sql, inesM, amount!.id, { value: "999999", confidence: "at_risk" });
  assert.equal(done.value, 4000);
  assert.equal((await checkIns(sql, [amount!.id])).get(amount!.id)![0]!.value, 4000);
  // Typed by hand again: the value stays until the owner checks in.
  await updateKeyResult(sql, admin, count!.id, { source: "manual" });
  assert.equal((await objectiveById(sql, o.id, clockAt(), null))!.keyResults[1]!.source, null);
  await assert.rejects(updateKeyResult(sql, admin, count!.id, { source: "crm.lost" }), refused("invalid"));
  await sql`delete from cycles`;
  await sql`delete from teams`;
});
