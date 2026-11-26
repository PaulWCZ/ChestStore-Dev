import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { connect } from "@argentic/chest-sdk/realtime/client";
import { addComment } from "../src/lib/comments.ts";
import { readerFor } from "../src/lib/groups.ts";
import { addKeyResult, checkIn, updateKeyResult } from "../src/lib/key-results.ts";
import { erase } from "../src/lib/lifecycle.ts";
import { admit } from "../src/lib/live.ts";
import { createObjective, updateObjective } from "../src/lib/objectives.ts";
import { objectiveById } from "../src/lib/read.ts";
import { stamp } from "../src/lib/stamp.ts";
import { clockAt } from "../src/lib/tell.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, sofia } from "./support/members.ts";
import { server, type Server } from "./support/server.ts";
import { running, world, type World } from "./support/world.ts";

// What every member sees is fed on "objective:everyone"; a confidential
// objective and what belongs to it on "objective:<id>", joined only by who
// sees it, through the table objective_live (chest.json's "join",
// src/lib/live.ts, migration 0009).

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "chest.json"), "utf8"));
// Who is in objective_live, as the Chest reads it at each join (a snapshot
// the tests take after Goals wrote it: the fake's check is synchronous).
let tickets = new Set<string>();
const snapshot = async () => {
  tickets = new Set((await w.database.sql<{ objective_key: string; member_id: string }[]>`select objective_key, member_id from objective_live`).map(r => `${r.objective_key}|${r.member_id}`));
};
let w: World;
let POST: Server;
before(async () => { w = await world({ membership: (table, key, member) => table === "objective_live" && tickets.has(`${key}|${member}`) }); POST = await server(); });
after(async () => { await w.close(); });

const rows = async (key: string) => (await w.database.sql<{ member_id: string }[]>`select member_id from objective_live where objective_key = ${key} order by member_id`).map(r => r.member_id);
const keyOf = async (table: "objectives" | "key_results" | "comments" | "check_ins", id: string) => (await w.database.sql.unsafe<{ live_key: string }[]>(`select live_key from ${table} where id = $1`, [id]))[0]!.live_key;

test("chest.json: one channel pattern, joined through objective_live; every feed on objective:{live_key}, ids only", () => {
  assert.deepEqual(manifest.realtime.channels, [{ name: "objective:{key}", join: { table: "objective_live", key: "objective_key", member: "member_id" } }]);
  assert.deepEqual(manifest.realtime.feeds.map((f: { table: string }) => f.table), ["objectives", "key_results", "check_ins", "comments"]);
  for (const feed of manifest.realtime.feeds) assert.deepEqual([feed.channel, feed.columns], ["objective:{live_key}", ["id"]]);
});

