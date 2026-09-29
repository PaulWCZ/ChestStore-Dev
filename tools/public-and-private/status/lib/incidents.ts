import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { chestLanguage, otherLanguage, writtenIn } from "./languages.ts";
import { affected, clean, componentIds, id, incidentSteps, isIncidentStep, limits, optionalText, type Impact, type IncidentStep, type Step } from "./model.ts";
import { maintenancePhase, type TimelineIncident } from "./timeline.ts";
import { instantOf, wall } from "./zone.ts";

// Incidents and planned maintenance, with their timelines. Every function
// checks the actor's rights first; the public pages read through the
// functions that never return what was removed.

export type LogEntry = { action: "edited" | "removed" | "restored"; previousBody: string; actor: string; at: Date; second: boolean };
export type Update = {
  id: string;
  incidentId: string;
  status: Step;
  body: string;
  bodySecond: string | null;
  postedAt: Date;
  author: string;
  editedAt: Date | null;
  removedAt: Date | null;
  removedBy: string | null;
  states: Record<string, Impact>;
  log: LogEntry[];
};
export type Incident = {
  id: string;
  kind: "incident" | "maintenance";
  title: string;
  titleSecond: string | null;
  // The language of title and texts, and of their second version (null: none).
  language: string;
  secondLanguage: string | null;
  sourceId: string | null;
  status: "investigating" | "identified" | "monitoring" | "resolved" | "scheduled" | "completed" | "cancelled";
  startedAt: Date;
  endsAt: Date | null;
  resolvedAt: Date | null;
  autoPosts: boolean;
  backfilled: boolean;
  createdBy: string;
  createdAt: Date;
  removedAt: Date | null;
  removedBy: string | null;
  components: string[];
  updates: Update[];
};

type IncidentRow = { id: string; kind: Incident["kind"]; title: string; title_second: string | null; language: string | null; second_language: string | null; source_id: string | null; status: Incident["status"]; started_at: Date; ends_at: Date | null; resolved_at: Date | null; auto_posts: boolean; backfilled: boolean; created_by: string; created_at: Date; removed_at: Date | null; removed_by: string | null };
type UpdateRow = { id: string; incident_id: string; status: Step; body: string; body_second: string | null; posted_at: Date; author: string; edited_at: Date | null; removed_at: Date | null; removed_by: string | null };

const date = (v: Date | string | null) => (v === null ? null : new Date(v));

// load fills incidents with their components, updates, states and log.
async function load(sql: Query, rows: IncidentRow[], options: { removed?: boolean; log?: boolean } = {}): Promise<Incident[]> {
  if (rows.length === 0) return [];
  const ids = rows.map(r => String(r.id));
  const [updates, states, components, log] = await Promise.all([
    options.removed
      ? sql<UpdateRow[]>`select id, incident_id, status, body, body_second, posted_at, author, edited_at, removed_at, removed_by from updates where incident_id = any(${ids}::bigint[]) order by posted_at desc, id desc`
      : sql<UpdateRow[]>`select id, incident_id, status, body, body_second, posted_at, author, edited_at, removed_at, removed_by from updates where incident_id = any(${ids}::bigint[]) and removed_at is null order by posted_at desc, id desc`,
    sql<{ update_id: string; component_id: string; state: Impact }[]>`select s.update_id, s.component_id, s.state from update_states s join updates u on u.id = s.update_id where u.incident_id = any(${ids}::bigint[])`,
    sql<{ incident_id: string; component_id: string }[]>`select incident_id, component_id from maintenance_components where incident_id = any(${ids}::bigint[]) order by component_id`,
    options.log
      ? sql<{ update_id: string; action: LogEntry["action"]; previous_body: string; actor: string; at: Date; second: boolean }[]>`select l.update_id, l.action, l.previous_body, l.actor, l.at, l.second from update_log l join updates u on u.id = l.update_id where u.incident_id = any(${ids}::bigint[]) order by l.at, l.id`
      : Promise.resolve([] as { update_id: string; action: LogEntry["action"]; previous_body: string; actor: string; at: Date; second: boolean }[]),
  ]);
  const statesOf = new Map<string, Record<string, Impact>>();
  for (const s of states) {
    const key = String(s.update_id);
    statesOf.set(key, { ...(statesOf.get(key) ?? {}), [String(s.component_id)]: s.state });
  }
  const logOf = new Map<string, LogEntry[]>();
  for (const l of log) logOf.set(String(l.update_id), [...(logOf.get(String(l.update_id)) ?? []), { action: l.action, previousBody: l.previous_body, actor: l.actor, at: new Date(l.at), second: l.second }]);
  const main = chestLanguage();
  return rows.map(r => {
    const key = String(r.id);
    return {
      id: key,
      kind: r.kind,
      title: r.title,
      titleSecond: r.title_second,
      language: r.language ?? main,
      secondLanguage: r.second_language,
      sourceId: r.source_id,
      status: r.status,
      startedAt: new Date(r.started_at),
      endsAt: date(r.ends_at),
      resolvedAt: date(r.resolved_at),
      autoPosts: r.auto_posts,
      backfilled: r.backfilled,
      createdBy: r.created_by,
      createdAt: new Date(r.created_at),
      removedAt: date(r.removed_at),
      removedBy: r.removed_by,
      components: components.filter(c => String(c.incident_id) === key).map(c => String(c.component_id)),
      updates: updates.filter(u => String(u.incident_id) === key).map(u => ({
        id: String(u.id),
        incidentId: key,
        status: u.status,
        body: u.body,
        bodySecond: u.body_second,
        postedAt: new Date(u.posted_at),
        author: u.author,
        editedAt: date(u.edited_at),
        removedAt: date(u.removed_at),
        removedBy: u.removed_by,
        states: statesOf.get(String(u.id)) ?? {},
        log: logOf.get(String(u.id)) ?? [],
      })),
    };
  });
}

