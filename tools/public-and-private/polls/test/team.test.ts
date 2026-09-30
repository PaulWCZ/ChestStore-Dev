import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest } from "@argentic/chest-sdk/testing";
import { answer } from "../lib/answers.ts";
import { AppError } from "../lib/app-error.ts";
import * as comments from "../lib/comments.ts";
import { erase, leave } from "../lib/lifecycle.ts";
import { enps, readAnswer } from "../lib/model.ts";
import * as polls from "../lib/polls.ts";
import { nextAfter, openRounds, repeatSeries, roundAt, seriesState, trend } from "../lib/series.ts";
import * as tell from "../lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, chestGroups, everyone, hugo, ines, lea, nora, sofia, tom } from "./support/members.ts";

// What makes Polls a team's tool: anyone asks, hand-picked people,
// sign-up sheets, comments, reminders on demand, and the weekly pulse with
// eNPS and its trend.
let database: TestDatabase;
before(async () => {
  database = await testDatabase();
});
after(async () => {
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate polls, tellings, series, comments restart identity cascade`;
  await database.sql`update settings set members_create = true`;
});

const zone = "Europe/Paris";
const now = new Date("2026-10-05T08:00:00Z"); // a Monday, 10:00 in Paris
const ctx = { zone, now, today: "2026-10-05", known: null };
const refuses = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const later = (days: number, from = now) => new Date(from.getTime() + days * 864e5);

test("a poll put to people picked by name: only they are asked and see it", async () => {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(hugo), { kind: "choice", title: "Car share to the offsite?", options: ["I drive", "I need a seat"], audience: { everyone: false, people: [lea.id, tom.id] }, open: true }, { ...ctx, knownPeople: [lea.id, tom.id] });
  const poll = await polls.load(sql, made.id);
  assert.deepEqual(poll.people, [lea.id, tom.id]);
  assert.equal((await polls.view(sql, asMember(lea), made.id, now)).asked, true);
  assert.equal((await polls.view(sql, asMember(hugo), made.id, now)).manages, true, "its author, a member, manages it");
  await assert.rejects(polls.view(sql, asMember(ines), made.id, now), refuses("not_found"));
  const counts = await polls.pendingCounts(sql, [asMember(lea), asMember(ines)], now);
  assert.deepEqual([counts.get(lea.id), counts.get(ines.id)], [1, 0]);
  // Only members who have Polls can be picked.
  await assert.rejects(polls.createPoll(sql, asMember(hugo), { kind: "choice", title: "x", options: ["a", "b"], audience: { everyone: false, people: [nora.id] }, open: true }, { ...ctx, knownPeople: [] }), refuses("no_person"));
  await assert.rejects(polls.createPoll(sql, asMember(hugo), { kind: "choice", title: "x", options: ["a", "b"], audience: { everyone: false, people: ["bob"] }, open: true }, ctx), refuses("no_person"));
  await assert.rejects(polls.createPoll(sql, asMember(hugo), { kind: "choice", title: "x", options: ["a", "b"], audience: { everyone: false }, open: true }, ctx), refuses("no_group"));
});

test("people picked by name are told a page at a time (the Chest broadcasts to roles and groups only)", async () => {
  const chest = await fakeChest({ members: everyone, groups: chestGroups, capabilities: ["members", "notifications"], chest: { timeZone: zone } });
  try {
    const made = await polls.createPoll(database.sql, asMember(sofia), { kind: "choice", title: "Who takes the keys?", options: ["Me", "Not me"], audience: { everyone: false, people: [lea.id, hugo.id] }, open: true }, ctx);
    await tell.runTellings(database.sql, now);
    assert.deepEqual(chest.notifications.filter(n => n.key === tell.askKey(made.id)).map(n => n.member).sort(), [hugo.id, lea.id].sort());
  } finally {
    await chest.close();
  }
});

test("a sign-up sheet: places per answer, the last one taken once, a place kept when changing, never anonymous", async () => {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(sofia), { kind: "choice", title: "Who brings what?", options: ["Drinks", "Dessert"], multiple: true, slots: 2, open: true }, ctx);
  const q = (await polls.load(sql, made.id)).questions[0]!;
  const [drinks, dessert] = q.options.map(o => o.id) as [string, string];
  await answer(sql, asMember(hugo), made.id, { [q.id]: { options: [drinks] } }, now);
  await answer(sql, asMember(ines), made.id, { [q.id]: { options: [drinks, dessert] } }, now);
  await assert.rejects(answer(sql, asMember(lea), made.id, { [q.id]: { options: [drinks] } }, now), refuses("full"));
  // Inès keeps her place when she changes the rest of her answer.
  await answer(sql, asMember(ines), made.id, { [q.id]: { options: [drinks] } }, now);
  const view = await polls.view(sql, asMember(tom), made.id, now);
  assert.deepEqual(view.taken, { [drinks]: 2, [dessert]: 0 });
  await answer(sql, asMember(tom), made.id, { [q.id]: { options: [dessert] } }, now);
  // A limit is for named polls, choices and dates only.
  await assert.rejects(polls.createPoll(sql, asMember(sofia), { kind: "choice", title: "x", options: ["a", "b"], slots: 2, anonymous: true, open: true }, ctx), refuses("slots_anonymous"));
  await assert.rejects(polls.createPoll(sql, asMember(sofia), { kind: "survey", title: "x", questions: [{ kind: "text", text: "Why?" }], slots: 2, open: true }, ctx), refuses("invalid"));
  await assert.rejects(polls.createPoll(sql, asMember(sofia), { kind: "choice", title: "x", options: ["a", "b"], slots: 0, open: true }, ctx), refuses("invalid"));
});

test("a sign-up sheet of dates: a yes takes a place, if need be is not offered", async () => {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(sofia), { kind: "date", title: "Stand shifts", dates: [{ day: "2026-10-17", start: "10:00", end: "12:00" }, { day: "2026-10-17", start: "12:00", end: "14:00" }], slots: 1, open: true }, ctx);
  const q = (await polls.load(sql, made.id)).questions[0]!;
  const [early, late] = q.options.map(o => o.id) as [string, string];
  await answer(sql, asMember(hugo), made.id, { [q.id]: { dates: { [early]: 2 } } }, now);
  await assert.rejects(answer(sql, asMember(ines), made.id, { [q.id]: { dates: { [early]: 2 } } }, now), refuses("full"));
  await assert.rejects(answer(sql, asMember(ines), made.id, { [q.id]: { dates: { [late]: 1 } } }, now), refuses("invalid"));
  await answer(sql, asMember(ines), made.id, { [q.id]: { dates: { [early]: 0, [late]: 2 } } }, now);
  assert.deepEqual((await polls.view(sql, asMember(lea), made.id, now)).taken, { [early]: 1, [late]: 1 });
});

test("comments: named polls only, by those asked or managing; removed by their author or a manager, with undo", async () => {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(sofia), { kind: "date", title: "Team dinner", dates: [{ day: "2026-10-16" }, { day: "2026-10-17" }], audience: { everyone: false, people: [hugo.id, ines.id] }, open: true }, { ...ctx, knownPeople: [hugo.id, ines.id] });
  const { comment } = await comments.add(sql, asMember(hugo), made.id, "  I can do the 17th,\n\n\n\nbut only after 8 pm  ", now);
  assert.equal(comment.body, "I can do the 17th,\n\nbut only after 8 pm");
  await comments.add(sql, asMember(sofia), made.id, "Noted!", now);
  await assert.rejects(comments.add(sql, asMember(lea), made.id, "Me too", now), refuses("not_found"), "not asked: not even seen");
  await assert.rejects(comments.add(sql, asMember(hugo), made.id, "   ", now), refuses("empty"));
  const seen = await comments.list(sql, asMember(ines), made.id);
  assert.deepEqual(seen.map(c => [c.author, c.removable]), [[hugo.id, false], [sofia.id, false]]);
  await assert.rejects(comments.remove(sql, asMember(ines), comment.id), refuses("forbidden"));
  await comments.remove(sql, asMember(sofia), comment.id, now);
  assert.equal((await comments.list(sql, asMember(ines), made.id)).length, 1);
  await comments.restore(sql, asMember(sofia), comment.id);
  assert.equal((await comments.list(sql, asMember(ines), made.id)).length, 2);
  // Erased: the words stay, the name goes.
  await erase(sql, hugo.id);
  assert.equal((await comments.list(sql, asMember(sofia), made.id))[0]!.author, "erased");
  // An anonymous poll takes none.
  const anon = await polls.createPoll(sql, asMember(sofia), { kind: "choice", title: "Fair workload?", options: ["Yes", "No"], anonymous: true, open: true }, ctx);
  await assert.rejects(comments.add(sql, asMember(ines), anon.id, "Hmm", now), refuses("no_comments"));
});

test("the organiser reminds those who have not answered — bell and email, at most every 12 hours", async () => {
  const withMail = everyone.map(m => (m.id === hugo.id ? m : { ...m, email: `${m.firstName.toLowerCase()}@atelier.test` }));
  const chest = await fakeChest({ members: withMail, groups: chestGroups, capabilities: ["members", "notifications", "mail"], mail: { domain: "atelier.test" }, chest: { timeZone: zone } });
  try {
    const { sql } = database;
    const made = await polls.createPoll(sql, asMember(sofia), { kind: "choice", title: "Lunch?", options: ["Pizza", "Sushi"], closes: { day: "2026-10-09", time: "12:00" }, open: true }, ctx);
    await tell.runTellings(sql, now);
    const q = (await polls.load(sql, made.id)).questions[0]!;
    for (const p of [hugo, ines, camille]) await answer(sql, asMember(p), made.id, { [q.id]: { options: [q.options[0]!.id] } }, now);
    await assert.rejects(polls.nudge(sql, asMember(hugo), made.id, now), refuses("forbidden"));
    await polls.nudge(sql, asMember(sofia), made.id, now);
    await tell.runTellings(sql, now);
    // Léa and Tom had not answered (Sofia organises it).
    const mails = chest.outbox.filter(m => m.subject.includes("Lunch?"));
    assert.equal(mails.length, 2);
    assert.ok(mails.every(m => m.to.length === 1), "one message each: nobody sees who else is reminded");
    assert.ok(mails.some(m => m.subject === "Rappel\u202f: Lunch?"), "Léa's in French");
    assert.ok(mails.some(m => m.subject === "Reminder: Lunch?" && m.text.includes(`/chest/polls/${made.id}`) && m.text.includes("Sofia Rossi")));
    const bell = chest.notifications.filter(n => n.key === tell.askKey(made.id) && n.member === tom.id).at(-1)!;
    assert.equal(bell.title, "Reminder: Lunch?");
    assert.equal(bell.body, "Sofia Rossi is waiting for your answer. It closes Fri 9 Oct, 12:00.");
    await assert.rejects(polls.nudge(sql, asMember(sofia), made.id, later(0.25)), refuses("nudged"));
    await polls.nudge(sql, asMember(camille), made.id, later(0.6));
  } finally {
    await chest.close();
  }
});

test("reminders by email follow each member's email preference; the bell still reminds everyone", async () => {
  const withMail = everyone.map(m => (m.id === hugo.id ? m : { ...m, email: `${m.firstName.toLowerCase()}@atelier.test` }));
  const prefs = withMail.map(m => (m.id === tom.id ? { ...m, mailPreference: "none" as const } : m.id === lea.id ? { ...m, mailPreference: "digest" as const } : m));
  const chest = await fakeChest({ members: prefs, groups: chestGroups, capabilities: ["members", "notifications", "mail"], mail: { domain: "atelier.test" }, chest: { timeZone: zone } });
  try {
    const { sql } = database;
    const made = await polls.createPoll(sql, asMember(sofia), { kind: "choice", title: "Offsite?", options: ["Yes", "No"], closes: { day: "2026-10-09", time: "12:00" }, open: true }, ctx);
    await tell.runTellings(sql, now);
    const q = (await polls.load(sql, made.id)).questions[0]!;
    for (const p of [hugo, camille]) await answer(sql, asMember(p), made.id, { [q.id]: { options: [q.options[0]!.id] } }, now);
    await polls.nudge(sql, asMember(sofia), made.id, now);
    await tell.runTellings(sql, now);
    // Inès wants every email; Tom none; Léa one a day, from the Chest.
    const mails = chest.outbox.filter(m => m.subject.includes("Offsite?"));
    assert.deepEqual(mails.map(m => m.to), [["inès@atelier.test"]]);
    assert.deepEqual(chest.held.filter(h => h.subject.includes("Offsite?")).map(h => [h.member, h.reason]).sort(), [[lea.id, "digest"], [tom.id, "none"]].sort());
    for (const who of [tom, lea, ines]) assert.ok(chest.notifications.some(n => n.key === tell.askKey(made.id) && n.member === who.id && /Offsite\?/u.test(n.title)), `${who.firstName}'s bell`);
  } finally {
    await chest.close();
  }
});

