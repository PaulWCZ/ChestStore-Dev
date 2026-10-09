import type { Member } from "@argentic/chest-sdk/member";
import { can, canEditDeal } from "./access.ts";
import { record } from "./activities.ts";
import { chest } from "@argentic/chest-sdk/chest";
import { likePattern, ownerClause, pageOf, words, type OwnerFilter } from "./companies.ts";
import { customValues, type Custom } from "../shared/custom.ts";
import { fieldClause, listFields, type FieldFilter } from "./fields.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { clean, day, id, limits, monthOf, optionalId, owner as ownerOf, type Stage } from "../shared/model.ts";
import { chestZone, today } from "./zone.ts";
import { between, isPosition, sequence } from "../shared/position.ts";
import { listStages, stage as stageOf } from "./stages.ts";
import { stepColumns, toStep, type Step } from "./steps.ts";
import { checkAssignable } from "./team.ts";

// Deals: what the team hopes to sell, to a company (and a person there),
// for an amount, moving through the stages to Won or Lost. Everyone reads
// every deal; a deal is changed by its owner or a manager (lib/access.ts).

export type Deal = {
  id: string;
  title: string;
  value: number; // cents
  currency: string;
  stageId: string;
  position: string;
  expectedClose: string | null;
  owner: string | null;
  company: { id: string; name: string } | null;
  contact: { id: string; name: string } | null;
  reason: string;
  closedAt: string | null;
  // The next open step (the soonest), and how many are open.
  step: Step | null;
  steps: number;
  custom: Custom;
  createdBy: string;
  createdAt: string;
};

type Row = { id: string; title: string; value_cents: string; currency: string; stage_id: string; position: string; expected_close: string | null; owner: string | null; company_id: string | null; company_name: string | null; contact_id: string | null; contact_name: string | null; reason: string; closed_at: Date | null; step: Parameters<typeof toStep>[0] | null; open_steps: number; custom: Custom; created_by: string; created_at: Date };

const columns = (sql: Query) => sql`
  d.id, d.title, d.value_cents, d.currency, d.stage_id, d.position, to_char(d.expected_close, 'YYYY-MM-DD') as expected_close, d.owner,
  d.company_id, o.name as company_name, d.contact_id, c.name as contact_name, d.reason, d.closed_at, d.custom, d.created_by, d.created_at,
  (select row_to_json(x) from (select ${stepColumns(sql)} from steps p where p.deal_id = d.id and p.done_at is null order by p.due_on, p.due_time nulls last, p.id limit 1) x) as step,
  (select count(*)::int from steps p where p.deal_id = d.id and p.done_at is null) as open_steps`;
const from = (sql: Query) => sql`deals d join stages s on s.id = d.stage_id left join companies o on o.id = d.company_id left join contacts c on c.id = d.contact_id`;

const toDeal = (r: Row): Deal => ({
  id: String(r.id),
  title: r.title,
  value: Number(r.value_cents),
  currency: r.currency,
  stageId: String(r.stage_id),
  position: r.position,
  expectedClose: r.expected_close,
  owner: r.owner,
  company: r.company_id ? { id: String(r.company_id), name: r.company_name ?? "" } : null,
  contact: r.contact_id ? { id: String(r.contact_id), name: r.contact_name ?? "" } : null,
  reason: r.reason,
  closedAt: r.closed_at?.toISOString() ?? null,
  step: r.step ? toStep(r.step) : null,
  steps: r.open_steps,
  custom: r.custom ?? {},
  createdBy: r.created_by,
  createdAt: r.created_at.toISOString(),
});

function reader(actor: Member | null): void {
  if (!can(actor, "read")) throw new AppError("forbidden");
}

// How long closed deals stay on the board.
export const boardClosedDays = 30;

// How many cards a column of the board shows at most: past it, the column
// says how many more there are and opens the list (a board of thousands of
// cards is too heavy to read or to drag on).
export const boardCap = 100;

