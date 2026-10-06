import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { today } from "./clock.ts";
import type { Query } from "./db.ts";
import { addDays, isDay, mondayOf, weekDays } from "../shared/days.ts";
import { clean, day as checkDay, id, limits, minutes as checkMinutes, numeric, optionalId, isColor, type Color } from "../shared/model.ts";
import { offeredProjects, writable } from "./projects.ts";
import { transaction } from "./tx.ts";
import { checkBudgets } from "./budgets.ts";
import { isLocked, settings } from "./settings.ts";
import { closedWeeks, weekLock, weekState, type WeekState } from "./weeks.ts";

// Time entries: a person's own time, by day (the day list) and by week
// (the grid). Everyone writes only their own; nothing changes in a locked
// period, in a week sent for approval or approved, nor once invoiced; a
// person's day holds 24 hours at most — checked in one transaction per
// person, so two tabs saving at once cannot overflow it. After a change,
// the projects' budgets are checked (lib/budgets.ts).

export type Entry = {
  id: string;
  projectId: string;
  taskId: string | null;
  day: string;
  minutes: number;
  note: string;
  billable: boolean;
  startedAt: string | null;
  endedAt: string | null;
  source: "manual" | "grid" | "timer" | "import";
  invoiced: boolean;
};
export type DayEntry = Entry & { projectName: string; clientName: string | null; color: Color; taskName: string | null; locked: boolean };

// A cell of the week grid: the minutes of a row on a day, from how many
// entries (a cell with several is changed in the day list).
export type Cell = { minutes: number; count: number; entryId: string | null; note: string; invoiced: boolean };
export type GridRow = {
  projectId: string;
  taskId: string | null;
  projectName: string;
  clientName: string | null;
  color: Color;
  taskName: string | null;
  writable: boolean;
  cells: Cell[];
};
export type Week = { monday: string; days: string[]; rows: GridRow[]; totals: number[]; total: number; lockedUntil: string | null; state: WeekState };

type Row = { id: string; project_id: string; task_id: string | null; day: string; minutes: number; note: string; billable: boolean; started_at: Date | null; ended_at: Date | null; source: Entry["source"]; invoiced_at: Date | null; handoff_id: string | null };
const toEntry = (r: Row): Entry => ({
  id: r.id, projectId: r.project_id, taskId: r.task_id, day: r.day, minutes: r.minutes, note: r.note, billable: r.billable,
  startedAt: r.started_at ? new Date(r.started_at).toISOString() : null, endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null, source: r.source,
  invoiced: r.invoiced_at !== null,
});
const columns = (sql: Query) => sql`id::text, project_id::text, task_id::text, to_char(day, 'YYYY-MM-DD') as day, minutes, note, billable, started_at, ended_at, source, invoiced_at, handoff_id::text`;

function own(actor: Member | null): Member {
  if (!actor || !can(actor, "time.own")) throw new AppError("forbidden");
  return actor;
}

// Deleted entries are kept 30 days for "Undo", then purged here: the tool
// runs nothing in the background.
export async function purge(sql: Query): Promise<void> {
  await sql`delete from entries where deleted_at < now() - ${limits.keepDeleted}::interval`;
}

// lockPerson serialises one person's writes (their day totals).
async function lockPerson(tx: Query, memberId: string): Promise<void> {
  await tx`select pg_advisory_xact_lock(hashtext(${"timesheets:" + memberId}))`;
}

export async function checkDayTotal(tx: Query, memberId: string, day: string): Promise<void> {
  const [row] = await tx<{ total: string }[]>`select coalesce(sum(minutes), 0)::text as total from entries where member_id = ${memberId} and day = ${day} and deleted_at is null`;
  if (numeric(row?.total) > 1440) throw new AppError("day_full");
}

// checkOpen refuses a change to one of the person's days that no longer
// changes: the locked period, a week sent for approval or approved.
export async function checkOpen(tx: Query, memberId: string, day: string): Promise<void> {
  if (isLocked(await settings(tx, { share: true }), day)) throw new AppError("locked");
  await weekLock(tx, memberId, day);
}

