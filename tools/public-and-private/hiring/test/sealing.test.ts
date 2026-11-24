import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, withMember, type FakeChest } from "@argentic/chest-sdk/testing";
import * as candidates from "../src/lib/candidates.ts";
import { openDetail, openerOf, openTexts, sealPending } from "../src/lib/sealing.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { application, openJob } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo } from "./support/members.ts";

// Candidates' private notes and the words of feedback are sealed by the
// Chest (SDK 0.7.0): never in clear in the database, opened only on a
// member's request, bound to their candidate.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications", "sealed"] });
});
after(async () => {
  await chest.close();
  await database.close();
});

const unreadable = "Sealed";
const opener = (member = camille) => openerOf(withMember(new Request("https://hiring-chest.chest.test/chest/candidates/1"), member));

test("a note and a feedback's words are sealed in the database and open on a member's page", async () => {
  const { sql } = database;
  const job = await openJob(sql, asMember(camille), "Sealed notes");
  const c = (await candidates.apply(sql, application(job.slug))).candidate;
  const note = await candidates.addNote(sql, asMember(camille), c.id, "Salary wish: 48k, health issue to keep in mind.");
  assert.equal(note.body, "Salary wish: 48k, health issue to keep in mind.", "the author reads what they wrote");
  const given = await candidates.giveFeedback(sql, asMember(camille), c.id, { rating: 3, strengths: "Clear", concerns: "", recommendation: "yes" });
  assert.equal(given.feedback.strengths, "Clear");
  const [row] = await sql<{ body: string }[]>`select body from notes where candidate_id = ${c.id}`;
  assert.match(row!.body, /^chest:sealed:/u);
  assert.ok(!row!.body.includes("48k"));
  const [fb] = await sql<{ strengths: string; concerns: string }[]>`select strengths, concerns from feedback where candidate_id = ${c.id}`;
  assert.match(fb!.strengths, /^chest:sealed:/u);
  assert.equal(fb!.concerns, "", "nothing written, nothing sealed");
  const before = chest.opens.length;
  const d = await openDetail(opener(), await candidates.candidate(sql, asMember(camille), c.id), unreadable);
  assert.deepEqual(d.notes.map(n => n.body), ["Salary wish: 48k, health issue to keep in mind."]);
  assert.equal(d.mine?.strengths, "Clear");
  assert.ok(chest.opens.length > before, "every open is journaled by the Chest");
});

test("a sealed note copied into another candidate's row opens nowhere; without a member's request nothing opens", async () => {
  const { sql } = database;
  const job = await openJob(sql, asMember(camille), "Context");
  const a = (await candidates.apply(sql, application(job.slug, { email: "a@example.com" }))).candidate;
  const b = (await candidates.apply(sql, application(job.slug, { email: "b@example.com" }))).candidate;
  await candidates.addNote(sql, asMember(camille), a.id, "About A only.");
  await sql`insert into notes (candidate_id, author, body) select ${b.id}, author, body from notes where candidate_id = ${a.id}`;
  const forB = await openDetail(opener(), await candidates.candidate(sql, asMember(camille), b.id), unreadable);
  assert.deepEqual(forB.notes.map(n => n.body), [unreadable]);
  const plain = await openTexts(openerOf(new Request("https://hiring-chest.chest.test/chest")), [{ text: (await candidates.candidate(sql, asMember(camille), a.id)).notes[0]!.body, context: `note:${a.id}` }], unreadable);
  assert.deepEqual(plain, [unreadable], "no member, no ticket: not opened");
});

test("what was written in clear before is sealed at night, and still reads the same", async () => {
  const { sql } = database;
  const job = await openJob(sql, asMember(camille), "Older notes");
  const c = (await candidates.apply(sql, application(job.slug))).candidate;
  await sql`insert into notes (candidate_id, author, body) values (${c.id}, ${camille.id}, 'Written by an earlier version.')`;
  await sql`insert into feedback (candidate_id, author, rating, strengths, concerns, recommendation) values (${c.id}, ${hugo.id}, 2, 'Kind', 'Slow', 'no')`;
  const shown = await openDetail(opener(), await candidates.candidate(sql, asMember(camille), c.id), unreadable);
  assert.deepEqual(shown.notes.map(n => n.body), ["Written by an earlier version."], "read as it is meanwhile");
  assert.ok((await sealPending(sql)) >= 2);
  const left = await sql`select 1 from notes where body not like 'chest:sealed:%' union all select 1 from feedback where strengths not like 'chest:sealed:%' and strengths <> ''`;
  assert.equal(left.length, 0);
  const after = await openDetail(opener(), await candidates.candidate(sql, asMember(camille), c.id), unreadable);
  assert.deepEqual(after.notes.map(n => n.body), ["Written by an earlier version."]);
  assert.deepEqual(after.others.map(f => [f.strengths, f.concerns]), [["Kind", "Slow"]]);
  assert.equal(await sealPending(sql), 0, "once");
});

test("a Chest that cannot seal refuses the note: it is never kept in clear", async () => {
  const { sql } = database;
  const job = await openJob(sql, asMember(camille), "No seal");
  const c = (await candidates.apply(sql, application(job.slug))).candidate;
  await chest.close();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications"] });
  await assert.rejects(candidates.addNote(sql, asMember(camille), c.id, "Should not be stored."), { code: "unavailable" });
  assert.equal((await sql`select 1 from notes where candidate_id = ${c.id}`).length, 0);
});
