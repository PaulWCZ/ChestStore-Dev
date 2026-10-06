import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { answer } from "../src/lib/answers.ts";
import { AppError } from "../src/core/tool.ts";
import * as polls from "../src/lib/polls.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, groups, hugo, ines, lea, nora, sofia, tom } from "./support/members.ts";

let database: TestDatabase;
before(async () => {
  database = await testDatabase();
});
after(async () => {
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate polls, tellings, chest_events, series, comments restart identity cascade`;
  await database.sql`update settings set members_create = true`;
});

const zone = "Europe/Paris";
const now = new Date("2026-10-05T08:00:00Z");
const ctx = { zone, now, today: "2026-10-05", known: null };
const refuses = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const lunch = { kind: "choice", title: "Lunch on Friday?", options: ["Pizza", "Sushi", "Salad"], open: true };

test("an organiser writes a poll; a member cannot; a sent poll is queued to be told", async () => {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(sofia), lunch, ctx);
  assert.equal(made.status, "open");
  const poll = await polls.load(sql, made.id);
  assert.equal(poll.organiser, sofia.id);
  assert.equal(poll.openedAt, now.toISOString());
  assert.deepEqual(poll.questions[0]!.options.map(o => o.label), ["Pizza", "Sushi", "Salad"]);
  assert.deepEqual((await sql`select kind from tellings where poll_id = ${made.id}`).map(r => r["kind"]), ["ask"]);
  // A member starts polls too, unless an admin keeps that to organisers.
  assert.equal((await polls.createPoll(sql, asMember(hugo), lunch, ctx)).status, "open");
  await assert.rejects(polls.setPolicy(sql, asMember(sofia), { membersCreate: false }), refuses("forbidden"));
  await polls.setPolicy(sql, asMember(camille), { membersCreate: false });
  await assert.rejects(polls.createPoll(sql, asMember(hugo), lunch, ctx), refuses("forbidden"));
  assert.equal((await polls.createPoll(sql, asMember(sofia), lunch, ctx)).status, "open", "organisers still can");
  await polls.setPolicy(sql, asMember(camille), { membersCreate: true });
  await assert.rejects(polls.createPoll(sql, asMember(nora), lunch, ctx), refuses("forbidden"));
  await assert.rejects(polls.createPoll(sql, null, lunch, ctx), refuses("forbidden"));
  await assert.rejects(polls.createPoll(sql, asMember(sofia), { ...lunch, closes: { day: "2026-10-05", time: "10:05" } }, ctx), refuses("too_soon"));
});

test("a draft: its organiser's alone, rewritten freely, then sent; once sent, only words and closing time change", async () => {
  const { sql } = database;
  const draft = await polls.createPoll(sql, asMember(sofia), { ...lunch, open: false }, ctx);
  assert.equal(draft.status, "draft");
  assert.equal((await sql`select 1 from tellings`).length, 0);
  await assert.rejects(polls.view(sql, asMember(hugo), draft.id, now), refuses("not_found"));
  await assert.rejects(polls.view(sql, asMember(camille), draft.id, now), refuses("not_found"));
  await assert.rejects(answer(sql, asMember(sofia), draft.id, {}, now), refuses("locked"));
  await polls.updateDraft(sql, asMember(sofia), draft.id, { kind: "date", title: "Team dinner", dates: [{ day: "2026-11-20", start: "19:00", end: "22:00" }, { day: "2026-11-27" }] }, ctx);
  let poll = await polls.load(sql, draft.id);
  assert.equal(poll.kind, "date");
  assert.deepEqual(poll.questions[0]!.options.map(o => [o.day, o.start]), [["2026-11-20", "19:00"], ["2026-11-27", null]]);
  await assert.rejects(polls.updateDraft(sql, asMember(camille), draft.id, lunch, ctx), refuses("not_found"));
  await polls.sendDraft(sql, asMember(sofia), draft.id, ctx);
  poll = await polls.load(sql, draft.id);
  assert.equal(poll.status, "open");
  await assert.rejects(polls.updateDraft(sql, asMember(sofia), draft.id, lunch, ctx), refuses("locked"));
  await assert.rejects(polls.sendDraft(sql, asMember(sofia), draft.id, ctx), refuses("locked"));
  const edited = await polls.editOpen(sql, asMember(sofia), draft.id, { title: "Christmas dinner", details: "Bring a friend", closes: { day: "2026-10-20", time: "18:00" } }, ctx);
  assert.equal(edited.title, "Christmas dinner");
  assert.equal(edited.closesAt, "2026-10-20T16:00:00.000Z");
  assert.equal(edited.questions[0]!.options.length, 2, "the dates stay");
  await assert.rejects(polls.editOpen(sql, asMember(hugo), draft.id, { title: "Mine now" }, ctx), refuses("forbidden"));
  await assert.rejects(polls.editOpen(sql, asMember(camille), draft.id, { title: "Admin's" }, ctx), refuses("forbidden"));
  // A draft proposing a day now past cannot be sent.
  const old = await polls.createPoll(sql, asMember(sofia), { kind: "date", title: "Old", dates: [{ day: "2026-10-01" }] }, ctx);
  await assert.rejects(polls.sendDraft(sql, asMember(sofia), old.id, ctx), refuses("past"));
});

test("a group poll is seen by its groups, its organiser and admins; not by the others", async () => {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(sofia), { ...lunch, audience: { everyone: false, groups: [groups.sales] } }, ctx);
  assert.equal((await polls.view(sql, asMember(hugo), made.id, now)).asked, true);
  assert.equal((await polls.view(sql, asMember(sofia), made.id, now)).asked, false);
  assert.equal((await polls.view(sql, asMember(camille), made.id, now)).manages, true);
  await assert.rejects(polls.view(sql, asMember(lea), made.id, now), refuses("not_found"));
  await assert.rejects(polls.view(sql, asMember(nora), made.id, now), refuses("not_found"));
  await assert.rejects(polls.view(sql, asMember(hugo), "abc", now), refuses("not_found"));
  await assert.rejects(polls.view(sql, asMember(hugo), "999", now), refuses("not_found"));
  await assert.rejects(answer(sql, asMember(lea), made.id, {}, now), refuses("not_found"));
  await assert.rejects(answer(sql, asMember(sofia), made.id, {}, now), refuses("not_asked"));
});

test("closing: by hand (undone by reopening), or by its date on the next read", async () => {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(sofia), { ...lunch, closes: { day: "2026-10-06", time: "12:00" } }, ctx);
  await assert.rejects(polls.closePoll(sql, asMember(hugo), made.id, now), refuses("forbidden"));
  const closed = await polls.closePoll(sql, asMember(sofia), made.id, now);
  assert.equal(closed.status, "closed");
  assert.equal(closed.closedByDate, false);
  await assert.rejects(polls.closePoll(sql, asMember(sofia), made.id, now), refuses("closed"));
  await assert.rejects(answer(sql, asMember(hugo), made.id, { [closed.questions[0]!.id]: { options: [closed.questions[0]!.options[0]!.id] } }, now), refuses("closed"));
  const reopened = await polls.reopenPoll(sql, asMember(camille), made.id, now);
  assert.equal(reopened.status, "open");
  await assert.rejects(polls.reopenPoll(sql, asMember(sofia), made.id, now), refuses("not_closed"));
  // The closing time passes: the next read closes it.
  const later = new Date("2026-10-06T10:01:00Z");
  const view = await polls.view(sql, asMember(hugo), made.id, later);
  assert.equal(view.poll.status, "closed");
  assert.equal(view.poll.closedByDate, true);
  assert.equal(view.poll.closedAt, "2026-10-06T10:00:00.000Z");
  // Reopened after its closing time: it no longer closes by itself.
  const again = await polls.reopenPoll(sql, asMember(sofia), made.id, later);
  assert.equal(again.closesAt, null);
});

test("a date poll's final date: once closed, one of its options, told again when changed", async () => {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(sofia), { kind: "date", title: "Party", dates: [{ day: "2026-12-11" }, { day: "2026-12-18", start: "19:00" }], open: true }, ctx);
  const options = (await polls.load(sql, made.id)).questions[0]!.options;
  await assert.rejects(polls.chooseFinal(sql, asMember(sofia), made.id, options[1]!.id, now), refuses("not_closed"));
  await polls.closePoll(sql, asMember(sofia), made.id, now);
  await assert.rejects(polls.chooseFinal(sql, asMember(hugo), made.id, options[1]!.id, now), refuses("forbidden"));
  await assert.rejects(polls.chooseFinal(sql, asMember(sofia), made.id, "12345", now), refuses("invalid"));
  const chosen = await polls.chooseFinal(sql, asMember(sofia), made.id, options[1]!.id, now);
  assert.equal(chosen.finalOption, options[1]!.id);
  assert.deepEqual((await sql`select kind from tellings where poll_id = ${made.id} order by kind`).map(r => r["kind"]), ["final"]);
  // A chosen date cannot be reopened; taken back, it can.
  await assert.rejects(polls.reopenPoll(sql, asMember(sofia), made.id, now), refuses("locked"));
  await polls.chooseFinal(sql, asMember(sofia), made.id, null, now);
  assert.equal((await sql`select 1 from tellings where poll_id = ${made.id} and kind = 'final'`).length, 0);
  const choice = await polls.createPoll(sql, asMember(sofia), lunch, ctx);
  await polls.closePoll(sql, asMember(sofia), choice.id, now);
  await assert.rejects(polls.chooseFinal(sql, asMember(sofia), choice.id, options[0]!.id, now), refuses("invalid"));
});

test("deleting puts a poll aside for its organiser or an admin, restoring brings it back, the purge ends it", async () => {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(sofia), lunch, ctx);
  await assert.rejects(polls.deletePoll(sql, asMember(hugo), made.id, now), refuses("forbidden"));
  await polls.deletePoll(sql, asMember(camille), made.id, now);
  await assert.rejects(polls.view(sql, asMember(sofia), made.id, now), refuses("not_found"));
  assert.equal((await sql`select 1 from tellings`).length, 0);
  await assert.rejects(polls.restorePoll(sql, asMember(hugo), made.id, now), refuses("not_found"));
  await polls.restorePoll(sql, asMember(sofia), made.id, now);
  assert.equal((await polls.view(sql, asMember(hugo), made.id, now)).poll.status, "open");
  assert.equal((await sql`select kind from tellings`).length, 1, "asks again");
  await assert.rejects(polls.restorePoll(sql, asMember(sofia), made.id, now), refuses("not_found"));
  await polls.deletePoll(sql, asMember(sofia), made.id, now);
  assert.equal(await polls.purge(sql, new Date(now.getTime() + 29 * 864e5)), 0);
  assert.equal(await polls.purge(sql, new Date(now.getTime() + 31 * 864e5)), 1);
});

test("home: what waits for me first (soonest closing), what I asked in one list, what I answered, what closed lately", async () => {
  const { sql } = database;
  const a = await polls.createPoll(sql, asMember(sofia), { ...lunch, title: "A", closes: { day: "2026-10-09", time: "12:00" } }, ctx);
  await polls.createPoll(sql, asMember(sofia), { ...lunch, title: "B", closes: { day: "2026-10-07", time: "12:00" } }, ctx);
  const c = await polls.createPoll(sql, asMember(sofia), { ...lunch, title: "C" }, ctx);
  const draft = await polls.createPoll(sql, asMember(sofia), { ...lunch, title: "D", open: false }, ctx);
  const tech = await polls.createPoll(sql, asMember(camille), { ...lunch, title: "T", audience: { everyone: false, groups: [groups.tech] } }, ctx);
  const cq = (await polls.load(sql, c.id)).questions[0]!;
  await answer(sql, asMember(hugo), c.id, { [cq.id]: { options: [cq.options[0]!.id] } }, now);
  await polls.closePoll(sql, asMember(sofia), a.id, now);
  const hugoHome = await polls.home(sql, asMember(hugo), now);
  assert.deepEqual(hugoHome.toAnswer.map(p => p.title), ["B"]);
  assert.deepEqual(hugoHome.answered.map(p => p.title), ["C"]);
  assert.deepEqual(hugoHome.closed.map(p => p.title), ["A"]);
  assert.deepEqual(hugoHome.mine, []);
  const sofiaHome = await polls.home(sql, asMember(sofia), now);
  // Asked by her: open first (closing soonest, no closing date last), her
  // draft, then the closed one; none of them in "To answer" or "Closed".
  assert.deepEqual(sofiaHome.mine.map(p => p.title), ["B", "C", "D", "A"]);
  assert.ok(sofiaHome.mine.every(p => p.mine));
  assert.equal(sofiaHome.mine[2]!.id, draft.id, "drafts after the open ones");
  assert.deepEqual(sofiaHome.toAnswer.map(p => p.title), [], "her own polls are not mixed into To answer");
  assert.deepEqual(sofiaHome.closed.map(p => p.title), []);
  assert.equal(sofiaHome.mine.find(p => p.id === c.id)!.answers, 1);
  // Only Tech is asked the tech poll; Camille (admin) organises it.
  assert.ok((await polls.home(sql, asMember(tom), now)).toAnswer.some(p => p.id === tech.id));
  assert.ok(!(await polls.home(sql, asMember(hugo), now)).toAnswer.some(p => p.id === tech.id));
  await assert.rejects(polls.home(sql, asMember(nora), now), refuses("forbidden"));
  // Closed more than 60 days ago: gone from the home page.
  assert.deepEqual((await polls.home(sql, asMember(hugo), new Date(now.getTime() + 61 * 864e5))).closed.map(p => p.id).includes(a.id), false);
});

test("the number on the tile: open polls asking me that I have not answered", async () => {
  const { sql } = database;
  const one = await polls.createPoll(sql, asMember(sofia), lunch, ctx);
  await polls.createPoll(sql, asMember(sofia), { ...lunch, audience: { everyone: false, groups: [groups.sales] } }, ctx);
  await polls.createPoll(sql, asMember(sofia), { ...lunch, open: false }, ctx);
  const q = (await polls.load(sql, one.id)).questions[0]!;
  await answer(sql, asMember(ines), one.id, { [q.id]: { options: [q.options[1]!.id] } }, now);
  const counts = await polls.pendingCounts(sql, [hugo, ines, lea, nora].map(p => ({ id: p.id, groups: p.groups, role: p.role })), now);
  assert.deepEqual(Object.fromEntries(counts), { [hugo.id]: 2, [ines.id]: 1, [lea.id]: 1, [nora.id]: 0 });
});