// The entries of one of the person's days, with their projects' names.
export async function dayEntries(sql: Query, actor: Member | null, day: unknown): Promise<DayEntry[]> {
  const me = own(actor);
  if (!isDay(day)) throw new AppError("invalid");
  const [s, closed] = await Promise.all([settings(sql), closedWeeks(sql, me.id, day, day)]);
  const rows = await sql<(Row & { project_name: string; client_name: string | null; color: string; task_name: string | null })[]>`
    select e.id::text, e.project_id::text, e.task_id::text, to_char(e.day, 'YYYY-MM-DD') as day, e.minutes, e.note, e.billable, e.started_at, e.ended_at, e.source, e.invoiced_at, e.handoff_id::text,
      p.name as project_name, c.name as client_name, p.color, t.name as task_name
    from entries e join projects p on p.id = e.project_id left join clients c on c.id = p.client_id left join tasks t on t.id = e.task_id
    where e.member_id = ${me.id} and e.day = ${day} and e.deleted_at is null
    order by e.started_at nulls last, e.id`;
  return rows.map(r => ({ ...toEntry(r), projectName: r.project_name, clientName: r.client_name, color: isColor(r.color) ? r.color : "teal", taskName: r.task_name, locked: isLocked(s, r.day) || closed.has(mondayOf(r.day)) || r.invoiced_at !== null || r.handoff_id !== null }));
}

// The person's week: a row per project and task they recorded time on or
// kept in the grid, a cell per day.
export async function week(sql: Query, actor: Member | null, monday: unknown): Promise<Week> {
  const me = own(actor);
  if (!isDay(monday)) throw new AppError("invalid");
  const start = mondayOf(monday);
  const days = weekDays(start);
  const end = days[6]!;
  await purge(sql);
  const [s, sums, kept, open, state] = await Promise.all([
    settings(sql),
    sql<{ project_id: string; task_id: string | null; day: string; minutes: string; count: number; entry_id: string; note: string; invoiced: boolean }[]>`
      select project_id::text, task_id::text, to_char(day, 'YYYY-MM-DD') as day, sum(minutes)::text as minutes, count(*)::int as count, min(id)::text as entry_id,
        min(note) as note, bool_or(invoiced_at is not null or handoff_id is not null) as invoiced
      from entries where member_id = ${me.id} and day between ${start} and ${end} and deleted_at is null
      group by project_id, task_id, day`,
    sql<{ project_id: string; task_id: string }[]>`select project_id::text, task_id::text from week_rows where member_id = ${me.id} and week = ${start}`,
    offeredProjects(sql, me),
    weekState(sql, me.id, start),
  ]);
  const keys = new Map<string, { projectId: string; taskId: string | null }>();
  for (const r of [...kept.map(k => ({ project_id: k.project_id, task_id: k.task_id === "0" ? null : k.task_id })), ...sums]) {
    keys.set(`${r.project_id}:${r.task_id ?? ""}`, { projectId: r.project_id, taskId: r.task_id });
  }
  const pids = [...new Set([...keys.values()].map(k => k.projectId))];
  const tids = [...new Set([...keys.values()].flatMap(k => (k.taskId ? [k.taskId] : [])))];
  const [projects, tasks] = await Promise.all([
    pids.length ? sql<{ id: string; name: string; client_name: string | null; color: string }[]>`
      select p.id::text, p.name, c.name as client_name, p.color from projects p left join clients c on c.id = p.client_id where p.id = any(${pids}::bigint[])` : [],
    tids.length ? sql<{ id: string; name: string }[]>`select id::text, name from tasks where id = any(${tids}::bigint[])` : [],
  ]);
  const rows: GridRow[] = [];
  for (const k of keys.values()) {
    const p = projects.find(x => x.id === k.projectId);
    if (!p) continue;
    const offer = open.find(o => o.id === k.projectId);
    const cells = days.map(d => {
      const found = sums.find(x => x.project_id === k.projectId && (x.task_id ?? null) === k.taskId && x.day === d);
      return found
        ? { minutes: numeric(found.minutes), count: found.count, entryId: found.count === 1 ? found.entry_id : null, note: found.count === 1 ? found.note : "", invoiced: found.invoiced }
        : { minutes: 0, count: 0, entryId: null, note: "", invoiced: false };
    });
    rows.push({
      projectId: k.projectId, taskId: k.taskId, projectName: p.name, clientName: p.client_name, color: isColor(p.color) ? p.color : "teal",
      taskName: k.taskId ? tasks.find(t => t.id === k.taskId)?.name ?? null : null,
      writable: offer !== undefined && (k.taskId === null || offer.tasks.some(t => t.id === k.taskId)),
      cells,
    });
  }
  rows.sort((a, b) => (a.clientName ?? "").localeCompare(b.clientName ?? "") || a.projectName.localeCompare(b.projectName) || (a.taskName ?? "").localeCompare(b.taskName ?? ""));
  const totals = days.map((_, i) => rows.reduce((sum, r) => sum + r.cells[i]!.minutes, 0));
  return { monday: start, days, rows, totals, total: totals.reduce((a, b) => a + b, 0), lockedUntil: s.lockedUntil, state };
}

