import * as calendar from "@argentic/chest-sdk/calendar";
import { ChestError, RateLimited, Unavailable } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { boardAccess } from "./access.ts";
import { membership } from "./boards.ts";
import { zone } from "./clock.ts";
import type { Sql } from "./db.ts";
import { catalogue, format, locales } from "./i18n/index.ts";
import { zoned } from "./model.ts";

// My due dates in my calendar (Proposal (studio): the Chest's calendar
// bridge, chest.proposals.json "calendar"). Every open card with a due date
// is put in the calendar of the people it is given to, and every open step
// (subtask) with a date in its person's — through the one feed the Chest
// serves each member (Google, Outlook, Apple subscribe to it once). The
// tool never serves a feed nor sees its address.
//
// An event is the due day (all day), or the due time (30 minutes), shown
// free (a deadline is not a meeting), private on a private board (a shared
// calendar shows "busy", never the title). It opens the card by its id
// (/chest/cards/<id>), so it still leads to it after a move. Only people
// who see the board get it: a private board's people and groups, managers.
// Done, archived, deleted, undated or given to nobody: the event goes.
//
// calendar_events remembers what was put: `raw` (a fingerprint computed by
// the database of what the event is made of) and `members`. sync() runs
// after every change (app/chest/actions.ts: the answer is sent first) and
// puts only what changed; the morning runs it with `recheck`, which asks
// the Chest again who sees each private board (a role or a group changed
// outside the tool). A Chest without the bridge refuses: the tool
// remembers it (tool_state) and stops promising the calendar.

type Eligible = { key: string; card_id: string; title: string; card_title: string | null; due_on: string; due_time: string | null; board_id: string; board_name: string; visibility: "team" | "private"; people: string[]; raw: string };

// The events there should be (all of them, or those of these keys), with
// their fingerprint. Bounds of the Chest: a year back, two years ahead.
async function eligible(sql: Sql, keys?: string[]): Promise<Eligible[]> {
  return sql<Eligible[]>`
    with e as (
      select 'card:' || c.id as key, c.id::text as card_id, c.title, null::text as card_title, c.due_on, c.due_time, c.board_id, b.name as board_name, b.visibility,
             array(select a.member_id from card_assignees a where a.card_id = c.id order by a.member_id) as people
      from cards c join columns k on k.id = c.column_id join boards b on b.id = c.board_id
      where c.archived_at is null and k.archived_at is null and b.archived_at is null and not k.done
        and c.due_on between current_date - 360 and current_date + 720
        and exists (select 1 from card_assignees a where a.card_id = c.id)
      union all
      select 'step:' || i.id, c.id::text, i.text, c.title, i.due_on, null, c.board_id, b.name, b.visibility, array[i.assignee]
      from checklist_items i join cards c on c.id = i.card_id join columns k on k.id = c.column_id join boards b on b.id = c.board_id
      where i.assignee is not null and not i.done and c.archived_at is null and k.archived_at is null and b.archived_at is null and not k.done
        and i.due_on between current_date - 360 and current_date + 720
    )
    select e.key, e.card_id, e.title, e.card_title, to_char(e.due_on, 'YYYY-MM-DD') as due_on, e.due_time, e.board_id::text as board_id, e.board_name, e.visibility, e.people,
           md5(concat_ws(chr(31), e.title, e.card_title, e.due_on::text, e.due_time, e.board_name, e.visibility, array_to_string(e.people, ','),
             (select string_agg(p.member_id, ',' order by p.member_id) from board_people p where p.board_id = e.board_id),
             (select string_agg(g.group_id, ',' order by g.group_id) from board_groups g where g.board_id = e.board_id))) as raw
    from e
    ${keys ? sql`where e.key = any(${keys}::text[])` : sql``}
    order by e.due_on, e.key
    limit 5000`;
}

