import type { Member } from "@argentic/chest-sdk/member";
import { can, mayDecide, roleOf, sightOf, type Sight } from "./access.ts";
import { AppError } from "./app-error.ts";
import { addDays, cost, daysBetween, hasHalf, isHalf, overlaps, spanValid, type Day, type Half, type Span } from "../shared/calendar.ts";
import type { Query, Sql } from "./db.ts";
import { hrIds } from "./directory.ts";
import { clean, day, id, limits, memberId, numeric } from "../shared/model.ts";
import { today } from "./today.ts";
import { balancesOf, leftIfApproved } from "./balances.ts";
import { isFamilyEvent, leaveType, rulesFor, settings, type FamilyEvent } from "./rules.ts";
import { staffOf, staffRow } from "./staff.ts";

// Leave requests: asked by a person for themselves, answered by their
// approver (or HR), cancelled by them while pending, or — once approved —
// cancelled at their request by the approver. Approving deducts the days
// from the balance (a ledger line); cancelling an approved leave gives them
// back (another line). Every step is recorded (request_events).

export type Status = "pending" | "approved" | "refused" | "cancelled";
export type LeaveRequest = Span & {
  id: string;
  memberId: string;
  typeId: string;
  days: number;
  note: string;
  status: Status;
  cancelAsked: boolean;
  decidedBy: string | null;
  decidedAt: string | null;
  reason: string;
  createdAt: string;
  event: FamilyEvent | null;
};

type Row = {
  id: string; member_id: string; type_id: string; start_date: string; start_half: Half; end_date: string; end_half: Half; days: string; note: string | null;
  status: Status; cancel_asked_at: Date | null; decided_by: string | null; decided_at: Date | null; reason: string | null; created_at: Date; event: string | null;
};

const toRequest = (r: Row): LeaveRequest => ({
  id: String(r.id), memberId: r.member_id, typeId: String(r.type_id), start: r.start_date, startHalf: r.start_half, end: r.end_date, endHalf: r.end_half,
  days: numeric(r.days), note: r.note ?? "", status: r.status, cancelAsked: r.cancel_asked_at !== null, decidedBy: r.decided_by,
  decidedAt: r.decided_at ? r.decided_at.toISOString() : null, reason: r.reason ?? "", createdAt: r.created_at.toISOString(),
  event: isFamilyEvent(r.event) ? r.event : null,
});

const columns = (sql: Query) => sql`
  id, member_id, type_id, to_char(start_date, 'YYYY-MM-DD') as start_date, start_half, to_char(end_date, 'YYYY-MM-DD') as end_date, end_half,
  days, note, status, cancel_asked_at, decided_by, decided_at, reason, created_at, event`;

async function row(sql: Query, requestId: unknown, lock = false): Promise<LeaveRequest> {
  const [r] = await sql<Row[]>`select ${columns(sql)} from requests where id = ${id(requestId)} ${lock ? sql`for update` : sql``}`;
  if (!r) throw new AppError("not_found");
  return toRequest(r);
}

// The window a request must fit in, from a day.
export function window(from: Day): { earliest: Day; latest: Day } {
  return { earliest: addDays(from, -limits.pastDays), latest: addDays(from, limits.futureDays) };
}

// memberId: HR, or a person's approver, records leave for them (someone
// without a computer, a sick day phoned in, a correction): approved at
// once. event: the family event a "family" leave is for.
export type RequestInput = { typeId: unknown; start: unknown; startHalf: unknown; end: unknown; endHalf: unknown; note?: unknown; memberId?: unknown; event?: unknown };

// Whose leave a request is: the actor's own, or — for HR and the person's
// approver — someone else's (null for anybody else: they cannot see them).
async function subject(sql: Query, actor: Member | null, input: RequestInput): Promise<{ who: string; forSomeone: boolean }> {
  if (!can(actor, "request")) throw new AppError("forbidden");
  if (input.memberId === undefined || input.memberId === null || input.memberId === "" || input.memberId === actor!.id) return { who: actor!.id, forSomeone: false };
  const who = memberId(input.memberId);
  const sight = sightOf(actor, { memberId: who, approverId: (await staffRow(sql, who)).approverId });
  if (sight !== "approver") throw new AppError("not_found");
  return { who, forSomeone: true };
}

