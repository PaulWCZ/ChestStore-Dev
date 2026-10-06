import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import { conflict, span } from "./booking-rules.ts";
import { dayKey, enqueue } from "./calendar.ts";
import type { TransactionSql } from "postgres";
import type { Query, Sql } from "./db.ts";
import { groupsOf } from "./groups.ts";
import { addDays, id, isStatus, mondayOf, partMinutes, today, weekday, type Status } from "../shared/model.ts";
import { presenceHorizon } from "./presence.ts";
import { rules } from "./settings.ts";

// "My usual week": where a member usually is on each working day (office,
// remote, off — or nothing), and the desk they want on office days. When a
// day comes within the booking window, Rooms says it for them and books
// that desk, once: the day is then marked applied (usual_applied), and
// whatever the person does with it afterwards is theirs. A day they already
// said something for, or booked a desk on, is never touched.
//
// Nothing runs in the background: applyUsual() runs when a page of the tool
// is read (lib/context.ts) and when a member saves their usual week — the
// days a person or their colleagues look at are always filled.

export type UsualWeek = { days: Partial<Record<number, Status>>; deskId: string | null; lendDesk: boolean };

export async function usualWeek(sql: Query, actor: Member): Promise<UsualWeek> {
  const rows = await sql<{ weekday: number; status: Status }[]>`select weekday, status from usual_week where member_id = ${actor.id}`;
  const [prefs] = await sql<{ usual_desk: string | null; lend_desk: boolean }[]>`
    select p.usual_desk, p.lend_desk from member_prefs p left join desks d on d.id = p.usual_desk
    where p.member_id = ${actor.id}`;
  const [live] = prefs?.usual_desk ? await sql`select 1 from desks where id = ${prefs.usual_desk} and archived_at is null` : [];
  return {
    days: Object.fromEntries(rows.map(r => [r.weekday, r.status])),
    deskId: prefs?.usual_desk && live ? String(prefs.usual_desk) : null,
    lendDesk: prefs?.lend_desk ?? true,
  };
}

// Saves a member's usual week. What the previous one said and booked on
// coming days — and the person left as it was — is taken back and said
// again from the new one; the rest stays. Answers how many days it filled.
export async function setUsualWeek(sql: Sql, actor: Member | null, input: { days?: unknown; deskId?: unknown; lendDesk?: unknown }, zone: string): Promise<{ applied: number }> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  const given = input.days;
  if (given === null || typeof given !== "object" || Array.isArray(given)) throw new AppError("invalid");
  const days = new Map<number, Status>();
  for (const [key, value] of Object.entries(given as Record<string, unknown>)) {
    const w = Number(key);
    if (!Number.isInteger(w) || w < 1 || w > 7) throw new AppError("invalid");
    if (value === null || value === undefined || value === "") continue;
    if (!isStatus(value)) throw new AppError("invalid");
    days.set(w, value);
  }
  const deskId = input.deskId === null || input.deskId === undefined || input.deskId === "" ? null : id(input.deskId);
  if (input.lendDesk !== undefined && typeof input.lendDesk !== "boolean") throw new AppError("invalid");
  const lend = input.lendDesk as boolean | undefined;
  const mine = deskId && !can(actor, "bookings.any") ? await groupsOf(actor) : [];
  return sql.begin(async tx => {
    if (deskId) {
      const [desk] = await tx<{ assigned_to: string | null; group_id: string | null }[]>`
        select d.assigned_to, a.group_id from desks d join areas a on a.id = d.area_id where d.id = ${deskId} and d.archived_at is null`;
      if (!desk) throw new AppError("not_found");
      if (desk.assigned_to !== null && desk.assigned_to !== actor.id) throw new AppError("assigned");
      if (desk.group_id !== null && !can(actor, "bookings.any") && !mine.includes(desk.group_id)) throw new AppError("group_only");
    }
    await tx`delete from usual_week where member_id = ${actor.id}`;
    for (const [w, status] of days) await tx`insert into usual_week (member_id, weekday, status) values (${actor.id}, ${w}, ${status})`;
    await tx`
      insert into member_prefs (member_id, usual_desk, lend_desk) values (${actor.id}, ${deskId}, ${lend ?? true})
      on conflict (member_id) do update set usual_desk = excluded.usual_desk`;
    if (lend !== undefined) await tx`update member_prefs set lend_desk = ${lend} where member_id = ${actor.id}`;
    // Take back what the previous usual week did from tomorrow on (today
    // is under way: it stays as it is).
    const from = today(zone);
    const freed = await tx<{ day: string }[]>`
      update desk_bookings set cancelled_at = now(), cancelled_by = ${actor.id}
      where member_id = ${actor.id} and usual and cancelled_at is null and day > ${from}
      returning to_char(day, 'YYYY-MM-DD') as day`;
    const unsaid = await tx<{ day: string }[]>`
      delete from presence where member_id = ${actor.id} and usual and day > ${from} returning to_char(day, 'YYYY-MM-DD') as day`;
    const reopened = [...new Set([...freed, ...unsaid].map(r => r.day))];
    if (reopened.length > 0) await tx`delete from usual_applied where member_id = ${actor.id} and day in ${tx(reopened)}`;
    await enqueue(tx, reopened.map(d => dayKey(actor.id, d)));
    return { applied: await applyWithin(tx, zone, actor.id) };
  });
}

