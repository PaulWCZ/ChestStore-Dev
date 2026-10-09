import type { ToolEvent } from "@argentic/chest-sdk/events";
import type { Query, Sql } from "./db.ts";
import { addDays } from "./model.ts";
import { zone } from "./time.ts";
import { instantOf } from "./zone.ts";

// Where a key result's value may come from, besides its owner's hand: the
// store's other tools, through the events they publish (Proposal (studio):
// events between tools, once an admin linked the tools in the Chest).
//
//   crm.won_amount   Clients — the amount of deals won     (lib/crm.ts)
//   crm.won_count    Clients — the number of deals won     (lib/crm.ts)
//   tasks.done       Tasks — cards done (on one board, or all)
//   helpdesk.solved  Support — tickets solved
//   hiring.hired     Hiring — people hired
//
// Each counts what happened between its cycle's first and last day (the
// Chest's calendar), from the day the tools were linked (the Chest
// delivers events from then on; the past needs a query between tools, see
// the SDK report). "Only theirs" (source_mine) counts what names the key
// result's owner: a card they are assigned to, a ticket they solved, a
// hire they made. Nobody types the value; the owner's weekly update still
// says how sure they are.
//
// The contracts Goals reads (v1). The senders are the other tools;
// README.md, "With the other tools", says what each must publish.
// Anything of another shape is accepted and ignored — never half-kept.
//
//   tasks.card.done         { card, board, boardName, assignees: [mbr_…] }
//   tasks.card.reopened     { card }
//   helpdesk.ticket.solved  { ticket, assignee: mbr_… | null }
//   helpdesk.ticket.reopened { ticket }
//   hiring.hired            { candidate, …, hiredBy: mbr_… }  (Hiring's own shape; Goals keeps candidate and hiredBy only)
//   hiring.hire_cancelled   { candidate }

export const sources = ["crm.won_amount", "crm.won_count", "tasks.done", "helpdesk.solved", "hiring.hired"] as const;
export type Source = (typeof sources)[number];
export const isSource = (value: unknown): value is Source => typeof value === "string" && (sources as readonly string[]).includes(value);

// A source measures money (the CRM's amount) or counts things.
export const sourceKind = (source: Source): "money" | "number" => (source === "crm.won_amount" ? "money" : "number");
// "Only theirs" means something for these (the event names people).
export const mayBeMine = (source: Source): boolean => source === "tasks.done" || source === "helpdesk.solved" || source === "hiring.hired";

type Kind = "tasks.card" | "helpdesk.ticket" | "hiring.hire";
const kindOf: Record<Exclude<Source, "crm.won_amount" | "crm.won_count">, Kind> = { "tasks.done": "tasks.card", "helpdesk.solved": "helpdesk.ticket", "hiring.hired": "hiring.hire" };

export const refPattern = /^[A-Za-z0-9._:-]{1,64}$/u;
const memberPattern = /^mbr_[a-z2-7]{26}$/u;

const ref = (value: unknown): string | null => (typeof value === "string" && refPattern.test(value) ? value : null);
const people = (value: unknown): string[] | null => {
  if (value === null || value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  if (list.length > 20 || !list.every(m => typeof m === "string" && memberPattern.test(m))) return null;
  return [...new Set(list as string[])];
};
const name = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const text = value.replace(/\p{Cc}/gu, " ").replace(/\s+/gu, " ").trim();
  return text === "" ? null : [...text].slice(0, 80).join("");
};
const when = (e: ToolEvent) => (Number.isNaN(Date.parse(e.occurredAt)) ? new Date() : new Date(e.occurredAt));

async function happened(sql: Sql, kind: Kind, key: string, members: string[], at: Date, scope: string | null = null, scopeName: string | null = null): Promise<void> {
  await sql`
    insert into fed_events (kind, ref, members, scope, scope_name, at) values (${kind}, ${key}, ${members}, ${scope}, ${scopeName}, ${at})
    on conflict (kind, ref) do update set members = excluded.members, scope = excluded.scope, scope_name = excluded.scope_name, at = excluded.at, updated_at = now()`;
  await refreshFed(sql);
}

async function undone(sql: Sql, kind: Kind, key: string): Promise<void> {
  await sql`update fed_events set at = null, updated_at = now() where kind = ${kind} and ref = ${key}`;
  await refreshFed(sql);
}

