import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-jobs/[name]/route.ts";
import * as b from "../lib/booking.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, ines } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["database", "members", "notifications", "mail"], mail: {}, schedules: [{ name: "reminders", cron: "5 * * * *" }, { name: "cleanup", cron: "40 3 * * *" }] });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("the hourly run emails tomorrow's guests once, in the language they booked in, with their link", async () => {
  const { sql } = database;
  const host = await b.ensureHost(sql, asMember(ines), { title: "Meeting", slug: "meeting" });
  await b.saveWeekly(sql, asMember(ines), Array.from({ length: 7 }, () => [[0, 1440]]));
  const [type] = await b.typesOf(sql, ines.id);
  const tomorrow = new Date(Date.now() + 20 * 3600000);
  const day = tomorrow.toISOString().slice(0, 10);
  const free = await b.freeTimes(sql, { ...host, weekly: Array.from({ length: 7 }, () => [[0, 1440]]) }, type!, day, day);
  const start = free.find(s => Date.parse(s.start) > Date.now() + 4 * 3600000 && Date.parse(s.start) < Date.now() + 25 * 3600000)!.start;
  const { booking, secret } = await b.book(sql, { ...host, weekly: Array.from({ length: 7 }, () => [[0, 1440]]) }, type!, { start, name: "Alex", email: "alex@example.com", note: "", zone: "Europe/Paris", language: "fr" });
  await sql`update bookings set created_at = now() - interval '7 days' where id = ${booking.id}`;
  assert.equal(await chest.run("reminders", POST), 204);
  assert.equal(await chest.run("reminders", POST), 204);
  const sent = chest.outbox.filter(m => m.to.includes("alex@example.com"));
  assert.equal(sent.length, 1);
  assert.match(sent[0]!.subject, /^Demain : Meeting avec Inès Moreau/u);
  assert.ok(sent[0]!.text.includes(`/b/${secret}`));
});

test("the nightly run is accepted, and a run not signed by the Chest is refused", async () => {
  assert.equal(await chest.run("cleanup", POST), 204);
  const response = await POST(new Request("http://tool.test/chest-jobs/cleanup", { method: "POST" }));
  assert.equal(response.status, 401);
});
