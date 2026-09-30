import { chest } from "@argentic/chest-sdk/chest";

// The Chest's time zone and today's day in it (chest.timeZone,
// chest.today(); the database's current_date is the same day: the Chest
// makes its zone the TimeZone of the tool's database sessions). Server
// side only: pages hand the day to their views. The Chest's zone is for
// what concerns everyone: a checklist's due days, records, the register,
// anniversaries, the morning run.
export const zone = (): string => chest.timeZone;
export const today = (): string => chest.today();

// A member's own zone (member.timeZone, always given by the Chest; the
// Chest's for someone without one, such as a test's): for what one person
// reads for themselves — "today" and "late" on their own to-dos, and the
// times shown to them.
export type Zoned = { timeZone?: string | undefined } | null | undefined;
export const zoneOf = (member: Zoned): string => member?.timeZone ?? chest.timeZone;
export const todayOf = (member: Zoned, at: Date | number = Date.now()): string => chest.todayIn(zoneOf(member), at);
