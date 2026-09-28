import { createHash } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { today, zone } from "./clock.ts";
import type { Query, Sql } from "./db.ts";
import { instantOf } from "./days.ts";
import { fold, foldText, parseExport, type DateOrder, type Imported, type Source } from "./import-formats.ts";
import { colors, limits, numeric } from "./model.ts";
import { isLocked, settings } from "./settings.ts";

// Moving in from Toggl Track, Clockify or Harvest: their detailed CSV
// export is read (lib/import-formats.ts), matched to the Chest's people by
// full name and to the clients, projects and tasks here by name, shown to
// the manager (planImport), then written in one transaction (runImport),
// creating the clients, projects and tasks it needs. Each row has a
// fingerprint: importing the same file again adds nothing.

export type Person = { id: string; name: string };
export type ImportOptions = { order?: DateOrder; people: Person[]; noProject: string };
export type ImportPlan = {
  source: Source;
  rows: number;
  ready: number;
  minutes: number;
  from: string | null;
  to: string | null;
  people: { name: string; memberId: string | null; rows: number }[];
  newClients: string[];
  newProjects: { client: string | null; name: string }[];
  newTasks: number;
  skipped: { person: number; locked: number; duplicate: number; invalid: number; dayFull: number };
  dates: { ambiguous: boolean; order: DateOrder };
};

type Ready = Imported & { memberId: string; project: string; key: string };
type Work = { plan: ImportPlan; ready: Ready[] };

function fingerprint(source: Source, memberId: string, r: Imported, occurrence: number): string {
  return createHash("sha256").update([source, memberId, r.day, r.start ?? "", r.minutes, foldText(r.client), foldText(r.project), foldText(r.task), r.note, occurrence].join("\u001f")).digest("base64url");
}

function matcher(people: Person[]): (name: string) => string | null {
  const byName = new Map<string, string | null>();
  for (const p of people) {
    const k = fold(p.name);
    if (!k) continue;
    byName.set(k, byName.has(k) ? null : p.id);
  }
  return name => byName.get(fold(name)) ?? null;
}

async function prepare(sql: Query, actor: Member | null, text: unknown, options: ImportOptions): Promise<Work> {
  if (!can(actor, "import")) throw new AppError("forbidden");
  if (typeof text !== "string") throw new AppError("import_invalid");
  const parsed = parseExport(text, options.order ? { order: options.order } : {});
  const match = matcher(options.people);
  const s = await settings(sql);
  const latest = String(Number(today().slice(0, 4)) + 1) + today().slice(4);
  const skipped = { person: 0, locked: 0, duplicate: 0, invalid: parsed.invalid.length, dayFull: 0 };
  const people = new Map<string, { name: string; memberId: string | null; rows: number }>();
  const candidates: Ready[] = [];
  const seen = new Map<string, number>();
  for (const r of parsed.rows) {
    const memberId = match(r.person);
    const p = people.get(r.person) ?? { name: r.person, memberId, rows: 0 };
    p.rows++;
    people.set(r.person, p);
    if (!memberId) { skipped.person++; continue; }
    if (r.day < "2000-01-01" || r.day > latest) { skipped.invalid++; continue; }
    if (isLocked(s, r.day)) { skipped.locked++; continue; }
    const row = { ...r, project: r.project || options.noProject };
    const base = fingerprint(parsed.source, memberId, row, 0);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    candidates.push({ ...row, memberId, key: occurrence === 0 ? base : fingerprint(parsed.source, memberId, row, occurrence) });
  }
  // Already imported.
  const known = new Set<string>();
  for (let i = 0; i < candidates.length; i += 1000) {
    const keys = candidates.slice(i, i + 1000).map(c => c.key);
    for (const r of await sql<{ import_key: string }[]>`select import_key from entries where import_key = any(${keys}::text[])`) known.add(r.import_key);
  }
  const fresh = candidates.filter(c => {
    if (known.has(c.key)) { skipped.duplicate++; return false; }
    return true;
  });
  // A day holds 24 hours: what is there already, plus what comes.
  const ready: Ready[] = [];
  if (fresh.length) {
    const days = fresh.map(c => c.day).sort();
    const sums = await sql<{ member_id: string; day: string; total: string }[]>`
      select member_id, to_char(day, 'YYYY-MM-DD') as day, sum(minutes)::text as total from entries
      where deleted_at is null and member_id = any(${[...new Set(fresh.map(c => c.memberId))]}::text[]) and day between ${days[0]!} and ${days.at(-1)!}
      group by member_id, day`;
    const totals = new Map(sums.map(r => [`${r.member_id}|${r.day}`, numeric(r.total)]));
    for (const c of fresh) {
      const k = `${c.memberId}|${c.day}`;
      const next = (totals.get(k) ?? 0) + c.minutes;
      if (next > 1440) { skipped.dayFull++; continue; }
      totals.set(k, next);
      ready.push(c);
    }
  }
  // What will be created.
  const [clients, projects, tasks] = await Promise.all([
    sql<{ id: string; name: string }[]>`select id::text, name from clients`,
    sql<{ id: string; name: string; client_id: string | null }[]>`select id::text, name, client_id::text from projects`,
    sql<{ project_id: string; name: string }[]>`select project_id::text, name from tasks`,
  ]);
  const clientKeys = new Set(clients.map(c => foldText(c.name)));
  const newClients = new Map<string, string>();
  const projectKey = (client: string, name: string) => `${foldText(client)}|${foldText(name)}`;
  const existingProjects = new Set(projects.map(p => projectKey(clients.find(c => c.id === p.client_id)?.name ?? "", p.name)));
  const newProjects = new Map<string, { client: string | null; name: string }>();
  const taskKeys = new Set(tasks.map(t => {
    const p = projects.find(x => x.id === t.project_id);
    return `${projectKey(clients.find(c => c.id === p?.client_id)?.name ?? "", p?.name ?? "")}|${foldText(t.name)}`;
  }));
  const newTasks = new Set<string>();
  for (const r of ready) {
    if (r.client && !clientKeys.has(foldText(r.client)) && !newClients.has(foldText(r.client))) newClients.set(foldText(r.client), r.client);
    const pk = projectKey(r.client, r.project);
    if (!existingProjects.has(pk) && !newProjects.has(pk)) newProjects.set(pk, { client: r.client || null, name: r.project });
    if (r.task && !taskKeys.has(`${pk}|${foldText(r.task)}`)) newTasks.add(`${pk}|${foldText(r.task)}`);
  }
  const sorted = ready.map(r => r.day).sort();
  return {
    ready,
    plan: {
      source: parsed.source,
      rows: parsed.rows.length + parsed.invalid.length,
      ready: ready.length,
      minutes: ready.reduce((n, r) => n + r.minutes, 0),
      from: sorted[0] ?? null,
      to: sorted.at(-1) ?? null,
      people: [...people.values()].sort((a, b) => Number(a.memberId !== null) - Number(b.memberId !== null) || b.rows - a.rows),
      newClients: [...newClients.values()],
      newProjects: [...newProjects.values()],
      newTasks: newTasks.size,
      skipped,
      dates: parsed.dates,
    },
  };
}