// saveCell sets a grid cell: the minutes of that row on that day. An empty
// cell gets an entry, a cell of one entry changes it (zero deletes it); a
// cell of several entries is changed in the day list.
export async function saveCell(sql: Query, actor: Member | null, input: { projectId: unknown; taskId: unknown; day: unknown; minutes: unknown }): Promise<Cell> {
  const me = own(actor);
  const when = checkDay(input.day, today());
  const value = checkMinutes(input.minutes, { zero: true });
  const cell = await transaction(sql, async tx => {
    await lockPerson(tx, me.id);
    await checkOpen(tx, me.id, when);
    const w = await writable(tx, me, input.projectId, input.taskId);
    const found = await tx<{ id: string; note: string; invoiced: boolean }[]>`
      select id::text, note, (invoiced_at is not null or handoff_id is not null) as invoiced from entries
      where member_id = ${me.id} and project_id = ${w.projectId} and task_id is not distinct from ${w.taskId}::bigint and day = ${when} and deleted_at is null
      for update`;
    if (found.length > 1) throw new AppError("several");
    if (found[0]?.invoiced) throw new AppError("invoiced");
    await keepRow(tx, me.id, mondayOf(when), w.projectId, w.taskId);
    const existing = found[0];
    if (value === 0) {
      if (existing) await tx`update entries set deleted_at = now(), updated_at = now() where id = ${existing.id}`;
      return { projectId: w.projectId, cell: { minutes: 0, count: 0, entryId: null, note: "", invoiced: false } };
    }
    let entryId: string;
    if (existing) {
      await tx`update entries set minutes = ${value}, started_at = null, ended_at = null, updated_at = now() where id = ${existing.id}`;
      entryId = existing.id;
    } else {
      const [row] = await tx<{ id: string }[]>`
        insert into entries (member_id, project_id, task_id, day, minutes, billable, source)
        values (${me.id}, ${w.projectId}, ${w.taskId}, ${when}, ${value}, ${w.billable}, 'grid') returning id::text`;
      entryId = row!.id;
    }
    await checkDayTotal(tx, me.id, when);
    return { projectId: w.projectId, cell: { minutes: value, count: 1, entryId, note: existing?.note ?? "", invoiced: false } };
  });
  await checkBudgets(sql, [cell.projectId]);
  return cell.cell;
}

async function keepRow(tx: Query, memberId: string, monday: string, projectId: string, taskId: string | null): Promise<void> {
  const count = (await tx<{ count: number }[]>`select count(*)::int as count from week_rows where member_id = ${memberId} and week = ${monday}`)[0]!.count;
  if (count >= limits.rowsPerWeek) return;
  await tx`insert into week_rows (member_id, week, project_id, task_id) values (${memberId}, ${monday}, ${projectId}, ${taskId ?? 0}) on conflict do nothing`;
}

export type EntryInput = { projectId: unknown; taskId?: unknown; day: unknown; minutes: unknown; note?: unknown; billable?: unknown };

export async function addEntry(sql: Query, actor: Member | null, input: EntryInput): Promise<Entry> {
  const me = own(actor);
  const when = checkDay(input.day, today());
  const value = checkMinutes(input.minutes);
  const note = clean(input.note ?? "", limits.note, { optional: true, multiline: true });
  const entry = await transaction(sql, async tx => {
    await lockPerson(tx, me.id);
    await checkOpen(tx, me.id, when);
    const w = await writable(tx, me, input.projectId, input.taskId);
    const billable = w.billable && input.billable !== false;
    const [row] = await tx<Row[]>`
      insert into entries (member_id, project_id, task_id, day, minutes, note, billable, source)
      values (${me.id}, ${w.projectId}, ${w.taskId}, ${when}, ${value}, ${note}, ${billable}, 'manual')
      returning ${columns(tx)}`;
    await checkDayTotal(tx, me.id, when);
    return toEntry(row!);
  });
  await checkBudgets(sql, [entry.projectId]);
  return entry;
}

