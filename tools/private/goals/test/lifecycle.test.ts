import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { POST } from "../app/chest-events/route.ts";
import { addComment } from "../lib/comments.ts";
import { checkIn } from "../lib/key-results.ts";
import { createObjective } from "../lib/objectives.ts";
import { orphans, reassign } from "../lib/orphans.ts";
import { cycleObjectives } from "../lib/read.ts";
import { clockAt, tellAdminsOfOrphans } from "../lib/tell.ts";
import { AppError } from "../lib/app-error.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, sofia } from "./support/members.ts";
import { companyObjective, running, world, type World } from "./support/world.ts";

let w: World;
before(async () => { w = await world(); });
after(async () => { await w.close(); });

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const erasure = "era_" + "a".repeat(26);

test("someone leaves: their goals stay, marked as needing a new owner, and the admins hear of it once", async () => {
  const { sql } = w.database;
  const { cycle, sales } = await running(w);
  const company = await companyObjective(w, cycle.id);
  const kr = company.keyResults[0]!;
  await checkIn(sql, asMember(ines), kr.id, { value: "4", confidence: "on_track", note: "Good start" });
  await createObjective(sql, asMember(ines), { cycleId: cycle.id, level: "team", teamId: sales.id, title: "Sign 12 shops", keyResults: [{ title: "Shops", kind: "number", target: "12" }] });
  assert.deepEqual(await orphans(sql), []);
  // The Chest now reads Inès as a former member.
  w.chest.members.splice(w.chest.members.findIndex(m => m.id === ines.id), 1);
  const event = { type: "member.removed" as const, id: "evt_" + "r".repeat(26), data: { id: ines.id } };
  assert.equal(await w.chest.emit(event, POST), 204);
  assert.equal(await w.chest.emit(event, POST), 204);
  const lost = await orphans(sql);
  assert.deepEqual(lost.map(o => [o.kind, o.title]), [["key_result", "Customers signed"], ["objective", "Sign 12 shops"], ["key_result", "Shops"]]);
  const all = await cycleObjectives(sql, cycle.id, clockAt());
  assert.equal(all.find(o => o.title === "Sign 12 shops")!.owner, ines.id);
  const bell = w.chest.notifications.filter(n => n.key === "orphans");
  assert.deepEqual(bell.map(n => [n.member, n.title]), [[camille.id, "3 objectifs attendent un nouveau responsable"]]);
});

test("an admin hands one goal, or everything someone owned, to someone here; members cannot", async () => {
  const { sql } = w.database;
  const lost = await orphans(sql);
  await assert.rejects(reassign(sql, asMember(hugo), { kind: "all", from: ines.id, to: hugo.id }), refused("forbidden"));
  await assert.rejects(reassign(sql, asMember(camille), { kind: "all", from: ines.id, to: ines.id }), refused("invalid"));
  const one = lost.find(o => o.kind === "objective")!;
  assert.deepEqual(await reassign(sql, asMember(camille), { kind: "objective", id: one.id, to: sofia.id }), { count: 1, to: sofia.id });
  assert.deepEqual(await reassign(sql, asMember(camille), { kind: "all", from: ines.id, to: hugo.id }), { count: 2, to: hugo.id });
  assert.deepEqual(await orphans(sql), []);
  await assert.rejects(reassign(sql, asMember(camille), { kind: "key_result", id: "999999", to: hugo.id }), refused("not_found"));
});

test("an erasure: the person's id goes everywhere, their check-ins and comments stay unsigned; acknowledged once", async () => {
  const { sql } = w.database;
  const [cycle] = await sql<{ id: string }[]>`select id from cycles where current`;
  const company = (await cycleObjectives(sql, String(cycle!.id), clockAt())).find(o => o.level === "company")!;
  await addComment(sql, asMember(hugo), company.id, "I can help with Lyon.");
  const hugoKr = company.keyResults.find(k => k.owner === hugo.id)!;
  await checkIn(sql, asMember(hugo), hugoKr.id, { value: "8", confidence: "at_risk" });
  const event = { type: "member.erased" as const, id: "evt_" + "e".repeat(26), data: { id: hugo.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await w.chest.emit(event, POST), 204);
  assert.equal(await w.chest.emit(event, POST), 204);
  assert.deepEqual(w.chest.acknowledged, [erasure]);
  const tables = ["objectives where owner = $1 or created_by = $1 or retro_by = $1", "key_results where owner = $1 or created_by = $1", "check_ins where author = $1", "comments where author = $1", "cycles where created_by = $1 or closed_by = $1"];
  for (const where of tables) assert.equal((await sql.unsafe(`select count(*)::int as n from ${where}`, [hugo.id]))[0]!.n, 0, where);
  assert.equal((await sql`select count(*)::int as n from comments where author = 'erased'`)[0]!.n, 1);
  assert.equal((await sql`select count(*)::int as n from check_ins where author = 'erased'`)[0]!.n, 1);
  // What Hugo owned now waits for someone.
  assert.ok((await orphans(sql)).every(o => o.owner === "erased") && (await orphans(sql)).length === 3);
  assert.deepEqual(await reassign(sql, asMember(camille), { kind: "all", from: "erased", to: sofia.id }), { count: 3, to: sofia.id });
  // The action that hands over tells the admins again: nothing left, the item goes.
  await tellAdminsOfOrphans(sql);
  assert.equal(w.chest.notifications.some(n => n.key === "orphans"), false);
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});
