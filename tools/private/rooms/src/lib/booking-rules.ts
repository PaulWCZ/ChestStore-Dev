import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import type { Query } from "./db.ts";
import { daysBetween, minutesNow, today, weekday } from "../shared/model.ts";
import { rules, type Rules } from "./settings.ts";

// What every booking is held to, checked on the server in the same
// transaction as the booking itself. Admins are not held to the limits
// (how far ahead, desk days per week, weeks of repeat); nobody books a
// closed day or the past.
export type Moment = { zone: string; rules: Rules; today: string; now: number; exempt: boolean };

export async function moment(sql: Query, actor: Member, zone: string, at = new Date()): Promise<Moment> {
  return { zone, rules: await rules(sql), today: today(zone, at), now: minutesNow(zone, at), exempt: can(actor, "bookings.any") };
}

// span: the minutes of the day the booking covers; a room may start in the
// quarter hour under way, a desk's half day while it is not over.
export function checkWhen(m: Moment, d: string, span: { start: number; end: number }, kind: "desk" | "room"): void {
  if (d < m.today) throw new AppError("past");
  if (!m.rules.weekdays.includes(weekday(d))) throw new AppError("closed_day");
  if (d === m.today) {
    if (kind === "desk" && span.end <= m.now) throw new AppError("past");
    if (kind === "room" && span.start < Math.floor(m.now / 15) * 15) throw new AppError("past");
  }
  if (!m.exempt && daysBetween(m.today, d) > m.rules.daysAhead) throw new AppError("too_far", { max: m.rules.daysAhead });
}

// A booking PostgreSQL refused because the time was taken meanwhile (the
// exclusion constraints of the migration), as a code.
export function conflict(error: unknown): AppError | null {
  const e = error as { code?: unknown; constraint_name?: unknown } | null;
  if (!e || e.code !== "23P01") return null;
  return new AppError(e.constraint_name === "desk_already" ? "already_booked" : "taken");
}

// The instants of a day's minutes in the Chest's time zone, as PostgreSQL
// computes them (daylight saving included): tstzrange [start, end).
export function span(sql: Query, d: string, start: number, end: number, zone: string) {
  return sql`tstzrange((${d}::date + make_interval(mins => ${start}))::timestamp at time zone ${zone}, (${d}::date + make_interval(mins => ${end}))::timestamp at time zone ${zone}, '[)')`;
}
