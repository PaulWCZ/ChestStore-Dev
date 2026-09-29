import * as calendar from "@argentic/chest-sdk/calendar";
import * as chest from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import { roleOf } from "./access.ts";
import { AppError } from "./app-error.ts";
import { activity, load, manageable, touch, type Candidate } from "./candidates.ts";
import type { Query, Sql } from "./db.ts";
import { catalogue, format, locales, type Catalogue, type Locale } from "./i18n/index.ts";
import { settings } from "./jobs.ts";
import { toldBusy } from "./share.ts";
import * as mailer from "./mailer.ts";
import { queue } from "./messages.ts";
import { clean, day as readDay, id, isMemberId, limits } from "./model.ts";
import { addDays, dayOf, durations, instantOf, isTime, timeOf } from "./time.ts";

// Interviews: a time with a candidate and some of the team. Scheduling
// one sends the candidate an invitation by email with an .ics file (any
// calendar app adds it), and puts the interview in each interviewer's
// Chest calendar (Proposal (studio): calendar.put — the feed they added
// once to Google Calendar, Outlook or Apple Calendar). Busy times come
// from the tool's own interviews: nothing else of the interviewers'
// agendas is known (a free/busy connector is the calendar proposal's next
// step, not built). Codes, never sentences.

export type Interview = {
  id: string;
  candidateId: string;
  start: string;
  end: string;
  place: string;
  note: string;
  people: string[];
  createdBy: string;
  cancelled: boolean;
  calendar: "pending" | "done" | "off";
};
type InterviewDb = { id: string; candidate_id: string; starts_at: Date; ends_at: Date; place: string; note: string; created_by: string; cancelled_at: Date | null; calendar: "pending" | "done" | "off"; people: string[] | null; sequence: number; updated_at: Date; stamp: string };
const toInterview = (r: InterviewDb): Interview => ({
  id: String(r.id), candidateId: String(r.candidate_id), start: r.starts_at.toISOString(), end: r.ends_at.toISOString(), place: r.place, note: r.note,
  people: (r.people ?? []).filter(isMemberId), createdBy: r.created_by, cancelled: r.cancelled_at !== null, calendar: r.calendar,
});
const select = (sql: Query) => sql`
  select i.*, (extract(epoch from i.updated_at) * 1000000)::bigint::text as stamp,
    coalesce((select array_agg(p.member_id order by p.member_id) from interview_people p where p.interview_id = i.id), '{}') as people from interviews i`;

export const keyOf = (interviewId: string) => `interview:${interviewId}`;
const zone = () => chest.timeZone();

export type InterviewInput = { day: unknown; time: unknown; minutes: unknown; place?: unknown; note?: unknown; people: unknown; tell?: unknown };

// schedule plans an interview for a candidate: a day, a start time (in the
// Chest's time zone), a length, the people (the job's interviewers and
// recruiters, 1 to 10), a place or a video link, a note for the candidate.
// isTeam: the Chest says someone may be on it (on the job, or a
// recruiter). When tell is true (the default), the invitation is queued
// for the candidate. Says the interview and the message queued.
export async function schedule(sql: Sql, actor: Member | null, candidateId: unknown, input: InterviewInput, isTeam: (memberId: string, jobId: string) => Promise<boolean>, now = new Date()): Promise<{ interview: Interview; message: string | null }> {
  if (!actor) throw new AppError("forbidden");
  const when = readWhen(input, now);
  const place = clean(input.place, limits.interviewPlace, { optional: true });
  const note = clean(input.note, limits.interviewNote, { multiline: true, optional: true });
  const people = readPeople(input.people);
  const { candidate } = await manageable(sql, actor, candidateId);
  if (candidate.status !== "active") throw new AppError("invalid");
  for (const m of people) if (!(await isTeam(m, candidate.jobId))) throw new AppError("invalid");
  const tell = input.tell !== false;
  return sql.begin(async tx => {
    const [row] = await tx<{ id: string }[]>`
      insert into interviews (candidate_id, starts_at, ends_at, place, note, created_by) values (${candidate.id}, ${when.start}, ${when.end}, ${place}, ${note}, ${actor.id}) returning id`;
    const interviewId = String(row!.id);
    for (const m of people) await tx`insert into interview_people (interview_id, member_id) values (${interviewId}, ${m})`;
    await activity(tx, candidate.id, actor.id, "interview", { at: when.start.toISOString(), people });
    await touch(tx, candidate.id);
    const interview = (await read(tx, interviewId))!;
    const message = tell ? await invite(tx, actor, candidate, interview, "interview") : null;
    return { interview, message };
  });
}

