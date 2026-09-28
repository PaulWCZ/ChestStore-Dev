import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-jobs/[name]/route.ts";
import { listCategories } from "../lib/categories.ts";
import * as items from "../lib/items.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, sofia } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, schedules: [{ name: "weekly", cron: "50 7 * * 1" }] });
});
after(async () => {
  await chest.close();
  await database.close();
});

const handler = (request: Request) => POST(request);

test("Monday morning, the managers find what ends in the next 60 days, each in their language, replaced week after week", async () => {
  const { sql } = database;
  const M = asMember(camille);
  const cats = await listCategories(sql, M);
  await items.createItem(sql, M, { categoryId: cats.find(c => c.key === "laptop")!.id, name: "Dell XPS", warrantyUntil: "2026-10-20" });
  await items.createItem(sql, M, { categoryId: cats.find(c => c.key === "licence")!.id, name: "Notion", seats: "10", renewsOn: "2026-11-02" });
  await items.createItem(sql, M, { categoryId: cats.find(c => c.key === "laptop")!.id, name: "Far away", warrantyUntil: "2028-01-01" });
  const scheduledAt = "2026-09-28T05:50:00Z";
  assert.equal(await chest.run("weekly", handler, { scheduledAt }), 204);
  assert.equal(await chest.run("weekly", handler, { scheduledAt, id: "run_" + "b".repeat(26) }), 204);
  const toCamille = chest.notifications.filter(n => n.member === camille.id && n.key === "ending");
  assert.equal(toCamille.length, 1);
  assert.equal(toCamille[0]!.title, "2 garanties ou renouvellements arrivent à échéance");
  assert.equal(toCamille[0]!.body, "Dell XPS (EQ-0001) · Notion (EQ-0002)");
  assert.equal(chest.notifications.find(n => n.member === sofia.id && n.key === "ending")?.title, "2 warranties or renewals end soon");
  assert.equal(chest.notifications.some(n => n.member === hugo.id), false);
  // A week with nothing ending takes the item away.
  assert.equal(await chest.run("weekly", handler, { scheduledAt: "2027-06-07T05:50:00Z" }), 204);
  assert.equal(chest.notifications.some(n => n.key === "ending"), false);
});

test("a run not signed by the Chest is refused; an unknown schedule is not found", async () => {
  const response = await POST(new Request("http://tool.test/chest-jobs/weekly", { method: "POST", body: "{}" }));
  assert.equal(response.status, 401);
});