export async function planImport(sql: Query, actor: Member | null, text: unknown, options: ImportOptions): Promise<ImportPlan> {
  return (await prepare(sql, actor, text, options)).plan;
}

// runImport writes what the plan showed, in one transaction; says how many
// entries came.
export async function runImport(sql: Sql, actor: Member | null, text: unknown, options: ImportOptions): Promise<{ imported: number; plan: ImportPlan }> {
  const { plan, ready } = await prepare(sql, actor, text, options);
  if (ready.length === 0) return { imported: 0, plan };
  const zoneName = zone();
  const imported = await sql.begin(async tx => {
    const clients = new Map((await tx<{ id: string; name: string }[]>`select id::text, name from clients`).map(c => [foldText(c.name), c.id]));
    const projects = new Map<string, { id: string; billable: boolean }>();
    for (const p of await tx<{ id: string; name: string; client_id: string | null; billable: boolean }[]>`select id::text, name, client_id::text, billable from projects`) {
      projects.set(`${p.client_id ?? ""}|${foldText(p.name)}`, { id: p.id, billable: p.billable });
    }
    const tasks = new Map((await tx<{ id: string; project_id: string; name: string }[]>`select id::text, project_id::text, name from tasks`).map(t => [`${t.project_id}|${foldText(t.name)}`, t.id]));
    let colorIndex = (await tx<{ n: number }[]>`select count(*)::int as n from projects`)[0]!.n;
    // Billable by default when most of the project's rows are.
    const votes = new Map<string, number>();
    for (const r of ready) votes.set(`${foldText(r.client)}|${foldText(r.project)}`, (votes.get(`${foldText(r.client)}|${foldText(r.project)}`) ?? 0) + (r.billable === false ? -1 : 1));
    const values: Record<string, unknown>[] = [];
    for (const r of ready) {
      let clientId: string | null = null;
      if (r.client) {
        clientId = clients.get(foldText(r.client)) ?? null;
        if (!clientId) {
          clientId = (await tx<{ id: string }[]>`insert into clients (name) values (${r.client}) returning id::text`)[0]!.id;
          clients.set(foldText(r.client), clientId);
        }
      }
      const pk = `${clientId ?? ""}|${foldText(r.project)}`;
      let p = projects.get(pk);
      if (!p) {
        if (projects.size >= limits.projects) throw new AppError("too_many", { max: limits.projects });
        const billable = (votes.get(`${foldText(r.client)}|${foldText(r.project)}`) ?? 1) >= 0;
        const color = colors[colorIndex++ % colors.length]!;
        p = { id: (await tx<{ id: string }[]>`insert into projects (client_id, name, color, billable) values (${clientId}, ${r.project}, ${color}, ${billable}) returning id::text`)[0]!.id, billable };
        projects.set(pk, p);
      }
      let taskId: string | null = null;
      if (r.task) {
        taskId = tasks.get(`${p.id}|${foldText(r.task)}`) ?? null;
        if (!taskId) {
          taskId = (await tx<{ id: string }[]>`insert into tasks (project_id, name) values (${p.id}, ${r.task}) returning id::text`)[0]!.id;
          tasks.set(`${p.id}|${foldText(r.task)}`, taskId);
        }
      }
      const started = r.start === null ? null : instantOf(r.day, r.start, zoneName);
      values.push({
        member_id: r.memberId, project_id: p.id, task_id: taskId, day: r.day, minutes: r.minutes, note: r.note,
        billable: p.billable && r.billable !== false,
        started_at: started, ended_at: started ? new Date(started.getTime() + r.minutes * 60000) : null,
        source: "import", import_key: r.key,
      });
    }
    let count = 0;
    for (let i = 0; i < values.length; i += 500) {
      const chunk = values.slice(i, i + 500);
      const done = await tx`insert into entries ${tx(chunk, "member_id", "project_id", "task_id", "day", "minutes", "note", "billable", "started_at", "ended_at", "source", "import_key")} on conflict do nothing returning id`;
      count += done.length;
    }
    return count;
  });
  return { imported, plan };
}
