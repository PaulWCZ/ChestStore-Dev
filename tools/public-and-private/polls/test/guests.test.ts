import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { formToken } from "@argentic/chest-sdk/visitors";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { answer } from "../lib/answers.ts";
import { AppError } from "../lib/app-error.ts";
import { emailGuests, eventKey, learned, syncFinal } from "../lib/agenda.ts";
import { checkForm, count } from "../lib/guard.ts";
import * as guests from "../lib/guests.ts";
import { limits } from "../lib/model.ts";
import * as polls from "../lib/polls.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, chestGroups, everyone, hugo, ines, lea, sofia, tom } from "./support/members.ts";

// Guests outside the Chest on a date poll (lib/guests.ts), the guard of
// their form (lib/guard.ts), and the chosen date in calendars and guests'
// inboxes (lib/agenda.ts).
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, groups: chestGroups, capabilities: ["members", "notifications", "mail", "calendar"], calendar: { domain: "atelier.test", toolTitle: "Polls", company: "Atelier" }, timeZone: "Europe/Paris" });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate polls, tellings, guest_counts restart identity cascade`;
  await database.sql`update settings set calendar = 'unknown'`;
  chest.calendar.clear();
  chest.outbox.length = 0;
});

const now = new Date("2026-10-05T08:00:00Z");
const ctx = { zone: "Europe/Paris", now, today: "2026-10-05", known: null };
const refuses = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const dinner = { kind: "date", title: "Dinner with the client", dates: [{ day: "2026-10-20", start: "19:00", end: "22:00" }, { day: "2026-10-21" }], open: true };

async function openDinner(extra: Record<string, unknown> = {}) {
  const made = await polls.createPoll(database.sql, asMember(sofia), { ...dinner, ...extra }, ctx);
  const poll = await polls.load(database.sql, made.id);
  const [first, second] = poll.questions[0]!.options.map(o => o.id) as [string, string];
  return { id: made.id, first, second };
}

test("only those who manage a named date poll open it to guests; off stops the link, on again is a new link", async () => {
  const { sql } = database;
  const { id } = await openDinner();
  await assert.rejects(guests.setGuestLink(sql, asMember(hugo), id, true, now), refuses("forbidden"));
  const link = await guests.setGuestLink(sql, asMember(sofia), id, true, now);
  assert.match(link!, guests.linkPattern);
  assert.equal(await guests.setGuestLink(sql, asMember(sofia), id, true, now), link, "on twice: the same link");
  assert.equal((await guests.byLink(sql, link, { now })).id, id);
  // An admin manages it too.
  assert.equal(await guests.setGuestLink(sql, asMember(camille), id, false, now), null);
  await assert.rejects(guests.byLink(sql, link, { now }), refuses("not_found"), "the old link stops");
  const again = await guests.setGuestLink(sql, asMember(sofia), id, true, now);
  assert.notEqual(again, link);
  // Not a question, not an anonymous poll, not a closed one.
  const lunch = await polls.createPoll(sql, asMember(sofia), { kind: "choice", title: "Lunch?", options: ["A", "B"], open: true }, ctx);
  await assert.rejects(guests.setGuestLink(sql, asMember(sofia), lunch.id, true, now), refuses("invalid"));
  const secret = await polls.createPoll(sql, asMember(sofia), { ...dinner, anonymous: true }, ctx);
  await assert.rejects(guests.setGuestLink(sql, asMember(sofia), secret.id, true, now), refuses("invalid"));
  await assert.rejects(sql`update polls set guest_link = ${guests.newLink()} where id = ${secret.id}`, "the database refuses it too");
  await polls.closePoll(sql, asMember(sofia), id, now);
  await assert.rejects(guests.setGuestLink(sql, asMember(sofia), id, false, now).then(() => guests.setGuestLink(sql, asMember(sofia), id, true, now)), refuses("closed"), "off while closed, never on again");
  // A deleted poll's link opens nothing.
  await polls.deletePoll(sql, asMember(sofia), id, now);
  await assert.rejects(guests.byLink(sql, again, { now }), refuses("not_found"));
  await assert.rejects(guests.byLink(sql, "not-a-link", { now }), refuses("not_found"));
});

test("a guest answers with a name, no account; the results mark them; the members' count stays the members'", async () => {
  const { sql } = database;
  const { id, first, second } = await openDinner();
  const link = await guests.setGuestLink(sql, asMember(sofia), id, true, now);
  await assert.rejects(guests.answerAsGuest(sql, link, { name: "  ", email: "", dates: { [first]: 2 }, locale: "en" }, now), refuses("empty"));
  await assert.rejects(guests.answerAsGuest(sql, link, { name: "Jean", email: "not an address", dates: { [first]: 2 }, locale: "en" }, now), refuses("bad_email"));
  await assert.rejects(guests.answerAsGuest(sql, link, { name: "Jean", email: "", dates: { "999": 2 }, locale: "en" }, now), refuses("invalid"));
  const jean = await guests.answerAsGuest(sql, link, { name: "Jean Dupont", email: "Jean@Client.example", dates: { [first]: 2, [second]: 1 }, locale: "fr" }, now);
  assert.equal(jean.first, true);
  assert.match(jean.secret, /^[A-Za-z0-9_-]{32}$/u);
  const [row] = await sql`select member, guest_name, guest_email, guest_locale, guest_key from participants where poll_id = ${id}`;
  assert.deepEqual([row!["member"], row!["guest_name"], row!["guest_email"], row!["guest_locale"]], ["guest", "Jean Dupont", "jean@client.example", "fr"]);
  assert.notEqual(row!["guest_key"], jean.secret, "only the secret's hash is kept");
  await answer(sql, asMember(hugo), id, { [(await polls.load(sql, id)).questions[0]!.id]: { dates: { [first]: 2 } } }, now);
  const v = await polls.view(sql, asMember(sofia), id, now);
  assert.equal(v.answers, 1, "members only");
  assert.equal(v.guests, 1);
  const grid = v.results!.find(q => q.kind === "date");
  assert.ok(grid?.kind === "date");
  const rows = grid.grid.map(r => r.member);
  assert.ok(rows.includes(hugo.id));
  const guestRow = rows.find(m => m.startsWith("guest:"))!;
  assert.equal((await polls.guestNames(sql, id)).get(guestRow), "Jean Dupont");
  assert.deepEqual([grid.options[0]!.yes, grid.options[1]!.maybe], [2, 1], "guests count in the totals");
  assert.deepEqual(v.participants, [hugo.id], "the list of members who answered has no guest");
  // The export marks them, with their email (for those who manage it).
  const data = await polls.exportData(sql, asMember(sofia), id, now);
  assert.deepEqual(data.guests.get(guestRow), { name: "Jean Dupont", email: "jean@client.example" });
  // Managers see the guests and their emails; a member does not.
  assert.deepEqual((await guests.guests(sql, asMember(sofia), await polls.load(sql, id))).map(g => [g.name, g.email]), [["Jean Dupont", "jean@client.example"]]);
  assert.deepEqual(await guests.guests(sql, asMember(hugo), await polls.load(sql, id)), []);
});

test("a guest changes their answer with the secret their browser keeps; another secret is another guest", async () => {
  const { sql } = database;
  const { id, first, second } = await openDinner();
  const link = await guests.setGuestLink(sql, asMember(sofia), id, true, now);
  const jean = await guests.answerAsGuest(sql, link, { name: "Jean", email: "", dates: { [first]: 2 }, locale: "en" }, now);
  const changed = await guests.answerAsGuest(sql, link, { name: "Jean D.", email: "", dates: { [first]: 0, [second]: 2 }, locale: "en", secret: jean.secret }, now);
  assert.deepEqual([changed.first, changed.secret], [false, jean.secret]);
  const poll = await polls.load(sql, id);
  assert.deepEqual(await guests.mine(sql, poll, jean.secret), { id: (await guests.mine(sql, poll, jean.secret))!.id, name: "Jean D.", email: "", dates: { [first]: 0, [second]: 2 } });
  assert.equal(await guests.mine(sql, poll, "x".repeat(32)), null);
  await guests.answerAsGuest(sql, link, { name: "Jean", email: "", dates: { [first]: 2 }, locale: "en", secret: "y".repeat(32) }, now);
  assert.equal(await guests.guestCount(sql, id), 2, "an unknown secret answers as a new guest");
  // Closed: no answer, no change.
  await polls.closePoll(sql, asMember(sofia), id, now);
  await assert.rejects(guests.answerAsGuest(sql, link, { name: "Jean", email: "", dates: { [first]: 2 }, locale: "en", secret: jean.secret }, now), refuses("closed"));
});

test("a sign-up sheet: a guest's yes takes a place; a full date is refused", async () => {
  const { sql } = database;
  const { id, first } = await openDinner({ slots: 1 });
  const link = await guests.setGuestLink(sql, asMember(sofia), id, true, now);
  await assert.rejects(guests.answerAsGuest(sql, link, { name: "Jean", email: "", dates: { [first]: 1 }, locale: "en" }, now), refuses("invalid"), "no if need be on a sign-up sheet");
  await guests.answerAsGuest(sql, link, { name: "Jean", email: "", dates: { [first]: 2 }, locale: "en" }, now);
  await assert.rejects(guests.answerAsGuest(sql, link, { name: "Marie", email: "", dates: { [first]: 2 }, locale: "en" }, now), refuses("full"));
  const q = (await polls.load(sql, id)).questions[0]!;
  await assert.rejects(answer(sql, asMember(hugo), id, { [q.id]: { dates: { [first]: 2 } } }, now), refuses("full"), "a member cannot take a guest's place");
});

test("at most limits.guests guests per poll", async () => {
  const { sql } = database;
  const { id, first } = await openDinner();
  const link = await guests.setGuestLink(sql, asMember(sofia), id, true, now);
  await sql`insert into participants (poll_id, member, guest_name, guest_locale, guest_key)
    select ${id}, 'guest', 'G' || n, 'en', md5(n::text) || md5((n + 1000)::text) from generate_series(1, ${limits.guests}) n`;
  await assert.rejects(guests.answerAsGuest(sql, link, { name: "One more", email: "", dates: { [first]: 2 }, locale: "en" }, now), refuses("guests_full"));
});

test("a manager removes a guest's answer for good; nobody else may", async () => {
  const { sql } = database;
  const { id, first } = await openDinner();
  const link = await guests.setGuestLink(sql, asMember(sofia), id, true, now);
  await guests.answerAsGuest(sql, link, { name: "Spam", email: "", dates: { [first]: 2 }, locale: "en" }, now);
  const [g] = await guests.guests(sql, asMember(sofia), await polls.load(sql, id));
  await assert.rejects(guests.removeGuest(sql, asMember(hugo), id, g!.id), refuses("forbidden"));
  await assert.rejects(guests.removeGuest(sql, asMember(sofia), id, "999"), refuses("not_found"));
  await guests.removeGuest(sql, asMember(sofia), id, g!.id);
  assert.equal(await guests.guestCount(sql, id), 0);
  assert.equal((await sql`select count(*)::int as n from answers`)[0]!["n"], 0, "their answer with them");
});

test("the guest form's guard: a form not shown is refused, one sent too fast waits, the own counters stop a flood", async () => {
  await assert.rejects(checkForm("nonsense"), refuses("invalid"));
  let clock = Date.now();
  const token = formToken(clock);
  let slept = 0;
  await checkForm(token, () => clock, async ms => { slept = ms; clock += ms; });
  assert.ok(slept > 1000, "waited the seconds left: " + slept);
  const { sql } = database;
  for (let i = 0; i < limits.guestsPerVisitorHour; i++) await count(sql, "203.0.113.9", now);
  await assert.rejects(count(sql, "203.0.113.9", now), refuses("too_many"));
  await count(sql, "198.51.100.7", now);
  // The next hour starts again (and the hour before is deleted).
  await count(sql, "203.0.113.9", new Date(now.getTime() + 3_600_000));
  assert.equal((await sql`select count(*)::int as n from guest_counts where hour < ${new Date(now.getTime() + 3_600_000)}`)[0]!["n"], 0);
});

test("the chosen date goes to the calendars of those asked (not those who said no), and by email to guests who gave one", async () => {
  const { sql } = database;
  const { id, first, second } = await openDinner();
  const link = await guests.setGuestLink(sql, asMember(sofia), id, true, now);
  const q = (await polls.load(sql, id)).questions[0]!;
  await answer(sql, asMember(hugo), id, { [q.id]: { dates: { [first]: 0, [second]: 2 } } }, now);
  await answer(sql, asMember(ines), id, { [q.id]: { dates: { [first]: 2 } } }, now);
  await guests.answerAsGuest(sql, link, { name: "Jean", email: "jean@client.example", dates: { [first]: 2 }, locale: "fr" }, now);
  await guests.answerAsGuest(sql, link, { name: "Marie", email: "", dates: { [first]: 2 }, locale: "en" }, now);
  await polls.closePoll(sql, asMember(sofia), id, now);
  await polls.chooseFinal(sql, asMember(sofia), id, first, now);
  await syncFinal(sql, id);
  const event = chest.calendar.get(eventKey(id))!;
  assert.deepEqual(event.members.sort(), [camille.id, sofia.id, ines.id, lea.id, tom.id].sort(), "everyone asked but Hugo, who said no");
  assert.deepEqual(event.title, { en: "Dinner with the client" });
  assert.equal("start" in event ? event.start : null, "2026-10-20T17:00:00.000Z");
  assert.equal(event.path, `/chest/polls/${id}`);
  assert.equal(await learned(sql), "on");
  // A whole day.
  await polls.chooseFinal(sql, asMember(sofia), id, second, now);
  await syncFinal(sql, id);
  const whole = chest.calendar.get(eventKey(id))!;
  assert.deepEqual("days" in whole ? whole.days : null, { first: "2026-10-21", last: "2026-10-21" });
  assert.ok(chest.calendar.get(eventKey(id))!.members.includes(hugo.id), "Hugo said yes to this one");
  // Guests: an email to Jean, in French, with the link back; none to Marie.
  const sent = await emailGuests(sql, id, "https://polls.atelier.test");
  assert.equal(sent, 1);
  const mail = chest.outbox.at(-1)!;
  assert.deepEqual(mail.to, ["jean@client.example"]);
  assert.equal(mail.subject, "La date de «\u202fDinner with the client\u202f»");
  assert.match(mail.text, /mercredi 21 octobre/u);
  assert.ok(mail.text.includes(`https://polls.atelier.test/p/${link}`));
  assert.equal(await emailGuests(sql, id, "https://polls.atelier.test"), 1);
  assert.equal(chest.outbox.length, 1, "the same choice is not sent twice (its key)");
  // Taken back, or the poll deleted: gone from every calendar.
  await polls.chooseFinal(sql, asMember(sofia), id, null, now);
  await syncFinal(sql, id);
  assert.equal(chest.calendar.has(eventKey(id)), false);
});

test("a Chest without the calendar: Polls learns it and keeps its file", async () => {
  const { sql } = database;
  const bare = await fakeChest({ members: everyone, groups: chestGroups, capabilities: ["members", "notifications"], calendar: false });
  try {
    const { id, first } = await openDinner();
    await polls.closePoll(sql, asMember(sofia), id, now);
    await polls.chooseFinal(sql, asMember(sofia), id, first, now);
    await syncFinal(sql, id);
    assert.equal(await learned(sql), "off");
  } finally {
    await bare.close();
  }
});