const columns = (sql: Query) => sql`id, kind, title, title_second, language, second_language, source_id, status, started_at, ends_at, resolved_at, auto_posts, backfilled, created_by, created_at, removed_at, removed_by`;

// Whether an incident may be shown to the public: unless everything it
// touches is a service for the team only. Written against the table's own
// name: every public query reads `from incidents` without an alias.
const isPublic = (sql: Query) => sql`not exists (
  select 1 from (
    select s.component_id from update_states s join updates u on u.id = s.update_id where u.incident_id = incidents.id and u.removed_at is null
    union select m.component_id from maintenance_components m where m.incident_id = incidents.id) t
  join components c on c.id = t.component_id
  having bool_and(c.team_only))`;

// The incidents a status page needs: those still open, the maintenance
// ahead, and whatever touched the last `days` days. The team's own page
// (team: true) also reads those about services for the team only.
export async function recent(sql: Query, now = new Date(), days: number = limits.historyDays, options: { team?: boolean } = {}): Promise<Incident[]> {
  const since = new Date(now.getTime() - (days + 1) * 86400000);
  const rows = await sql<IncidentRow[]>`
    select ${columns(sql)} from incidents
    where removed_at is null and (started_at >= ${since} or resolved_at >= ${since} or ends_at >= ${since} or (kind = 'incident' and status <> 'resolved'))
      and (${options.team === true} or ${isPublic(sql)})
    order by started_at desc, id desc`;
  return load(sql, rows);
}

// The incidents with the latest news first, for the feeds.
export async function recentActivity(sql: Query, now = new Date(), limit = 50): Promise<Incident[]> {
  const rows = await sql<IncidentRow[]>`
    select ${columns(sql)} from incidents
    where removed_at is null and ${isPublic(sql)} and exists (select 1 from updates u where u.incident_id = incidents.id and u.removed_at is null and u.posted_at <= ${now})
    order by (select max(posted_at) from updates u where u.incident_id = incidents.id and u.removed_at is null and u.posted_at <= ${now}) desc, id desc
    limit ${Math.min(Math.max(limit, 1), 200)}`;
  return load(sql, rows);
}

// The latest incidents (not maintenance), newest first: the public API's
// list, as Statuspage's gives its 50 most recent.
export async function latestIncidents(sql: Query, now = new Date(), limit = 50): Promise<Incident[]> {
  const rows = await sql<IncidentRow[]>`
    select ${columns(sql)} from incidents
    where kind = 'incident' and removed_at is null and started_at <= ${now} and ${isPublic(sql)}
    order by started_at desc, id desc
    limit ${Math.min(Math.max(limit, 1), 200)}`;
  return load(sql, rows);
}

// Maintenance windows ahead, and those of the last 30 days, for the
// calendar feed and the public API.
export async function upcomingMaintenance(sql: Query, now = new Date()): Promise<Incident[]> {
  const rows = await sql<IncidentRow[]>`
    select ${columns(sql)} from incidents
    where kind = 'maintenance' and removed_at is null and ends_at >= ${new Date(now.getTime() - 30 * 86400000)} and ${isPublic(sql)}
    order by started_at, id limit 200`;
  return load(sql, rows);
}

// One incident as the public sees it (null when removed or unknown).
export async function publicIncident(sql: Query, value: unknown): Promise<Incident | null> {
  let key: string;
  try {
    key = id(value);
  } catch {
    return null;
  }
  const rows = await sql<IncidentRow[]>`select ${columns(sql)} from incidents where id = ${key} and removed_at is null and ${isPublic(sql)}`;
  return (await load(sql, rows))[0] ?? null;
}

// One incident as editors see it: removed updates and the log included.
export async function incidentFor(sql: Query, actor: Member | null, value: unknown): Promise<Incident> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const rows = await sql<IncidentRow[]>`select ${columns(sql)} from incidents where id = ${id(value)}`;
  const [found] = await load(sql, rows, { removed: true, log: true });
  if (!found) throw new AppError("not_found");
  return found;
}

