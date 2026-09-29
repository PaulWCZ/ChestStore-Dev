import * as chest from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, ChestError, QuotaExceeded, RateLimited, Unavailable } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import type { Locale, Member } from "@argentic/chest-sdk/member";
import * as notifications from "@argentic/chest-sdk/notifications";
import { roles } from "./access.ts";
import { maxPages, page, type Person } from "./audience.ts";
import { dates, optionText } from "./dates.ts";
import type { Sql } from "./db.ts";
import { catalogue, format, locales, type Catalogue } from "./i18n/index.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";
import { people as lookup, nameOf } from "./people.ts";
import { answeredBy, closeDue, load, pendingCounts, purge, type Poll } from "./polls.ts";
import { openRounds } from "./series.ts";
import { chestZone } from "./zone.ts";

// What Polls tells people through the Chest's bell, each in their own
// language, and the number on its tile (the polls waiting for their answer).
//
// - 'ask': a poll is sent — everyone asked hears of it (not its organiser).
// - 'remind': the day before it closes; 'nudge': when its organiser asks
//   ("Remind those who haven't answered") — those who have not answered — in the bell and, where the Chest sends email
//   (Proposal (studio): mail), by email too.
// - 'final': a date poll's date is chosen — everyone asked.
// - the organiser hears that their poll closed by its date.
//
// 'ask' and 'final' go in one broadcast (Proposal (studio): the Chest
// writes each member's item in their language). Where the Chest cannot
// broadcast, and for reminders (only those who have not answered), Polls
// tells a page of 500 members at a time. The Chest takes 1,000 recipients an
// hour per tool: beyond, it refuses (QuotaExceeded) and Polls keeps where it
// stopped (tellings.after) and goes on at the next pass — on the "pass"
// schedule (every 15 minutes, Proposal (studio)) or when someone opens a
// page. Each item has one key per poll: telling again replaces it.
export const pollPath = (pollId: string) => `/chest/polls/${pollId}`;
export const askKey = (pollId: string) => `poll:${pollId}:ask`;
export const finalKey = (pollId: string) => `poll:${pollId}:final`;
const closedKey = (pollId: string) => `poll:${pollId}:closed`;
export const commentKey = (pollId: string) => `poll:${pollId}:comments`;

type Kind = "ask" | "remind" | "nudge" | "final";
type Told = { done: true } | { done: false; after: string | null };

function words(kind: Kind, poll: Poll, t: Catalogue, locale: Locale, organiser: string, zone: string): { title: string; body: string } {
  const d = dates(locale, zone);
  if (kind === "ask") {
    return {
      title: cut(format(t.bell.ask, { name: organiser, title: poll.title }), 80),
      body: cut(poll.closesAt ? format(t.bell.askUntil, { date: d.at(poll.closesAt) }) : t.bell.askBody[poll.kind], 280),
    };
  }
  if (kind === "nudge") return { title: cut(format(t.bell.nudge, { title: poll.title }), 80), body: cut(poll.closesAt ? format(t.bell.nudgeUntil, { name: organiser, date: d.at(poll.closesAt) }) : format(t.bell.nudgeBody, { name: organiser }), 280) };
  if (kind === "remind") return { title: cut(format(t.bell.remind, { title: poll.title }), 80), body: cut(poll.closesAt ? format(t.bell.remindBody, { date: d.at(poll.closesAt) }) : t.bell.askBody[poll.kind], 280) };
  const option = poll.questions[0]?.options.find(o => o.id === poll.finalOption);
  const when = option?.day ? optionText({ day: option.day, start: option.start, end: option.end }, locale, zone, { range: t.dates.range, dayAndTime: t.dates.dayAndTime }) : "";
  return { title: cut(format(t.bell.final, { title: poll.title }), 80), body: cut(when, 280) };
}

function byLocale(people: Person[]): Map<Locale, Person[]> {
  const groups = new Map<Locale, Person[]>();
  for (const p of people) groups.set(p.locale, [...(groups.get(p.locale) ?? []), p]);
  return groups;
}

