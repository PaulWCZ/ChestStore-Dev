import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as candidates from "../src/lib/candidates.ts";
import * as interviews from "../src/lib/interviews.ts";
import * as outbox from "../src/lib/outbox.ts";
import * as selfSchedule from "../src/lib/self-schedule.ts";
import { addDays, dayOf, instantOf } from "../src/shared/time.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { application, openJob } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, nora } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({
    members: everyone,
    capabilities: ["members", "files", "notifications", "mail", "calendar"],
    mail: { domain: "atelier.test", mailboxes: ["jobs"] },
    calendar: { domain: "atelier.test", toolTitle: "Hiring", company: "Atelier Martin" },
    chest: { organization: "Atelier Martin", timeZone: "Europe/Paris" },
  });
});
after(async () => {
  await chest.close();
  await database.close();
});

const zone = "Europe/Paris";
const isTeam = async (id: string) => [camille.id, hugo.id, ines.id].includes(id);
const signer = async () => ({ name: "Camille Martin", firstName: "Camille" });
// The next Monday at least two days ahead: its weekdays are all to come.
function nextMonday(): string {
  let d = addDays(dayOf(new Date(), zone), 2);
  while (new Date(d + "T12:00:00Z").getUTCDay() !== 1) d = addDays(d, 1);
  return d;
}
const tokenOf = (link: string) => link.split("/interview/")[1]!.split("?")[0]!;

test("a recruiter sends a link; the candidate sees only the times when everyone is free, on weekdays, and chooses one: an interview, an email with its .ics, the calendars", async () => {
  const { sql } = database;
  const job = await openJob(sql, asMember(camille), "Self-scheduling");
  const c = (await candidates.apply(sql, application(job.slug))).candidate;
  const monday = nextMonday();
  // Hugo already has an interview on Monday 10:00–11:00.
  const other = (await candidates.apply(sql, { ...application(job.slug), email: "other@example.com", name: "Other Person" })).candidate;
  await interviews.schedule(sql, asMember(camille), other.id, { day: monday, time: "10:00", minutes: 60, people: [hugo.id], tell: false }, isTeam);

  await assert.rejects(selfSchedule.send(sql, asMember(hugo), c.id, { people: [hugo.id], minutes: 60, firstDay: monday, lastDay: addDays(monday, 6), dayStart: 540, dayEnd: 720 }, isTeam, "https://jobs.test"), { code: "forbidden" });
  await assert.rejects(selfSchedule.send(sql, asMember(camille), c.id, { people: [nora.id], minutes: 60, firstDay: monday, lastDay: addDays(monday, 6), dayStart: 540, dayEnd: 720 }, isTeam, "https://jobs.test"), { code: "invalid" });
  await assert.rejects(selfSchedule.send(sql, asMember(camille), c.id, { people: [hugo.id], minutes: 60, firstDay: monday, lastDay: addDays(monday, 40), dayStart: 540, dayEnd: 720 }, isTeam, "https://jobs.test"), { code: "invalid" });

  const sent = await selfSchedule.send(sql, asMember(camille), c.id, { people: [hugo.id, camille.id], minutes: 60, firstDay: monday, lastDay: addDays(monday, 6), dayStart: 540, dayEnd: 720, place: "Workshop" }, isTeam, "https://jobs.test");
  // The link carries the language the candidate applied in (French here).
  assert.match(sent.link, /^https:\/\/jobs\.test\/interview\/[A-Za-z0-9_-]{43}\?lang=fr$/u);
  assert.equal(await outbox.sendNow(sql, sent.message!), "sent");
  const email = chest.outbox.at(-1)!;
  assert.ok(email.text.includes(sent.link), "the email carries the link");
  // The secret is never stored.
  assert.equal((await sql`select 1 from interview_requests where token_hash = ${tokenOf(sent.link)}`).length, 0);

  const offer = (await selfSchedule.offer(sql, tokenOf(sent.link)))!;
  assert.equal(offer.request.status, "open");
  assert.equal(offer.job, "Self-scheduling");
  // Monday to Friday only (the link's week has a Saturday and a Sunday).
  assert.deepEqual(offer.days.map(d => d.day), [0, 1, 2, 3, 4].map(n => addDays(monday, n)));
  // 09:00–12:00, one hour on the half hour: 09:00, 09:30 … 11:00 — but not
  // across Hugo's 10:00–11:00 on Monday.
  assert.deepEqual(offer.days[0]!.times, ["09:00", "11:00"]);
  assert.deepEqual(offer.days[1]!.times, ["09:00", "09:30", "10:00", "10:30", "11:00"]);
  assert.equal(await selfSchedule.offer(sql, "x".repeat(43)), null, "a wrong link names nothing");

  await assert.rejects(selfSchedule.choose(sql, tokenOf(sent.link), { day: monday, time: "10:00" }, signer), { code: "taken" });
  const done = await selfSchedule.choose(sql, tokenOf(sent.link), { day: addDays(monday, 1), time: "10:30" }, signer);
  assert.equal(done.interview.start, instantOf(addDays(monday, 1), "10:30", zone).toISOString());
  assert.deepEqual(done.interview.people.sort(), [camille.id, hugo.id].sort());
  assert.equal(done.interview.place, "Workshop");
  assert.equal(await outbox.sendNow(sql, done.message), "sent");
  const confirmation = chest.outbox.at(-1)!;
  assert.ok(confirmation.attachments?.some(a => a.name === "invitation.ics"), "the confirmation carries its .ics");
  await interviews.flushCalendars(sql);
  assert.ok([...chest.calendar.values()].some(e => e.members.includes(hugo.id)), "in the interviewers' Chest calendars");

  // Used once: the page says it is booked; choosing again is refused.
  const after = (await selfSchedule.offer(sql, tokenOf(sent.link)))!;
  assert.equal(after.request.status, "booked");
  assert.equal(after.interview?.id, done.interview.id);
  assert.deepEqual(after.days, []);
  await assert.rejects(selfSchedule.choose(sql, tokenOf(sent.link), { day: addDays(monday, 2), time: "10:30" }, signer), { code: "gone" });
  // The history says who chose what.
  const kinds = (await sql<{ kind: string }[]>`select kind from activity where candidate_id = ${c.id} order by id`).map(r => r.kind);
  assert.ok(kinds.includes("interview_link") && kinds.includes("interview_chosen"));
});

