import * as chest from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { category, type Category } from "./categories.ts";
import type { Query, Sql } from "./db.ts";
import { clean, day, id, isChosenStatus, limits, makeTag, memberId, money, optional, seatsCount, soonDays, addDays, tag as readTag, type ChosenStatus, type Period, type Status } from "./model.ts";
import { namedLike, present } from "./people.ts";
import * as tell from "./tell.ts";

// Items: what the company owns, who holds it, what happened to it. Every
// function checks the actor's rights first; the history is written in the
// same transaction as the change it tells.

export type Holding = { member: string } | { place: string };

export type Item = {
  id: string;
  category: Category;
  tag: string;
  name: string;
  serial: string | null;
  status: Status;
  purchasedOn: string | null;
  priceCents: number | null;
  supplier: string | null;
  warrantyUntil: string | null;
  notes: string | null;
  photo: string | null;
  seats: number | null;
  seatsUsed: number;
  renewsOn: string | null;
  costCents: number | null;
  period: Period | null;
  holder: string | null;
  place: string | null;
  heldSince: string | null;
  createdAt: string;
  openProblems: number;
};

// What a member (not a manager) may read of an item: what it is, where it
// is — no money, supplier, notes or history.
export type BriefItem = Pick<Item, "id" | "category" | "tag" | "name" | "serial" | "status" | "photo" | "seats" | "seatsUsed" | "holder" | "place" | "heldSince" | "warrantyUntil" | "renewsOn">;

export type Seat = { id: string; member: string; since: string };
export type Problem = { id: string; itemId: string; reportedBy: string; body: string; createdAt: string };
export type HistoryEntry = { id: string; at: string; day: string | null; actor: string; kind: string; member: string | null; place: string | null; status: string | null; note: string | null };

export type ItemDetail = { full: true; item: Item; seats: Seat[]; problems: Problem[]; history: HistoryEntry[] };
export type BriefDetail = { full: false; item: BriefItem; mySeat: boolean; mine: boolean; myProblems: Problem[] };

type Row = {
  id: string; category_id: string; c_key: Category["key"]; c_name: string | null; c_icon: Category["icon"]; c_kind: Category["kind"];
  tag: string; name: string; serial: string | null; status: Status; purchased_on: string | null; price_cents: string | null; supplier: string | null;
  warranty_until: string | null; notes: string | null; photo: string | null; seats: number | null; seats_used: number; renews_on: string | null;
  cost_cents: string | null; period: Period | null; holder: string | null; place: string | null; held_since: string | null; created_at: Date; open_problems: number;
};

// One query shape for every read of items.
const select = (sql: Query) => sql`
  select i.id, i.category_id, c.key as c_key, c.name as c_name, c.icon as c_icon, c.kind as c_kind,
    i.tag, i.name, i.serial, i.status, to_char(i.purchased_on, 'YYYY-MM-DD') as purchased_on, i.price_cents, i.supplier,
    to_char(i.warranty_until, 'YYYY-MM-DD') as warranty_until, i.notes, i.photo, i.seats,
    (select count(*)::int from seats s where s.item_id = i.id) as seats_used,
    to_char(i.renews_on, 'YYYY-MM-DD') as renews_on, i.cost_cents, i.period, i.holder, i.place,
    to_char(i.held_since, 'YYYY-MM-DD') as held_since, i.created_at,
    (select count(*)::int from problems p where p.item_id = i.id and p.solved_at is null) as open_problems
  from items i join categories c on c.id = i.category_id`;

function shape(r: Row): Item {
  return {
    id: String(r.id),
    category: { id: String(r.category_id), key: r.c_key, name: r.c_name, icon: r.c_icon, kind: r.c_kind },
    tag: r.tag, name: r.name, serial: r.serial, status: r.status, purchasedOn: r.purchased_on,
    priceCents: r.price_cents === null ? null : Number(r.price_cents), supplier: r.supplier, warrantyUntil: r.warranty_until,
    notes: r.notes, photo: r.photo, seats: r.seats, seatsUsed: r.seats_used, renewsOn: r.renews_on,
    costCents: r.cost_cents === null ? null : Number(r.cost_cents), period: r.period,
    holder: r.holder, place: r.place, heldSince: r.held_since, createdAt: new Date(r.created_at).toISOString(), openProblems: r.open_problems,
  };
}

export function brief(item: Item): BriefItem {
  const { id, category: c, tag, name, serial, status, photo, seats, seatsUsed, holder, place, heldSince, warrantyUntil, renewsOn } = item;
  return { id, category: c, tag, name, serial, status, photo, seats, seatsUsed, holder, place, heldSince, warrantyUntil, renewsOn };
}

