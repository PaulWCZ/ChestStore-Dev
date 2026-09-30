import { createHash, randomBytes } from "node:crypto";
import * as chest from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { AppError } from "./app-error.ts";
import { activity, manageable, toCandidate, touch, type Candidate } from "./candidates.ts";
import type { Query, Sql } from "./db.ts";
import { catalogue, format } from "./i18n/index.ts";
import { invite, read as readInterview, type Interview } from "./interviews.ts";
import { settings } from "./jobs.ts";
import { toldBusy } from "./share.ts";
import * as mailer from "./mailer.ts";
import { queue } from "./messages.ts";
import { clean, day as readDay, id, isMemberId, limits } from "./model.ts";
import { addDays, dayOf, durations, instantOf, timeOf } from "./time.ts";

// Candidates choose their own interview time. A recruiter sends a link —
// who meets them, how long, between which days and hours —; the
// candidate's page (/interview/<token>, public) offers the times when all
// of those people are free: by the tool's own interviews, and by what
// Booking tells of them (lib/share.ts: their bookings, blocked times and
// Google/Outlook/Apple calendars), lunch left out unless asked for. The
// time chosen becomes an interview like
// one a recruiter plans: the candidate's email with its .ics, the
// interviewers' Chest calendars, the bell. One open link per candidate: a
// new one replaces it. The link's secret is never stored (its SHA-256).

export const scheduleLimits = { daysAhead: 90, spanDays: 21, noticeHours: 12, slots: 400 } as const;

export type Request = {
  id: string;
  candidateId: string;
  minutes: number;
  firstDay: string;
  lastDay: string;
  dayStart: number;
  dayEnd: number;
  place: string;
  note: string;
  people: string[];
  createdBy: string;
  createdAt: string;
  status: "open" | "booked" | "cancelled" | "expired";
  interviewId: string | null;
  // Lunch (12:00–14:00) left out of the times offered.
  skipLunch: boolean;
};
type RequestDb = { id: string; candidate_id: string; minutes: number; first_day: string; last_day: string; day_start: number; day_end: number; place: string; note: string; created_by: string; created_at: Date; interview_id: string | null; booked_at: Date | null; cancelled_at: Date | null; people: string[] | null; skip_lunch: boolean | null };
const zone = () => chest.timeZone();

function toRequest(r: RequestDb, now: Date): Request {
  const expired = dayOf(now, zone()) > r.last_day;
  return {
    id: String(r.id), candidateId: String(r.candidate_id), minutes: r.minutes, firstDay: r.first_day, lastDay: r.last_day, dayStart: r.day_start, dayEnd: r.day_end,
    place: r.place, note: r.note, people: (r.people ?? []).filter(isMemberId), createdBy: r.created_by, createdAt: r.created_at.toISOString(),
    status: r.cancelled_at ? "cancelled" : r.booked_at ? "booked" : expired ? "expired" : "open", interviewId: r.interview_id === null ? null : String(r.interview_id),
    skipLunch: r.skip_lunch ?? false,
  };
}
const select = (sql: Query) => sql`
  select r.id, r.candidate_id, r.minutes, to_char(r.first_day, 'YYYY-MM-DD') as first_day, to_char(r.last_day, 'YYYY-MM-DD') as last_day, r.day_start, r.day_end,
    r.place, r.note, r.created_by, r.created_at, r.interview_id, r.booked_at, r.cancelled_at, r.skip_lunch,
    coalesce((select array_agg(p.member_id order by p.member_id) from interview_request_people p where p.request_id = r.id), '{}') as people
  from interview_requests r`;

export const hashOf = (token: string) => createHash("sha256").update(token).digest("base64url");
const tokenPattern = /^[A-Za-z0-9_-]{43}$/u;

// skipLunch: true unless said otherwise (a time over 12:00–14:00 is not
// offered).
export type RequestInput = { people: unknown; minutes: unknown; firstDay: unknown; lastDay: unknown; dayStart: unknown; dayEnd: unknown; place?: unknown; note?: unknown; skipLunch?: unknown };
export const lunch = { start: 12 * 60, end: 14 * 60 } as const;

