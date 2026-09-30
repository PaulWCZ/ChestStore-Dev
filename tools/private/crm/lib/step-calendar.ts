import { createHash } from "node:crypto";
import * as calendar from "@argentic/chest-sdk/calendar";
import * as chest from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import type { Query } from "./db.ts";
import { catalogue, format, locales } from "./i18n/index.ts";
import { zoned } from "./model.ts";

// Timed next steps in their owner's Chest calendar (Proposal (studio): the
// calendar bridge, chest.proposals.json "calendar"). "Call Claire, Tuesday
// 14:30" appears in the calendar the salesperson already uses — Google,
// Outlook, Apple — through the one feed the Chest serves each member; the
// tool never serves a feed nor sees its address. A step with a time of day
// is put (30 minutes, busy, opening the deal or the contact); done,
// deleted, moved to no time or to nobody, its event goes. A step without
// a time stays out of calendars (a day's to-do, not an appointment).
//
// step_events remembers what was put, with a fingerprint: each change of a
// step publishes that step (publishStep), and reconcile() catches up with
// what changed in bulk (a deal or contact deleted, merged, an import taken
// back, a member gone) and runs each morning. A Chest without the bridge
// refuses: the steps stand, the tool remembers it (tool_state), the form
// stops promising the calendar.

export const stepMinutes = 30;
const key = (stepId: string) => `step:${stepId}`;

type Eligible = { id: string; text: string; due_on: string; due_time: string; owner: string; deal_id: string | null; contact_id: string | null; about: string | null };

// The open timed steps with an owner (all of them, or these).
async function eligible(sql: Query, ids?: string[]): Promise<Eligible[]> {
  return sql<Eligible[]>`
    select p.id::text as id, p.text, to_char(p.due_on, 'YYYY-MM-DD') as due_on, p.due_time, p.owner, p.deal_id::text as deal_id, p.contact_id::text as contact_id,
           coalesce(d.title, c.name) as about
    from steps p left join deals d on d.id = p.deal_id left join contacts c on c.id = p.contact_id
    where p.done_at is null and p.due_time is not null and p.owner like 'mbr_%'
      ${ids ? sql`and p.id = any(${ids}::bigint[])` : sql``}
    order by p.due_on, p.id
    limit 5000`;
}

const fingerprint = (s: Eligible) => createHash("sha256").update([s.text, s.due_on, s.due_time, s.owner, s.deal_id ?? "", s.contact_id ?? "", s.about ?? ""].join("\u0000")).digest("hex").slice(0, 32);

async function remember(sql: Query, works: boolean): Promise<void> {
  await sql`insert into tool_state (key, value) values ('calendar', ${works ? "yes" : "no"}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

// Whether the Chest's calendar took the last event: true, false, or null
// when never tried.
export async function calendarWorks(sql: Query): Promise<boolean | null> {
  const [row] = await sql<{ value: string }[]>`select value from tool_state where key = 'calendar'`;
  return row ? row.value === "yes" : null;
}

function eventOf(s: Eligible): calendar.CalendarEvent {
  const start = zoned(s.due_on, s.due_time, chest.timeZone());
  const title = Object.fromEntries(locales.map(l => [l, (s.about ? format(catalogue(l).calendar.titleOn, { text: s.text, on: s.about }) : s.text).slice(0, 120)]));
  const description = Object.fromEntries(locales.map(l => [l, catalogue(l).calendar.description]));
  return {
    key: key(s.id), members: [s.owner], title, description,
    start, end: new Date(start.getTime() + stepMinutes * 60_000),
    path: s.deal_id ? `/chest/deals/${s.deal_id}` : s.contact_id ? `/chest/contacts/${s.contact_id}` : "/chest",
  };
}

async function kept(sql: Query, list: Eligible[]): Promise<void> {
  for (const s of list) {
    await sql`insert into step_events (step_id, owner, fingerprint) values (${s.id}, ${s.owner}, ${fingerprint(s)})
      on conflict (step_id) do update set owner = excluded.owner, fingerprint = excluded.fingerprint, put_at = now()`;
  }
  if (list.length > 0) await remember(sql, true);
}

async function put(sql: Query, s: Eligible): Promise<boolean> {
  try {
    await calendar.put(eventOf(s));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    // A day far away (more than two years ahead, a year ago) is refused
    // alone; anything else: the Chest has no calendar (yet).
    if (error.code !== "invalid_event") await remember(sql, false);
    return false;
  }
  await kept(sql, [s]);
  return true;
}

// putMany: many steps at once (Proposal (studio.15): calendar.putMany, 100
// a call, one write of the minute each) — a first sync, a bulk change, the
// morning. A batch holding one event the Chest refuses (a day too far) is
// put one by one, so the others still go. Says how many were put, and
// whether to go on (false: the Chest has no calendar).
async function putMany(sql: Query, list: Eligible[]): Promise<{ put: number; goOn: boolean }> {
  let put_ = 0;
  for (let i = 0; i < list.length; i += 100) {
    const batch = list.slice(i, i + 100);
    try {
      await calendar.putMany(batch.map(eventOf));
      await kept(sql, batch);
      put_ += batch.length;
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      if (error.code !== "invalid_event") {
        await remember(sql, false);
        return { put: put_, goOn: false };
      }
      for (const s of batch) if (await put(sql, s)) put_++;
    }
  }
  return { put: put_, goOn: true };
}

async function take(sql: Query, stepId: string): Promise<boolean> {
  try {
    await calendar.remove(key(stepId));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    // Gone already is gone; anything else is tried again later.
    if (error.status !== 404) return false;
  }
  await sql`delete from step_events where step_id = ${stepId}`;
  return true;
}

// publishStep brings one step's event in line with the step: put, changed,
// or taken out. Never fails the action that changed the step.
export async function publishStep(sql: Query, stepId: string): Promise<void> {
  try {
    const [s] = await eligible(sql, [stepId]);
    const [known] = await sql<{ fingerprint: string }[]>`select fingerprint from step_events where step_id = ${stepId}`;
    if (s) {
      if (!known || known.fingerprint !== fingerprint(s)) await put(sql, s);
    } else if (known) await take(sql, stepId);
  } catch (error) {
    console.error("calendar: step not published", error instanceof Error ? error.name : "error");
  }
}

// reconcile brings every event in line (a bulk change, the morning): what
// is not eligible any more goes, what is new or changed is put. Bounded per
// run; the next run goes on.
export async function reconcile(sql: Query, max = 500): Promise<{ put: number; removed: number }> {
  const done = { put: 0, removed: 0 };
  try {
    const now = await eligible(sql);
    const byId = new Map(now.map(s => [s.id, s]));
    const known = await sql<{ step_id: string; fingerprint: string }[]>`select step_id::text as step_id, fingerprint from step_events`;
    const knownIds = new Map(known.map(k => [k.step_id, k.fingerprint]));
    for (const k of known) {
      if (done.put + done.removed >= max) return done;
      if (!byId.has(k.step_id) && (await take(sql, k.step_id))) done.removed++;
    }
    // What is new or changed, sent in batches; a Chest without the
    // calendar: one try a run, not one per step.
    const changed = now.filter(s => knownIds.get(s.id) !== fingerprint(s)).slice(0, Math.max(0, max - done.put - done.removed));
    done.put += (await putMany(sql, changed)).put;
  } catch (error) {
    console.error("calendar: reconcile failed", error instanceof Error ? error.name : "error");
  }
  return done;
}
