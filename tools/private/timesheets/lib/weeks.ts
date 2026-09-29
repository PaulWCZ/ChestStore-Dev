import { createHash } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { can, roles } from "./access.ts";
import { AppError } from "./app-error.ts";
import { today, zone } from "./clock.ts";
import type { Query } from "./db.ts";
import { addDays, isDay, mondayOf } from "./days.ts";
import { managerIds } from "./directory.ts";
import { formatDuration } from "./duration.ts";
import { format, formatDay, type Catalogue } from "./i18n/index.ts";
import type { Locale } from "@argentic/chest-sdk/member";
import { email } from "./mail.ts";
import { clean, memberPattern, numeric } from "./model.ts";
import { notify, withdraw } from "./notify.ts";
import { people } from "./people.ts";
import { settings } from "./settings.ts";
import { transaction } from "./tx.ts";

// The week as a ritual: a person submits their week; a manager approves it
// (it locks: nobody changes it any more) or sends it back with a word (it
// opens again). While it waits, the person may take it back. Nobody
// approves (or sends back) their own week: a manager's week waits for
// another manager. The bell and an email tell the leads of the projects the
// week holds (every manager when none has a lead) of a week to approve, and
// the person of the answer.
// The company may turn approvals off (Settings): then nobody submits.
//
// Beside it, each person's usual week (their capacity, the company's by
// default): the Team page shows who is under it, and "Remind" rings their
// bell.

export type WeekStatus = "open" | "submitted" | "approved" | "returned";
export type WeekState = { status: WeekStatus; minutes: number; submittedAt: string | null; decidedBy: string | null; decidedAt: string | null; reason: string };
const open: WeekState = { status: "open", minutes: 0, submittedAt: null, decidedBy: null, decidedAt: null, reason: "" };

type Row = { member_id: string; week: string; status: Exclude<WeekStatus, "open">; minutes: number; submitted_at: Date; decided_by: string | null; decided_at: Date | null; reason: string };
const toState = (r: Row): WeekState => ({
  status: r.status, minutes: r.minutes, submittedAt: new Date(r.submitted_at).toISOString(), decidedBy: r.decided_by,
  decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null, reason: r.reason,
});
const columns = (sql: Query) => sql`member_id, to_char(week, 'YYYY-MM-DD') as week, status, minutes, submitted_at, decided_by, decided_at, reason`;

function monday(value: unknown): string {
  if (!isDay(value)) throw new AppError("invalid");
  return mondayOf(value);
}

function person(value: unknown): string {
  if (typeof value !== "string" || !memberPattern.test(value)) throw new AppError("not_found");
  return value;
}

export async function weekState(sql: Query, memberId: string, week: string): Promise<WeekState> {
  const [r] = await sql<Row[]>`select ${columns(sql)} from weeks where member_id = ${memberId} and week = ${mondayOf(week)}`;
  return r ? toState(r) : open;
}

// weekLock refuses a change to a day of a week that was submitted or
// approved (the caller holds the person's lock).
export async function weekLock(tx: Query, memberId: string, day: string): Promise<void> {
  if (!memberPattern.test(memberId)) return;
  const [r] = await tx<{ status: string }[]>`select status from weeks where member_id = ${memberId} and week = ${mondayOf(day)}`;
  if (r?.status === "submitted") throw new AppError("week_submitted");
  if (r?.status === "approved") throw new AppError("week_approved");
}

// The weeks of a person that no longer change, among some days.
export async function closedWeeks(sql: Query, memberId: string, from: string, to: string): Promise<Set<string>> {
  const rows = await sql<{ week: string }[]>`
    select to_char(week, 'YYYY-MM-DD') as week from weeks where member_id = ${memberId} and status in ('submitted', 'approved') and week between ${mondayOf(from)} and ${to}`;
  return new Set(rows.map(r => r.week));
}

async function total(tx: Query, memberId: string, week: string): Promise<number> {
  const [r] = await tx<{ total: string }[]>`
    select coalesce(sum(minutes), 0)::text as total from entries where member_id = ${memberId} and day between ${week} and ${addDays(week, 6)} and deleted_at is null`;
  return numeric(r?.total);
}

const lockPerson = (tx: Query, memberId: string) => tx`select pg_advisory_xact_lock(hashtext(${"timesheets:" + memberId}))`;
const approveKey = (memberId: string, week: string) => `approve:${memberId}:${week}`;
const answerKey = (week: string) => `approval:${week}`;

