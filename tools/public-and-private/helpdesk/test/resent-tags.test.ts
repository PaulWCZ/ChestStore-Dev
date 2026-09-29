import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { catalogue } from "../lib/i18n/index.ts";
import { shownTag, storedTag } from "../lib/seed-words.ts";
import * as tickets from "../lib/tickets.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

// A request sent twice is one ticket; the tags a desk starts with follow
// each reader's language until renamed.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier.test", mailboxes: ["support"] } });
});
after(async () => {
  await chest.close();
  await database.close();
});
const form = (extra: Partial<tickets.PublicInput> = {}): tickets.PublicInput => ({ name: "Marc Lenoir", email: "marc@example.com", subject: "Chair missing a screw", message: "One screw is missing.", language: "fr", ...extra });

test("the same request sent again within ten minutes is the same ticket, with a link of its own", async () => {
  const { sql } = database;
  const first = await tickets.fromForm(sql, form());
  const again = await tickets.fromForm(sql, form({ email: "MARC@example.com" }));
  assert.equal(again.number, first.number);
  assert.equal(again.repeated, true);
  assert.notEqual(again.secret, first.secret);
  // Both links open the one ticket, with one message.
  for (const secret of [first.secret, again.secret]) {
    const seen = await tickets.byLink(sql, secret);
    assert.equal(seen?.number, first.number);
    assert.equal(seen?.messages.length, 1);
  }
  // Another text, or another subject, is another request.
  assert.notEqual((await tickets.fromForm(sql, form({ message: "Two screws, in fact." }))).number, first.number);
  assert.notEqual((await tickets.fromForm(sql, form({ subject: "Another chair" }))).number, first.number);
  // After ten minutes, the same words are a new request.
  await sql`update tickets set created_at = created_at - interval '11 minutes' where number = ${first.number}`;
  assert.notEqual((await tickets.fromForm(sql, form())).number, first.number);
});

test("a seeded tag reads in each reader's language; typed in any language it is the same tag; renamed, it is the team's word", async () => {
  const { sql } = database;
  assert.equal(shownTag("@damaged", catalogue("fr")), "Abîmé");
  assert.equal(storedTag("abîmé"), "@damaged");
  await sql`insert into tags (name) values ('@damaged')`;
  const t = await tickets.fromForm(sql, form({ subject: "Scratched table", message: "It came scratched." }));
  const tag = await tickets.addTag(sql, asMember(ines), t.number, "Abîmé");
  assert.equal(tag.name, "Abîmé");
  await tickets.addTag(sql, asMember(hugo), t.number, "Damaged");
  const inFrench = await tickets.ticket(sql, asMember(ines), t.number);
  assert.deepEqual(inFrench.tags.map(g => g.name), ["Abîmé"]);
  const inEnglish = await tickets.ticket(sql, asMember(hugo), t.number);
  assert.deepEqual(inEnglish.tags.map(g => g.name), ["Damaged"]);
  const list = await tickets.tags(sql, asMember(ines));
  assert.equal(list.find(g => g.id === tag.id)?.name, "Abîmé");
  await tickets.renameTag(sql, asMember(camille), tag.id, "Rayé");
  assert.deepEqual((await tickets.ticket(sql, asMember(hugo), t.number)).tags.map(g => g.name), ["Rayé"]);
});
