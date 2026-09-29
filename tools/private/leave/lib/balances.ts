import type { Member } from "@argentic/chest-sdk/member";
import { can, sightOf } from "./access.ts";
import { AppError } from "./app-error.ts";
import { addDays, addMonths, completedMonths, periodStart, round2, type Day } from "./calendar.ts";
import type { Query, Sql } from "./db.ts";
import { clean, decimalDays, day, limits, memberId, numeric, today } from "./model.ts";
import { leaveType, settings, types, type LeaveType, type Settings } from "./rules.ts";
import { staffOf, staffRow, type Staff } from "./staff.ts";
export { afterRequest, daysLeft, leftIfApproved } from "./left.ts";

// Balances, as a ledger: every change is a line (opening, adjustment,
// taken, returned), never changed. A person's balance of a type is their
// latest opening (one line, or two for paid leave: acquired and being
// earned), the lines written after it, and what they earned month by month
// since — from the opening's day, or their start date if later, to today or
// their last day — computed when read: nothing runs at night.
//
// Paid leave lives in reference periods (1 June to 31 May by default; art.
// L3141-10 and R3141-4 of the Code du travail, reports/02-open-source/leave.md):
// what is earned during a period ("being earned", CP N) is taken during the
// next one ("acquired", CP N-1). Days taken come out of the oldest days
// first; taking days still being earned is taking them early (by
// anticipation). When a period ends, what was "being earned" becomes
// "acquired" — computed from the dates, no job needed — and what was left of
// the acquired days is carried over or lost, as HR chose for the kind.

export type LineKind = "opening" | "adjustment" | "taken" | "returned";
export type Bucket = "acquired" | "earning";
// reasonKey: a line the tool wrote itself (an opening from a spreadsheet,
// the year's RTT, days given back after a last day), shown in the reader's
// language; reason: HR's own words.
export type ReasonKey = "opening" | "rttYear" | "afterLastDay";
export type Line = { id: string; typeId: string; kind: LineKind; days: number; onDate: Day; reason: string; reasonKey: ReasonKey | null; requestId: string | null; bucket: Bucket | null; createdBy: string; createdAt: string };

// A year of a kind of leave, as the pay slip shows it: what was credited
// (earned, set, given), what was used (taken), what is left.
export type Year = { start: Day; credited: number; used: number; left: number };
// The end of a year: its days left over were carried over or lost.
export type Close = { on: Day; days: number; lost: boolean; typeId: string };

export type Balance = {
  typeId: string;
  left: number; // what the person may still take (approved leave already deducted) — the one "days left" everywhere
  acquired: number; // paid leave: earned before this period, to take now (CP N-1, carried-over days included); other kinds: this year's days
  earning: number; // paid leave: being earned this period (CP N), less what was taken early
  carried: number; // of `acquired`, days from older years carried over
  deadline: Day | null; // the day the acquired days must be taken by, when the kind loses them
  earnedThisPeriod: number; // earned since the reference period began
  earnedTotal: number; // earned since the count started
  months: number; // months earned
  perMonth: number; // earned each month (0: nothing earned by itself)
  since: Day | null; // when the count started (null: not set up)
  sinceOpening: boolean; // the count starts at an opening balance (not at the start date)
  until: Day | null; // the person's last day: nothing is earned after it
  pending: number; // asked, not yet answered: not deducted yet
  booked: number; // with takenBy: approved leave after that day, not in `left`
  setUp: boolean; // an opening balance, a start date, or a line: HR set this person up
  years: { last: Year | null; current: Year }; // CP N-1 and CP N (paid leave), for the pay slip
  closes: Close[]; // the ends of years with days carried over or lost
};

export type Period = "running" | "acquired" | "yearly";
export type Kind = { id: string; perYear: number; period?: Period; periodMonth?: number | null; unused?: "carry" | "lose" };