function readInput(input: RequestInput, now: Date) {
  const minutes = Number(input.minutes);
  if (!(durations as readonly number[]).includes(minutes)) throw new AppError("invalid");
  const first = readDay(input.firstDay), last = readDay(input.lastDay);
  const today = dayOf(now, zone());
  if (!first || !last || first < today || last < first || last > addDays(first, scheduleLimits.spanDays) || last > addDays(today, scheduleLimits.daysAhead)) throw new AppError("invalid");
  const dayStart = Number(input.dayStart), dayEnd = Number(input.dayEnd);
  if (!Number.isInteger(dayStart) || !Number.isInteger(dayEnd) || dayStart % 15 !== 0 || dayEnd % 15 !== 0 || dayStart < 0 || dayEnd > 1440 || dayEnd - dayStart < minutes) throw new AppError("invalid");
  if (!Array.isArray(input.people) || input.people.length < 1 || input.people.length > limits.interviewPeople || !input.people.every(isMemberId)) throw new AppError("invalid");
  return {
    minutes, first, last, dayStart, dayEnd, people: [...new Set(input.people as string[])], skipLunch: input.skipLunch !== false,
    place: clean(input.place, limits.interviewPlace, { optional: true }),
    note: clean(input.note, limits.interviewNote, { multiline: true, optional: true }),
  };
}

// send makes a link for a candidate and queues the email that carries it
// (in the candidate's language). Says the request, the link's token (the
// only time it is known: for a Chest without email, the recruiter copies
// the link) and the message queued.
export async function send(sql: Sql, actor: Member | null, candidateId: unknown, input: RequestInput, isTeam: (memberId: string, jobId: string) => Promise<boolean>, origin: string | null, now = new Date()): Promise<{ request: Request; token: string; link: string; message: string | null }> {
  if (!actor) throw new AppError("forbidden");
  const v = readInput(input, now);
  const { candidate } = await manageable(sql, actor, candidateId);
  if (candidate.status !== "active") throw new AppError("invalid");
  for (const m of v.people) if (!(await isTeam(m, candidate.jobId))) throw new AppError("invalid");
  const token = randomBytes(32).toString("base64url");
  // In the candidate's language, as their emails (the page follows it).
  const link = `${origin ?? ""}/interview/${token}?lang=${candidate.language}`;
  return sql.begin(async tx => {
    // One open link per candidate: the one before stops working.
    await tx`update interview_requests set cancelled_at = now() where candidate_id = ${candidate.id} and cancelled_at is null and booked_at is null`;
    const [row] = await tx<{ id: string }[]>`
      insert into interview_requests (candidate_id, token_hash, minutes, first_day, last_day, day_start, day_end, place, note, created_by, skip_lunch)
      values (${candidate.id}, ${hashOf(token)}, ${v.minutes}, ${v.first}, ${v.last}, ${v.dayStart}, ${v.dayEnd}, ${v.place}, ${v.note}, ${actor.id}, ${v.skipLunch}) returning id`;
    const requestId = String(row!.id);
    for (const m of v.people) await tx`insert into interview_request_people (request_id, member_id) values (${requestId}, ${m})`;
    await activity(tx, candidate.id, actor.id, "interview_link", { people: v.people, from: v.first, to: v.last });
    await touch(tx, candidate.id);
    const request = (await readRequest(tx, requestId, now))!;
    const message = origin ? await linkEmail(tx, actor, candidate, request, link) : null;
    return { request, token, link, message };
  });
}

async function readRequest(sql: Query, requestId: string, now: Date): Promise<Request | null> {
  const [row] = await sql<RequestDb[]>`${select(sql)} where r.id = ${requestId}`;
  return row ? toRequest(row, now) : null;
}

async function linkEmail(tx: Query, actor: Pick<Member, "id" | "name"> & { firstName?: string }, c: Candidate, r: Request, link: string): Promise<string> {
  const t = catalogue(c.language).mail;
  const [job] = await tx<{ title: string }[]>`select title from jobs where id = ${c.jobId}`;
  const s = await settings(tx);
  const locale = c.language === "fr" ? "fr" : "en-GB";
  const long = (d: string) => new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(d + "T12:00:00Z"));
  const v = { ...mailer.values(c, job!, s.companyName, actor.firstName || actor.name), link, from: long(r.firstDay), to: long(r.lastDay), minutes: String(r.minutes) };
  return queue(tx, actor, c.id, { kind: "interview_request", subject: format(t.linkSubject, v), text: format(t.linkBody, v) });
}

