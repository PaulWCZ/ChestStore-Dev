import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { addDays, daysOffFor, isHolidayKey, type Counting, type Day, type HolidayKey, type Rules } from "./calendar.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./app-error.ts";
import { clean, colors, id, isColor, limits, decimalDays, numeric, type Color } from "./model.ts";
import type { Period } from "./balances.ts";

// The company's rules (how days are counted, which holidays, the reference
// period) and its leave types. HR changes them; everyone reads them.

export type Settings = { counting: "ouvres" | "ouvrables"; alsace: boolean; workedHolidays: HolidayKey[]; periodStartMonth: number; touched?: boolean };
export const builtIns = ["paid", "rtt", "unpaid", "sick", "other", "family", "remote"] as const;
export type BuiltIn = (typeof builtIns)[number];
export type LeaveType = {
  id: string;
  key: BuiltIn | null;
  name: string | null;
  color: Color;
  balance: boolean;
  perYear: number;
  halfDays: boolean;
  counting: TypeCounting;
  approval: boolean;
  notes: boolean;
  archived: boolean;
  period: Period; // how the kind lives through the year (lib/balances.ts)
  periodMonth: number | null; // the month its year starts; null: the company's
  unused: "carry" | "lose"; // days left when their year is over
  overdraw: boolean; // a request may ask for more than what is left
  away: boolean; // an absence (false: remote work, training)
  payrollCode: string | null; // the code payroll software imports it by (CP, RTT, MAL…)
};
export type TypeCounting = "company" | "worked" | "calendar";
export const typeCountings: readonly TypeCounting[] = ["company", "worked", "calendar"];
export const periods: readonly Period[] = ["running", "acquired", "yearly"];

// The family events of the Code du travail (art. L3142-4, as read on
// code.travail.gouv.fr on 2026-09-29, reports/02-open-source/leave.md): the
// days the law gives at least; a collective agreement may give more.
export const familyEvents = { wedding: 4, childWedding: 1, birth: 3, childDeath: 14, partnerDeath: 3, familyDeath: 3, childIllness: 5 } as const;
export type FamilyEvent = keyof typeof familyEvents;
export const isFamilyEvent = (value: unknown): value is FamilyEvent => typeof value === "string" && Object.hasOwn(familyEvents, value);

// The paid leave a year in each counting (art. L3141-3: 2.5 jours ouvrables
// a month, 30 a year; 25 in jours ouvrés).
export const yearlyPaidLeave = { ouvres: 25, ouvrables: 30 } as const;

type SettingsRow = { counting: "ouvres" | "ouvrables"; alsace: boolean; worked_holidays: string[]; period_start_month: number; touched: boolean };

export async function settings(sql: Query): Promise<Settings> {
  const [row] = await sql<SettingsRow[]>`select counting, alsace, worked_holidays, period_start_month, updated_at is not null as touched from settings`;
  if (!row) return { counting: "ouvres", alsace: false, workedHolidays: [], periodStartMonth: 6, touched: false };
  // touched: HR saved the rules once (the first-run checklist).
  return { counting: row.counting, alsace: row.alsace, workedHolidays: row.worked_holidays.filter(isHolidayKey), periodStartMonth: row.period_start_month, touched: row.touched };
}

type TypeRow = {
  id: string; key: BuiltIn | null; name: string | null; color: string; balance: boolean; per_year: string; half_days: boolean; counting: TypeCounting; approval: boolean; notes: boolean; archived_at: Date | null;
  period: Period; period_month: number | null; unused: "carry" | "lose"; overdraw: boolean; away: boolean; payroll_code: string | null;
};
const toType = (r: TypeRow): LeaveType => ({
  id: String(r.id), key: r.key, name: r.name, color: isColor(r.color) ? r.color : "sky", balance: r.balance, perYear: numeric(r.per_year), halfDays: r.half_days,
  counting: r.counting, approval: r.approval, notes: r.notes, archived: r.archived_at !== null,
  period: r.period, periodMonth: r.period_month, unused: r.unused, overdraw: r.overdraw, away: r.away, payrollCode: r.payroll_code,
});
const typeColumns = (sql: Query) => sql`id, key, name, color, balance, per_year, half_days, counting, approval, notes, archived_at, period, period_month, unused, overdraw, away, payroll_code`;

