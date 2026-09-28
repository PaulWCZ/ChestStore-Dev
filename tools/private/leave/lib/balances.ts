import type { Member } from "@argentic/chest-sdk/member";
import { can, sightOf } from "./access.ts";
import { AppError } from "./app-error.ts";
import { earned, round2, type Day } from "./calendar.ts";
import type { Query, Sql } from "./db.ts";
import { clean, decimalDays, day, limits, memberId, numeric, today } from "./model.ts";
import { leaveType, settings, types, type LeaveType, type Settings } from "./rules.ts";
import { staffOf, staffRow, type Staff } from "./staff.ts";

// Balances, as a ledger: every change is a line (opening, adjustment,
// taken, returned), never changed. A person's balance of a type is their
// latest opening line (or zero), the lines written after it, and what they
// earned month by month since — from the opening's day, or their start
// date if later — computed when read: nothing runs at night.

export type LineKind = "opening" | "adjustment" | "taken" | "returned";
export type Line = { id: string; typeId: string; kind: LineKind; days: number; onDate: Day; reason: string; requestId: string | null; createdBy: string; createdAt: string };

export type Balance = {
  typeId: string;
  left: number; // what the person may still take (approved leave already deducted)
  earnedThisPeriod: number; // earned since the reference period began
  earnedTotal: number; // earned since the count started
  months: number; // months earned
  perMonth: number; // earned each month (0: nothing earned by itself)
  since: Day | null; // when the count started (null: not set up)
  pending: number; // asked, not yet answered: not deducted yet
  setUp: boolean; // an opening balance, a start date, or a line: HR set this person up
};

type LineRow = { id: string; member_id: string; type_id: string; kind: LineKind; days: string; on_date: string; reason: string | null; request_id: string | null; created_by: string; created_at: Date };
const toLine = (r: LineRow): Line => ({
  id: String(r.id), typeId: String(r.type_id), kind: r.kind, days: numeric(r.days), onDate: r.on_date, reason: r.reason ?? "",
  requestId: r.request_id === null ? null : String(r.request_id), createdBy: r.created_by, createdAt: r.created_at.toISOString(),
});

// compute: one person's balance of one type, from their lines (in the
// order written), their start date and the rules. Pure.
export function compute(type: Pick<LeaveType, "id" | "perYear">, lines: readonly Pick<Line, "kind" | "days" | "onDate">[], staff: Pick<Staff, "startDate">, s: Pick<Settings, "periodStartMonth">, on: Day, pending = 0): Balance {
  const lastOpening = lines.findLastIndex(l => l.kind === "opening");
  const counted = lastOpening >= 0 ? lines.slice(lastOpening) : lines;
  const opening = lastOpening >= 0 ? lines[lastOpening]!.onDate : null;
  const since = opening && staff.startDate ? (staff.startDate > opening ? staff.startDate : opening) : opening ?? staff.startDate;
  const e = type.perYear > 0 && since ? earned(since, on, type.perYear, s.periodStartMonth) : { total: 0, thisPeriod: 0, months: 0 };
  const sum = counted.reduce((a, l) => a + l.days, 0);
  return {
    typeId: type.id,
    left: round2(sum + e.total),
    earnedThisPeriod: e.thisPeriod,
    earnedTotal: e.total,
    months: e.months,
    perMonth: round2(type.perYear / 12),
    since,
    pending: round2(pending),
    setUp: since !== null || lines.length > 0,
  };
}