// A page of the history: `months` calendar months (in the Chest's time
// zone), the most recent first; page 0 ends with this month.
export async function historyPage(sql: Query, page: number, zone: string, now = new Date(), months = 3): Promise<{ months: { month: string; incidents: Incident[] }[]; older: boolean }> {
  const safe = Number.isInteger(page) && page >= 0 && page < 1200 ? page : 0;
  const today = wall(now, zone).date;
  const firstOf = (offset: number) => {
    const [y, m] = today.split("-").map(Number) as [number, number];
    const d = new Date(Date.UTC(y, m - 1 - offset, 1));
    return d.toISOString().slice(0, 7);
  };
  const list = Array.from({ length: months }, (_, k) => firstOf(safe * months + k));
  const from = instantOf(list.at(-1)! + "-01", 0, zone);
  const to = instantOf(firstOf(safe * months - 1) + "-01", 0, zone);
  const rows = await sql<IncidentRow[]>`
    select ${columns(sql)} from incidents
    where removed_at is null and started_at >= ${from} and started_at < ${to} and started_at <= ${now} and not (kind = 'maintenance' and status = 'cancelled') and ${isPublic(sql)}
    order by started_at desc, id desc`;
  const all = await load(sql, rows);
  const [older] = await sql`select 1 from incidents where removed_at is null and started_at < ${from} and ${isPublic(sql)} limit 1`;
  return { months: list.map(month => ({ month, incidents: all.filter(i => wall(i.startedAt, zone).date.slice(0, 7) === month) })), older: Boolean(older) };
}

// Every incident for editors, removed ones included, most recent first.
export async function allFor(sql: Query, actor: Member | null, options: { limit?: number; before?: string | null } = {}): Promise<Incident[]> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const rows = options.before
    ? await sql<IncidentRow[]>`select ${columns(sql)} from incidents where id < ${id(options.before)} order by id desc limit ${limit}`
    : await sql<IncidentRow[]>`select ${columns(sql)} from incidents order by id desc limit ${limit}`;
  return load(sql, rows, { removed: true });
}

// The shape the timeline computations read.
export function forTimeline(list: Incident[]): TimelineIncident[] {
  return list.map(i => ({
    id: i.id,
    kind: i.kind,
    status: i.status,
    startedAt: i.startedAt.getTime(),
    endsAt: i.endsAt?.getTime() ?? null,
    resolvedAt: i.resolvedAt?.getTime() ?? null,
    components: i.components,
    updates: i.updates.filter(u => u.removedAt === null).map(u => ({ postedAt: u.postedAt.getTime(), status: u.status, states: new Map(Object.entries(u.states)) })),
  }));
}

// The update of the post-mortem, when there is one.
export function postmortemOf(i: Incident): Update | null {
  return i.updates.find(u => u.status === "postmortem" && u.removedAt === null) ?? null;
}

// The components an incident touched, in any of its updates.
export function touched(i: Incident): string[] {
  return i.kind === "maintenance" ? i.components : [...new Set(i.updates.filter(u => u.removedAt === null).flatMap(u => Object.keys(u.states)))];
}

// ---- Writing ---------------------------------------------------------------

function editor(actor: Member | null): Member {
  if (!actor || !can(actor, "incidents")) throw new AppError("forbidden");
  return actor;
}

async function checkComponents(sql: Query, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const found = await sql<{ id: string }[]>`select id from components where id = any(${ids}::bigint[]) and kind = 'component'`;
  if (found.length !== ids.length) throw new AppError("invalid");
}