function manager(actor: Member | null): Member {
  if (!actor || !can(actor, "items.manage")) throw new AppError("forbidden");
  return actor;
}
function browser(actor: Member | null): Member {
  if (!actor || !can(actor, "items.browse")) throw new AppError("forbidden");
  return actor;
}

async function load(sql: Query, itemId: unknown, options: { lock?: boolean } = {}): Promise<Item> {
  const key = id(itemId);
  if (options.lock) await sql`select 1 from items where id = ${key} for update`;
  const rows = await sql<Row[]>`${select(sql)} where i.id = ${key} and i.deleted_at is null`;
  if (!rows[0]) throw new AppError("not_found");
  return shape(rows[0]);
}

async function record(sql: Query, entry: { item: string; actor: string; kind: string; member?: string | null; place?: string | null; status?: string | null; note?: string | null; day?: string | null }): Promise<void> {
  await sql`insert into history (item_id, actor, kind, member, place, status, note, day)
    values (${entry.item}, ${entry.actor}, ${entry.kind}, ${entry.member ?? null}, ${entry.place ?? null}, ${entry.status ?? null}, ${entry.note ?? null}, ${entry.day ?? null})`;
}

// The next free tag of the tool's own series, EQ-0001 onwards.
async function nextTag(sql: Query): Promise<string> {
  const [row] = await sql<{ n: number }[]>`select coalesce(max(substring(tag from 4)::int), 0)::int as n from items where tag ~ '^EQ-[0-9]{1,9}$'`;
  return makeTag((row?.n ?? 0) + 1);
}

async function tagFree(sql: Query, tag: string, except?: string): Promise<boolean> {
  const rows = await sql`select 1 from items where lower(tag) = lower(${tag}) and deleted_at is null ${except ? sql`and id <> ${except}` : sql``}`;
  return rows.length === 0;
}

// ---- Reading --------------------------------------------------------------

export type Sort = "tag" | "name" | "newest" | "ending";
export const sorts: readonly Sort[] = ["tag", "name", "newest", "ending"];
export type Filters = { q?: string; category?: string; status?: string; holder?: string; sort?: string; ids?: string[] };

// The catalogue, searched and filtered. q finds a tag, a serial number, a
// name, a supplier, a place — and a holder by name (the Chest is asked).
// holder: a member id, "erased", "place:<name>", or "nobody".
export async function listItems(sql: Query, actor: Member | null, filters: Filters = {}, max = 1000): Promise<Item[]> {
  browser(actor);
  const q = typeof filters.q === "string" ? filters.q.trim().slice(0, limits.search) : "";
  const like = "%" + q.replace(/[\\%_]/gu, m => "\\" + m) + "%";
  const holders = q ? await namedLike(q) : [];
  const categoryId = filters.category && /^[1-9][0-9]{0,17}$/u.test(filters.category) ? filters.category : null;
  const status = filters.status && ["in_stock", "in_use", "in_repair", "lost", "retired"].includes(filters.status) ? filters.status : null;
  const h = filters.holder ?? "";
  const ids = filters.ids?.filter(x => /^[1-9][0-9]{0,17}$/u.test(x)).slice(0, limits.labels);
  const order = filters.sort === "name" ? sql`lower(i.name), i.id`
    : filters.sort === "newest" ? sql`i.created_at desc, i.id desc`
    : filters.sort === "ending" ? sql`least(i.warranty_until, i.renews_on) nulls last, i.id`
    : sql`lower(i.tag), i.id`;
  const rows = await sql<Row[]>`${select(sql)}
    where i.deleted_at is null
    ${q ? sql`and (i.tag ilike ${like} or i.serial ilike ${like} or i.name ilike ${like} or i.supplier ilike ${like} or i.place ilike ${like}
      or i.holder = any(${holders}) or exists (select 1 from seats s where s.item_id = i.id and s.member_id = any(${holders})))` : sql``}
    ${categoryId ? sql`and i.category_id = ${categoryId}` : sql``}
    ${status ? sql`and i.status = ${status}` : sql``}
    ${h === "nobody" ? sql`and i.holder is null and i.place is null and i.seats is null`
      : h.startsWith("place:") ? sql`and i.place = ${h.slice(6)}`
      : /^mbr_[a-z2-7]{26}$/u.test(h) || h === "erased" ? sql`and (i.holder = ${h} or exists (select 1 from seats s where s.item_id = i.id and s.member_id = ${h}))`
      : sql``}
    ${ids ? sql`and i.id = any(${ids})` : sql``}
    order by ${order}
    limit ${max}`;
  return rows.map(shape);
}

