import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, shownTo, type FakeChest } from "@argentic/chest-sdk/testing";
import * as candidates from "../src/lib/candidates.ts";
import * as interviews from "../src/lib/interviews.ts";
import * as jobs from "../src/lib/jobs.ts";
import * as mailer from "../src/lib/mailer.ts";
import * as messages from "../src/lib/messages.ts";
import * as outbox from "../src/lib/outbox.ts";
import { interviewsToday } from "../src/lib/tell.ts";
import { addDays, dayOf, instantOf } from "../src/shared/time.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { application, openJob } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora } from "./support/members.ts";
import { built } from "./support/app.ts";

// What the Chest posts, through the built server's routes.
const jobsRoute = (request: Request) => built().then(app => app.fetch(request));

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({
    members: everyone,
    capabilities: ["members", "files", "notifications", "mail", "calendar"],
    mail: { domain: "atelier.test", replyTo: "jobs@atelier.test" },
    calendar: { domain: "atelier.test", toolTitle: "Hiring", company: "Atelier Martin" },
    chest: { organization: "Atelier Martin", timeZone: "Europe/Paris" },
  });
});
after(async () => {
  await chest.close();
  await database.close();
});

const recruiter = () => asMember(camille);
const hasTool = async (id: string) => everyone.some(m => m.id === id);
const isTeam = async (id: string) => [camille.id, hugo.id, ines.id].includes(id);

test("writing to a candidate: from the company's address, replies to the company's inbox (the email says so); logged; interviewers never see it", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Write test");
  const c = (await candidates.apply(sql, application(job.slug, { email: "lucie.w@example.com" }))).candidate;
  const id = await messages.write(sql, recruiter(), c.id, { subject: "Your application", text: "Hello Lucie, when are you free?" });
  assert.equal(await outbox.sendNow(sql, id), "sent");
  const sent = chest.outbox.at(-1)!;
  assert.deepEqual(sent.to, ["lucie.w@example.com"]);
  assert.equal(sent.replyTo, "jobs@atelier.test", "the connector's reply address: the company's inbox");
  assert.ok(sent.text.startsWith("Hello Lucie, when are you free?"));
  assert.equal(sent.text.split("\n").slice(-2).join("\n"), "—\nPour répondre, répondez à cet e-mail\u202f: il arrive chez Atelier Martin.", "the last line says where a reply goes, in the candidate's language");
  assert.match(sent.fromName ?? "", /Camille Martin — Atelier Martin/u);
  const talk = await messages.conversation(sql, recruiter(), c.id);
  assert.deepEqual(talk.map(m => m.status), ["sent"]);
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

test("a bounce, learnt by asking the Chest on the outbox schedule, marks the email not delivered; the recruiters hear of it in their language", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Bounce test");
  const c = (await candidates.apply(sql, application(job.slug, { email: "nobody@example.com", name: "Noé Body" }))).candidate;
  const id = await messages.write(sql, recruiter(), c.id, { subject: "Hello", text: "Hello" });
  await outbox.sendNow(sql, id);
  const mailId = chest.outbox.at(-1)!.id;
  await sql`delete from mail_checks where mail_id <> ${mailId}`;
  chest.notifications.length = 0;
  assert.deepEqual(await outbox.checkSent(sql), { asked: 1, bounced: 0 }, "still on its way");
  chest.bounce(mailId, { permanent: true });
  assert.deepEqual(await outbox.checkSent(sql), { asked: 0, bounced: 0 }, "asked again only once it has aged");
  assert.deepEqual(await outbox.checkSent(sql, new Date(Date.now() + 3_600_000)), { asked: 1, bounced: 1 });
  assert.equal((await messages.conversation(sql, recruiter(), c.id))[0]!.status, "bounced");
  const told = chest.notifications.find(n => n.key === `candidate:${c.id}:bounced`)!;
  assert.equal(told.title, "An email to Noé Body did not arrive");
  assert.ok(told.translations?.["fr"], "with its French words");
  assert.deepEqual(await outbox.checkSent(sql, new Date(Date.now() + 7_200_000)), { asked: 0, bounced: 0 }, "settled: never asked again");
});