test("a new link replaces the one before; a stopped link or a rejected candidate's link no longer works", async () => {
  const { sql } = database;
  const job = await openJob(sql, asMember(camille), "Links");
  const c = (await candidates.apply(sql, application(job.slug))).candidate;
  const monday = nextMonday();
  const input = { people: [ines.id], minutes: 30, firstDay: monday, lastDay: addDays(monday, 4), dayStart: 540, dayEnd: 600 };
  const first = await selfSchedule.send(sql, asMember(camille), c.id, input, isTeam, null);
  assert.equal(first.message, null, "no public address: no email, the recruiter gets the link");
  const second = await selfSchedule.send(sql, asMember(camille), c.id, input, isTeam, null);
  assert.equal((await selfSchedule.offer(sql, tokenOf(first.link)))!.request.status, "cancelled");
  assert.equal((await selfSchedule.offer(sql, tokenOf(second.link)))!.request.status, "open");
  assert.equal((await selfSchedule.ofCandidate(sql, asMember(camille), c.id)).filter(r => r.status === "open").length, 1);
  await selfSchedule.cancel(sql, asMember(camille), second.request.id);
  await assert.rejects(selfSchedule.choose(sql, tokenOf(second.link), { day: monday, time: "09:00" }, signer), { code: "gone" });
  const third = await selfSchedule.send(sql, asMember(camille), c.id, input, isTeam, null);
  await candidates.reject(sql, asMember(camille), c.id, "other");
  const closed = (await selfSchedule.offer(sql, tokenOf(third.link)))!;
  assert.equal(closed.request.status, "cancelled");
  assert.deepEqual(closed.days, []);
});

test("two candidates on the last free hour: the second is told it is taken", async () => {
  const { sql } = database;
  const job = await openJob(sql, asMember(camille), "Race");
  const a = (await candidates.apply(sql, { ...application(job.slug), email: "a@example.com" })).candidate;
  const b = (await candidates.apply(sql, { ...application(job.slug), email: "b@example.com" })).candidate;
  const monday = nextMonday();
  const input = { people: [hugo.id], minutes: 60, firstDay: monday, lastDay: monday, dayStart: 900, dayEnd: 960 };
  const la = await selfSchedule.send(sql, asMember(camille), a.id, input, isTeam, null);
  const lb = await selfSchedule.send(sql, asMember(camille), b.id, input, isTeam, null);
  const results = await Promise.allSettled([
    selfSchedule.choose(sql, tokenOf(la.link), { day: monday, time: "15:00" }, signer),
    selfSchedule.choose(sql, tokenOf(lb.link), { day: monday, time: "15:00" }, signer),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const refused = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.equal(refused.reason.code, "taken");
});