// One item: its full page for a manager, the short one for a member.
export async function itemDetail(sql: Query, actor: Member | null, itemId: unknown): Promise<ItemDetail | BriefDetail> {
  const who = browser(actor);
  const item = await load(sql, itemId);
  const seatRows = await sql<{ id: string; member_id: string; since: Date }[]>`select id, member_id, since from seats where item_id = ${item.id} order by since, id`;
  const seats = seatRows.map(s => ({ id: String(s.id), member: s.member_id, since: new Date(s.since).toISOString() }));
  const problemRows = await sql<{ id: string; item_id: string; reported_by: string; body: string; created_at: Date }[]>`
    select id, item_id, reported_by, body, created_at from problems where item_id = ${item.id} and solved_at is null order by id desc`;
  const problems = problemRows.map(p => ({ id: String(p.id), itemId: String(p.item_id), reportedBy: p.reported_by, body: p.body, createdAt: new Date(p.created_at).toISOString() }));
  if (!can(who, "items.manage")) {
    const mySeat = seats.some(s => s.member === who.id);
    return { full: false, item: brief(item), mySeat, mine: item.holder === who.id || mySeat, myProblems: problems.filter(p => p.reportedBy === who.id) };
  }
  const historyRows = await sql<{ id: string; at: Date; day: string | null; actor: string; kind: string; member: string | null; place: string | null; status: string | null; note: string | null }[]>`
    select id, at, to_char(day, 'YYYY-MM-DD') as day, actor, kind, member, place, status, note from history where item_id = ${item.id} order by id desc limit 200`;
  const history = historyRows.map(h => ({ ...h, id: String(h.id), at: new Date(h.at).toISOString() }));
  return { full: true, item, seats, problems, history };
}

export async function places(sql: Query, actor: Member | null): Promise<string[]> {
  browser(actor);
  return (await sql<{ place: string }[]>`select distinct place from items where place is not null and deleted_at is null order by place limit 200`).map(r => r.place);
}

// ---- Writing --------------------------------------------------------------

export type ItemInput = {
  categoryId?: unknown; name?: unknown; tag?: unknown; serial?: unknown; purchasedOn?: unknown; price?: unknown; supplier?: unknown;
  warrantyUntil?: unknown; notes?: unknown; seats?: unknown; renewsOn?: unknown; cost?: unknown; period?: unknown;
};

type Fields = {
  name: string; serial: string | null; purchasedOn: string | null; priceCents: number | null; supplier: string | null; warrantyUntil: string | null;
  notes: string | null; seats: number | null; renewsOn: string | null; costCents: number | null; period: Period | null;
};

// fields reads a form: an item has a serial and a warranty; a licence has
// seats, a renewal and a cost per month or year.
function fields(input: ItemInput, licence: boolean): Fields {
  const dateOf = (value: unknown) => {
    try { return day(value); } catch { throw new AppError("invalid_date"); }
  };
  const base = {
    name: clean(input.name, limits.name),
    purchasedOn: dateOf(input.purchasedOn),
    priceCents: money(input.price),
    supplier: optional(input.supplier, limits.supplier),
    notes: optional(input.notes, limits.notes, { multiline: true }),
  };
  if (licence) {
    const seats = seatsCount(input.seats);
    if (seats === null) throw new AppError("invalid_seats");
    const period = input.period === "month" || input.period === "year" ? input.period : input.period === undefined || input.period === null || input.period === "" ? "year" : null;
    if (!period) throw new AppError("invalid");
    return { ...base, serial: null, warrantyUntil: null, seats, renewsOn: dateOf(input.renewsOn), costCents: money(input.cost), period };
  }
  return { ...base, serial: optional(input.serial, limits.serial), warrantyUntil: dateOf(input.warrantyUntil), seats: null, renewsOn: null, costCents: null, period: null };
}

