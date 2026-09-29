import type { Member } from "@argentic/chest-sdk/member";
import { can, offered } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query } from "./db.ts";
import { today } from "./clock.ts";
import { bool, cents, clean, colors, day as checkDay, id, isColor, limits, memberIds, numeric, optionalId, type Color } from "./model.ts";
import { mirror, origin, revenueOf } from "./rates.ts";
import { isLocked, settings } from "./settings.ts";
import { transaction } from "./tx.ts";

// Clients, their projects and the projects' tasks; who may record time on
// each project; each project's budget and what it used. Managers change
// them; everyone reads the projects open to them (the pickers).

export type Task = { id: string; name: string; archived: boolean };
export type Budget = { kind: "none" } | { kind: "hours"; minutes: number } | { kind: "money"; cents: number };
export type Usage = { minutes: number; billableMinutes: number; cents: number };
export type Project = {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  color: Color;
  billable: boolean;
  rateCents: number | null;
  budget: Budget;
  everyone: boolean;
  people: string[];
  archived: boolean;
  tasks: Task[];
  used: Usage;
};
export type Client = { id: string; name: string; archived: boolean; projects: number };
// What a picker offers: an open project and its open tasks.
export type Offered = { id: string; name: string; clientName: string | null; color: Color; billable: boolean; tasks: { id: string; name: string }[] };

type ProjectRow = {
  id: string; name: string; client_id: string | null; client_name: string | null; color: string; billable: boolean; rate_cents: string | null;
  budget_kind: "none" | "hours" | "money"; budget_minutes: number | null; budget_cents: string | null; everyone: boolean; archived_at: Date | null;
};

// budgetShare: how much of the budget is used, 0.64 for 64 %; null without
// a budget.
export function budgetShare(p: Pick<Project, "budget" | "used">): number | null {
  if (p.budget.kind === "hours") return p.used.minutes / p.budget.minutes;
  if (p.budget.kind === "money") return p.used.cents / p.budget.cents;
  return null;
}

async function load(sql: Query, where: { archived?: boolean; ids?: string[] }): Promise<Project[]> {
  const rows = await sql<ProjectRow[]>`
    select p.id::text, p.name, p.client_id::text, c.name as client_name, p.color, p.billable,
      (select r.rate_cents from rates r where r.kind = 'bill' and r.project_id = p.id and r.member_id is null and r.from_day <= ${today()} order by r.from_day desc limit 1)::text as rate_cents,
      p.budget_kind, p.budget_minutes, p.budget_cents::text, p.everyone, p.archived_at
    from projects p left join clients c on c.id = p.client_id
    where ${where.ids ? sql`p.id = any(${where.ids}::bigint[])` : where.archived === undefined ? sql`true` : where.archived ? sql`p.archived_at is not null` : sql`p.archived_at is null`}
    order by lower(coalesce(c.name, '')), lower(p.name)
    limit ${limits.projects}`;
  if (rows.length === 0) return [];
  const ids = rows.map(r => r.id);
  const [tasks, people, used] = await Promise.all([
    sql<{ id: string; project_id: string; name: string; archived_at: Date | null }[]>`
      select id::text, project_id::text, name, archived_at from tasks where project_id = any(${ids}::bigint[]) order by archived_at nulls first, lower(name)`,
    sql<{ project_id: string; member_id: string }[]>`select project_id::text, member_id from project_people where project_id = any(${ids}::bigint[]) order by member_id`,
    sql<{ project_id: string; minutes: string; billable: string; cents: string }[]>`
      select e.project_id::text, sum(e.minutes)::text as minutes, coalesce(sum(e.minutes) filter (where e.billable), 0)::text as billable, ${revenueOf(sql)} as cents
      from entries e where e.deleted_at is null and e.project_id = any(${ids}::bigint[]) group by e.project_id`,
  ]);
  return rows.map(r => {
    const u = used.find(x => x.project_id === r.id);
    const rateCents = r.rate_cents === null ? null : Number(r.rate_cents);
    const billableMinutes = numeric(u?.billable);
    const budget: Budget = r.budget_kind === "hours" && r.budget_minutes ? { kind: "hours", minutes: r.budget_minutes } : r.budget_kind === "money" && r.budget_cents ? { kind: "money", cents: Number(r.budget_cents) } : { kind: "none" };
    return {
      id: r.id,
      name: r.name,
      clientId: r.client_id,
      clientName: r.client_name,
      color: isColor(r.color) ? r.color : "teal",
      billable: r.billable,
      rateCents,
      budget,
      everyone: r.everyone,
      people: people.filter(p => p.project_id === r.id).map(p => p.member_id),
      archived: r.archived_at !== null,
      tasks: tasks.filter(t => t.project_id === r.id).map(t => ({ id: t.id, name: t.name, archived: t.archived_at !== null })),
      used: { minutes: numeric(u?.minutes), billableMinutes, cents: Math.round(numeric(u?.cents)) },
    };
  });
}