type LineRow = { id: string; member_id: string; type_id: string; kind: LineKind; days: string; on_date: string; reason: string | null; reason_key: ReasonKey | null; request_id: string | null; bucket: Bucket | null; created_by: string; created_at: Date };
const toLine = (r: LineRow): Line => ({
  id: String(r.id), typeId: String(r.type_id), kind: r.kind, days: numeric(r.days), onDate: r.on_date, reason: r.reason ?? "", reasonKey: r.reason_key,
  requestId: r.request_id === null ? null : String(r.request_id), bucket: r.bucket, createdBy: r.created_by, createdAt: r.created_at.toISOString(),
});

type In = Pick<Line, "kind" | "days" | "onDate"> & Partial<Pick<Line, "bucket" | "requestId" | "createdAt">>;
const later = (a: Day, b: Day): Day => (a > b ? a : b);

// compute: one person's balance of one type, from their lines (in the
// order written), their start and last days and the rules. Pure.
// takenBy: for payroll's files, leave that starts after this day is not
// taken yet: it is counted apart ("booked"), not in the years.
// endOfDay: the balance at the end of `on` (payroll's files): a month
// whose last day it is counts as earned, as it does on a last day.
export function compute(type: Kind, lines: readonly In[], staff: Pick<Staff, "startDate"> & Partial<Pick<Staff, "endDate">>, s: Pick<Settings, "periodStartMonth">, on: Day, pending = 0, options: { takenBy?: Day; endOfDay?: boolean } = {}): Balance {
  const mode: Period = type.period ?? "running";
  const month = type.periodMonth ?? s.periodStartMonth;
  const lose = mode !== "running" && type.unused === "lose";
  const yearOf = (d: Day): Day => (mode === "running" ? "0000-01-01" : periodStart(d, month));
  const before = (p: Day): Day => (mode === "running" ? p : addMonths(p, -12));
  // Where days credited on a day go: paid leave set or given is acquired
  // (to take now) unless said "being earned"; other kinds, that year.
  const creditYear = (d: Day, bucket: Bucket | null | undefined): Day => (mode === "acquired" && bucket !== "earning" ? before(yearOf(d)) : yearOf(d));

  // The latest opening: its last line, and the line before it when both
  // were written together (acquired and being earned).
  const last = lines.findLastIndex(l => l.kind === "opening");
  let first = last;
  if (last > 0) {
    const a = lines[last - 1]!;
    const b = lines[last]!;
    if (a.kind === "opening" && a.onDate === b.onDate && a.createdAt === b.createdAt && (a.bucket ?? "acquired") !== (b.bucket ?? "acquired")) first = last - 1;
  }
  const opening = last >= 0 ? lines[last]!.onDate : null;

  const credit = new Map<Day, number>();
  const used = new Map<Day, number>();
  const add = (m: Map<Day, number>, y: Day, n: number) => m.set(y, round2((m.get(y) ?? 0) + n));
  if (last >= 0) for (const l of lines.slice(first, last + 1)) add(credit, creditYear(l.onDate, l.bucket), l.days);

  // Earned month by month, each month in the year it was worked in (one
  // completed on a year's first day was worked in the year before).
  const since = opening && staff.startDate ? later(staff.startDate, opening) : opening ?? staff.startDate;
  const until = staff.endDate ? addDays(staff.endDate, 1) : null;
  const reach = options.endOfDay ? addDays(on, 1) : on;
  const to = until && until < reach ? until : reach;
  const months = type.perYear > 0 && since ? completedMonths(since, to) : 0;
  const cur = yearOf(on);
  let earnedThisPeriod = 0;
  for (let i = 1; i <= months; i++) {
    const n = round2((i * type.perYear) / 12) - round2(((i - 1) * type.perYear) / 12);
    const y = yearOf(addDays(addMonths(since!, i), -1));
    add(credit, y, n);
    if (y === cur) earnedThisPeriod = round2(earnedThisPeriod + n);
  }

  // What came after the opening: days credited, and days used — a request's
  // lines (taken, given back) as one, on its first day.
  const debits: { on: Day; days: number; order: number }[] = [];
  const nets = new Map<string, { on: Day; days: number; order: number }>();
  lines.slice(last + 1).forEach((l, order) => {
    if (l.requestId) {
      const n = nets.get(l.requestId) ?? { on: l.onDate, days: 0, order };
      n.days = round2(n.days + l.days);
      nets.set(l.requestId, n);
    } else if (l.days < 0) debits.push({ on: l.onDate, days: -l.days, order });
    else add(credit, creditYear(l.onDate, l.bucket), l.days);
  });
  for (const n of nets.values()) {
    if (n.days < 0) debits.push({ on: n.on, days: -n.days, order: n.order });
    else if (n.days > 0) add(credit, creditYear(n.on, null), n.days);
  }
  // The oldest days first; a year whose days were lost is no longer there
  // to take from; what is missing is taken early from the day's own year.
  debits.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : a.order - b.order));
  let booked = 0;
  for (const d of debits) {
    if (options.takenBy && d.on > options.takenBy) {
      booked = round2(booked + d.days);
      continue;
    }
    const own = yearOf(d.on);
    const floor = lose ? (mode === "acquired" ? before(own) : own) : null;
    let need = d.days;
    for (const y of [...credit.keys()].sort()) {
      if (need <= 0 || y > own || (floor !== null && y < floor)) continue;
      const free = round2((credit.get(y) ?? 0) - (used.get(y) ?? 0));
      if (free <= 0) continue;
      const take = Math.min(free, need);
      add(used, y, take);
      need = round2(need - take);
    }
    if (need > 0) add(used, own, need);
  }

  // Today: this year, the year before, older years carried over or lost.
  const floorNow = lose ? (mode === "acquired" ? before(cur) : cur) : null;
  let acquired = 0, earning = 0, carried = 0;
  const closes: Close[] = [];
  const keys = [...new Set([...credit.keys(), ...used.keys()])].sort();
  const yearAt = (y: Day): Year => {
    const c = credit.get(y) ?? 0;
    const u = used.get(y) ?? 0;
    return { start: y, credited: round2(c), used: round2(u), left: round2(c - u) };
  };
  for (const y of keys) {
    const rest = yearAt(y).left;
    if (mode === "running") { acquired += rest; continue; }
    if (y > cur || (y === cur && mode === "acquired")) { earning += rest; continue; }
    if (y === cur) { acquired += rest; continue; }
    // A year that is over for taking its days: closed on its end.
    const over = mode === "acquired" ? y < before(cur) : true;
    if (!over) { acquired += rest; continue; }
    const closedOn = addMonths(y, mode === "acquired" ? 24 : 12);
    if (floorNow !== null && y < floorNow && rest > 0) {
      closes.push({ on: closedOn, days: rest, lost: true, typeId: type.id });
      continue;
    }
    acquired += rest;
    if (rest > 0) {
      carried += rest;
      closes.push({ on: closedOn, days: rest, lost: false, typeId: type.id });
    }
  }
  acquired = round2(acquired);
  earning = round2(earning);
  const periodEnd = addDays(addMonths(cur, 12), -1);
  return {
    typeId: type.id,
    left: round2(acquired + earning),
    acquired,
    earning,
    carried: round2(carried),
    deadline: lose ? periodEnd : null,
    earnedThisPeriod,
    earnedTotal: round2((months * type.perYear) / 12),
    months,
    perMonth: round2(type.perYear / 12),
    since,
    sinceOpening: since !== null && since === opening && opening !== staff.startDate,
    until: staff.endDate ?? null,
    pending: round2(pending),
    booked,
    setUp: since !== null || lines.length > 0,
    years: { last: mode === "acquired" ? yearAt(before(cur)) : null, current: yearAt(cur) },
    closes,
  };
}