test("new words over answers already given: the poll says after how many", async () => {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(sofia), { kind: "choice", title: "Lunch?", options: ["Pizza", "Sushi"], open: true }, ctx);
  await polls.editOpen(sql, asMember(sofia), made.id, { title: "Lunch on Friday?" }, ctx);
  assert.equal((await polls.load(sql, made.id)).editedAfter, null, "nobody had answered");
  const q = (await polls.load(sql, made.id)).questions[0]!;
  for (const p of [hugo, ines]) await answer(sql, asMember(p), made.id, { [q.id]: { options: [q.options[0]!.id] } }, now);
  await polls.editOpen(sql, asMember(sofia), made.id, { title: "Lunch on Thursday?" }, ctx);
  assert.equal((await polls.load(sql, made.id)).editedAfter, 2);
});

test("eNPS: 0 to 10, promoters minus detractors, kept as counts in an anonymous poll", async () => {
  assert.deepEqual(enps([1, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2]), { score: 25, promoters: 4, passives: 2, detractors: 2, total: 8 });
  assert.equal(enps(Array(11).fill(0)), null);
  assert.equal(readAnswer({ q: { value: 10 } }, [{ id: "q", kind: "enps", multiple: false, other: false, options: [] }]).get("q")?.kind, "enps");
  assert.throws(() => readAnswer({ q: { value: 11 } }, [{ id: "q", kind: "enps", multiple: false, other: false, options: [] }]), refuses("invalid"));
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(sofia), { kind: "survey", title: "Pulse", anonymous: true, questions: [{ kind: "enps", text: "Recommend us?" }], open: true }, ctx);
  const q = (await polls.load(sql, made.id)).questions[0]!;
  for (const [p, v] of [[hugo, 10], [ines, 9], [lea, 8], [tom, 3], [camille, 0], [sofia, 10]] as const) await answer(sql, asMember(p), made.id, { [q.id]: { value: v } }, now);
  await polls.closePoll(sql, asMember(sofia), made.id, now);
  const r = (await polls.view(sql, asMember(hugo), made.id, now)).results![0]!;
  assert.ok(r.kind === "enps");
  assert.equal(r.score, 17);
  assert.deepEqual(r.bands, { detractors: 2, passives: 1, promoters: 3 });
});