// applyUsual fills the coming days of everyone's usual week (or one
// member's), within the booking window. Idempotent: each (member, day) is
// claimed once, in the same transaction as what it writes.
export async function applyUsual(sql: Sql, zone: string, memberId?: string): Promise<number> {
  // Nothing to do, most of the time: no transaction for that.
  const [any] = await sql`select 1 from usual_week ${memberId ? sql`where member_id = ${memberId}` : sql``} limit 1`;
  if (!any) return 0;
  return sql.begin(tx => applyWithin(tx, zone, memberId));
}

async function applyWithin(tx: TransactionSql, zone: string, memberId?: string): Promise<number> {
  const r = await rules(tx);
  const from = today(zone);
  const days: string[] = [];
  for (let i = 0; i <= Math.min(r.daysAhead, presenceHorizon); i++) {
    const d = addDays(from, i);
    if (r.weekdays.includes(weekday(d))) days.push(d);
  }
  if (days.length === 0) return 0;
  const claimed = await tx<{ member_id: string; day: string; status: Status }[]>`
    insert into usual_applied (member_id, day)
    select u.member_id, d.day from usual_week u join unnest(${days}::date[]) as d(day) on extract(isodow from d.day)::int = u.weekday
    ${memberId ? tx`where u.member_id = ${memberId}` : tx``}
    on conflict do nothing
    returning member_id, to_char(day, 'YYYY-MM-DD') as day,
      (select status from usual_week w where w.member_id = usual_applied.member_id and w.weekday = extract(isodow from usual_applied.day)::int) as status`;
  let applied = 0;
  for (const c of claimed) {
    // Said or booked already: the person's own choice stays.
    const [said] = await tx`
      select 1 from presence where member_id = ${c.member_id} and day = ${c.day}
      union all select 1 from desk_bookings where member_id = ${c.member_id} and day = ${c.day} and cancelled_at is null limit 1`;
    if (said) continue;
    if (c.status !== "office") {
      await tx`insert into presence (member_id, day, status, usual) values (${c.member_id}, ${c.day}, ${c.status}, true) on conflict do nothing`;
      await enqueue(tx, [dayKey(c.member_id, c.day)]);
      applied++;
      continue;
    }
    const [prefs] = await tx<{ office_id: string | null; desk_id: string | null; desk_office: string | null; assigned_to: string | null }[]>`
      select p.office_id, d.id as desk_id, f.office_id as desk_office, d.assigned_to
      from member_prefs p
      left join desks d on d.id = p.usual_desk and d.archived_at is null
      left join areas a on a.id = d.area_id left join floors f on f.id = a.floor_id
      where p.member_id = ${c.member_id}`;
    const [first] = await tx<{ id: string }[]>`select id from offices order by position, id limit 1`;
    const office = prefs?.desk_office ?? prefs?.office_id ?? first?.id ?? null;
    await tx`insert into presence (member_id, day, status, office_id, usual) values (${c.member_id}, ${c.day}, 'office', ${office}, true) on conflict do nothing`;
    // A desk given to them needs no booking; one given to someone else meanwhile is not taken.
    if (prefs?.desk_id && prefs.assigned_to === null && await withinDeskDays(tx, r.maxDeskDays, c.member_id, c.day)) {
      const [start, end] = partMinutes.day;
      try {
        await tx.savepoint(async sp => {
          await sp`
            insert into desk_bookings (desk_id, member_id, day, part, during, usual)
            values (${prefs.desk_id}, ${c.member_id}, ${c.day}, 'day', ${span(sp, c.day, start, end, zone)}, true)`;
        });
      } catch (error) {
        // Someone has it that day: the day is said, without a desk.
        if (!conflict(error)) throw error;
      }
    }
    await enqueue(tx, [dayKey(c.member_id, c.day)]);
    applied++;
  }
  return applied;
}

async function withinDeskDays(tx: Query, max: number | null, member: string, d: string): Promise<boolean> {
  if (max === null) return true;
  const monday = mondayOf(d);
  const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`
    select count(distinct day)::int as n from desk_bookings
    where member_id = ${member} and cancelled_at is null and day between ${monday} and ${addDays(monday, 6)} and day <> ${d}`;
  return n < max;
}
