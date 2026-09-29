import * as checks from "@argentic/chest-sdk/checks";
import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { id } from "./model.ts";

// Checks run by the Chest (Proposal (studio): the checks module). A tool
// has no network: the Chest probes the addresses the editors give, from
// outside, and posts each result to /chest-checks. The tool keeps the
// results 90 days, counts failures in a row, and tells the editors — it
// never posts a public incident by itself: a person decides.

export const checkLimits = { watches: 10, failuresToAlert: 3, keepDays: 90 } as const;
export const everyChoices = [1, 2, 5, 10, 15, 30, 60] as const;

export type Watch = { componentId: string; name: string; url: string; every: number; expectStatus: number; maxMs: number };
type WatchRow = { component_id: string; name: string; url: string; every: number; expect_status: number; max_ms: number };
const shape = (r: WatchRow): Watch => ({ componentId: String(r.component_id), name: r.name, url: r.url, every: r.every, expectStatus: r.expect_status, maxMs: r.max_ms });
export const checkName = (componentId: string) => `c-${componentId}`;

export async function listWatches(sql: Query): Promise<Watch[]> {
  return (await sql<WatchRow[]>`select component_id, name, url, every, expect_status, max_ms from watches order by component_id`).map(shape);
}

// An address the Chest may probe: https, no user or password, not a
// private network — the Chest refuses those anyway.
export function watchUrl(value: unknown): string {
  if (typeof value !== "string") throw new AppError("invalid_url");
  const text = value.trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new AppError("invalid_url");
  }
  if (url.protocol !== "https:" || url.username || url.password || text.length > 2000) throw new AppError("invalid_url");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/u.test(host) || host.startsWith("[")) throw new AppError("invalid_url");
  return url.toString();
}

const integer = (value: unknown, min: number, max: number): number => {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw new AppError("invalid");
  return n;
};

export type WatchInput = { componentId: unknown; url: unknown; every?: unknown; expectStatus?: unknown; maxMs?: unknown };

// saveWatches sets every watch at once, from the form: a component with an
// empty address is not watched. Results of a component no longer watched
// stay until they are 90 days old (its measured uptime goes with them).
export async function saveWatches(sql: Sql, actor: Member | null, input: unknown): Promise<Watch[]> {
  if (!can(actor, "components")) throw new AppError("forbidden");
  if (!Array.isArray(input)) throw new AppError("invalid");
  const wanted = new Map<string, Omit<Watch, "componentId" | "name">>();
  for (const raw of input as WatchInput[]) {
    if (raw === null || typeof raw !== "object") throw new AppError("invalid");
    const componentId = id(raw.componentId);
    if (typeof raw.url === "string" && raw.url.trim() === "") continue;
    wanted.set(componentId, {
      url: watchUrl(raw.url),
      every: integer(raw.every ?? 5, 1, 60),
      expectStatus: integer(raw.expectStatus ?? 200, 100, 599),
      maxMs: integer(raw.maxMs ?? 3000, 100, 30000),
    });
  }
  if (wanted.size > checkLimits.watches) throw new AppError("too_many", { max: checkLimits.watches });
  return sql.begin(async tx => {
    const ids = [...wanted.keys()];
    if (ids.length) {
      const found = await tx<{ id: string }[]>`select id from components where id = any(${ids}::bigint[]) and kind = 'component'`;
      if (found.length !== ids.length) throw new AppError("invalid");
    }
    await tx`delete from watches where not (component_id = any(${ids}::bigint[]))`;
    await tx`delete from check_states where not (component_id = any(${ids}::bigint[]))`;
    for (const [componentId, w] of wanted) {
      await tx`
        insert into watches (component_id, name, url, every, expect_status, max_ms)
        values (${componentId}, ${checkName(componentId)}, ${w.url}, ${w.every}, ${w.expectStatus}, ${w.maxMs})
        on conflict (component_id) do update set url = excluded.url, every = excluded.every, expect_status = excluded.expect_status, max_ms = excluded.max_ms, updated_at = now()`;
    }
    return (await tx<WatchRow[]>`select component_id, name, url, every, expect_status, max_ms from watches order by component_id`).map(shape);
  });
}

// syncChest hands the Chest the whole list. "unavailable": this Chest does
// not run checks yet (or could not be reached) — the addresses stay saved
// and the tool works as before.
export async function syncChest(sql: Query): Promise<"running" | "unavailable"> {
  const list = await listWatches(sql);
  try {
    await checks.configure(list.map(w => ({ name: w.name, url: w.url, every: w.every, expect: { status: w.expectStatus, maxMs: w.maxMs } })));
    return "running";
  } catch (error) {
    if (error instanceof ChestError) return "unavailable";
    throw error;
  }
}

// ---- Results ---------------------------------------------------------------

export type Change = { componentId: string; kind: "down" | "up"; error: checks.CheckResult["error"]; status: number | null; ms: number; since: Date } | null;