// The board's filter: everyone's deals, mine, nobody's, or someone's.
const boardWhere = (sql: Query, actor: Member, owner: OwnerFilter) => sql`
  ${ownerClause(sql, "d.owner", owner, actor)}
  and (s.kind = 'open' or d.closed_at > now() - make_interval(days => ${boardClosedDays}))`;

// boardDeals: every open deal, and those won or lost in the last 30 days,
// in their stage's order — the first boardCap of each stage.
export async function boardDeals(sql: Sql, actor: Member | null, filter: { owner?: OwnerFilter } = {}): Promise<Deal[]> {
  reader(actor);
  const rows = await sql<Row[]>`
    select * from (
      select ${columns(sql)}, row_number() over (partition by d.stage_id order by d.position, d.id) as rank
      from ${from(sql)} where ${boardWhere(sql, actor!, filter.owner ?? "")}
    ) x where x.rank <= ${boardCap}
    order by x.position, x.id`;
  return rows.map(toDeal);
}

// Each column of the board in full, counted by the database (never from
// the cards shown): its deals and its total in each currency.
export type StageTotal = { stageId: string; count: number; totals: { currency: string; value: number }[] };
export async function boardTotals(sql: Sql, actor: Member | null, filter: { owner?: OwnerFilter } = {}): Promise<StageTotal[]> {
  reader(actor);
  const rows = await sql<{ stage_id: string; currency: string; n: number; value: string }[]>`
    select d.stage_id, d.currency, count(*)::int as n, coalesce(sum(d.value_cents), 0)::text as value
    from ${from(sql)} where ${boardWhere(sql, actor!, filter.owner ?? "")}
    group by d.stage_id, d.currency order by d.stage_id, d.currency`;
  const by = new Map<string, StageTotal>();
  for (const r of rows) {
    const t = by.get(String(r.stage_id)) ?? { stageId: String(r.stage_id), count: 0, totals: [] };
    t.count += r.n;
    t.totals.push({ currency: r.currency, value: Number(r.value) });
    by.set(t.stageId, t);
  }
  return [...by.values()];
}

export type DealFilter = { owner?: OwnerFilter; stage?: unknown; closing?: "month" | ""; status?: "open" | "won" | "lost" | ""; q?: unknown; company?: unknown; contact?: unknown; field?: FieldFilter };

// listDeals: the list view, filtered: owner, stage, closing this month,
// open/won/lost, words of the title or the company.
// The where clause of a list of deals (synchronous: a fragment returned
// from an async function would be run as a query when awaited).
function dealWhere(sql: Query, actor: Member, fields: Awaited<ReturnType<typeof listFields>>, filter: DealFilter, now: string) {
  const stageId = optionalId(filter.stage ?? null);
  const q = typeof filter.q === "string" ? clean(filter.q, limits.query, { optional: true }) : "";
  const tsq = q ? words(q) : null;
  const month = monthOf(now);
  const companyId = optionalId(filter.company ?? null);
  const contactId = optionalId(filter.contact ?? null);
  return sql`
    ${ownerClause(sql, "d.owner", filter.owner ?? "", actor)}
    and ${stageId ? sql`d.stage_id = ${stageId}` : sql`true`}
    and ${filter.status ? sql`s.kind = ${filter.status}` : sql`true`}
    and ${filter.closing === "month" ? sql`s.kind = 'open' and d.expected_close between ${month.first} and ${month.last}` : sql`true`}
    and ${companyId ? sql`d.company_id = ${companyId}` : sql`true`}
    and ${contactId ? sql`d.contact_id = ${contactId}` : sql`true`}
    and ${fieldClause(sql, "d", fields, filter.field)}
    and ${q ? sql`(${tsq ? sql`d.search @@ to_tsquery('crm', ${tsq}) or` : sql``} d.folded like '%' || crm_fold(${q.replace(/[\\%_]/gu, "")}) || '%' or o.name ilike ${likePattern(q)})` : sql`true`}`;
}
const listOrder = (sql: Query) => sql`case s.kind when 'open' then 0 else 1 end, d.expected_close nulls last, d.value_cents desc, d.id`;

