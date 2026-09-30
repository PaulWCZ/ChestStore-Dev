import { createHash, randomBytes } from "node:crypto";
import * as chest from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, ChestError, QuotaExceeded, RateLimited, Unavailable } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as webhooks from "@argentic/chest-sdk/webhooks";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { allComponents, inLocale } from "./components.ts";
import type { Query, Sql } from "./db.ts";
import { catalogue, format, isLocale, stamp, type Catalogue } from "./i18n/index.ts";
import { chestLanguage } from "./languages.ts";
import type { Step } from "./model.ts";
import { company, publicOrigin } from "./settings.ts";
import { choice } from "./subscribers.ts";
import { pick } from "./texts.ts";

// Updates in a chat or at a web address (Proposal (studio): webhooks,
// sdk/README.md): on "Get updates", a visitor — a B2B customer's team —
// gives the address of a Slack or Teams channel, or of any https receiver
// (their own server, Zapier: JSON signed by the Chest), and what to
// follow. The tool never connects to it: the Chest checks the address
// (https, public, the provider's shape; a generic receiver must answer a
// signed ping — that is the proof someone set it up), keeps it encrypted,
// delivers, retries, stops what keeps failing and tells the tool.
//
// Each subscription has its own page (/w/<token>, the link shown once,
// like a password): what it follows, whether the Chest delivers, "Try
// again" once stopped, "Stop the updates". The same rules as email: what
// happens now only (never a backfill), never about services for the team
// only, in the subscriber's language when the team wrote it.

export const hookKinds = ["slack", "teams", "generic"] as const;
export type HookKind = (typeof hookKinds)[number];
export const hookLimits = { subscribers: 200 } as const;

export type HookSubscriber = { id: string; target: string; kind: HookKind; shown: string; language: string; components: string[] | null; token: string; createdAt: Date; disabledAt: Date | null; lastError: string | null };
type Row = { id: string; target: string; kind: HookKind; shown: string; language: string; components: string[] | null; token: string; secret_once: string | null; created_at: Date; disabled_at: Date | null; last_error: string | null };
const shape = (r: Row): HookSubscriber => ({ id: String(r.id), target: r.target, kind: r.kind, shown: r.shown, language: r.language, components: r.components === null ? null : r.components.map(String), token: r.token, createdAt: new Date(r.created_at), disabledAt: r.disabled_at ? new Date(r.disabled_at) : null, lastError: r.last_error });

const tokenPattern = /^[A-Za-z0-9_-]{32}$/u;
const newToken = () => randomBytes(24).toString("base64url");
const isKind = (value: unknown): value is HookKind => typeof value === "string" && (hookKinds as readonly string[]).includes(value);

// ---- Whether this Chest delivers -------------------------------------------

// Remembered like mail's: "none" once the Chest said it cannot, tried again
// after a day (a Chest that gains webhooks offers them again by itself).
// Pages ask the Chest first (hooksDelivery, below); this is what they fall
// back on when the Chest does not answer.
type HooksState = "ok" | "none" | "unknown";
export async function hooksState(sql: Query, now = new Date()): Promise<HooksState> {
  const [row] = await sql<{ value: { state: HooksState; at: string } }[]>`select value from settings where key = 'hooks_state'`;
  if (!row) return "unknown";
  if (row.value.state === "none" && now.getTime() - Date.parse(row.value.at) > 86400000) return "unknown";
  return row.value.state;
}
async function setHooksState(sql: Query, state: "ok" | "none", now = new Date()): Promise<void> {
  await sql`insert into settings (key, value) values ('hooks_state', ${sql.json({ state, at: now.toISOString() } as never)}) on conflict (key) do update set value = excluded.value`;
}