export async function createItem(sql: Sql, actor: Member | null, input: ItemInput): Promise<Item> {
  const who = manager(actor);
  const cat = await category(sql, input.categoryId);
  const f = fields(input, cat.kind === "licence");
  const wanted = input.tag === undefined || input.tag === null || (typeof input.tag === "string" && input.tag.trim() === "") ? null : readTag(input.tag);
  return sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('equipment.tags'))`;
    const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`select count(*)::int as n from items where deleted_at is null`;
    if (n >= limits.items) throw new AppError("too_many", { max: limits.items });
    const tag = wanted ?? await nextTag(tx);
    if (!(await tagFree(tx, tag))) throw new AppError("tag_taken", { tag });
    const [row] = await tx<{ id: string }[]>`
      insert into items (category_id, tag, name, serial, purchased_on, price_cents, supplier, warranty_until, notes, seats, renews_on, cost_cents, period, created_by)
      values (${cat.id}, ${tag}, ${f.name}, ${f.serial}, ${f.purchasedOn}, ${f.priceCents}, ${f.supplier}, ${f.warrantyUntil}, ${f.notes}, ${f.seats}, ${f.renewsOn}, ${f.costCents}, ${f.period}, ${who.id})
      returning id`;
    await record(tx, { item: row!.id, actor: who.id, kind: "created", status: "in_stock" });
    return load(tx, row!.id);
  });
}

// The keys of the fields a change touched, for the history ("name, serial").
const editable = ["name", "tag", "category", "serial", "purchasedOn", "priceCents", "supplier", "warrantyUntil", "notes", "seats", "renewsOn", "costCents", "period"] as const;

export async function updateItem(sql: Sql, actor: Member | null, itemId: unknown, input: ItemInput): Promise<Item> {
  const who = manager(actor);
  return sql.begin(async tx => {
    const before = await load(tx, itemId, { lock: true });
    const cat = input.categoryId === undefined ? before.category : await category(tx, input.categoryId);
    if (cat.kind !== before.category.kind) throw new AppError(before.category.kind === "licence" ? "is_licence" : "not_licence");
    const f = fields(input, cat.kind === "licence");
    if (f.seats !== null && f.seats < before.seatsUsed) throw new AppError("seats_below_used", { used: before.seatsUsed });
    const tag = input.tag === undefined ? before.tag : readTag(input.tag);
    if (tag.toLowerCase() !== before.tag.toLowerCase()) {
      await tx`select pg_advisory_xact_lock(hashtext('equipment.tags'))`;
      if (!(await tagFree(tx, tag, before.id))) throw new AppError("tag_taken", { tag });
    }
    await tx`update items set category_id = ${cat.id}, tag = ${tag}, name = ${f.name}, serial = ${f.serial}, purchased_on = ${f.purchasedOn},
      price_cents = ${f.priceCents}, supplier = ${f.supplier}, warranty_until = ${f.warrantyUntil}, notes = ${f.notes}, seats = ${f.seats},
      renews_on = ${f.renewsOn}, cost_cents = ${f.costCents}, period = ${f.period}, updated_at = now() where id = ${before.id}`;
    const after = await load(tx, before.id);
    const changed = editable.filter(k => k === "category" ? after.category.id !== before.category.id : after[k] !== before[k]);
    if (changed.length > 0) await record(tx, { item: before.id, actor: who.id, kind: "edited", note: changed.join(",") });
    return after;
  });
}

// "Delete" is for a mistake (a duplicate, a typo): the item leaves every
// list, its history stays, and it can be brought back (Undo).
export async function deleteItem(sql: Sql, actor: Member | null, itemId: unknown): Promise<void> {
  const who = manager(actor);
  await sql.begin(async tx => {
    const item = await load(tx, itemId, { lock: true });
    await tx`update items set deleted_at = now() where id = ${item.id}`;
    await record(tx, { item: item.id, actor: who.id, kind: "deleted" });
  });
}

export async function restoreItem(sql: Sql, actor: Member | null, itemId: unknown): Promise<Item> {
  const who = manager(actor);
  const key = id(itemId);
  return sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('equipment.tags'))`;
    const [row] = await tx<{ tag: string }[]>`select tag from items where id = ${key} and deleted_at is not null for update`;
    if (!row) throw new AppError("not_found");
    if (!(await tagFree(tx, row.tag))) throw new AppError("tag_taken", { tag: row.tag });
    await tx`update items set deleted_at = null where id = ${key}`;
    await record(tx, { item: key, actor: who.id, kind: "restored" });
    return load(tx, key);
  });
}

// ---- Giving and taking back ----------------------------------------------

function holding(value: unknown): Holding {
  if (value && typeof value === "object") {
    const v = value as { member?: unknown; place?: unknown };
    if (v.member !== undefined) return { member: memberId(v.member) };
    if (v.place !== undefined) return { place: clean(v.place, limits.place) };
  }
  throw new AppError("invalid");
}

function onDay(value: unknown): string {
  const now = chest.today();
  let d: string | null;
  try { d = day(value); } catch { throw new AppError("invalid_date"); }
  if (d === null) return now;
  // A handover recorded late, not one planned: never in the future.
  if (d > now) throw new AppError("invalid_date");
  return d;
}