// Every project, for managers: the open ones, or the archived ones.
export async function listProjects(sql: Query, actor: Member | null, options: { archived?: boolean } = {}): Promise<Project[]> {
  if (!can(actor, "projects.manage")) throw new AppError("forbidden");
  return load(sql, { archived: options.archived ?? false });
}

export async function project(sql: Query, actor: Member | null, projectId: unknown): Promise<Project> {
  if (!can(actor, "projects.manage")) throw new AppError("forbidden");
  const [p] = await load(sql, { ids: [id(projectId)] });
  if (!p) throw new AppError("not_found");
  return p;
}

// The projects a person may record time on, with their open tasks.
export async function offeredProjects(sql: Query, actor: Member | null): Promise<Offered[]> {
  if (!actor || !can(actor, "time.own")) throw new AppError("forbidden");
  const rows = await sql<{ id: string; name: string; client_name: string | null; color: string; billable: boolean; everyone: boolean; mine: boolean }[]>`
    select p.id::text, p.name, c.name as client_name, p.color, p.billable, p.everyone,
      exists (select 1 from project_people pp where pp.project_id = p.id and pp.member_id = ${actor.id}) as mine
    from projects p left join clients c on c.id = p.client_id
    where p.archived_at is null
    order by lower(coalesce(c.name, '')), lower(p.name)
    limit ${limits.projects}`;
  const open = rows.filter(r => offered(actor, { archived: false, everyone: r.everyone, people: r.mine ? [actor.id] : [] }));
  if (open.length === 0) return [];
  const tasks = await sql<{ id: string; project_id: string; name: string }[]>`
    select id::text, project_id::text, name from tasks where archived_at is null and project_id = any(${open.map(r => r.id)}::bigint[]) order by lower(name)`;
  return open.map(r => ({
    id: r.id, name: r.name, clientName: r.client_name, color: isColor(r.color) ? r.color : "teal", billable: r.billable,
    tasks: tasks.filter(t => t.project_id === r.id).map(t => ({ id: t.id, name: t.name })),
  }));
}

// writable checks that a person may record time on that project and task
// now (open to them, not archived; the task theirs and open) and gives the
// project's billable default.
export async function writable(sql: Query, actor: Member, projectId: unknown, taskId: unknown): Promise<{ projectId: string; taskId: string | null; billable: boolean }> {
  const pid = id(projectId);
  const tid = optionalId(taskId);
  const [p] = await sql<{ billable: boolean; everyone: boolean; archived: boolean; mine: boolean }[]>`
    select billable, everyone, archived_at is not null as archived,
      exists (select 1 from project_people pp where pp.project_id = p.id and pp.member_id = ${actor.id}) as mine
    from projects p where id = ${pid}`;
  if (!p) throw new AppError("not_found");
  if (!offered(actor, { archived: p.archived, everyone: p.everyone, people: p.mine ? [actor.id] : [] })) throw new AppError("not_offered");
  if (tid !== null) {
    const [t] = await sql<{ archived: boolean }[]>`select archived_at is not null as archived from tasks where id = ${tid} and project_id = ${pid}`;
    if (!t) throw new AppError("not_found");
    if (t.archived) throw new AppError("not_offered");
  }
  return { projectId: pid, taskId: tid, billable: p.billable };
}

// Clients.
export async function listClients(sql: Query, actor: Member | null): Promise<Client[]> {
  if (!can(actor, "projects.manage")) throw new AppError("forbidden");
  const rows = await sql<{ id: string; name: string; archived_at: Date | null; projects: number }[]>`
    select c.id::text, c.name, c.archived_at, (select count(*)::int from projects p where p.client_id = c.id and p.archived_at is null) as projects
    from clients c order by c.archived_at nulls first, lower(c.name) limit ${limits.clients}`;
  return rows.map(r => ({ id: r.id, name: r.name, archived: r.archived_at !== null, projects: r.projects }));
}

