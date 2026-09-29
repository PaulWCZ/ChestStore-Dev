import type { ToolEvent } from "@argentic/chest-sdk/events";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { randomBytes } from "node:crypto";
import { addDays, clean, day, email, fold, id, limits, memberId } from "./model.ts";
import { present } from "./people.ts";
import { profiles, save, wouldLoop } from "./profiles.ts";

// Arrivals: people coming who are not members yet — written by HR by hand
// (a hire made through LinkedIn and email), or told by another tool
// (Proposal (studio): events between tools). Today, Hiring:
//
//   hiring.hired          { candidate, name, email, job, team, place, startDate, hiredBy }
//   hiring.hire_cancelled { candidate }
//
// HR sees them among the arrivals, may start their arrival checklist before
// they have access (their own steps wait), and links the arrival to the
// member once they get the tool: the job, team, office, start date and
// manager fill the empty fields of their profile, the checklists become
// theirs, and the arrival keeps nothing personal. Never linked, an arrival
// is deleted 90 days after its start date (or after it was told). The
// email is never stored: nothing here writes to someone outside the Chest.

export const keepUnlinkedDays = 90;

export type Arrival = {
  id: string; source: "hiring" | "manual"; status: "expected" | "cancelled";
  name: string; job: string; team: string; place: string; startDate: string | null;
  managerId: string | null; hiredBy: string | null; toldAt: string; checklists: number;
  // The company address they will have (HR's arrivals only; never Hiring's
  // personal one).
  workEmail: string;
};

type Hired = { candidate: string; name: string; job: string; team: string; place: string; startDate: string | null; hiredBy: string | null };

const refPattern = /^[A-Za-z0-9._:-]{1,100}$/u;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

// readHired checks every field of a hiring.hired event; anything of
// another shape is ignored (null), never half-written.
export function readHired(data: Record<string, unknown>): Hired | null {
  const { candidate, name, email, job, team, place, startDate, hiredBy } = data;
  if (typeof candidate !== "string" || !refPattern.test(candidate)) return null;
  if (email !== null && email !== undefined && typeof email !== "string") return null;
  const text = (value: unknown, max: number, optional: boolean): string | null => {
    if (value === null || value === undefined) return optional ? "" : null;
    if (typeof value !== "string") return null;
    try {
      const t = clean(value, max, { optional: true });
      return t === "" && !optional ? null : t;
    } catch {
      return null;
    }
  };
  const n = text(name, 120, false);
  const j = text(job, limits.title, true);
  const tm = text(team, limits.team, true);
  const pl = text(place, limits.office, true);
  if (n === null || j === null || tm === null || pl === null) return null;
  let start: string | null = null;
  if (startDate !== null && startDate !== undefined) {
    if (typeof startDate !== "string" || !datePattern.test(startDate)) return null;
    const d = new Date(startDate + "T00:00:00Z");
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== startDate) return null;
    start = startDate;
  }
  if (hiredBy !== null && hiredBy !== undefined && (typeof hiredBy !== "string" || !/^mbr_[a-z2-7]{26}$/u.test(hiredBy))) return null;
  return { candidate, name: n, job: j, team: tm, place: pl, startDate: start, hiredBy: typeof hiredBy === "string" ? hiredBy : null };
}

// A hire told (again): a new arrival, or the same one brought up to date
// (a cancelled one comes back). A hire already linked to a member changes
// nothing. Says what to tell HR.
export async function hired(sql: Sql, event: ToolEvent): Promise<{ arrival: Arrival; isNew: boolean } | null> {
  if (event.source !== "hiring") return null;
  const h = readHired(event.data);
  if (!h) return null;
  const [before] = await sql<{ status: string }[]>`select status from arrivals where source = 'hiring' and ref = ${h.candidate}`;
  if (before?.status === "linked") return null;
  const [row] = await sql<{ id: string }[]>`
    insert into arrivals (source, ref, name, job, team, place, start_date, hired_by)
    values ('hiring', ${h.candidate}, ${h.name}, ${h.job}, ${h.team}, ${h.place}, ${h.startDate}, ${h.hiredBy})
    on conflict (source, ref) do update set status = 'expected', cancelled_at = null, name = excluded.name, job = excluded.job,
      team = excluded.team, place = excluded.place, start_date = excluded.start_date, hired_by = excluded.hired_by
    returning id`;
  const arrival = (await load(sql, [String(row!.id)]))[0]!;
  return { arrival, isNew: before === undefined || before.status === "cancelled" };
}