// Whether the Chest would deliver to a chat now (webhooks.available(),
// studio.16), asked before a page offers it: "ok" (with the addresses
// used, "3 of 200"); "paused" — the Chest's owner paused this tool's
// notices (nothing goes, the channels are kept); "none" — no webhooks on
// this Chest; "unknown" when the Chest does not answer and nothing was
// learnt. A snapshot: a delivery can still fail, and its page says so.
export type HooksDelivery = { state: HooksState | "paused"; targets: number | null; max: number | null };

export async function hooksDelivery(sql: Query, now = new Date()): Promise<HooksDelivery> {
  try {
    const answer = await webhooks.available();
    if (answer.ok) return { state: "ok", targets: answer.targets, max: answer.max };
    return { state: answer.reason === "suspended" ? "paused" : "none", targets: null, max: null };
  } catch (error) {
    if (!(error instanceof Unavailable)) throw error;
    return { state: await hooksState(sql, now), targets: null, max: null };
  }
}

// ---- Subscribing (public: no member) ---------------------------------------

// subscribeHook asks the Chest to deliver to an address, then keeps the
// subscription. Says it, and whether a generic receiver's secret waits to
// be shown once on its page.
export async function subscribeHook(sql: Sql, input: { kind: unknown; url: unknown; language: string; components: unknown }): Promise<HookSubscriber> {
  if (!isKind(input.kind)) throw new AppError("invalid");
  const kind = input.kind;
  const url = typeof input.url === "string" ? input.url.trim().slice(0, 2100) : "";
  const language = /^[a-z]{2}$/u.test(input.language) ? input.language : "en";
  if (webhooks.checkUrl(url, kind).length > 0) throw new AppError(kind === "slack" ? "hook_slack" : kind === "teams" ? "hook_teams" : "hook_address");
  const components = await choice(sql, input.components);
  const [{ n }] = (await sql<{ n: number }[]>`select count(*)::int as n from hook_subscribers`) as unknown as [{ n: number }];
  if (n >= hookLimits.subscribers) throw new AppError("too_many", { max: hookLimits.subscribers });
  let added: Awaited<ReturnType<typeof webhooks.add>>;
  try {
    // The label the owner reads on the Chest's page for this tool; never
    // the address (a secret) nor anything the visitor typed.
    added = await webhooks.add({ url, kind, label: `Status subscriber (${kind}) ${createHash("sha256").update(url).digest("hex").slice(0, 6)}` });
  } catch (error) {
    if (error instanceof CapabilityNotGranted) {
      await setHooksState(sql, "none");
      throw new AppError("no_hooks");
    }
    if (error instanceof QuotaExceeded) throw new AppError("too_many", { max: hookLimits.subscribers });
    if (error instanceof ChestError && error.code === "suspended") throw new AppError("hooks_paused");
    if (error instanceof ChestError && error.code === "verification_failed") throw new AppError("hook_no_answer");
    if (error instanceof ChestError && (error.code === "invalid_target" || error.code === "address_refused")) throw new AppError(kind === "slack" ? "hook_slack" : kind === "teams" ? "hook_teams" : "hook_address");
    throw error;
  }
  await setHooksState(sql, "ok");
  const [row] = await sql<Row[]>`
    insert into hook_subscribers (target, kind, shown, language, components, token, secret_once)
    values (${added.id}, ${kind}, ${added.target.url.slice(0, 300)}, ${language}, ${components}::bigint[], ${newToken()}, ${added.secret})
    returning *`;
  return shape(row!);
}

// The subscription a link names, or null: the token is the only key.
export async function hookByToken(sql: Query, token: unknown): Promise<HookSubscriber | null> {
  if (typeof token !== "string" || !tokenPattern.test(token)) return null;
  const [row] = await sql<Row[]>`select * from hook_subscribers where token = ${token}`;
  return row ? shape(row) : null;
}

