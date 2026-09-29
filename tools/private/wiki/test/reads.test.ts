import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import * as members from "@argentic/chest-sdk/members";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import { normalize } from "../lib/doc.ts";
import * as editing from "../lib/editing.ts";
import { fromMarkdown } from "../lib/markdown.ts";
import * as pages from "../lib/pages.ts";
import * as reads from "../lib/reads.ts";
import * as spaces from "../lib/spaces.ts";
import * as tell from "../lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, groups, hugo, ines, lea, nora, tom } from "./support/members.ts";

// "Read and acknowledged": editors ask a page's readers to confirm they
// read it; each confirms the version they read; editors see who did, and
// download it.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(() => {
  chest.notifications.splice(0);
  members.forget();
});

async function policy(title = "Règlement intérieur") {
  const s = await spaces.createSpace(database.sql, asMember(camille), { name: "Rules " + Math.random() });
  const p = await pages.createPage(database.sql, asMember(camille), { spaceId: s.id, title });
  return { s, p };
}

test("editors ask everyone who reads the space; each is told once, confirms, and the item goes", async () => {
  const { sql } = database;
  const { p } = await policy();
  await assert.rejects(reads.ask(sql, asMember(hugo), p.id, {}), /forbidden/u);
  await assert.rejects(reads.confirm(sql, asMember(hugo), p.id), /invalid/u);
  const page = await reads.ask(sql, asMember(camille), p.id, {});
  const state = await reads.readState(sql, asMember(camille), p.id);
  assert.equal(state.concerned, false); // whoever asks is not asked
  const told = await tell.readAsked(asMember(camille), page, state.asked!);
  // Everyone with a role but Camille: Inès, Tom, Hugo, Léa (Nora has no role).
  assert.equal(told, 4);
  assert.deepEqual(chest.notifications.map(n => n.member).sort(), [ines.id, tom.id, hugo.id, lea.id].sort());
  assert.ok(chest.notifications.every(n => n.key === `read:${p.id}`));
  assert.ok(chest.notifications.find(n => n.member === lea.id)!.title.startsWith("Camille Martin vous demande de lire"));
  // Hugo sees it on his home page, confirms version 1; it leaves his home page and his bell.
  assert.deepEqual((await reads.toRead(sql, asMember(hugo))).map(r => r.id), [p.id]);
  assert.deepEqual(await reads.confirm(sql, asMember(hugo), p.id), { version: 1 });
  await tell.readSettled(p.id, [hugo.id]);
  assert.equal(chest.notifications.filter(n => n.member === hugo.id).length, 0);
  assert.deepEqual(await reads.toRead(sql, asMember(hugo)), []);
  const hugoNow = await reads.readState(sql, asMember(hugo), p.id);
  assert.equal(hugoNow.mine?.version, 1);
  // Nora (no role) cannot confirm: she cannot read it.
  await assert.rejects(reads.confirm(sql, asMember(nora), p.id), /not_found/u);
  // The report: one confirmed, three not yet (first).
  const r = await reads.report(sql, asMember(camille), p.id);
  assert.equal(r.rows.length, 4);
  assert.equal(r.rows.at(-1)!.memberId, hugo.id);
  assert.equal(r.rows.filter(x => x.current).length, 1);
  await assert.rejects(reads.report(sql, asMember(hugo), p.id), /forbidden/u);
});

test("the page changes: asked again, earlier confirmations count as an older version", async () => {
  const { sql } = database;
  const { p } = await policy("Charte télétravail");
  await reads.ask(sql, asMember(camille), p.id, {});
  await reads.confirm(sql, asMember(tom), p.id);
  await editing.startEditing(sql, asMember(camille), p.id);
  await editing.publish(sql, asMember(camille), p.id, { title: "Charte télétravail", doc: normalize(fromMarkdown("Deux jours par semaine.")), baseVersion: 1 });
  // Still asked about version 1: Tom is done.
  assert.equal((await reads.report(sql, asMember(camille), p.id)).rows.find(x => x.memberId === tom.id)?.current, true);
  await reads.ask(sql, asMember(camille), p.id);
  const again = await reads.report(sql, asMember(camille), p.id);
  assert.equal(again.ask.version, 2);
  const row = again.rows.find(x => x.memberId === tom.id)!;
  assert.deepEqual([row.version, row.current], [1, false]);
  assert.ok((await reads.toRead(sql, asMember(tom))).some(x => x.id === p.id));
  await reads.confirm(sql, asMember(tom), p.id);
  assert.equal((await reads.report(sql, asMember(camille), p.id)).rows.find(x => x.memberId === tom.id)?.version, 2);
  // Stopping: nobody is asked; what was confirmed stays.
  await reads.stopAsking(sql, asMember(camille), p.id);
  assert.equal((await reads.readState(sql, asMember(tom), p.id)).asked, null);
  assert.equal((await reads.readState(sql, asMember(tom), p.id)).mine?.version, 2);
  await assert.rejects(reads.confirm(sql, asMember(tom), p.id), /invalid/u);
});

test("asked of some groups only; the table's cells never run as a spreadsheet formula", async () => {
  const { sql } = database;
  const { p } = await policy("=HYPERLINK(\"x\") Sales rules");
  await reads.ask(sql, asMember(camille), p.id, { groups: [groups.sales] });
  await assert.rejects(reads.ask(sql, asMember(camille), p.id, { groups: ["grp_bad"] }), /invalid/u);
  assert.equal((await reads.readState(sql, asMember(hugo), p.id)).concerned, true); // sales
  assert.equal((await reads.readState(sql, asMember(lea), p.id)).concerned, false); // tech
  await assert.rejects(reads.confirm(sql, asMember(lea), p.id), /invalid/u);
  await reads.confirm(sql, asMember(ines), p.id);
  const rows = (await reads.report(sql, asMember(camille), p.id)).rows;
  assert.deepEqual(rows.map(r => r.memberId).sort(), [ines.id, hugo.id].sort());
  assert.equal(reads.csvCell("=1+1"), "\"'=1+1\"");
  assert.equal(reads.csvCell("Say \"hi\""), "\"Say \"\"hi\"\"\"");
});

test("an erasure removes a person's confirmations and signs the request 'erased'", async () => {
  const { sql } = database;
  const { p } = await policy("Sécurité");
  await reads.ask(sql, asMember(camille), p.id, {});
  await reads.confirm(sql, asMember(lea), p.id);
  const erasure = "era_" + "e".repeat(26);
  const event = { type: "member.erased" as const, id: "evt_" + "f".repeat(26), data: { id: lea.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal((await sql`select count(*)::int as n from page_reads where member_id = ${lea.id}`)[0]!["n"], 0);
  const ev2 = { type: "member.erased" as const, id: "evt_" + "g".repeat(26), data: { id: camille.id, erasure: "era_" + "h".repeat(26), deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(ev2, POST), 204);
  assert.equal((await sql`select read_asked_by from pages where id = ${p.id}`)[0]!["read_asked_by"], "erased");
});
