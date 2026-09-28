import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import * as balances from "../lib/balances.ts";
import * as requests from "../lib/requests.ts";
import { types } from "../lib/rules.ts";
import { setApprover, staffRow } from "../lib/staff.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { addDays } from "../lib/calendar.ts";
import { quietMonday, week } from "./support/dates.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, hugo, ines, tom, lea } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
let paid: string;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, groups: fakeGroups });
  paid = (await types(database.sql)).find(t => t.key === "paid")!.id;
});
after(async () => {
  await chest.close();
  await database.close();
});

test("someone who leaves: their waiting requests are cancelled, their approved leave stays, their people go back to HR", async () => {
  const { sql } = database;
  await setApprover(sql, asMember(camille), hugo.id, ines.id);
  const monday = quietMonday(20);
  const approved = await requests.createRequest(sql, asMember(ines), { typeId: paid, ...week(monday) });
  await requests.decide(sql, asMember(camille), approved.id, { verdict: "approve" });
  const waiting = await requests.createRequest(sql, asMember(ines), { typeId: paid, ...week(addDays(monday, 21)) });
  assert.equal(await chest.emit({ type: "member.removed", data: { id: ines.id } }, POST), 204);
  assert.equal((await requests.request(sql, asMember(camille), waiting.id)).status, "cancelled");
  assert.equal((await requests.request(sql, asMember(camille), approved.id)).status, "approved");
  assert.deepEqual((await requests.history(sql, asMember(camille), waiting.id)).map(s => [s.kind, s.actor]), [["asked", ines.id], ["left", "chest"]]);
  assert.equal((await staffRow(sql, hugo.id)).approverId, null);
  // Delivered again: nothing changes.
  assert.equal(await chest.emit({ type: "access.revoked", data: { id: ines.id } }, POST), 204);
});

test("an erasure: the person disappears, the days of HR's records stay, signed 'erased'; acknowledged once", async () => {
  const { sql } = database;
  await setApprover(sql, asMember(camille), tom.id, lea.id);
  const monday = quietMonday(80);
  const r = await requests.createRequest(sql, asMember(tom), { typeId: paid, ...week(monday), note: "Wedding in Lyon" });
  await requests.decide(sql, asMember(lea), r.id, { verdict: "approve", reason: "Congratulations Tom" });
  await balances.adjust(sql, asMember(camille), { memberId: tom.id, typeId: paid, days: 2, reason: "Tom's seniority days" });
  const erasure = "era_" + "c".repeat(26);
  const event = { type: "member.erased" as const, id: "evt_" + "d".repeat(26), data: { id: tom.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  const [row] = await sql`select member_id, note, reason, days::float as days, status from requests where id = ${r.id}`;
  assert.deepEqual({ ...row }, { member_id: "erased", note: null, reason: null, days: 5, status: "approved" });
  const lines = await sql`select member_id, kind, days::float as days, reason from ledger where request_id = ${r.id} or reason is null and member_id = 'erased' order by id`;
  assert.ok(lines.length >= 2 && lines.every(l => l["member_id"] === "erased" && l["reason"] === null));
  assert.equal((await sql`select count(*)::int as n from ledger where member_id = ${tom.id} or created_by = ${tom.id}`)[0]!["n"], 0);
  assert.equal((await sql`select count(*)::int as n from request_events where actor = ${tom.id}`)[0]!["n"], 0);
  assert.equal((await sql`select count(*)::int as n from staff where member_id = ${tom.id}`)[0]!["n"], 0);
  assert.deepEqual(chest.acknowledged, [erasure]);
  // The erased person's leave no longer shows on the calendar.
  assert.ok(!(await requests.between(sql, asMember(camille), monday, addDays(monday, 5))).some(e => e.id === r.id));
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});
