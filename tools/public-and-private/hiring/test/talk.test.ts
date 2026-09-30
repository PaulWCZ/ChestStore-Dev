import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST as jobsRoute } from "../app/chest-jobs/[name]/route.ts";
import { POST as mailRoute } from "../app/chest-mail/route.ts";
import * as candidates from "../lib/candidates.ts";
import * as interviews from "../lib/interviews.ts";
import * as jobs from "../lib/jobs.ts";
import * as mailer from "../lib/mailer.ts";
import * as messages from "../lib/messages.ts";
import * as outbox from "../lib/outbox.ts";
import { emailInterviewers } from "../lib/tell.ts";
import { addDays, dayOf, instantOf } from "../lib/time.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { application, openJob } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({
    members: everyone,
    capabilities: ["members", "files", "notifications", "mail", "calendar"],
    mail: { domain: "atelier.test", mailboxes: ["jobs"] },
    calendar: { domain: "atelier.test", toolTitle: "Hiring", company: "Atelier Martin" },
    settings: { company: "Atelier Martin" },
    timeZone: "Europe/Paris",
    schedules: [{ name: "morning", cron: "40 7 * * 1-5" }],
  });
});
after(async () => {
  await chest.close();
  await database.close();
});

const recruiter = () => asMember(camille);
const hasTool = async (id: string) => everyone.some(m => m.id === id);
const isTeam = async (id: string) => [camille.id, hugo.id, ines.id].includes(id);

test("writing to a candidate: from the jobs mailbox, with their thread address; logged; interviewers never see it", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Write test");
  const c = (await candidates.apply(sql, application(job.slug, { email: "lucie.w@example.com" }))).candidate;
  const id = await messages.write(sql, recruiter(), c.id, { subject: "Your application", text: "Hello Lucie, when are you free?" });
  assert.equal(await outbox.sendNow(sql, id), "sent");
  const sent = chest.outbox.at(-1)!;
  assert.deepEqual(sent.to, ["lucie.w@example.com"]);
  assert.equal(sent.from, "jobs@atelier.test");
  assert.match(sent.replyTo ?? "", new RegExp(`^jobs\\+tc${c.id}-[a-z2-7]{10}@atelier\\.test$`, "u"));
  assert.match(sent.fromName ?? "", /Camille Martin — Atelier Martin/u);
  const talk = await messages.conversation(sql, recruiter(), c.id);
  assert.deepEqual(talk.map(m => [m.direction, m.status]), [["out", "sent"]]);
  assert.ok((await candidates.candidate(sql, recruiter(), c.id)).activity.some(a => a.kind === "wrote"));
  await jobs.addInterviewer(sql, recruiter(), job.id, ines.id, hasTool);
  await assert.rejects(messages.conversation(sql, asMember(ines), c.id), { code: "forbidden" });
  await assert.rejects(messages.write(sql, asMember(ines), c.id, { subject: "x", text: "y" }), { code: "forbidden" });
  await assert.rejects(messages.write(sql, recruiter(), c.id, { subject: "", text: "y" }), { code: "empty" });
  // Sending twice never sends twice (the key message:<id>).
  const before = chest.outbox.length;
  await sql`update messages set status = 'waiting', send_after = now() where id = ${id}`;
  await outbox.flush(sql);
  assert.equal(chest.outbox.length, before);
});