// submitWeek: the person sends their week (this one or one before). A week
// running now may be sent too (someone off on Friday).
export async function submitWeek(sql: Query, actor: Member | null, week: unknown): Promise<WeekState & { approvers: number }> {
  if (!actor || !can(actor, "time.own")) throw new AppError("forbidden");
  const w = monday(week);
  if (w > mondayOf(today())) throw new AppError("week_future");
  if (!(await settings(sql)).approvals) throw new AppError("forbidden");
  const state = await transaction(sql, async tx => {
    await lockPerson(tx, actor.id);
    const [r] = await tx<Row[]>`select ${columns(tx)} from weeks where member_id = ${actor.id} and week = ${w} for update`;
    if (r && r.status !== "returned") throw new AppError("week_state");
    const minutes = await total(tx, actor.id, w);
    const [row] = await tx<Row[]>`
      insert into weeks (member_id, week, status, minutes, submitted_at) values (${actor.id}, ${w}, 'submitted', ${minutes}, now())
      on conflict (member_id, week) do update set status = 'submitted', minutes = excluded.minutes, submitted_at = now(), decided_by = null, decided_at = null, reason = ''
      returning ${columns(tx)}`;
    return toState(row!);
  });
  await withdraw(answerKey(w), [actor.id]);
  const approvers = await approversOf(sql, actor.id, w);
  const title = (t: Catalogue, locale: Locale) => format(t.bell.submitted, { name: actor.name, date: formatDay(w, locale, { day: "numeric", month: "short" }), hours: formatDuration(state.minutes) });
  await notify(approvers, (t, locale) => ({ title: title(t, locale) }), { path: `/chest/team/${actor.id}?week=${w}`, key: approveKey(actor.id, w) });
  await email(approvers, (t, locale) => ({ subject: title(t, locale), lines: [t.mail.submittedLine] }), { path: `/chest/team/${actor.id}?week=${w}`, key: `week:${createHash("sha256").update(`${actor.id}:${w}:${state.submittedAt}`).digest("hex").slice(0, 20)}` });
  return { ...state, approvers: approvers.length };
}

// approversOf: who is asked to approve a person's week — the leads of the
// projects it holds, when they are managers (never the person); every
// other manager when the week holds no led project.
export async function approversOf(sql: Query, memberId: string, week: string): Promise<string[]> {
  const managers = (await managerIds()).filter(id => id !== memberId);
  const leads = await sql<{ lead_id: string }[]>`
    select distinct p.lead_id from entries e join projects p on p.id = e.project_id
    where e.member_id = ${memberId} and e.day between ${week} and ${addDays(week, 6)} and e.deleted_at is null and p.lead_id is not null`;
  const led = leads.map(l => l.lead_id).filter(l => managers.includes(l));
  return led.length > 0 ? led : managers;
}

// withdrawWeek: the person takes back a week that waits (to change it).
export async function withdrawWeek(sql: Query, actor: Member | null, week: unknown): Promise<void> {
  if (!actor || !can(actor, "time.own")) throw new AppError("forbidden");
  const w = monday(week);
  const done = await sql`delete from weeks where member_id = ${actor.id} and week = ${w} and status = 'submitted'`;
  if (done.count === 0) throw new AppError("week_state");
  await withdraw(approveKey(actor.id, w));
}

// Whether a week may be approved without a second look: it is over (its
// Sunday is past) and holds at least the person's usual week. Approving
// locks the week: a short or unfinished one is approved only on purpose.
export type Fullness = { over: boolean; minutes: number; capacity: number; short: boolean };
export function fullness(week: string, minutes: number, capacity: number, now = today()): Fullness {
  const over = addDays(week, 6) < now;
  return { over, minutes, capacity, short: minutes < capacity };
}
export const needsLook = (f: Fullness) => !f.over || f.short;

