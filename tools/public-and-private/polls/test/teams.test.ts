import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeMember } from "@argentic/chest-sdk/testing";
import { answer } from "../src/lib/answers.ts";
import { AppError } from "../src/core/tool.ts";
import { forgetGroups } from "../src/lib/groups.ts";
import * as polls from "../src/lib/polls.ts";
import { teamResults, visibleTeams } from "../src/lib/teams.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, sofia } from "./support/members.ts";

// Company surveys: organisers only by default; an anonymous survey read
// per team (Proposal (studio): "groups": "read"), each group from 5
// answers and never when subtraction would tell a smaller group.
let database: TestDatabase;
before(async () => {
  database = await testDatabase();
});
after(async () => {
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate polls, tellings, series, comments restart identity cascade`;
  await database.sql`update settings set members_create = true, members_surveys = false`;
  forgetGroups();
});

const zone = "Europe/Paris";
const now = new Date("2026-10-05T08:00:00Z");
const ctx = { zone, now, today: "2026-10-05", known: null };
const refuses = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const pulse = { kind: "survey", title: "How was this week?", anonymous: true, repeat: "week", closes: { day: "2026-12-01", time: "10:00" }, questions: [{ kind: "scale", text: "Your week?" }], open: true };
const enpsOnce = { kind: "survey", title: "Recommend us?", anonymous: true, questions: [{ kind: "enps", text: "Would you recommend us?" }], open: true };

test("a pulse or an eNPS survey is for organisers, unless an admin opens it to members; a plain survey stays open to all", async () => {
  const { sql } = database;
  await assert.rejects(polls.createPoll(sql, asMember(hugo), pulse, ctx), refuses("forbidden"));
  await assert.rejects(polls.createPoll(sql, asMember(hugo), enpsOnce, ctx), refuses("forbidden"));
  assert.equal((await polls.createPoll(sql, asMember(hugo), { ...enpsOnce, questions: [{ kind: "scale", text: "Lunch?" }] }, ctx)).status, "open");
  // A draft cannot become one either.
  const draft = await polls.createPoll(sql, asMember(hugo), { ...enpsOnce, questions: [{ kind: "scale", text: "Lunch?" }], open: false }, ctx);
  await assert.rejects(polls.updateDraft(sql, asMember(hugo), draft.id, enpsOnce, ctx), refuses("forbidden"));
  assert.equal((await polls.createPoll(sql, asMember(sofia), pulse, ctx)).status, "open", "organisers always");
  await assert.rejects(polls.setPolicy(sql, asMember(sofia), { membersSurveys: true }), refuses("forbidden"));
  await assert.rejects(polls.setPolicy(sql, asMember(camille), { membersSurveys: "yes" }), refuses("invalid"));
  await assert.rejects(polls.setPolicy(sql, asMember(camille), {}), refuses("invalid"));
  assert.deepEqual(await polls.setPolicy(sql, asMember(camille), { membersSurveys: true }), { membersCreate: true, membersSurveys: true });
  assert.equal((await polls.createPoll(sql, asMember(hugo), enpsOnce, ctx)).status, "open");
  // Members who may start nothing start no survey either.
  await polls.setPolicy(sql, asMember(camille), { membersCreate: false });
  assert.deepEqual(await polls.policy(sql), { membersCreate: false, membersSurveys: true });
  await assert.rejects(polls.createPoll(sql, asMember(hugo), pulse, ctx), refuses("forbidden"));
});

test("which groups may show: the floor, the whole company, a group inside another, groups apart that add up", () => {
  const set = (...ids: string[]) => new Set(ids);
  const m = (...ids: string[]) => new Set(ids);
  // Floor: 4 answers never show.
  assert.deepEqual(visibleTeams(20, [{ id: "a", n: 4 }, { id: "b", n: 8 }], null), set("b"));
  // The whole minus a group: 2 people outside it → hidden.
  assert.deepEqual(visibleTeams(10, [{ id: "a", n: 8 }], null), set());
  assert.deepEqual(visibleTeams(10, [{ id: "a", n: 10 }], null), set("a"), "everyone is in it: nothing to subtract");
  // A group inside another, 1 to 4 apart: the smaller hides.
  const nested = new Map([["big", m("1", "2", "3", "4", "5", "6", "7")], ["small", m("1", "2", "3", "4", "5")]]);
  assert.deepEqual(visibleTeams(30, [{ id: "big", n: 7 }, { id: "small", n: 5 }], nested), set("big"));
  // The same counts, apart: both show.
  const apart = new Map([["big", m("1", "2", "3", "4", "5", "6", "7")], ["small", m("8", "9", "10", "11", "12")]]);
  assert.deepEqual(visibleTeams(30, [{ id: "big", n: 7 }, { id: "small", n: 5 }], apart), set("big", "small"));
  // Unknown membership: every pair counts as nested (the safe side).
  assert.deepEqual(visibleTeams(30, [{ id: "big", n: 7 }, { id: "small", n: 5 }], null), set("big"));
  // Apart, adding up to all but 2: the smallest hides.
  assert.deepEqual(visibleTeams(14, [{ id: "big", n: 7 }, { id: "small", n: 5 }], apart), set("big"));
  // More than the total cannot happen: ignored.
  assert.deepEqual(visibleTeams(5, [{ id: "x", n: 6 }], null), set());
});

const g = (name: string) => "grp_" + name + "a".repeat(26 - name.length);
const person = (n: number): FakeMember => ({ id: "mbr_p" + "abcdefghijklmnop"[n] + "a".repeat(24), firstName: "P" + n, lastName: "Q", name: "P" + n + " Q", photo: null, role: "member", isAdmin: false, isBuilder: false, groups: [], language: "en" });
const people = Array.from({ length: 12 }, (_, i) => person(i));
const ids = (from: number, to: number) => people.slice(from, to).map(p => p.id);
const teams = [
  { id: g("sales"), name: "Sales", members: ids(0, 6) },
  { id: g("tech"), name: "Tech", members: ids(6, 11) },
  { id: g("paris"), name: "Paris", members: ids(0, 5), grants: false },
  { id: g("tiny"), name: "Tiny", members: [...ids(11, 12), ...ids(0, 2)], grants: false },
];
const cast = [...people.map(p => ({ ...p, groups: teams.filter(t => t.members.includes(p.id)).map(t => t.id) })), { ...sofia, groups: [] }];

test("an anonymous survey per team: counts per group of 5 or more, shown once closed, never a group that could be worked out", async () => {
  const chest = await fakeChest({ network: {}, members: cast, groups: teams, capabilities: ["members", "notifications", "groups"], chest: { timeZone: zone } });
  try {
    const { sql } = database;
    const made = await polls.createPoll(sql, asMember(sofia), { kind: "survey", title: "Our week", anonymous: true, questions: [{ kind: "scale", text: "Your week?" }, { kind: "text", text: "Anything?" }], open: true }, ctx);
    const [scale, text] = (await polls.load(sql, made.id)).questions.map(q => q.id) as [string, string];
    for (const [i, p] of cast.slice(0, 12).entries()) await answer(sql, asMember(p), made.id, { [scale]: { value: i < 6 ? 4 : 2 }, [text]: { text: "Fine " + i } }, now);
    // Kept: counts per group, no member, never for Tiny (3 members).
    const rows = await sql<{ group_id: string; key: string; count: number }[]>`select group_id, key, count from group_tallies where poll_id = ${made.id} and question_id = ${scale} and key = 'n' order by group_id`;
    assert.deepEqual(rows.map(r => [r.group_id, r.count]), [[g("paris"), 5], [g("sales"), 6], [g("tech"), 5]]);
    assert.doesNotMatch(JSON.stringify(await sql`select * from group_tallies`), /mbr_/u);
    assert.equal((await sql`select count(*)::int as n from group_tallies where question_id = ${text}`)[0]!["n"], 0, "texts are never split");
    // Open: nothing per team, like the whole.
    assert.equal(await teamResults(sql, asMember(sofia), made.id, now), null);
    await polls.closePoll(sql, asMember(sofia), made.id, now);
    const r = (await teamResults(sql, asMember(cast[0]!), made.id, now))!;
    // Paris sits inside Sales, 1 apart: hidden. Sales and Tech are apart and
    // cover all but 1 of 12: Tech (the smaller) hides too.
    assert.deepEqual(r.teams.map(t => [t.name, t.answered]), [["Sales", 6]]);
    assert.equal(r.hidden, 2);
    const sales = r.teams[0]!.results[0]!;
    assert.ok(sales.kind === "scale" && sales.average === 4);
    assert.equal(r.teams[0]!.results.length, 1, "no text question per team");
  } finally {
    await chest.close();
  }
});