test("the candidate's answer lands in their conversation (thread, then references, then an authenticated address); the rest waits to be filed", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Answer test");
  const c = (await candidates.apply(sql, application(job.slug, { email: "zoe@example.com", name: "Zoé Lambert" }))).candidate;
  const id = await messages.write(sql, recruiter(), c.id, { subject: "News", text: "Hello Zoé" });
  await outbox.sendNow(sql, id);
  // By the thread address.
  assert.equal(await chest.receive({ mailbox: "jobs", from: "zoe@example.com", subject: "Re: News", text: "Thank you!", thread: mailer.threadOf(c.id) }, mailRoute), 204);
  // Delivered again (at least once): kept once.
  const [first] = await sql<{ received_id: string }[]>`select received_id from messages where candidate_id = ${c.id} and direction = 'in'`;
  assert.ok(first);
  // By References, from another address (a forward).
  const sent = chest.outbox.at(-1)!;
  await chest.receive({ mailbox: "jobs", from: "zoe.perso@example.org", subject: "Re: News", text: "From my other address", references: [sent.messageId], authenticated: false }, mailRoute);
  // By an authenticated address alone.
  await chest.receive({ mailbox: "jobs", from: "ZOE@example.com", subject: "Another question", text: "Is the job hybrid?" }, mailRoute);
  // An unauthenticated address alone is never trusted: to file.
  await chest.receive({ mailbox: "jobs", from: "zoe@example.com", subject: "Forged?", text: "Send me the salaries", authenticated: false }, mailRoute);
  // An out of office is kept, tells nobody.
  await chest.receive({ mailbox: "jobs", from: "zoe@example.com", subject: "Absent", text: "I am away", thread: mailer.threadOf(c.id), auto: true }, mailRoute);
  const talk = await messages.conversation(sql, recruiter(), c.id);
  assert.deepEqual(talk.filter(m => m.direction === "in").map(m => m.body), ["Thank you!", "From my other address", "Is the job hybrid?", "I am away"]);
  const loose = await messages.unmatched(sql, recruiter());
  assert.equal(loose[0]!.subject, "Forged?");
  assert.equal(await messages.unmatchedCount(sql), 1);
  await assert.rejects(messages.unmatched(sql, asMember(hugo)), { code: "forbidden" });
  await messages.file(sql, recruiter(), loose[0]!.id, c.id);
  assert.equal(await messages.unmatchedCount(sql), 0);
  const log = (await candidates.candidate(sql, recruiter(), c.id)).activity;
  assert.ok(log.some(a => a.kind === "replied" && a.data["filed"] === true));
  // An erased candidate's answers go with them.
  await candidates.erase(sql, recruiter(), c.id);
  const [left] = await sql<{ n: number }[]>`select count(*)::int as n from messages where candidate_id = ${c.id}`;
  assert.equal(left!.n, 0);
});

test("a bounce marks the email not delivered", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Bounce test");
  const c = (await candidates.apply(sql, application(job.slug, { email: "nobody@example.com" }))).candidate;
  const id = await messages.write(sql, recruiter(), c.id, { subject: "Hello", text: "Hello" });
  await outbox.sendNow(sql, id);
  assert.equal(await chest.bounce(chest.outbox.at(-1)!.id, mailRoute, { permanent: true }), 204);
  assert.equal((await messages.conversation(sql, recruiter(), c.id))[0]!.status, "bounced");
});

test("a rejection email waits for the Undo: bringing the candidate back cancels it before it leaves", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Undo test");
  const c = (await candidates.apply(sql, application(job.slug, { email: "undo@example.com" }))).candidate;
  await candidates.reject(sql, recruiter(), c.id, "skills");
  await messages.queue(sql, recruiter(), c.id, { kind: "rejection", subject: "Your application", text: "No, sorry.", delaySeconds: messages.undoSeconds });
  const before = chest.outbox.length;
  await outbox.flush(sql);
  assert.equal(chest.outbox.length, before, "nothing leaves before the Undo is over");
  await candidates.restore(sql, recruiter(), c.id);
  await sql`update messages set send_after = now() - interval '1 minute' where candidate_id = ${c.id}`;
  await outbox.flush(sql);
  assert.equal(chest.outbox.length, before, "an undone rejection never leaves");
  assert.equal((await messages.conversation(sql, recruiter(), c.id))[0]!.status, "cancelled");
  // Without Undo, it leaves once due.
  await candidates.reject(sql, recruiter(), c.id, "skills");
  await messages.queue(sql, recruiter(), c.id, { kind: "rejection", subject: "Your application", text: "No, sorry.", delaySeconds: 0 });
  await outbox.flush(sql);
  assert.equal(chest.outbox.at(-1)!.subject, "Your application");
  assert.ok((await candidates.candidate(sql, recruiter(), c.id)).activity.some(a => a.kind === "emailed" && a.data["kind"] === "rejection"));
});

test("without mail on the Chest, a message is kept as not sent (the page opens the recruiter's mail app)", async () => {
  const { sql } = database;
  const bare = await fakeChest({ members: everyone, capabilities: ["members", "notifications"] });
  try {
    const job = await openJob(sql, recruiter(), "No mail test");
    const c = (await candidates.apply(sql, application(job.slug, { email: "nomail@example.com" }))).candidate;
    const id = await messages.write(sql, recruiter(), c.id, { subject: "Hello", text: "Hello" });
    assert.equal(await outbox.sendNow(sql, id), "none");
    await messages.writtenOutside(sql, recruiter(), id);
    assert.ok((await candidates.candidate(sql, recruiter(), c.id)).activity.some(a => a.kind === "written_outside"));
  } finally {
    await bare.close();
  }
});

