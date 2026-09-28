import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { int } from "./model.ts";

// The rules of the office (one row, set by an admin).
export type Rules = {
  daysAhead: number;
  maxDeskDays: number | null;
  repeatWeeks: number;
  dayStart: number;
  dayEnd: number;
  weekdays: number[];
  keepMonths: number;
};

type Row = { days_ahead: number; max_desk_days: number | null; repeat_weeks: number; day_start: number; day_end: number; weekdays: number[]; keep_months: number };

export async function rules(sql: Query): Promise<Rules> {
  const [r] = await sql<Row[]>`select days_ahead, max_desk_days, repeat_weeks, day_start, day_end, weekdays, keep_months from settings`;
  if (!r) return { daysAhead: 14, maxDeskDays: null, repeatWeeks: 12, dayStart: 420, dayEnd: 1200, weekdays: [1, 2, 3, 4, 5], keepMonths: 12 };
  return { daysAhead: r.days_ahead, maxDeskDays: r.max_desk_days, repeatWeeks: r.repeat_weeks, dayStart: r.day_start, dayEnd: r.day_end, weekdays: [...r.weekdays].sort(), keepMonths: r.keep_months };
}

export async function setRules(sql: Sql, actor: Member | null, input: Record<string, unknown>): Promise<Rules> {
  if (!can(actor, "rules.manage")) throw new AppError("forbidden");
  const current = await rules(sql);
  const next: Rules = {
    daysAhead: input["daysAhead"] === undefined ? current.daysAhead : int(input["daysAhead"], 1, 365),
    maxDeskDays: input["maxDeskDays"] === undefined ? current.maxDeskDays : input["maxDeskDays"] === null || input["maxDeskDays"] === "" ? null : int(input["maxDeskDays"], 1, 7),
    repeatWeeks: input["repeatWeeks"] === undefined ? current.repeatWeeks : int(input["repeatWeeks"], 1, 52),
    dayStart: input["dayStart"] === undefined ? current.dayStart : int(input["dayStart"], 0, 1380),
    dayEnd: input["dayEnd"] === undefined ? current.dayEnd : int(input["dayEnd"], 60, 1440),
    weekdays: current.weekdays,
    keepMonths: input["keepMonths"] === undefined ? current.keepMonths : int(input["keepMonths"], 1, 60),
  };
  if (input["weekdays"] !== undefined) {
    const days = input["weekdays"];
    if (!Array.isArray(days) || days.length === 0 || !days.every(d => Number.isInteger(d) && d >= 1 && d <= 7)) throw new AppError("invalid");
    next.weekdays = [...new Set(days as number[])].sort();
  }
  if (next.dayStart % 60 !== 0 || next.dayEnd % 60 !== 0 || next.dayEnd <= next.dayStart) throw new AppError("invalid");
  await sql`update settings set days_ahead = ${next.daysAhead}, max_desk_days = ${next.maxDeskDays}, repeat_weeks = ${next.repeatWeeks},
    day_start = ${next.dayStart}, day_end = ${next.dayEnd}, weekdays = ${next.weekdays}, keep_months = ${next.keepMonths}`;
  return next;
}

// What is older than the rules keep goes: past bookings and presence, and
// cancelled bookings a day after (their undo is long over). Nothing runs in
// the background: this runs when a page of the week is read.
export async function purge(sql: Sql, zone: string): Promise<void> {
  const { keepMonths } = await rules(sql);
  const cutoff = sql`((now() at time zone ${zone})::date - make_interval(months => ${keepMonths}))::date`;
  await sql`delete from presence where day < ${cutoff}`;
  await sql`delete from desk_bookings where day < ${cutoff} or cancelled_at < now() - interval '1 day'`;
  await sql`delete from room_bookings where day < ${cutoff} or cancelled_at < now() - interval '1 day'`;
}