// balancesOf: the balances of these people, for each type that has one.
// No rights here: callers check them (lib/balances' own readers below).
// on: a day before today gives the balances as they were then — lines
// written after it left out, leave after it not taken yet (payroll's
// "balances on" file); a day after today, as they will be if nothing
// changes (earned months added, approved leave up to it taken).
// endOfDay: at the end of that day (payroll's file).
export async function balancesOf(sql: Query, ids: string[], on = today(), options: { takenBy?: boolean; endOfDay?: boolean } = {}): Promise<Map<string, Balance[]>> {
  const found = new Map<string, Balance[]>(ids.map(i => [i, []]));
  if (ids.length === 0) return found;
  const [s, all, staff] = await Promise.all([settings(sql), types(sql), staffOf(sql, ids)]);
  const counted = all.filter(t => t.balance);
  if (counted.length === 0) return found;
  const past = on < today();
  const lines = await sql<LineRow[]>`
    select id, member_id, type_id, kind, days, to_char(on_date, 'YYYY-MM-DD') as on_date, reason, reason_key, request_id, bucket, created_by, created_at
    from ledger where member_id in ${sql(ids)} ${past ? sql`and created_at < ${addDays(on, 1)}::date` : sql``} order by id`;
  const pending = past ? [] : await sql<{ member_id: string; type_id: string; days: string }[]>`
    select member_id, type_id, sum(days) as days from requests where member_id in ${sql(ids)} and status = 'pending' group by member_id, type_id`;
  for (const who of ids) {
    const mine = lines.filter(l => l.member_id === who).map(toLine);
    found.set(who, counted.map(t => compute(t, mine.filter(l => l.typeId === t.id), staff.get(who)!, s, on, numeric(pending.find(p => p.member_id === who && String(p.type_id) === t.id)?.days), { ...(past || options.takenBy ? { takenBy: on } : {}), ...(options.endOfDay ? { endOfDay: true } : {}) })));
  }
  return found;
}