// A hire cancelled: the arrival goes if nothing was started for it;
// otherwise it is marked cancelled (its checklists stopped) for HR to see.
export async function hireCancelled(sql: Sql, event: ToolEvent): Promise<{ id: string; name: string; kept: boolean; stopped: string[]; assignees: string[] } | null> {
  if (event.source !== "hiring") return null;
  const candidate = event.data["candidate"];
  if (typeof candidate !== "string" || !refPattern.test(candidate)) return null;
  return sql.begin(async tx => {
    const [a] = await tx<{ id: string; name: string; status: string }[]>`select id, name, status from arrivals where source = 'hiring' and ref = ${candidate} for update`;
    if (!a || a.status !== "expected") return null;
    const journeys = await tx<{ id: string }[]>`select id from journeys where arrival_id = ${a.id}`;
    if (journeys.length === 0) {
      await tx`delete from arrivals where id = ${a.id}`;
      return { id: String(a.id), name: a.name, kept: false, stopped: [], assignees: [] };
    }
    await tx`update arrivals set status = 'cancelled', cancelled_at = now() where id = ${a.id}`;
    const stopped = await tx<{ id: string }[]>`update journeys set stopped_at = now() where arrival_id = ${a.id} and stopped_at is null returning id`;
    const assignees = await tx<{ assignee: string }[]>`
      select distinct i.assignee from journey_items i join journeys j on j.id = i.journey_id where j.arrival_id = ${a.id} and i.assignee like 'mbr_%'`;
    return { id: String(a.id), name: a.name, kept: true, stopped: stopped.map(s => String(s.id)), assignees: assignees.map(r => r.assignee) };
  });
}

type Row = { id: string; source: "hiring" | "manual"; status: "expected" | "cancelled"; name: string; job: string; team: string; place: string; start_date: string | null; manager_id: string | null; hired_by: string | null; told_at: Date; checklists: number; work_email: string };

async function load(sql: Query, ids?: string[]): Promise<Arrival[]> {
  const rows = await sql<Row[]>`
    select a.id, a.source, a.status, a.name, a.job, a.team, a.place, to_char(a.start_date, 'YYYY-MM-DD') as start_date, a.manager_id, a.hired_by, a.told_at, a.work_email,
      (select count(*)::int from journeys j where j.arrival_id = a.id) as checklists
    from arrivals a
    where a.status <> 'linked' ${ids ? sql`and a.id in ${sql(ids)}` : sql``}
    order by a.status, a.start_date nulls last, a.id limit 500`;
  return rows.map(r => ({
    id: String(r.id), source: r.source, status: r.status, name: r.name, job: r.job, team: r.team, place: r.place, startDate: r.start_date,
    managerId: r.manager_id, hiredBy: r.hired_by, toldAt: r.told_at.toISOString(), checklists: r.checklists, workEmail: r.work_email,
  }));
}

// HR's list: the arrivals expected and those cancelled.
export async function listArrivals(sql: Query, actor: Member | null): Promise<Arrival[]> {
  if (!can(actor, "checklists.manage")) throw new AppError("forbidden");
  return load(sql);
}

export async function arrival(sql: Query, actor: Member | null, arrivalId: unknown): Promise<Arrival> {
  if (!can(actor, "checklists.manage")) throw new AppError("forbidden");
  const found = (await load(sql, [id(arrivalId)]))[0];
  if (!found) throw new AppError("not_found");
  return found;
}