// quote: what a request would cost, checked as createRequest checks it —
// the page shows it live, the server decides.
export async function quote(sql: Query, actor: Member | null, input: RequestInput): Promise<{ span: Span; days: number; typeId: string; note: string; who: string; forSomeone: boolean; event: FamilyEvent | null }> {
  const { who, forSomeone } = await subject(sql, actor, input);
  const type = await leaveType(sql, input.typeId);
  if (type.archived) throw new AppError("not_found");
  if (!isHalf(input.startHalf) || !isHalf(input.endHalf)) throw new AppError("invalid");
  const span: Span = { start: day(input.start), startHalf: input.startHalf, end: day(input.end), endHalf: input.endHalf };
  if (!spanValid(span)) throw new AppError("bad_dates");
  if (!type.halfDays && hasHalf(span)) throw new AppError("no_half_days");
  const w = window(today());
  if (span.start < w.earliest || span.end > w.latest || daysBetween(span.start, span.end) >= limits.spanDays) throw new AppError("too_far");
  const note = clean(input.note ?? "", limits.note, { multiline: true, optional: true });
  if (note !== "" && !type.notes) throw new AppError("no_notes");
  let event: FamilyEvent | null = null;
  if (type.key === "family") {
    if (!isFamilyEvent(input.event)) throw new AppError("no_event");
    event = input.event;
  } else if (input.event !== undefined && input.event !== null && input.event !== "") throw new AppError("invalid");
  const person = await staffRow(sql, who);
  // Nothing after the person's last day: their final balance is what
  // payroll pays (asked, or recorded by HR alike).
  if (person.endDate && span.end > person.endDate) throw new AppError("left_company");
  const days = cost(span, rulesFor(type, await settings(sql), span.start, span.end, person.workDays));
  if (days <= 0) throw new AppError("no_days");
  // A kind that may not go below zero: what is left once the waiting
  // requests are approved must cover it (HR recording leave decides).
  if (type.balance && !type.overdraw && !forSomeone) await enough(sql, who, type.id, days);
  return { span, days, typeId: type.id, note, who, forSomeone, event };
}

// enough: refused when what would be left, once the waiting requests are
// approved, does not cover `days` (a kind that may not go below zero).
async function enough(sql: Query, who: string, typeId: string, days: number): Promise<void> {
  const b = (await balancesOf(sql, [who])).get(who)?.find(x => x.typeId === typeId);
  if (b && leftIfApproved(b) - days < 0) throw new AppError("not_enough", { days: Math.max(leftIfApproved(b), 0) });
}

// createRequest: a person asks for leave for themselves; or HR, or their
// approver, records it for them — approved at once. A type that needs no
// answer (sick leave) is recorded as approved at once too. Two requests of
// a person never overlap, not even by half a day.
export async function createRequest(sql: Sql, actor: Member | null, input: RequestInput): Promise<LeaveRequest> {
  const q = await quote(sql, actor, input);
  const type = await leaveType(sql, q.typeId);
  const who = q.who;
  const requestId = await sql.begin(async tx => {
    // One request at a time per person: their staff row is the lock.
    await tx`insert into staff (member_id) values (${who}) on conflict do nothing`;
    await tx`select 1 from staff where member_id = ${who} for update`;
    const near = await tx<Row[]>`
      select ${columns(tx)} from requests
      where member_id = ${who} and status in ('pending', 'approved') and start_date <= ${q.span.end} and end_date >= ${q.span.start}`;
    if (near.map(toRequest).some(r => overlaps(r, q.span))) throw new AppError(q.forSomeone ? "overlap_someone" : "overlap");
    // Counted again under the lock: two requests sent at once are not both
    // covered by the same days.
    if (type.balance && !type.overdraw && !q.forSomeone) await enough(tx, who, type.id, q.days);
    const now = q.forSomeone || !type.approval;
    const status: Status = now ? "approved" : "pending";
    const by = q.forSomeone ? actor!.id : "chest";
    const [created] = await tx<{ id: string }[]>`
      insert into requests (member_id, type_id, start_date, start_half, end_date, end_half, days, note, status, decided_by, decided_at, event)
      values (${who}, ${type.id}, ${q.span.start}, ${q.span.startHalf}, ${q.span.end}, ${q.span.endHalf}, ${q.days}, ${q.note || null}, ${status},
        ${now ? by : null}, ${now ? tx`now()` : null}, ${q.event})
      returning id`;
    const key = String(created!.id);
    await tx`insert into request_events (request_id, actor, kind) values (${key}, ${actor!.id}, ${q.forSomeone ? "recorded" : type.approval ? "asked" : "declared"})`;
    if (now && type.balance) await take(tx, key, by);
    return key;
  });
  return row(sql, requestId);
}

