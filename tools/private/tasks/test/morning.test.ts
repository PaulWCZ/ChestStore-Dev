import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import type { Run } from "@argentic/chest-sdk/schedules";
import { onSchedule as POST } from "../src/lib/deliveries.ts";
import * as boards from "../src/lib/boards.ts";
import * as cards from "../src/lib/cards.ts";
import { chestToday } from "../src/lib/clock.ts";
import { en } from "../src/i18n/en.ts";
import { fr } from "../src/i18n/fr.ts";
import { erase } from "../src/lib/lifecycle.ts";
import { morning, reminder } from "../src/lib/morning.ts";
import * as reminders from "../src/lib/reminders.ts";
import { addDays } from "../src/shared/repeat.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";

// The weekday morning: one reminder per person, in their language, of what
// is due today and late — replaced, never doubled; taken back when nothing
// is due; never for cards done, archived or on a board they no longer see.

let database: TestDatabase;
let chest: FakeChest;
let chestZone: string | undefined;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, network: {} });
  chestZone = process.env["CHEST_TIME_ZONE"];
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  // Each test starts from an empty Tasks and an empty bell.
  await database.sql`delete from boards`;
  await database.sql`delete from reminders`;
  chest.notifications.length = 0;
  chest.badges.clear();
  process.env["CHEST_TIME_ZONE"] = chestZone;
});

// A run of the morning at that instant, on a Chest in that zone (a run is
// read on the Chest's clock: chest.timeZone, CHEST_TIME_ZONE).
const run = (scheduledAt: string, timeZone: string): Run => {
  process.env["CHEST_TIME_ZONE"] = timeZone;
  return { id: "run_" + "a".repeat(26), name: "morning", scheduledAt, attempt: 1 };
};
const bell = () => chest.notifications.map(n => [n.member, n.title, n.body, n.key, n.path]);

async function board(options: { visibility?: "team" | "private" } = {}) {
  const b = await boards.createBoard(database.sql, asMember(hugo), { name: "Morning", ...options }, en.templates.columns);
  const [todo, , done] = await boards.columns(database.sql, b.id);
  return { b, todo: todo!, done: done! };
}
async function card(boardId: string, columnId: string, title: string, due: string, people: string[]) {
  const c = await cards.addCard(database.sql, asMember(hugo), boardId, columnId, title);
  await cards.updateCard(database.sql, asMember(hugo), c.id, { due });
  await cards.setAssignees(database.sql, asMember(hugo), c.id, people);
  return c;
}

test("each person gets one item: due today and late, in their language; others none; every tile set", async () => {
  const { b, todo } = await board();
  const day = chestToday();
  await card(b.id, todo.id, "Call the bank", addDays(day, -2), [ines.id, hugo.id]);
  await card(b.id, todo.id, "Send the quote", day, [ines.id]);
  await card(b.id, todo.id, "Later thing", "2099-01-01", [camille.id]);
  chest.badges.set(camille.id, 4); // stale since yesterday
  chest.notifications.length = 0; // the assignment items
  assert.equal(await chest.run("morning", POST), 204);
  assert.deepEqual(bell(), [
    [ines.id, "1 tâche pour aujourd’hui, 1 tâche en retard", "En retard : Call the bank\nAujourd’hui : Send the quote", "digest", "/chest"],
    [hugo.id, "1 task late", "Late: Call the bank", "digest", "/chest"],
  ]);
  assert.equal(chest.badges.get(ines.id), 2);
  assert.equal(chest.badges.get(hugo.id), 1);
  assert.equal(chest.badges.get(camille.id), undefined);
  // Delivered again (at least once): the same items, not second ones.
  assert.equal(await chest.run("morning", POST), 204);
  assert.equal(chest.notifications.length, 2);
});

test("cards done, archived, in an archived column or board never remind", async () => {
  const { sql } = database;
  const { b, todo, done } = await board();
  const day = chestToday();
  const finished = await card(b.id, todo.id, "Finished", day, [ines.id]);
  await cards.moveCard(sql, asMember(hugo), finished.id, done.id, null, null);
  const archived = await card(b.id, todo.id, "Archived", day, [ines.id]);
  await cards.archiveCard(sql, asMember(hugo), archived.id, true);
  const other = await board();
  await card(other.b.id, other.todo.id, "On an archived board", day, [ines.id]);
  await boards.archiveBoard(sql, asMember(hugo), other.b.id, true);
  chest.notifications.length = 0;
  await morning(sql, run(new Date().toISOString(), "Europe/Paris"));
  assert.deepEqual(bell(), []);
});

test("someone who no longer sees a private board is not told of its cards", async () => {
  const { sql } = database;
  const { b, todo } = await board({ visibility: "private" });
  await boards.setPeople(sql, asMember(hugo), b.id, { people: [hugo.id, ines.id], owners: [hugo.id], groups: [] });
  await card(b.id, todo.id, "Secret plan", chestToday(), [ines.id]);
  await boards.setPeople(sql, asMember(hugo), b.id, { people: [hugo.id], owners: [hugo.id], groups: [] });
  chest.notifications.length = 0;
  await morning(sql, run(new Date().toISOString(), "Europe/Paris"));
  assert.deepEqual(bell(), []);
});