async function organiserName(poll: Poll): Promise<(locale: Locale) => string> {
  const who = await lookup([poll.organiser]);
  return locale => nameOf(who.get(poll.organiser), locale);
}

// broadcastTo tells everyone the poll asks in one call. "fallback": the
// Chest cannot broadcast (not granted, not a Chest that knows it); "wait":
// over its quota or unreachable, again at the next pass.
async function broadcastTo(poll: Poll, kind: "ask" | "final", key: string): Promise<"done" | "fallback" | "wait"> {
  const zone = chestZone();
  const name = await organiserName(poll);
  // The Chest broadcasts to roles or groups: people picked by name are
  // told a page at a time.
  if (poll.people.length > 0) return "fallback";
  const messages = Object.fromEntries(locales.map(l => [l, words(kind, poll, catalogue(l), l, name(l), zone)])) as Record<Locale, { title: string; body: string }>;
  try {
    await notifications.broadcast({ messages: { ...messages, en: messages.en }, path: pollPath(poll.id), key, to: poll.everyone ? { roles: [...roles] } : { groups: poll.groups } });
    return "done";
  } catch (error) {
    if (error instanceof QuotaExceeded || error instanceof RateLimited || error instanceof Unavailable) return "wait";
    if (error instanceof ChestError) return "fallback";
    throw error;
  }
}

// tellPages tells a page of those asked at a time, from a cursor, keeping
// those `keep` says.
async function tellPages(sql: Sql, poll: Poll, kind: Kind, key: string, after: string | null, keep: (p: Person) => boolean): Promise<Told> {
  const zone = chestZone();
  const name = await organiserName(poll);
  let cursor = after;
  for (let i = 0; i < maxPages; i++) {
    let found;
    try {
      found = await page(poll, cursor);
    } catch (error) {
      if (error instanceof CapabilityNotGranted) return { done: true };
      if (error instanceof ChestError) return { done: false, after: cursor };
      throw error;
    }
    const people = found.people.filter(keep);
    for (const [locale, group] of byLocale(people)) {
      const message = words(kind, poll, catalogue(locale), locale, name(locale), zone);
      try {
        await notifications.notify(group.map(p => p.id), { ...message, path: pollPath(poll.id), key });
      } catch (error) {
        if (error instanceof CapabilityNotGranted) return { done: true };
        if (error instanceof ChestError) return { done: false, after: cursor };
        throw error;
      }
      if (kind === "remind" || kind === "nudge") await emailReminders(poll, group, catalogue(locale), locale, name(locale), zone);
    }
    if (kind === "ask") await badges(await pendingCounts(sql, people));
    if (!found.next) return { done: true };
    cursor = found.next;
    await sql`update tellings set after = ${cursor} where poll_id = ${poll.id} and kind = ${kind}`;
  }
  return { done: true };
}

// A reminder by email as well, one message per person (nobody sees who
// else is reminded), in their language, with the link to answer. Email is
// a courtesy on top of the bell: a Chest that cannot send email yet (no
// "mail"), or the day's quota reached, sends nothing more and the bell
// item stands. The key makes a repeated delivery of the same reminder send
// nothing twice. Someone without an address is skipped, not the others.
async function emailReminders(poll: Poll, people: Person[], t: Catalogue, locale: Locale, organiser: string, zone: string): Promise<void> {
  const d = dates(locale, zone);
  const base = chest.teamUrl();
  const link = base ? base.replace(/\/$/u, "") + pollPath(poll.id) : pollPath(poll.id);
  const stamp = (poll.nudgedAt ?? poll.closesAt ?? "").replace(/\D/gu, "").slice(0, 12);
  for (const p of people) {
    try {
      await mail.send({
        to: { member: p.id },
        subject: format(t.mail.subject, { title: poll.title }),
        text: format(poll.closesAt ? t.mail.bodyUntil : t.mail.body, { name: p.name, organiser, title: poll.title, date: poll.closesAt ? d.at(poll.closesAt) : "", link }),
        key: `remind.${poll.id}.${stamp}.${p.id.slice(4, 30)}`.slice(0, 64),
      });
    } catch (error) {
      // Someone the Chest has no address for (or who bounced): the next.
      if (error instanceof ChestError && (error.code === "invalid_address" || error.code === "suppressed")) continue;
      if (error instanceof ChestError) return;
      throw error;
    }
  }
}

