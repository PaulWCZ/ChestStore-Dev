import * as calendar from "@argentic/chest-sdk/calendar";
import { chest } from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import { all, maxPages, pageSize } from "./audience.ts";
import { optionText } from "./dates.ts";
import type { Query, Sql } from "./db.ts";
import { toTell } from "./guests.ts";
import { catalogue, fill } from "../i18n/index.ts";
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
// (studio.15): one write of the minute per 100 events; one result per
// event since studio.16), put again at every change; parts no longer
// needed are removed, and the members of a part the Chest refused are
// remembered (polls.calendar_missing) so that their page does not promise
// the date in their calendar. On a Chest without the calendar, the poll
// keeps its "Add to my calendar" file.
//
// Guests (lib/guests.ts) have no Chest calendar: those who gave an email
// get the date by email (Proposal (studio): mail, to people outside the
// company only), with the link back to the poll's page, where the calendar
// file is.
export const eventKey = (pollId: string, part = 1) => (part === 1 ? `poll:${pollId}` : `poll:${pollId}:${part}`);
const perEvent = calendar.limits.members;
const maxParts = Math.ceil((maxPages * pageSize) / perEvent);

// removeParts removes the parts from `from` on: they were put one after the
// other from the first, so the first missing one ends them — unless a part
// was refused (`holes`), when every possible part is tried.
async function removeParts(pollId: string, from: number, holes = false): Promise<void> {
  for (let part = from; part <= maxParts; part++) if (!(await calendar.remove(eventKey(pollId, part))) && !holes) return;
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
  // A part refused at the last sync left a hole among the parts.
  const holes = (await notInCalendar(sql, poll.id)).size > 0;
  const none = async () => {
    await removeParts(poll.id, 1, holes);
    if (holes) await sql`update polls set calendar_missing = '{}' where id = ${poll.id}`;
  };
  try {
    if (poll.deleted || poll.kind !== "date" || poll.status !== "closed" || !option?.day) return void (await none());
    const members = await inCalendar(sql, poll);
    if (members.length === 0) return void (await none());
    const zone = chestZone();
    const when = option.start
      ? { start: zoned(option.day, option.start, zone), end: option.end ? zoned(option.day, option.end, zone) : new Date(zoned(option.day, option.start, zone).getTime() + 3_600_000) }
      : { days: { first: option.day, last: option.day } };
    const parts: string[][] = [];
    for (let i = 0; i < members.length && parts.length < maxParts; i += perEvent) parts.push(members.slice(i, i + perEvent));
    const results = await calendar.putMany(parts.map((part, i) => ({
      key: eventKey(poll.id, i + 1),
      members: part,
      title: [...poll.title].slice(0, 120).join(""),
      ...(poll.details ? { description: [...poll.details].slice(0, 1000).join("") } : {}),
      ...when,
      path: `/chest/polls/${poll.id}`,
    })));
    // The Chest answers each part (studio.16): a refused one is not in those
    // people's calendars — its earlier event (an older date) is taken out,
    // and the page does not tell them it is there.
    const missing: string[] = [];
    for (const r of results) {
      if (r.ok) continue;
      console.error(`calendar: ${eventKey(poll.id, r.index + 1)} not put (${r.reason})`);
      missing.push(...(parts[r.index] ?? []));
      await calendar.remove(eventKey(poll.id, r.index + 1));
    }
    await sql`update polls set calendar_missing = ${missing} where id = ${poll.id}`;
    await removeParts(poll.id, parts.length + 1, holes || missing.length > 0);
    await learn(sql, "on");
  } catch (error) {
    if (error instanceof CapabilityNotGranted) return void (await learn(sql, "off"));
    // The Chest not reached, or its minute's writes used: tried again at
    // the next change; the poll's own file still works.
    if (error instanceof ChestError) return;
    throw error;
  }
}

// notInCalendar: the members of the parts the Chest refused at the last
// sync (none when every part went).
export async function notInCalendar(sql: Query, pollId: string): Promise<Set<string>> {
  const [row] = await sql<{ calendar_missing: string[] }[]>`select calendar_missing from polls where id = ${pollId}`;
  return new Set(row?.calendar_missing ?? []);
}

// guestMailOffered: whether the guests' form offers to email the chosen
// date (Proposal (studio.16): mail.available(), asked without sending). A
// Chest that cannot send (mail not granted, the company's mail not
// connected, sending suspended) does not get the address at all; the day's
// quota used comes back tomorrow, before a date is chosen, so the field
// stays. A Chest that does not answer: unknown, not off — the field stays,
// and emailGuests says nothing when it cannot send.
export async function guestMailOffered(): Promise<boolean> {
  try {
    const state = await mail.available();
    return state.ok || state.reason === "quota";
  } catch (error) {
    if (error instanceof ChestError) return true;
    throw error;
  }
}

// emailGuests: the guests who gave an email hear the chosen date, each in
// the language they answered in. One email per guest and choice (the key
// holds the time of the choice: a changed date is sent again; and the
// guest's address; taken whole, the SDK hashes a long one). Guests are
// people outside the company who gave their address on the poll's page
// for this one message. It goes through the Chest's mail connector — the
// company's own mail provider (studio proposal, not built yet) — and
// replies go to the company's reply address (the connector's Reply-To):
// the email says so; the Chest never receives mail.
export async function emailGuests(sql: Sql, pollId: string, origin: string | null): Promise<number> {
  const poll = await load(sql, pollId);
  const option = poll.questions[0]?.options.find(o => o.id === poll.finalOption);
  if (poll.deleted || !option?.day || !poll.finalAt) return 0;
  const [row] = await sql<{ guest_link: string | null }[]>`select guest_link from polls where id = ${poll.id}`;
  const link = origin && row?.guest_link ? `${origin}/p/${row.guest_link}` : null;
  const company = organization();
  let sent = 0;
  for (const guest of await toTell(sql, poll.id)) {
    const t = catalogue(guest.locale);
    const date = optionText({ day: option.day, start: option.start, end: option.end }, guest.locale, chestZone(), { range: t.dates.range, dayAndTime: t.dates.dayAndTime });
    const replies = company ? fill(t.guestMail.replies, { company }) : t.guestMail.repliesPlain;
    try {
      await mail.send({
        to: guest.email,
        subject: fill(t.guestMail.subject, { title: poll.title }),
        text: fill(link ? t.guestMail.bodyLink : t.guestMail.body, { name: guest.name, title: poll.title, date, link: link ?? "", replies }),
        // The address in the key (SDK studio.16): after a restore, guest ids
        // may name other people than those the Chest remembers.
        key: `final:${poll.id}:${guest.id}:${new Date(poll.finalAt).getTime()}:${guest.email}`,
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

// The company's name, for the email's last line (none outside a Chest).
function organization(): string {
  try {
    return chest.organization.name;
  } catch {
    return "";
  }
}

// The member's calendar page, which the Chest's front serves on the team
// host (Proposal (studio): calendar; the SDK no longer names it).
export const calendarPage = "/_chest/calendar";
