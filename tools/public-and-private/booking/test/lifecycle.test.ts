import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import * as b from "../lib/booking.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { openHost } from "./support/host.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["database", "members", "notifications", "mail"], mail: {} });
});
after(async () => {
  await chest.close();
  await database.close();
});

const first = { title: "Meeting", slug: "meeting" };
const soon = () => {
  const d = new Date(Date.now() + 3 * 86400000);
  return d.toISOString().slice(0, 10);
};

async function bookSomething(who: typeof ines) {
  const sql = database.sql;
  await openHost(sql, asMember(who), first);
  // Every day open all day, no notice: a time is always free.
  await b.saveWeekly(sql, asMember(who), Array.from({ length: 7 }, () => [[0, 1440]]));
  const [type] = await b.typesOf(sql, who.id);
  const again = (await b.hostOf(sql, who.id))!;
  const free = await b.freeTimes(sql, again, type!, soon(), soon());
  return (await b.book(sql, again, type!, { start: free[0]!.start, name: "Alex", email: "alex@example.com", note: "", zone: "Europe/Paris", language: "en" })).booking;
}

test("leaving: the page takes no new booking; the bookings stay; access given again brings the page back", async () => {
  const { sql } = database;
  const made = await bookSomething(hugo);
  const event = { type: "member.removed" as const, id: "evt_" + "c".repeat(26), data: { id: hugo.id } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await b.publicHost(sql, "hugo-bernard"), null);
  assert.equal((await b.bookingsByIds(sql, [made.id]))[0]!.status, "confirmed");
  await openHost(sql, asMember(hugo), first);
  assert.ok(await b.publicHost(sql, "hugo-bernard"));
});

test("an erasure deletes the page, cancels future meetings, tells each guest, and is acknowledged once", async () => {
  const { sql } = database;
  const made = await bookSomething(ines);
  const erasure = "era_" + "a".repeat(26);
  const event = { type: "member.erased" as const, id: "evt_" + "b".repeat(26), data: { id: ines.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await b.hostOf(sql, ines.id), null);
  const [after] = await b.bookingsByIds(sql, [made.id]);
  assert.equal(after!.status, "cancelled");
  assert.equal(after!.memberId, "erased");
  assert.deepEqual(chest.acknowledged, [erasure]);
  assert.equal(chest.outbox.filter(m => m.to.includes("alex@example.com")).length, 1);
  void camille;
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});