test("rounds come back every week or month, on the Chest's clock; missed rounds are skipped", () => {
  assert.equal(roundAt("2026-10-05", "10:00", "week", 1, zone).toISOString(), "2026-10-12T08:00:00.000Z");
  // Across the change to winter time: still 10:00 in Paris.
  assert.equal(roundAt("2026-10-19", "10:00", "week", 1, zone).toISOString(), "2026-10-26T09:00:00.000Z");
  // The 31st of a month without one: its last day.
  assert.equal(roundAt("2026-01-31", "09:00", "month", 1, zone).toISOString(), "2026-02-28T08:00:00.000Z");
  assert.equal(roundAt("2026-01-31", "09:00", "month", 2, zone).toISOString(), "2026-03-31T07:00:00.000Z");
  const next = nextAfter({ firstDay: "2026-10-05", atTime: "10:00", every: "week" }, new Date("2026-11-03T12:00:00Z"), zone);
  assert.equal(next.at.toISOString(), "2026-11-09T09:00:00.000Z");
  assert.equal(next.k, 5);
});

test("a weekly pulse: each round opens by itself for the same people, the last one closes, results compared over time", async () => {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(camille), {
    kind: "survey", title: "How was this week?", anonymous: true, repeat: "week", closes: { day: "2026-12-01", time: "10:00" },
    questions: [{ kind: "scale", text: "Your week?" }, { kind: "enps", text: "Recommend us?" }, { kind: "text", text: "Anything?" }],
    open: true,
  }, ctx);
  const first = await polls.load(sql, made.id);
  assert.equal(first.round, 1);
  assert.equal(first.closesAt, "2026-10-12T08:00:00.000Z", "closes when the next round opens, not on the date asked");
  assert.deepEqual(await seriesState(sql, first.seriesId), { every: "week", stopped: false, nextAt: "2026-10-12T08:00:00.000Z" });
  const [scale, rec] = first.questions.map(q => q.id) as [string, string];
  for (const [p, v] of [[hugo, 3], [ines, 4], [lea, 4], [tom, 5], [sofia, 2]] as const) await answer(sql, asMember(p), made.id, { [scale]: { value: v }, [rec]: { value: v * 2 } }, now);
  // Nothing before its time.
  assert.deepEqual(await openRounds(sql, zone, later(6)), []);
  // A week later: round 2, the same questions and people; round 1 closed.
  const monday = new Date("2026-10-12T08:00:00Z");
  const second = (await openRounds(sql, zone, monday))[0]!;
  const round2 = await polls.load(sql, second!);
  assert.equal(round2.round, 2);
  assert.equal(round2.status, "open");
  assert.equal(round2.anonymous, true);
  assert.deepEqual([round2.everyone, round2.groups], [first.everyone, first.groups]);
  assert.deepEqual(round2.questions.map(q => [q.kind, q.text]), first.questions.map(q => [q.kind, q.text]));
  assert.equal(round2.closesAt, "2026-10-19T08:00:00.000Z");
  assert.equal((await polls.load(sql, made.id)).status, "closed");
  assert.deepEqual((await sql`select kind from tellings where poll_id = ${second}`).map(r => r["kind"]), ["ask"]);
  assert.deepEqual(await openRounds(sql, zone, monday), [], "once");
  // Over time: round 1 (closed, five answers) has its numbers; round 2 is open.
  const lines = await trend(sql, asMember(hugo), round2);
  assert.deepEqual(lines.map(l => [l.kind, l.points.map(p => p.value)]), [["scale", [3.6, null]], ["enps", [-20, null]]]);
  assert.deepEqual(lines[0]!.points.map(p => p.open), [false, true]);
  // Hugo cannot stop it; Camille can, and start it again.
  await assert.rejects(repeatSeries(sql, asMember(hugo), second, false, zone, monday), refuses("not_found"));
  await repeatSeries(sql, asMember(camille), second, false, zone, monday);
  assert.deepEqual(await openRounds(sql, zone, later(8, monday)), [], "stopped");
  await repeatSeries(sql, asMember(camille), second, true, zone, later(8, monday));
  assert.equal((await seriesState(sql, round2.seriesId))!.nextAt, "2026-10-26T09:00:00.000Z");
  // A closed round is not reopened: the next round is the way on.
  await assert.rejects(polls.reopenPoll(sql, asMember(camille), second, later(8, monday)), refuses("anonymous_final"));
  // Its organiser leaves: no more rounds.
  await leave(sql, camille.id);
  assert.equal((await seriesState(sql, round2.seriesId))!.stopped, true);
});

