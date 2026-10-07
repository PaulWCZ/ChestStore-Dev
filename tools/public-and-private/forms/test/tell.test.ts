import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, shownTo, type FakeChest } from "@argentic/chest-sdk/testing";
import * as answers from "../src/lib/answers.ts";
import * as forms from "../src/lib/forms.ts";
import * as tell from "../src/lib/tell.ts";
import * as schedules from "@argentic/chest-sdk/schedules";
import { seen } from "@argentic/chest-app/db";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { form, q } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone, network: {} });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});

// The bell's schedule run, as src/app.tsx answers it (test/app.test.mjs
// runs the server's own).
const jobs = async (request: Request) => new Response(null, { status: await schedules.handle(request, { bell: async run => { await tell.pending(database.sql, new Date(run.scheduledAt)); } }, { seen }) });
const noFiles = { files: async () => { throw new Error("no files"); }, drop: async () => {} };

test("the bell: batched per form, replaced not doubled, in each watcher's language; the tile counts what is unseen", async () => {
  const { sql } = database;
  const name = q("short", "Name");
  const f0 = await forms.create(sql, asMember(ines), { definition: form([name], "Feedback") });
  await forms.share(sql, asMember(ines), f0.id, hugo.id, "viewer");
  await forms.saveSettings(sql, asMember(ines), f0.id, { audience: "public", layout: "steps", accent: "berry", watchers: [ines.id, hugo.id] }, null);
  await forms.publish(sql, asMember(ines), f0.id);
  const f = (await forms.bySlug(sql, f0.slug))!.form;
  const answer = async () => {
    await answers.submit(sql, { form: f, version: 1, answers: { [name.id]: "x" }, respondent: null, language: "en", ...noFiles });
    return tell.afterAnswer(sql, f.id);
  };
  assert.equal(await answer(), true, "the first answer is told at once");
  assert.equal(await answer(), false, "the next ones wait for the batch");
  assert.equal(await answer(), false);
  const key = `answers:${f.id}`;
  // One notice, English and French: each reads their own (Inès: French).
  assert.deepEqual(chest.notifications.filter(n => n.key === key).map(n => [n.member, shownTo(n, n.member === ines.id ? "fr" : "en").title]).sort(), [[hugo.id, "1 new answer to Feedback"], [ines.id, "1 nouvelle réponse à Feedback"]].sort());
  // The schedule sends what waited: one item each, replaced, with the count.
  assert.equal(await chest.run("bell", jobs), 204);
  const items = chest.notifications.filter(n => n.key === key);
  assert.equal(items.length, 2, "replaced, never doubled");
  assert.ok(items.some(n => n.member === ines.id && shownTo(n, "fr").title === "3 nouvelles réponses à Feedback"));
  assert.equal(chest.badges.get(ines.id), 3);
  // Opening the answers clears one's item and count, not the other's.
  await tell.seen(sql, f.id, ines.id);
  assert.equal(chest.notifications.filter(n => n.key === key && n.member === ines.id).length, 0);
  assert.equal(chest.badges.get(ines.id) ?? 0, 0);
  assert.equal(chest.badges.get(hugo.id), 3);
  // Nothing waits: the schedule tells no one again.
  const before = chest.notifications.length;
  await chest.run("bell", jobs);
  assert.equal(chest.notifications.length, before);
});

test("a team form that opens tells the team once, except its author; closing withdraws it", async () => {
  assert.equal(await tell.opened("41", "abcdefgh", "Offsite", camille.id), true);
  const items = chest.notifications.filter(n => n.key === "ask:41");
  assert.ok(items.some(n => n.member === hugo.id && n.title === "New form to answer: Offsite" && n.path === "/chest/f/abcdefgh"));
  assert.ok(items.some(n => n.member === ines.id && shownTo(n, "fr").title === "Nouveau formulaire à remplir\u202f: Offsite"), "the narrow no-break space kept");
  assert.ok(!items.some(n => n.member === camille.id));
  await tell.closed("41");
  assert.equal(chest.notifications.filter(n => n.key === "ask:41").length, 0);
});
