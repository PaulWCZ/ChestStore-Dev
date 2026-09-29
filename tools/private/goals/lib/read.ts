import type { Source } from "./sources.ts";
import type { Query } from "./db.ts";
import { cycleName } from "./cycle-names.ts";
import type { Locale } from "./i18n/index.ts";
import { isStale, objectiveProgress, progress, worst, type Confidence, type Kind, type Level, type Visibility } from "./model.ts";

// What the pages and the services read: cycles, objectives with their key
// results, progress and confidence computed here, once. Member ids only;
// names are resolved when rendering (lib/people.ts).

// name: as the reader sees it when read with their language (a name the
// tool generated follows it: lib/cycle-names.ts); as stored otherwise.
export type Cycle = { id: string; name: string; generated: boolean; startsOn: string; endsOn: string; current: boolean; closed: boolean; closedAt: string | null };

export type KeyResult = {
  id: string;
  objectiveId: string;
  cycleId: string;
  title: string;
  kind: Kind;
  unit: string;
  currency: string | null;
  start: number;
  target: number;
  current: number;
  weight: number;
  owner: string;
  // Fed by another tool (lib/sources.ts), or null: updated by its owner.
  source: Source | null;
  // Fed: only what names its owner; a board of Tasks (or null: all).
  sourceMine: boolean;
  sourceScope: string | null;
  // The language its unit is written in (lib/values.ts), or null.
  unitLocale: string | null;
  createdAt: string;
  progress: number;
  done: boolean;
  confidence: Confidence | null;
  lastCheckIn: string | null;
  stale: boolean;
  // A check-in since this week's Monday (the Chest's zone).
  thisWeek: boolean;
};

export type Objective = {
  id: string;
  cycleId: string;
  level: Level;
  teamId: string | null;
  parentId: string | null;
  carriedFrom: string | null;
  owner: string;
  title: string;
  why: string;
  visibility: Visibility;
  score: number | null;
  learned: string;
  retroBy: string | null;
  retroAt: string | null;
  createdBy: string;
  createdAt: string;
  keyResults: KeyResult[];
  progress: number | null;
  confidence: Confidence | null;
  stale: boolean;
};

type CycleRow = { id: string; name: string; generated: boolean; starts_on: string; ends_on: string; current: boolean; closed_at: Date | null };
const toCycle = (r: CycleRow, locale: Locale | null): Cycle => {
  const c = { id: String(r.id), name: r.name, generated: r.generated, startsOn: r.starts_on, endsOn: r.ends_on, current: r.current, closed: r.closed_at !== null, closedAt: r.closed_at?.toISOString() ?? null };
  return locale ? { ...c, name: cycleName(c, locale) } : c;
};
const cycleColumns = "id, name, generated, to_char(starts_on, 'YYYY-MM-DD') as starts_on, to_char(ends_on, 'YYYY-MM-DD') as ends_on, current, closed_at";

// locale: the reader's language (the names the tool generated in it);
// none: the names as stored.
export async function cycles(sql: Query, locale: Locale | null = null): Promise<Cycle[]> {
  const rows = await sql.unsafe<CycleRow[]>(`select ${cycleColumns} from cycles order by starts_on desc, id desc limit 200`);
  return rows.map(r => toCycle(r, locale));
}

export async function cycleById(sql: Query, cycleId: string, locale: Locale | null = null): Promise<Cycle | null> {
  const [row] = await sql.unsafe<CycleRow[]>(`select ${cycleColumns} from cycles where id = $1`, [cycleId]);
  return row ? toCycle(row, locale) : null;
}

// The current cycle, or else the latest that is not closed, or else the
// latest: what "Company" opens on.
export async function defaultCycle(sql: Query, locale: Locale | null = null): Promise<Cycle | null> {
  const [row] = await sql.unsafe<CycleRow[]>(`select ${cycleColumns} from cycles order by current desc, (closed_at is null) desc, starts_on desc, id desc limit 1`);
  return row ? toCycle(row, locale) : null;
}

type ObjectiveRow = {
  id: string; cycle_id: string; level: Level; team_id: string | null; parent_id: string | null; carried_from: string | null; owner: string; title: string; why: string; visibility: Visibility;
  score: string | null; learned: string; retro_by: string | null; retro_at: Date | null; created_by: string; created_at: Date;
};
type KeyResultRow = {
  id: string; objective_id: string; cycle_id: string; title: string; kind: Kind; unit: string; currency: string | null; start_value: string; target_value: string; current_value: string;
  weight: number; owner: string; source: KeyResult["source"]; source_mine: boolean; source_scope: string | null; unit_locale: string | null; created_at: Date; confidence: Confidence | null; last_at: Date | null; closed: boolean;
};

