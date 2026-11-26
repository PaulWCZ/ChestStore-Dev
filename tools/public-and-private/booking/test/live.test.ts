import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { connect } from "@argentic/chest-sdk/realtime/client";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as b from "../src/lib/booking.ts";
import { admit } from "../src/lib/live.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { openHost } from "./support/host.ts";
import { asMember } from "./support/member.ts";
import { builtServer, type Handler } from "./support/server.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

// A host's agenda left open follows "agenda:<host>"; only who may see that
// agenda joins it — the host, an administrator —, through the table
// agenda_live (chest.json's "join", src/lib/live.ts).

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "chest.json"), "utf8"));
// Who is in agenda_live, as the Chest reads it at each join (a snapshot
// the tests take after Booking wrote it: the fake's check is synchronous).
let tickets = new Set<string>();
const snapshot = async () => {
  tickets = new Set((await database.sql<{ host_id: string; member_id: string }[]>`select host_id, member_id from agenda_live`).map(r => `${r.host_id}|${r.member_id}`));
};
const membership = (table: string, key: string, member: string) => table === "agenda_live" && tickets.has(`${key}|${member}`);

let database: TestDatabase;
let chest: FakeChest;
let POST: Handler;
before(async () => {
  database = await testDatabase();
  POST = await builtServer();
  chest = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["database", "members", "notifications", "mail", "realtime"], mail: {}, realtime: { ...manifest.realtime, membership } });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("chest.json: one channel per host's agenda, joined through agenda_live; the feeds carry ids only", () => {
  assert.deepEqual(manifest.realtime.channels, [{ name: "agenda:{host}", join: { table: "agenda_live", key: "host_id", member: "member_id" } }]);
  for (const feed of manifest.realtime.feeds as { table: string; channel: string; columns: string[] }[]) {
    assert.equal(feed.channel, "agenda:{member_id}");
    assert.deepEqual(feed.columns, ["id"]);
  }
});

test("a host's agenda: only the host and administrators join it; a role change, a departure or an erasure takes them out", async () => {
  const { sql } = database;
  await openHost(sql, asMember(hugo), { title: "Meeting", slug: "meeting" });
  await openHost(sql, asMember(ines), { title: "Call", slug: "call" });
  // What each one's page follows, as the agenda page asks it.
  assert.deepEqual(await b.followedHosts(sql, asMember(ines), false), [ines.id], "a host: their own agenda");
  assert.deepEqual(await b.followedHosts(sql, asMember(ines), true), [], "a host has no Everyone view");
  assert.ok((await b.followedHosts(sql, asMember(camille), true)).includes(hugo.id), "an administrator: every host's");
  const [mark] = await admit(sql, [hugo.id], hugo.id);
  assert.equal((await admit(sql, [hugo.id], hugo.id))[0]!.ticket, mark!.ticket, "let in once: the same mark");
  await admit(sql, await b.followedHosts(sql, asMember(ines), false), ines.id);
  await admit(sql, await b.followedHosts(sql, asMember(camille), true), camille.id);
  await snapshot();
  const screens = [ines, camille, hugo].map(m => connect({ url: chest.realtime.url(m.id) }));
  try {
    const outcome = (screen: ReturnType<typeof connect>) => new Promise<string>(resolve => {
      const ch = screen.channel(`agenda:${hugo.id}`);
      ch.onJoined(() => resolve("joined"));
      ch.onRefused(code => resolve(code));
    });
    assert.equal(await outcome(screens[0]!), "forbidden", "Inès, another host, is refused: no event of Hugo's meetings");
    assert.equal(await outcome(screens[1]!), "joined", "Camille, an administrator, joins");
    assert.equal(await outcome(screens[2]!), "joined", "Hugo joins his own");
  } finally {
    for (const screen of screens) screen.close();
  }
  const rows = async () => (await sql<{ member_id: string }[]>`select member_id from agenda_live where host_id = ${hugo.id} order by member_id`).map(r => r.member_id);
  assert.deepEqual(await rows(), [camille.id, hugo.id].sort());
  // Camille's role changes (member.updated): her rows go; a name does not.
  const deliver = async (event: Record<string, unknown>) => assert.equal(await chest.deliver(event as never, POST), 204);
  await deliver({ type: "member.updated", id: "evt_" + "e".repeat(26), data: { id: camille.id, changed: ["name"] } });
  assert.deepEqual(await rows(), [camille.id, hugo.id].sort());
  await deliver({ type: "member.updated", id: "evt_" + "f".repeat(26), data: { id: camille.id, changed: ["role"] } });
  assert.deepEqual(await rows(), [hugo.id]);
  const [again] = await admit(sql, [hugo.id], camille.id);
  assert.ok(again && again.ticket !== "", "let in again at her next read, with a mark of its own");
  // Losing access, leaving: out.
  await deliver({ type: "access.revoked", id: "evt_" + "g".repeat(26), data: { id: camille.id } });
  assert.deepEqual(await rows(), [hugo.id]);
  await admit(sql, [hugo.id], camille.id);
  await deliver({ type: "member.removed", id: "evt_" + "h".repeat(26), data: { id: camille.id } });
  assert.deepEqual(await rows(), [hugo.id]);
  // Hugo is erased: his id goes from the table, as host and as reader.
  await admit(sql, [hugo.id], camille.id);
  await admit(sql, [ines.id], hugo.id);
  const erasure = "era_" + "c".repeat(26);
  await deliver({ type: "member.erased", id: "evt_" + "i".repeat(26), data: { id: hugo.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } });
  assert.equal((await sql`select 1 from agenda_live where host_id = ${hugo.id} or member_id = ${hugo.id}`).length, 0);
  assert.deepEqual(chest.acknowledged, [erasure]);
});

test("admit lets in no id that is not a member's (an erased host's bookings follow nothing)", async () => {
  assert.deepEqual(await admit(database.sql, ["erased"], camille.id), []);
});