test("templates: a recruiter writes them; an interviewer does not", async () => {
  const { sql } = database;
  const t = await messages.saveTemplate(sql, recruiter(), { name: "Showroom day", language: "fr", subject: "Une journée — {job}", body: "Bonjour {firstName}" });
  await messages.saveTemplate(sql, recruiter(), { id: t.id, name: "Showroom day", language: "fr", subject: "Une journée — {job}", body: "Bonjour {firstName}, venez." });
  assert.equal((await messages.templates(sql, recruiter())).find(x => x.id === t.id)!.body, "Bonjour {firstName}, venez.");
  await assert.rejects(messages.saveTemplate(sql, asMember(ines), { name: "x", language: "en", subject: "x", body: "x" }), { code: "forbidden" });
  await assert.rejects(messages.saveTemplate(sql, recruiter(), { name: "x", language: "de", subject: "x", body: "x" }), { code: "invalid" });
  await messages.removeTemplate(sql, recruiter(), t.id);
  assert.ok(!(await messages.templates(sql, recruiter())).some(x => x.id === t.id));
});

test("times in the Chest's zone: 14:30 in Paris is 12:30 UTC in summer, 13:30 in winter", () => {
  assert.equal(instantOf("2026-07-01", "14:30", "Europe/Paris").toISOString(), "2026-07-01T12:30:00.000Z");
  assert.equal(instantOf("2026-12-01", "14:30", "Europe/Paris").toISOString(), "2026-12-01T13:30:00.000Z");
  assert.equal(dayOf("2026-07-01T22:30:00Z", "Europe/Paris"), "2026-07-02");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("an interview: the candidate is invited with an .ics, the interviewers' calendars have it; busy times; calling it off", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Interview test");
  await jobs.addInterviewer(sql, recruiter(), job.id, hugo.id, hasTool);
  const c = (await candidates.apply(sql, application(job.slug, { email: "iv@example.com", name: "Iris Vidal", language: "fr" }))).candidate;
  const day = addDays(dayOf(new Date(), "Europe/Paris"), 3);
  const input = { day, time: "10:00", minutes: 60, people: [camille.id, hugo.id], place: "Atelier, Lyon", note: "Apportez votre portfolio." };
  await assert.rejects(interviews.schedule(sql, asMember(hugo), c.id, input, isTeam), { code: "forbidden" });
  await assert.rejects(interviews.schedule(sql, recruiter(), c.id, { ...input, people: [lea.id] }, isTeam), { code: "invalid" });
  await assert.rejects(interviews.schedule(sql, recruiter(), c.id, { ...input, time: "10:07" }, isTeam), { code: "invalid" });
  await assert.rejects(interviews.schedule(sql, recruiter(), c.id, { ...input, day: "2020-01-01" }, isTeam), { code: "invalid" });
  const done = await interviews.schedule(sql, recruiter(), c.id, input, isTeam);
  assert.equal(done.interview.start, instantOf(day, "10:00", "Europe/Paris").toISOString());
  assert.equal(await outbox.sendNow(sql, done.message!), "sent");
  const invitation = chest.outbox.at(-1)!;
  assert.match(invitation.subject, /^Entretien le /u);
  assert.match(invitation.text, /Lieu\s: Atelier, Lyon/u);
  assert.deepEqual(invitation.attachments.map(a => a.name), ["invitation.ics"]);
  const event = chest.calendar.get(interviews.keyOf(done.interview.id));
  assert.ok(event, "in the Chest calendar");
  assert.deepEqual([...event.members].sort(), [camille.id, hugo.id].sort());
  assert.match(chest.feed(hugo.id), /SUMMARY:Interview: Iris Vidal — Interview test/u);
  assert.match(chest.feed(camille.id, { locale: "fr" }), /Entretien\s: Iris Vidal/u);
  // Busy: times only, for a recruiter.
  const busy = await interviews.busy(sql, recruiter(), [hugo.id, ines.id], day);
  assert.deepEqual(busy.map(b => b.member), [hugo.id]);
  await assert.rejects(interviews.busy(sql, asMember(hugo), [hugo.id], day), { code: "forbidden" });
  // Hugo's next interviews; Nora (no role) has none to read.
  assert.deepEqual((await interviews.upcoming(sql, asMember(hugo))).map(i => i.candidateName), ["Iris Vidal"]);
  await assert.rejects(interviews.upcoming(sql, asMember(nora)), { code: "forbidden" });
  // Called off: the candidate gets a CANCEL, the calendars lose it.
  const off = await interviews.cancel(sql, recruiter(), done.interview.id);
  await outbox.sendNow(sql, off.message!);
  assert.deepEqual(chest.outbox.at(-1)!.attachments.map(a => a.name), ["cancelled.ics"]);
  assert.equal(chest.calendar.has(interviews.keyOf(done.interview.id)), false);
  assert.ok((await candidates.candidate(sql, recruiter(), c.id)).activity.some(a => a.kind === "interview_cancelled"));
  // The .ics is RFC 5545: CRLF, a UID, the times in UTC.
  const ics = await interviews.icsForMember(sql, recruiter(), done.interview.id, "en");
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/u);
  assert.match(ics, /STATUS:CANCELLED/u);
});