// take writes the days of an approved request off its person's balance;
// giveBack returns what was taken (once).
async function take(tx: Query, requestId: string, by: string): Promise<void> {
  await tx`
    insert into ledger (member_id, type_id, kind, days, on_date, request_id, created_by)
    select r.member_id, r.type_id, 'taken', -r.days, r.start_date, r.id, ${by}
    from requests r join leave_types t on t.id = r.type_id where r.id = ${requestId} and t.balance`;
}

async function giveBack(tx: Query, requestId: string, by: string): Promise<void> {
  const [{ held } = { held: "0" }] = await tx<{ held: string }[]>`select coalesce(sum(days), 0) as held from ledger where request_id = ${requestId} and kind in ('taken', 'returned')`;
  if (numeric(held) >= 0) return;
  await tx`
    insert into ledger (member_id, type_id, kind, days, on_date, request_id, created_by)
    select member_id, type_id, 'returned', ${-numeric(held)}, start_date, id, ${by} from requests where id = ${requestId}`;
}

// What the actor may see of a request, and whether they may answer it.
export type Seen = LeaveRequest & { sight: Sight; approverId: string | null; mayDecide: boolean };

async function soleHr(actor: Member): Promise<boolean> {
  if (roleOf(actor) !== "hr") return false;
  return (await hrIds()).every(h => h === actor.id);
}

async function seen(sql: Query, actor: Member | null, r: LeaveRequest): Promise<Seen> {
  const approverId = r.memberId.startsWith("mbr_") ? (await staffRow(sql, r.memberId)).approverId : null;
  const person = { memberId: r.memberId, approverId };
  const sight = sightOf(actor, person);
  // A colleague sees on the calendar that someone is away, never the request.
  if (!actor || sight === null || sight === "team") throw new AppError("not_found");
  const decide = mayDecide(actor, person, r.memberId === actor.id ? await soleHr(actor) : false);
  return { ...r, sight, approverId, mayDecide: decide };
}

export async function request(sql: Query, actor: Member | null, requestId: unknown): Promise<Seen> {
  return seen(sql, actor, await row(sql, requestId));
}

export type Step = { kind: string; actor: string; reason: string; at: string };
export async function history(sql: Query, actor: Member | null, requestId: unknown): Promise<Step[]> {
  const r = await request(sql, actor, requestId);
  const rows = await sql<{ kind: string; actor: string; reason: string | null; at: Date }[]>`select kind, actor, reason, at from request_events where request_id = ${r.id} order by id`;
  return rows.map(s => ({ kind: s.kind, actor: s.actor, reason: s.reason ?? "", at: s.at.toISOString() }));
}

