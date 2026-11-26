import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { idempotencyKey } from "@argentic/chest-sdk/mail";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { answer } from "../src/lib/answers.ts";
import { AppError } from "@argentic/chest-app";
import { emailGuests, eventKey, guestMailOffered, learned, notInCalendar, syncFinal } from "../src/lib/agenda.ts";
import * as guests from "../src/lib/guests.ts";
import { erase } from "../src/lib/lifecycle.ts";
import { limits } from "../src/lib/model.ts";
import * as polls from "../src/lib/polls.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, chestGroups, everyone, hugo, ines, lea, sofia, tom } from "./support/members.ts";

// Guests outside the Chest on a date poll (lib/guests.ts) (their form's
// guard is the package's: test/app.test.mjs), and the chosen date in calendars and guests'
// inboxes (lib/agenda.ts).
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, groups: chestGroups, capabilities: ["members", "notifications", "mail", "calendar"], mail: { replyTo: "hello@atelier.test" }, calendar: { domain: "atelier.test", toolTitle: "Polls", company: "Atelier" }, chest: { timeZone: "Europe/Paris", organization: "Atelier Martin" } });
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
  await assert.rejects(guests.answerAsGuest(sql, link, { name: "Jean", email: "not an address", dates: { [first]: 2 }, locale: "en" }, now), refuses("invalid_email"));
  await assert.rejects(guests.answerAsGuest(sql, link, { name: "Jean", email: "Jean <jean@client.example>", dates: { [first]: 2 }, locale: "en" }, now), refuses("invalid_email"));
  await assert.rejects(guests.answerAsGuest(sql, link, { name: "Jean", email: "", dates: { "999": 2 }, locale: "en" }, now), refuses("invalid"));
  const jean = await guests.answerAsGuest(sql, link, { name: "Jean Dupont", email: "Jean@Client.example", dates: { [first]: 2, [second]: 1 }, locale: "fr" }, now);
  assert.equal(jean.first, true);
  assert.match(jean.secret, /^[A-Za-z0-9_-]{32}$/u);
  const [row] = await sql`select member, guest_name, guest_email, guest_locale, guest_key from participants where poll_id = ${id}`;
  assert.deepEqual([row!["member"], row!["guest_name"], row!["guest_email"], row!["guest_locale"]], ["guest", "Jean Dupont", "Jean@client.example", "fr"], "the part before the @ as typed, the domain lower-cased");
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
  assert.deepEqual(data.guests.get(guestRow), { name: "Jean Dupont", email: "Jean@client.example" });
  // Managers see the guests and their emails; a member does not.
  assert.deepEqual((await guests.guests(sql, asMember(sofia), await polls.load(sql, id))).map(g => [g.name, g.email]), [["Jean Dupont", "Jean@client.example"]]);
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
  // Replies go to the company's own address (the connector's Reply-To), and the email says so.
  assert.equal(mail.replyTo, "hello@atelier.test");
  assert.ok(mail.text.endsWith("Les réponses à cet e-mail arrivent chez Atelier Martin."));
  assert.equal(await emailGuests(sql, id, "https://polls.atelier.test"), 1);
  assert.equal(chest.outbox.length, 1, "the same choice is not sent twice (its key)");
  // The company's mail not connected: nothing sent, nothing lost silently — the page stays the truth.
  chest.delivery.mail = "not_connected";
  try {
    await polls.chooseFinal(sql, asMember(sofia), id, null, now);
    await polls.chooseFinal(sql, asMember(sofia), id, (await polls.load(sql, id)).questions[0]!.options[1]!.id, new Date(now.getTime() + 60_000));
    assert.equal(await emailGuests(sql, id, "https://polls.atelier.test"), 0);
    assert.equal(chest.outbox.length, 1);
  } finally {
    chest.delivery.mail = "ready";
  }
  // Taken back, or the poll deleted: gone from every calendar.
  await polls.chooseFinal(sql, asMember(sofia), id, null, now);
  await syncFinal(sql, id);
  assert.equal(chest.calendar.has(eventKey(id)), false);
});

test("the guests' form offers email only when the Chest would send it (mail.available(), SDK studio.16)", async () => {
  assert.equal(await guestMailOffered(), true, "ready");
  chest.delivery.mail = "not_connected";
  assert.equal(await guestMailOffered(), false, "the company's mail not connected");
  chest.delivery.mail = "suspended";
  assert.equal(await guestMailOffered(), false, "sending suspended");
  chest.delivery.mail = "ready";
  const bare = await fakeChest({ network: {}, members: everyone, capabilities: ["members"] });
  try {
    assert.equal(await guestMailOffered(), false, "no mail on this Chest");
  } finally {
    await bare.close();
  }
});

