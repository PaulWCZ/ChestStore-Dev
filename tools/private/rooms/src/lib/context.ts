import { log } from "@argentic/chest-app";
import type { Member } from "@argentic/chest-sdk/member";
import { roleOf } from "./access.ts";
import { flush } from "./calendar.ts";
import { db, type Sql } from "./db.ts";
import type { Catalogue, Locale } from "../i18n/index.ts";
import { localeOf } from "../i18n/index.ts";
import { addDays, day as readDay, daysBetween, nextWorkingDay, today } from "../shared/model.ts";
import { chooseOffice, offices, type OfficeView } from "./places.ts";
import { rules, type Rules } from "./settings.ts";
import { applyUsual } from "./usual.ts";
import { zone } from "./zone.ts";

// Who is looking, in their language: the member the Chest asserts (the
// package's page context: member(request), the only source of identity),
// and their words.
export type Viewer = { member: Member; locale: Locale; t: Catalogue };

// What every page of /chest starts from: who is looking (in their
// language), the Chest's time zone and today there, the rules, the
// offices and the one shown (?office=, else the member's, else the first).
// null for a member whose role gives nothing (the layout says why).
export type Context = Viewer & { sql: Sql; zone: string; today: string; rules: Rules; offices: OfficeView[]; office: OfficeView | null };

export async function context(p: { member: Member; locale: string; t: Catalogue }, office?: string | null): Promise<Context | null> {
  if (roleOf(p.member) === null) return null;
  const v: Viewer = { member: p.member, locale: localeOf(p.locale), t: p.t };
  const sql = db();
  const z = zone();
  await catchUp(sql, z);
  const [all, r] = await Promise.all([offices(sql, v.member, v.t.presets), rules(sql)]);
  const shown = await chooseOffice(sql, v.member, all, office ?? null);
  return { ...v, sql, zone: z, today: today(z), rules: r, offices: all, office: shown };
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
    log.error("catch-up failed", error);
  }
}

// The day a page shows: ?day= when it is a real day within a year either
// side, else the next working day from today.
export function shownDay(value: string | undefined, c: Pick<Context, "today" | "rules">): string {
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