async function visible(sql: Query, actor: Member | null, person: unknown): Promise<string> {
  const who = memberId(person);
  const sight = sightOf(actor, { memberId: who, approverId: (await staffRow(sql, who)).approverId });
  if (sight === null || sight === "team") throw new AppError("not_found");
  return who;
}

// balances: a person's balances, for themselves, their approver or HR.
export async function balances(sql: Query, actor: Member | null, person: unknown): Promise<Balance[]> {
  const who = await visible(sql, actor, person);
  return (await balancesOf(sql, [who])).get(who)!;
}

// ledger: a person's lines, the latest first.
export async function ledger(sql: Query, actor: Member | null, person: unknown): Promise<Line[]> {
  const who = await visible(sql, actor, person);
  const rows = await sql<LineRow[]>`
    select id, member_id, type_id, kind, days, to_char(on_date, 'YYYY-MM-DD') as on_date, reason, reason_key, request_id, bucket, created_by, created_at
    from ledger where member_id = ${who} order by id desc limit 500`;
  return rows.map(toLine);
}

async function counted(sql: Query, typeId: unknown): Promise<LeaveType> {
  const t = await leaveType(sql, typeId);
  if (!t.balance || t.archived) throw new AppError("invalid");
  return t;
}

const bucketOf = (value: unknown): Bucket | null => {
  if (value === undefined || value === null || value === "") return null;
  if (value !== "acquired" && value !== "earning") throw new AppError("invalid");
  return value;
};

// adjust: HR adds or removes days, with a reason (a correction, days given
// for an event, sick-leave days earned while off). Paid leave added is
// acquired (to take now) unless said "being earned"; removed days come out
// of the oldest first.
export async function adjust(sql: Sql, actor: Member | null, input: { memberId: unknown; typeId: unknown; days: unknown; reason: unknown; bucket?: unknown }): Promise<void> {
  if (!can(actor, "people.all")) throw new AppError("forbidden");
  const who = memberId(input.memberId);
  const t = await counted(sql, input.typeId);
  const days = decimalDays(input.days, limits.adjustment, { signed: true });
  if (days === 0) throw new AppError("invalid");
  const reason = clean(input.reason, limits.reason);
  const bucket = t.period === "acquired" && days > 0 ? bucketOf(input.bucket) : null;
  await sql`insert into ledger (member_id, type_id, kind, days, on_date, reason, bucket, created_by) values (${who}, ${t.id}, 'adjustment', ${days}, ${today()}, ${reason}, ${bucket}, ${actor!.id})`;
}

