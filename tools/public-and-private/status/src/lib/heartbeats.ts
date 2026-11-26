import { createHash, randomBytes } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { id } from "./model.ts";

// Heartbeats: a job of the company (a nightly backup, an import, a cron
// task) calls a secret address after each run; when it stays silent longer
// than expected, the editors are told — like a failed check, and nothing
// is posted publicly by itself. It needs no outbound network: the job
// calls the tool. Silence is noticed by the "updates" pass (Proposal
// (studio): schedules, every 15 minutes; or an editor's visit), so a
// missed beat is told up to 15 minutes after its deadline. Uptime Kuma's
// "push monitors" and Better Stack's heartbeats work the same way (ideas
// only, reports/02-open-source/status.md).

export const heartbeatLimits = { max: 20, grace: 5 } as const;
// How often a job is expected to call, in minutes: every 15 minutes (the
// pass's own rhythm) to once a week.
export const heartbeatEvery = [15, 30, 60, 360, 1440, 10080] as const;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const tokenPattern = /^[A-Za-z0-9_-]{43}$/u;

export type Heartbeat = { componentId: string; every: number; lastSeen: Date | null; downSince: Date | null; createdAt: Date };

function editor(actor: Member | null): void {
  if (!can(actor, "components")) throw new AppError("forbidden");
}

// createHeartbeat gives a service a new secret address (replacing its old
// one, which stops working). The token is returned once: only its hash is
// kept.
export async function createHeartbeat(sql: Sql, actor: Member | null, componentId: unknown, every: unknown): Promise<{ token: string }> {
  editor(actor);
  const key = id(componentId);
  const minutes = typeof every === "string" ? Number(every) : every;
  if (!(heartbeatEvery as readonly unknown[]).includes(minutes)) throw new AppError("invalid");
  const token = randomBytes(32).toString("base64url");
  await sql.begin(async tx => {
    const [c] = await tx`select 1 from components where id = ${key} and kind = 'component'`;
    if (!c) throw new AppError("not_found");
    const [{ count }] = (await tx<{ count: number }[]>`select count(*)::int as count from heartbeats where component_id <> ${key}`) as unknown as [{ count: number }];
    if (count >= heartbeatLimits.max) throw new AppError("too_many", { max: heartbeatLimits.max });
    await tx`
      insert into heartbeats (component_id, token_hash, every, grace)
      values (${key}, ${hash(token)}, ${minutes as number}, ${heartbeatLimits.grace})
      on conflict (component_id) do update set token_hash = excluded.token_hash, every = excluded.every, last_seen = null, down_since = null, created_at = now()`;
  });
  return { token };
}

export async function removeHeartbeat(sql: Sql, actor: Member | null, componentId: unknown): Promise<void> {
  editor(actor);
  const rows = await sql`delete from heartbeats where component_id = ${id(componentId)} returning component_id`;
  if (rows.length === 0) throw new AppError("not_found");
}

export async function listHeartbeats(sql: Query): Promise<Heartbeat[]> {
  const rows = await sql<{ component_id: string; every: number; last_seen: Date | null; down_since: Date | null; created_at: Date }[]>`
    select component_id, every, last_seen, down_since, created_at from heartbeats order by component_id`;
  return rows.map(r => ({ componentId: String(r.component_id), every: r.every, lastSeen: r.last_seen ? new Date(r.last_seen) : null, downSince: r.down_since ? new Date(r.down_since) : null, createdAt: new Date(r.created_at) }));
}

// beat records a call of the job; a heartbeat that was silent comes back
// (its editors are told once). An unknown token names nothing.
export async function beat(sql: Query, token: unknown, now = new Date()): Promise<{ componentId: string; back: boolean } | null> {
  if (typeof token !== "string" || !tokenPattern.test(token)) return null;
  // Two calls at once may both say "back": the editors' bell item is
  // keyed, the second replaces the first.
  const [row] = await sql<{ component_id: string; was_down: boolean }[]>`
    with old as (select component_id, down_since is not null as was_down from heartbeats where token_hash = ${hash(token)})
    update heartbeats h set last_seen = ${now}, down_since = null
    from old where h.component_id = old.component_id
    returning h.component_id, old.was_down`;
  return row ? { componentId: String(row.component_id), back: row.was_down } : null;
}

// silent marks the heartbeats whose job missed its deadline (the last call,
// or the creation, plus `every` and a grace) and returns them, once each.
export async function silent(sql: Query, now = new Date()): Promise<{ componentId: string; since: Date }[]> {
  const rows = await sql<{ component_id: string; since: Date }[]>`
    update heartbeats set down_since = coalesce(last_seen, created_at) + make_interval(mins => every)
    where down_since is null and coalesce(last_seen, created_at) + make_interval(mins => every + grace) < ${now}
    returning component_id, down_since as since`;
  return rows.map(r => ({ componentId: String(r.component_id), since: new Date(r.since) }));
}
