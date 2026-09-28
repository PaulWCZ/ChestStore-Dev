import * as chest from "@argentic/chest-sdk/chest";

// The Chest's time zone and today's day in it (Proposal (studio): the
// `chest` module, CHEST_TIMEZONE; Europe/Paris when not given). Server
// side only: pages hand the day to their views.
export const zone = (): string => chest.timeZone();
export const today = (): string => chest.today();