const objectiveColumns = "o.id, o.cycle_id, o.level, o.team_id, o.parent_id, o.carried_from, o.owner, o.title, o.why, o.visibility, o.score, o.learned, o.retro_by, o.retro_at, o.created_by, o.created_at";

function toKeyResult(r: KeyResultRow, now: Date, weekStart: Date): KeyResult {
  const start = Number(r.start_value), target = Number(r.target_value), current = Number(r.current_value);
  const p = progress(start, target, current);
  const last = r.last_at ?? null;
  return {
    id: String(r.id),
    objectiveId: String(r.objective_id),
    cycleId: String(r.cycle_id),
    title: r.title,
    kind: r.kind,
    unit: r.unit,
    currency: r.currency,
    start,
    target,
    current,
    weight: Number(r.weight),
    owner: r.owner,
    source: r.source,
    sourceMine: r.source_mine,
    sourceScope: r.source_scope,
    unitLocale: r.unit_locale,
    createdAt: r.created_at.toISOString(),
    progress: p,
    done: p >= 1,
    confidence: r.confidence,
    lastCheckIn: last?.toISOString() ?? null,
    stale: isStale(last ?? r.created_at, p >= 1, r.closed, now),
    thisWeek: last !== null && last.getTime() >= weekStart.getTime(),
  };
}

function toObjective(r: ObjectiveRow, keyResults: KeyResult[]): Objective {
  return {
    id: String(r.id),
    cycleId: String(r.cycle_id),
    level: r.level,
    teamId: r.team_id === null ? null : String(r.team_id),
    parentId: r.parent_id === null ? null : String(r.parent_id),
    carriedFrom: r.carried_from === null ? null : String(r.carried_from),
    owner: r.owner,
    title: r.title,
    why: r.why,
    visibility: r.visibility,
    score: r.score === null ? null : Number(r.score),
    learned: r.learned,
    retroBy: r.retro_by,
    retroAt: r.retro_at?.toISOString() ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at.toISOString(),
    keyResults,
    progress: objectiveProgress(keyResults),
    confidence: worst(keyResults.map(k => k.confidence)),
    stale: keyResults.some(k => k.stale),
  };
}

async function keyResultsOf(sql: Query, objectiveIds: string[], now: Date, weekStart: Date): Promise<Map<string, KeyResult[]>> {
  const found = new Map<string, KeyResult[]>();
  if (objectiveIds.length === 0) return found;
  const rows = await sql<KeyResultRow[]>`
    select k.id, k.objective_id, o.cycle_id, k.title, k.kind, k.unit, k.currency, k.start_value, k.target_value, k.current_value, k.weight, k.owner, k.source, k.source_mine, k.source_scope, k.unit_locale, k.created_at,
      c.confidence, c.created_at as last_at, (y.closed_at is not null) as closed
    from key_results k
    join objectives o on o.id = k.objective_id
    join cycles y on y.id = o.cycle_id
    left join lateral (select confidence, created_at from check_ins where key_result_id = k.id order by created_at desc, id desc limit 1) c on true
    where k.archived_at is null and k.objective_id in ${sql(objectiveIds)}
    order by k.position, k.id`;
  for (const r of rows) {
    const key = String(r.objective_id);
    found.set(key, [...(found.get(key) ?? []), toKeyResult(r, now, weekStart)]);
  }
  return found;
}

async function withKeyResults(sql: Query, rows: ObjectiveRow[], now: Date, weekStart: Date): Promise<Objective[]> {
  const krs = await keyResultsOf(sql, rows.map(r => String(r.id)), now, weekStart);
  return rows.map(r => toObjective(r, krs.get(String(r.id)) ?? []));
}

export type Clock = { now: Date; weekStart: Date };

// Who reads: what confidential objectives they may see (lib/access.ts,
// `seesObjective`, says the same in words). null: the tool itself (a
// schedule, an export for the Chest) — everything.
export type Reader = { id: string; admin: boolean; groups: readonly string[] } | null;

