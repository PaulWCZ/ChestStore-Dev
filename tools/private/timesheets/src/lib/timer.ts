import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { clock, zone } from "./clock.ts";
import type { Query } from "./db.ts";
import { wall } from "../shared/days.ts";
import { checkDayTotal, type Entry } from "./entries.ts";
import { clean, id, isColor, limits, optionalId, type Color } from "../shared/model.ts";
import { writable } from "./projects.ts";
import { transaction } from "./tx.ts";
import { checkBudgets } from "./budgets.ts";
import { isLocked, settings } from "./settings.ts";
import { weekLock } from "./weeks.ts";

// The one running timer of each person, kept on the server (its start
// instant): it survives a reload, a closed tab, another device. Stopping it
// turns it into an entry of the day it started (in the Chest's time zone).
// A timer left running more than 10 hours is "forgotten": the page asks
// when it really stopped.

export type Timer = {
  projectId: string;
  taskId: string | null;
  note: string;
  startedAt: string;
  projectName: string;
  clientName: string | null;
  color: Color;
  taskName: string | null;
  billable: boolean;
};

function own(actor: Member | null): Member {
  if (!actor || !can(actor, "time.own")) throw new AppError("forbidden");
  return actor;
}

export function isForgotten(timer: Pick<Timer, "startedAt">, now: Date = clock.now()): boolean {
  return now.getTime() - Date.parse(timer.startedAt) > limits.forgottenHours * 3600_000;
}

export async function timer(sql: Query, actor: Member | null): Promise<Timer | null> {
  const me = own(actor);
  const [r] = await sql<{ project_id: string; task_id: string | null; note: string; started_at: Date; project_name: string; client_name: string | null; color: string; task_name: string | null; billable: boolean }[]>`
    select t.project_id::text, t.task_id::text, t.note, t.started_at, p.name as project_name, c.name as client_name, p.color, k.name as task_name, p.billable
    from timers t join projects p on p.id = t.project_id left join clients c on c.id = p.client_id left join tasks k on k.id = t.task_id
    where t.member_id = ${me.id}`;
  if (!r) return null;
  return {
    projectId: r.project_id, taskId: r.task_id, note: r.note, startedAt: new Date(r.started_at).toISOString(),
    projectName: r.project_name, clientName: r.client_name, color: isColor(r.color) ? r.color : "teal", taskName: r.task_name, billable: r.billable,
  };
}

async function lockPerson(tx: Query, memberId: string): Promise<void> {
  await tx`select pg_advisory_xact_lock(hashtext(${"timesheets:" + memberId}))`;
}

type Running = { project_id: string; task_id: string | null; note: string; started_at: Date; billable: boolean };

// close turns the running timer into an entry ending at `end`; under a
// minute, nothing is recorded. The caller holds the person's lock.
async function close(tx: Query, memberId: string, running: Running, end: Date): Promise<Entry | null> {
  const started = new Date(running.started_at);
  const minutes = Math.round((end.getTime() - started.getTime()) / 60000);
  if (end.getTime() <= started.getTime()) throw new AppError("invalid");
  if (minutes > 1440) throw new AppError("timer_too_long");
  await tx`delete from timers where member_id = ${memberId}`;
  if (minutes < 1) return null;
  const day = wall(started, zone()).day;
  if (isLocked(await settings(tx, { share: true }), day)) throw new AppError("locked");
  await weekLock(tx, memberId, day);
  const [row] = await tx<{ id: string }[]>`
    insert into entries (member_id, project_id, task_id, day, minutes, note, billable, started_at, ended_at, source)
    values (${memberId}, ${running.project_id}, ${running.task_id}, ${day}, ${minutes}, ${running.note}, ${running.billable}, ${started}, ${end}, 'timer')
    returning id::text`;
  await checkDayTotal(tx, memberId, day);
  return {
    id: row!.id, projectId: running.project_id, taskId: running.task_id, day, minutes, note: running.note, billable: running.billable,
    startedAt: started.toISOString(), endedAt: end.toISOString(), source: "timer", invoiced: false,
  };
}

async function running(tx: Query, memberId: string): Promise<Running | null> {
  const [r] = await tx<Running[]>`
    select t.project_id::text, t.task_id::text, t.note, t.started_at, p.billable from timers t join projects p on p.id = t.project_id where t.member_id = ${memberId}`;
  return r ?? null;
}

// startTimer starts the person's timer now. A timer already running is
// stopped first and becomes an entry (unless it was forgotten: that one
// must be settled first).
export async function startTimer(sql: Query, actor: Member | null, input: { projectId: unknown; taskId?: unknown; note?: unknown }): Promise<{ stopped: Entry | null }> {
  const me = own(actor);
  const note = clean(input.note ?? "", limits.note, { optional: true });
  const now = clock.now();
  const result = await transaction(sql, async tx => {
    await lockPerson(tx, me.id);
    const w = await writable(tx, me, input.projectId, input.taskId);
    // Its time would land in a week sent for approval or approved.
    await weekLock(tx, me.id, wall(now, zone()).day);
    const before = await running(tx, me.id);
    let stopped: Entry | null = null;
    if (before) {
      if (isForgotten({ startedAt: new Date(before.started_at).toISOString() }, now)) throw new AppError("timer_too_long");
      stopped = await close(tx, me.id, before, now);
    }
    await tx`insert into timers (member_id, project_id, task_id, note, started_at) values (${me.id}, ${w.projectId}, ${w.taskId}, ${note}, ${now})`;
    return { stopped };
  });
  if (result.stopped) await checkBudgets(sql, [result.stopped.projectId]);
  return result;
}