// updateEntry changes one of the person's entries (its day, project, task,
// minutes, note, billable). Changing the minutes or the day of a timer's
// entry forgets its start and end, which no longer match.
export async function updateEntry(sql: Query, actor: Member | null, entryId: unknown, input: EntryInput): Promise<Entry> {
  const me = own(actor);
  const eid = id(entryId);
  const when = checkDay(input.day, today());
  const value = checkMinutes(input.minutes);
  const note = clean(input.note ?? "", limits.note, { optional: true, multiline: true });
  const [entry, before] = await transaction(sql, async tx => {
    await lockPerson(tx, me.id);
    // FOR UPDATE: a hand-off or an invoicing marking it meanwhile is seen.
    const [current] = await tx<Row[]>`select ${columns(tx)} from entries where id = ${eid} and member_id = ${me.id} and deleted_at is null for update`;
    if (!current) throw new AppError("not_found");
    // Invoiced, or waiting for its invoice in Quotes (lib/handoff.ts).
    if (current.invoiced_at || current.handoff_id) throw new AppError("invoiced");
    await checkOpen(tx, me.id, current.day);
    await checkOpen(tx, me.id, when);
    const sameWork = String(input.projectId) === current.project_id && (optionalId(input.taskId) ?? null) === (current.task_id ?? null);
    let projectId = current.project_id, taskId = current.task_id, projectBillable: boolean;
    if (sameWork) {
      const [p] = await tx<{ billable: boolean }[]>`select billable from projects where id = ${projectId}`;
      projectBillable = p?.billable ?? false;
    } else {
      const w = await writable(tx, me, input.projectId, input.taskId);
      projectId = w.projectId;
      taskId = w.taskId;
      projectBillable = w.billable;
    }
    const billable = projectBillable && (input.billable === undefined ? current.billable || !sameWork : input.billable === true);
    const keepTimes = value === current.minutes && when === current.day;
    const [row] = await tx<Row[]>`
      update entries set project_id = ${projectId}, task_id = ${taskId}, day = ${when}, minutes = ${value}, note = ${note}, billable = ${billable},
        started_at = ${keepTimes ? current.started_at : null}, ended_at = ${keepTimes ? current.ended_at : null}, updated_at = now()
      where id = ${eid} returning ${columns(tx)}`;
    await checkDayTotal(tx, me.id, when);
    return [toEntry(row!), current.project_id] as const;
  });
  await checkBudgets(sql, [entry.projectId, before]);
  return entry;
}

export async function deleteEntry(sql: Query, actor: Member | null, entryId: unknown): Promise<void> {
  const me = own(actor);
  const eid = id(entryId);
  const projectId = await transaction(sql, async tx => {
    await lockPerson(tx, me.id);
    const [current] = await tx<{ day: string; project_id: string; invoiced: boolean }[]>`
      select to_char(day, 'YYYY-MM-DD') as day, project_id::text, (invoiced_at is not null or handoff_id is not null) as invoiced from entries where id = ${eid} and member_id = ${me.id} and deleted_at is null for update`;
    if (!current) throw new AppError("not_found");
    if (current.invoiced) throw new AppError("invoiced");
    await checkOpen(tx, me.id, current.day);
    await tx`update entries set deleted_at = now(), updated_at = now() where id = ${eid}`;
    return current.project_id;
  });
  await checkBudgets(sql, [projectId]);
}

// setNote writes the note of one of the person's entries (the grid's note).
export async function setNote(sql: Query, actor: Member | null, entryId: unknown, note: unknown): Promise<void> {
  const me = own(actor);
  const eid = id(entryId);
  const text = clean(note, limits.note, { optional: true, multiline: true });
  await transaction(sql, async tx => {
    await lockPerson(tx, me.id);
    const [current] = await tx<{ day: string; invoiced: boolean }[]>`
      select to_char(day, 'YYYY-MM-DD') as day, (invoiced_at is not null or handoff_id is not null) as invoiced from entries where id = ${eid} and member_id = ${me.id} and deleted_at is null for update`;
    if (!current) throw new AppError("not_found");
    if (current.invoiced) throw new AppError("invoiced");
    await checkOpen(tx, me.id, current.day);
    await tx`update entries set note = ${text}, updated_at = now() where id = ${eid}`;
  });
}

// restoreEntries brings back the person's deleted entries ("Undo").
export async function restoreEntries(sql: Query, actor: Member | null, entryIds: unknown): Promise<number> {
  const me = own(actor);
  if (!Array.isArray(entryIds) || entryIds.length > 500) throw new AppError("invalid");
  const ids = entryIds.map(id);
  if (ids.length === 0) return 0;
  const restored = await transaction(sql, async tx => {
    await lockPerson(tx, me.id);
    const rows = await tx<{ id: string; day: string; project_id: string; task_id: string | null }[]>`
      select id::text, to_char(day, 'YYYY-MM-DD') as day, project_id::text, task_id::text from entries
      where id = any(${ids}::bigint[]) and member_id = ${me.id} and deleted_at is not null`;
    if (rows.length === 0) throw new AppError("not_found");
    for (const r of rows) await checkOpen(tx, me.id, r.day);
    await tx`update entries set deleted_at = null, updated_at = now() where id = any(${rows.map(r => r.id)}::bigint[])`;
    for (const r of rows) await keepRow(tx, me.id, mondayOf(r.day), r.project_id, r.task_id);
    for (const d of new Set(rows.map(r => r.day))) await checkDayTotal(tx, me.id, d);
    return rows;
  });
  await checkBudgets(sql, restored.map(r => r.project_id));
  return restored.length;
}