// types lists the leave types in their order; archived ones only when asked
// (a past request keeps its type).
export async function types(sql: Query, options: { archived?: boolean } = {}): Promise<LeaveType[]> {
  const rows = await sql<TypeRow[]>`
    select ${typeColumns(sql)} from leave_types
    ${options.archived ? sql`` : sql`where archived_at is null`} order by position, id`;
  return rows.map(toType);
}

export async function leaveType(sql: Query, typeId: unknown): Promise<LeaveType> {
  const [row] = await sql<TypeRow[]>`select ${typeColumns(sql)} from leave_types where id = ${id(typeId)}`;
  if (!row) throw new AppError("not_found");
  return toType(row);
}

// The public holidays the company does not work, between two days.
export function daysOff(s: Settings, from: Day, to: Day): Map<Day, HolidayKey> {
  return daysOffFor(s, from, to);
}

export function countingOf(type: Pick<LeaveType, "counting">, s: Pick<Settings, "counting">): Counting {
  return type.counting === "company" ? s.counting : type.counting;
}

// The rules a span of a kind of leave is counted with, for a person who
// works these days of the week (Monday to Friday when not given).
export function rulesFor(type: Pick<LeaveType, "counting">, s: Settings, from: Day, to: Day, workDays?: readonly number[] | null): Rules {
  // Two weeks more: paid leave runs to the day before the person is back.
  return { counting: countingOf(type, s), daysOff: daysOff(s, from, addDays(to, 14)), workDays: workDays ?? null };
}

// updateSettings: HR only. Switching the counting also switches paid
// leave's yearly amount when it was the other counting's default (25 ↔ 30);
// balances already recorded are not converted (the page says so).
export async function updateSettings(sql: Sql, actor: Member | null, input: { counting?: unknown; alsace?: unknown; workedHolidays?: unknown; periodStartMonth?: unknown }): Promise<Settings> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const current = await settings(sql);
  const counting = input.counting === undefined ? current.counting : input.counting === "ouvres" || input.counting === "ouvrables" ? input.counting : null;
  if (counting === null) throw new AppError("invalid");
  if (input.alsace !== undefined && typeof input.alsace !== "boolean") throw new AppError("invalid");
  const alsace = input.alsace === undefined ? current.alsace : input.alsace;
  let worked = current.workedHolidays;
  if (input.workedHolidays !== undefined) {
    if (!Array.isArray(input.workedHolidays) || !input.workedHolidays.every(isHolidayKey)) throw new AppError("invalid");
    worked = [...new Set(input.workedHolidays as HolidayKey[])];
  }
  const month = input.periodStartMonth === undefined ? current.periodStartMonth : input.periodStartMonth;
  if (typeof month !== "number" || !Number.isInteger(month) || month < 1 || month > 12) throw new AppError("invalid");
  await sql.begin(async tx => {
    await tx`update settings set counting = ${counting}, alsace = ${alsace}, worked_holidays = ${worked}, period_start_month = ${month}, updated_by = ${actor!.id}, updated_at = now()`;
    if (counting !== current.counting) {
      await tx`update leave_types set per_year = ${yearlyPaidLeave[counting]} where key = 'paid' and per_year = ${yearlyPaidLeave[current.counting]}`;
    }
  });
  return settings(sql);
}

export type TypeInput = {
  name?: unknown; color?: unknown; balance?: unknown; perYear?: unknown; halfDays?: unknown; counting?: unknown; approval?: unknown; notes?: unknown;
  period?: unknown; periodMonth?: unknown; unused?: unknown; overdraw?: unknown; away?: unknown; payrollCode?: unknown;
};