// updateTimer changes what the running timer is for (project, task, note).
export async function updateTimer(sql: Query, actor: Member | null, input: { projectId?: unknown; taskId?: unknown; note?: unknown }): Promise<void> {
  const me = own(actor);
  await transaction(sql, async tx => {
    await lockPerson(tx, me.id);
    const now = await running(tx, me.id);
    if (!now) throw new AppError("no_timer");
    const note = input.note === undefined ? now.note : clean(input.note, limits.note, { optional: true });
    let projectId = now.project_id, taskId = now.task_id;
    if (input.projectId !== undefined) {
      const w = await writable(tx, me, input.projectId, input.taskId);
      projectId = w.projectId;
      taskId = w.taskId;
    }
    await tx`update timers set project_id = ${projectId}, task_id = ${taskId}, note = ${note} where member_id = ${me.id}`;
  });
}

// stopTimer stops the timer now, or at the time the person says it really
// stopped (a forgotten timer): after its start, not in the future, a day
// at most. Under a minute nothing is recorded; the answer then gives the
// day, so that the page may offer to keep one minute.
export async function stopTimer(sql: Query, actor: Member | null, at?: unknown): Promise<{ entry: Entry | null; day: string }> {
  const me = own(actor);
  const now = clock.now();
  let end = now;
  if (at !== undefined && at !== null) {
    if (typeof at !== "string" || Number.isNaN(Date.parse(at))) throw new AppError("invalid");
    end = new Date(at);
    if (end.getTime() > now.getTime() + 60_000) throw new AppError("invalid");
  }
  const result = await transaction(sql, async tx => {
    await lockPerson(tx, me.id);
    const now2 = await running(tx, me.id);
    if (!now2) throw new AppError("no_timer");
    return { entry: await close(tx, me.id, now2, end), day: wall(new Date(now2.started_at), zone()).day };
  });
  if (result.entry) await checkBudgets(sql, [result.entry.projectId]);
  return result;
}

// discardTimer throws the running timer away; what it gives back lets
// "Undo" start it again as it was.
export type Discarded = { projectId: string; taskId: string | null; note: string; startedAt: string };

export async function discardTimer(sql: Query, actor: Member | null): Promise<Discarded> {
  const me = own(actor);
  const [r] = await sql<{ project_id: string; task_id: string | null; note: string; started_at: Date }[]>`
    delete from timers where member_id = ${me.id} returning project_id::text, task_id::text, note, started_at`;
  if (!r) throw new AppError("no_timer");
  return { projectId: r.project_id, taskId: r.task_id, note: r.note, startedAt: new Date(r.started_at).toISOString() };
}

export async function restoreTimer(sql: Query, actor: Member | null, input: { projectId: unknown; taskId?: unknown; note?: unknown; startedAt: unknown }): Promise<void> {
  const me = own(actor);
  const note = clean(input.note ?? "", limits.note, { optional: true });
  if (typeof input.startedAt !== "string" || Number.isNaN(Date.parse(input.startedAt))) throw new AppError("invalid");
  const started = new Date(input.startedAt);
  const now = clock.now();
  if (started.getTime() > now.getTime() || now.getTime() - started.getTime() > 7 * 86400_000) throw new AppError("invalid");
  id(input.projectId);
  optionalId(input.taskId);
  await transaction(sql, async tx => {
    await lockPerson(tx, me.id);
    const w = await writable(tx, me, input.projectId, input.taskId);
    if (await running(tx, me.id)) throw new AppError("invalid");
    await tx`insert into timers (member_id, project_id, task_id, note, started_at) values (${me.id}, ${w.projectId}, ${w.taskId}, ${note}, ${started})`;
  });
}

// stopForLeaver: a person who left or lost access. Their timer becomes an
// entry when it is a plausible one (under 10 hours, in an open day);
// otherwise it was forgotten and is dropped.
export async function stopForLeaver(tx: Query, memberId: string): Promise<void> {
  const now = await running(tx, memberId);
  if (!now) return;
  const end = clock.now();
  const started = new Date(now.started_at);
  const minutes = Math.round((end.getTime() - started.getTime()) / 60000);
  const day = wall(started, zone()).day;
  const [row] = await tx<{ total: string }[]>`select coalesce(sum(minutes), 0)::text as total from entries where member_id = ${memberId} and day = ${day} and deleted_at is null`;
  const [closed] = await tx`select 1 from weeks where member_id = ${memberId} and week = date_trunc('week', ${day}::date)::date and status in ('submitted', 'approved')`;
  const fits = Number(row?.total ?? 0) + minutes <= 1440 && !isLocked(await settings(tx, { share: true }), day) && !closed;
  if (isForgotten({ startedAt: started.toISOString() }, end) || !fits || minutes < 1) {
    await tx`delete from timers where member_id = ${memberId}`;
    return;
  }
  await close(tx, memberId, now, end);
}