// cancel calls an interview off: it leaves the interviewers' calendars;
// the candidate is told (with an .ics that removes it from theirs) unless
// tell is false.
export async function cancel(sql: Sql, actor: Member | null, interviewId: unknown, tell: unknown = true): Promise<{ interview: Interview; message: string | null }> {
  if (!actor) throw new AppError("forbidden");
  const key = id(interviewId);
  return sql.begin(async tx => {
    const current = await read(tx, key);
    if (!current) throw new AppError("not_found");
    const { candidate } = await manageable(tx, actor, current.candidateId, true);
    if (current.cancelled) return { interview: current, message: null };
    await tx`update interviews set cancelled_at = now(), updated_at = now(), sequence = sequence + 1, calendar = case when calendar = 'off' then 'off' else 'pending' end where id = ${key}`;
    await activity(tx, candidate.id, actor.id, "interview_cancelled", { at: current.start });
    const interview = (await read(tx, key))!;
    const message = tell !== false && new Date(current.start).getTime() > Date.now() ? await invite(tx, actor, candidate, interview, "interview_cancelled") : null;
    return { interview, message };
  });
}

function readWhen(input: InterviewInput, now: Date): { start: Date; end: Date } {
  const d = readDay(input.day);
  if (!d || !isTime(input.time)) throw new AppError("invalid");
  const minutes = Number(input.minutes);
  if (!(durations as readonly number[]).includes(minutes)) throw new AppError("invalid");
  const start = instantOf(d, input.time, zone());
  // Not in the past (an hour of slack for a clock a little behind), not
  // beyond what calendars keep (two years).
  if (start.getTime() < now.getTime() - 3600_000 || start.getTime() > now.getTime() + 700 * 86400_000) throw new AppError("invalid");
  return { start, end: new Date(start.getTime() + minutes * 60_000) };
}

function readPeople(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > limits.interviewPeople || !value.every(isMemberId)) throw new AppError("invalid");
  return [...new Set(value as string[])];
}

export async function read(sql: Query, interviewId: string): Promise<Interview | null> {
  const [row] = await sql<InterviewDb[]>`${select(sql)} where i.id = ${interviewId}`;
  return row ? toInterview(row) : null;
}

// ofCandidate: a candidate's interviews, soonest first, for whoever sees
// the candidate.
export async function ofCandidate(sql: Sql, actor: Member | null, candidateId: unknown): Promise<Interview[]> {
  const { candidate } = await load(sql, actor, candidateId);
  const rows = await sql<InterviewDb[]>`${select(sql)} where i.candidate_id = ${candidate.id} order by i.starts_at desc limit 50`;
  return rows.map(toInterview);
}

// Upcoming interviews of someone (they are on them), from now: the home
// page's "Your next interviews".
export type Upcoming = Interview & { candidateName: string; jobTitle: string };
export async function upcoming(sql: Sql, actor: Member | null, now = new Date()): Promise<Upcoming[]> {
  if (!actor || !roleOf(actor)) throw new AppError("forbidden");
  const rows = await sql<(InterviewDb & { name: string; title: string })[]>`
    select x.*, c.name, j.title from (${select(sql)} where i.cancelled_at is null and i.ends_at > ${now}
      and exists (select 1 from interview_people p where p.interview_id = i.id and p.member_id = ${actor.id})) x
    join candidates c on c.id = x.candidate_id join jobs j on j.id = c.job_id
    where c.status = 'active' order by x.starts_at limit 20`;
  return rows.map(r => ({ ...toInterview(r), candidateName: r.name, jobTitle: r.title }));
}

// busy: the times some people are already in an interview on a day (in
// the Chest's zone), or busy by what another tool told (source: "booking"
// — their bookings and other calendars), to plan around them. Only times:
// which candidate or customer is never said.
export type Busy = { member: string; start: string; end: string; source?: string };
export async function busy(sql: Sql, actor: Member | null, people: unknown, onDay: unknown): Promise<Busy[]> {
  if (roleOf(actor) !== "recruiter") throw new AppError("forbidden");
  const d = readDay(onDay);
  if (!d || !Array.isArray(people) || people.length > 50 || !people.every(isMemberId)) throw new AppError("invalid");
  if (people.length === 0) return [];
  const from = instantOf(d, "00:00", zone());
  const to = new Date(from.getTime() + 30 * 3600_000);
  const rows = await sql<{ member_id: string; starts_at: Date; ends_at: Date }[]>`
    select p.member_id, i.starts_at, i.ends_at from interviews i join interview_people p on p.interview_id = i.id
    where i.cancelled_at is null and p.member_id in ${sql(people as string[])} and i.starts_at < ${to} and i.ends_at > ${from}
    order by i.starts_at`;
  const own: Busy[] = rows.filter(r => dayOf(r.starts_at, zone()) === d).map(r => ({ member: r.member_id, start: r.starts_at.toISOString(), end: r.ends_at.toISOString() }));
  // What another tool told, clipped to the day (a day-long event reads
  // 00:00–23:59).
  const dayEnd = instantOf(addDays(d, 1), "00:00", zone());
  const told: Busy[] = (await toldBusy(sql, people as string[], from, dayEnd))
    .map(b => ({ member: b.member, start: new Date(Math.max(b.start.getTime(), from.getTime())).toISOString(), end: new Date(Math.min(b.end.getTime(), dayEnd.getTime() - 60_000)).toISOString(), source: b.source }));
  return [...own, ...told].sort((a, b) => a.start.localeCompare(b.start));
}