test("a confidential objective's rows go to its own channel, joined only by who sees it; every change of who sees it takes them out", async () => {
  const { sql } = w.database;
  const { cycle } = await running(w);
  const reader = async (who: typeof ines) => readerFor(asMember(who));
  // Camille's confidential objective: Inès holds a key result, Hugo is among its people; Sofia sees nothing.
  const secret = await createObjective(sql, asMember(camille), {
    cycleId: cycle.id, level: "company", title: "Acquire Bois & Co", visibility: "people", viewers: [hugo.id],
    keyResults: [{ title: "Term sheet", kind: "milestone", owner: ines.id }],
  });
  const open = await createObjective(sql, asMember(camille), { cycleId: cycle.id, level: "company", title: "Open a shop", keyResults: [{ title: "Lease", kind: "milestone", owner: ines.id }] });
  const kr = secret.keyResults[0]!;
  const done = await checkIn(sql, asMember(ines), kr.id, { value: "1", confidence: "on_track", note: "" });
  const { comment } = await addComment(sql, asMember(hugo), secret.id, "Careful with the dates");
  // Its rows and what belongs to it carry its id; the open one's, "everyone".
  assert.equal(await keyOf("objectives", secret.id), secret.id);
  assert.equal(await keyOf("key_results", kr.id), secret.id);
  assert.equal(await keyOf("comments", comment.id), secret.id);
  assert.equal(await keyOf("check_ins", done.id), secret.id);
  assert.equal(await keyOf("objectives", open.id), "everyone");
  assert.equal(await keyOf("key_results", open.keyResults[0]!.id), "everyone");
  // The pages let in who they checked.
  assert.equal(await objectiveById(sql, secret.id, clockAt(), await reader(sofia)), null, "Sofia does not see it");
  for (const who of [camille, ines, hugo, sofia]) {
    const o = await objectiveById(sql, secret.id, clockAt(), await reader(who));
    await admit(sql, asMember(who), o ? [o] : []);
  }
  assert.deepEqual(await rows(secret.id), [camille.id, hugo.id, ines.id].sort());
  assert.deepEqual(await rows("everyone"), [camille.id, hugo.id, ines.id, sofia.id].sort());
  await snapshot();
  const screens = [sofia, hugo].map(m => connect({ url: w.chest.realtime.url(m.id) }));
  try {
    const outcome = (screen: ReturnType<typeof connect>, channel: string) => new Promise<string>(resolve => {
      const ch = screen.channel(channel);
      ch.onJoined(() => resolve("joined"));
      ch.onRefused(code => resolve(code));
    });
    assert.equal(await outcome(screens[0]!, `objective:${secret.id}`), "forbidden", "Sofia is refused: nothing of an objective she cannot see");
    assert.equal(await outcome(screens[0]!, "objective:everyone"), "joined");
    assert.equal(await outcome(screens[1]!, `objective:${secret.id}`), "joined", "Hugo, among its people, joins");
  } finally {
    for (const screen of screens) screen.close();
  }
  const mark = (await admit(sql, asMember(hugo), [{ id: secret.id, visibility: "people" }])).find(f => f.channel === `objective:${secret.id}`)!.ticket;
  // Its people change: those taken off go (the others are let in again at their next read).
  await updateObjective(sql, asMember(camille), secret.id, { visibility: "people", viewers: [] });
  assert.deepEqual(await rows(secret.id), [camille.id, ines.id].sort());
  // Its key result changes hands: everyone is checked again.
  await updateKeyResult(sql, asMember(camille), kr.id, { title: "Term sheet", kind: "milestone", owner: sofia.id });
  assert.deepEqual(await rows(secret.id), []);
  await admit(sql, asMember(sofia), [{ id: secret.id, visibility: "people" }]);
  await addKeyResult(sql, asMember(camille), secret.id, { title: "Due diligence", kind: "milestone", owner: camille.id });
  assert.deepEqual(await rows(secret.id), [sofia.id], "a new key result takes nobody out");
  // A member's groups or role change (member.updated): their rows go; a name does not.
  const deliver = async (changed: string[], who = sofia) => assert.equal(await w.chest.deliver({ type: "member.updated", data: { id: who.id, changed } } as never, POST), 204);
  await deliver(["name"]);
  assert.deepEqual(await rows("everyone"), [camille.id, hugo.id, ines.id, sofia.id].sort());
  await deliver(["groups"]);
  assert.deepEqual(await rows(secret.id), []);
  assert.ok(!(await rows("everyone")).includes(sofia.id));
  await deliver(["role"], hugo);
  assert.ok(!(await rows("everyone")).includes(hugo.id));
  // Made for everyone: its readers go, its rows move to "everyone", and both channels are told to read again.
  await admit(sql, asMember(camille), [{ id: secret.id, visibility: "people" }]);
  const from = w.chest.realtime.published.length;
  await updateObjective(sql, asMember(camille), secret.id, { visibility: "everyone" });
  assert.deepEqual(await rows(secret.id), []);
  assert.equal(await keyOf("key_results", kr.id), "everyone");
  assert.equal(await keyOf("check_ins", done.id), "everyone");
  assert.deepEqual(w.chest.realtime.published.slice(from).filter(p => p.event === "goals.changed").map(p => p.channel).sort(), ["objective:everyone", `objective:${secret.id}`].sort());
  // Confidential again: its rows come back to its own channel.
  await updateObjective(sql, asMember(camille), secret.id, { visibility: "people", viewers: [] });
  assert.equal(await keyOf("comments", comment.id), secret.id);
  // A new mark each time a reader is let in again.
  assert.notEqual((await admit(sql, asMember(camille), [{ id: secret.id, visibility: "people" }])).find(f => f.channel === `objective:${secret.id}`)!.ticket, mark);
  // Leaving, erasure: out of everything.
  await admit(sql, asMember(ines), []);
  assert.equal(await w.chest.deliver({ type: "access.revoked", data: { id: ines.id } } as never, POST), 204);
  assert.ok(!(await rows("everyone")).includes(ines.id));
  await erase(sql, camille.id);
  assert.equal((await sql`select 1 from objective_live where member_id = ${camille.id}`).length, 0);
  assert.equal((await sql`select 1 from live_out where member_id = ${camille.id}`).length, 0, "their id goes from the count too");
});

test("a page's version counts its reader's exits: taken out, the page is read again (never a 304); let in, nothing changes", async () => {
  const { sql } = w.database;
  const before = await stamp(sql, asMember(sofia));
  await admit(sql, asMember(sofia), []);
  assert.equal(await stamp(sql, asMember(sofia)), before, "let in: the same version (a first read then a 304)");
  await sql`delete from objective_live where member_id = ${sofia.id}`;
  assert.notEqual(await stamp(sql, asMember(sofia)), before);
});