export async function listDeals(sql: Sql, actor: Member | null, filter: DealFilter = {}, limit = 500, now = today(), page: unknown = 1): Promise<{ rows: Deal[]; total: number; value: number; page: number; pageSize: number }> {
  reader(actor);
  const at = pageOf(page);
  const where = dealWhere(sql, actor!, filter.field ? await listFields(sql, "deals") : [], filter, now);
  const [sum] = await sql<{ n: number; value: string | null }[]>`select count(*)::int as n, sum(d.value_cents) as value from ${from(sql)} where ${where}`;
  const rows = await sql<Row[]>`select ${columns(sql)} from ${from(sql)} where ${where} order by ${listOrder(sql)} limit ${limit} offset ${(at - 1) * limit}`;
  return { rows: rows.map(toDeal), total: sum?.n ?? 0, value: Number(sum?.value ?? 0), page: at, pageSize: limit };
}

// Every deal a filter gives, in the list's order, a batch at a time (a
// cursor: an export of any size in little memory), and the owners they
// name (asked once, before the rows).
export async function dealStream(sql: Sql, actor: Member | null, filter: DealFilter = {}, now = today(), batch = 500): Promise<{ owners: (string | null)[]; batches: AsyncIterable<Deal[]> }> {
  reader(actor);
  const where = dealWhere(sql, actor!, filter.field ? await listFields(sql, "deals") : [], filter, now);
  const owners = (await sql<{ owner: string | null }[]>`select distinct d.owner from ${from(sql)} where ${where}`).map(r => r.owner);
  async function* batches() {
    for await (const rows of sql<Row[]>`select ${columns(sql)} from ${from(sql)} where ${where} order by ${listOrder(sql)}`.cursor(batch)) yield rows.map(toDeal);
  }
  return { owners, batches: batches() };
}

export async function deal(sql: Query, actor: Member | null, dealId: unknown): Promise<Deal> {
  reader(actor);
  const [row] = await sql<Row[]>`select ${columns(sql)} from ${from(sql)} where d.id = ${id(dealId)}`;
  if (!row) throw new AppError("not_found");
  return toDeal(row);
}

// A deal's company and contact: a contact of another company is refused;
// a contact alone brings their company.
async function links(sql: Query, input: { company?: unknown; contact?: unknown }, current: { companyId: string | null; contactId: string | null }): Promise<{ companyId: string | null; contactId: string | null }> {
  let companyId = input.company === undefined ? current.companyId : optionalId(input.company);
  const contactId = input.contact === undefined ? current.contactId : optionalId(input.contact);
  if (companyId) {
    const [c] = await sql`select 1 from companies where id = ${companyId}`;
    if (!c) throw new AppError("not_found");
  }
  if (contactId) {
    const [p] = await sql<{ company_id: string | null }[]>`select company_id from contacts where id = ${contactId}`;
    if (!p) throw new AppError("not_found");
    const theirs = p.company_id ? String(p.company_id) : null;
    if (theirs && companyId === null) companyId = theirs;
    else if (theirs && companyId !== theirs) throw new AppError("invalid");
  }
  return { companyId, contactId };
}

// An amount in whole cents (read at the boundary from what the person
// typed: the package's field.money), within the bounds.
function cents(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > limits.maxCents) throw new AppError("bad_amount");
  return value;
}

// Positions in a stage are read and written with the stage's row locked:
// two moves (or a move and a new deal) into one stage at once would
// otherwise read the same neighbours and give two deals one position.
export async function lockStage(tx: Query, stageId: string): Promise<void> {
  await tx`select id from stages where id = ${stageId} for update`;
}