// ---- The invitation ---------------------------------------------------------

const domain = () => {
  const url = chest.teamUrl();
  try {
    return url ? new URL(url).hostname : "hiring.chest";
  } catch {
    return "hiring.chest";
  }
};

// The .ics the candidate receives: the event in their language, the same
// UID for every version (a calendar that has it updates it), CANCEL when
// it is called off.
export function icsFor(interview: Interview & { sequence?: number }, words: { title: string; description: string }, stamp = new Date()): string {
  return calendar.ics([{
    uid: calendar.uidOf("hiring", keyOf(interview.id), domain()),
    stamp,
    sequence: interview.sequence ?? 0,
    title: words.title,
    ...(words.description ? { description: words.description } : {}),
    ...(interview.place ? { location: interview.place } : {}),
    start: new Date(interview.start),
    end: new Date(interview.end),
    ...(interview.cancelled ? { cancelled: true } : {}),
  }], { method: interview.cancelled ? "CANCEL" : "PUBLISH" });
}

// invite queues the email that invites the candidate (or tells them it is
// called off), in their language, with its .ics.
// actor: who sends it (their first name signs it) — a member, or, for a
// time a candidate chose, the recruiter who sent the link.
export async function invite(tx: Query, actor: Pick<Member, "id" | "name"> & { firstName?: string }, c: Candidate, interview: Interview, kind: "interview" | "interview_cancelled"): Promise<string> {
  const t = catalogue(c.language).mail;
  const [job] = await tx<{ title: string }[]>`select title from jobs where id = ${c.jobId}`;
  const s = await settings(tx);
  const [seq] = await tx<{ sequence: number }[]>`select sequence from interviews where id = ${interview.id}`;
  const v = { ...mailer.values(c, job!, s.companyName, actor.firstName || actor.name), ...when(interview, c.language), place: interview.place, note: interview.note };
  const subject = format(kind === "interview" ? t.interviewSubject : t.interviewCancelledSubject, v);
  const text = format(kind === "interview" ? t.interviewBody : t.interviewCancelledBody, v)
    .replace(/\n\n\n+/gu, "\n\n");
  const title = format(t.interviewTitle, v);
  const ics = icsFor({ ...interview, sequence: seq?.sequence ?? 0 }, { title, description: interview.note });
  return queue(tx, actor, c.id, { kind, subject, text: withBlocks(text, interview, t), calendar: ics });
}

// The place and the note, each on its line when given.
function withBlocks(text: string, interview: Interview, t: Catalogue["mail"]): string {
  const lines = [...(interview.place ? [format(t.interviewPlace, { place: interview.place })] : []), ...(interview.note ? ["", interview.note] : [])];
  return lines.length ? text.replace("{blocks}", lines.join("\n")) : text.replace("{blocks}\n\n", "").replace("{blocks}", "");
}

