import { createHash } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { checkBudgets } from "./budgets.ts";
import { currency as chestCurrency, today, zone } from "./clock.ts";
import type { Query, Sql } from "./db.ts";
import { instantOf, mondayOf } from "../shared/days.ts";
import { fold, foldText, parseExport, type DateOrder, type Imported, type Source } from "../shared/import-formats.ts";
import { colors, limits, numeric } from "../shared/model.ts";
import { fixRates } from "./rates.ts";
import { isLocked, settings } from "./settings.ts";
import { transaction } from "./tx.ts";

// Moving in from Toggl Track, Clockify or Harvest: their detailed CSV
// export is read (lib/import-formats.ts), matched to the Chest's people by
// full name and to the clients, projects and tasks here by name, shown to
// the manager (planImport), then written in one transaction (runImport),
// creating the clients, projects and tasks it needs. Each row has a
// fingerprint: importing the same file again adds nothing.
//
// Nothing is dropped without the manager saying so:
// - people not in the Chest (they left before it) are kept as former
//   people — their name, their time, read-only — unless the manager
//   leaves them out;
// - rows in the locked period, or in a week already approved or sent for
//   approval, are imported only when the manager says so (history), and
//   left out otherwise; the plan asks.
// When the export gives its rates (in the Chest's currency), each row keeps
// them for good: the amounts match the old tool's invoices. Harvest rows
// marked invoiced come in invoiced.

export type Person = { id: string; name: string };
export type ImportOptions = {
  order?: DateOrder;
  people: Person[];
  noProject: string;
  // People not in the Chest: kept as former people (default), or left out.
  former?: "keep" | "skip";
  // Rows in the locked period or a closed week: imported, or left out
  // (default).
  locked?: "import" | "skip";
};
export type ImportPlan = {
  source: Source;
  rows: number;
  ready: number;
  minutes: number;
  from: string | null;
  to: string | null;
  people: { name: string; memberId: string | null; former: boolean; rows: number }[];
  newClients: string[];
  newProjects: { client: string | null; name: string }[];
  newTasks: number;
  // Rows in the locked period (or a closed week), before the choice.
  locked: { rows: number; until: string | null };
  // Whether the rows keep the old tool's rates; a currency that is not the
  // Chest's is not taken.
  rates: { kept: number; currency: string | null; ignored: boolean };
  invoiced: number;
  skipped: { person: number; locked: number; duplicate: number; invalid: number; dayFull: number };
  dates: { ambiguous: boolean; order: DateOrder };
};

// Who a row is: a member, or a former person (by name, created when needed).
type Author = { memberId: string } | { formerName: string; formerId: string | null };
type Ready = Imported & { author: Author; authorKey: string; project: string; key: string; rates: boolean };
type Work = { plan: ImportPlan; ready: Ready[] };