// respace writes a stage's positions again in their present order (by
// key, then id), apart from one deal being placed.
async function respace(tx: Query, stageId: string, except: string): Promise<void> {
  const rows = await tx<{ id: string }[]>`select id from deals where stage_id = ${stageId} and id <> ${except} order by position, id`;
  const keys = sequence(rows.length);
  for (const [i, r] of rows.entries()) await tx`update deals set position = ${keys[i]!} where id = ${r.id}`;
}

// top puts a deal first in its stage (the stage locked: lockStage).
async function top(sql: Query, stageId: string): Promise<string> {
  const first = async () => (await sql<{ position: string }[]>`select position from deals where stage_id = ${stageId} order by position limit 1`)[0]?.position ?? null;
  let key = between(null, await first());
  // Keys grow as deals keep going first: past a few dozen characters, the
  // stage's keys are written again, short.
  if (!isPosition(key)) {
    await respace(sql, stageId, "0");
    key = between(null, await first());
  }
  return key;
}

export async function addDeal(sql: Sql, actor: Member | null, input: { title: unknown; company?: unknown; contact?: unknown; value?: unknown; stage?: unknown; expectedClose?: unknown; owner?: unknown; custom?: unknown }): Promise<Deal> {
  if (!can(actor, "deals.create")) throw new AppError("forbidden");
  const title = clean(input.title, limits.dealTitle);
  const custom = customValues(await listFields(sql, "deals"), {}, input.custom);
  const value = cents(input.value ?? 0);
  const expectedClose = day(input.expectedClose);
  const stages = await listStages(sql);
  const s = input.stage === undefined || input.stage === "" ? stages.find(x => x.kind === "open")! : await stageOf(sql, input.stage);
  const owner = input.owner === undefined ? actor!.id : ownerOf(input.owner);
  if (owner !== actor!.id && !can(actor, "assign")) throw new AppError("forbidden");
  await checkAssignable(owner, actor!.id);
  const l = await links(sql, input, { companyId: null, contactId: null });
  // A new deal is in the company's currency (chest.currency, ISO 4217).
  const currency = chest.currency;
  const created = await sql.begin(async tx => {
    await lockStage(tx, s.id);
    const position = await top(tx, s.id);
    const [row] = await tx<{ id: string }[]>`
      insert into deals (title, company_id, contact_id, value_cents, currency, stage_id, position, expected_close, owner, custom, created_by, closed_at)
      values (${title}, ${l.companyId}, ${l.contactId}, ${value}, ${currency}, ${s.id}, ${position}, ${expectedClose}, ${owner}, ${tx.json(custom)}, ${actor!.id}, ${s.kind === "open" ? null : tx`now()`})
      returning id`;
    await record(tx, "created", actor!.id, { dealId: String(row!.id), companyId: l.companyId, contactId: l.contactId }, "", { stage: s.id });
    return String(row!.id);
  });
  return deal(sql, actor, created);
}

// editable reads the deal and checks the actor may change it.
async function editable(sql: Sql, actor: Member | null, dealId: unknown): Promise<Deal> {
  const d = await deal(sql, actor, dealId);
  if (!canEditDeal(actor, d)) throw new AppError("forbidden");
  return d;
}

export async function updateDeal(sql: Sql, actor: Member | null, dealId: unknown, input: { title?: unknown; company?: unknown; contact?: unknown; value?: unknown; expectedClose?: unknown; reason?: unknown; custom?: unknown }): Promise<void> {
  const d = await editable(sql, actor, dealId);
  const custom = customValues(await listFields(sql, "deals"), d.custom, input.custom);
  const title = input.title === undefined ? d.title : clean(input.title, limits.dealTitle);
  const value = input.value === undefined ? d.value : cents(input.value);
  const expectedClose = input.expectedClose === undefined ? d.expectedClose : day(input.expectedClose);
  const reason = input.reason === undefined ? d.reason : clean(input.reason, limits.reason, { optional: true });
  const l = await links(sql, input, { companyId: d.company?.id ?? null, contactId: d.contact?.id ?? null });
  await sql`
    update deals set title = ${title}, value_cents = ${value}, expected_close = ${expectedClose}, reason = ${reason}, custom = ${sql.json(custom)},
      company_id = ${l.companyId}, contact_id = ${l.contactId}, updated_at = now()
    where id = ${d.id}`;
  // What was logged on the deal follows it to its new company and contact.
  if (l.companyId !== (d.company?.id ?? null) || l.contactId !== (d.contact?.id ?? null)) {
    await sql`update activities set company_id = ${l.companyId}, contact_id = ${l.contactId} where deal_id = ${d.id}`;
  }
}