// decide: the approver (or HR) approves or refuses a pending request, with
// a reason if they wish.
export async function decide(sql: Sql, actor: Member | null, requestId: unknown, input: { verdict: unknown; reason?: unknown }): Promise<LeaveRequest> {
  if (input.verdict !== "approve" && input.verdict !== "refuse") throw new AppError("invalid");
  const reason = clean(input.reason ?? "", limits.reason, { multiline: true, optional: true });
  const r = await request(sql, actor, requestId);
  if (!r.mayDecide) throw new AppError(r.memberId === actor!.id ? "own_request" : "forbidden");
  const status: Status = input.verdict === "approve" ? "approved" : "refused";
  await sql.begin(async tx => {
    const done = await tx`update requests set status = ${status}, decided_by = ${actor!.id}, decided_at = now(), reason = ${reason || null} where id = ${r.id} and status = 'pending' returning id`;
    if (done.length === 0) throw new AppError("not_pending");
    await tx`insert into request_events (request_id, actor, kind, reason) values (${r.id}, ${actor!.id}, ${status}, ${reason || null})`;
    if (status === "approved") await take(tx, r.id, actor!.id);
  });
  return row(sql, r.id);
}

// reopen: the one who answered takes their answer back within ten minutes
// ("Undo"): the request waits again, the days taken come back.
export const undoMinutes = 10;
export async function reopen(sql: Sql, actor: Member | null, requestId: unknown): Promise<LeaveRequest> {
  const r = await request(sql, actor, requestId);
  const recent = r.decidedAt !== null && Date.now() - Date.parse(r.decidedAt) <= undoMinutes * 60000;
  if (!r.mayDecide || r.decidedBy !== actor!.id || !recent || (r.status !== "approved" && r.status !== "refused")) throw new AppError("not_pending");
  await sql.begin(async tx => {
    // Waiting again, it must not overlap a request made meanwhile (a
    // refusal taken back: the person may have asked other days since).
    await tx`select 1 from staff where member_id = ${r.memberId} for update`;
    const near = await tx<Row[]>`
      select ${columns(tx)} from requests
      where member_id = ${r.memberId} and id <> ${r.id} and status in ('pending', 'approved') and start_date <= ${r.end} and end_date >= ${r.start}`;
    if (near.map(toRequest).some(o => overlaps(o, r))) throw new AppError("overlap_someone");
    const done = await tx`update requests set status = 'pending', decided_by = null, decided_at = null, reason = null, cancel_asked_at = null where id = ${r.id} and status = ${r.status} returning id`;
    if (done.length === 0) throw new AppError("not_pending");
    await tx`insert into request_events (request_id, actor, kind) values (${r.id}, ${actor!.id}, 'reopened')`;
    await giveBack(tx, r.id, actor!.id);
  });
  return row(sql, r.id);
}

// cancel: the person takes back their own request. Pending, it is cancelled
// at once; approved, their approver is asked to confirm ("asked").
export async function cancel(sql: Sql, actor: Member | null, requestId: unknown): Promise<"cancelled" | "asked"> {
  const r = await request(sql, actor, requestId);
  if (r.sight !== "own") throw new AppError("forbidden");
  if (r.status === "pending") {
    await sql.begin(async tx => {
      const done = await tx`update requests set status = 'cancelled' where id = ${r.id} and status = 'pending' returning id`;
      if (done.length === 0) throw new AppError("not_pending");
      await tx`insert into request_events (request_id, actor, kind) values (${r.id}, ${actor!.id}, 'cancelled')`;
    });
    return "cancelled";
  }
  if (r.status !== "approved") throw new AppError("not_pending");
  if (!r.cancelAsked) {
    await sql.begin(async tx => {
      await tx`update requests set cancel_asked_at = now() where id = ${r.id} and status = 'approved'`;
      await tx`insert into request_events (request_id, actor, kind) values (${r.id}, ${actor!.id}, 'cancel_asked')`;
    });
  }
  return "asked";
}