// Rows of the grid.
export async function addRow(sql: Query, actor: Member | null, input: { week: unknown; projectId: unknown; taskId: unknown }): Promise<void> {
  const me = own(actor);
  if (!isDay(input.week)) throw new AppError("invalid");
  const monday = mondayOf(input.week);
  const w = await writable(sql, me, input.projectId, input.taskId);
  const count = (await sql<{ count: number }[]>`select count(*)::int as count from week_rows where member_id = ${me.id} and week = ${monday}`)[0]!.count;
  if (count >= limits.rowsPerWeek) throw new AppError("too_many", { max: limits.rowsPerWeek });
  await sql`insert into week_rows (member_id, week, project_id, task_id) values (${me.id}, ${monday}, ${w.projectId}, ${w.taskId ?? 0}) on conflict do nothing`;
}

// removeRow takes a row out of a week, with its time that week; the ids of
// the entries it deleted let "Undo" bring them back.
export async function removeRow(sql: Query, actor: Member | null, input: { week: unknown; projectId: unknown; taskId: unknown }): Promise<string[]> {
  const me = own(actor);
  if (!isDay(input.week)) throw new AppError("invalid");
  const monday = mondayOf(input.week);
  const pid = id(input.projectId);
  const tid = optionalId(input.taskId);
  const ids = await transaction(sql, async tx => {
    await lockPerson(tx, me.id);
    const found = await tx<{ id: string; day: string; invoiced: boolean }[]>`
      select id::text, to_char(day, 'YYYY-MM-DD') as day, (invoiced_at is not null or handoff_id is not null) as invoiced from entries
      where member_id = ${me.id} and project_id = ${pid} and task_id is not distinct from ${tid}::bigint and day between ${monday} and ${addDays(monday, 6)} and deleted_at is null
      for update`;
    await weekLock(tx, me.id, monday);
    const s = await settings(tx, { share: true });
    if (found.some(e => isLocked(s, e.day))) throw new AppError("locked");
    if (found.some(e => e.invoiced)) throw new AppError("invoiced");
    if (found.length) await tx`update entries set deleted_at = now(), updated_at = now() where id = any(${found.map(e => e.id)}::bigint[])`;
    await tx`delete from week_rows where member_id = ${me.id} and week = ${monday} and project_id = ${pid} and task_id = ${tid ?? 0}`;
    return found.map(e => e.id);
  });
  if (ids.length) await checkBudgets(sql, [pid]);
  return ids;
}

// copyLastWeek puts in this week's grid the rows of the week before (its
// projects and tasks, not its hours), those still open to the person.
export async function copyLastWeek(sql: Query, actor: Member | null, weekOf: unknown): Promise<number> {
  const me = own(actor);
  if (!isDay(weekOf)) throw new AppError("invalid");
  const monday = mondayOf(weekOf);
  const before = await week(sql, me, addDays(monday, -7));
  const now = await week(sql, me, monday);
  let added = 0;
  for (const r of before.rows) {
    if (!r.writable || now.rows.some(x => x.projectId === r.projectId && x.taskId === r.taskId)) continue;
    if (now.rows.length + added >= limits.rowsPerWeek) break;
    await sql`insert into week_rows (member_id, week, project_id, task_id) values (${me.id}, ${monday}, ${r.projectId}, ${r.taskId ?? 0}) on conflict do nothing`;
    added++;
  }
  return added;
}

// weekMinutes: the person's total from Monday to that day.
export async function weekMinutes(sql: Query, memberId: string, day: string): Promise<number> {
  const [row] = await sql<{ total: string }[]>`
    select coalesce(sum(minutes), 0)::text as total from entries where member_id = ${memberId} and day between ${mondayOf(day)} and ${day} and deleted_at is null`;
  return numeric(row?.total);
}

// lastWork: the project and task of the person's latest entry, which the
// timer offers first.
export async function lastWork(sql: Query, actor: Member | null): Promise<{ projectId: string; taskId: string | null } | null> {
  const me = own(actor);
  const [r] = await sql<{ project_id: string; task_id: string | null }[]>`
    select project_id::text, task_id::text from entries where member_id = ${me.id} and deleted_at is null order by created_at desc, id desc limit 1`;
  return r ? { projectId: r.project_id, taskId: r.task_id } : null;
}