// Linking an arrival to the member they became: their profile's empty
// fields are filled (never overwritten), the checklists become theirs and
// their own steps are given to them; the arrival keeps no personal data.
export async function linkArrival(sql: Sql, actor: Member | null, arrivalId: unknown, member: unknown): Promise<{ journeys: string[]; memberId: string }> {
  if (!actor || !can(actor, "checklists.manage")) throw new AppError("forbidden");
  const key = id(arrivalId);
  const who = memberId(member);
  if (!(await present([who])).has(who)) throw new AppError("not_member");
  return sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('people.managers'))`;
    const [a] = await tx<{ status: string; job: string; team: string; place: string; start_date: string | null; manager_id: string | null }[]>`
      select status, job, team, place, to_char(start_date, 'YYYY-MM-DD') as start_date, manager_id from arrivals where id = ${key} for update`;
    if (!a || a.status !== "expected") throw new AppError("not_found");
    const current = (await profiles(tx, actor, [who])).get(who)!;
    const next = { ...current };
    if (!next.title && a.job) next.title = a.job;
    if (!next.team && a.team) next.team = a.team;
    if (!next.office && a.place) next.office = a.place;
    if (!next.startDate && a.start_date) next.startDate = a.start_date;
    if (!next.managerId && a.manager_id && a.manager_id !== who && !(await wouldLoop(tx, who, a.manager_id))) next.managerId = a.manager_id;
    await save(tx, next);
    const journeys = await tx<{ id: string }[]>`update journeys set person_id = ${who}, arrival_id = null where arrival_id = ${key} returning id`;
    const ids = journeys.map(j => String(j.id));
    if (ids.length > 0) {
      await tx`update journey_items set assignee = ${who} where journey_id in ${tx(ids)} and role = 'person' and assignee is null and done_at is null`;
    }
    await tx`
      update arrivals set status = 'linked', member_id = ${who}, linked_at = now(), name = '', job = '', team = '', place = '', start_date = null, manager_id = null, hired_by = null, work_email = ''
      where id = ${key}`;
    return { journeys: ids, memberId: who };
  });
}

// HR removes an arrival (a cancelled one, or one told by mistake) and the
// checklists started for it.
export async function removeArrival(sql: Sql, actor: Member | null, arrivalId: unknown): Promise<{ journeys: { id: string; assignees: string[] }[] }> {
  if (!can(actor, "checklists.manage")) throw new AppError("forbidden");
  const key = id(arrivalId);
  return sql.begin(async tx => {
    const rows = await tx<{ journey_id: string; assignee: string | null }[]>`
      select j.id as journey_id, i.assignee from journeys j left join journey_items i on i.journey_id = j.id where j.arrival_id = ${key}`;
    const journeys = [...new Set(rows.map(r => String(r.journey_id)))].map(jid => ({
      id: jid, assignees: [...new Set(rows.filter(r => String(r.journey_id) === jid && r.assignee?.startsWith("mbr_")).map(r => r.assignee!))],
    }));
    const gone = await tx`delete from arrivals where id = ${key} and status <> 'linked'`;
    if (gone.count === 0) throw new AppError("not_found");
    return { journeys };
  });
}

// Never linked: gone 90 days after the start date (or after being told,
// without one), with the checklists about them.
export async function purgeArrivals(sql: Query, now: string): Promise<number> {
  const limit = addDays(now, -keepUnlinkedDays);
  const gone = await sql`
    delete from arrivals where status <> 'linked'
      and coalesce(start_date, told_at::date) < ${limit}::date
    returning id`;
  return gone.length;
}

// The members an arrival may have become: the one with the work address HR
// wrote, otherwise the same name (accents and case aside).
export function suggestions<P extends { id: string; name: string; email?: string }>(arrivals: readonly Pick<Arrival, "id" | "name" | "status" | "workEmail">[], people: readonly P[]): Map<string, P[]> {
  const found = new Map<string, P[]>();
  for (const a of arrivals) {
    if (a.status !== "expected") continue;
    const byAddress = a.workEmail ? people.filter(p => p.email && p.email.toLowerCase() === a.workEmail) : [];
    const key = fold(a.name);
    const same = byAddress.length > 0 ? byAddress : people.filter(p => fold(p.name) === key);
    if (same.length > 0) found.set(a.id, same);
  }
  return found;
}

// An arrival HR writes by hand: the same thing Hiring's event makes, so
// the checklist, the link to the member and the purge work alike.
export type ArrivalInput = { name?: unknown; job?: unknown; team?: unknown; place?: unknown; startDate?: unknown; managerId?: unknown; workEmail?: unknown };

async function readArrival(input: ArrivalInput) {
  if (!input || typeof input !== "object") throw new AppError("invalid");
  const manager = input.managerId === undefined || input.managerId === null || input.managerId === "" ? null : memberId(input.managerId);
  if (manager && !(await present([manager])).has(manager)) throw new AppError("not_member");
  return {
    name: clean(input.name, limits.name),
    job: clean(input.job ?? "", limits.title, { optional: true }),
    team: clean(input.team ?? "", limits.team, { optional: true }),
    place: clean(input.place ?? "", limits.office, { optional: true }),
    startDate: day(input.startDate, { optional: true }),
    managerId: manager,
    workEmail: email(input.workEmail ?? ""),
  };
}

export async function addArrival(sql: Sql, actor: Member | null, input: ArrivalInput): Promise<Arrival> {
  if (!actor || !can(actor, "checklists.manage")) throw new AppError("forbidden");
  const a = await readArrival(input);
  const ref = "manual-" + randomBytes(9).toString("hex");
  const [row] = await sql<{ id: string }[]>`
    insert into arrivals (source, ref, name, job, team, place, start_date, manager_id, work_email, hired_by)
    values ('manual', ${ref}, ${a.name}, ${a.job}, ${a.team}, ${a.place}, ${a.startDate}, ${a.managerId}, ${a.workEmail}, ${actor.id}) returning id`;
  return (await load(sql, [String(row!.id)]))[0]!;
}

// HR corrects an arrival they wrote (Hiring's are brought up to date by
// Hiring itself).
export async function updateArrival(sql: Sql, actor: Member | null, arrivalId: unknown, input: ArrivalInput): Promise<Arrival> {
  if (!actor || !can(actor, "checklists.manage")) throw new AppError("forbidden");
  const key = id(arrivalId);
  const a = await readArrival(input);
  const done = await sql`
    update arrivals set name = ${a.name}, job = ${a.job}, team = ${a.team}, place = ${a.place}, start_date = ${a.startDate}, manager_id = ${a.managerId}, work_email = ${a.workEmail}
    where id = ${key} and source = 'manual' and status = 'expected'`;
  if (done.count === 0) throw new AppError("not_found");
  return (await load(sql, [key]))[0]!;
}