// A manager's answer. A week not over, or under the person's usual week,
// is approved only with `anyway` (the manager saw it: week_short).
export async function approveWeek(sql: Query, actor: Member | null, memberId: unknown, week: unknown, options: { anyway?: unknown } = {}): Promise<WeekState> {
  if (!actor || !can(actor, "approve")) throw new AppError("forbidden");
  const who = person(memberId);
  const w = monday(week);
  // The time is billed from approved weeks: never one's own.
  if (who === actor.id) throw new AppError("self_approval");
  if (options.anyway !== true) {
    const [minutes, caps] = await Promise.all([total(sql, who, w), capacities(sql, [who])]);
    const [state] = await sql<{ status: string }[]>`select status from weeks where member_id = ${who} and week = ${w}`;
    if (state?.status === "submitted" && needsLook(fullness(w, minutes, caps.get(who) ?? 0))) throw new AppError("week_short");
  }
  const [r] = await sql<Row[]>`
    update weeks set status = 'approved', decided_by = ${actor.id}, decided_at = now(), reason = ''
    where member_id = ${who} and week = ${w} and status = 'submitted' returning ${columns(sql)}`;
  if (!r) throw new AppError("week_state");
  await withdraw(approveKey(who, w));
  await notify([who], (t, locale) => ({ title: format(t.bell.approved, { date: formatDay(w, locale, { day: "numeric", month: "short" }) }) }), { path: `/chest?week=${w}`, key: answerKey(w) });
  return toState(r);
}

// returnWeek sends a waiting (or approved) week back with a word: it opens
// again for its person, who reads why.
export async function returnWeek(sql: Query, actor: Member | null, memberId: unknown, week: unknown, reason: unknown): Promise<WeekState> {
  if (!actor || !can(actor, "approve")) throw new AppError("forbidden");
  const who = person(memberId);
  const w = monday(week);
  // One's own waiting week is taken back (withdrawWeek), not sent back; an
  // approved one is reopened by another manager.
  if (who === actor.id) throw new AppError("self_approval");
  const why = clean(reason, 300);
  const [r] = await sql<Row[]>`
    update weeks set status = 'returned', decided_by = ${actor.id}, decided_at = now(), reason = ${why}
    where member_id = ${who} and week = ${w} and status in ('submitted', 'approved') returning ${columns(sql)}`;
  if (!r) throw new AppError("week_state");
  await withdraw(approveKey(who, w));
  await notify([who], (t, locale) => ({
    title: format(t.bell.returned, { date: formatDay(w, locale, { day: "numeric", month: "short" }) }),
    body: why,
  }), { path: `/chest?week=${w}`, key: answerKey(w) });
  return toState(r);
}

// The weeks waiting for a manager, oldest first.
// `mine`: the actor's own week (someone else approves it); `led`: it holds
// time on a project the actor leads.
export type Waiting = { memberId: string; week: string; minutes: number; billableMinutes: number; submittedAt: string; fullness: Fullness; mine: boolean; led: boolean };

export async function waiting(sql: Query, actor: Member | null): Promise<Waiting[]> {
  if (!actor || !can(actor, "approve")) throw new AppError("forbidden");
  const rows = await sql<{ member_id: string; week: string; minutes: string; billable: string; submitted_at: Date; led: boolean }[]>`
    select w.member_id, to_char(w.week, 'YYYY-MM-DD') as week, w.submitted_at,
      exists (select 1 from entries e join projects p on p.id = e.project_id where e.member_id = w.member_id and e.day between w.week and w.week + 6 and e.deleted_at is null and p.lead_id = ${actor.id}) as led,
      coalesce((select sum(e.minutes) from entries e where e.member_id = w.member_id and e.day between w.week and w.week + 6 and e.deleted_at is null), 0)::text as minutes,
      coalesce((select sum(e.minutes) from entries e where e.member_id = w.member_id and e.day between w.week and w.week + 6 and e.deleted_at is null and e.billable), 0)::text as billable
    from weeks w where w.status = 'submitted' order by w.week, w.submitted_at limit 500`;
  const caps = await capacities(sql, [...new Set(rows.map(r => r.member_id))]);
  const now = today();
  return rows.map(r => ({ memberId: r.member_id, week: r.week, minutes: numeric(r.minutes), billableMinutes: numeric(r.billable), submittedAt: new Date(r.submitted_at).toISOString(), fullness: fullness(r.week, numeric(r.minutes), caps.get(r.member_id) ?? 0, now), mine: r.member_id === actor.id, led: r.led }))
    // The weeks the actor leads first, then the others; their own last.
    .sort((a, b) => Number(a.mine) - Number(b.mine) || Number(b.led) - Number(a.led));
}

// People's usual weeks.
export async function capacities(sql: Query, memberIds: readonly string[]): Promise<Map<string, number>> {
  const s = await settings(sql);
  const rows = memberIds.length ? await sql<{ member_id: string; week_minutes: number }[]>`select member_id, week_minutes from people where member_id = any(${[...memberIds]}::text[])` : [];
  return new Map(memberIds.map(id => [id, rows.find(r => r.member_id === id)?.week_minutes ?? s.reminder.minutes]));
}