// setOwner gives the deal to someone of the team, or to nobody; a
// salesperson may take a deal nobody owns. Says who to tell.
export async function setOwner(sql: Sql, actor: Member | null, dealId: unknown, value: unknown): Promise<{ deal: Deal; given: string | null }> {
  const d = await editable(sql, actor, dealId);
  const owner = ownerOf(value);
  if (owner === d.owner) return { deal: d, given: null };
  if (owner !== actor!.id && !can(actor, "assign")) throw new AppError("forbidden");
  await checkAssignable(owner, actor!.id);
  await sql.begin(async tx => {
    await tx`update deals set owner = ${owner}, updated_at = now() where id = ${d.id}`;
    await record(tx, "owner", actor!.id, { dealId: d.id, companyId: d.company?.id ?? null, contactId: d.contact?.id ?? null }, "", { from: d.owner, to: owner });
  });
  return { deal: { ...d, owner }, given: owner !== null && owner !== actor!.id ? owner : null };
}

// moveDeal puts a deal in a stage, between two deals of that stage (ids,
// or null at an end). Entering Won or Lost closes it, with the reason said;
// leaving them opens it again. The history keeps each change of stage.
export async function moveDeal(sql: Sql, actor: Member | null, dealId: unknown, stageId: unknown, afterId: unknown = null, beforeId: unknown = null, reason: unknown = undefined): Promise<{ deal: Deal; from: Stage; to: Stage }> {
  const to = await stageOf(sql, stageId);
  const why = reason === undefined ? null : clean(reason, limits.reason, { optional: true });
  const moved = await sql.begin(async tx => {
    // The deal read with its row locked: two moves of one deal at once
    // (Won here, Lost in another tab) go one after the other, the second
    // from where the first left it — never both recorded from the old stage.
    await tx`select id from deals where id = ${id(dealId)} for update`;
    const d = await deal(tx, actor, dealId);
    if (!canEditDeal(actor, d)) throw new AppError("forbidden");
    const fromStage = await stageOf(tx, d.stageId);
    const closing = to.kind !== "open" && fromStage.kind === "open";
    const reopening = to.kind === "open" && fromStage.kind !== "open";
    const anchor = { dealId: d.id, companyId: d.company?.id ?? null, contactId: d.contact?.id ?? null };
    // The stage's positions read and written with its row locked.
    await lockStage(tx, to.id);
    const neighbour = async (value: unknown): Promise<string | null> => {
      if (value === null || value === undefined || value === "") return null;
      const [n] = await tx<{ position: string }[]>`select position from deals where id = ${id(value)} and stage_id = ${to.id} and id <> ${d.id}`;
      return n?.position ?? null;
    };
    // The place between the two neighbours named; one side named only:
    // right after (or before) it, before the deal that follows it; none:
    // first. A stale page may name neighbours that moved: first.
    const place = async (): Promise<{ low: string | null; high: string | null }> => {
      let low = await neighbour(afterId);
      let high = await neighbour(beforeId);
      if ((afterId && low === null) || (beforeId && high === null) || (low !== null && high !== null && low > high)) [low, high] = [null, null];
      if (low !== null && high === null) high = (await tx<{ position: string }[]>`select position from deals where stage_id = ${to.id} and id <> ${d.id} and position > ${low} order by position limit 1`)[0]?.position ?? null;
      else if (high !== null && low === null && beforeId) low = (await tx<{ position: string }[]>`select position from deals where stage_id = ${to.id} and id <> ${d.id} and position < ${high} order by position desc limit 1`)[0]?.position ?? null;
      else if (low === null && high === null) high = (await tx<{ position: string }[]>`select position from deals where stage_id = ${to.id} and id <> ${d.id} order by position limit 1`)[0]?.position ?? null;
      return { low, high };
    };
    let { low, high } = await place();
    // Two neighbours with one key (left by an earlier version, or an
    // import): the stage's keys are written again, in their order, then
    // the place read again.
    if (low !== null && low === high) {
      await respace(tx, to.id, d.id);
      ({ low, high } = await place());
    }
    let position = between(low, high);
    // Keys grow when deals keep landing between the same two: past a few
    // dozen characters, the stage's keys are written again, short.
    if (!isPosition(position)) {
      await respace(tx, to.id, d.id);
      ({ low, high } = await place());
      position = between(low, high);
    }
    await tx`
      update deals set stage_id = ${to.id}, position = ${position}, updated_at = now(),
        closed_at = ${to.kind === "open" ? null : closing || to.kind !== fromStage.kind ? tx`now()` : tx`closed_at`},
        reason = ${to.kind === "open" ? "" : why ?? (to.kind === fromStage.kind ? d.reason : "")}
      where id = ${d.id}`;
    if (to.id !== fromStage.id) {
      if (to.kind === "won" || to.kind === "lost") await record(tx, to.kind, actor!.id, anchor, why ?? "", { from: fromStage.id, to: to.id, value: d.value });
      else if (reopening) await record(tx, "reopened", actor!.id, anchor, "", { from: fromStage.id, to: to.id });
      else await record(tx, "stage", actor!.id, anchor, "", { from: fromStage.id, to: to.id });
    }
    return { deal: await deal(tx, actor, d.id), from: fromStage };
  });
  return { ...moved, to };
}

