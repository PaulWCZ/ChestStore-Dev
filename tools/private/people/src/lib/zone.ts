import { chest } from "@argentic/chest-sdk/chest";

// The Chest's time zone and today's day in it (chest.timeZone,
// chest.today(); the database's current_date is the same day: the Chest
// makes its zone the TimeZone of the tool's database sessions). Server
// side only: pages hand the day to their views. The Chest's zone is for
// what concerns everyone: a checklist's due days, records, the register,
// anniversaries, the morning run.
export const zone = (): string => chest.timeZone;
export const today = (): string => chest.today();

// A member's own zone (member.timeZone: where their browser is, SDK
// 0.7.0; the Chest's for someone without one, such as a test's): for the
// times shown to them on their own clock. Their "today" and "late" stay
// the company's (today()).
export type Zoned = { timeZone?: string | undefined } | null | undefined;
export const zoneOf = (member: Zoned): string => member?.timeZone ?? chest.timeZone;