// ofCandidate: a candidate's links, newest first, for their page.
export async function ofCandidate(sql: Query, actor: Member | null, candidateId: unknown, now = new Date()): Promise<Request[]> {
  const { candidate } = await manageable(sql, actor, candidateId);
  const rows = await sql<RequestDb[]>`${select(sql)} where r.candidate_id = ${candidate.id} order by r.created_at desc limit 20`;
  return rows.map(r => toRequest(r, now));
}

// cancel stops a link that was not used (the candidate's page then says
// so). Nobody is emailed: the recruiter writes if they want to.
export async function cancel(sql: Sql, actor: Member | null, requestId: unknown, now = new Date()): Promise<Request> {
  const key = id(requestId);
  return sql.begin(async tx => {
    const [row] = await tx<{ candidate_id: string }[]>`select candidate_id from interview_requests where id = ${key} for update`;
    if (!row) throw new AppError("not_found");
    const { candidate } = await manageable(tx, actor, String(row.candidate_id), true);
    const before = (await readRequest(tx, key, now))!;
    if (before.status !== "open") return before;
    await tx`update interview_requests set cancelled_at = now() where id = ${key}`;
    await activity(tx, candidate.id, actor!.id, "interview_link_cancelled", {});
    return (await readRequest(tx, key, now))!;
  });
}

// ---- The candidate's page (public) -------------------------------------------

export type Offer = {
  request: Request;
  candidate: { firstName: string; language: string };
  job: string;
  company: string;
  // Open: the free times by day ("YYYY-MM-DD" → "HH:MM" starts).
  days: { day: string; times: string[] }[];
  // Booked: the interview.
  interview: Interview | null;
};

// offer reads a link for the candidate's page: null for a link that does
// not exist (a wrong address names nothing, as for a job).
export async function offer(sql: Query, token: unknown, now = new Date()): Promise<Offer | null> {
  if (typeof token !== "string" || !tokenPattern.test(token)) return null;
  const [row] = await sql<RequestDb[]>`${select(sql)} where r.token_hash = ${hashOf(token)}`;
  if (!row) return null;
  const request = toRequest(row, now);
  const [c] = await sql<{ name: string; language: string; status: string; title: string }[]>`
    select c.name, c.language, c.status, j.title from candidates c join jobs j on j.id = c.job_id where c.id = ${request.candidateId}`;
  if (!c) return null;
  const s = await settings(sql);
  const interview = request.interviewId ? await readInterview(sql, request.interviewId) : null;
  const closed = c.status !== "active" && request.status === "open";
  return {
    request: closed ? { ...request, status: "cancelled" } : request,
    candidate: { firstName: c.name.split(/\s+/u)[0] ?? c.name, language: c.language },
    job: c.title,
    company: s.companyName,
    days: request.status === "open" && !closed ? await freeTimes(sql, request, now) : [],
    interview,
  };
}

// freeTimes: every start in the request's days (Monday to Friday) and
// hours, on the quarter hour for 15- and 45-minute interviews and the half
// hour otherwise, at least scheduleLimits.noticeHours ahead, when none of
// the people is in another interview nor busy by what another tool told
// (Booking: taken; Leave: off), and — unless the recruiter asked for it, or chose hours
// within it — not over lunch.
export async function freeTimes(sql: Query, r: Request, now: Date): Promise<{ day: string; times: string[] }[]> {
  const z = zone();
  const step = r.minutes % 30 === 0 ? 30 : 15;
  const from = instantOf(r.firstDay, "00:00", z);
  const to = new Date(instantOf(r.lastDay, "00:00", z).getTime() + 30 * 3600_000);
  const busy: { starts_at: Date; ends_at: Date }[] = r.people.length === 0 ? [] : await sql<{ starts_at: Date; ends_at: Date }[]>`
    select distinct i.starts_at, i.ends_at from interviews i join interview_people p on p.interview_id = i.id
    where i.cancelled_at is null and p.member_id in ${sql(r.people)} and i.starts_at < ${to} and i.ends_at > ${from}`;
  for (const b of await toldBusy(sql, r.people, from, to)) busy.push({ starts_at: b.start, ends_at: b.end });
  const noLunch = r.skipLunch && !(r.dayStart >= lunch.start && r.dayEnd <= lunch.end);
  const earliest = now.getTime() + scheduleLimits.noticeHours * 3600_000;
  const out: { day: string; times: string[] }[] = [];
  let count = 0;
  for (let d = r.firstDay; d <= r.lastDay && count < scheduleLimits.slots; d = addDays(d, 1)) {
    const weekday = new Date(d + "T12:00:00Z").getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const times: string[] = [];
    for (let m = Math.ceil(r.dayStart / step) * step; m + r.minutes <= r.dayEnd; m += step) {
      const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const start = instantOf(d, hhmm, z).getTime();
      const end = start + r.minutes * 60_000;
      // A time the clock skips (spring) reads on another hour: left out.
      if (dayOf(new Date(start), z) !== d || timeOf(new Date(start), z) !== hhmm) continue;
      if (start < earliest) continue;
      if (noLunch && m < lunch.end && m + r.minutes > lunch.start) continue;
      if (busy.some(b => b.starts_at.getTime() < end && b.ends_at.getTime() > start)) continue;
      times.push(hhmm);
    }
    if (times.length > 0) {
      out.push({ day: d, times });
      count += times.length;
    }
  }
  return out;
}