// giveEveryone: the same adjustment for each of these people at once (RTT
// days for the year, a day off for everyone).
export async function giveEveryone(sql: Sql, actor: Member | null, input: { typeId: unknown; days: unknown; reason: unknown }, people: string[]): Promise<number> {
  if (!can(actor, "people.all")) throw new AppError("forbidden");
  const t = await counted(sql, input.typeId);
  const days = decimalDays(input.days, limits.adjustment, { signed: true });
  if (days === 0) throw new AppError("invalid");
  const reason = clean(input.reason, limits.reason);
  const ids = [...new Set(people)].filter(p => /^mbr_[a-z2-7]{26}$/u.test(p));
  if (ids.length === 0) throw new AppError("empty");
  await sql.begin(async tx => {
    for (const who of ids) await tx`insert into ledger (member_id, type_id, kind, days, on_date, reason, created_by) values (${who}, ${t.id}, 'adjustment', ${days}, ${today()}, ${reason}, ${actor!.id})`;
  });
  return ids.length;
}

// setOpening: HR states a balance as it is on a day ("12.5 days left on
// 1 October") — everything recorded before no longer counts, what is earned
// after is added. Paid leave: the days acquired (CP N-1, to take now) and,
// if given, the days being earned (CP N).
export async function setOpening(sql: Sql, actor: Member | null, input: { memberId: unknown; typeId: unknown; days: unknown; earning?: unknown; onDate?: unknown; reason?: unknown }): Promise<void> {
  if (!can(actor, "people.all")) throw new AppError("forbidden");
  const who = memberId(input.memberId);
  const t = await counted(sql, input.typeId);
  const days = decimalDays(input.days, limits.adjustment, { signed: true });
  const earning = t.period === "acquired" && input.earning !== undefined && input.earning !== "" ? decimalDays(input.earning, limits.adjustment, { signed: true }) : null;
  const on = input.onDate === undefined || input.onDate === "" ? today() : day(input.onDate);
  const reason = clean(input.reason ?? "", limits.reason, { optional: true });
  await sql.begin(async tx => {
    await tx`insert into ledger (member_id, type_id, kind, days, on_date, reason, bucket, created_by) values (${who}, ${t.id}, 'opening', ${days}, ${on}, ${reason || null}, ${earning === null ? null : "acquired"}, ${actor!.id})`;
    if (earning !== null) await tx`insert into ledger (member_id, type_id, kind, days, on_date, reason, bucket, created_by) values (${who}, ${t.id}, 'opening', ${earning}, ${on}, ${reason || null}, 'earning', ${actor!.id})`;
  });
}

// An opening of the import: a person's balance of a kind — paid leave
// possibly in two parts, acquired and being earned.
export type OpeningRow = { memberId: string; typeId: string; days: number | null; earning: number | null };

// openings: many opening balances at once (the import), in one transaction.
export async function openings(sql: Sql, actor: Member | null, rows: OpeningRow[], onDate: unknown, reason: string): Promise<number> {
  if (!can(actor, "people.all")) throw new AppError("forbidden");
  const on = day(onDate);
  if (rows.length === 0) throw new AppError("import_empty");
  const byType = new Map<string, LeaveType>();
  for (const r of rows) if (!byType.has(r.typeId)) byType.set(r.typeId, await counted(sql, r.typeId));
  const note = clean(reason, limits.reason, { optional: true });
  await sql.begin(async tx => {
    for (const r of rows) {
      const who = memberId(r.memberId);
      const split = byType.get(r.typeId)!.period === "acquired" && r.earning !== null;
      const days = decimalDays(r.days ?? 0, limits.adjustment, { signed: true });
      await tx`insert into ledger (member_id, type_id, kind, days, on_date, reason, bucket, created_by) values (${who}, ${r.typeId}, 'opening', ${days}, ${on}, ${note || null}, ${split ? "acquired" : null}, ${actor!.id})`;
      if (split) await tx`insert into ledger (member_id, type_id, kind, days, on_date, reason, bucket, created_by) values (${who}, ${r.typeId}, 'opening', ${decimalDays(r.earning, limits.adjustment, { signed: true })}, ${on}, ${note || null}, 'earning', ${actor!.id})`;
    }
  });
  return rows.length;
}
