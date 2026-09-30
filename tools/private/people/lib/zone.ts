import * as chest from "@argentic/chest-sdk/chest";

// The Chest's time zone and today's day in it (Proposal (studio): the
// `chest` module, CHEST_TIMEZONE; Europe/Paris when not given). Server
// side only: pages hand the day to their views. The Chest's zone is for
// what concerns everyone: a checklist's due days, records, the register,
// anniversaries, the morning run.
export const zone = (): string => chest.timeZone();
export const today = (): string => chest.today();

// A member's own zone (Proposal (studio.16): member.timeZone, read through
// chest.timeZone(member), the Chest's when they have none): for what one
// person reads for themselves — "today" and "late" on their own to-dos,
// and the times shown to them.
export type Zoned = { timeZone?: string | undefined } | null | undefined;
export const zoneOf = (member: Zoned): string => chest.timeZone(member);
export const todayOf = (member: Zoned, at: Date | number = Date.now()): string => chest.today(at, zoneOf(member));
