import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { answer, shuffle } from "../src/lib/answers.ts";
import { AppError } from "@argentic/chest-app";
import * as polls from "../src/lib/polls.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, lea, nora, sofia, tom } from "./support/members.ts";

let database: TestDatabase;
before(async () => {
  database = await testDatabase();
});
after(async () => {
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate polls, tellings restart identity cascade`;
});

const now = new Date("2026-10-05T08:00:00Z");
const ctx = { zone: "Europe/Paris", now, today: "2026-10-05", known: null };
const refuses = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("a named answer is the member's own, once, and can be changed until the poll closes", async () => {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(sofia), { kind: "choice", title: "Lunch?", options: ["Pizza", "Sushi"], other: true, open: true }, ctx);
  const q = (await polls.load(sql, made.id)).questions[0]!;
  const [pizza, sushi] = q.options.map(o => o.id) as [string, string];
  assert.equal((await answer(sql, asMember(hugo), made.id, { [q.id]: { options: [pizza] } }, now)).first, true);
  assert.equal((await answer(sql, asMember(hugo), made.id, { [q.id]: { options: [sushi] } }, now)).first, false);
  await answer(sql, asMember(ines), made.id, { [q.id]: { other: "Tacos" } }, now);
  const view = await polls.view(sql, asMember(hugo), made.id, now);
  assert.equal(view.answers, 2);
  assert.deepEqual(view.mine?.[q.id]?.options, [sushi]);
  const r = view.results![0]!;
  assert.ok(r.kind === "choice");
  assert.deepEqual(r.options.map(o => [o.count, o.voters]), [[0, []], [1, [hugo.id]]]);
  assert.deepEqual(r.other?.texts.map(x => [x.body, x.member]), [["Tacos", ines.id]]);
  assert.deepEqual(view.participants.sort(), [hugo.id, ines.id].sort());
  // Nobody answers for someone else: the member is the Chest's, never the body's.
  await assert.rejects(answer(sql, asMember(tom), made.id, { [q.id]: { options: [pizza] }, member: hugo.id }, now), refuses("invalid"));
  await assert.rejects(answer(sql, asMember(nora), made.id, { [q.id]: { options: [pizza] } }, now), refuses("forbidden"));
  await assert.rejects(answer(sql, null, made.id, { [q.id]: { options: [pizza] } }, now), refuses("forbidden"));
  await assert.rejects(answer(sql, asMember(lea), made.id, { [q.id]: { options: [pizza, sushi] } }, now), refuses("invalid"));
  await polls.closePoll(sql, asMember(sofia), made.id, now);
  await assert.rejects(answer(sql, asMember(hugo), made.id, { [q.id]: { options: [pizza] } }, now), refuses("closed"));
});

test("results kept for the end are hidden from those asked until then, never from the organiser", async () => {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(sofia), { kind: "choice", title: "Offsite?", options: ["Sea", "Mountain"], results: "closed", open: true }, ctx);
  const q = (await polls.load(sql, made.id)).questions[0]!;
  await answer(sql, asMember(hugo), made.id, { [q.id]: { options: [q.options[0]!.id] } }, now);
  const hidden = await polls.view(sql, asMember(hugo), made.id, now);
  assert.equal(hidden.state, "after_close");
  assert.equal(hidden.results, null);
  assert.deepEqual(hidden.participants, []);
  assert.equal((await polls.view(sql, asMember(sofia), made.id, now)).state, "shown");
  await polls.closePoll(sql, asMember(sofia), made.id, now);
  assert.equal((await polls.view(sql, asMember(hugo), made.id, now)).state, "shown");
});

test("a date poll: yes, if need be or no for each date, a grid of who can come", async () => {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(sofia), { kind: "date", title: "Dinner", dates: [{ day: "2026-11-20" }, { day: "2026-11-27", start: "19:00", end: "23:00" }], open: true }, ctx);
  const q = (await polls.load(sql, made.id)).questions[0]!;
  const [a, b] = q.options.map(o => o.id) as [string, string];
  await answer(sql, asMember(hugo), made.id, { [q.id]: { dates: { [a]: 2, [b]: 1 } } }, now);
  await answer(sql, asMember(ines), made.id, { [q.id]: { dates: { [b]: 2 } } }, now);
  const r = (await polls.view(sql, asMember(sofia), made.id, now)).results![0]!;
  assert.ok(r.kind === "date");
  assert.deepEqual(r.options.map(o => [o.yes, o.maybe, o.no]), [[1, 0, 1], [1, 1, 0]]);
  assert.equal(r.best, b);
  assert.deepEqual(r.grid.map(g => [g.member, g.values[a], g.values[b]]), [[hugo.id, 2, 1], [ines.id, 0, 2]]);
});

test("an anonymous answer names no one: counts and texts only, all rows rewritten together, never changed", async () => {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(sofia), { kind: "survey", title: "How was this quarter?", anonymous: true, questions: [{ kind: "scale", text: "Overall?" }, { kind: "text", text: "Anything to add?" }], open: true }, ctx);
  const [scale, text] = (await polls.load(sql, made.id)).questions.map(q => q.id) as [string, string];
  const people = [hugo, ines, lea, tom];
  for (const [i, p] of people.entries()) await answer(sql, asMember(p), made.id, { [scale]: { value: i + 2 }, [text]: { text: "Note from " + p.firstName } }, now);
  // Nothing ties a count or a text to a member; no answers rows at all.
  assert.equal((await sql`select 1 from answers`).length, 0);
  const texts = await sql<{ body: string }[]>`select * from texts where poll_id = ${made.id}`;
  assert.equal(texts.length, 4);
  // reply_key: the hash of a key only the author's browser keeps (lib/replies.ts) — none here.
  for (const row of texts) assert.deepEqual(Object.keys(row).sort(), ["body", "poll_id", "question_id", "reply_key", "shuffle"]);
  assert.ok(texts.every(row => (row as { reply_key?: string | null }).reply_key === null));
  const tallies = await sql<{ key: string; count: number }[]>`select key, count from tallies where question_id = ${scale} order by key`;
  assert.deepEqual(tallies.map(t => [t.key, t.count]), [["n", 4], ["v2", 1], ["v3", 1], ["v4", 1], ["v5", 1]]);
  // Every row of the poll was written by the last answer's transaction: no
  // row stamp tells which answer came last.
  const stamps = await sql<{ xmin: string }[]>`
    select xmin::text from participants where poll_id = ${made.id}
    union select xmin::text from tallies where poll_id = ${made.id}
    union select xmin::text from texts where poll_id = ${made.id}`;
  assert.equal(stamps.length, 1);
  // Once is all: an anonymous answer cannot be found again to change.
  await assert.rejects(answer(sql, asMember(hugo), made.id, { [scale]: { value: 1 } }, now), refuses("already"));
  // While it is open, nobody sees a count move — not the organiser, not an
  // admin, not a member — however many answers come in: watching the
  // results after each answer would say who answered what.
  const roles = [sofia, camille, hugo];
  const look = async () => {
    for (const who of roles) {
      const view = await polls.view(sql, asMember(who), made.id, now);
      assert.equal(view.state, "after_close", who.firstName);
      assert.equal(view.results, null);
      assert.deepEqual(view.participants, [], "nobody listed");
    }
    await assert.rejects(polls.exportData(sql, asMember(sofia), made.id, now), refuses("forbidden"));
    await assert.rejects(polls.exportData(sql, asMember(camille), made.id, now), refuses("forbidden"));
  };
  await look();
  await answer(sql, asMember(sofia), made.id, { [scale]: { value: 5 } }, now);
  await look();
  await answer(sql, asMember(camille), made.id, { [scale]: { value: 1 } }, now);
  await look();
  // Closed: the results show to everyone at once.
  await polls.closePoll(sql, asMember(sofia), made.id, now);
  for (const who of roles) assert.equal((await polls.view(sql, asMember(who), made.id, now)).state, "shown");
  const view = await polls.view(sql, asMember(sofia), made.id, now);
  assert.equal(view.names, false);
  assert.equal(view.mine, null);
  assert.equal(view.answered, true);
  const r = view.results!;
  assert.ok(r[0]!.kind === "scale" && r[0]!.average === 3.3);
  assert.ok(r[1]!.kind === "text" && r[1]!.texts.every(x => x.member === null) && r[1]!.texts.length === 4);
  const data = await polls.exportData(sql, asMember(sofia), made.id, now);
  assert.deepEqual(data.rows, []);
  // And it stays closed: reopening, then closing again, would let anyone
  // compare the two results. Not even an admin can.
  await assert.rejects(polls.reopenPoll(sql, asMember(sofia), made.id, now), refuses("anonymous_final"));
  await assert.rejects(polls.reopenPoll(sql, asMember(camille), made.id, now), refuses("anonymous_final"));
});

test("anonymous is never live; closed under five answers, the results stay hidden from everyone", async () => {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(sofia), { kind: "choice", title: "Is the workload fair?", options: ["Yes", "No"], anonymous: true, results: "live", open: true }, ctx);
  const poll = await polls.load(sql, made.id);
  assert.equal(poll.results, "closed", "live refused for an anonymous poll");
  await assert.rejects(sql`update polls set results = 'live' where id = ${made.id}`, "the database refuses it too");
  const q = poll.questions[0]!;
  for (const p of [hugo, ines, lea, tom]) await answer(sql, asMember(p), made.id, { [q.id]: { options: [q.options[0]!.id] } }, now);
  await polls.closePoll(sql, asMember(sofia), made.id, now);
  for (const who of [sofia, camille, hugo]) {
    const view = await polls.view(sql, asMember(who), made.id, now);
    assert.equal(view.state, "threshold");
    assert.equal(view.results, null);
  }
  await assert.rejects(polls.exportData(sql, asMember(camille), made.id, now), refuses("forbidden"));
});

test("shuffle keeps every item, in an order chance decides", () => {
  const items = Array.from({ length: 50 }, (_, i) => i);
  const once = shuffle(items);
  assert.deepEqual([...once].sort((a, b) => a - b), items);
  assert.notDeepEqual(once, items);
});