// choose books the time a candidate picked: checked again under a lock
// (two candidates on the same interviewer's last free hour: the second is
// told "taken" and sees the times left). Says the interview, the email
// queued (the invitation with its .ics) and who to tell.
export async function choose(sql: Sql, token: unknown, input: { day: unknown; time: unknown }, sender: (memberId: string) => Promise<{ name: string; firstName?: string }>, now = new Date()): Promise<{ interview: Interview; message: string; request: Request; candidate: { id: string; name: string } }> {
  if (typeof token !== "string" || !tokenPattern.test(token)) throw new AppError("not_found");
  const d = readDay(input.day);
  if (!d || typeof input.time !== "string" || !/^\d{2}:\d{2}$/u.test(input.time)) throw new AppError("invalid");
  const time = input.time;
  const [pre] = await sql<{ created_by: string }[]>`select created_by from interview_requests where token_hash = ${hashOf(token)}`;
  if (!pre) throw new AppError("not_found");
  const signer = { id: pre.created_by, ...(await sender(pre.created_by)) };
  return sql.begin(async tx => {
    // Every booking of a time goes one after the other.
    await tx`lock table interview_requests in share row exclusive mode`;
    const [row] = await tx<RequestDb[]>`${select(tx)} where r.token_hash = ${hashOf(token)}`;
    if (!row) throw new AppError("not_found");
    const request = toRequest(row, now);
    if (request.status !== "open") throw new AppError("gone");
    const [c] = await tx<CandidateLite[]>`select * from candidates where id = ${request.candidateId} for update`;
    if (!c || c.status !== "active") throw new AppError("gone");
    const free = await freeTimes(tx, request, now);
    if (!free.some(f => f.day === d && f.times.includes(time))) throw new AppError("taken");
    const start = instantOf(d, time, zone());
    const end = new Date(start.getTime() + request.minutes * 60_000);
    const [iv] = await tx<{ id: string }[]>`
      insert into interviews (candidate_id, starts_at, ends_at, place, note, created_by) values (${request.candidateId}, ${start}, ${end}, ${request.place}, ${request.note}, ${request.createdBy}) returning id`;
    const interviewId = String(iv!.id);
    for (const m of request.people) await tx`insert into interview_people (interview_id, member_id) values (${interviewId}, ${m})`;
    await tx`update interview_requests set booked_at = now(), interview_id = ${interviewId} where id = ${request.id}`;
    await activity(tx, request.candidateId, null, "interview_chosen", { at: start.toISOString(), people: request.people });
    await touch(tx, request.candidateId);
    const interview = (await readInterview(tx, interviewId))!;
    const candidate = await candidateOf(tx, request.candidateId);
    const message = await invite(tx, signer, candidate, interview, "interview");
    return { interview, message, request: { ...request, status: "booked" as const, interviewId }, candidate: { id: candidate.id, name: candidate.name } };
  });
}

type CandidateLite = { id: string; status: string };
// The candidate as the invitation reads it (name, language, job).
async function candidateOf(tx: Query, candidateId: string): Promise<Candidate> {
  const [row] = await tx`select * from candidates where id = ${candidateId}`;
  return toCandidate(row as never);
}