// The objectives a reader sees: those for everyone, and a confidential one
// when they own it or one of its key results, are among its people, are in
// its team (a group of the Chest), or are an admin.
export function visibleTo(sql: Query, reader: Reader) {
  if (reader === null || reader.admin) return sql``;
  return sql`and (o.visibility = 'everyone' or o.owner = ${reader.id}
    or exists (select 1 from key_results kv where kv.objective_id = o.id and kv.archived_at is null and kv.owner = ${reader.id})
    or (o.visibility = 'people' and exists (select 1 from objective_viewers v where v.objective_id = o.id and v.member_id = ${reader.id}))
    ${reader.groups.length > 0 ? sql`or (o.visibility = 'team' and exists (select 1 from teams tv where tv.id = o.team_id and tv.group_id in ${sql([...reader.groups])}))` : sql``})`;
}

// Every objective of a cycle (not archived) this reader sees, in order.
export async function cycleObjectives(sql: Query, cycleId: string, clock: Clock, reader: Reader): Promise<Objective[]> {
  const rows = await sql<ObjectiveRow[]>`select ${sql.unsafe(objectiveColumns)} from objectives o where o.cycle_id = ${cycleId} and o.archived_at is null ${visibleTo(sql, reader)}
    order by array_position(array['company','team','personal'], o.level), o.position, o.id limit 1000`;
  return withKeyResults(sql, rows, clock.now, clock.weekStart);
}

export async function objectiveById(sql: Query, objectiveId: string, clock: Clock, reader: Reader, options: { archived?: boolean } = {}): Promise<Objective | null> {
  const rows = await sql<ObjectiveRow[]>`select ${sql.unsafe(objectiveColumns)} from objectives o where o.id = ${objectiveId} ${options.archived ? sql`` : sql`and o.archived_at is null`} ${visibleTo(sql, reader)}`;
  const [found] = await withKeyResults(sql, rows, clock.now, clock.weekStart);
  return found ?? null;
}

// Who, besides its owners and the admins, sees a confidential objective.
export async function viewersOf(sql: Query, objectiveId: string): Promise<string[]> {
  return (await sql<{ member_id: string }[]>`select member_id from objective_viewers where objective_id = ${objectiveId} order by member_id`).map(r => r.member_id);
}

// What a member owns in the cycles that are not closed: their objectives,
// and the objectives holding a key result of theirs.
export async function ownedBy(sql: Query, memberId: string, clock: Clock): Promise<Objective[]> {
  const rows = await sql.unsafe<ObjectiveRow[]>(`
    select ${objectiveColumns} from objectives o join cycles y on y.id = o.cycle_id
    where o.archived_at is null and y.closed_at is null
      and (o.owner = $1 or exists (select 1 from key_results k where k.objective_id = o.id and k.archived_at is null and k.owner = $1))
    order by y.current desc, y.starts_on desc, array_position(array['company','team','personal'], o.level), o.position, o.id limit 300`, [memberId]);
  return withKeyResults(sql, rows, clock.now, clock.weekStart);
}

// The key results waiting for their owners' check-in this week, per owner:
// in a cycle not closed that runs today, not done, created before this
// week, and nothing checked in since Monday.
export async function waitingCounts(sql: Query, owners: string[] | null, clock: Clock & { today: string }): Promise<Map<string, number>> {
  const rows = owners === null
    ? await sql<{ owner: string; n: string }[]>`${waitingQuery(sql, clock)} group by k.owner`
    : owners.length === 0 ? [] : await sql<{ owner: string; n: string }[]>`${waitingQuery(sql, clock)} and k.owner in ${sql(owners)} group by k.owner`;
  const counts = new Map<string, number>((owners ?? []).map(o => [o, 0]));
  for (const r of rows) counts.set(r.owner, Number(r.n));
  return counts;
}

function waitingQuery(sql: Query, clock: Clock & { today: string }) {
  return sql`
    select k.owner, count(*) as n from key_results k
    join objectives o on o.id = k.objective_id and o.archived_at is null
    join cycles y on y.id = o.cycle_id and y.closed_at is null and y.starts_on <= ${clock.today} and y.ends_on >= ${clock.today}
    where k.archived_at is null and k.owner like 'mbr\\_%'
      and k.created_at < ${clock.weekStart}
      and not (case when k.target_value > k.start_value then k.current_value >= k.target_value else k.current_value <= k.target_value end)
      and not exists (select 1 from check_ins c where c.key_result_id = k.id and c.created_at >= ${clock.weekStart})`;
}