// setCapacity gives a person their own usual week (null: the company's).
export async function setCapacity(sql: Query, actor: Member | null, memberId: unknown, minutes: unknown): Promise<void> {
  if (!actor || !can(actor, "rates")) throw new AppError("forbidden");
  const who = person(memberId);
  if (minutes === null) {
    await sql`delete from people where member_id = ${who}`;
    return;
  }
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 0 || minutes > 6000) throw new AppError("invalid");
  await sql`insert into people (member_id, week_minutes) values (${who}, ${minutes}) on conflict (member_id) do update set week_minutes = excluded.week_minutes`;
}

// The team's weeks: for each person and each of some Mondays, their hours,
// the state of that week and their usual week.
// `before`: a week before the person's start in the tool — nothing was
// expected of them then (no "short", no Remind).
export type TeamCell = { week: string; minutes: number; status: WeekStatus; reason: string; before: boolean };
export type TeamRow = { memberId: string; capacity: number; start: string | null; weeks: TeamCell[] };

// When the tool started being used: the Monday of its first project or of
// its first entry (imported time included); null while it holds neither.
export async function toolStart(sql: Query): Promise<string | null> {
  const [r] = await sql<{ first: string | null }[]>`
    select to_char(least((select min(day) from entries where deleted_at is null), (select min(created_at at time zone ${zone()})::date from projects)), 'YYYY-MM-DD') as first`;
  return r?.first ? mondayOf(r.first) : null;
}

// Each person's first week in the tool: the Monday of their first entry,
// else of the first day they opened it (people.first_seen), never before the
// tool's start; null when neither is known and the tool has not started.
export async function startWeeks(sql: Query, memberIds: readonly string[]): Promise<Map<string, string | null>> {
  const start = await toolStart(sql);
  const rows = memberIds.length ? await sql<{ member_id: string; first: string | null }[]>`
    select m.member_id, to_char(least(
      (select min(day) from entries e where e.member_id = m.member_id and e.deleted_at is null),
      (select first_seen from seen s where s.member_id = m.member_id)), 'YYYY-MM-DD') as first
    from unnest(${[...memberIds]}::text[]) as m(member_id)` : [];
  return new Map(memberIds.map(id => {
    const first = rows.find(r => r.member_id === id)?.first ?? null;
    if (start === null) return [id, null];
    const own = first ? mondayOf(first) : start;
    return [id, own > start ? own : start];
  }));
}

// seenNow remembers the first day a member opened the tool (their start,
// when they have no entry yet). Once per member: later calls change nothing.
export async function seenNow(sql: Query, memberId: string): Promise<void> {
  if (!memberPattern.test(memberId)) return;
  await sql`insert into seen (member_id, first_seen) values (${memberId}, ${today()}) on conflict (member_id) do nothing`;
}

export async function teamWeeks(sql: Query, actor: Member | null, memberIds: readonly string[], mondays: readonly string[]): Promise<TeamRow[]> {
  if (!actor || !can(actor, "approve")) throw new AppError("forbidden");
  if (memberIds.length === 0 || mondays.length === 0) return [];
  const first = mondays.reduce((a, b) => (a < b ? a : b));
  const last = addDays(mondays.reduce((a, b) => (a > b ? a : b)), 6);
  const [sums, states, caps, starts] = await Promise.all([
    sql<{ member_id: string; week: string; total: string }[]>`
      select member_id, to_char(date_trunc('week', day)::date, 'YYYY-MM-DD') as week, sum(minutes)::text as total from entries
      where deleted_at is null and day between ${first} and ${last} and member_id = any(${[...memberIds]}::text[]) group by 1, 2`,
    sql<Row[]>`select ${columns(sql)} from weeks where week between ${first} and ${last} and member_id = any(${[...memberIds]}::text[])`,
    capacities(sql, memberIds),
    startWeeks(sql, memberIds),
  ]);
  return memberIds.map(memberId => {
    const start = starts.get(memberId) ?? null;
    return {
      memberId,
      capacity: caps.get(memberId) ?? 0,
      start,
      weeks: mondays.map(week => {
        const st = states.find(s => s.member_id === memberId && s.week === week);
        const minutes = numeric(sums.find(s => s.member_id === memberId && s.week === week)?.total);
        // Time recorded (or a week sent) always counts, whatever the start.
        const before = (start === null || week < start) && minutes === 0 && !st;
        return { week, minutes, status: st?.status ?? "open", reason: st?.reason ?? "", before };
      }),
    };
  });
}

