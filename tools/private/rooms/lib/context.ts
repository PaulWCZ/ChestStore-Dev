import { roleOf } from "./access.ts";
import { db, type Sql } from "./db.ts";
import { addDays, day as readDay, daysBetween, nextWorkingDay, today } from "./model.ts";
import { chooseOffice, offices, type OfficeView } from "./places.ts";
import { viewer, type Viewer } from "./session.ts";
import { rules, type Rules } from "./settings.ts";
import { zone } from "./zone.ts";
import { flush } from "./calendar.ts";
import { applyUsual } from "./usual.ts";

// What every page of /chest starts from: who is looking (in their
// language), the Chest's time zone and today there, the rules, the
// offices and the one shown (?office=, else the member's, else the first).
export type Context = Viewer & { sql: Sql; zone: string; today: string; rules: Rules; offices: OfficeView[]; office: OfficeView | null };

export async function context(params: { office?: string | string[] | undefined }): Promise<Context | null> {
  const v = await viewer();
  if (!v || roleOf(v.member) === null) return null;
  const sql = db();
  const z = zone();
  await catchUp(sql, z);
  const [all, r] = await Promise.all([offices(sql, v.member, v.t.presets), rules(sql)]);
  const office = await chooseOffice(sql, v.member, all, typeof params.office === "string" ? params.office : null);
  return { ...v, sql, zone: z, today: today(z), rules: r, offices: all, office };
}

// What nothing runs in the background for, done when a page is read: the
// usual weeks said for the days that entered the booking window, and the
// calendars told of what changed (lib/usual.ts, lib/calendar.ts). Never
// in the way of the page: a failure is logged, the page renders.
async function catchUp(sql: Sql, z: string): Promise<void> {
  try {
    await applyUsual(sql, z);
    await flush(sql, z, 20);
  } catch (error) {
    console.error("catch-up failed", error instanceof Error ? error.name + ": " + error.message : "non-error thrown");
  }
}

// The day a page shows: ?day= when it is a real day within a year either
// side, else the next working day from today.
export function shownDay(value: string | string[] | undefined, c: Pick<Context, "today" | "rules">): string {
  if (typeof value === "string") {
    try {
      const d = readDay(value);
      if (Math.abs(daysBetween(c.today, d)) <= 366) return d;
    } catch {
      // not a day: the default
    }
  }
  return nextWorkingDay(c.today, c.rules.weekdays);
}

// The working days a member may book, from today: the strip of days.
export function bookableDays(c: Pick<Context, "today" | "rules">, max = 15): string[] {
  const days: string[] = [];
  for (let i = 0; i <= c.rules.daysAhead && days.length < max; i++) {
    const d = addDays(c.today, i);
    if (c.rules.weekdays.includes(new Date(d + "T00:00:00Z").getUTCDay() || 7)) days.push(d);
  }
  return days;
}

// Whether a day can be booked, and why not: over, the office closed, or
// beyond how far ahead one may book (opens: the day it opens). Admins are
// held to no window.
export type Lock = { why: "past" | "closed" | "notYet"; opens?: string } | null;
export function lockOf(c: Pick<Context, "today" | "rules">, d: string, exempt: boolean): Lock {
  if (d < c.today) return { why: "past" };
  if (!c.rules.weekdays.includes(new Date(d + "T00:00:00Z").getUTCDay() || 7)) return { why: "closed" };
  if (!exempt && daysBetween(c.today, d) > c.rules.daysAhead) return { why: "notYet", opens: addDays(d, -c.rules.daysAhead) };
  return null;
}

// The days a booking form offers: the working days one may book (admins:
// three months at least).
export function formDays(c: Pick<Context, "today" | "rules">, exempt: boolean): string[] {
  const ahead = exempt ? Math.max(c.rules.daysAhead, 92) : c.rules.daysAhead;
  const days: string[] = [];
  for (let i = 0; i <= ahead && days.length < 130; i++) {
    const d = addDays(c.today, i);
    if (c.rules.weekdays.includes(new Date(d + "T00:00:00Z").getUTCDay() || 7)) days.push(d);
  }
  return days;
}
