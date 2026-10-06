import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import { localeOf, type Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import * as notifications from "@argentic/chest-sdk/notifications";
import type { Run } from "@argentic/chest-sdk/schedules";
import { boardAccess } from "./access.ts";
import { membership } from "./boards.ts";
import { withGroupsAmong } from "./groups.ts";
import { purgeComments, urgentCounts } from "./cards.ts";
import type { Sql } from "./db.ts";
import { catalogue, format, plural, type Catalogue } from "../i18n/index.ts";
import { email } from "./mail.ts";
import { today } from "../shared/model.ts";
import { badges, cut, withdraw } from "./notify.ts";
import { reminderKey } from "./reminders.ts";
import { catchUp } from "./repeats.ts";
import { sync } from "./due-calendar.ts";

// The weekday morning (schedule "morning", in the Chest's time zone):
//
// 1. repeating cards done without their next one get it (a safety net: the
//    next card is normally made the moment one is done);
// 2. each person with open cards due today or late, on boards they still
//    see, finds one item in their bell — "2 tasks due today, 1 task late"
//    and the titles — in their own language. It replaces yesterday's (one
//    key per person), and is taken back once nothing is due (here, or as
//    soon as their last one is done: tell.refreshBadges). Cards done or
//    archived never remind; a person who turned the reminder off is not
//    reminded;
//    The same goes by email to those who did not turn email off (Proposal
//    (studio) "mail"); steps given to them (subtasks) count as tasks;
// 3. every tile's number is set right, since dates moved overnight;
// 4. comments removed yesterday are deleted for good (the Undo is long past);
// 5. the due dates in the members' calendars are checked again, asking the
//    Chest who sees each private board (lib/due-calendar.ts).
//
// Idempotent: a run delivered twice makes no second card and sends the
// same item again under the same key.

type Due = { member_id: string; board_id: string; title: string; due_on: string };

export async function morning(sql: Sql, run: Run): Promise<void> {
  // The run's day on the Chest's clock (the cron line is read in its zone).
  const day = today(new Date(run.scheduledAt), chest.timeZone);
  await catchUp(sql, day);
  await purgeComments(sql);
  const rows = await sql<Due[]>`
    select member_id, board_id, title, due_on from (
      select a.member_id, c.board_id, c.title, to_char(c.due_on, 'YYYY-MM-DD') as due_on, c.id as card_id, 0 as step
      from card_assignees a join cards c on c.id = a.card_id join columns k on k.id = c.column_id join boards b on b.id = c.board_id
      where c.archived_at is null and k.archived_at is null and b.archived_at is null and not k.done and c.due_on <= ${day}
      union all
      select i.assignee as member_id, c.board_id, i.text || ' (' || c.title || ')' as title, to_char(i.due_on, 'YYYY-MM-DD') as due_on, c.id as card_id, i.id as step
      from checklist_items i join cards c on c.id = i.card_id join columns k on k.id = c.column_id join boards b on b.id = c.board_id
      where i.assignee is not null and not i.done and c.archived_at is null and k.archived_at is null and b.archived_at is null and not k.done and i.due_on <= ${day}
    ) due
    where not exists (select 1 from reminders r where r.member_id = due.member_id and r.off)
    order by due_on, card_id, step
    limit 20000`;
  const reminded = await remind(sql, rows, day);
  // Taken back from those reminded before and not today.
  const stale = (await sql<{ member_id: string }[]>`select member_id from reminders where sent_on is not null`).map(r => r.member_id).filter(m => !reminded.has(m));
  for (let i = 0; i < stale.length; i += 500) await withdraw(reminderKey, stale.slice(i, i + 500));
  if (stale.length > 0) await sql`update reminders set sent_on = null where member_id in ${sql(stale)}`;
  // Everyone who holds an open card: their number today (0 clears it).
  const holders = (await sql<{ member_id: string }[]>`
    select distinct a.member_id from card_assignees a join cards c on c.id = a.card_id where c.archived_at is null limit 5000`).map(r => r.member_id);
  await badges(await urgentCounts(sql, [...new Set([...holders, ...stale])], day));
  await sync(sql, { recheck: true, max: 1000 });
}

// remind sends each person their item; the people reminded.
async function remind(sql: Sql, rows: Due[], day: string): Promise<Set<string>> {
  const reminded = new Set<string>();
  if (rows.length === 0) return reminded;
  let found: Member[];
  try {
    found = (await members.lookup(rows.map(r => r.member_id))).members;
  } catch (error) {
    if (error instanceof ChestError) return reminded;
    throw error;
  }
  const boardIds = [...new Set(rows.map(r => String(r.board_id)))];
  const boards = await sql<{ id: string; visibility: "team" | "private" }[]>`select id, visibility from boards where id in ${sql(boardIds)}`;
  const people = await membership(sql, boardIds);
  const who = new Map((await withGroupsAmong(found, [...people.values()].flatMap(p => p.groups))).map(m => [m.id, m]));
  const shape = new Map(boards.map(b => [String(b.id), { visibility: b.visibility, ...people.get(String(b.id))! }]));
  const lists = new Map<string, { late: string[]; today: string[] }>();
  for (const r of rows) {
    const m = who.get(r.member_id);
    const b = shape.get(String(r.board_id));
    // Someone who no longer sees the board is not told of its cards.
    if (!m || !b || boardAccess(m, b) === "none") continue;
    const list = lists.get(m.id) ?? { late: [], today: [] };
    (r.due_on < day ? list.late : list.today).push(r.title);
    lists.set(m.id, list);
  }
  for (const [id, list] of lists) {
    const m = who.get(id)!;
    const locale = localeOf(m.language);
    const t = catalogue(locale);
    try {
      await notifications.notify([id], { ...reminder(t, locale, list), path: "/chest", key: reminderKey });
      reminded.add(id);
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
    // The email says it in full: every title, one per line.
    await email(sql, [id], words => ({
      subject: reminder(words, locale, list).title,
      lines: [
        ...(list.late.length > 0 ? [words.mail.lateHeading, ...list.late.map(x => "• " + x), ""] : []),
        ...(list.today.length > 0 ? [words.mail.todayHeading, ...list.today.map(x => "• " + x)] : []),
      ],
    }), { path: "/chest", key: `d:${day}` });
  }
  if (reminded.size > 0) {
    await sql`insert into reminders ${sql([...reminded].map(member_id => ({ member_id, sent_on: day })), "member_id", "sent_on")}
      on conflict (member_id) do update set sent_on = excluded.sent_on`;
  }
  return reminded;
}

// reminder writes one person's item: "2 tasks due today, 1 task late",
// then the titles, late ones first.
export function reminder(t: Catalogue, locale: string, list: { late: string[]; today: string[] }): { title: string; body: string } {
  const words = t.bell.reminder;
  const dueToday = list.today.length > 0 ? plural(words.today, list.today.length, locale) : "";
  const late = list.late.length > 0 ? plural(words.late, list.late.length, locale) : "";
  const title = dueToday && late ? format(words.both, { today: dueToday, late }) : dueToday || late;
  const lines = [
    ...(list.late.length > 0 ? [format(words.lateLine, { titles: list.late.join(" · ") })] : []),
    ...(list.today.length > 0 ? [format(words.todayLine, { titles: list.today.join(" · ") })] : []),
  ];
  return { title: cut(title, 80), body: bodyOf(lines) };
}

// The body keeps its line break (notifications keep them); each line is
// shortened so both fit in 280 characters.
function bodyOf(lines: string[]): string {
  if (lines.length < 2) return cut(lines[0] ?? "", 280);
  const [first, second] = lines as [string, string];
  const half = 139;
  const a = [...first].length <= half ? first : cut(first, Math.max(half, 279 - [...second].length));
  return a + "\n" + cut(second, 279 - [...a].length);
}