test("a named weekly pulse: its averages come from the answers", async () => {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(sofia), { kind: "survey", title: "Sprint check", repeat: "week", questions: [{ kind: "scale", text: "Sprint?" }], open: true }, ctx);
  const q = (await polls.load(sql, made.id)).questions[0]!;
  await answer(sql, asMember(hugo), made.id, { [q.id]: { value: 4 } }, now);
  await answer(sql, asMember(ines), made.id, { [q.id]: { value: 5 } }, now);
  const [next] = await openRounds(sql, zone, new Date("2026-10-12T08:00:00Z"));
  const lines = await trend(sql, asMember(sofia), await polls.load(sql, next!));
  assert.deepEqual(lines[0]!.points.map(p => [p.value, p.answered]), [[4.5, 2], [null, 0]]);
  // Only surveys repeat.
  await assert.rejects(polls.createPoll(sql, asMember(sofia), { kind: "choice", title: "x", options: ["a", "b"], repeat: "week", open: true }, ctx), refuses("invalid"));
});

test("a second pulse under a running pulse's name is named apart: “(2)”, kept by its rounds", async () => {
  const { sql } = database;
  const spec = (title: string) => ({ kind: "survey", title, anonymous: true, repeat: "week", questions: [{ kind: "scale", text: "Your week?" }], open: true });
  const first = await polls.createPoll(sql, asMember(camille), spec("Météo de l’équipe"), ctx);
  const second = await polls.createPoll(sql, asMember(sofia), spec("météo de l’équipe"), ctx);
  const third = await polls.createPoll(sql, asMember(sofia), spec("Météo de l’équipe"), ctx);
  assert.equal((await polls.load(sql, first.id)).title, "Météo de l’équipe");
  assert.equal((await polls.load(sql, second.id)).title, "météo de l’équipe (2)");
  assert.equal((await polls.load(sql, third.id)).title, "Météo de l’équipe (3)");
  assert.equal((await openRounds(sql, zone, new Date("2026-10-12T08:00:00Z"))).length, 3);
  const titles = (await sql<{ title: string }[]>`select title from polls where round = 2 order by id`).map(r => r.title);
  assert.deepEqual(titles, ["Météo de l’équipe", "météo de l’équipe (2)", "Météo de l’équipe (3)"], "each round keeps its series' name");
  // A stopped pulse frees its name; a plain survey never takes a number.
  await repeatSeries(sql, asMember(camille), first.id, false, zone, new Date("2026-10-12T09:00:00Z"));
  const fourth = await polls.createPoll(sql, asMember(camille), { ...spec("Météo de l’équipe"), repeat: undefined }, ctx);
  assert.equal((await polls.load(sql, fourth.id)).title, "Météo de l’équipe");
});