// remind rings the bell of those, among the people named, whose week is
// under their usual week and not sent yet — each in their language, one
// item per week (a second reminder replaces the first), and emails them.
// Never the manager who presses it. Says how many.
export async function remind(sql: Query, actor: Member | null, memberIds: unknown, week: unknown): Promise<number> {
  if (!actor || !can(actor, "approve")) throw new AppError("forbidden");
  const w = monday(week);
  if (w > mondayOf(today())) throw new AppError("week_future");
  if (!Array.isArray(memberIds) || memberIds.length === 0 || memberIds.length > 2000) throw new AppError("invalid");
  const ids = [...new Set(memberIds.map(person))].filter(id => id !== actor.id);
  if (ids.length === 0) return 0;
  const rows = await teamWeeks(sql, actor, ids, [w]);
  const short = rows.filter(r => isShort(r.weeks[0]!, r.capacity));
  const found = await people(short.map(r => r.memberId));
  const current = short.filter(r => found.get(r.memberId)?.status === "member");
  for (const r of current) {
    const minutes = r.weeks[0]!.minutes;
    const title = (t: Catalogue, locale: Locale) => minutes === 0
      ? format(t.bell.remindEmpty, { date: formatDay(w, locale, { day: "numeric", month: "short" }) })
      : format(t.bell.remind, { date: formatDay(w, locale, { day: "numeric", month: "short" }), hours: formatDuration(minutes), usual: formatDuration(r.capacity) });
    await notify([r.memberId], (t, locale) => ({ title: title(t, locale) }), { path: `/chest?week=${w}`, key: `remind:${w}` });
    // By email too, once a day at most for the same week.
    await email([r.memberId], (t, locale) => ({ subject: title(t, locale), lines: [format(t.mail.remindLine, { name: actor.name })] }), { path: `/chest?week=${w}`, key: `remind:${w}:${today()}` });
  }
  return current.length;
}

// A week to remind of: expected of the person (not before their start),
// not sent, under their usual week.
export function isShort(c: TeamCell, capacity: number): boolean {
  return !c.before && c.status !== "submitted" && c.status !== "approved" && c.minutes < capacity;
}

// The people of the team: whoever has the tool with a role, as the Chest
// says now (names are never copied).
export function withRole<T extends { role: string | null }>(list: T[]): T[] {
  return list.filter(p => p.role !== null && (roles as readonly string[]).includes(p.role));
}

// A person's week as a manager reads it before approving: every entry of
// the week, with its project, task, note and whether it is billable.
export type ReadEntry = { id: string; day: string; minutes: number; note: string; billable: boolean; invoiced: boolean; projectId: string; projectName: string; clientName: string | null; color: string; taskName: string | null };

export async function personWeek(sql: Query, actor: Member | null, memberId: unknown, week: unknown): Promise<{ state: WeekState; entries: ReadEntry[] }> {
  if (!actor || !can(actor, "approve")) throw new AppError("forbidden");
  const who = person(memberId);
  const w = monday(week);
  const [state, rows] = await Promise.all([
    weekState(sql, who, w),
    sql<{ id: string; day: string; minutes: number; note: string; billable: boolean; invoiced: boolean; project_id: string; project_name: string; client_name: string | null; color: string; task_name: string | null }[]>`
      select e.id::text, to_char(e.day, 'YYYY-MM-DD') as day, e.minutes, e.note, e.billable, e.invoiced_at is not null as invoiced,
        p.id::text as project_id, p.name as project_name, c.name as client_name, p.color, t.name as task_name
      from entries e join projects p on p.id = e.project_id left join clients c on c.id = p.client_id left join tasks t on t.id = e.task_id
      where e.member_id = ${who} and e.day between ${w} and ${addDays(w, 6)} and e.deleted_at is null
      order by e.day, e.started_at nulls last, e.id`,
  ]);
  return {
    state,
    entries: rows.map(r => ({ id: r.id, day: r.day, minutes: r.minutes, note: r.note, billable: r.billable, invoiced: r.invoiced, projectId: r.project_id, projectName: r.project_name, clientName: r.client_name, color: r.color, taskName: r.task_name })),
  };
}
