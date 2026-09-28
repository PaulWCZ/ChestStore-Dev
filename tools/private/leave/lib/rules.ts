import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { addDays, daysOffFor, isHolidayKey, type Counting, type Day, type HolidayKey, type Rules } from "./calendar.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./app-error.ts";
import { clean, colors, id, isColor, limits, decimalDays, numeric, type Color } from "./model.ts";

// The company's rules (how days are counted, which holidays, the reference
// period) and its leave types. HR changes them; everyone reads them.

export type Settings = { counting: "ouvres" | "ouvrables"; alsace: boolean; workedHolidays: HolidayKey[]; periodStartMonth: number };
export const builtIns = ["paid", "rtt", "unpaid", "sick", "other"] as const;
export type BuiltIn = (typeof builtIns)[number];
export type LeaveType = {
  id: string;
  key: BuiltIn | null;
  name: string | null;
  color: Color;
  balance: boolean;
  perYear: number;
  halfDays: boolean;
  counting: "company" | "calendar";
  approval: boolean;
  notes: boolean;
  archived: boolean;
};

// The paid leave a year in each counting (art. L3141-3: 2.5 jours ouvrables
// a month, 30 a year; 25 in jours ouvrés).
export const yearlyPaidLeave = { ouvres: 25, ouvrables: 30 } as const;

type SettingsRow = { counting: "ouvres" | "ouvrables"; alsace: boolean; worked_holidays: string[]; period_start_month: number };

export async function settings(sql: Query): Promise<Settings> {
  const [row] = await sql<SettingsRow[]>`select counting, alsace, worked_holidays, period_start_month from settings`;
  if (!row) return { counting: "ouvres", alsace: false, workedHolidays: [], periodStartMonth: 6 };
  return { counting: row.counting, alsace: row.alsace, workedHolidays: row.worked_holidays.filter(isHolidayKey), periodStartMonth: row.period_start_month };
}

type TypeRow = { id: string; key: BuiltIn | null; name: string | null; color: string; balance: boolean; per_year: string; half_days: boolean; counting: "company" | "calendar"; approval: boolean; notes: boolean; archived_at: Date | null };
const toType = (r: TypeRow): LeaveType => ({
  id: String(r.id), key: r.key, name: r.name, color: isColor(r.color) ? r.color : "sky", balance: r.balance, perYear: numeric(r.per_year), halfDays: r.half_days,
  counting: r.counting, approval: r.approval, notes: r.notes, archived: r.archived_at !== null,
});

// types lists the leave types in their order; archived ones only when asked
// (a past request keeps its type).
export async function types(sql: Query, options: { archived?: boolean } = {}): Promise<LeaveType[]> {
  const rows = await sql<TypeRow[]>`
    select id, key, name, color, balance, per_year, half_days, counting, approval, notes, archived_at from leave_types
    ${options.archived ? sql`` : sql`where archived_at is null`} order by position, id`;
  return rows.map(toType);
}

export async function leaveType(sql: Query, typeId: unknown): Promise<LeaveType> {
  const [row] = await sql<TypeRow[]>`select id, key, name, color, balance, per_year, half_days, counting, approval, notes, archived_at from leave_types where id = ${id(typeId)}`;
  if (!row) throw new AppError("not_found");
  return toType(row);
}

// The public holidays the company does not work, between two days.
export function daysOff(s: Settings, from: Day, to: Day): Map<Day, HolidayKey> {
  return daysOffFor(s, from, to);
}

export function countingOf(type: Pick<LeaveType, "counting">, s: Settings): Counting {
  return type.counting === "calendar" ? "calendar" : s.counting;
}

export function rulesFor(type: Pick<LeaveType, "counting">, s: Settings, from: Day, to: Day): Rules {
  // Two weeks more: the jours-ouvrables rule looks past the end.
  return { counting: countingOf(type, s), daysOff: daysOff(s, from, addDays(to, 14)) };
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

export type TypeInput = { name?: unknown; color?: unknown; balance?: unknown; perYear?: unknown; halfDays?: unknown; counting?: unknown; approval?: unknown; notes?: unknown };

const flag = (value: unknown, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new AppError("invalid");
  return value;
};

// saveType adds a type (no id) or changes one. A built-in type keeps its
// key; an empty name gives it back its name in each language.
export async function saveType(sql: Sql, actor: Member | null, typeId: unknown, input: TypeInput): Promise<LeaveType> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const current = typeId === null || typeId === undefined ? null : await leaveType(sql, typeId);
  const name = clean(input.name ?? current?.name ?? "", limits.typeName, { optional: current !== null && current.key !== null });
  const color = input.color === undefined ? current?.color ?? colors[0] : isColor(input.color) ? input.color : null;
  if (color === null) throw new AppError("invalid");
  const balance = flag(input.balance, current?.balance ?? false);
  const perYear = balance ? (input.perYear === undefined ? current?.perYear ?? 0 : decimalDays(input.perYear, limits.perYear)) : 0;
  const halfDays = flag(input.halfDays, current?.halfDays ?? true);
  const counting = input.counting === undefined ? current?.counting ?? "company" : input.counting === "company" || input.counting === "calendar" ? input.counting : null;
  if (counting === null) throw new AppError("invalid");
  const approval = flag(input.approval, current?.approval ?? true);
  const notes = flag(input.notes, current?.notes ?? true);
  if (current) {
    await sql`update leave_types set name = ${name || null}, color = ${color}, balance = ${balance}, per_year = ${perYear}, half_days = ${halfDays}, counting = ${counting}, approval = ${approval}, notes = ${notes} where id = ${current.id}`;
    return leaveType(sql, current.id);
  }
  const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`select count(*)::int as n from leave_types where archived_at is null`;
  if (n >= limits.types) throw new AppError("too_many", { max: limits.types });
  const [row] = await sql<{ id: string }[]>`
    insert into leave_types (name, color, balance, per_year, half_days, counting, approval, notes, position)
    values (${name}, ${color}, ${balance}, ${perYear}, ${halfDays}, ${counting}, ${approval}, ${notes}, (select coalesce(max(position), 0) + 1 from leave_types))
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