test("a guest's email key carries their address (SDK studio.16: keys built from ids name the recipient)", async () => {
  const { sql } = database;
  const { id, first } = await openDinner();
  const link = await guests.setGuestLink(sql, asMember(sofia), id, true, now);
  await guests.answerAsGuest(sql, link, { name: "Jean", email: "jean@client.example", dates: { [first]: 2 }, locale: "fr" }, now);
  await polls.closePoll(sql, asMember(sofia), id, now);
  await polls.chooseFinal(sql, asMember(sofia), id, first, now);
  assert.equal(await emailGuests(sql, id, null), 1);
  const [jean] = await sql<{ id: string }[]>`select id::text as id from participants where poll_id = ${id} and guest_email = 'jean@client.example'`;
  const finalAt = new Date((await polls.load(sql, id)).finalAt!).getTime();
  // Longer than the Chest keeps: sent as its hash, never cut.
  assert.equal(chest.outbox.at(-1)!.key, idempotencyKey(`final:${id}:${jean!.id}:${finalAt}:jean@client.example`));
});

test("a Chest without the calendar: Polls learns it and keeps its file", async () => {
  const { sql } = database;
  const bare = await fakeChest({ network: {}, members: everyone, groups: chestGroups, capabilities: ["members", "notifications"], calendar: false });
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

test("a date chosen for more than 1,000 people goes to their calendars in parts of 1,000, put in one batch", async () => {
  const { sql } = database;
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  const code = (n: number) => Array.from({ length: 4 }, (_, i) => alphabet[Math.floor(n / 32 ** i) % 32]).join("");
  const crowd = Array.from({ length: 2345 }, (_, n) => ({ ...tom, id: `mbr_crowd${code(n)}${"a".repeat(17)}`, firstName: "Person", lastName: String(n), name: `Person ${n}`, groups: [] }));
  const big = await fakeChest({ network: {}, members: [...everyone, ...crowd], groups: chestGroups, capabilities: ["members", "notifications", "calendar"], calendar: { domain: "atelier.test", toolTitle: "Polls", company: "Atelier" }, chest: { timeZone: "Europe/Paris" } });
  try {
    const { id, first, second } = await openDinner();
    const q = (await polls.load(sql, id)).questions[0]!;
    await answer(sql, asMember(hugo), id, { [q.id]: { dates: { [first]: 0, [second]: 2 } } }, now);
    await polls.closePoll(sql, asMember(sofia), id, now);
    await polls.chooseFinal(sql, asMember(sofia), id, first, now);
    await syncFinal(sql, id);
    // Everyone asked (6 with a role, less Hugo, plus 2,345): 2,350 in 3 parts.
    const parts = [eventKey(id), eventKey(id, 2), eventKey(id, 3)].map(k => big.calendar.get(k));
    assert.deepEqual(parts.map(p => p?.members.length), [1000, 1000, 350]);
    assert.equal(eventKey(id, 2), `poll:${id}:2`);
    assert.equal(big.calendar.has(eventKey(id, 4)), false);
    const all = parts.flatMap(p => p!.members);
    assert.equal(new Set(all).size, 2350, "each person once");
    assert.ok(!all.includes(hugo.id), "Hugo said no to it");
    assert.ok(parts.every(p => p!.path === `/chest/polls/${id}` && "start" in p! && p.start === "2026-10-20T17:00:00.000Z"));
    // Taken back: every part leaves every calendar.
    await polls.chooseFinal(sql, asMember(sofia), id, null, now);
    await syncFinal(sql, id);
    assert.equal(big.calendar.size, 0);
  } finally {
    await big.close();
  }
});

test("the Chest answers each part (calendar.putMany, SDK studio.16): a refused part is not taken for put, the others are", async () => {
  const { sql } = database;
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  const code = (n: number) => Array.from({ length: 4 }, (_, i) => alphabet[Math.floor(n / 32 ** i) % 32]).join("");
  const crowd = Array.from({ length: 2345 }, (_, n) => ({ ...tom, id: `mbr_crowd${code(n)}${"a".repeat(17)}`, firstName: "Person", lastName: String(n), name: `Person ${n}`, groups: [] }));
  const big = await fakeChest({ network: {}, members: [...everyone, ...crowd], groups: chestGroups, capabilities: ["members", "notifications", "calendar"], calendar: { domain: "atelier.test", toolTitle: "Polls", company: "Atelier" }, chest: { timeZone: "Europe/Paris" } });
  try {
    // The tool's 5,000 events nearly all used (other polls' dates): room
    // for two new parts, not three.
    const filler = { title: { en: "Other" }, days: { first: "2026-10-01", last: "2026-10-01" }, members: [tom.id], updated: now.toISOString(), sequence: 0 };
    for (let i = 0; i < 4998; i++) big.calendar.set(`other:${i}`, { ...filler, key: `other:${i}` } as never);
    const { id, first } = await openDinner();
    await polls.closePoll(sql, asMember(sofia), id, now);
    await polls.chooseFinal(sql, asMember(sofia), id, first, now);
    await syncFinal(sql, id);
    // 2,351 people in 3 parts: the first two put, the third refused (quota).
    assert.equal(big.calendar.get(eventKey(id))?.members.length, 1000);
    assert.equal(big.calendar.get(eventKey(id, 2))?.members.length, 1000);
    assert.equal(big.calendar.has(eventKey(id, 3)), false, "the refused part is not there");
    assert.equal(await learned(sql), "on", "the Chest has a calendar");
    const missing = await notInCalendar(sql, id);
    assert.equal(missing.size, 351, "its 351 people are not told it is in their calendar");
    const inFirst = big.calendar.get(eventKey(id))!.members[0]!;
    assert.equal(missing.has(inFirst), false, "the others are");
    // An erased member is taken out of that list.
    const someone = [...missing][0]!;
    await erase(sql, someone);
    assert.equal((await notInCalendar(sql, id)).has(someone), false);
    // Room again: the next sync puts the third part and forgets the refusal.
    for (let i = 0; i < 10; i++) big.calendar.delete(`other:${i}`);
    await syncFinal(sql, id);
    assert.equal(big.calendar.get(eventKey(id, 3))?.members.length, 351);
    assert.equal((await notInCalendar(sql, id)).size, 0);
    // Taken back: every part leaves every calendar.
    await polls.chooseFinal(sql, asMember(sofia), id, null, now);
    await syncFinal(sql, id);
    assert.equal([...big.calendar.keys()].filter(k => k.startsWith("poll:")).length, 0);
  } finally {
    await big.close();
  }
});

test("a part refused in the middle leaves a hole: taking the date back still removes every part", async () => {
  const { sql } = database;
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  const code = (n: number) => Array.from({ length: 4 }, (_, i) => alphabet[Math.floor(n / 32 ** i) % 32]).join("");
  const crowd = Array.from({ length: 2345 }, (_, n) => ({ ...tom, id: `mbr_crowd${code(n)}${"a".repeat(17)}`, firstName: "Person", lastName: String(n), name: `Person ${n}`, groups: [] }));
  const big = await fakeChest({ network: {}, members: [...everyone, ...crowd], groups: chestGroups, capabilities: ["members", "notifications", "calendar"], calendar: { domain: "atelier.test", toolTitle: "Polls", company: "Atelier" }, chest: { timeZone: "Europe/Paris" } });
  try {
    const { id, first } = await openDinner();
    await polls.closePoll(sql, asMember(sofia), id, now);
    await polls.chooseFinal(sql, asMember(sofia), id, first, now);
    // The Chest refuses the second part alone (as a later Chest may, for a
    // reason of its own): its answer for that event rewritten.
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const response = await real(input, init);
      const request = new Request(input, init);
      if (request.method !== "PUT" || new URL(request.url).pathname !== "/calendar/events") return response;
      const answer = await response.json() as { results: { key: string; error?: string }[] };
      answer.results = answer.results.map(r => (r.key === eventKey(id, 2) ? { key: r.key, error: "invalid_event", message: "refused" } : r));
      return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      await syncFinal(sql, id);
    } finally {
      globalThis.fetch = real;
    }
    // The fake kept what it was sent; the tool took the refusal: it removed
    // part 2 (as a Chest that refused it would not hold it).
    assert.equal(big.calendar.has(eventKey(id)), true);
    assert.equal(big.calendar.has(eventKey(id, 2)), false);
    assert.equal(big.calendar.has(eventKey(id, 3)), true);
    assert.equal((await notInCalendar(sql, id)).size, 1000);
    await polls.chooseFinal(sql, asMember(sofia), id, null, now);
    await syncFinal(sql, id);
    assert.equal(big.calendar.has(eventKey(id, 3)), false, "part 3, after the hole, is removed too");
    assert.equal((await notInCalendar(sql, id)).size, 0);
  } finally {
    await big.close();
  }
});