// when: "Monday 12 October, 14:30–15:30 (Paris time)" in a language.
export function when(interview: { start: string; end: string }, locale: Locale | string): { date: string; time: string; zone: string } {
  const z = zone();
  const intl = locale === "fr" ? "fr" : "en-GB";
  const date = new Intl.DateTimeFormat(intl, { timeZone: z, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(interview.start));
  return { date, time: `${timeOf(interview.start, z)}–${timeOf(interview.end, z)}`, zone: (z.split("/").at(-1) ?? z).replace(/_/gu, " ") };
}

// ---- The interviewers' calendars ---------------------------------------------

// flushCalendars puts the interviews waiting for it into the interviewers'
// Chest calendars (or takes them out: cancelled, candidate rejected or
// erased). Never throws for the Chest: the tool's pages stay the truth. On
// a Chest without calendars, interviews are marked 'off' and their pages
// offer the .ics instead.
export async function flushCalendars(sql: Sql, limit = 30): Promise<void> {
  const gone = await sql<{ key: string }[]>`select key from calendar_gone order by queued_at limit ${limit}`;
  for (const g of gone) {
    try {
      await calendar.remove(g.key);
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      if (!(error instanceof CapabilityNotGranted)) return;
    }
    await sql`delete from calendar_gone where key = ${g.key}`;
  }
  const rows = await sql<(InterviewDb & { name: string; title: string; status: string })[]>`
    select x.*, c.name, j.title, c.status from (${select(sql)} where i.calendar = 'pending') x
    join candidates c on c.id = x.candidate_id join jobs j on j.id = c.job_id order by x.id limit ${limit}`;
  for (const r of rows) {
    const i = toInterview(r);
    const key = keyOf(i.id);
    const drop = i.cancelled || r.status !== "active" || i.people.length === 0 || new Date(i.end).getTime() < Date.now() - 300 * 86400_000;
    try {
      if (drop) await calendar.remove(key);
      else {
        const title = Object.fromEntries(locales.map(l => [l, cut(format(catalogue(l).calendar.title, { candidate: r.name, job: r.title }), 120)]));
        const description = Object.fromEntries(locales.map(l => [l, cut(i.note ? format(catalogue(l).calendar.withNote, { note: i.note }) : catalogue(l).calendar.description, 1000)]));
        await calendar.put({ key, members: i.people, title, description, start: i.start, end: i.end, ...(i.place ? { location: cut(i.place, 200) } : {}), path: `/chest/candidates/${i.candidateId}` });
      }
      // Changed meanwhile (microseconds, as text: a JavaScript date would
      // lose them): it stays pending for the next flush.
      await sql`update interviews set calendar = 'done' where id = ${i.id} and (extract(epoch from updated_at) * 1000000)::bigint = ${r.stamp}::bigint`;
    } catch (error) {
      if (error instanceof CapabilityNotGranted) {
        await sql`update interviews set calendar = 'off' where calendar = 'pending'`;
        return;
      }
      if (error instanceof ChestError && (error.code === "invalid_event" || error.code === "invalid_key" || error.code === "invalid_id")) {
        await sql`update interviews set calendar = 'done' where id = ${i.id}`;
        continue;
      }
      if (error instanceof ChestError) return;
      throw error;
    }
  }
}

// requeue: something changed an interview's people or candidate (a member
// left, a candidate rejected): its calendar event is written again.
export async function requeue(sql: Query, where: { candidate?: string; member?: string }): Promise<void> {
  if (where.candidate) await sql`update interviews set calendar = 'pending', updated_at = now() where candidate_id = ${where.candidate} and calendar = 'done'`;
  if (where.member) await sql`update interviews set calendar = 'pending', updated_at = now() where calendar = 'done' and id in (select interview_id from interview_people where member_id = ${where.member})`;
}

const cut = (text: string, max: number) => {
  const chars = [...text.replace(/[\r\n]+/gu, " ").trim()];
  return chars.length <= max ? chars.join("") : chars.slice(0, max - 1).join("") + "…";
};

// The .ics of an interview for a member (a Chest without calendars: "Add
// to my calendar"), in their language.
export async function icsForMember(sql: Sql, actor: Member | null, interviewId: unknown, locale: Locale): Promise<string> {
  const key = id(interviewId);
  const found = await read(sql, key);
  if (!found || !actor) throw new AppError("not_found");
  const { candidate } = await load(sql, actor, found.candidateId);
  const [job] = await sql<{ title: string }[]>`select title from jobs where id = ${candidate.jobId}`;
  const t = catalogue(locale).calendar;
  return icsFor(found, { title: format(t.title, { candidate: candidate.name, job: job!.title }), description: found.note });
}

// Today's interviews, for the morning reminder: who is on which.
export async function today(sql: Query, now = new Date()): Promise<(Interview & { candidateName: string; jobTitle: string })[]> {
  const d = dayOf(now, zone());
  const from = instantOf(d, "00:00", zone());
  const rows = await sql<(InterviewDb & { name: string; title: string })[]>`
    select x.*, c.name, j.title from (${select(sql)} where i.cancelled_at is null and i.starts_at >= ${from} and i.starts_at < ${new Date(from.getTime() + 30 * 3600_000)}) x
    join candidates c on c.id = x.candidate_id join jobs j on j.id = c.job_id where c.status = 'active' order by x.starts_at`;
  return rows.filter(r => dayOf(r.starts_at, zone()) === d).map(r => ({ ...toInterview(r), candidateName: r.name, jobTitle: r.title }));
}