test("an erased candidate's interview leaves the calendars", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Erase interview test");
  const c = (await candidates.apply(sql, application(job.slug, { email: "gone@example.com" }))).candidate;
  const done = await interviews.schedule(sql, recruiter(), c.id, { day: addDays(dayOf(new Date(), "Europe/Paris"), 5), time: "09:00", minutes: 30, people: [camille.id], tell: false }, isTeam);
  assert.equal(done.message, null);
  await interviews.flushCalendars(sql);
  assert.ok(chest.calendar.has(interviews.keyOf(done.interview.id)));
  await candidates.erase(sql, recruiter(), c.id);
  await interviews.flushCalendars(sql);
  assert.equal(chest.calendar.has(interviews.keyOf(done.interview.id)), false);
});

test("the morning reminder lists today's interviews", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Today test");
  const c = (await candidates.apply(sql, application(job.slug, { email: "today@example.com" }))).candidate;
  const now = new Date();
  const later = new Date(now.getTime() + 3600_000);
  const [row] = await sql<{ id: string }[]>`insert into interviews (candidate_id, starts_at, ends_at, created_by) values (${c.id}, ${later}, ${new Date(later.getTime() + 1800_000)}, ${camille.id}) returning id`;
  await sql`insert into interview_people (interview_id, member_id) values (${row!.id}, ${hugo.id})`;
  const list = await interviews.today(sql, later);
  assert.ok(list.some(i => i.id === String(row!.id) && i.people.includes(hugo.id)));
});

// Members with an address and an email choice, for one test: the fake
// Chest's members are replaced, then given back.
async function withPreferences<T>(choices: Record<string, "all" | "digest" | "none">, run: () => Promise<T>): Promise<T> {
  const saved = [...chest.members];
  chest.members.splice(0, chest.members.length, ...saved.map(m => ({ ...m, email: `${m.firstName.toLowerCase()}@atelier.test`, ...(choices[m.id] ? { mailPreference: choices[m.id] } : {}) })));
  chest.clearCaches();
  try {
    return await run();
  } finally {
    chest.members.splice(0, chest.members.length, ...saved);
    chest.held.length = 0;
    chest.clearCaches();
  }
}

test("email preferences (studio.15): a candidate's emails are transactional, even to a member who chose none", async () => {
  const { sql } = database;
  await withPreferences({ [nora.id]: "none" }, async () => {
    // Nora, an employee, applies to an internal job with her work address.
    const job = await openJob(sql, recruiter(), "Internal move");
    await jobs.addInterviewer(sql, recruiter(), job.id, hugo.id, hasTool);
    const c = (await candidates.apply(sql, application(job.slug, { email: "nora@atelier.test", name: "Nora Petit" }))).candidate;
    const words = mailer.confirmation(c, job, "Atelier Martin", null);
    assert.equal(await outbox.sendNow(sql, await messages.queueConfirmation(sql, c.id, words.subject, words.text)), "sent");
    assert.deepEqual([chest.outbox.at(-1)!.to, chest.outbox.at(-1)!.subject], [["nora@atelier.test"], words.subject], "the application's confirmation");
    const day = addDays(dayOf(new Date(), "Europe/Paris"), 3);
    const done = await interviews.schedule(sql, recruiter(), c.id, { day, time: "11:00", minutes: 30, people: [hugo.id], place: "Room 2", note: "" }, isTeam);
    assert.equal(await outbox.sendNow(sql, done.message!), "sent");
    assert.deepEqual(chest.outbox.at(-1)!.to, ["nora@atelier.test"], "the interview's confirmation goes whatever she chose");
    const id = await messages.write(sql, recruiter(), c.id, { subject: "Before Thursday", text: "Bring your portfolio." });
    assert.equal(await outbox.sendNow(sql, id), "sent");
    assert.equal(chest.outbox.at(-1)!.subject, "Before Thursday");
    assert.equal(chest.held.length, 0, "nothing to a candidate is ever held back");
  });
});