async function insertClient(sql: Query, name: string): Promise<string> {
  const [existing] = await sql<{ id: string }[]>`select id::text from clients where lower(name) = lower(${name})`;
  if (existing) throw new AppError("duplicate");
  const count = (await sql<{ count: number }[]>`select count(*)::int as count from clients`)[0]!.count;
  if (count >= limits.clients) throw new AppError("too_many", { max: limits.clients });
  const [row] = await sql<{ id: string }[]>`insert into clients (name) values (${name}) returning id::text`;
  return row!.id;
}

export async function createClient(sql: Query, actor: Member | null, name: unknown): Promise<Client> {
  if (!can(actor, "projects.manage")) throw new AppError("forbidden");
  const text = clean(name, limits.clientName);
  const clientId = await insertClient(sql, text);
  return { id: clientId, name: text, archived: false, projects: 0 };
}

export async function renameClient(sql: Query, actor: Member | null, clientId: unknown, name: unknown): Promise<void> {
  if (!can(actor, "projects.manage")) throw new AppError("forbidden");
  const cid = id(clientId);
  const text = clean(name, limits.clientName);
  const [other] = await sql<{ id: string }[]>`select id::text from clients where lower(name) = lower(${text}) and id <> ${cid}`;
  if (other) throw new AppError("duplicate");
  const done = await sql`update clients set name = ${text} where id = ${cid}`;
  if (done.count === 0) throw new AppError("not_found");
}

// An archived client is no longer offered for new projects; its projects
// stay as they are.
export async function archiveClient(sql: Query, actor: Member | null, clientId: unknown, archived: unknown): Promise<void> {
  if (!can(actor, "projects.manage")) throw new AppError("forbidden");
  const done = bool(archived)
    ? await sql`update clients set archived_at = coalesce(archived_at, now()) where id = ${id(clientId)}`
    : await sql`update clients set archived_at = null where id = ${id(clientId)}`;
  if (done.count === 0) throw new AppError("not_found");
}

// Projects.
export type ProjectInput = {
  name: unknown;
  clientId?: unknown;
  newClient?: unknown;
  color?: unknown;
  billable?: unknown;
  rateCents?: unknown;
  // The day a changed rate applies from (today when not said; since the
  // start for a project without time yet).
  rateFrom?: unknown;
  budget?: unknown;
  everyone?: unknown;
  people?: unknown;
  tasks?: unknown;
};

type Clean = { name: string; clientId: string | null; newClient: string | null; color: Color; billable: boolean; rateCents: number | null; budget: Budget; everyone: boolean; people: string[] };

function readBudget(value: unknown): Budget {
  if (value === undefined || value === null) return { kind: "none" };
  if (typeof value !== "object") throw new AppError("invalid");
  const b = value as { kind?: unknown; minutes?: unknown; cents?: unknown };
  if (b.kind === "none") return { kind: "none" };
  if (b.kind === "hours") {
    if (typeof b.minutes !== "number" || !Number.isInteger(b.minutes) || b.minutes < 1 || b.minutes > limits.budgetMinutes) throw new AppError("invalid");
    return { kind: "hours", minutes: b.minutes };
  }
  if (b.kind === "money") {
    const c = cents(b.cents, limits.budgetCents);
    if (c === null || c < 1) throw new AppError("invalid");
    return { kind: "money", cents: c };
  }
  throw new AppError("invalid");
}

function readProject(input: ProjectInput): Clean {
  if (!input || typeof input !== "object") throw new AppError("invalid");
  const newClient = input.newClient === undefined || input.newClient === null || input.newClient === "" ? null : clean(input.newClient, limits.clientName);
  const color = input.color === undefined ? "teal" : input.color;
  if (!isColor(color)) throw new AppError("invalid");
  return {
    name: clean(input.name, limits.projectName),
    clientId: newClient ? null : optionalId(input.clientId),
    newClient,
    color,
    billable: input.billable === undefined ? true : bool(input.billable),
    rateCents: cents(input.rateCents, limits.rateCents),
    budget: readBudget(input.budget),
    everyone: input.everyone === undefined ? true : bool(input.everyone),
    people: input.people === undefined ? [] : memberIds(input.people, limits.projectPeople),
  };
}