// balancesOf: the balances of these people, for each type that has one.
// No rights here: callers check them (lib/balances' own readers below).
export async function balancesOf(sql: Query, ids: string[], on = today()): Promise<Map<string, Balance[]>> {
  const found = new Map<string, Balance[]>(ids.map(i => [i, []]));
  if (ids.length === 0) return found;
  const [s, all, staff] = await Promise.all([settings(sql), types(sql), staffOf(sql, ids)]);
  const counted = all.filter(t => t.balance);
  if (counted.length === 0) return found;
  const lines = await sql<LineRow[]>`
    select id, member_id, type_id, kind, days, to_char(on_date, 'YYYY-MM-DD') as on_date, reason, request_id, created_by, created_at
    from ledger where member_id in ${sql(ids)} order by id`;
  const pending = await sql<{ member_id: string; type_id: string; days: string }[]>`
    select member_id, type_id, sum(days) as days from requests where member_id in ${sql(ids)} and status = 'pending' group by member_id, type_id`;
  for (const who of ids) {
    const mine = lines.filter(l => l.member_id === who).map(toLine);
    found.set(who, counted.map(t => compute(t, mine.filter(l => l.typeId === t.id), staff.get(who)!, s, on, numeric(pending.find(p => p.member_id === who && String(p.type_id) === t.id)?.days))));
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
    select id, member_id, type_id, kind, days, to_char(on_date, 'YYYY-MM-DD') as on_date, reason, request_id, created_by, created_at
    from ledger where member_id = ${who} order by id desc limit 500`;
  return rows.map(toLine);
}

async function counted(sql: Query, typeId: unknown): Promise<LeaveType> {
  const t = await leaveType(sql, typeId);
  if (!t.balance || t.archived) throw new AppError("invalid");
  return t;
}

// adjust: HR adds or removes days, with a reason (a correction, days given
// for an event, sick-leave days earned while off).
export async function adjust(sql: Sql, actor: Member | null, input: { memberId: unknown; typeId: unknown; days: unknown; reason: unknown }): Promise<void> {
  if (!can(actor, "people.all")) throw new AppError("forbidden");
  const who = memberId(input.memberId);
  const t = await counted(sql, input.typeId);
  const days = decimalDays(input.days, limits.adjustment, { signed: true });
  if (days === 0) throw new AppError("invalid");
  const reason = clean(input.reason, limits.reason);
  await sql`insert into ledger (member_id, type_id, kind, days, on_date, reason, created_by) values (${who}, ${t.id}, 'adjustment', ${days}, ${today()}, ${reason}, ${actor!.id})`;
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
// after is added.
export async function setOpening(sql: Sql, actor: Member | null, input: { memberId: unknown; typeId: unknown; days: unknown; onDate?: unknown; reason?: unknown }): Promise<void> {
  if (!can(actor, "people.all")) throw new AppError("forbidden");
  const who = memberId(input.memberId);
  const t = await counted(sql, input.typeId);
  const days = decimalDays(input.days, limits.adjustment, { signed: true });
  const on = input.onDate === undefined || input.onDate === "" ? today() : day(input.onDate);
  const reason = clean(input.reason ?? "", limits.reason, { optional: true });
  await sql`insert into ledger (member_id, type_id, kind, days, on_date, reason, created_by) values (${who}, ${t.id}, 'opening', ${days}, ${on}, ${reason || null}, ${actor!.id})`;
}

// openings: many opening balances at once (the import), in one transaction.
export async function openings(sql: Sql, actor: Member | null, rows: { memberId: string; typeId: string; days: number }[], onDate: unknown, reason: string): Promise<number> {
  if (!can(actor, "people.all")) throw new AppError("forbidden");
  const on = day(onDate);
  if (rows.length === 0) throw new AppError("import_empty");
  const byType = new Map<string, LeaveType>();
  for (const r of rows) if (!byType.has(r.typeId)) byType.set(r.typeId, await counted(sql, r.typeId));
  const note = clean(reason, limits.reason, { optional: true });
  await sql.begin(async tx => {
    for (const r of rows) {
      const who = memberId(r.memberId);
      const days = decimalDays(r.days, limits.adjustment, { signed: true });
      await tx`insert into ledger (member_id, type_id, kind, days, on_date, reason, created_by) values (${who}, ${r.typeId}, 'opening', ${days}, ${on}, ${note || null}, ${actor!.id})`;
    }
  });
  return rows.length;
}