test("an erased candidate's emails go with them, received ones an earlier version kept included", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Erase talk");
  const c = (await candidates.apply(sql, application(job.slug, { email: "gone@example.com" }))).candidate;
  await outbox.sendNow(sql, await messages.write(sql, recruiter(), c.id, { subject: "News", text: "Hello" }));
  await sql`insert into messages (candidate_id, direction, kind, subject, body, status) values (${c.id}, 'in', 'message', 'Re: News', 'Thanks', 'received')`;
  assert.equal((await messages.conversation(sql, recruiter(), c.id)).length, 1, "an earlier version's received email is not shown");
  await candidates.erase(sql, recruiter(), c.id);
  const [left] = await sql<{ n: number }[]>`select count(*)::int as n from messages where candidate_id = ${c.id}`;
  assert.equal(left!.n, 0);
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

test("with the company's mail not connected, a message says not sent at once — never \"leaving soon\" for weeks", async () => {
  const { sql } = database;
  chest.delivery.mail = "not_connected";
  try {
    const job = await openJob(sql, recruiter(), "Not connected test");
    const c = (await candidates.apply(sql, application(job.slug, { email: "later@example.com" }))).candidate;
    const id = await messages.write(sql, recruiter(), c.id, { subject: "Hello", text: "Hello" });
    assert.equal(await outbox.sendNow(sql, id), "none");
  } finally {
    chest.delivery.mail = "ready";
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

test("the morning reminder is a notification at its moment, one per interview, in each interviewer's language — never an email", async () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 1, h)).toISOString();
  const list = [
    { id: "901", candidateId: "41", candidateName: "Aurélie Roux", jobTitle: "Office manager", start: at(12), people: [hugo.id, ines.id] },
    { id: "900", candidateId: "40", candidateName: "Bastien Leroy", jobTitle: "Sales", start: at(8), people: [hugo.id, lea.id] },
  ];
  const before = chest.outbox.length;
  chest.notifications.length = 0;
  await interviewsToday(list, start => start.slice(11, 16));
  assert.equal(chest.outbox.length, before, "no email to a member");
  const item = chest.notifications.find(n => n.member === ines.id && n.key === "interview:901:today")!;
  assert.equal(item.path, "/chest/candidates/41");
  assert.equal(item.title, "Interview at 12:00: Aurélie Roux");
  assert.match(shownTo(item, "fr").title, /12:00/u);
  assert.notEqual(shownTo(item, "fr").title, item.title, "French words for Inès");
  assert.deepEqual(chest.notifications.filter(n => n.key === "interview:900:today").map(n => n.member).sort(), [hugo.id, lea.id].sort());
});

test("the morning schedule tells the day of its run — not the clock's — once per interview", async () => {
  const { sql } = database;
  const job = await openJob(sql, recruiter(), "Morning run");
  const c = (await candidates.apply(sql, application(job.slug, { email: "morning@example.com", name: "Mona Matin" }))).candidate;
  // A Monday far from today: the run's scheduledAt is all that says "today".
  const start = instantOf("2027-03-15", "09:00", "Europe/Paris");
  const [row] = await sql<{ id: string }[]>`insert into interviews (candidate_id, starts_at, ends_at, created_by) values (${c.id}, ${start}, ${new Date(start.getTime() + 1800_000)}, ${camille.id}) returning id`;
  await sql`insert into interview_people (interview_id, member_id) values (${row!.id}, ${hugo.id})`;
  const before = chest.outbox.length;
  chest.notifications.length = 0;
  // 08:40 in Paris.
  assert.equal(await chest.run("morning", request => jobsRoute(request), { scheduledAt: "2027-03-15T07:40:00Z" }), 204);
  const mine = chest.notifications.filter(n => n.key === `interview:${row!.id}:today`);
  assert.deepEqual(mine.map(n => n.member), [hugo.id]);
  assert.equal(chest.outbox.length, before, "no email");
  // A retry replaces the same item (its key); the next day's run has nothing.
  assert.equal(await chest.run("morning", request => jobsRoute(request), { scheduledAt: "2027-03-15T07:40:00Z", attempt: 2 }), 204);
  assert.equal(await chest.run("morning", request => jobsRoute(request), { scheduledAt: "2027-03-16T06:40:00Z" }), 204);
  assert.equal(new Set(chest.notifications.filter(n => n.member === hugo.id && n.key?.endsWith(":today")).map(n => n.key)).size, 1);
});
