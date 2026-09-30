import { teamUrl } from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import type { Member } from "@argentic/chest-sdk/member";
import { icsFile, roomEvents } from "./calendar.ts";
import type { Sql } from "./db.ts";
import { catalogue, format, formatDate, type Locale } from "./i18n/index.ts";
import { people } from "./people.ts";

// Guests of a room booking told by email (Proposal (studio): "mail":
// {"send": true}), as a calendar invitation would: in their own language,
// with the booking as an .ics file to add to any calendar. The Chest knows
// their address ({member}); Rooms never does. On a Chest that cannot send
// email yet, the bell and the calendar feed still tell them; the tool
// remembers it (settings.mail = 'off', asked again an hour later), and the
// booking form asks the Chest before promising an email (told(), below).
//
// Once per booking and version: the key (the booking, its revision and the
// guest) makes a retry send nothing twice. It is passed whole, however long:
// the SDK sends one past the Chest's 64 characters as its SHA-256 (studio.15).
// One guest the Chest refuses never costs the others their email: the
// refusal is logged (its code, never who) and the next guest is tried.

export type Mailed = "invited" | "changed" | "cancelled";

export async function mailGuests(sql: Sql, actor: Member | null, kind: Mailed, bookingIds: readonly string[], guests: readonly string[], zone: string): Promise<void> {
  const to = [...new Set(guests)].filter(g => g.startsWith("mbr_") && g !== actor?.id);
  if (to.length === 0 || bookingIds.length === 0) return;
  const [s] = await sql<{ mail: string; waiting: boolean }[]>`select mail, (mail = 'off' and mail_tried > now() - interval '1 hour') as waiting from settings`;
  if (!s || s.waiting) return;
  const events = await roomEvents(sql, bookingIds);
  const first = events[0];
  if (!first || !("start" in first)) return;
  const who = await people(to);
  const origin = teamUrl();
  const domain = origin ? new URL(origin).hostname : "rooms.invalid";
  let sent = false;
  for (const guest of to) {
    const person = who.get(guest);
    if (!person || person.status !== "member") continue;
    const locale = person.locale;
    const t = catalogue(locale);
    const title = first.title[locale] ?? first.title.en ?? "";
    const when = whenOf(first.start, first.end, locale, zone) + (events.length > 1 ? " " + format(t.mail.weekly, { count: events.length }) : "");
    const lines = [
      format(t.mail[kind].body, { name: actor?.name ?? t.meta.name, title }),
      "",
      title,
      first.location ?? "",
      when,
      ...(origin && kind !== "cancelled" ? ["", format(t.mail.open, { url: origin + first.path })] : []),
      "",
      kind === "cancelled" ? t.mail.icsCancel : t.mail.ics,
    ];
    try {
      await mail.send({
        to: { member: guest },
        subject: format(t.mail[kind].subject, { title, when: whenOf(first.start, first.end, locale, zone) }),
        text: lines.join("\n"),
        attachments: [{ name: t.mail.file + ".ics", type: "text/calendar", content: icsFile(kind === "cancelled" ? events.map(e => ({ ...e, cancelled: true })) : events, locale, { domain, origin, method: kind === "cancelled" ? "CANCEL" : "PUBLISH" }) }],
        key: `${first.key}:${first.sequence}:${guest}`,
      });
      sent = true;
    } catch (error) {
      if (error instanceof CapabilityNotGranted) return void (await sql`update settings set mail = 'off', mail_tried = now()`);
      if (!(error instanceof ChestError)) throw error;
      // An address that bounced before: the next guest, silently. Anything
      // else the Chest refused for this guest is logged without personal
      // data; the bell and the calendar still tell them, and the others
      // still get theirs.
      if (error.code === "suppressed" || error.code === "invalid_address") continue;
      console.error(`rooms: a guest's email about booking ${first.key} was not sent (${error.code})`);
    }
  }
  if (sent && s.mail !== "on") await sql`update settings set mail = 'on', mail_tried = now()`;
}

const whenOf = (start: Date, end: Date, locale: Locale, zone: string) =>
  formatDate(start, locale, zone, { weekday: "long", day: "numeric", month: "long" }) + ", " +
  formatDate(start, locale, zone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) + "–" +
  formatDate(end, locale, zone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// How the people of a booking hear of it, as far as this Chest can tell.
// Email is promised only when the Chest says it sends now
// (mail.available, studio.16: granted, connected, not paused, the day's
// emails not spent); when the Chest does not answer, what the last email
// taught the tool (settings.mail).
export async function told(sql: Sql): Promise<{ told: "bell" | "calendar" | "mail"; calendarOn: boolean }> {
  const [s] = await sql<{ calendar: string; mail: string }[]>`select calendar, mail from settings`;
  const calendarOn = s?.calendar === "on";
  let mailOn = s?.mail === "on";
  try {
    mailOn = (await mail.available()).ok;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return { told: mailOn ? "mail" : calendarOn ? "calendar" : "bell", calendarOn };
}
