import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { can, roleOf } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import type { Query, Sql } from "./db.ts";
import { clean, day, daysBetween, id, int, memberId, step, today } from "../shared/model.ts";
import { presenceHorizon } from "./presence.ts";

// Visitors: someone without a Chest account — a client, a candidate, a
// supplier — coming to see a person of the company. Their host announces
// them (a name, a company, a day and a time); the reception (office
// managers and admins: "visitors.all") sees every visitor of the day,
// announces them for anyone, and marks each arrival, which the host hears
// in the bell (the caller tells them: lib/tell.ts).
//
// Privacy: a visitor is not a member, so the tool keeps only what the
// reception needs — a name and a company, no address, no phone —, shows
// them to their host, to whoever announced them and to the reception, and
// deletes them with the past bookings (lib/settings.ts purge). Nobody else
// sees who visits whom.

export const visitLimits = { name: 120, company: 120 } as const;

export type Visit = {
  id: string;
  officeId: string | null;
  day: string;
  at: number;
  name: string;
  company: string;
  host: string;
  createdBy: string;
  arrivedAt: string | null;
};

type Row = { id: string; office_id: string | null; day: string; at_minute: number; name: string; company: string; host: string; created_by: string; arrived_at: Date | null };
const columns = (sql: Query) => sql`id, office_id, to_char(day, 'YYYY-MM-DD') as day, at_minute, name, company, host, created_by, arrived_at`;
const toVisit = (r: Row): Visit => ({
  id: String(r.id), officeId: r.office_id === null ? null : String(r.office_id), day: r.day, at: Number(r.at_minute), name: r.name, company: r.company,
  host: r.host, createdBy: r.created_by, arrivedAt: r.arrived_at ? new Date(r.arrived_at).toISOString() : null,
});

// Who sees a visit: its host, whoever announced it, the reception.
const sees = (actor: Member, v: Pick<Visit, "host" | "createdBy">) => can(actor, "visitors.all") || v.host === actor.id || v.createdBy === actor.id;

// The host: the actor, or — for the reception — a member who has Rooms.
async function hostOf(actor: Member, value: unknown): Promise<string> {
  if (value === undefined || value === null || value === "" || value === actor.id) return actor.id;
  if (!can(actor, "visitors.all")) throw new AppError("forbidden");
  const target = await members.get(memberId(value));
  if (!target || roleOf(target) === null) throw new AppError("not_found");
  return target.id;
}

export type VisitInput = { officeId?: unknown; day?: unknown; at?: unknown; name?: unknown; company?: unknown; host?: unknown };

export async function announce(sql: Sql, actor: Member | null, input: VisitInput, zone: string): Promise<Visit> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  const d = day(input.day);
  const now = today(zone);
  if (d < now) throw new AppError("past");
  if (daysBetween(now, d) > presenceHorizon) throw new AppError("too_far", { max: presenceHorizon });
  const at = int(input.at, 0, 1440 - step);
  if (at % step !== 0) throw new AppError("invalid");
  const name = clean(input.name, visitLimits.name);
  const company = clean(input.company ?? "", visitLimits.company, { optional: true });
  const office = id(input.officeId);
  const host = await hostOf(actor, input.host);
  const [found] = await sql`select 1 from offices where id = ${office}`;
  if (!found) throw new AppError("not_found");
  const [row] = await sql<Row[]>`
    insert into visits (office_id, day, at_minute, name, company, host, created_by)
    values (${office}, ${d}, ${at}, ${name}, ${company}, ${host}, ${actor.id})
    returning ${columns(sql)}`;
  return toVisit(row!);
}

// The visits of a day at an office that the actor may see (the reception:
// all of them), by time.
export async function visitsOn(sql: Query, actor: Member | null, officeId: string, d: string): Promise<Visit[]> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  const all = can(actor, "visitors.all");
  const rows = await sql<Row[]>`
    select ${columns(sql)} from visits
    where day = ${d} and office_id = ${officeId} and cancelled_at is null
      and (${all} or host = ${actor.id} or created_by = ${actor.id})
    order by at_minute, id`;
  return rows.map(toVisit);
}

// The actor's own visitors (as their host) over some days: My week.
export async function myVisitors(sql: Query, actor: Member, from: string, to: string): Promise<Visit[]> {
  const rows = await sql<Row[]>`
    select ${columns(sql)} from visits
    where host = ${actor.id} and day between ${from} and ${to} and cancelled_at is null
    order by day, at_minute, id`;
  return rows.map(toVisit);
}

// A visitor is here: only on their day, by the reception or their host.
// Answers the visit, and whether it was new (a second tap tells nobody).
export async function arrive(sql: Sql, actor: Member | null, visitId: unknown, zone: string): Promise<{ visit: Visit; first: boolean }> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  const vid = id(visitId);
  return sql.begin(async tx => {
    const [row] = await tx<Row[]>`select ${columns(tx)} from visits where id = ${vid} and cancelled_at is null for update`;
    if (!row || !sees(actor, toVisit(row))) throw new AppError("not_found");
    const v = toVisit(row);
    if (!can(actor, "visitors.all") && v.host !== actor.id) throw new AppError("forbidden");
    if (v.day !== today(zone)) throw new AppError("not_today");
    if (v.arrivedAt) return { visit: v, first: false };
    const [after] = await tx<Row[]>`update visits set arrived_at = now(), arrived_by = ${actor.id} where id = ${vid} returning ${columns(tx)}`;
    return { visit: toVisit(after!), first: true };
  });
}

// Undo of an arrival marked by mistake.
export async function unarrive(sql: Sql, actor: Member | null, visitId: unknown): Promise<Visit> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  const vid = id(visitId);
  const [row] = await sql<Row[]>`select ${columns(sql)} from visits where id = ${vid} and cancelled_at is null`;
  if (!row || !sees(actor, toVisit(row))) throw new AppError("not_found");
  if (!can(actor, "visitors.all") && row.host !== actor.id) throw new AppError("forbidden");
  const [after] = await sql<Row[]>`update visits set arrived_at = null, arrived_by = null where id = ${vid} returning ${columns(sql)}`;
  return toVisit(after!);
}

// A visit called off: by its host, whoever announced it, or the reception;
// until its day is over. restoreVisit is its Undo.
export async function cancelVisit(sql: Sql, actor: Member | null, visitId: unknown, zone: string): Promise<Visit> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  const vid = id(visitId);
  return sql.begin(async tx => {
    const [row] = await tx<Row[]>`select ${columns(tx)} from visits where id = ${vid} and cancelled_at is null for update`;
    if (!row || !sees(actor, toVisit(row))) throw new AppError("not_found");
    if (row.day < today(zone)) throw new AppError("past");
    await tx`update visits set cancelled_at = now() where id = ${vid}`;
    return toVisit(row);
  });
}

export async function restoreVisit(sql: Sql, actor: Member | null, visitId: unknown): Promise<Visit> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  const vid = id(visitId);
  const [row] = await sql<Row[]>`select ${columns(sql)} from visits where id = ${vid} and cancelled_at is not null`;
  if (!row || !sees(actor, toVisit(row))) throw new AppError("not_found");
  const [after] = await sql<Row[]>`update visits set cancelled_at = null where id = ${vid} returning ${columns(sql)}`;
  return toVisit(after!);
}