function fingerprint(source: Source, authorKey: string, r: Imported, occurrence: number): string {
  return createHash("sha256").update([source, authorKey, r.day, r.start ?? "", r.minutes, foldText(r.client), foldText(r.project), foldText(r.task), r.note, occurrence].join("\u001f")).digest("base64url");
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
  const keepFormer = options.former !== "skip";
  const importLocked = options.locked === "import";
  const ratesOk = parsed.rates && (parsed.currency === null || parsed.currency === chestCurrency());
  const formers = new Map((await sql<{ id: string; name: string }[]>`select id::text, name from former_people`).map(f => [fold(f.name), `imp_${f.id}`]));
  const skipped = { person: 0, locked: 0, duplicate: 0, invalid: parsed.invalid.length, dayFull: 0 };
  const people = new Map<string, { name: string; memberId: string | null; former: boolean; rows: number }>();
  const candidates: Ready[] = [];
  const seen = new Map<string, number>();
  for (const r of parsed.rows) {
    const memberId = match(r.person);
    const p = people.get(r.person) ?? { name: r.person, memberId, former: memberId === null && keepFormer, rows: 0 };
    p.rows++;
    people.set(r.person, p);
    if (!memberId && !keepFormer) { skipped.person++; continue; }
    if (r.day < "2000-01-01" || r.day > latest) { skipped.invalid++; continue; }
    const author: Author = memberId ? { memberId } : { formerName: r.person, formerId: formers.get(fold(r.person)) ?? null };
    const authorKey = memberId ?? `former:${fold(r.person)}`;
    const row = { ...r, project: r.project || options.noProject };
    const base = fingerprint(parsed.source, authorKey, row, 0);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    candidates.push({ ...row, author, authorKey, key: occurrence === 0 ? base : fingerprint(parsed.source, authorKey, row, occurrence), rates: ratesOk && (r.rateCents !== null || r.costCents !== null) });
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
  // The weeks that no longer change (sent for approval, or approved).
  const memberIds = [...new Set(fresh.flatMap(c => ("memberId" in c.author ? [c.author.memberId] : [])))];
  const closed = new Set(memberIds.length
    ? (await sql<{ member_id: string; week: string }[]>`
        select member_id, to_char(week, 'YYYY-MM-DD') as week from weeks where status in ('submitted', 'approved') and member_id = any(${memberIds}::text[])`).map(w => `${w.member_id}|${w.week}`)
    : []);
  const isClosed = (c: Ready) => isLocked(s, c.day) || ("memberId" in c.author && closed.has(`${c.author.memberId}|${mondayOf(c.day)}`));
  const lockedRows = fresh.filter(isClosed).length;
  const open = fresh.filter(c => {
    if (!importLocked && isClosed(c)) { skipped.locked++; return false; }
    return true;
  });
  // A day holds 24 hours: what is there already, plus what comes.
  const ready: Ready[] = [];
  if (open.length) {
    const days = open.map(c => c.day).sort();
    const authors = [...new Set(open.map(c => ("memberId" in c.author ? c.author.memberId : c.author.formerId ?? "")).filter(Boolean))];
    const sums = await sql<{ member_id: string; day: string; total: string }[]>`
      select member_id, to_char(day, 'YYYY-MM-DD') as day, sum(minutes)::text as total from entries
      where deleted_at is null and member_id = any(${authors}::text[]) and day between ${days[0]!} and ${days.at(-1)!}
      group by member_id, day`;
    const idOf = (c: Ready) => ("memberId" in c.author ? c.author.memberId : c.author.formerId ?? c.authorKey);
    const totals = new Map(sums.map(r => [`${r.member_id}|${r.day}`, numeric(r.total)]));
    for (const c of open) {
      const k = `${idOf(c)}|${c.day}`;
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
      locked: { rows: lockedRows, until: s.lockedUntil },
      rates: { kept: ready.filter(r => r.rates).length, currency: parsed.currency, ignored: parsed.rates && !ratesOk },
      invoiced: ready.filter(r => r.invoiced === true).length,
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
  const { imported, projectIds } = await sql.begin(async tx => {
    const clients = new Map((await tx<{ id: string; name: string }[]>`select id::text, name from clients`).map(c => [foldText(c.name), c.id]));
    const projects = new Map<string, { id: string; billable: boolean }>();
    for (const p of await tx<{ id: string; name: string; client_id: string | null; billable: boolean }[]>`select id::text, name, client_id::text, billable from projects`) {
      projects.set(`${p.client_id ?? ""}|${foldText(p.name)}`, { id: p.id, billable: p.billable });
    }
    const tasks = new Map((await tx<{ id: string; project_id: string; name: string }[]>`select id::text, project_id::text, name from tasks`).map(t => [`${t.project_id}|${foldText(t.name)}`, t.id]));
    const formers = new Map((await tx<{ id: string; name: string }[]>`select id::text, name from former_people`).map(f => [fold(f.name), `imp_${f.id}`]));
    let colorIndex = (await tx<{ n: number }[]>`select count(*)::int as n from projects`)[0]!.n;
    // Billable by default when most of the project's rows are.
    const votes = new Map<string, number>();
    for (const r of ready) votes.set(`${foldText(r.client)}|${foldText(r.project)}`, (votes.get(`${foldText(r.client)}|${foldText(r.project)}`) ?? 0) + (r.billable === false ? -1 : 1));
    const values: Record<string, unknown>[] = [];
    const invoicedKeys: string[] = [];
    for (const r of ready) {
      let author: string;
      if ("memberId" in r.author) author = r.author.memberId;
      else {
        const k = fold(r.author.formerName);
        let found = formers.get(k);
        if (!found) {
          const name = [...r.author.formerName].slice(0, 120).join("");
          const [row] = await tx<{ id: string }[]>`
            insert into former_people (name) values (${name}) on conflict (lower(name)) do update set name = former_people.name returning id::text`;
          found = `imp_${row!.id}`;
          formers.set(k, found);
        }
        author = found;
      }
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
      const billable = p.billable && r.billable !== false;
      const invoiced = billable && r.invoiced === true;
      if (invoiced && !r.rates) invoicedKeys.push(r.key);
      values.push({
        member_id: author, project_id: p.id, task_id: taskId, day: r.day, minutes: r.minutes, note: r.note,
        billable,
        started_at: started, ended_at: started ? new Date(started.getTime() + r.minutes * 60000) : null,
        source: "import", import_key: r.key,
        rates_fixed: r.rates, bill_rate_cents: r.rates ? r.rateCents : null, cost_rate_cents: r.rates ? r.costCents : null,
        invoiced_at: invoiced ? new Date() : null, invoiced_by: invoiced ? actor!.id : null,
      });
    }
    let count = 0;
    for (let i = 0; i < values.length; i += 500) {
      const chunk = values.slice(i, i + 500);
      const done = await tx`insert into entries ${tx(chunk, "member_id", "project_id", "task_id", "day", "minutes", "note", "billable", "started_at", "ended_at", "source", "import_key", "rates_fixed", "bill_rate_cents", "cost_rate_cents", "invoiced_at", "invoiced_by")} on conflict do nothing returning id`;
      count += done.length;
    }
    // Invoiced in the old tool without its rates: the rates in force here.
    for (let i = 0; i < invoicedKeys.length; i += 1000) {
      const ids = (await tx<{ id: string }[]>`select id::text from entries where import_key = any(${invoicedKeys.slice(i, i + 1000)}::text[])`).map(r => r.id);
      await fixRates(tx, { entryIds: ids });
    }
    return { imported: count, projectIds: [...new Set(values.map(v => String(v.project_id)))] };
  });
  await checkBudgets(sql, projectIds);
  return { imported, plan };
}

// The former people of imports (the People page): their names, how much
// time they have. A manager may forget one: their time stays, anonymous
// ("Former member"), and the name is gone.
export async function formerPeople(sql: Query, actor: Member | null): Promise<{ id: string; name: string; minutes: number }[]> {
  if (!can(actor, "rates")) throw new AppError("forbidden");
  const rows = await sql<{ id: string; name: string; minutes: string }[]>`
    select 'imp_' || f.id as id, f.name,
      coalesce((select sum(e.minutes) from entries e where e.member_id = 'imp_' || f.id and e.deleted_at is null), 0)::text as minutes
    from former_people f order by lower(f.name) limit 2000`;
  return rows.map(r => ({ id: r.id, name: r.name, minutes: numeric(r.minutes) }));
}

export async function forgetFormer(sql: Query, actor: Member | null, formerId: unknown): Promise<void> {
  if (!can(actor, "rates")) throw new AppError("forbidden");
  if (typeof formerId !== "string" || !/^imp_[1-9][0-9]{0,17}$/u.test(formerId)) throw new AppError("not_found");
  await transaction(sql, async tx => {
    const done = await tx`delete from former_people where id = ${formerId.slice(4)}`;
    if (done.count === 0) throw new AppError("not_found");
    await tx`update entries set member_id = 'erased', updated_at = now() where member_id = ${formerId}`;
  });
}
