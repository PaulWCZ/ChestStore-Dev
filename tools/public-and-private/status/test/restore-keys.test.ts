import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { addComponent } from "../lib/components.ts";
import * as incidents from "../lib/incidents.ts";
import { flush } from "../lib/mailer.ts";
import * as subs from "../lib/subscribers.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone } from "./support/members.ts";

// Keys built from database ids (sdk/README, "Put the recipient in the
// key", studio.16): the Chest remembers a key a day, the database may be
// restored from a backup and give an id again. An update email's key
// carries the address and the update's time, so an update that took an
// earlier one's id is still sent.
let database: TestDatabase;
let chest: FakeChest;
const editor = asMember(camille);

before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "notifications", "mail"], mail: { domain: "atelier-martin.test" }, settings: { company: "Atelier Martin", publicUrl: "https://status.atelier-martin.test" } });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("after a restore, an update id given again to another update is still emailed", async () => {
  const { sql } = database;
  const website = (await addComponent(sql, editor, { name: "Website" })).id;
  const r = await subs.subscribe(sql, { email: "lucie@example.com", language: "en", components: "all" });
  await subs.confirm(sql, r.subscriber.token);
  await incidents.openIncident(sql, editor, { title: "First outage", status: "investigating", body: "Looking.", states: { [website]: "major" } });
  assert.deepEqual(await flush(sql), { sent: 1, stopped: null });
  // The backup was taken before that incident: its ids are given again.
  await sql`truncate incidents restart identity cascade`;
  await incidents.openIncident(sql, editor, { title: "Second outage", status: "investigating", body: "Looking again.", states: { [website]: "major" } });
  assert.deepEqual(await flush(sql), { sent: 1, stopped: null });
  const sent = chest.outbox.filter(m => m.to.includes("lucie@example.com") && /outage/u.test(m.subject));
  assert.equal(sent.length, 2, "the second update is sent, not answered with the first");
  assert.match(sent[1]!.subject, /Second outage/u);
});