// restore: "Undo" of a person's own cancel of a pending request, within ten
// minutes — unless the days were asked for again meanwhile.
export async function restore(sql: Sql, actor: Member | null, requestId: unknown): Promise<LeaveRequest> {
  const r = await request(sql, actor, requestId);
  if (r.sight !== "own" || r.status !== "cancelled" || r.decidedAt !== null) throw new AppError("not_pending");
  const [last] = await sql<{ kind: string; actor: string; at: Date }[]>`select kind, actor, at from request_events where request_id = ${r.id} order by id desc limit 1`;
  if (!last || last.kind !== "cancelled" || last.actor !== actor!.id || Date.now() - last.at.getTime() > undoMinutes * 60000) throw new AppError("not_pending");
  await sql.begin(async tx => {
    await tx`select 1 from staff where member_id = ${actor!.id} for update`;
    const near = await tx<Row[]>`
      select ${columns(tx)} from requests
      where member_id = ${actor!.id} and id <> ${r.id} and status in ('pending', 'approved') and start_date <= ${r.end} and end_date >= ${r.start}`;
    if (near.map(toRequest).some(o => overlaps(o, r))) throw new AppError("overlap");
    await tx`update requests set status = 'pending' where id = ${r.id}`;
    await tx`insert into request_events (request_id, actor, kind) values (${r.id}, ${actor!.id}, 'restored')`;
  });
  return row(sql, r.id);
}

// settleCancel: the approver (or HR) cancels an approved leave — confirming
// the person's ask, or on their own (a correction) — and the days come back;
// or declines the person's ask, and the leave stands.
export async function settleCancel(sql: Sql, actor: Member | null, requestId: unknown, input: { accept: unknown; reason?: unknown }): Promise<LeaveRequest> {
  if (typeof input.accept !== "boolean") throw new AppError("invalid");
  const reason = clean(input.reason ?? "", limits.reason, { multiline: true, optional: true });
  const r = await request(sql, actor, requestId);
  if (!r.mayDecide) throw new AppError(r.memberId === actor!.id ? "own_request" : "forbidden");
  if (r.status !== "approved" || (!input.accept && !r.cancelAsked)) throw new AppError("not_approved");
  await sql.begin(async tx => {
    const locked = await row(tx, r.id, true);
    if (locked.status !== "approved") throw new AppError("not_approved");
    if (input.accept) {
      await tx`update requests set status = 'cancelled', cancel_asked_at = null, reason = ${reason || null} where id = ${r.id}`;
      await tx`insert into request_events (request_id, actor, kind, reason) values (${r.id}, ${actor!.id}, 'cancelled', ${reason || null})`;
      await giveBack(tx, r.id, actor!.id);
    } else {
      await tx`update requests set cancel_asked_at = null where id = ${r.id}`;
      await tx`insert into request_events (request_id, actor, kind, reason) values (${r.id}, ${actor!.id}, 'cancel_declined', ${reason || null})`;
    }
  });
  return row(sql, r.id);
}

// mine: the actor's own requests, the latest first (a year and a bit back).
export async function mine(sql: Query, actor: Member | null): Promise<LeaveRequest[]> {
  if (!can(actor, "request")) throw new AppError("forbidden");
  const since = addDays(today(), -400);
  const rows = await sql<Row[]>`select ${columns(sql)} from requests where member_id = ${actor!.id} and end_date >= ${since} order by start_date desc, id desc limit 300`;
  return rows.map(toRequest);
}

// ofPerson: one person's requests, for HR or their approver.
export async function ofPerson(sql: Query, actor: Member | null, person: unknown): Promise<LeaveRequest[]> {
  const who = memberId(person);
  const sight = sightOf(actor, { memberId: who, approverId: (await staffRow(sql, who)).approverId });
  if (sight === null || sight === "team") throw new AppError("not_found");
  const since = addDays(today(), -800);
  const rows = await sql<Row[]>`select ${columns(sql)} from requests where member_id = ${who} and end_date >= ${since} order by start_date desc, id desc limit 500`;
  return rows.map(toRequest);
}