// takeSecret gives a generic receiver's secret key once — the first time
// its page is shown after subscribing — and forgets it.
export async function takeSecret(sql: Query, token: unknown): Promise<string | null> {
  if (typeof token !== "string" || !tokenPattern.test(token)) return null;
  const [row] = await sql<{ id: string; secret_once: string | null }[]>`select id, secret_once from hook_subscribers where token = ${token}`;
  if (!row?.secret_once) return null;
  const taken = await sql`update hook_subscribers set secret_once = null where id = ${row.id} and secret_once is not null returning id`;
  return taken.length > 0 ? row.secret_once : null;
}

export async function chooseHook(sql: Sql, token: unknown, components: unknown): Promise<HookSubscriber> {
  const h = await hookByToken(sql, token);
  if (!h) throw new AppError("not_found");
  const picked = await choice(sql, components);
  const [row] = await sql<Row[]>`update hook_subscribers set components = ${picked}::bigint[] where id = ${h.id} returning *`;
  return shape(row!);
}

// forget asks the Chest to forget an address (already gone is fine), then
// deletes the subscription.
async function forget(sql: Query, h: Pick<HookSubscriber, "id" | "target">): Promise<void> {
  try {
    await webhooks.remove(h.target);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    if (!(error instanceof CapabilityNotGranted) && error.code !== "target_not_found" && error.code !== "not_found") throw error;
  }
  await sql`delete from hook_subscribers where id = ${h.id}`;
}

export async function unsubscribeHook(sql: Sql, token: unknown): Promise<void> {
  const h = await hookByToken(sql, token);
  if (!h) throw new AppError("not_found");
  await forget(sql, h);
}

// retryHook: the subscriber fixed their channel; the Chest tries it again
// (a ping first for a generic receiver).
export async function retryHook(sql: Sql, token: unknown): Promise<void> {
  const h = await hookByToken(sql, token);
  if (!h) throw new AppError("not_found");
  try {
    await webhooks.enable(h.target);
  } catch (error) {
    if (error instanceof CapabilityNotGranted) throw new AppError("no_hooks");
    if (error instanceof ChestError && error.code === "suspended") throw new AppError("hooks_paused");
    if (error instanceof ChestError && (error.code === "target_not_found" || error.code === "not_found")) {
      await sql`delete from hook_subscribers where id = ${h.id}`;
      throw new AppError("not_found");
    }
    if (error instanceof ChestError && error.code === "verification_failed") throw new AppError("hook_no_answer");
    throw error;
  }
  await sql`update hook_subscribers set disabled_at = null, last_error = null where id = ${h.id}`;
}

// hookDisabled: the Chest stopped delivering to an address
// (webhook.disabled, POST /chest-webhooks). Its page says so.
export async function hookDisabled(sql: Query, event: webhooks.WebhookEvent): Promise<boolean> {
  const rows = await sql`update hook_subscribers set disabled_at = coalesce(disabled_at, ${new Date(event.at)}), last_error = ${(event.lastError ?? event.reason).slice(0, 200)} where target = ${event.target} returning id`;
  return rows.length > 0;
}

// ---- Editors ---------------------------------------------------------------

export type ListedHook = HookSubscriber & { status: "delivered" | "failed" | "disabled" | null };