async function remember(sql: Sql, works: boolean): Promise<void> {
  await sql`insert into tool_state (key, value) values ('calendar', ${works ? "yes" : "no"}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

// Whether the Chest's calendar took the last event: true, false, or null
// when never tried (a new Chest: the page says nothing yet).
export async function calendarWorks(sql: Sql): Promise<boolean | null> {
  const [row] = await sql<{ value: string }[]>`select value from tool_state where key = 'calendar'`;
  return row ? row.value === "yes" : null;
}

// The member's page of the Chest where they add their calendar once.
export const calendarPage = calendar.page;

// Who of the people on it sees the board: everyone with a role on a team
// board (the Chest skips those without the tool), the board's people and
// groups (and managers) on a private one. Without the Chest's answer, a
// private board's own people only.
async function allowed(sql: Sql, rows: Eligible[]): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();
  const privateRows = rows.filter(r => r.visibility === "private");
  const shapes = await membership(sql, [...new Set(privateRows.map(r => r.board_id))]);
  let who: Map<string, Member> | null = new Map();
  const ids = [...new Set(privateRows.flatMap(r => r.people))];
  try {
    for (let i = 0; i < ids.length; i += 500) for (const m of (await members.lookup(ids.slice(i, i + 500))).members) who.set(m.id, m);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    who = null;
  }
  for (const r of rows) {
    if (r.visibility === "team") {
      found.set(r.key, [...r.people].sort());
      continue;
    }
    const shape = { visibility: "private" as const, ...(shapes.get(r.board_id) ?? { people: [], groups: [] }) };
    found.set(r.key, r.people.filter(p => {
      const m = who?.get(p);
      return who ? !!m && boardAccess(m, shape) !== "none" : shape.people.some(x => x.memberId === p);
    }).sort());
  }
  return found;
}

// What stops a run: the Chest has no calendar (or not for this tool), or
// asks to slow down. A day refused alone (invalid_event) does not.
class Stop extends Error {}

async function put(sql: Sql, r: Eligible, people: string[]): Promise<void> {
  const title = Object.fromEntries(locales.map(l => {
    const t = catalogue(l).calendar;
    return [l, (r.card_title === null ? format(t.card, { title: r.title }) : format(t.step, { title: r.title, card: r.card_title })).slice(0, 120)];
  }));
  const description = Object.fromEntries(locales.map(l => [l, format(catalogue(l).calendar.description, { board: r.board_name }).slice(0, 1000)]));
  const when = r.due_time
    ? (() => { const start = zoned(r.due_on, r.due_time!, zone()); return { start, end: new Date(start.getTime() + 30 * 60_000) }; })()
    : { days: { first: r.due_on, last: r.due_on } };
  try {
    await calendar.put({ key: r.key, members: people, title, description, ...when, path: `/chest/cards/${r.card_id}`, busy: false, private: r.visibility === "private" });
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    if (error.code === "invalid_event") return;
    // Busy for now: the next run goes on. Anything else: no calendar here.
    if (!(error instanceof RateLimited) && !(error instanceof Unavailable)) await remember(sql, false);
    throw new Stop();
  }
  await sql`insert into calendar_events (key, raw, members) values (${r.key}, ${r.raw}, ${people.join(",")})
    on conflict (key) do update set raw = excluded.raw, members = excluded.members, put_at = now()`;
  await remember(sql, true);
}

async function take(sql: Sql, key: string, wasPut = true): Promise<void> {
  if (wasPut) {
    try {
      await calendar.remove(key);
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      // Gone already is gone; anything else is tried again next time.
      if (error.status !== 404) throw new Stop();
    }
  }
  await sql`delete from calendar_events where key = ${key}`;
}

// sync brings the events in line with the cards: what changed is put, what
// is no longer due is taken back, at most `max` of them a run (the next run
// goes on). With `recheck` (the morning), who sees each board is asked
// again for every event. Never fails the change that called it.
export async function sync(sql: Sql, options: { max?: number; recheck?: boolean } = {}): Promise<{ put: number; removed: number }> {
  const max = options.max ?? 200;
  const done = { put: 0, removed: 0 };
  try {
    if ((await calendarWorks(sql)) === false && !options.recheck) return done;
    const now = await eligible(sql);
    const known = new Map((await sql<{ key: string; raw: string; members: string }[]>`select key, raw, members from calendar_events`).map(k => [k.key, k]));
    // Out of the Chest's window (more than two years ahead…): taken back.
    const keys = new Set(now.map(r => r.key));
    for (const k of known.keys()) {
      if (done.put + done.removed >= max) return done;
      if (!keys.has(k)) {
        await take(sql, k, known.get(k)!.members !== "");
        done.removed++;
      }
    }
    const todo = options.recheck ? now : now.filter(r => known.get(r.key)?.raw !== r.raw);
    if (todo.length === 0) return done;
    const who = await allowed(sql, todo.slice(0, max));
    for (const r of todo.slice(0, max)) {
      if (done.put + done.removed >= max) break;
      const people = who.get(r.key) ?? [];
      const before = known.get(r.key);
      if (people.length === 0) {
        // Nobody on it sees the board (a private import): nothing is put;
        // remembered, so the next change does not ask the Chest again.
        if (before?.members) {
          await take(sql, r.key);
          done.removed++;
        }
        await sql`insert into calendar_events (key, raw, members) values (${r.key}, ${r.raw}, '') on conflict (key) do update set raw = excluded.raw, members = '', put_at = now()`;
        continue;
      }
      if (before && before.raw === r.raw && before.members === people.join(",")) continue;
      await put(sql, r, people);
      done.put++;
    }
  } catch (error) {
    if (!(error instanceof Stop)) console.error("calendar: not in line", error instanceof Error ? error.name : "error");
  }
  return done;
}