// give hands an item to a member or puts it in a place, from the stock or
// from whoever had it (a transfer: the history says both). The person is
// told in their bell, in their language.
export async function give(sql: Sql, actor: Member | null, itemId: unknown, input: { to?: unknown; note?: unknown; day?: unknown }, options: { quiet?: boolean } = {}): Promise<Item> {
  const who = manager(actor);
  const to = holding(input.to);
  const note = optional(input.note, limits.condition, { multiline: true });
  const when = onDay(input.day);
  if ("member" in to && !(await present([to.member])).has(to.member)) throw new AppError("not_member");
  const { item, previous } = await sql.begin(async tx => {
    const before = await load(tx, itemId, { lock: true });
    if (before.category.kind === "licence") throw new AppError("is_licence");
    if (before.status === "retired") throw new AppError("not_available");
    if (("member" in to && before.holder === to.member) || ("place" in to && before.place === to.place)) throw new AppError("already_there");
    if (before.holder || before.place) await record(tx, { item: before.id, actor: who.id, kind: "returned", member: before.holder, place: before.place, day: when });
    const member = "member" in to ? to.member : null;
    const place = "place" in to ? to.place : null;
    await tx`update items set holder = ${member}, place = ${place}, held_since = ${when}, status = 'in_use', updated_at = now() where id = ${before.id}`;
    await record(tx, { item: before.id, actor: who.id, kind: "given", member, place, note, day: when });
    return { item: await load(tx, before.id), previous: before.holder };
  });
  if (previous) await tell.takenBack(previous, item.id);
  if (item.holder && !options.quiet) await tell.given(who, item.holder, item);
  return item;
}

// takeBack ends a holding: the item goes back in stock (or to repair), with
// its condition noted.
export async function takeBack(sql: Sql, actor: Member | null, itemId: unknown, input: { note?: unknown; status?: unknown; day?: unknown } = {}): Promise<{ item: Item; from: Holding }> {
  const who = manager(actor);
  const note = optional(input.note, limits.condition, { multiline: true });
  const status: ChosenStatus = input.status === undefined || input.status === null || input.status === "" ? "in_stock" : isChosenStatus(input.status) ? input.status : "in_stock";
  if (input.status !== undefined && input.status !== null && input.status !== "" && !isChosenStatus(input.status)) throw new AppError("invalid");
  const when = onDay(input.day);
  const result = await sql.begin(async tx => {
    const before = await load(tx, itemId, { lock: true });
    if (!before.holder && !before.place) throw new AppError("not_held");
    await tx`update items set holder = null, place = null, held_since = null, status = ${status}, updated_at = now() where id = ${before.id}`;
    await record(tx, { item: before.id, actor: who.id, kind: "returned", member: before.holder, place: before.place, status, note, day: when });
    const from: Holding = before.holder ? { member: before.holder } : { place: before.place! };
    return { item: await load(tx, before.id), from };
  });
  if ("member" in result.from) {
    await tell.takenBack(result.from.member, result.item.id);
    await tell.maybeAllBack(sql, result.from.member);
  }
  return result;
}

// setStatus: in stock, in repair, lost, retired. An item someone holds is
// taken back first (a lost laptop is no longer "with Hugo"). A licence is
// only ever retired (cancelled: its seats are freed) or active again.
export async function setStatus(sql: Sql, actor: Member | null, itemId: unknown, value: unknown, noteValue?: unknown): Promise<Item> {
  const who = manager(actor);
  if (!isChosenStatus(value)) throw new AppError("invalid");
  const note = optional(noteValue, limits.condition, { multiline: true });
  const result = await sql.begin(async tx => {
    const before = await load(tx, itemId, { lock: true });
    const freed: string[] = [];
    let status: Status = value;
    if (before.category.kind === "licence") {
      if (value !== "retired" && value !== "in_stock") throw new AppError("is_licence");
      if (value === "retired") {
        const seats = await tx<{ member_id: string }[]>`delete from seats where item_id = ${before.id} returning member_id`;
        for (const s of seats) {
          await record(tx, { item: before.id, actor: who.id, kind: "seat_taken", member: s.member_id });
          freed.push(s.member_id);
        }
      } else status = before.seatsUsed > 0 ? "in_use" : "in_stock";
    } else if (before.holder || before.place) {
      await tx`update items set holder = null, place = null, held_since = null where id = ${before.id}`;
      await record(tx, { item: before.id, actor: who.id, kind: "returned", member: before.holder, place: before.place, status: value });
      if (before.holder) freed.push(before.holder);
    }
    if (status === before.status && freed.length === 0) return { item: before, freed };
    await tx`update items set status = ${status}, updated_at = now() where id = ${before.id}`;
    await record(tx, { item: before.id, actor: who.id, kind: "status", status, note });
    return { item: await load(tx, before.id), freed };
  });
  for (const m of result.freed) {
    await tell.takenBack(m, result.item.id);
    await tell.maybeAllBack(sql, m);
  }
  return result.item;
}

// ---- Licence seats --------------------------------------------------------