function taskNames(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new AppError("invalid");
  const names: string[] = [];
  for (const v of value) {
    const name = clean(v, limits.taskName, { optional: true });
    if (name && !names.some(n => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  if (names.length > limits.tasksPerProject) throw new AppError("too_many", { max: limits.tasksPerProject });
  return names;
}

async function checkClient(sql: Query, clientId: string | null): Promise<void> {
  if (clientId === null) return;
  const [c] = await sql`select 1 from clients where id = ${clientId}`;
  if (!c) throw new AppError("not_found");
}

async function nameTaken(sql: Query, clientId: string | null, name: string, except: string | null): Promise<boolean> {
  const rows = await sql`select 1 from projects where coalesce(client_id, 0) = ${clientId ?? 0} and lower(name) = lower(${name}) and id <> ${except ?? 0}`;
  return rows.length > 0;
}

export async function createProject(sql: Query, actor: Member | null, input: ProjectInput): Promise<Project> {
  if (!can(actor, "projects.manage")) throw new AppError("forbidden");
  const p = readProject(input);
  const tasks = taskNames(input.tasks);
  const newId = await transaction(sql, async tx => {
    const count = (await tx<{ count: number }[]>`select count(*)::int as count from projects`)[0]!.count;
    if (count >= limits.projects) throw new AppError("too_many", { max: limits.projects });
    const clientId = p.newClient ? await insertClient(tx, p.newClient) : p.clientId;
    await checkClient(tx, clientId);
    if (await nameTaken(tx, clientId, p.name, null)) throw new AppError("duplicate");
    const [row] = await tx<{ id: string }[]>`
      insert into projects (client_id, name, color, billable, rate_cents, budget_kind, budget_minutes, budget_cents, everyone)
      values (${clientId}, ${p.name}, ${p.color}, ${p.billable}, ${p.rateCents}, ${p.budget.kind},
        ${p.budget.kind === "hours" ? p.budget.minutes : null}, ${p.budget.kind === "money" ? p.budget.cents : null}, ${p.everyone})
      returning id::text`;
    if (p.rateCents !== null) await tx`insert into rates (kind, project_id, from_day, rate_cents, set_by) values ('bill', ${row!.id}, ${origin}, ${p.rateCents}, ${actor!.id})`;
    for (const name of tasks) await tx`insert into tasks (project_id, name) values (${row!.id}, ${name})`;
    for (const person of p.people) await tx`insert into project_people (project_id, member_id) values (${row!.id}, ${person}) on conflict do nothing`;
    return row!.id;
  });
  return project(sql, actor, newId);
}

export async function updateProject(sql: Query, actor: Member | null, projectId: unknown, input: ProjectInput): Promise<Project> {
  if (!can(actor, "projects.manage")) throw new AppError("forbidden");
  const pid = id(projectId);
  const p = readProject(input);
  await transaction(sql, async tx => {
    const [current] = await tx`select 1 from projects where id = ${pid} for update`;
    if (!current) throw new AppError("not_found");
    const clientId = p.newClient ? await insertClient(tx, p.newClient) : p.clientId;
    await checkClient(tx, clientId);
    if (await nameTaken(tx, clientId, p.name, pid)) throw new AppError("duplicate");
    await changeRate(tx, actor!, pid, p.rateCents, input.rateFrom);
    await tx`
      update projects set client_id = ${clientId}, name = ${p.name}, color = ${p.color}, billable = ${p.billable},
        budget_kind = ${p.budget.kind}, budget_minutes = ${p.budget.kind === "hours" ? p.budget.minutes : null}, budget_cents = ${p.budget.kind === "money" ? p.budget.cents : null},
        everyone = ${p.everyone}
      where id = ${pid}`;
    await tx`delete from project_people where project_id = ${pid} and member_id <> all(${p.people}::text[])`;
    for (const person of p.people) await tx`insert into project_people (project_id, member_id) values (${pid}, ${person}) on conflict do nothing`;
  });
  return project(sql, actor, pid);
}

// changeRate: the project's rate from a day on, when it changed. The time
// before that day keeps the rate it had. Without a day: since the start
// when the project has no time yet, today otherwise. Never in the locked
// period.
async function changeRate(tx: Query, actor: Member, projectId: string, rateCents: number | null, from: unknown): Promise<void> {
  const now = today();
  const [current] = await tx<{ rate_cents: string | null }[]>`
    select rate_cents::text from rates where kind = 'bill' and project_id = ${projectId} and member_id is null and from_day <= ${now} order by from_day desc limit 1`;
  const before = current?.rate_cents === null || current === undefined ? null : Number(current.rate_cents);
  if (before === rateCents) return;
  let day: string;
  if (from === undefined || from === null || from === "") {
    const [any] = await tx`select 1 from entries where project_id = ${projectId} and deleted_at is null limit 1`;
    day = any ? now : origin;
  } else day = from === origin ? origin : checkDay(from, now);
  if (isLocked(await settings(tx), day)) throw new AppError("rate_locked");
  await tx`
    insert into rates (kind, project_id, from_day, rate_cents, set_by) values ('bill', ${projectId}, ${day}, ${rateCents}, ${actor.id})
    on conflict (kind, coalesce(project_id, 0), coalesce(member_id, ''), from_day) do update set rate_cents = excluded.rate_cents, set_by = excluded.set_by, set_at = now()`;
  // A later step would hide the new rate: the new one wins from its day on.
  await tx`delete from rates where kind = 'bill' and project_id = ${projectId} and member_id is null and from_day > ${day}`;
  await mirror(tx, projectId);
}

// An archived project is no longer offered; its time stays in the reports.
export async function archiveProject(sql: Query, actor: Member | null, projectId: unknown, archived: unknown): Promise<void> {
  if (!can(actor, "projects.manage")) throw new AppError("forbidden");
  const pid = id(projectId);
  const done = bool(archived)
    ? await sql`update projects set archived_at = coalesce(archived_at, now()) where id = ${pid}`
    : await sql`update projects set archived_at = null where id = ${pid}`;
  if (done.count === 0) throw new AppError("not_found");
}

// Tasks.
export async function addTask(sql: Query, actor: Member | null, projectId: unknown, name: unknown): Promise<Task> {
  if (!can(actor, "projects.manage")) throw new AppError("forbidden");
  const pid = id(projectId);
  const text = clean(name, limits.taskName);
  return transaction(sql, async tx => {
    const [p] = await tx`select 1 from projects where id = ${pid} for update`;
    if (!p) throw new AppError("not_found");
    const count = (await tx<{ count: number }[]>`select count(*)::int as count from tasks where project_id = ${pid}`)[0]!.count;
    if (count >= limits.tasksPerProject) throw new AppError("too_many", { max: limits.tasksPerProject });
    const [same] = await tx`select 1 from tasks where project_id = ${pid} and lower(name) = lower(${text})`;
    if (same) throw new AppError("duplicate");
    const [row] = await tx<{ id: string }[]>`insert into tasks (project_id, name) values (${pid}, ${text}) returning id::text`;
    return { id: row!.id, name: text, archived: false };
  });
}

export async function renameTask(sql: Query, actor: Member | null, taskId: unknown, name: unknown): Promise<void> {
  if (!can(actor, "projects.manage")) throw new AppError("forbidden");
  const tid = id(taskId);
  const text = clean(name, limits.taskName);
  const [t] = await sql<{ project_id: string }[]>`select project_id::text from tasks where id = ${tid}`;
  if (!t) throw new AppError("not_found");
  const [same] = await sql`select 1 from tasks where project_id = ${t.project_id} and lower(name) = lower(${text}) and id <> ${tid}`;
  if (same) throw new AppError("duplicate");
  await sql`update tasks set name = ${text} where id = ${tid}`;
}

export async function archiveTask(sql: Query, actor: Member | null, taskId: unknown, archived: unknown): Promise<void> {
  if (!can(actor, "projects.manage")) throw new AppError("forbidden");
  const done = bool(archived)
    ? await sql`update tasks set archived_at = coalesce(archived_at, now()) where id = ${id(taskId)}`
    : await sql`update tasks set archived_at = null where id = ${id(taskId)}`;
  if (done.count === 0) throw new AppError("not_found");
}

// The example of an empty tool: one client, one project, its tasks, in the
// words of the manager's language (the page gives them).
export async function example(sql: Query, actor: Member | null, words: { client: string; project: string; tasks: readonly string[] }): Promise<Project> {
  if (!can(actor, "projects.manage")) throw new AppError("forbidden");
  const [existing] = await sql<{ id: string }[]>`select id::text from clients where lower(name) = lower(${words.client})`;
  return createProject(sql, actor, {
    name: words.project,
    ...(existing ? { clientId: existing.id } : { newClient: words.client }),
    color: colors[0],
    billable: true,
    rateCents: 8000,
    budget: { kind: "hours", minutes: 40 * 60 },
    tasks: [...words.tasks],
  });
}

export { transaction } from "./tx.ts";