// commented: the organiser hears of a new comment on their poll (one item
// per poll, replaced by the next comment).
export async function commented(poll: Poll, author: Member): Promise<void> {
  if (poll.organiser === author.id || poll.organiser === "erased") return;
  const who = await lookup([author.id]);
  await notify([poll.organiser], (t, locale) => ({ title: cut(format(t.bell.comment, { name: nameOf(who.get(author.id), locale), title: poll.title }), 80) }), { path: pollPath(poll.id) + "#comments", key: commentKey(poll.id) });
}

async function withdrawFrom(key: string, ids: Iterable<string>): Promise<void> {
  const list = [...new Set(ids)].filter(i => i.startsWith("mbr_"));
  for (let i = 0; i < list.length; i += 500) await withdraw(key, list.slice(i, i + 500));
}

async function tell(sql: Sql, poll: Poll, kind: Kind, after: string | null): Promise<Told> {
  if (kind === "remind" || kind === "nudge") {
    const done = await answeredBy(sql, poll.id);
    return tellPages(sql, poll, kind, askKey(poll.id), after, p => p.id !== poll.organiser && !done.has(p.id));
  }
  const key = kind === "ask" ? askKey(poll.id) : finalKey(poll.id);
  if (after === null) {
    const way = await broadcastTo(poll, kind, key);
    if (way === "wait") return { done: false, after: null };
    if (way === "done") {
      // The broadcast reached everyone asked: not the organiser's business,
      // nor, for 'ask', of those who answered already.
      await withdrawFrom(key, [poll.organiser, ...(kind === "ask" ? await answeredBy(sql, poll.id) : [])]);
      if (kind === "ask") await refreshAsked(sql, poll);
      return { done: true };
    }
  }
  const done = kind === "ask" ? await answeredBy(sql, poll.id) : new Set<string>();
  return tellPages(sql, poll, kind, key, after, p => p.id !== poll.organiser && !done.has(p.id));
}

// runTellings sends what is queued, oldest first. Two passes never tell the
// same poll at once (a two-minute lease). It stops at the first the Chest
// refuses for now.
export async function runTellings(sql: Sql, now = new Date()): Promise<{ told: string[]; waiting: string[] }> {
  const due = await sql<{ poll_id: string; kind: Kind }[]>`
    select t.poll_id, t.kind from tellings t join polls p on p.id = t.poll_id
    where p.deleted_at is null order by t.created_at, t.poll_id limit 10`;
  const told: string[] = [];
  const waiting: string[] = [];
  for (const { poll_id, kind } of due) {
    const [row] = await sql<{ after: string | null }[]>`
      update tellings set lease = ${now} where poll_id = ${poll_id} and kind = ${kind} and (lease is null or lease < ${now}::timestamptz - interval '2 minutes')
      returning after`;
    if (!row) continue;
    const poll = await load(sql, poll_id);
    const valid = kind === "final" ? poll.status === "closed" && poll.finalOption !== null : poll.status === "open" && (poll.closesAt === null || new Date(poll.closesAt) > now);
    const result: Told = valid ? await tell(sql, poll, kind, row.after) : { done: true };
    const name = `${poll.id}:${kind}`;
    if (result.done) {
      await sql`delete from tellings where poll_id = ${poll.id} and kind = ${kind}`;
      if (valid) told.push(name);
    } else {
      await sql`update tellings set after = ${result.after}, lease = null where poll_id = ${poll.id} and kind = ${kind}`;
      waiting.push(name);
      break;
    }
  }
  return { told, waiting };
}