export async function giveSeat(sql: Sql, actor: Member | null, itemId: unknown, member: unknown, options: { quiet?: boolean } = {}): Promise<Item> {
  const who = manager(actor);
  const to = memberId(member);
  if (!(await present([to])).has(to)) throw new AppError("not_member");
  const item = await sql.begin(async tx => {
    const before = await load(tx, itemId, { lock: true });
    if (before.category.kind !== "licence") throw new AppError("not_licence");
    if (before.status === "retired") throw new AppError("not_available");
    if ((await tx`select 1 from seats where item_id = ${before.id} and member_id = ${to}`).length > 0) throw new AppError("has_seat");
    if (before.seatsUsed >= (before.seats ?? 0)) throw new AppError("no_seats", { seats: before.seats ?? 0 });
    await tx`insert into seats (item_id, member_id) values (${before.id}, ${to})`;
    await tx`update items set status = 'in_use', updated_at = now() where id = ${before.id}`;
    await record(tx, { item: before.id, actor: who.id, kind: "seat_given", member: to });
    return load(tx, before.id);
  });
  if (!options.quiet) await tell.seatGiven(who, to, item);
  return item;
}

export async function takeSeat(sql: Sql, actor: Member | null, itemId: unknown, member: unknown): Promise<Item> {
  const who = manager(actor);
  const from = member === "erased" ? "erased" : memberId(member);
  const item = await sql.begin(async tx => {
    const before = await load(tx, itemId, { lock: true });
    if (before.category.kind !== "licence") throw new AppError("not_licence");
    const gone = await tx`delete from seats where id = (select id from seats where item_id = ${before.id} and member_id = ${from} order by id limit 1) returning id`;
    if (gone.length === 0) throw new AppError("not_held");
    const [left] = await tx<{ n: number }[]>`select count(*)::int as n from seats where item_id = ${before.id}`;
    if (left!.n === 0 && before.status === "in_use") await tx`update items set status = 'in_stock' where id = ${before.id}`;
    await tx`update items set updated_at = now() where id = ${before.id}`;
    await record(tx, { item: before.id, actor: who.id, kind: "seat_taken", member: from });
    return load(tx, before.id);
  });
  if (from !== "erased") {
    await tell.takenBack(from, item.id);
    await tell.maybeAllBack(sql, from);
  }
  return item;
}

// ---- A person's equipment --------------------------------------------------

export type Holdings = { items: Item[]; seats: (Item & { seatSince: string })[] };

async function heldBy(sql: Query, holder: string): Promise<Holdings> {
  const items = (await sql<Row[]>`${select(sql)} where i.deleted_at is null and i.holder = ${holder} order by i.held_since, i.id`).map(shape);
  const seatRows = await sql<(Row & { seat_since: Date })[]>`
    select x.*, s.since as seat_since from (${select(sql)} where i.deleted_at is null) x join seats s on s.item_id = x.id
    where s.member_id = ${holder} order by s.since, x.id`;
  return { items, seats: seatRows.map(r => ({ ...shape(r), seatSince: new Date(r.seat_since).toISOString() })) };
}

// What I hold: my own page, for everyone with a role.
export async function mine(sql: Query, actor: Member | null): Promise<Holdings & { problems: Problem[] }> {
  const who = browser(actor);
  const held = await heldBy(sql, who.id);
  const rows = await sql<{ id: string; item_id: string; reported_by: string; body: string; created_at: Date }[]>`
    select id, item_id, reported_by, body, created_at from problems where reported_by = ${who.id} and solved_at is null order by id desc limit 50`;
  return { ...held, problems: rows.map(p => ({ id: String(p.id), itemId: String(p.item_id), reportedBy: p.reported_by, body: p.body, createdAt: new Date(p.created_at).toISOString() })) };
}

// What a person holds, for a manager: the checklist of the day they leave.
// holder is a member id, or "erased" for everything left with people whose
// data was erased.
export async function holdings(sql: Query, actor: Member | null, holder: unknown): Promise<Holdings> {
  manager(actor);
  const h = holder === "erased" ? "erased" : memberId(holder);
  return heldBy(sql, h);
}

// Who holds how much: items and seats per member id (and "erased").
export async function holderCounts(sql: Query, actor: Member | null): Promise<Map<string, { items: number; seats: number }>> {
  manager(actor);
  const rows = await sql<{ holder: string; items: number; seats: number }[]>`
    select holder, sum(items)::int as items, sum(seats)::int as seats from (
      select holder, count(*) as items, 0 as seats from items where holder is not null and deleted_at is null group by holder
      union all
      select s.member_id, 0, count(*) from seats s join items i on i.id = s.item_id where i.deleted_at is null group by s.member_id
    ) x group by holder`;
  return new Map(rows.map(r => [r.holder, { items: r.items, seats: r.seats }]));
}

