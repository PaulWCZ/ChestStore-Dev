import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest, type FakeMember } from "@argentic/chest-sdk/testing";
import { POST as job } from "../app/chest-jobs/[name]/route.ts";
import { answer } from "../lib/answers.ts";
import * as polls from "../lib/polls.ts";
import * as tell from "../lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, chestGroups, everyone, groups, hugo, ines, lea, nora, sofia, tom } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
});
after(async () => {
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate polls, tellings restart identity cascade`;
});
const open = async (members: FakeMember[] = everyone) => {
  chest = await fakeChest({ members, groups: chestGroups, capabilities: ["members", "notifications"], schedules: [{ name: "pass", cron: "*/15 * * * *" }], chest: { timeZone: "Europe/Paris" } });
  return chest;
};

const now = new Date("2026-10-05T08:00:00Z");
const ctx = { zone: "Europe/Paris", now, today: "2026-10-05", known: null };
const lunch = { kind: "choice", title: "Lunch on Friday?", options: ["Pizza", "Sushi"], open: true };
const items = (key: string) => chest.notifications.filter(n => n.key === key);

test("a sent poll is told to everyone it asks, each in their language — not its organiser, not those without a role", async () => {
  await open();
  try {
    const made = await polls.createPoll(database.sql, asMember(sofia), { ...lunch, closes: { day: "2026-10-09", time: "12:00" } }, ctx);
    const result = await tell.runTellings(database.sql, now);
    assert.deepEqual(result, { told: [`${made.id}:ask`], waiting: [] });
    const asked = items(tell.askKey(made.id));
    assert.deepEqual(asked.map(n => n.member).sort(), [camille.id, ines.id, hugo.id, lea.id, tom.id].sort());
    assert.equal(asked.find(n => n.member === hugo.id)!.title, "Sofia Rossi asks: Lunch on Friday?");
    assert.equal(asked.find(n => n.member === ines.id)!.title, "Sofia Rossi demande : Lunch on Friday?");
    assert.equal(asked.find(n => n.member === hugo.id)!.body, "Answer before Fri 9 Oct, 12:00.");
    assert.equal(asked[0]!.path, `/chest/polls/${made.id}`);
    assert.equal(chest.badges.get(hugo.id), 1);
    assert.equal(chest.badges.get(sofia.id), 1, "the organiser is asked too: a number, no bell item");
    assert.equal(chest.badges.get(nora.id), undefined);
    // Told once: the queue is empty.
    assert.deepEqual(await tell.runTellings(database.sql, now), { told: [], waiting: [] });
    // Answering takes it out of that bell and off the tile.
    const q = (await polls.load(database.sql, made.id)).questions[0]!;
    await answer(database.sql, asMember(hugo), made.id, { [q.id]: { options: [q.options[0]!.id] } }, now);
    await tell.answered(database.sql, asMember(hugo), made.id);
    assert.ok(!items(tell.askKey(made.id)).some(n => n.member === hugo.id));
    assert.equal(chest.badges.get(hugo.id), undefined);
  } finally {
    await chest.close();
  }
});

test("a group poll is told to its groups only", async () => {
  await open();
  try {
    const made = await polls.createPoll(database.sql, asMember(sofia), { ...lunch, audience: { everyone: false, groups: [groups.sales, groups.tech] } }, ctx);
    await tell.runTellings(database.sql, now);
    assert.deepEqual(items(tell.askKey(made.id)).map(n => n.member).sort(), [ines.id, hugo.id, lea.id, tom.id].sort());
    assert.equal(chest.badges.get(camille.id), undefined);
  } finally {
    await chest.close();
  }
});

test("the day before it closes, those who have not answered are reminded — once; a quick poll is not", async () => {
  await open();
  try {
    const sql = database.sql;
    const made = await polls.createPoll(sql, asMember(sofia), { ...lunch, closes: { day: "2026-10-06", time: "20:00" } }, ctx);
    const quick = await polls.createPoll(sql, asMember(sofia), { ...lunch, title: "Quick", closes: { day: "2026-10-05", time: "20:00" } }, ctx);
    await tell.runTellings(sql, now);
    const q = (await polls.load(sql, made.id)).questions[0]!;
    await answer(sql, asMember(ines), made.id, { [q.id]: { options: [q.options[1]!.id] } }, now);
    await tell.answered(sql, asMember(ines), made.id);
    // Twelve hours later, it closes within a day.
    const later = new Date(now.getTime() + 12 * 36e5);
    const result = await tell.pass(sql, later);
    assert.ok(result.told.includes(`${made.id}:remind`));
    assert.ok(!result.told.includes(`${quick.id}:remind`), "sent less than a day before its closing: no reminder");
    const reminded = items(tell.askKey(made.id));
    assert.deepEqual(reminded.map(n => n.member).sort(), [camille.id, hugo.id, lea.id, tom.id].sort());
    assert.equal(reminded.find(n => n.member === hugo.id)!.title, "Closes tomorrow: Lunch on Friday?");
    assert.equal(reminded.find(n => n.member === camille.id)!.title, "Se termine demain : Lunch on Friday?");
    const before = chest.notifications.length;
    await tell.pass(sql, new Date(later.getTime() + 36e5));
    assert.equal(chest.notifications.length, before, "once");
  } finally {
    await chest.close();
  }
});

test("closed by its date: every 'asks you' item goes, tiles drop, the organiser is told; the date is told to all", async () => {
  await open();
  try {
    const sql = database.sql;
    const made = await polls.createPoll(sql, asMember(sofia), { kind: "date", title: "Christmas party", dates: [{ day: "2026-12-11" }, { day: "2026-12-18", start: "19:00", end: "23:00" }], closes: { day: "2026-10-06", time: "12:00" }, open: true }, ctx);
    await tell.runTellings(sql, now);
    assert.equal(chest.badges.get(hugo.id), 1);
    const after = new Date("2026-10-06T10:30:00Z");
    const result = await tell.pass(sql, after);
    assert.deepEqual(result.settled, [made.id]);
    assert.equal(items(tell.askKey(made.id)).length, 0);
    assert.equal(chest.badges.get(hugo.id), undefined);
    const closed = chest.notifications.filter(n => n.member === sofia.id);
    assert.deepEqual(closed.map(n => [n.title, n.body]), [["Your poll is closed: Christmas party", "Pick the date and tell everyone."]]);
    // Settled once.
    assert.deepEqual((await tell.pass(sql, after)).settled, []);
    // The date chosen: everyone asked hears it, in their language.
    const option = (await polls.load(sql, made.id)).questions[0]!.options[1]!;
    await polls.chooseFinal(sql, asMember(sofia), made.id, option.id, after);
    await tell.runTellings(sql, after);
    const told = items(tell.finalKey(made.id));
    assert.equal(told.length, 5);
    assert.deepEqual([told.find(n => n.member === hugo.id)!.title, told.find(n => n.member === hugo.id)!.body], ["Date chosen: Christmas party", "Friday 18 December · 19:00 – 23:00"]);
    assert.equal(told.find(n => n.member === lea.id)!.body, "vendredi 18 décembre · 19:00 – 23:00");
    // Deleted: its items leave every bell.
    const poll = await polls.deletePoll(sql, asMember(sofia), made.id, after);
    await tell.removed(sql, poll);
    assert.equal(items(tell.finalKey(made.id)).length, 0);
  } finally {
    await chest.close();
  }
});

test("the pass runs on the Chest's schedule; a call not signed by the Chest is refused", async () => {
  await open();
  try {
    const made = await polls.createPoll(database.sql, asMember(sofia), lunch, ctx);
    assert.equal(await chest.run("pass", job), 204);
    assert.equal(items(tell.askKey(made.id)).length, 5);
    assert.equal((await job(new Request("http://tool.test/chest-jobs/pass", { method: "POST", body: "{}" }))).status, 401);
  } finally {
    await chest.close();
  }
});

test("over the Chest's quotas, a telling waits and goes on later from where it stopped", async () => {
  const letters = "abcdefghijklmnopqrstuvwxyz234567";
  const crowd: FakeMember[] = Array.from({ length: 1300 }, (_, i) => {
    const code = [...Array(4)].map((_, k) => letters[Math.floor(i / 32 ** k) % 32]).join("");
    return { id: "mbr_" + code + "q".repeat(22), firstName: "P" + i, lastName: "Crowd", name: `P${i} Crowd`, photo: null, role: "member", isAdmin: false, isBuilder: false, groups: [], language: "en" };
  });
  await open([sofia, ...crowd]);
  try {
    const sql = database.sql;
    // A reminder goes a page of 500 at a time: the third page is over the
    // 1,000 recipients an hour.
    const made = await polls.createPoll(sql, asMember(sofia), { ...lunch, closes: { day: "2026-10-06", time: "20:00" } }, ctx);
    await sql`delete from tellings`;
    const later = new Date(now.getTime() + 12 * 36e5);
    await tell.queueReminders(sql, later);
    const first = await tell.runTellings(sql, later);
    assert.deepEqual(first, { told: [], waiting: [`${made.id}:remind`] });
    assert.equal(items(tell.askKey(made.id)).length, 1000);
    const [row] = await sql<{ after: string | null }[]>`select after from tellings where poll_id = ${made.id}`;
    assert.ok(row!.after, "the cursor where it stopped");
    // Still over: nobody told twice.
    await tell.runTellings(sql, later);
    assert.equal(items(tell.askKey(made.id)).length, 1000);
    // Thirty broadcasts an hour: the thirty-first poll waits for the next pass.
    await sql`delete from tellings`;
    for (let i = 0; i < 31; i++) await polls.createPoll(sql, asMember(sofia), { ...lunch, title: "Q" + i }, ctx);
    for (let i = 0; i < 4; i++) await tell.runTellings(sql, later);
    assert.equal((await sql`select 1 from tellings`).length, 1);
  } finally {
    await chest.close();
  }
});