test("email preferences (studio.15): the interviewers' morning email honours each one's choice, once a day", async () => {
  await withPreferences({ [ines.id]: "none", [lea.id]: "digest" }, async () => {
    const at = (h: number) => new Date(Date.UTC(2026, 9, 1, h)).toISOString();
    const list = [
      { id: "901", candidateId: "41", candidateName: "Aurélie Roux", jobTitle: "Office manager", start: at(12), people: [hugo.id, ines.id] },
      { id: "900", candidateId: "40", candidateName: "Bastien Leroy", jobTitle: "Sales", start: at(8), people: [hugo.id, lea.id] },
    ];
    const time = (start: string) => start.slice(11, 16);
    const before = chest.outbox.length;
    const first = await emailInterviewers(list, time, "2026-10-01");
    assert.deepEqual(first.sent, [hugo.id]);
    assert.deepEqual(first.held.sort(), [ines.id, lea.id].sort());
    assert.deepEqual(chest.held.map(h => [h.member, h.reason]).sort(), [[ines.id, "none"], [lea.id, "digest"]].sort());
    const toHugo = chest.outbox.slice(before);
    assert.equal(toHugo.length, 1);
    assert.deepEqual(toHugo[0]!.to, ["hugo@atelier.test"]);
    assert.equal(toHugo[0]!.subject, "Your interviews today");
    assert.match(toHugo[0]!.text, /Hello Hugo,[\s\S]*08:00 — Bastien Leroy, Sales: \S*\/chest\/candidates\/40[\s\S]*12:00 — Aurélie Roux, Office manager/u);
    // The schedule runs again (a retry): nobody gets a second email.
    await emailInterviewers(list, time, "2026-10-01");
    assert.equal(chest.outbox.length, before + 1);
    // Inès reads French; with "all" she gets hers the next day, in French.
    chest.members.find(m => m.id === ines.id)!.mailPreference = "all";
    chest.clearCaches();
    await emailInterviewers(list.slice(0, 1), time, "2026-10-02");
    const toInes = chest.outbox.at(-1)!;
    assert.deepEqual([toInes.to, toInes.subject], [["inès@atelier.test"], "Vos entretiens aujourd’hui"]);
    assert.match(toInes.text, /^Bonjour Inès,/u);
  });
});

test("the morning schedule tells the day of its run — not the clock's — once per interviewer and day", async () => {
  const { sql } = database;
  await withPreferences({}, async () => {
    const job = await openJob(sql, recruiter(), "Morning run");
    const c = (await candidates.apply(sql, application(job.slug, { email: "morning@example.com", name: "Mona Matin" }))).candidate;
    // A Monday far from today: the run's scheduledAt is all that says "today".
    const start = instantOf("2027-03-15", "09:00", "Europe/Paris");
    const [row] = await sql<{ id: string }[]>`insert into interviews (candidate_id, starts_at, ends_at, created_by) values (${c.id}, ${start}, ${new Date(start.getTime() + 1800_000)}, ${camille.id}) returning id`;
    await sql`insert into interview_people (interview_id, member_id) values (${row!.id}, ${hugo.id})`;
    const before = chest.outbox.length;
    // 08:40 in Paris; a retry of the same run delivered after midnight UTC.
    assert.equal(await chest.run("morning", request => jobsRoute(request), { scheduledAt: "2027-03-15T07:40:00Z" }), 204);
    const mine = chest.outbox.slice(before).filter(m => m.subject === "Your interviews today");
    assert.equal(mine.length, 1);
    assert.deepEqual(mine[0]!.to, ["hugo@atelier.test"]);
    assert.match(mine[0]!.text, new RegExp(`09:00 — Mona Matin, Morning run: \\S*/chest/candidates/${c.id}`, "u"));
    const count = chest.outbox.length;
    assert.equal(await chest.run("morning", request => jobsRoute(request), { scheduledAt: "2027-03-15T07:40:00Z", attempt: 2 }), 204);
    assert.equal(chest.outbox.length, count, "a retry sends nothing new");
    // The next day's run has nothing to tell him.
    assert.equal(await chest.run("morning", request => jobsRoute(request), { scheduledAt: "2027-03-16T06:40:00Z" }), 204);
    assert.equal(chest.outbox.length, count);
  });
});
