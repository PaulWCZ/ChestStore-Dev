import * as calendar from "@argentic/chest-sdk/calendar";
import { ChestError } from "@argentic/chest-sdk/errors";
import { meetingPlace, rememberCalendar, titlesOf, type Booking } from "./booking.ts";
import type { Query } from "./db.ts";
import { catalogue, format, locales } from "./i18n/index.ts";

// Each booking in its host's Chest calendar (Proposal (studio): the
// calendar bridge, chest.proposals.json "calendar"): the Chest merges
// every tool's events into one private feed per member, which the host
// adds once to Google, Outlook or Apple Calendar. Put when booked or moved
// (the same key replaces it, on the new host's calendar for a team type),
// removed when cancelled or erased. A Chest without the bridge refuses:
// the booking stands, the host's own feed (Settings) still works, and the
// pages say so.
const key = (b: Pick<Booking, "id">) => `booking:${b.id}`;

// Titles in every language of the store: the Chest writes each member's
// feed in theirs — the type's name in theirs too (booking.titlesOf).
function words(b: Booking, names: Record<string, string>): { title: Record<string, string>; location: string } {
  const title = Object.fromEntries(locales.map(l => [l, format(catalogue(l).calendar.title, { title: names[l] ?? b.title, guest: b.guestName }).slice(0, 120)]));
  const where = b.locationKind === "phone" ? b.guestPhone : meetingPlace(b);
  return { title, location: where.slice(0, 200) };
}

export async function publish(sql: Query, b: Booking): Promise<void> {
  if (b.status !== "confirmed" || b.memberId === "erased") return unpublish(sql, b);
  try {
    const { title, location } = words(b, await titlesOf(sql, b));
    await calendar.put({ key: key(b), members: [b.memberId], title, start: b.startsAt, end: b.endsAt, ...(location ? { location } : {}), path: `/chest/bookings/${b.id}` });
    await rememberCalendar(sql, true);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    // A booking far in the past (an import) or ahead is refused alone.
    if (error.code !== "invalid_event") await rememberCalendar(sql, false);
  }
}

export async function unpublish(sql: Query, b: Pick<Booking, "id">): Promise<void> {
  try {
    await calendar.remove(key(b));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    await rememberCalendar(sql, false);
  }
}
