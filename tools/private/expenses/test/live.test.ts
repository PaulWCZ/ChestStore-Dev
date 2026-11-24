import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import * as events from "@argentic/chest-sdk/events";
import { connect } from "@argentic/chest-sdk/realtime/client";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as expenses from "../src/lib/expenses.ts";
import { erase, handlers } from "../src/lib/lifecycle.ts";
import { admit } from "../src/lib/live.ts";
import * as settings from "../src/lib/settings.ts";
import { exits } from "../src/lib/stamp.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, tom } from "./support/members.ts";
import { tool } from "./support/chest.ts";

// "To approve" follows its reader's desk — desk:<approver>, desk:accountants
// — joined only through the table desk_live (chest.json's "join",
// src/lib/live.ts); the feed is desk_events, written by a trigger for the
// expenses sent (migration 0008), never a draft's.

// Who is in desk_live, as the Chest reads it at each join (a snapshot the
// tests take after the tool wrote it: the fake's check is synchronous).
let tickets = new Set<string>();
const snapshot = async () => {
  tickets = new Set((await database.sql<{ desk_key: string; member_id: string }[]>`select desk_key, member_id from desk_live`).map(r => `${r.desk_key}|${r.member_id}`));
};
let database: TestDatabase;
let chest: FakeChest;
const cat: Record<string, string> = {};
const yes = async () => true;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ ...tool, members: everyone, network: {}, chest: { publicUrl: null }, realtime: { ...tool.realtime, membership: (table, key, member) => table === "desk_live" && tickets.has(`${key}|${member}`) } });
  for (const r of await database.sql<{ id: string; key: string }[]>`select id, key from categories`) cat[r.key] = String(r.id);
});
after(async () => {
  await chest.close();
  await database.close();
});
const POST = async (request: Request) => new Response(null, { status: await events.handle(request, handlers(database.sql)) });
const lunch = (): expenses.ExpenseInput => ({ spentOn: "2026-09-10", amount: "42,50", categoryId: cat["meals"], merchant: "Chez Paul", paidBy: "me" });
const desks = async (expenseId: string) => (await database.sql<{ desk_key: string }[]>`select distinct desk_key from desk_events where expense_id = ${expenseId} order by desk_key`).map(r => r.desk_key);

test("chest.json: the desks are joined through desk_live and fed by desk_events only; expenses is never fed", () => {
  assert.deepEqual(tool.realtime, {
    channels: [{ name: "mine:{member}" }, { name: "desk:{key}", join: { table: "desk_live", key: "desk_key", member: "member_id" } }],
    feeds: [{ table: "desk_events", channel: "desk:{desk_key}", columns: ["id"] }],
  });
});

test("a draft reaches no desk; sent, its approver's and the accountants'; taken back, both hear it leave", async () => {
  const { sql } = database;
  await settings.setApprover(sql, asMember(camille), hugo.id, ines.id, yes);
  const { expense: draft } = await expenses.saveExpense(sql, asMember(hugo), null, lunch());
  await expenses.saveExpense(sql, asMember(hugo), draft.id, { ...lunch(), merchant: "Chez Pierre" });
  assert.deepEqual(await desks(draft.id), [], "nobody hears of a draft, written twice");
  await expenses.submit(sql, asMember(hugo), [draft.id], yes);
  assert.deepEqual(await desks(draft.id), ["accountants", ines.id].sort(), "Tom, another approver, never");
  await sql`delete from desk_events`;
  await expenses.retract(sql, asMember(hugo), draft.id);
  assert.deepEqual(await desks(draft.id), ["accountants", ines.id].sort(), "back to a draft: the desks it left are told");
  await sql`delete from desk_events`;
  await expenses.saveExpense(sql, asMember(hugo), draft.id, lunch());
  assert.deepEqual(await desks(draft.id), []);
});

test("a desk's channel: only its approver and the accountants join; a role change, a departure or an erasure take them out", async () => {
  const { sql } = database;
  const mine = await admit(sql, asMember(ines));
  assert.deepEqual(mine.map(f => f.channel), [`desk:${ines.id}`]);
  assert.equal((await admit(sql, asMember(ines)))[0]!.ticket, mine[0]!.ticket, "let in once: the same mark");
  assert.deepEqual((await admit(sql, asMember(camille))).map(f => f.channel), ["desk:accountants"]);
  assert.deepEqual(await admit(sql, asMember(hugo)), [], "an employee has no desk");
  await admit(sql, asMember(tom));
  await snapshot();
  const screens = [tom, hugo, ines].map(m => connect({ url: chest.realtime.url(m.id) }));
  try {
    const outcome = (screen: ReturnType<typeof connect>, channel: string) => new Promise<string>(resolve => {
      const ch = screen.channel(channel);
      ch.onJoined(() => resolve("joined"));
      ch.onRefused(code => resolve(code));
    });
    assert.equal(await outcome(screens[0]!, `desk:${ines.id}`), "forbidden", "Tom, another approver, is refused");
    assert.equal(await outcome(screens[1]!, "desk:accountants"), "forbidden", "Hugo is refused");
    assert.equal(await outcome(screens[2]!, `desk:${ines.id}`), "joined", "Inès joins her own desk");
  } finally {
    for (const screen of screens) screen.close();
  }
  const rows = async () => (await sql<{ member_id: string }[]>`select member_id from desk_live order by member_id`).map(r => r.member_id);
  assert.equal(await exits(sql, ines.id), "0");
  assert.equal(await chest.deliver({ type: "member.updated", data: { id: ines.id, changed: ["name"] } }, POST), 204);
  assert.deepEqual(await rows(), [camille.id, ines.id, tom.id].sort());
  assert.equal(await chest.deliver({ type: "member.updated", data: { id: ines.id, changed: ["role"] } }, POST), 204);
  assert.deepEqual(await rows(), [camille.id, tom.id].sort());
  assert.equal(await exits(sql, ines.id), "1", "her page's version moves: read again, never a 304");
  assert.notEqual((await admit(sql, asMember(ines)))[0]!.ticket, mine[0]!.ticket, "let in again: a new mark");
  assert.equal(await chest.deliver({ type: "access.revoked", data: { id: ines.id } }, POST), 204);
  assert.equal(await chest.deliver({ type: "member.removed", data: { id: tom.id } }, POST), 204);
  assert.deepEqual(await rows(), [camille.id]);
  await erase(sql, camille.id);
  assert.deepEqual(await rows(), []);
  assert.equal(await exits(sql, camille.id), "0", "their id goes from the count too");
  void lea;
});

test("an approver's erasure leaves no row of their desk: the expenses it moves are told elsewhere, never under their id", async () => {
  const { sql } = database;
  await settings.setApprover(sql, asMember(camille), hugo.id, tom.id, yes);
  const { expense } = await expenses.saveExpense(sql, asMember(hugo), null, lunch());
  await expenses.submit(sql, asMember(hugo), [expense.id], yes);
  assert.ok((await desks(expense.id)).includes(tom.id));
  await erase(sql, tom.id);
  const left = await sql<{ n: number }[]>`select count(*)::int as n from desk_events where desk_key = ${tom.id}`;
  assert.equal(left[0]!.n, 0, "their id goes from desk_events too");
  assert.ok((await desks(expense.id)).includes("accountants"), "the accountants hear the expense came back to them");
});
