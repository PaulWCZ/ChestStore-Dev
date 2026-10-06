import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as deals from "../src/lib/deals.ts";
import { AppError } from "../src/lib/errors.ts";
import { en } from "../src/i18n/en.ts";
import { fr } from "../src/i18n/fr.ts";
import { stageName } from "../src/shared/model.ts";
import * as stages from "../src/lib/stages.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ network: {}, members: everyone });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("the default stages speak each reader's language, with their probability", async () => {
  const list = await stages.listStages(database.sql);
  assert.deepEqual(list.map(s => stageName(s, en.stages)), ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]);
  assert.deepEqual(list.map(s => stageName(s, fr.stages)), ["Piste", "Qualifiée", "Proposition", "Négociation", "Gagnée", "Perdue"]);
  assert.deepEqual(list.map(s => s.probability), [10, 25, 50, 75, 100, 0]);
});

test("a manager renames, orders, adds and removes stages; nobody else does", async () => {
  const { sql } = database;
  const [lead, qualified] = await stages.listStages(sql);
  await assert.rejects(stages.updateStage(sql, asMember(hugo), lead!.id, { name: "Prospect" }), refused("forbidden"));
  await stages.updateStage(sql, asMember(camille), lead!.id, { name: "Prospect", probability: "5" });
  assert.equal((await stages.stage(sql, lead!.id)).name, "Prospect");
  await assert.rejects(stages.updateStage(sql, asMember(camille), lead!.id, { probability: 120 }), refused("invalid"));
  await stages.updateStage(sql, asMember(camille), lead!.id, { name: "" }); // back to its own words
  assert.equal((await stages.stage(sql, lead!.id)).name, null);
  const demo = await stages.addStage(sql, asMember(camille), { name: "Demo done", probability: 60 });
  let names = (await stages.listStages(sql)).map(s => stageName(s, en.stages));
  assert.deepEqual(names, ["Lead", "Qualified", "Proposal", "Negotiation", "Demo done", "Won", "Lost"]);
  await stages.moveStage(sql, asMember(camille), demo.id, "up");
  await stages.moveStage(sql, asMember(camille), demo.id, "up");
  names = (await stages.listStages(sql)).map(s => stageName(s, en.stages));
  assert.deepEqual(names, ["Lead", "Qualified", "Demo done", "Proposal", "Negotiation", "Won", "Lost"]);
  await stages.moveStage(sql, asMember(camille), lead!.id, "down");
  assert.equal(stageName((await stages.listStages(sql))[0]!, en.stages), "Qualified");
  // A stage holding a deal stays; the end stages always stay.
  const d = await deals.addDeal(sql, asMember(hugo), { title: "Held", stage: qualified!.id });
  await assert.rejects(stages.removeStage(sql, asMember(camille), qualified!.id), refused("stage_in_use"));
  const won = (await stages.listStages(sql)).find(s => s.kind === "won")!;
  await assert.rejects(stages.removeStage(sql, asMember(camille), won.id), refused("invalid"));
  await deals.deleteDeal(sql, asMember(hugo), d.id);
  await stages.removeStage(sql, asMember(camille), demo.id);
  assert.equal((await stages.listStages(sql)).length, 6);
});
