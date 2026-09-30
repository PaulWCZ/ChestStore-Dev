import * as calendar from "@argentic/chest-sdk/calendar";
import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import { all, maxPages, pageSize } from "./audience.ts";
import { optionText } from "./dates.ts";
import type { Query, Sql } from "./db.ts";
import { toTell } from "./guests.ts";
import { catalogue, format } from "./i18n/index.ts";
import { load, type Poll } from "./polls.ts";
import { zoned } from "./time.ts";
import { chestZone } from "./zone.ts";

// The chosen date of a date poll in each person's Chest calendar (Proposal
// (studio): "calendar": true), as News does for its events: the Chest
// serves every member one calendar feed (Google, Outlook, Apple) that
// merges what each tool put. Everyone the poll asks has it, except those
// who said "No" to that date; it moves when the organiser changes the
// date, and leaves when the choice is taken back or the poll deleted. The
// Chest takes 1,000 members an event: a poll that asks more (Polls reads up
// to 10,000 people) puts the same date as several events of 1,000, keys
// poll:<id>, poll:<id>:2, poll:<id>:3…, in one `calendar.putMany` (Proposal
// (studio.15): checked whole, one write of the minute per 100 events), put
// again at every change; parts no longer needed are removed. On a Chest
// without the calendar, the poll keeps its "Add to my calendar" file.
//
// Guests (lib/guests.ts) have no Chest calendar: those who gave an email
// get the date by email (Proposal (studio): mail), with the link back to
// the poll's page, where the calendar file is.
export const eventKey = (pollId: string, part = 1) => (part === 1 ? `poll:${pollId}` : `poll:${pollId}:${part}`);
const perEvent = calendar.limits.members;
const maxParts = Math.ceil((maxPages * pageSize) / perEvent);

// removeParts removes the parts from `from` on: they were put one after the
// other from the first, so the first missing one ends them.
async function removeParts(pollId: string, from: number): Promise<void> {
  for (let part = from; part <= maxParts; part++) if (!(await calendar.remove(eventKey(pollId, part)))) return;
}

export type Learned = "on" | "off" | "unknown";

// What Polls learned of the Chest at its last try (the Chest has no
// question to ask beforehand): whether the date went to calendars.
export async function learned(sql: Query): Promise<Learned> {
  const [row] = await sql<{ calendar: string }[]>`select calendar from settings where id`;
  return row?.calendar === "on" || row?.calendar === "off" ? row.calendar : "unknown";
}

async function learn(sql: Query, value: "on" | "off"): Promise<void> {
  await sql`update settings set calendar = ${value} where id and calendar <> ${value}`;
}

// inCalendar: who has the chosen date in their calendar (members asked,
// less those who said no to it).
export async function inCalendar(sql: Query, poll: Poll): Promise<string[]> {
  const no = new Set((await sql<{ member: string }[]>`
    select p.member from answers a join participants p on p.id = a.participant_id
    where p.poll_id = ${poll.id} and a.option_id = ${poll.finalOption} and a.value = 0 and p.member <> 'guest'`).map(r => r.member));
  const audience = await all(poll);
  return audience.people.map(p => p.id).filter(id => !no.has(id));
}

export async function syncFinal(sql: Sql, pollId: string): Promise<void> {
  const poll = await load(sql, pollId);
  const option = poll.questions[0]?.options.find(o => o.id === poll.finalOption);
  try {
    if (poll.deleted || poll.kind !== "date" || poll.status !== "closed" || !option?.day) {
      await removeParts(poll.id, 1);
      return;
    }
    const members = await inCalendar(sql, poll);
    if (members.length === 0) {
      await removeParts(poll.id, 1);
      return;
    }
    const zone = chestZone();
    const when = option.start
      ? { start: zoned(option.day, option.start, zone), end: option.end ? zoned(option.day, option.end, zone) : new Date(zoned(option.day, option.start, zone).getTime() + 3_600_000) }
      : { days: { first: option.day, last: option.day } };
    const parts: string[][] = [];
    for (let i = 0; i < members.length && parts.length < maxParts; i += perEvent) parts.push(members.slice(i, i + perEvent));
    await calendar.putMany(parts.map((part, i) => ({
      key: eventKey(poll.id, i + 1),
      members: part,
      title: [...poll.title].slice(0, 120).join(""),
      ...(poll.details ? { description: [...poll.details].slice(0, 1000).join("") } : {}),
      ...when,
      path: `/chest/polls/${poll.id}`,
    })));
    await removeParts(poll.id, parts.length + 1);
    await learn(sql, "on");
  } catch (error) {
    if (error instanceof CapabilityNotGranted) return void (await learn(sql, "off"));
    // A date long past, or too far ahead for the calendar: the poll's own
    // file still works.
    if (error instanceof ChestError) return;
    throw error;
  }
}

// emailGuests: the guests who gave an email hear the chosen date, each in
// the language they answered in. One email per guest and choice (the key
// holds the time of the choice: a changed date is sent again; taken whole,
// the SDK hashes a long one). Guests are not members: no Chest email
// preference applies to them (the Chest applies `mailPreference` to members
// only), so `transactional` would change nothing and is not set — they gave
// their address on the poll's page for this one message.
export async function emailGuests(sql: Sql, pollId: string, origin: string | null): Promise<number> {
  const poll = await load(sql, pollId);
  const option = poll.questions[0]?.options.find(o => o.id === poll.finalOption);
  if (poll.deleted || !option?.day || !poll.finalAt) return 0;
  const [row] = await sql<{ guest_link: string | null }[]>`select guest_link from polls where id = ${poll.id}`;
  const link = origin && row?.guest_link ? `${origin}/p/${row.guest_link}` : null;
  let sent = 0;
  for (const guest of await toTell(sql, poll.id)) {
    const t = catalogue(guest.locale);
    const date = optionText({ day: option.day, start: option.start, end: option.end }, guest.locale, chestZone(), { range: t.dates.range, dayAndTime: t.dates.dayAndTime });
    try {
      await mail.send({
        to: guest.email,
        subject: format(t.guestMail.subject, { title: poll.title }),
        text: format(link ? t.guestMail.bodyLink : t.guestMail.body, { name: guest.name, title: poll.title, date, link: link ?? "" }),
        key: `final:${poll.id}:${guest.id}:${new Date(poll.finalAt).getTime()}`,
      });
      sent++;
    } catch (error) {
      // No email from this Chest (yet), the day's quota, an address that
      // bounced before: the page stays the truth.
      if (error instanceof ChestError && error.code !== "key_conflict") {
        if (error instanceof CapabilityNotGranted) return sent;
        continue;
      }
      throw error;
    }
  }
  return sent;
}

export const calendarPage = calendar.page;