// A payroll code: letters, digits, "_", "." or "-", 12 at most; empty: none.
export const payrollCodePattern = /^[A-Za-z0-9_.-]{1,12}$/u;
function payrollCode(value: unknown, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== "string") throw new AppError("invalid");
  const code = value.trim().toUpperCase();
  if (code === "") return null;
  if (!payrollCodePattern.test(code)) throw new AppError("bad_code");
  return code;
}

const flag = (value: unknown, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new AppError("invalid");
  return value;
};

function oneOf<T extends string>(value: unknown, list: readonly T[], fallback: T): T {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !(list as readonly string[]).includes(value)) throw new AppError("invalid");
  return value as T;
}

// saveType adds a type (no id) or changes one — only what the input names.
// A built-in type keeps its key; an empty name gives it back its name in
// each language. A kind without a balance has no year.
export async function saveType(sql: Sql, actor: Member | null, typeId: unknown, input: TypeInput): Promise<LeaveType> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const current = typeId === null || typeId === undefined ? null : await leaveType(sql, typeId);
  const name = clean(input.name ?? current?.name ?? "", limits.typeName, { optional: current !== null && current.key !== null });
  const color = input.color === undefined ? current?.color ?? colors[0] : isColor(input.color) ? input.color : null;
  if (color === null) throw new AppError("invalid");
  const balance = flag(input.balance, current?.balance ?? false);
  const perYear = balance ? (input.perYear === undefined ? current?.perYear ?? 0 : decimalDays(input.perYear, limits.perYear)) : 0;
  const halfDays = flag(input.halfDays, current?.halfDays ?? true);
  const counting = oneOf(input.counting, typeCountings, current?.counting ?? "company");
  const approval = flag(input.approval, current?.approval ?? true);
  const notes = flag(input.notes, current?.notes ?? true);
  const period = balance ? oneOf(input.period, periods, current?.period ?? "running") : "running";
  let periodMonth = current?.periodMonth ?? null;
  if (input.periodMonth !== undefined) {
    if (input.periodMonth !== null && (typeof input.periodMonth !== "number" || !Number.isInteger(input.periodMonth) || input.periodMonth < 1 || input.periodMonth > 12)) throw new AppError("invalid");
    periodMonth = input.periodMonth;
  }
  const unused = oneOf(input.unused, ["carry", "lose"] as const, current?.unused ?? "carry");
  const overdraw = flag(input.overdraw, current?.overdraw ?? true);
  const away = flag(input.away, current?.away ?? true);
  const code = payrollCode(input.payrollCode, current?.payrollCode ?? null);
  if (current) {
    await sql`
      update leave_types set name = ${name || null}, color = ${color}, balance = ${balance}, per_year = ${perYear}, half_days = ${halfDays}, counting = ${counting},
        approval = ${approval}, notes = ${notes}, period = ${period}, period_month = ${periodMonth}, unused = ${unused}, overdraw = ${overdraw}, away = ${away}, payroll_code = ${code}
      where id = ${current.id}`;
    return leaveType(sql, current.id);
  }
  const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`select count(*)::int as n from leave_types where archived_at is null`;
  if (n >= limits.types) throw new AppError("too_many", { max: limits.types });
  const [row] = await sql<{ id: string }[]>`
    insert into leave_types (name, color, balance, per_year, half_days, counting, approval, notes, period, period_month, unused, overdraw, away, payroll_code, position)
    values (${name}, ${color}, ${balance}, ${perYear}, ${halfDays}, ${counting}, ${approval}, ${notes}, ${period}, ${periodMonth}, ${unused}, ${overdraw}, ${away}, ${code},
      (select coalesce(max(position), 0) + 1 from leave_types))
    returning id`;
  return leaveType(sql, row!.id);
}

// archiveType hides a type from new requests (its past ones keep it); one
// type at least stays.
export async function archiveType(sql: Sql, actor: Member | null, typeId: unknown, archived: boolean): Promise<void> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const t = await leaveType(sql, typeId);
  if (archived && !t.archived) {
    const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`select count(*)::int as n from leave_types where archived_at is null`;
    if (n <= 1) throw new AppError("last_type");
  }
  await sql`update leave_types set archived_at = ${archived ? sql`now()` : null} where id = ${t.id}`;
}