// refreshAsked sets the number on the tile of everyone the poll asks (after
// it opens, closes, is reopened, deleted or restored). The Chest takes 600
// badge writes a minute: in a larger company the rest are set at each
// member's next visit.
export async function refreshAsked(sql: Sql, poll: Pick<Poll, "everyone" | "groups" | "people">): Promise<void> {
  let after: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    let found;
    try {
      found = await page(poll, after);
    } catch (error) {
      if (error instanceof ChestError) return;
      throw error;
    }
    await badges(await pendingCounts(sql, found.people));
    if (!found.next) return;
    after = found.next;
  }
}

// refreshOne sets one member's number (after they answer, on each visit).
export async function refreshOne(sql: Sql, actor: Pick<Member, "id" | "groups" | "role">): Promise<void> {
  await badges(await pendingCounts(sql, [actor]));
}

// settle does what follows a closing: the "asks you" items leave every
// bell, the tiles are set again, and the organiser of a poll closed by its
// date hears of it (a date poll: to pick the date).
export async function settle(sql: Sql, now = new Date()): Promise<string[]> {
  const due = await sql<{ id: string }[]>`select id from polls where status = 'closed' and settled_at is null and deleted_at is null order by id limit 20`;
  const settled: string[] = [];
  for (const { id } of due) {
    const [claimed] = await sql<{ id: string }[]>`update polls set settled_at = ${now} where id = ${id} and settled_at is null returning id`;
    if (!claimed) continue;
    const poll = await load(sql, id);
    await withdraw(askKey(poll.id));
    await sql`delete from tellings where poll_id = ${poll.id} and kind in ('ask', 'remind', 'nudge')`;
    await refreshAsked(sql, poll);
    if (poll.closedByDate && poll.organiser !== "erased") {
      await notify([poll.organiser], t => ({ title: cut(format(t.bell.closed, { title: poll.title }), 80), body: poll.kind === "date" ? t.bell.closedDate : t.bell.closedBody }), { path: pollPath(poll.id), key: closedKey(poll.id) });
    }
    settled.push(poll.id);
  }
  return settled;
}

// queueReminders: a poll that closes within a day, sent more than a day
// before its closing, reminds those who have not answered — once.
export async function queueReminders(sql: Sql, now = new Date()): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    with due as (
      update polls set reminded_at = ${now}
      where status = 'open' and deleted_at is null and reminded_at is null and closes_at is not null
        and closes_at > ${now} and closes_at <= ${now}::timestamptz + interval '24 hours'
        and opened_at < closes_at - interval '24 hours'
      returning id
    )
    insert into tellings (poll_id, kind, created_at) select id, 'remind', ${now} from due on conflict do nothing returning poll_id as id`;
  return rows.map(r => String(r.id));
}

// pass is the work Polls does by itself, on its schedule or on a visit:
// close what is due and settle it, queue reminders, tell what is queued,
// purge what was deleted long ago.
export async function pass(sql: Sql, now = new Date()): Promise<{ told: string[]; waiting: string[]; settled: string[] }> {
  await closeDue(sql, now);
  await openRounds(sql, chestZone(), now);
  const settled = await settle(sql, now);
  await queueReminders(sql, now);
  const result = await runTellings(sql, now);
  await purge(sql, now);
  return { ...result, settled };
}

// catchUp is the pass a visit runs, so Polls works on a Chest without
// schedules: at most once a minute per server.
let last = 0;
export async function catchUp(sql: Sql, now = new Date()): Promise<void> {
  if (now.getTime() - last < 60_000) return;
  last = now.getTime();
  await pass(sql, now);
}

// Answered: the "asks you" item leaves that member's bell, their tile drops.
export async function answered(sql: Sql, actor: Member, pollId: string): Promise<void> {
  await withdraw(askKey(pollId), [actor.id]);
  await refreshOne(sql, actor);
}

// Deleted: its items leave every bell; restored or reopened, tiles again.
export async function removed(sql: Sql, poll: Poll): Promise<void> {
  await withdraw(askKey(poll.id));
  await withdraw(finalKey(poll.id));
  await withdraw(closedKey(poll.id));
  await refreshAsked(sql, poll);
}

// The date taken back: its item leaves every bell.
export async function unchosen(pollId: string): Promise<void> {
  await withdraw(finalKey(pollId));
}
