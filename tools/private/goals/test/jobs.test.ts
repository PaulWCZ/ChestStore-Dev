import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { checkIn } from "../src/lib/key-results.ts";
import { refreshBadges } from "../src/lib/tell.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, seen } from "./support/members.ts";
import { server, type Server } from "./support/server.ts";
import { companyObjective, running, world, type World } from "./support/world.ts";

let w: World;
let POST: Server;
before(async () => { w = await world(); POST = await server(); });
after(async () => { await w.close(); });

test("Friday's reminder: one bell item per owner still waiting, in their language, replaced not repeated; the tile says how many", async () => {
  const { sql } = w.database;
  const { cycle } = await running(w);
  const company = await companyObjective(w, cycle.id);
  // Both key results were set before this week.
  await sql`update key_results set created_at = now() - interval '10 days'`;
  assert.equal(await w.chest.run("reminder", POST), 204);
  assert.equal(await w.chest.run("reminder", POST), 204);
  const items = w.chest.notifications.filter(n => n.key === "checkin").sort((a, b) => b.member.localeCompare(a.member));
  assert.deepEqual(items.map(n => [n.member, seen(n).title, seen(n).body, n.path]), [
    [ines.id, "1 résultat clé attend votre point de la semaine", "Customers signed", "/chest"],
    [hugo.id, "1 key result waits for your weekly update", "Website live", "/chest"],
  ]);
  assert.equal(w.chest.badges.get(ines.id), 1);
  assert.equal(w.chest.badges.get(hugo.id), 1);
  assert.equal(w.chest.badges.get(camille.id), undefined);
  // Inès checks in: her number goes to 0, her reminder away.
  await checkIn(sql, asMember(ines), company.keyResults[0]!.id, { value: "5", confidence: "on_track" });
  await refreshBadges(sql, [ines.id]);
  assert.equal(w.chest.badges.get(ines.id), undefined);
  assert.deepEqual(w.chest.notifications.filter(n => n.key === "checkin").map(n => n.member), [hugo.id]);
});

test("Monday's run sets every tile for the new week; a run not signed by the Chest is refused", async () => {
  assert.equal(await w.chest.run("week", POST), 204);
  assert.equal(w.chest.badges.get(hugo.id), 1);
  const response = await POST(new Request("http://tool.test/chest-schedules", { method: "POST", body: JSON.stringify({ id: "run_x", name: "week", scheduledAt: new Date().toISOString(), attempt: 1 }) }));
  assert.equal(response.status, 401);
});