// waiting: what asks for the actor's answer — requests pending, and
// approved ones whose person asked to cancel. HR sees every one (those with
// no approver first: they are HR's); a manager, their people's.
export type Waiting = Seen & { mine: boolean };
export async function waiting(sql: Query, actor: Member | null): Promise<Waiting[]> {
  if (!can(actor, "approve")) throw new AppError("forbidden");
  const hr = roleOf(actor) === "hr";
  const rows = hr
    ? await sql<Row[]>`select ${columns(sql)} from requests where status = 'pending' or (status = 'approved' and cancel_asked_at is not null) order by start_date, id limit 1000`
    : await sql<Row[]>`
        select ${columns(sql)} from requests r
        where (r.status = 'pending' or (r.status = 'approved' and r.cancel_asked_at is not null))
          and r.member_id in (select member_id from staff where approver_id = ${actor!.id})
        order by r.start_date, r.id limit 1000`;
  const staff = await staffOf(sql, [...new Set(rows.map(r => r.member_id))]);
  const alone = hr ? await soleHr(actor!) : false;
  const found: Waiting[] = [];
  for (const r of rows.map(toRequest)) {
    const approverId = staff.get(r.memberId)?.approverId ?? null;
    const person = { memberId: r.memberId, approverId };
    if (!mayDecide(actor, person, alone)) continue;
    found.push({ ...r, sight: sightOf(actor, person)!, approverId, mayDecide: true, mine: approverId === actor!.id || (hr && approverId === null) });
  }
  return found;
}

// pendingOf: the requests of these people still waiting for an answer —
// what "balance after" counts. No rights here: callers show only what the
// actor may see.
export async function pendingOf(sql: Query, ids: string[]): Promise<{ id: string; memberId: string; typeId: string; start: Day; days: number }[]> {
  if (ids.length === 0) return [];
  const rows = await sql<{ id: string; member_id: string; type_id: string; start_date: string; days: string }[]>`
    select id, member_id, type_id, to_char(start_date, 'YYYY-MM-DD') as start_date, days from requests where status = 'pending' and member_id in ${sql(ids)} order by start_date, id`;
  return rows.map(r => ({ id: String(r.id), memberId: r.member_id, typeId: String(r.type_id), start: r.start_date, days: numeric(r.days) }));
}

// A calendar entry: who is away when; the kind of leave and its note only
// for those who may see them (the person, their approver, HR). A kind that
// is not an absence (remote work) is no secret: everyone sees it (away:
// false).
export type Entry = Span & { id: string; memberId: string; typeId: string | null; status: "pending" | "approved"; days: number | null; away: boolean };

export async function between(sql: Query, actor: Member | null, from: Day, to: Day): Promise<Entry[]> {
  if (!can(actor, "calendar")) throw new AppError("forbidden");
  const rows = await sql<(Row & { away: boolean })[]>`
    select ${columns(sql)}, (select away from leave_types t where t.id = r.type_id) as away from requests r
    where status in ('pending', 'approved') and member_id <> 'erased' and start_date <= ${to} and end_date >= ${from}
    order by start_date, id limit 5000`;
  const staff = await staffOf(sql, [...new Set(rows.map(r => r.member_id))]);
  return rows.map(r => ({ ...toRequest(r), away: r.away })).map(r => {
    const sight = sightOf(actor, { memberId: r.memberId, approverId: staff.get(r.memberId)?.approverId ?? null });
    const full = sight === "own" || sight === "approver";
    return {
      id: r.id, memberId: r.memberId, typeId: full || !r.away ? r.typeId : null, status: r.status as "pending" | "approved",
      start: r.start, startHalf: r.startHalf, end: r.end, endHalf: r.endHalf, days: full ? r.days : null, away: r.away,
    };
  });
}

// openRequests: every request waiting for an answer (optionally for more
// than some days), with its person's approver: for the tiles' badges and
// the morning reminder (lib/routing.ts says who answers).
export async function openRequests(sql: Query, options: { olderThanDays?: number } = {}): Promise<{ id: string; memberId: string; approverId: string | null; since: Date }[]> {
  const age = options.olderThanDays ?? 0;
  const rows = await sql<{ id: string; member_id: string; approver_id: string | null; since: Date }[]>`
    select r.id, r.member_id, s.approver_id, coalesce(r.cancel_asked_at, r.created_at) as since
    from requests r left join staff s on s.member_id = r.member_id
    where (r.status = 'pending' or (r.status = 'approved' and r.cancel_asked_at is not null))
      and coalesce(r.cancel_asked_at, r.created_at) <= now() - make_interval(days => ${age})
    order by r.id limit 5000`;
  return rows.map(r => ({ id: String(r.id), memberId: r.member_id, approverId: r.approver_id, since: r.since }));
}

