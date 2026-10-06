import type { ToolEvent } from "@argentic/chest-sdk/events";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "@argentic/chest-app";
import type { Query, Sql } from "./db.ts";
import { addDays, memberPattern } from "../shared/model.ts";
import { present } from "./people.ts";

// Departures told by People (Proposal (studio): events between tools, once
// an admin linked the two): HR set someone's last day there, so what they
// hold is to be taken back before it. The managers hear it once in the bell
// ("Marc Lefort leaves on 12 Oct — 3 items to take back"), find them under
// "To take back" on the overview and a word on the person's page. Nothing
// is taken back by itself.
//
// Data, as People publishes it:
//   people.leaving           { member, lastDay }   — "YYYY-MM-DD"
//   people.leaving_cancelled { member }
// Anything of another shape is accepted and ignored. Events come at least
// once, not always in order: each departure keeps when People said so, and
// an older word is ignored (a cancelled one keeps its time for a week).
//
// When the person then leaves the Chest (member.removed, access.revoked),
// the departure leaves the managers' lists: "Held by people who left" takes
// over, as it always did (lib/lifecycle.ts). It is kept (left_at) until 30
// days after the last day, so that once everything they held is back,
// People is still told (equipment.returned, lib/returned.ts).
export const keepPastDays = 30;
export const keepCancelledDays = 7;

export type Departure = { memberId: string; lastDay: string };

const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

// readLeaving checks every field of a people.leaving event; null for
// another shape.
export function readLeaving(data: Record<string, unknown>): Departure | null {
  const { member, lastDay } = data;
  if (typeof member !== "string" || !memberPattern.test(member)) return null;
  if (typeof lastDay !== "string" || !datePattern.test(lastDay)) return null;
  const d = new Date(lastDay + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== lastDay) return null;
  const year = d.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return { memberId: member, lastDay };
}

// When the Chest says the event happened; now when it says nothing usable.
function toldAt(value: unknown): Date {
  const d = typeof value === "string" ? new Date(value) : new Date(NaN);
  return Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 5 * 60_000 ? new Date() : d;
}

// What someone holds: items and licence seats.
export async function heldCount(sql: Query, memberId: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    select ((select count(*) from items where holder = ${memberId} and deleted_at is null)
      + (select count(*) from seats s join items i on i.id = s.item_id where s.member_id = ${memberId} and i.deleted_at is null))::int as n`;
  return row?.n ?? 0;
}

// Someone is leaving: kept (or its day changed) for a member who has the
// tool, unless People already said something newer. Answers what to tell
// the managers, or null when nothing changed. When the Chest cannot be
// asked who is a member, this throws: the Chest delivers it again later.
export async function leaving(sql: Sql, event: ToolEvent, now: string): Promise<(Departure & { count: number }) | null> {
  if (event.source !== "people") return null;
  const d = readLeaving(event.data);
  if (!d || d.lastDay < addDays(now, -keepPastDays)) return null;
  if (!(await present([d.memberId])).has(d.memberId)) return null;
  const at = toldAt(event.occurredAt);
  const done = await sql`
    insert into departures (member_id, last_day, told_at) values (${d.memberId}, ${d.lastDay}, ${at})
    on conflict (member_id) do update set last_day = excluded.last_day, told_at = excluded.told_at, left_at = null
    where departures.told_at <= excluded.told_at`;
  if (done.count === 0) return null;
  return { ...d, count: await heldCount(sql, d.memberId) };
}

// A departure taken back in People: forgotten (its time kept a week).
// Answers the member whose notice goes, or null.
export async function leavingCancelled(sql: Sql, event: ToolEvent): Promise<string | null> {
  if (event.source !== "people") return null;
  const member = event.data["member"];
  if (typeof member !== "string" || !memberPattern.test(member)) return null;
  const at = toldAt(event.occurredAt);
  const done = await sql`
    insert into departures (member_id, last_day, told_at) values (${member}, null, ${at})
    on conflict (member_id) do update set last_day = null, told_at = excluded.told_at
    where departures.told_at <= excluded.told_at`;
  return done.count === 0 ? null : member;
}

// The managers' list: who is leaving, on which day, holding what — the
// soonest first. People who hold nothing are left out (nothing to do).
export type Leaving = Departure & { items: number; seats: number };

export async function leavingList(sql: Query, actor: Member | null): Promise<Leaving[]> {
  if (!can(actor, "items.manage")) throw new AppError("forbidden");
  const rows = await sql<{ member_id: string; last_day: string; items: number; seats: number }[]>`
    select d.member_id, to_char(d.last_day, 'YYYY-MM-DD') as last_day,
      (select count(*)::int from items i where i.holder = d.member_id and i.deleted_at is null) as items,
      (select count(*)::int from seats s join items i on i.id = s.item_id where s.member_id = d.member_id and i.deleted_at is null) as seats
    from departures d where d.last_day is not null and d.left_at is null order by d.last_day, d.member_id limit 200`;
  return rows.filter(r => r.items + r.seats > 0).map(r => ({ memberId: r.member_id, lastDay: r.last_day, items: r.items, seats: r.seats }));
}

// One person's last day, for their page (managers).
export async function lastDayOf(sql: Query, actor: Member | null, memberId: string): Promise<string | null> {
  if (!can(actor, "items.manage")) throw new AppError("forbidden");
  if (!memberPattern.test(memberId)) return null;
  const [row] = await sql<{ last_day: string | null }[]>`select to_char(last_day, 'YYYY-MM-DD') as last_day from departures where member_id = ${memberId} and left_at is null`;
  return row?.last_day ?? null;
}

// Forgotten 30 days after the last day; a cancelled one after a week.
export async function purgeDepartures(sql: Query, now: string): Promise<number> {
  const gone = await sql`
    delete from departures where (last_day is not null and last_day < ${addDays(now, -keepPastDays)}::date)
      or (last_day is null and told_at < now() - make_interval(days => ${keepCancelledDays}))
    returning member_id`;
  return gone.length;
}
