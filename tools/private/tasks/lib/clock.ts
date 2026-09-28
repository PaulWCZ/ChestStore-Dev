import * as chest from "@argentic/chest-sdk/chest";
import { today } from "./model.ts";

// Today, as the company lives it: the day in the Chest's time zone
// (chest.timeZone(), Proposal (studio)), for "late", "due today" and the
// next date of a repeating card. Server only.
export const zone = (): string => chest.timeZone();
export const chestToday = (now: Date = new Date()): string => today(now, zone());