// "Take everything back" when someone leaves: every item they hold goes back
// in stock, every seat is freed, in one step. Answers what was taken, for
// Undo.
export type Taken = { items: string[]; seats: string[] };

export async function takeEverythingBack(sql: Sql, actor: Member | null, holder: unknown, noteValue?: unknown): Promise<Taken> {
  const who = manager(actor);
  const h = holder === "erased" ? "erased" : memberId(holder);
  const note = optional(noteValue, limits.condition, { multiline: true });
  const when = chest.today();
  const taken = await sql.begin(async tx => {
    const items = await tx<{ id: string }[]>`select id from items where holder = ${h} and deleted_at is null order by id for update`;
    for (const { id: itemId } of items) {
      await tx`update items set holder = null, place = null, held_since = null, status = 'in_stock', updated_at = now() where id = ${itemId}`;
      await record(tx, { item: itemId, actor: who.id, kind: "returned", member: h, status: "in_stock", note, day: when });
    }
    const seats = await tx<{ item_id: string }[]>`
      delete from seats where id in (select s.id from seats s join items i on i.id = s.item_id where s.member_id = ${h} and i.deleted_at is null) returning item_id`;
    for (const { item_id } of seats) {
      await record(tx, { item: item_id, actor: who.id, kind: "seat_taken", member: h });
      await tx`update items set status = 'in_stock' where id = ${item_id} and status = 'in_use' and not exists (select 1 from seats where item_id = ${item_id})`;
    }
    return { items: items.map(r => String(r.id)), seats: seats.map(r => String(r.item_id)) };
  });
  if (h !== "erased") {
    for (const itemId of [...taken.items, ...taken.seats]) await tell.takenBack(h, itemId);
    await tell.maybeAllBack(sql, h);
  }
  return taken;
}

// Undo of "Take everything back": the same things go back to the same
// holder, quietly (they never left their hands) — also for someone who has
// left or was erased, since the undo only puts back what was just true.
// Items given to someone else meanwhile, or seats taken since, stay as they
// are.
export async function giveBackEverything(sql: Sql, actor: Member | null, holder: unknown, taken: { items?: unknown; seats?: unknown }): Promise<void> {
  const who = manager(actor);
  const h = holder === "erased" ? "erased" : memberId(holder);
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 1000).map(x => id(x)) : []);
  const when = chest.today();
  await sql.begin(async tx => {
    for (const itemId of list(taken.items)) {
      const moved = await tx`update items set holder = ${h}, held_since = ${when}, status = 'in_use', updated_at = now()
        where id = ${itemId} and holder is null and place is null and deleted_at is null and seats is null and status <> 'retired' returning id`;
      if (moved.length > 0) await record(tx, { item: itemId, actor: who.id, kind: "given", member: h, day: when });
    }
    for (const itemId of list(taken.seats)) {
      const [item] = await tx<{ seats: number | null; used: number }[]>`
        select seats, (select count(*)::int from seats s where s.item_id = i.id) as used from items i where id = ${itemId} and deleted_at is null and status <> 'retired' for update`;
      if (!item || item.seats === null || item.used >= item.seats) continue;
      if (h !== "erased" && (await tx`select 1 from seats where item_id = ${itemId} and member_id = ${h}`).length > 0) continue;
      await tx`insert into seats (item_id, member_id) values (${itemId}, ${h})`;
      await tx`update items set status = 'in_use', updated_at = now() where id = ${itemId}`;
      await record(tx, { item: itemId, actor: who.id, kind: "seat_given", member: h });
    }
  });
}

// ---- Problems ---------------------------------------------------------------

// A holder reports a problem on what they hold (a manager on anything): the
// managers hear of it, the history keeps it.
export async function report(sql: Sql, actor: Member | null, itemId: unknown, body: unknown): Promise<Problem> {
  const who = actor;
  if (!who || !can(who, "report")) throw new AppError("forbidden");
  const text = clean(body, limits.problem, { multiline: true });
  const problem = await sql.begin(async tx => {
    const item = await load(tx, itemId);
    const holds = item.holder === who.id || (await tx`select 1 from seats where item_id = ${item.id} and member_id = ${who.id}`).length > 0;
    if (!holds && !can(who, "items.manage")) throw new AppError("not_found");
    const [open] = await tx<{ n: number }[]>`select count(*)::int as n from problems where item_id = ${item.id} and solved_at is null`;
    if (open!.n >= 20) throw new AppError("too_many", { max: 20 });
    const [row] = await tx<{ id: string; created_at: Date }[]>`insert into problems (item_id, reported_by, body) values (${item.id}, ${who.id}, ${text}) returning id, created_at`;
    await record(tx, { item: item.id, actor: who.id, kind: "reported", note: text });
    return { problem: { id: String(row!.id), itemId: item.id, reportedBy: who.id, body: text, createdAt: new Date(row!.created_at).toISOString() }, item };
  });
  await tell.reported(sql, who, problem.item, problem.problem);
  return problem.problem;
}