// The titles of a member's waiting key results (the reminder's body).
export async function waitingTitles(sql: Query, owner: string, clock: Clock & { today: string }): Promise<string[]> {
  const rows = await sql<{ title: string }[]>`
    select k.title from key_results k
    join objectives o on o.id = k.objective_id and o.archived_at is null
    join cycles y on y.id = o.cycle_id and y.closed_at is null and y.starts_on <= ${clock.today} and y.ends_on >= ${clock.today}
    where k.archived_at is null and k.owner = ${owner}
      and k.created_at < ${clock.weekStart}
      and not (case when k.target_value > k.start_value then k.current_value >= k.target_value else k.current_value <= k.target_value end)
      and not exists (select 1 from check_ins c where c.key_result_id = k.id and c.created_at >= ${clock.weekStart})
    order by y.starts_on, o.position, k.position, k.id limit 50`;
  return rows.map(r => r.title);
}

export type CheckIn = { id: string; keyResultId: string; value: number; confidence: Confidence; note: string; author: string; at: string };

export async function checkIns(sql: Query, keyResultIds: string[], perKeyResult = 60): Promise<Map<string, CheckIn[]>> {
  const found = new Map<string, CheckIn[]>();
  if (keyResultIds.length === 0) return found;
  const rows = await sql<{ id: string; key_result_id: string; value: string; confidence: Confidence; note: string; author: string; created_at: Date }[]>`
    select id, key_result_id, value, confidence, note, author, created_at from (
      select c.*, row_number() over (partition by key_result_id order by created_at desc, id desc) as n from check_ins c where key_result_id in ${sql(keyResultIds)}
    ) x where n <= ${perKeyResult} order by created_at, id`;
  for (const r of rows) {
    const key = String(r.key_result_id);
    found.set(key, [...(found.get(key) ?? []), { id: String(r.id), keyResultId: key, value: Number(r.value), confidence: r.confidence, note: r.note, author: r.author, at: r.created_at.toISOString() }]);
  }
  return found;
}

// Who has not checked in this week, key result by key result: what a
// manager chases on Friday. Every such key result of the cycles running
// today, or only those of objectives `objectiveOwner` owns. With when each
// was last checked in (null: never).
export type Waiting = { keyResultId: string; title: string; objectiveId: string; objectiveTitle: string; owner: string; lastCheckIn: string | null; createdAt: string };
export async function waitingList(sql: Query, clock: Clock & { today: string }, options: { objectiveOwner?: string } = {}): Promise<Waiting[]> {
  const rows = await sql<{ id: string; title: string; objective_id: string; objective_title: string; owner: string; last_at: Date | null; created_at: Date }[]>`
    select k.id, k.title, o.id as objective_id, o.title as objective_title, k.owner, k.created_at,
      (select max(created_at) from check_ins c where c.key_result_id = k.id) as last_at
    from key_results k
    join objectives o on o.id = k.objective_id and o.archived_at is null
    join cycles y on y.id = o.cycle_id and y.closed_at is null and y.starts_on <= ${clock.today} and y.ends_on >= ${clock.today}
    where k.archived_at is null and k.owner like 'mbr\\_%'
      ${options.objectiveOwner ? sql`and o.owner = ${options.objectiveOwner}` : sql``}
      and k.created_at < ${clock.weekStart}
      and not (case when k.target_value > k.start_value then k.current_value >= k.target_value else k.current_value <= k.target_value end)
      and not exists (select 1 from check_ins c where c.key_result_id = k.id and c.created_at >= ${clock.weekStart})
    order by k.owner, last_at nulls first, k.id limit 1000`;
  return rows.map(r => ({ keyResultId: String(r.id), title: r.title, objectiveId: String(r.objective_id), objectiveTitle: r.objective_title, owner: r.owner, lastCheckIn: r.last_at?.toISOString() ?? null, createdAt: r.created_at.toISOString() }));
}

// The changes made to key results after they were written (lib/key-results.ts).
export type Change = { id: string; keyResultId: string; field: "title" | "kind" | "unit" | "start" | "target" | "weight" | "owner"; before: string; after: string; author: string; at: string };
export async function keyResultChanges(sql: Query, keyResultIds: string[]): Promise<Map<string, Change[]>> {
  const found = new Map<string, Change[]>();
  if (keyResultIds.length === 0) return found;
  const rows = await sql<{ id: string; key_result_id: string; field: Change["field"]; before: string; after: string; author: string; created_at: Date }[]>`
    select id, key_result_id, field, before, after, author, created_at from key_result_changes where key_result_id in ${sql(keyResultIds)} order by created_at, id limit 2000`;
  for (const r of rows) {
    const key = String(r.key_result_id);
    found.set(key, [...(found.get(key) ?? []), { id: String(r.id), keyResultId: key, field: r.field, before: r.before, after: r.after, author: r.author, at: r.created_at.toISOString() }]);
  }
  return found;
}