// deleteDeal deletes it for good with its history (a deal that went
// nowhere is better marked Lost: the reason teaches something).
export async function deleteDeal(sql: Sql, actor: Member | null, dealId: unknown): Promise<{ steps: { id: string; owner: string | null }[]; objects: string[] }> {
  const d = await editable(sql, actor, dealId);
  return sql.begin(async tx => {
    const steps = await tx<{ id: string; owner: string | null }[]>`select id, owner from steps where deal_id = ${d.id} and done_at is null`;
    const objects = (await tx<{ object: string }[]>`select object from attachments where deal_id = ${d.id}`).map(r => r.object);
    await tx`delete from deals where id = ${d.id}`;
    return { steps: steps.map(s => ({ id: String(s.id), owner: s.owner })), objects };
  });
}

// My open deals, by stage: how many and how much (for My day).
export async function openByStage(sql: Sql, actor: Member | null, owner: string): Promise<{ stageId: string; count: number; value: number }[]> {
  reader(actor);
  const rows = await sql<{ stage_id: string; n: number; value: string | null }[]>`
    select d.stage_id, count(*)::int as n, sum(d.value_cents) as value from deals d join stages s on s.id = d.stage_id
    where d.owner = ${owner} and s.kind = 'open' group by d.stage_id`;
  return rows.map(r => ({ stageId: String(r.stage_id), count: r.n, value: Number(r.value ?? 0) }));
}

// Won this month (by the actor, and by the team), for My day.
export async function wonThisMonth(sql: Sql, actor: Member | null, now = today()): Promise<{ mine: number; team: number }> {
  reader(actor);
  const month = monthOf(now);
  const zone = chestZone();
  const [row] = await sql<{ mine: string | null; team: string | null }[]>`
    select sum(d.value_cents) filter (where d.owner = ${actor!.id}) as mine, sum(d.value_cents) as team
    from deals d join stages s on s.id = d.stage_id
    where s.kind = 'won' and (d.closed_at at time zone ${zone})::date between ${month.first} and ${month.last}`;
  return { mine: Number(row?.mine ?? 0), team: Number(row?.team ?? 0) };
}