async function insertUpdate(sql: Query, incidentId: string, input: { status: Step; body: string; bodySecond?: string | null; postedAt: Date; author: string; states?: Map<string, Impact> }): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into updates (incident_id, status, body, body_second, posted_at, author)
    values (${incidentId}, ${input.status}, ${input.body}, ${input.bodySecond ?? null}, ${input.postedAt}, ${input.author}) returning id`;
  const updateId = String(row!.id);
  for (const [componentId, state] of input.states ?? []) await sql`insert into update_states (update_id, component_id, state) values (${updateId}, ${componentId}, ${state})`;
  return updateId;
}

// refresh sets an incident's status and times from its visible updates:
// the status of the latest, started at the first, resolved at the latest
// when that one resolves it.
async function refresh(sql: Query, incidentId: string): Promise<void> {
  const ups = await sql<{ status: Step; posted_at: Date }[]>`select status, posted_at from updates where incident_id = ${incidentId} and removed_at is null and status <> 'postmortem' order by posted_at, id`;
  const first = ups[0], last = ups.at(-1);
  if (!first || !last) return;
  const status = isIncidentStep(last.status) ? last.status : "investigating";
  await sql`update incidents set status = ${status}, started_at = ${first.posted_at}, resolved_at = ${status === "resolved" ? last.posted_at : null} where id = ${incidentId} and kind = 'incident'`;
}

async function lockIncident(sql: Query, value: unknown): Promise<IncidentRow> {
  const [row] = await sql<IncidentRow[]>`select ${columns(sql)} from incidents where id = ${id(value)} and removed_at is null for update`;
  if (!row) throw new AppError("not_found");
  return row;
}

// announce tells the page's subscribers about a new update: every way a
// customer can follow the page starts here, once per update, inside the
// update's transaction. Today one way: emails wait in a queue, one per
// subscriber who follows one of these components (or everything); only for
// what happens now, never a backfill, and never about services for the team
// only. The seam for webhook, Slack and Teams subscriptions (the Chest's
// `webhooks` proposal, README "Needs from the SDK"): they queue here too,
// with the same rules, and are delivered by the same pass as the emails.
async function announce(sql: Query, updateId: string, componentIds: string[]): Promise<void> {
  await queueMail(sql, updateId, componentIds);
}

async function queueMail(sql: Query, updateId: string, componentIds: string[]): Promise<void> {
  await sql`
    insert into mail_queue (subscriber_id, update_id)
    select s.id, ${updateId} from subscribers s
    where s.confirmed_at is not null and (s.components is null or s.components && ${componentIds}::bigint[])
      and exists (select 1 from components c where c.id = any(${componentIds}::bigint[]) and not c.team_only)
    on conflict do nothing`;
}

// The second version of an incident's texts (Proposal: none; the tool's
// other language): what an editor may add beside the title and each text.
export type Second = { title?: unknown; body?: unknown } | null | undefined;

// secondTitle reads an optional title in the second language.
const secondTitle = (value: Second) => optionalText(value?.title, limits.title);
const secondBody = (value: Second) => optionalText(value?.body, limits.body, { multiline: true });

// Once an incident has a second version, it keeps its language; the first
// second text sets it to the other language than the one it is written in.
async function useSecond(sql: Query, incidentId: string, given: boolean): Promise<void> {
  if (!given) return;
  const [row] = await sql<{ language: string | null }[]>`select language from incidents where id = ${incidentId}`;
  await sql`update incidents set second_language = coalesce(second_language, ${otherLanguage(row?.language ?? chestLanguage())}) where id = ${incidentId}`;
}

// language: the "Written in" choice (a tool language); the editor's own
// when not given.
export type OpenInput = { title: unknown; status: unknown; body: unknown; states: unknown; second?: Second; language?: unknown };
export type BackfillInput = { title: unknown; body: unknown; states: unknown; startedAt: Date; resolvedAt: Date; resolution: unknown; second?: (Second & { resolution?: unknown }) | null; sourceId?: string; language?: unknown };

// openIncident posts a new incident and its first update, now.
export async function openIncident(sql: Sql, actor: Member | null, input: OpenInput, now = new Date()): Promise<{ incidentId: string; updateId: string }> {
  const who = editor(actor);
  const title = clean(input.title, limits.title);
  const body = clean(input.body, limits.body, { multiline: true });
  const status = input.status;
  if (status !== "investigating" && status !== "identified" && status !== "monitoring") throw new AppError("invalid");
  const states = affected(input.states);
  const titleSecond = secondTitle(input.second), bodySecond = secondBody(input.second);
  const main = writtenIn(input.language, who);
  return sql.begin(async tx => {
    await checkComponents(tx, [...states.keys()]);
    const [row] = await tx<{ id: string }[]>`
      insert into incidents (kind, title, title_second, language, second_language, status, started_at, created_by)
      values ('incident', ${title}, ${titleSecond}, ${main}, ${titleSecond || bodySecond ? otherLanguage(main) : null}, ${status}, ${now}, ${who.id}) returning id`;
    const incidentId = String(row!.id);
    const updateId = await insertUpdate(tx, incidentId, { status, body, bodySecond, postedAt: now, author: who.id, states });
    await announce(tx, updateId, [...states.keys()]);
    return { incidentId, updateId };
  });
}

// backfill records an incident that already happened and is over: it
// joins the history and the uptime, and tells nobody.
export async function backfill(sql: Sql, actor: Member | null, input: BackfillInput, now = new Date()): Promise<{ incidentId: string }> {
  const who = editor(actor);
  const title = clean(input.title, limits.title);
  const body = clean(input.body, limits.body, { multiline: true });
  const resolution = clean(input.resolution, limits.body, { multiline: true });
  const states = affected(input.states);
  const titleSecond = secondTitle(input.second), bodySecond = secondBody(input.second);
  const resolutionSecond = optionalText(input.second?.resolution, limits.body, { multiline: true });
  const start = input.startedAt.getTime(), end = input.resolvedAt.getTime();
  if (!(start < now.getTime()) || start < now.getTime() - limits.backfillDays * 86400000) throw new AppError("invalid_time");
  if (!(end > start) || end > now.getTime() + 60000) throw new AppError("invalid_time");
  const main = writtenIn(input.language, who);
  return sql.begin(async tx => {
    await checkComponents(tx, [...states.keys()]);
    const [row] = await tx<{ id: string }[]>`
      insert into incidents (kind, title, title_second, language, second_language, status, started_at, resolved_at, backfilled, created_by)
      values ('incident', ${title}, ${titleSecond}, ${main}, ${titleSecond || bodySecond || resolutionSecond ? otherLanguage(main) : null}, 'resolved', ${input.startedAt}, ${input.resolvedAt}, true, ${who.id}) returning id`;
    const incidentId = String(row!.id);
    await insertUpdate(tx, incidentId, { status: "investigating", body, bodySecond, postedAt: input.startedAt, author: who.id, states });
    await insertUpdate(tx, incidentId, { status: "resolved", body: resolution, bodySecond: resolutionSecond, postedAt: input.resolvedAt, author: who.id });
    return { incidentId };
  });
}

// addUpdate posts the next step of an incident. Without states, the
// components stay as the last update left them; "resolved" sets every one
// back to operational. A resolved incident is reopened only when asked in
// so many words (reopen: true, after the editor confirmed): a step posted
// to it otherwise is refused, so a slip never reopens it and emails every
// subscriber.
export async function addUpdate(sql: Sql, actor: Member | null, incidentId: unknown, input: { status: unknown; body: unknown; bodySecond?: unknown; states?: unknown; reopen?: unknown }, now = new Date()): Promise<{ updateId: string; resolved: boolean; reopened: boolean }> {
  const who = editor(actor);
  const body = clean(input.body, limits.body, { multiline: true });
  const bodySecond = optionalText(input.bodySecond, limits.body, { multiline: true });
  if (!isIncidentStep(input.status)) throw new AppError("invalid");
  const status: IncidentStep = input.status;
  const given = status === "resolved" || input.states === undefined ? null : affected(input.states, { optional: true });
  return sql.begin(async tx => {
    const incident = await lockIncident(tx, incidentId);
    if (incident.kind !== "incident") throw new AppError("not_found");
    if (incident.status === "resolved" && (status === "resolved" || input.reopen !== true)) throw new AppError("already_resolved");
    let states = given;
    if (status !== "resolved" && states === null) {
      const rows = await tx<{ component_id: string; state: Impact }[]>`
        select component_id, state from update_states where update_id = (
          select id from updates where incident_id = ${incident.id} and removed_at is null and status not in ('resolved', 'postmortem') order by posted_at desc, id desc limit 1)`;
      states = new Map(rows.map(r => [String(r.component_id), r.state]));
    }
    if (states) await checkComponents(tx, [...states.keys()]);
    const [last] = await tx<{ posted_at: Date }[]>`select posted_at from updates where incident_id = ${incident.id} and removed_at is null and status <> 'postmortem' order by posted_at desc, id desc limit 1`;
    const postedAt = last && new Date(last.posted_at).getTime() > now.getTime() ? new Date(last.posted_at) : now;
    await useSecond(tx, String(incident.id), bodySecond !== null);
    const updateId = await insertUpdate(tx, String(incident.id), { status, body, bodySecond, postedAt, author: who.id, ...(states ? { states } : {}) });
    await refresh(tx, String(incident.id));
    const everything = await tx<{ component_id: string }[]>`select distinct s.component_id from update_states s join updates u on u.id = s.update_id where u.incident_id = ${incident.id} and u.removed_at is null`;
    if (!incident.backfilled || incident.status !== "resolved") await announce(tx, updateId, everything.map(r => String(r.component_id)));
    return { updateId, resolved: status === "resolved", reopened: incident.status === "resolved" && status !== "resolved" };
  });
}

// renameIncident changes the title (and its second version when given:
// an empty one removes it).
export async function renameIncident(sql: Sql, actor: Member | null, incidentId: unknown, title: unknown, titleSecond?: unknown): Promise<void> {
  editor(actor);
  const text = clean(title, limits.title);
  const second = titleSecond === undefined ? undefined : optionalText(titleSecond, limits.title);
  await sql.begin(async tx => {
    const rows = second === undefined
      ? await tx`update incidents set title = ${text} where id = ${id(incidentId)} and removed_at is null returning id`
      : await tx`update incidents set title = ${text}, title_second = ${second} where id = ${id(incidentId)} and removed_at is null returning id`;
    if (rows.length === 0) throw new AppError("not_found");
    await useSecond(tx, id(incidentId), Boolean(second));
  });
}

// editUpdate corrects the text of an update — or, with second: true, its
// second version (an empty one removes it); the previous text is kept in
// the log, with who changed it and when.
export async function editUpdate(sql: Sql, actor: Member | null, updateId: unknown, body: unknown, now = new Date(), options: { second?: boolean } = {}): Promise<void> {
  const who = editor(actor);
  const text = options.second ? optionalText(body, limits.body, { multiline: true }) : clean(body, limits.body, { multiline: true });
  await sql.begin(async tx => {
    const [row] = await tx<{ body: string; body_second: string | null; incident_id: string }[]>`
      select u.body, u.body_second, u.incident_id from updates u join incidents i on i.id = u.incident_id
      where u.id = ${id(updateId)} and u.removed_at is null and i.removed_at is null for update of u`;
    if (!row) throw new AppError("not_found");
    const before = options.second ? row.body_second : row.body;
    if (before === text) return;
    await tx`insert into update_log (update_id, action, previous_body, actor, at, second) values (${id(updateId)}, 'edited', ${before ?? ""}, ${who.id}, ${now}, ${options.second === true})`;
    if (options.second) {
      await tx`update updates set body_second = ${text}, edited_at = ${now} where id = ${id(updateId)}`;
      await useSecond(tx, String(row.incident_id), text !== null);
    } else await tx`update updates set body = ${text}, edited_at = ${now} where id = ${id(updateId)}`;
  });
}

// writePostmortem publishes — or corrects — the post-mortem of a resolved
// incident: what happened and what was changed. It is shown under the
// timeline on the incident's page; nobody is emailed (the incident is
// over; the page and its feeds carry it). A correction is logged.
export async function writePostmortem(sql: Sql, actor: Member | null, incidentId: unknown, input: { body: unknown; bodySecond?: unknown }, now = new Date()): Promise<{ updateId: string }> {
  const who = editor(actor);
  const body = clean(input.body, limits.body, { multiline: true });
  const bodySecond = optionalText(input.bodySecond, limits.body, { multiline: true });
  return sql.begin(async tx => {
    const incident = await lockIncident(tx, incidentId);
    if (incident.kind !== "incident") throw new AppError("not_found");
    if (incident.status !== "resolved") throw new AppError("not_resolved");
    const [existing] = await tx<{ id: string; body: string; body_second: string | null }[]>`select id, body, body_second from updates where incident_id = ${incident.id} and status = 'postmortem' and removed_at is null for update`;
    if (existing) {
      const updateId = String(existing.id);
      if (existing.body !== body) {
        await tx`insert into update_log (update_id, action, previous_body, actor, at) values (${updateId}, 'edited', ${existing.body}, ${who.id}, ${now})`;
        await tx`update updates set body = ${body}, edited_at = ${now} where id = ${updateId}`;
      }
      if (input.bodySecond !== undefined && existing.body_second !== bodySecond) {
        await tx`insert into update_log (update_id, action, previous_body, actor, at, second) values (${updateId}, 'edited', ${existing.body_second ?? ""}, ${who.id}, ${now}, true)`;
        await tx`update updates set body_second = ${bodySecond}, edited_at = ${now} where id = ${updateId}`;
      }
      await useSecond(tx, String(incident.id), bodySecond !== null);
      return { updateId };
    }
    await useSecond(tx, String(incident.id), bodySecond !== null);
    return { updateId: await insertUpdate(tx, String(incident.id), { status: "postmortem", body, bodySecond, postedAt: now, author: who.id }) };
  });
}

// removeUpdate takes an update off the page (kept, with who and when, for
// editors); the incident's status follows its remaining updates. The only
// update left cannot go: remove the incident instead.
export async function removeUpdate(sql: Sql, actor: Member | null, updateId: unknown, now = new Date()): Promise<{ incidentId: string }> {
  const who = editor(actor);
  return sql.begin(async tx => {
    const [row] = await tx<{ incident_id: string; body: string; kind: string; status: Step }[]>`
      select u.incident_id, u.body, i.kind, u.status from updates u join incidents i on i.id = u.incident_id
      where u.id = ${id(updateId)} and u.removed_at is null and i.removed_at is null for update of u`;
    if (!row) throw new AppError("not_found");
    const [{ count }] = (await tx<{ count: number }[]>`select count(*)::int as count from updates where incident_id = ${row.incident_id} and removed_at is null and status <> 'postmortem'`) as unknown as [{ count: number }];
    if (row.status !== "postmortem" && count <= 1) throw new AppError("last_update");
    await tx`insert into update_log (update_id, action, previous_body, actor, at) values (${id(updateId)}, 'removed', ${row.body}, ${who.id}, ${now})`;
    await tx`update updates set removed_at = ${now}, removed_by = ${who.id} where id = ${id(updateId)}`;
    await tx`delete from mail_queue where update_id = ${id(updateId)}`;
    if (row.kind === "incident") await refresh(tx, String(row.incident_id));
    return { incidentId: String(row.incident_id) };
  });
}

// restoreUpdate puts a removed update back (the undo of removeUpdate); the
// log keeps both steps.
export async function restoreUpdate(sql: Sql, actor: Member | null, updateId: unknown, now = new Date()): Promise<void> {
  const who = editor(actor);
  await sql.begin(async tx => {
    const [row] = await tx<{ incident_id: string; body: string; kind: string }[]>`
      select u.incident_id, u.body, i.kind from updates u join incidents i on i.id = u.incident_id
      where u.id = ${id(updateId)} and u.removed_at is not null and i.removed_at is null for update of u`;
    if (!row) throw new AppError("not_found");
    const [other] = await tx`select 1 from updates where incident_id = ${row.incident_id} and status = 'postmortem' and removed_at is null and exists (select 1 from updates r where r.id = ${id(updateId)} and r.status = 'postmortem')`;
    if (other) throw new AppError("invalid");
    await tx`insert into update_log (update_id, action, previous_body, actor, at) values (${id(updateId)}, 'restored', ${row.body}, ${who.id}, ${now})`;
    await tx`update updates set removed_at = null, removed_by = null where id = ${id(updateId)}`;
    if (row.kind === "incident") await refresh(tx, String(row.incident_id));
  });
}

// removeIncident takes a whole incident off the page (posted by mistake);
// editors still see it, marked removed, and may put it back.
export async function removeIncident(sql: Sql, actor: Member | null, incidentId: unknown, now = new Date()): Promise<void> {
  const who = editor(actor);
  const rows = await sql`update incidents set removed_at = ${now}, removed_by = ${who.id} where id = ${id(incidentId)} and removed_at is null returning id`;
  if (rows.length === 0) throw new AppError("not_found");
  await sql`delete from mail_queue where update_id in (select id from updates where incident_id = ${id(incidentId)})`;
}

export async function restoreIncident(sql: Sql, actor: Member | null, incidentId: unknown): Promise<void> {
  editor(actor);
  const rows = await sql`update incidents set removed_at = null, removed_by = null where id = ${id(incidentId)} and removed_at is not null returning id`;
  if (rows.length === 0) throw new AppError("not_found");
}

// ---- Maintenance -----------------------------------------------------------

export type MaintenanceInput = { title: unknown; body: unknown; start: Date; end: Date; components: unknown; autoPosts: unknown; second?: Second; language?: unknown };

function checkWindow(start: Date, end: Date, now: Date, isNew: boolean): void {
  const s = start.getTime(), e = end.getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) throw new AppError("invalid_time");
  if (e - s > limits.maintenanceHours * 3600000) throw new AppError("invalid_time");
  if (isNew && e <= now.getTime()) throw new AppError("not_future");
  if (s > now.getTime() + limits.maintenanceAheadDays * 86400000) throw new AppError("invalid_time");
}

// planMaintenance announces a window: shown as "planned" until it starts,
// "in progress" during it, "completed" after — read from the clock.
export async function planMaintenance(sql: Sql, actor: Member | null, input: MaintenanceInput, now = new Date()): Promise<{ incidentId: string; updateId: string }> {
  const who = editor(actor);
  const title = clean(input.title, limits.title);
  const body = clean(input.body, limits.body, { multiline: true });
  const components = componentIds(input.components);
  checkWindow(input.start, input.end, now, true);
  const titleSecond = secondTitle(input.second), bodySecond = secondBody(input.second);
  const main = writtenIn(input.language, who);
  return sql.begin(async tx => {
    await checkComponents(tx, components);
    const [row] = await tx<{ id: string }[]>`
      insert into incidents (kind, title, title_second, language, second_language, status, started_at, ends_at, auto_posts, created_by)
      values ('maintenance', ${title}, ${titleSecond}, ${main}, ${titleSecond || bodySecond ? otherLanguage(main) : null}, 'scheduled', ${input.start}, ${input.end}, ${input.autoPosts === true}, ${who.id}) returning id`;
    const incidentId = String(row!.id);
    for (const c of components) await tx`insert into maintenance_components (incident_id, component_id) values (${incidentId}, ${c})`;
    const updateId = await insertUpdate(tx, incidentId, { status: "scheduled", body, bodySecond, postedAt: now, author: who.id });
    await announce(tx, updateId, components);
    return { incidentId, updateId };
  });
}

// editMaintenance changes a window that has not ended: its title, times,
// components, automatic posts.
export async function editMaintenance(sql: Sql, actor: Member | null, incidentId: unknown, input: Omit<MaintenanceInput, "body">, now = new Date()): Promise<void> {
  editor(actor);
  const title = clean(input.title, limits.title);
  const components = componentIds(input.components);
  checkWindow(input.start, input.end, now, false);
  await sql.begin(async tx => {
    const m = await lockIncident(tx, incidentId);
    if (m.kind !== "maintenance") throw new AppError("not_found");
    const phase = maintenancePhase({ status: m.status, startedAt: new Date(m.started_at).getTime(), endsAt: m.ends_at ? new Date(m.ends_at).getTime() : null, resolvedAt: m.resolved_at ? new Date(m.resolved_at).getTime() : null }, now.getTime());
    if (m.status !== "scheduled" || phase === "completed" || phase === "cancelled") throw new AppError("ended");
    if (input.end.getTime() <= now.getTime()) throw new AppError("not_future");
    await checkComponents(tx, components);
    await tx`update incidents set title = ${title}, started_at = ${input.start}, ends_at = ${input.end}, auto_posts = ${input.autoPosts === true},
      start_posted = start_posted and ${input.start} <= ${now}, end_posted = false where id = ${m.id}`;
    await tx`delete from maintenance_components where incident_id = ${m.id}`;
    for (const c of components) await tx`insert into maintenance_components (incident_id, component_id) values (${m.id}, ${c})`;
  });
}

// maintenanceUpdate posts on a maintenance: news during it ("update"), an
// early end ("completed", once started) or a cancellation (before its end).
export async function maintenanceUpdate(sql: Sql, actor: Member | null, incidentId: unknown, input: { status: unknown; body: unknown; bodySecond?: unknown }, now = new Date()): Promise<{ updateId: string }> {
  const who = editor(actor);
  const body = clean(input.body, limits.body, { multiline: true });
  const bodySecond = optionalText(input.bodySecond, limits.body, { multiline: true });
  const status = input.status;
  if (status !== "update" && status !== "completed" && status !== "cancelled") throw new AppError("invalid");
  return sql.begin(async tx => {
    const m = await lockIncident(tx, incidentId);
    if (m.kind !== "maintenance") throw new AppError("not_found");
    const phase = maintenancePhase({ status: m.status, startedAt: new Date(m.started_at).getTime(), endsAt: m.ends_at ? new Date(m.ends_at).getTime() : null, resolvedAt: m.resolved_at ? new Date(m.resolved_at).getTime() : null }, now.getTime());
    if (m.status !== "scheduled" || phase === "completed" || phase === "cancelled") throw new AppError("ended");
    if (status === "completed" && phase !== "in_progress") throw new AppError("invalid");
    await useSecond(tx, String(m.id), bodySecond !== null);
    const updateId = await insertUpdate(tx, String(m.id), { status, body, bodySecond, postedAt: now, author: who.id });
    if (status === "completed") await tx`update incidents set status = 'completed', resolved_at = ${now}, end_posted = true, start_posted = true where id = ${m.id}`;
    if (status === "cancelled") await tx`update incidents set status = 'cancelled', resolved_at = ${now}, end_posted = true where id = ${m.id}`;
    const components = await tx<{ component_id: string }[]>`select component_id from maintenance_components where incident_id = ${m.id}`;
    await announce(tx, updateId, components.map(c => String(c.component_id)));
    return { updateId };
  });
}

// autoPost writes the updates a maintenance with automatic posts owes at
// this moment: "in progress" at its start, "completed" at its end — dated
// at the window's edges, whatever the time the pass runs. Run by the
// "updates" schedule (every 15 minutes) and whenever an editor opens the
// tool, twice harmlessly. The words are in the maintenance's language, and
// in its second one when it has one.
type AutoWords = { started: string; completed: string };
export async function autoPost(sql: Sql, wordsIn: (language: string) => AutoWords, now = new Date()): Promise<string[]> {
  return sql.begin(async tx => {
    const due = await tx<{ id: string; started_at: Date; ends_at: Date; start_posted: boolean; end_posted: boolean; language: string | null; second_language: string | null }[]>`
      select id, started_at, ends_at, start_posted, end_posted, language, second_language from incidents
      where kind = 'maintenance' and removed_at is null and auto_posts and status = 'scheduled'
        and ((not start_posted and started_at <= ${now}) or (not end_posted and ends_at <= ${now}))
      order by started_at for update skip locked`;
    const posted: string[] = [];
    for (const m of due) {
      const components = (await tx<{ component_id: string }[]>`select component_id from maintenance_components where incident_id = ${m.id}`).map(c => String(c.component_id));
      const recentEnough = (at: Date) => now.getTime() - new Date(at).getTime() < 86400000;
      const words = wordsIn(m.language ?? chestLanguage());
      const second = m.second_language ? wordsIn(m.second_language) : null;
      if (!m.start_posted) {
        const u = await insertUpdate(tx, String(m.id), { status: "in_progress", body: words.started, bodySecond: second?.started ?? null, postedAt: new Date(m.started_at), author: "auto" });
        if (recentEnough(m.started_at) && new Date(m.ends_at).getTime() > now.getTime()) await announce(tx, u, components);
        posted.push(u);
      }
      if (!m.end_posted && new Date(m.ends_at).getTime() <= now.getTime()) {
        const u = await insertUpdate(tx, String(m.id), { status: "completed", body: words.completed, bodySecond: second?.completed ?? null, postedAt: new Date(m.ends_at), author: "auto" });
        if (recentEnough(m.ends_at)) await announce(tx, u, components);
        posted.push(u);
      }
      await tx`update incidents set start_posted = true, end_posted = end_posted or ends_at <= ${now} where id = ${m.id}`;
    }
    return posted;
  });
}

// What is open now, for the team's badge.
export async function openCount(sql: Query): Promise<number> {
  const [{ count }] = (await sql<{ count: number }[]>`select count(*)::int as count from incidents where kind = 'incident' and removed_at is null and status <> 'resolved'`) as unknown as [{ count: number }];
  return count;
}

export { incidentSteps };