test("the reminder is taken back the morning nothing is due, or as soon as the last card is done", async () => {
  const { sql } = database;
  const { b, todo, done } = await board();
  const day = chestToday();
  const one = await card(b.id, todo.id, "Renew the insurance", day, [ines.id]);
  const two = await card(b.id, todo.id, "Pay the invoice", day, [hugo.id]);
  chest.notifications.length = 0;
  await morning(sql, run(new Date().toISOString(), "Europe/Paris"));
  assert.deepEqual(bell().map(n => n[0]), [ines.id, hugo.id]);
  // Inès does hers: her item goes at once (the action refreshes her tile).
  await cards.moveCard(sql, asMember(ines), one.id, done.id, null, null);
  const { refreshBadges } = await import("../src/lib/tell.ts");
  await refreshBadges(sql, [ines.id]);
  assert.deepEqual(bell().map(n => n[0]), [hugo.id]);
  // Hugo's card moves to next year: the next morning takes his item back.
  await cards.updateCard(sql, asMember(hugo), two.id, { due: "2099-01-01" });
  await morning(sql, run(new Date(Date.now() + 864e5).toISOString(), "Europe/Paris"));
  assert.deepEqual(bell(), []);
  assert.equal((await sql`select member_id from reminders where sent_on is not null`).length, 0);
});

test("one switch turns the reminder off (its item goes) and on again", async () => {
  const { sql } = database;
  const { b, todo } = await board();
  await card(b.id, todo.id, "Book the room", chestToday(), [ines.id]);
  chest.notifications.length = 0;
  await morning(sql, run(new Date().toISOString(), "Europe/Paris"));
  assert.equal(bell().length, 1);
  assert.equal(await reminders.reminderOn(sql, asMember(ines)), true);
  await reminders.setReminder(sql, asMember(ines), false);
  assert.equal(await reminders.reminderOn(sql, asMember(ines)), false);
  assert.deepEqual(bell(), []);
  await morning(sql, run(new Date().toISOString(), "Europe/Paris"));
  assert.deepEqual(bell(), []);
  // Her tile still counts what is due.
  assert.equal(chest.badges.get(ines.id), 1);
  await reminders.setReminder(sql, asMember(ines), true);
  await morning(sql, run(new Date().toISOString(), "Europe/Paris"));
  assert.equal(bell().length, 1);
  await assert.rejects(reminders.setReminder(sql, asMember(ines), "no"));
  await assert.rejects(reminders.reminderOn(sql, null));
  // Erased: the setting goes with the person.
  await erase(sql, ines.id);
  assert.equal((await sql`select * from reminders where member_id = ${ines.id}`).length, 0);
});

test("'today' is the day in the Chest's zone at the time of the run", async () => {
  const { sql } = database;
  const { b, todo } = await board();
  await card(b.id, todo.id, "Auckland Monday", "2026-09-28", [hugo.id]);
  chest.notifications.length = 0;
  // 07:30 in Auckland on Monday 28 September is still Sunday 27 in UTC.
  await morning(sql, run("2026-09-27T18:30:00Z", "Pacific/Auckland"));
  assert.deepEqual(bell().map(n => n[1]), ["1 task due today"]);
  // The same instant read in Los Angeles is the 27th: not due yet, taken back.
  await morning(sql, run("2026-09-27T18:30:00Z", "America/Los_Angeles"));
  assert.deepEqual(bell(), []);
  // Paris, the night summer time begins: 23:30 UTC on the 28 March is the 29th.
  await card(b.id, todo.id, "Spring", "2026-03-29", [lea.id, hugo.id]);
  await morning(sql, run("2026-03-28T23:30:00Z", "Europe/Paris"));
  assert.deepEqual(bell().map(n => [n[0], n[1]]).sort(), [[hugo.id, "1 task due today"], [lea.id, "1 tâche pour aujourd’hui"]]);
});

test("the morning makes a missing next card of a repeating card, due that day, and reminds of it", async () => {
  const { sql } = database;
  const { b, done } = await board();
  const c = await cards.addCard(sql, asMember(hugo), b.id, done.id, "Check the alarm");
  await cards.setAssignees(sql, asMember(hugo), c.id, [ines.id]);
  // Done without its next one, due last Friday, a daily routine.
  await sql`update cards set repeat = ${sql.json({ every: "day" })}, due_on = '2026-10-02', completed_at = now() where id = ${c.id}`;
  chest.notifications.length = 0;
  // Monday 5 October 2026, 07:30 in Paris.
  await morning(sql, run("2026-10-05T05:30:00Z", "Europe/Paris"));
  await morning(sql, run("2026-10-05T05:30:00Z", "Europe/Paris"));
  const made = await sql<{ id: string; due: string }[]>`select id, to_char(due_on, 'YYYY-MM-DD') as due from cards where title = 'Check the alarm' and id <> ${c.id}`;
  assert.deepEqual(made.map(m => m.due), ["2026-10-05"]);
  assert.deepEqual(bell(), [[ines.id, "1 tâche pour aujourd’hui", "Aujourd’hui : Check the alarm", "digest", "/chest"]]);
});

test("a long list stays within the bell's bounds, both lines kept", () => {
  const long = Array.from({ length: 40 }, (_, i) => "Task number " + i);
  const item = reminder(en, "en", { late: long, today: long });
  assert.ok([...item.body].length <= 280);
  assert.equal(item.body.split("\n").length, 2);
  assert.ok(item.body.split("\n")[1]!.startsWith("Today: "));
  assert.ok([...item.title].length <= 80);
  assert.equal(reminder(fr, "fr", { late: ["A", "B"], today: [] }).title, "2 tâches en retard");
  assert.equal(reminder(en, "en", { late: [], today: ["A", "B", "C"] }).body, "Today: A · B · C");
});
