import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as boards from "../lib/boards.ts";
import * as cards from "../lib/cards.ts";
import { en } from "../lib/i18n/en.ts";
import * as mail from "../lib/mail.ts";
import * as tell from "../lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";

// Each person's email choice in the Chest (member.mailPreference, SDK
// studio.15), which mail.send applies beside Tasks' own switch: "none" is
// not emailed, "digest" waits for the Chest's one email a day. And keys
// are passed whole: two people emailed under one long key each get theirs.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({
    tool: "tasks",
    members: everyone.map(p => ({ ...p, email: `${p.id.slice(4, 10)}@atelier.test`, ...(p.id === ines.id ? { mailPreference: "none" as const } : p.id === lea.id ? { mailPreference: "digest" as const } : {}) })),
    capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier.test" },
  });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`delete from boards`;
  chest.outbox.length = 0;
  chest.held.length = 0;
});
const later = () => new Date(Date.now() + 11 * 60_000);

test("a card given to three people: emailed to the one who wants all, held for the one who chose none and the one who chose a daily email", async () => {
  const { sql } = database;
  const b = await boards.createBoard(sql, asMember(hugo), { name: "Office move", visibility: "team" }, en.templates.columns);
  const [todo] = await boards.columns(sql, b.id);
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo!.id, "Order boxes");
  const change = await cards.setAssignees(sql, asMember(hugo), c.id, [ines.id, lea.id, camille.id]);
  await tell.assigned(asMember(hugo), change.added, { id: c.id, title: "Order boxes", boardId: b.id }, sql);
  assert.equal(await mail.flushMail(sql, later()), 1, "only Camille's is counted as sent");
  assert.deepEqual(chest.outbox.map(m => m.to), [[`${camille.id.slice(4, 10)}@atelier.test`]]);
  assert.deepEqual(chest.held.map(h => [h.member, h.reason]).sort(), [[ines.id, "none"], [lea.id, "digest"]].sort());
});

test("one long key for several people: each gets their own email (the key is never cut)", async () => {
  const { sql } = database;
  const key = `morning-reminder:${"x".repeat(40)}:2026-09-30`;
  const sent = await mail.email(sql, [hugo.id, camille.id], t => ({ subject: t.mail.why.slice(0, 40), lines: ["Due today"] }), { path: "/chest", key });
  assert.equal(sent, 2);
  assert.deepEqual(chest.outbox.map(m => m.to).sort(), [[`${hugo.id.slice(4, 10)}@atelier.test`], [`${camille.id.slice(4, 10)}@atelier.test`]].sort());
});

// studio.16: the switch says what the Chest will do (mail.available) before
// anyone counts on an email: sent, not sent at all (not connected, paused,
// not granted), or spent for today.
test("the email switch tells the truth: the Chest sends, does not send yet, or has spent its day", async () => {
  assert.equal(await mail.mailState(), "ok");
  chest.delivery.mail = "not_connected";
  assert.equal(await mail.mailState(), "off");
  chest.delivery.mail = "suspended";
  assert.equal(await mail.mailState(), "off");
  chest.delivery.mail = "ready";
  const bare = await fakeChest({ tool: "tasks", members: everyone, capabilities: ["members", "files", "notifications"] });
  try {
    assert.equal(await mail.mailState(), "off", "mail not granted to Tasks");
  } finally {
    await bare.close();
  }
  assert.equal(en.home.emailOff.includes("owner"), true);
});