export async function solve(sql: Sql, actor: Member | null, problemId: unknown, noteValue?: unknown): Promise<void> {
  const who = manager(actor);
  const note = optional(noteValue, limits.condition, { multiline: true });
  const key = id(problemId);
  await sql.begin(async tx => {
    const [row] = await tx<{ item_id: string }[]>`update problems set solved_at = now(), solved_by = ${who.id} where id = ${key} and solved_at is null returning item_id`;
    if (!row) throw new AppError("not_found");
    await record(tx, { item: String(row.item_id), actor: who.id, kind: "solved", note });
  });
  await tell.solved(sql, key);
}

export async function openProblems(sql: Query, actor: Member | null): Promise<(Problem & { item: Item })[]> {
  manager(actor);
  const rows = await sql<{ id: string; item_id: string; reported_by: string; body: string; created_at: Date }[]>`
    select p.id, p.item_id, p.reported_by, p.body, p.created_at from problems p join items i on i.id = p.item_id
    where p.solved_at is null and i.deleted_at is null order by p.id desc limit 100`;
  const out: (Problem & { item: Item })[] = [];
  for (const p of rows) out.push({ id: String(p.id), itemId: String(p.item_id), reportedBy: p.reported_by, body: p.body, createdAt: new Date(p.created_at).toISOString(), item: await load(sql, p.item_id) });
  return out;
}

// ---- Photos ---------------------------------------------------------------

export async function setPhoto(sql: Sql, actor: Member | null, itemId: unknown, object: string | null): Promise<{ item: Item; previous: string | null }> {
  const who = manager(actor);
  return sql.begin(async tx => {
    const before = await load(tx, itemId, { lock: true });
    await tx`update items set photo = ${object}, updated_at = now() where id = ${before.id}`;
    await record(tx, { item: before.id, actor: who.id, kind: "photo", note: object ? "added" : "removed" });
    return { item: await load(tx, before.id), previous: before.photo };
  });
}

// The photo's object, for whoever may see the item.
export async function photoOf(sql: Query, actor: Member | null, itemId: unknown): Promise<string> {
  browser(actor);
  const item = await load(sql, itemId);
  if (!item.photo) throw new AppError("not_found");
  return item.photo;
}

// ---- Overview ---------------------------------------------------------------

// What needs a manager's eye: warranties and renewals ending within 60 days
// (or ended in the last 30), items in repair.
export async function endingSoon(sql: Query, now: string): Promise<Item[]> {
  const until = addDays(now, soonDays), since = addDays(now, -30);
  const rows = await sql<Row[]>`${select(sql)}
    where i.deleted_at is null and i.status not in ('retired', 'lost')
      and ((i.warranty_until between ${since} and ${until}) or (i.renews_on between ${since} and ${until}))
    order by least(case when i.warranty_until >= ${since} then i.warranty_until end, case when i.renews_on >= ${since} then i.renews_on end), i.id
    limit 200`;
  return rows.map(shape);
}

export async function overview(sql: Query, actor: Member | null, now = chest.today()): Promise<{ ending: Item[]; repair: Item[]; problems: (Problem & { item: Item })[] }> {
  manager(actor);
  const repair = (await sql<Row[]>`${select(sql)} where i.deleted_at is null and i.status = 'in_repair' order by i.updated_at limit 100`).map(shape);
  return { ending: await endingSoon(sql, now), repair, problems: await openProblems(sql, actor) };
}

// For the form: the tag a new item would get, and the suppliers already
// named (a list to pick from).
export async function formHints(sql: Query, actor: Member | null): Promise<{ nextTag: string; suppliers: string[] }> {
  manager(actor);
  const suppliers = (await sql<{ supplier: string }[]>`select distinct supplier from items where supplier is not null and deleted_at is null order by supplier limit 200`).map(r => r.supplier);
  return { nextTag: await nextTag(sql), suppliers };
}

// Places and how many items are at each.
export async function placeCounts(sql: Query, actor: Member | null): Promise<{ place: string; count: number }[]> {
  manager(actor);
  return sql<{ place: string; count: number }[]>`select place, count(*)::int as count from items where place is not null and deleted_at is null group by place order by place limit 200`;
}