// The handlers of app/chest-events: each reads its event's data and keeps
// only what a count needs.
export const handlers = (sql: Sql): Record<string, (e: ToolEvent) => Promise<void>> => ({
  "tasks.card.done": async e => {
    const d = e.data as Record<string, unknown>;
    const card = ref(d["card"]), board = ref(d["board"]), who = people(d["assignees"]);
    if (!card || !board || !who) return;
    await happened(sql, "tasks.card", card, who, when(e), board, name(d["boardName"]));
  },
  "tasks.card.reopened": async e => {
    const card = ref((e.data as Record<string, unknown>)["card"]);
    if (card) await undone(sql, "tasks.card", card);
  },
  "helpdesk.ticket.solved": async e => {
    const d = e.data as Record<string, unknown>;
    const ticket = ref(d["ticket"]), who = people(d["assignee"]);
    if (!ticket || !who) return;
    await happened(sql, "helpdesk.ticket", ticket, who, when(e));
  },
  "helpdesk.ticket.reopened": async e => {
    const ticket = ref((e.data as Record<string, unknown>)["ticket"]);
    if (ticket) await undone(sql, "helpdesk.ticket", ticket);
  },
  "hiring.hired": async e => {
    const d = e.data as Record<string, unknown>;
    const candidate = ref(d["candidate"]), who = people(d["hiredBy"]);
    if (!candidate || !who) return;
    await happened(sql, "hiring.hire", candidate, who, when(e));
  },
  "hiring.hire_cancelled": async e => {
    const candidate = ref((e.data as Record<string, unknown>)["candidate"]);
    if (candidate) await undone(sql, "hiring.hire", candidate);
  },
});

// The boards of Tasks Goals has heard of (a card done on them), to offer
// "Cards done on …": Goals cannot ask Tasks for its boards (no query
// between tools yet), so a board shows once one of its cards is done.
export async function knownBoards(sql: Query): Promise<{ id: string; name: string }[]> {
  const rows = await sql<{ scope: string; scope_name: string | null }[]>`
    select distinct on (scope) scope, scope_name from fed_events where kind = 'tasks.card' and scope is not null order by scope, updated_at desc limit 200`;
  return rows.map(r => ({ id: r.scope, name: r.scope_name ?? r.scope })).sort((a, b) => a.name.localeCompare(b.name));
}

// Every fed key result of the cycles not closed, set to what the tools
// said (or only those given).
export async function refreshFed(sql: Query, keyResultIds?: string[]): Promise<number> {
  const rows = await sql<{ id: string; source: Source; currency: string | null; owner: string; source_mine: boolean; source_scope: string | null; starts_on: string; ends_on: string }[]>`
    select k.id, k.source, k.currency, k.owner, k.source_mine, k.source_scope, to_char(y.starts_on, 'YYYY-MM-DD') as starts_on, to_char(y.ends_on, 'YYYY-MM-DD') as ends_on
    from key_results k join objectives o on o.id = k.objective_id join cycles y on y.id = o.cycle_id
    where k.source is not null and k.archived_at is null and o.archived_at is null and y.closed_at is null
      ${keyResultIds ? sql`and k.id in ${sql(keyResultIds.length ? keyResultIds : ["0"])}` : sql``}`;
  const z = zone();
  for (const r of rows) {
    const from = instantOf(r.starts_on, 0, z), to = instantOf(addDays(r.ends_on, 1), 0, z);
    let value: number;
    if (r.source === "crm.won_amount" || r.source === "crm.won_count") {
      const [{ total, n }] = (await sql<{ total: string | null; n: string }[]>`
        select sum(amount_cents) filter (where currency = ${r.currency ?? ""}) as total, count(*) as n
        from crm_deals where won_at >= ${from} and won_at < ${to}`) as unknown as [{ total: string | null; n: string }];
      value = r.source === "crm.won_amount" ? Math.round(Number(total ?? 0)) / 100 : Number(n);
    } else {
      const [{ n }] = (await sql<{ n: string }[]>`
        select count(*) as n from fed_events
        where kind = ${kindOf[r.source]} and at >= ${from} and at < ${to}
          ${r.source_mine ? sql`and ${r.owner} = any(members)` : sql``}
          ${r.source_scope ? sql`and scope = ${r.source_scope}` : sql``}`) as unknown as [{ n: string }];
      value = Number(n);
    }
    await sql`update key_results set current_value = ${value} where id = ${r.id} and current_value <> ${value}`;
  }
  return rows.length;
}