export async function listHooks(sql: Query, actor: Member | null): Promise<ListedHook[]> {
  if (!can(actor, "subscribers")) throw new AppError("forbidden");
  const rows = (await sql<Row[]>`select * from hook_subscribers order by created_at, id`).map(shape);
  let remote = new Map<string, webhooks.WebhookTarget>();
  try {
    if (rows.length > 0) remote = new Map((await webhooks.list()).map(w => [w.id, w]));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return rows.map(h => {
    const w = remote.get(h.target);
    return { ...h, shown: w?.url ?? h.shown, lastError: w ? w.lastError : h.lastError, disabledAt: w ? (w.state === "disabled" ? h.disabledAt ?? new Date() : null) : h.disabledAt, status: w?.status ?? null };
  });
}

export async function removeHook(sql: Sql, actor: Member | null, id: unknown): Promise<void> {
  if (!can(actor, "subscribers")) throw new AppError("forbidden");
  const key = typeof id === "string" && /^[1-9][0-9]{0,17}$/u.test(id) ? id : null;
  const [row] = key ? await sql<Row[]>`select * from hook_subscribers where id = ${key}` : [];
  if (!row) throw new AppError("not_found");
  await forget(sql, shape(row));
}

// ---- Sending ---------------------------------------------------------------

// queueHooks is announce()'s part for these subscriptions: inside the
// update's transaction, one per subscription that follows one of these
// services (or everything) — never about services for the team only.
export async function queueHooks(sql: Query, updateId: string, componentIds: string[]): Promise<void> {
  await sql`
    insert into hook_queue (hook_subscriber_id, update_id)
    select h.id, ${updateId} from hook_subscribers h
    where h.disabled_at is null and (h.components is null or h.components && ${componentIds}::bigint[])
      and exists (select 1 from components c where c.id = any(${componentIds}::bigint[]) and not c.team_only)
    on conflict do nothing`;
}

type Queued = {
  id: string; attempts: number; hook_id: string; target: string; language: string;
  update_id: string; status: Step; body: string; body_second: string | null; posted_at: Date;
  incident_id: string; kind: "incident" | "maintenance"; title: string; title_second: string | null; incident_language: string | null; second_language: string | null;
  incident_status: string; started_at: Date; ends_at: Date | null; resolved_at: Date | null;
};

const wordsFor = (language: string): Catalogue => catalogue(isLocale(language) ? language : "en");

// The message of one update, in a language: what Slack and Teams show (a
// few plain lines), and the JSON a generic receiver gets.
export function hookMessage(q: Omit<Queued, "id" | "attempts" | "hook_id" | "target">, components: { id: string; name: string; state: string }[], origin: string, zone: string): { text: string; data: Record<string, unknown> } {
  const t = wordsFor(q.language);
  const name = company() || t.mail.team;
  const languages = { language: q.incident_language ?? chestLanguage(), secondLanguage: q.second_language ?? null };
  const title = pick(q.title, q.title_second, languages, q.language).text;
  const body = pick(q.body, q.body_second, languages, q.language).text;
  const link = origin ? `${origin}/incidents/${q.incident_id}` : "";
  const when = q.kind === "maintenance" && q.status === "scheduled" && q.ends_at
    ? format(t.mail.window, { from: stamp(q.started_at, zone, q.language), to: stamp(q.ends_at, zone, q.language), zone })
    : format(t.mail.when, { time: stamp(q.posted_at, zone, q.language), zone });
  const text = [
    format(t.hooks.head, { company: name, step: t.steps[q.status], title }),
    body,
    components.length ? format(t.mail.affected, { list: components.map(c => c.name).join(", ") }).trim() : "",
    when,
    link,
  ].filter(Boolean).join("\n").slice(0, 4000);
  return {
    text,
    data: {
      page: { name, url: origin || null },
      incident: { id: q.incident_id, kind: q.kind, title, status: q.incident_status, started_at: new Date(q.started_at).toISOString(), ends_at: q.ends_at ? new Date(q.ends_at).toISOString() : null, resolved_at: q.resolved_at ? new Date(q.resolved_at).toISOString() : null, url: link || null },
      update: { id: q.update_id, status: q.status, body, posted_at: new Date(q.posted_at).toISOString() },
      components,
      language: q.language,
    },
  };
}

// flushHooks hands what waits to the Chest, oldest first: right after an
// update (a few), then by the "updates" schedule. A Chest without webhooks
// empties nothing — the queue waits a day, then is dropped (the page then
// no longer offers these subscriptions).
export async function flushHooks(sql: Sql, options: { limit?: number; now?: Date } = {}): Promise<{ sent: number; stopped: "none" | "later" | null }> {
  const now = options.now ?? new Date();
  await sql`delete from hook_queue where created_at < ${new Date(now.getTime() - 86400000)} or attempts >= 5`;
  const batch = await sql<Queued[]>`
    select q.id, q.attempts, h.id as hook_id, h.target, h.language,
      u.id as update_id, u.status, u.body, u.body_second, u.posted_at,
      i.id as incident_id, i.kind, i.title, i.title_second, i.language as incident_language, i.second_language, i.status as incident_status, i.started_at, i.ends_at, i.resolved_at
    from hook_queue q
      join hook_subscribers h on h.id = q.hook_subscriber_id and h.disabled_at is null
      join updates u on u.id = q.update_id and u.removed_at is null
      join incidents i on i.id = u.incident_id and i.removed_at is null
    order by q.id limit ${Math.min(Math.max(options.limit ?? 50, 1), 500)}`;
  if (batch.length === 0) return { sent: 0, stopped: null };
  const origin = await publicOrigin(sql);
  const zone = chest.timeZone();
  const services = new Map((await allComponents(sql)).map(c => [c.id, c]));
  const incidentIds = [...new Set(batch.map(b => String(b.incident_id)))];
  const touched = await sql<{ incident_id: string; update_id: string | null; component_id: string; state: string }[]>`
    select u.incident_id, u.id as update_id, s.component_id, s.state from update_states s join updates u on u.id = s.update_id
    where u.incident_id = any(${incidentIds}::bigint[]) and u.removed_at is null
    union all select incident_id, null, component_id, 'maintenance' from maintenance_components where incident_id = any(${incidentIds}::bigint[])`;
  let sent = 0;
  for (const q of batch) {
    // The services this update names (its states), else all the incident
    // touched; never one for the team only.
    const own = touched.filter(r => String(r.update_id) === String(q.update_id));
    const rows = own.length > 0 ? own : touched.filter(r => String(r.incident_id) === String(q.incident_id));
    const seen = new Set<string>();
    const components = rows.flatMap(r => {
      const c = services.get(String(r.component_id));
      if (!c || c.teamOnly || seen.has(c.id)) return [];
      seen.add(c.id);
      return [{ id: c.id, name: inLocale(c, q.language).name, state: q.status === "resolved" || q.status === "completed" ? "operational" : r.state }];
    });
    const message = hookMessage(q, components, origin, zone);
    // The key names the Chest's target (whk_…), not our row's id, and the
    // update's time: after a restore, an id may name another channel or
    // another update, which the Chest would take for one it already has
    // (sdk/README, "Put the recipient in the key").
    try {
      const done = await webhooks.send([q.target], { event: q.kind === "maintenance" ? "maintenance.update" : "incident.update", ...message, key: `update:${q.update_id}:${new Date(q.posted_at).getTime()}:${q.target}` });
      for (const s of done.skipped) {
        if (s.reason === "not_found") await sql`delete from hook_subscribers where target = ${s.target}`;
        else await sql`update hook_subscribers set disabled_at = coalesce(disabled_at, now()) where target = ${s.target}`;
      }
    } catch (error) {
      if (error instanceof CapabilityNotGranted) {
        await setHooksState(sql, "none");
        return { sent, stopped: "none" };
      }
      // Paused by the Chest's owner (studio.16): kept, like a busy Chest —
      // the queue waits a day at most.
      if (error instanceof QuotaExceeded || error instanceof RateLimited || error instanceof Unavailable || (error instanceof ChestError && error.code === "suspended")) {
        await sql`update hook_queue set attempts = attempts + 1 where id = ${q.id}`;
        return { sent, stopped: "later" };
      }
      if (!(error instanceof ChestError)) throw error;
      // A message the Chest refuses (never expected): dropped, the next tried.
      console.warn(`hook delivery refused: ${error.code}`);
    }
    await sql`delete from hook_queue where id = ${q.id}`;
    sent++;
  }
  return { sent, stopped: null };
}

export async function hooksQueued(sql: Query): Promise<number> {
  const [{ n }] = (await sql<{ n: number }[]>`select count(*)::int as n from hook_queue`) as unknown as [{ n: number }];
  return n;
}