// importLeave: approved leave brought from another tool (the second import,
// lib/import.ts planLeave) — each line counted with this company's rules
// and the person's week, recorded as approved by HR. counted: the balances
// imported already took these days off (the usual case with an export of
// balances as of today): a line gives them back at once, tied to the
// request, so that cancelling the leave later still returns its days.
// Lines that overlap leave already here, or cost nothing, are skipped and
// said.
export type ImportedLeave = { line: number; memberId: string; typeId: string; start: Day; startHalf: Half; end: Day; endHalf: Half };
export type LeaveImportResult = { done: LeaveRequest[]; skipped: { line: number; problem: "overlap" | "no_days" | "too_far" | "bad_dates" }[] };

export async function importLeave(sql: Sql, actor: Member | null, lines: ImportedLeave[], counted: boolean, reason: string): Promise<LeaveImportResult> {
  if (!can(actor, "people.all")) throw new AppError("forbidden");
  if (lines.length === 0) throw new AppError("import_empty");
  if (lines.length > limits.importRows) throw new AppError("import_invalid");
  const s = await settings(sql);
  const note = clean(reason, limits.reason, { optional: true });
  const w = window(today());
  const result: LeaveImportResult = { done: [], skipped: [] };
  const ids = await sql.begin(async tx => {
    const made: string[] = [];
    for (const l of lines) {
      const who = memberId(l.memberId);
      const type = await leaveType(tx, l.typeId);
      const span: Span = { start: day(l.start), startHalf: isHalf(l.startHalf) ? l.startHalf : "am", end: day(l.end), endHalf: isHalf(l.endHalf) ? l.endHalf : "pm" };
      if (!type.halfDays) Object.assign(span, { startHalf: "am", endHalf: "pm" });
      if (!spanValid(span)) { result.skipped.push({ line: l.line, problem: "bad_dates" }); continue; }
      if (span.start < w.earliest || span.end > w.latest || daysBetween(span.start, span.end) >= limits.spanDays) { result.skipped.push({ line: l.line, problem: "too_far" }); continue; }
      await tx`insert into staff (member_id) values (${who}) on conflict do nothing`;
      const person = await staffRow(tx, who);
      const days = cost(span, rulesFor(type, s, span.start, span.end, person.workDays));
      if (days <= 0) { result.skipped.push({ line: l.line, problem: "no_days" }); continue; }
      const near = await tx<Row[]>`
        select ${columns(tx)} from requests
        where member_id = ${who} and status in ('pending', 'approved') and start_date <= ${span.end} and end_date >= ${span.start}`;
      if (near.map(toRequest).some(r => overlaps(r, span))) { result.skipped.push({ line: l.line, problem: "overlap" }); continue; }
      const [created] = await tx<{ id: string }[]>`
        insert into requests (member_id, type_id, start_date, start_half, end_date, end_half, days, status, decided_by, decided_at)
        values (${who}, ${type.id}, ${span.start}, ${span.startHalf}, ${span.end}, ${span.endHalf}, ${days}, 'approved', ${actor!.id}, now())
        returning id`;
      const key = String(created!.id);
      await tx`insert into request_events (request_id, actor, kind, reason) values (${key}, ${actor!.id}, 'imported', ${note || null})`;
      if (type.balance) {
        await take(tx, key, actor!.id);
        if (counted) {
          await tx`
            insert into ledger (member_id, type_id, kind, days, on_date, reason, request_id, created_by)
            values (${who}, ${type.id}, 'adjustment', ${days}, ${span.start}, ${note || "import"}, ${key}, ${actor!.id})`;
        }
      }
      made.push(key);
    }
    return made;
  });
  for (const id of ids) result.done.push(await row(sql, id));
  return result;
}