// record keeps one result (twice is harmless: its id) and says whether the
// component just went down (three failures in a row) or came back. Results
// may arrive out of order: the state is read from the latest three by time.
export async function record(sql: Sql, result: checks.CheckResult): Promise<Change> {
  return sql.begin(async tx => {
    const [watch] = await tx<{ component_id: string }[]>`select component_id from watches where name = ${result.name}`;
    if (!watch) return null;
    const componentId = String(watch.component_id);
    const inserted = await tx`
      insert into check_results (id, component_id, at, ok, status, ms, error)
      values (${result.id}, ${componentId}, ${new Date(result.at)}, ${result.ok}, ${result.status}, ${result.ms}, ${result.error})
      on conflict (id) do nothing returning id`;
    if (inserted.length === 0) return null;
    await tx`insert into check_states (component_id) values (${componentId}) on conflict do nothing`;
    const [state] = await tx<{ down_since: Date | null }[]>`select down_since from check_states where component_id = ${componentId} for update`;
    const last = await tx<{ at: Date; ok: boolean; status: number | null; ms: number; error: checks.CheckResult["error"] }[]>`
      select at, ok, status, ms, error from check_results where component_id = ${componentId} order by at desc, id desc limit ${checkLimits.failuresToAlert}`;
    const latest = last[0]!;
    const down = last.length === checkLimits.failuresToAlert && last.every(r => !r.ok);
    if (down && !state?.down_since) {
      const since = new Date(last.at(-1)!.at);
      await tx`update check_states set down_since = ${since}, changed_at = now() where component_id = ${componentId}`;
      return { componentId, kind: "down", error: latest.error, status: latest.status, ms: latest.ms, since };
    }
    if (latest.ok && state?.down_since) {
      await tx`update check_states set down_since = null, changed_at = now() where component_id = ${componentId}`;
      return { componentId, kind: "up", error: null, status: latest.status, ms: latest.ms, since: new Date(latest.at) };
    }
    return null;
  });
}

export type CheckStatus = { componentId: string; downSince: Date | null; failures: number; last: { at: Date; ok: boolean; status: number | null; ms: number; error: string | null } | null };

// Where every watched component stands: down or not, failures in a row,
// the last result.
export async function statuses(sql: Query): Promise<Map<string, CheckStatus>> {
  const rows = await sql<{ component_id: string; down_since: Date | null; at: Date | null; ok: boolean | null; status: number | null; ms: number | null; error: string | null; failures: number }[]>`
    select w.component_id, s.down_since, r.at, r.ok, r.status, r.ms, r.error,
      (select count(*)::int from check_results f where f.component_id = w.component_id and not f.ok
         and f.at > coalesce((select max(g.at) from check_results g where g.component_id = w.component_id and g.ok), '-infinity')) as failures
    from watches w
      left join check_states s on s.component_id = w.component_id
      left join lateral (select at, ok, status, ms, error from check_results x where x.component_id = w.component_id order by at desc, id desc limit 1) r on true`;
  return new Map(rows.map(r => [String(r.component_id), {
    componentId: String(r.component_id),
    downSince: r.down_since ? new Date(r.down_since) : null,
    failures: r.failures,
    last: r.at ? { at: new Date(r.at), ok: Boolean(r.ok), status: r.status, ms: r.ms ?? 0, error: r.error } : null,
  }]));
}

// A measured figure is published only once it means something: at least
// a full day of checks (the first result 24 hours old) and at least 24 of
// them (one an hour at the slowest rhythm). Before that, one failed check
// out of four would show customers "25 %": the page says "measured from
// <date>" without a number (README, "Automatic checks").
export const measuredSample = { hours: 24, checks: 24 } as const;

export type Measured = { percent: number | null; since: Date; count: number };

// measured is each watched component's share of checks answered in time
// since `since` (and the first result counted): an uptime that was
// measured, beside the one the team declared — percent null while the
// sample is too small (measuredSample).
export async function measured(sql: Query, since: Date, now = new Date()): Promise<Map<string, Measured>> {
  const rows = await sql<{ component_id: string; total: number; good: number; first: Date }[]>`
    select r.component_id, count(*)::int as total, count(*) filter (where r.ok)::int as good, min(r.at) as first
    from check_results r join watches w on w.component_id = r.component_id
    where r.at >= ${since} group by r.component_id`;
  const enough = (first: Date, total: number) => total >= measuredSample.checks && now.getTime() - new Date(first).getTime() >= measuredSample.hours * 3600000;
  return new Map(rows.filter(r => r.total > 0).map(r => [String(r.component_id), { percent: enough(r.first, r.total) ? (r.good / r.total) * 100 : null, since: new Date(r.first), count: r.total }]));
}

// purge forgets results older than 90 days (the "updates" schedule).
export async function purge(sql: Query, now = new Date()): Promise<number> {
  const rows = await sql`delete from check_results where at < ${new Date(now.getTime() - checkLimits.keepDays * 86400000)} returning id`;
  return rows.length;
}
