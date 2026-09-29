import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { today } from "./clock.ts";
import type { Query } from "./db.ts";
import { addDays, isDay } from "./days.ts";
import { bool, limits } from "./model.ts";
import { withdraw } from "./notify.ts";

// The tool's settings, one row: the locked period and the Friday reminder.
// (The currency of rates and amounts is the Chest's: lib/clock.ts.)
export type Settings = {
  lockedUntil: string | null;
  lockedBy: string | null;
  lockedAt: string | null;
  // The company's usual week: the Friday reminder's bar, and everyone's
  // capacity unless the People page gives theirs.
  reminder: { enabled: boolean; minutes: number };
  // Whether people submit their week and a manager approves it.
  approvals: boolean;
  // How reports write hours: 4:05 or 4.08.
  hoursStyle: HoursStyle;
};
export const hoursStyles = ["clock", "decimal"] as const;
export type HoursStyle = (typeof hoursStyles)[number];

type Row = { locked_until: string | null; locked_by: string | null; locked_at: Date | null; reminder_enabled: boolean; reminder_minutes: number; approvals: boolean; hours_style: string };

export async function settings(sql: Query): Promise<Settings> {
  const [r] = await sql<Row[]>`
    select to_char(locked_until, 'YYYY-MM-DD') as locked_until, locked_by, locked_at, reminder_enabled, reminder_minutes, approvals, hours_style
    from settings where id`;
  if (!r) return { lockedUntil: null, lockedBy: null, lockedAt: null, reminder: { enabled: true, minutes: 2100 }, approvals: true, hoursStyle: "clock" };
  return {
    lockedUntil: r.locked_until,
    lockedBy: r.locked_by,
    lockedAt: r.locked_at ? new Date(r.locked_at).toISOString() : null,
    reminder: { enabled: r.reminder_enabled, minutes: r.reminder_minutes },
    approvals: r.approvals,
    hoursStyle: r.hours_style === "decimal" ? "decimal" : "clock",
  };
}

// isLocked: whether that day is in the locked period.
export function isLocked(s: Pick<Settings, "lockedUntil">, day: string): boolean {
  return s.lockedUntil !== null && day <= s.lockedUntil;
}

// lock locks every day up to `until` (included), which must not be after
// today; null unlocks everything. A manager's act, remembered with who and
// when so that the pages can say why a day cannot change.
export async function lock(sql: Query, actor: Member | null, until: unknown): Promise<Settings> {
  if (!actor || !can(actor, "lock")) throw new AppError("forbidden");
  if (until !== null && !isDay(until)) throw new AppError("invalid");
  if (until !== null && (until > today() || until < "2000-01-01")) throw new AppError("future");
  if (until === null) await sql`update settings set locked_until = null, locked_by = null, locked_at = null where id`;
  else await sql`update settings set locked_until = ${until}, locked_by = ${actor.id}, locked_at = now() where id`;
  return settings(sql);
}

// The end of last month: what "Lock last month" proposes.
export function endOfLastMonth(day: string): string {
  return addDays(day.slice(0, 8) + "01", -1);
}

export async function saveReminder(sql: Query, actor: Member | null, input: { enabled: unknown; minutes: unknown }): Promise<Settings> {
  if (!actor || !can(actor, "settings")) throw new AppError("forbidden");
  const enabled = bool(input.enabled);
  const minutes = input.minutes;
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < limits.reminderMinMinutes || minutes > limits.reminderMaxMinutes) throw new AppError("invalid");
  await sql`update settings set reminder_enabled = ${enabled}, reminder_minutes = ${minutes} where id`;
  return settings(sql);
}

// The company's choices: weekly approval on or off, how hours are written.
// Turned off, the weeks waiting for a manager open again (approved ones stay
// approved).
export async function saveChoices(sql: Query, actor: Member | null, input: { approvals?: unknown; hoursStyle?: unknown }): Promise<Settings> {
  if (!actor || !can(actor, "settings")) throw new AppError("forbidden");
  if (input.approvals !== undefined) {
    const on = bool(input.approvals);
    await sql`update settings set approvals = ${on} where id`;
    if (!on) {
      const opened = await sql<{ member_id: string; week: string }[]>`delete from weeks where status = 'submitted' returning member_id, to_char(week, 'YYYY-MM-DD') as week`;
      for (const w of opened) await withdraw(`approve:${w.member_id}:${w.week}`);
    }
  }
  if (input.hoursStyle !== undefined) {
    if (!(hoursStyles as readonly unknown[]).includes(input.hoursStyle)) throw new AppError("invalid");
    await sql`update settings set hours_style = ${input.hoursStyle as HoursStyle} where id`;
  }
  return settings(sql);
}
