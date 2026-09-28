import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-jobs/[name]/route.ts";
import * as requests from "../lib/requests.ts";
import { types } from "../lib/rules.ts";
import { setApprover } from "../lib/staff.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { quietMonday, week } from "./support/dates.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, hugo, ines, sofia } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, groups: fakeGroups, schedules: [{ name: "morning", cron: "30 8 * * 1-5" }] });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("the weekday morning reminds approvers of requests waiting more than two days, in their language; tiles are set", async () => {
  const { sql } = database;
  await setApprover(sql, asMember(camille), hugo.id, ines.id);
  const paid = (await types(sql)).find(t => t.key === "paid")!.id;
  const old = await requests.createRequest(sql, asMember(hugo), { typeId: paid, ...week(quietMonday(30)) });
  await sql`update requests set created_at = now() - interval '3 days' where id = ${old.id}`;
  await requests.createRequest(sql, asMember(sofia), { typeId: paid, ...week(quietMonday(30)) }); // new: no reminder yet
  assert.equal(await chest.run("morning", POST), 204);
  assert.deepEqual(chest.notifications.map(n => [n.member, n.title, n.key, n.path]), [[ines.id, "1 demande attend votre réponse", "reminder", "/chest/approvals"]]);
  assert.equal(chest.badges.get(ines.id), 1);
  assert.equal(chest.badges.get(camille.id), 1); // Sofia's, which goes to HR
  // Delivered again: the same item replaced, not a second one.
  assert.equal(await chest.run("morning", POST), 204);
  assert.equal(chest.notifications.filter(n => n.member === ines.id).length, 1);
});

test("a run not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-jobs/morning", { method: "POST", body: "{}" }));
  assert.equal(response.status, 401);
});
