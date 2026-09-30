import { chest } from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { category, type Category } from "./categories.ts";
import type { Query, Sql } from "./db.ts";
import { fieldsOf, readExtra } from "./fields.ts";
import { clean, count, day, id, isChosenStatus, limits, makeTag, memberId, money, optional, seatsCount, soonDays, addDays, tag as readTag, tagSeries, type ChosenStatus, type Period, type Status } from "./model.ts";
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
  // The values of the category's own fields, by field id.
  extra: Record<string, string>;
  // Things counted in bulk: how many are left, and the minimum under which
  // the managers are warned.
  quantity: number | null;
  minQuantity: number | null;
  invoice: string | null;
  // Read by a member who may not see who holds it (the category's setting):
  // holder, place and "since" are blanked, and the item says it is held.
  holderHidden: boolean;
};

// What a member (not a manager) may read of an item: what it is, where it
// is — no money, supplier, notes, fields, invoice or history.
// A member reads the serial number of their own items only, and who holds
// an item only where its category shows holders (see forMember).
export type BriefItem = Pick<Item, "id" | "category" | "tag" | "name" | "serial" | "status" | "photo" | "seats" | "seatsUsed" | "holder" | "place" | "heldSince" | "warrantyUntil" | "renewsOn" | "quantity" | "minQuantity" | "holderHidden">;

export type Seat = { id: string; member: string; since: string };
export type Problem = { id: string; itemId: string; reportedBy: string; body: string; createdAt: string };
export type HistoryEntry = { id: string; at: string; day: string | null; actor: string; kind: string; member: string | null; place: string | null; status: string | null; note: string | null; qty: number | null; costCents: number | null; ref: string | null; due: string | null };

// The receipt of the item's current holder: waiting for them to say "I
// received it", or confirmed.
export type Receipt = { id: string; member: string; givenBy: string; givenOn: string; condition: string | null; confirmedAt: string | null; remark: string | null; charterId: string | null };

export type ItemDetail = { full: true; item: Item; seats: Seat[]; problems: Problem[]; history: HistoryEntry[]; receipt: Receipt | null };
export type BriefDetail = { full: false; item: BriefItem; mySeat: boolean; mine: boolean; myProblems: Problem[]; receipt: Receipt | null };

type ReceiptRow = { id: string; member_id: string; given_by: string; given_on: string; condition: string | null; confirmed_at: Date | null; remark: string | null; charter_id: string | null };
export const receiptShape = (r: ReceiptRow): Receipt => ({
  id: String(r.id), member: r.member_id, givenBy: r.given_by, givenOn: r.given_on, condition: r.condition,
  confirmedAt: r.confirmed_at ? new Date(r.confirmed_at).toISOString() : null, remark: r.remark, charterId: r.charter_id === null ? null : String(r.charter_id),
});

// The open receipt of an item for its holder, if any.
export async function currentReceipt(sql: Query, item: Pick<Item, "id" | "holder">): Promise<Receipt | null> {
  if (!item.holder) return null;
  const [row] = await sql<ReceiptRow[]>`
    select id, member_id, given_by, to_char(given_on, 'YYYY-MM-DD') as given_on, condition, confirmed_at, remark, charter_id
    from receipts where item_id = ${item.id} and member_id = ${item.holder} and closed_at is null order by id desc limit 1`;
  return row ? receiptShape(row) : null;
}

type Row = {
  id: string; category_id: string; c_key: Category["key"]; c_name: string | null; c_icon: Category["icon"]; c_kind: Category["kind"]; c_see: boolean;
  tag: string; name: string; serial: string | null; status: Status; purchased_on: string | null; price_cents: string | null; supplier: string | null;
  warranty_until: string | null; notes: string | null; photo: string | null; seats: number | null; seats_used: number; renews_on: string | null;
  cost_cents: string | null; period: Period | null; holder: string | null; place: string | null; held_since: string | null; created_at: Date; open_problems: number;
  extra: Record<string, string> | null; quantity: number | null; min_quantity: number | null; invoice: string | null;
};

// One query shape for every read of items.
const select = (sql: Query) => sql`
  select i.id, i.category_id, c.key as c_key, c.name as c_name, c.icon as c_icon, c.kind as c_kind, c.members_see as c_see,
    i.tag, i.name, i.serial, i.status, to_char(i.purchased_on, 'YYYY-MM-DD') as purchased_on, i.price_cents, i.supplier,
    to_char(i.warranty_until, 'YYYY-MM-DD') as warranty_until, i.notes, i.photo, i.seats,
    (select count(*)::int from seats s where s.item_id = i.id) as seats_used,
    to_char(i.renews_on, 'YYYY-MM-DD') as renews_on, i.cost_cents, i.period, i.holder, i.place,
    to_char(i.held_since, 'YYYY-MM-DD') as held_since, i.created_at,
    (select count(*)::int from problems p where p.item_id = i.id and p.solved_at is null) as open_problems,
    i.extra, i.quantity, i.min_quantity, i.invoice
  from items i join categories c on c.id = i.category_id`;

function shape(r: Row): Item {
  return {
    id: String(r.id),
    category: { id: String(r.category_id), key: r.c_key, name: r.c_name, icon: r.c_icon, kind: r.c_kind, membersSee: r.c_see },
    tag: r.tag, name: r.name, serial: r.serial, status: r.status, purchasedOn: r.purchased_on,
    priceCents: r.price_cents === null ? null : Number(r.price_cents), supplier: r.supplier, warrantyUntil: r.warranty_until,
    notes: r.notes, photo: r.photo, seats: r.seats, seatsUsed: r.seats_used, renewsOn: r.renews_on,
    costCents: r.cost_cents === null ? null : Number(r.cost_cents), period: r.period,
    holder: r.holder, place: r.place, heldSince: r.held_since, createdAt: new Date(r.created_at).toISOString(), openProblems: r.open_problems,
    extra: r.extra ?? {}, quantity: r.quantity, minQuantity: r.min_quantity, invoice: r.invoice, holderHidden: false,
  };
}

export function brief(item: Item): BriefItem {
  const { id, category: c, tag, name, serial, status, photo, seats, seatsUsed, holder, place, heldSince, warrantyUntil, renewsOn, quantity, minQuantity, holderHidden } = item;
  return { id, category: c, tag, name, serial, status, photo, seats, seatsUsed, holder, place, heldSince, warrantyUntil, renewsOn, quantity, minQuantity, holderHidden };
}

// What a member (not a manager) may read of an item. Their own (held, or
// a seat of theirs): all of the short view. Anyone else's: no serial
// number (it helps talk a vendor's support into things), and no holder,
// place or "since" where the category hides who holds its items (keys and
// badges, vehicles by default). Money, supplier, notes, fields and the
// invoice are never theirs (defence in depth: the pages show the short
// view already).
export function forMember(item: Item, me: string, mySeat = false): Item {
  const mine = item.holder === me || mySeat;
  const hide = !mine && !item.category.membersSee && (item.holder !== null || item.place !== null);
  return {
    ...item,
    serial: mine ? item.serial : null,
    holder: hide ? null : item.holder, place: hide ? null : item.place, heldSince: hide ? null : item.heldSince, holderHidden: hide,
    priceCents: null, supplier: null, notes: null, extra: {}, invoice: null, costCents: null, period: null, purchasedOn: null,
  };
}

export function manager(actor: Member | null): Member {
  if (!actor || !can(actor, "items.manage")) throw new AppError("forbidden");
  return actor;
}
export function browser(actor: Member | null): Member {
  if (!actor || !can(actor, "items.browse")) throw new AppError("forbidden");
  return actor;
}

export async function load(sql: Query, itemId: unknown, options: { lock?: boolean } = {}): Promise<Item> {
  const key = id(itemId);
  if (options.lock) await sql`select 1 from items where id = ${key} for update`;
  const rows = await sql<Row[]>`${select(sql)} where i.id = ${key} and i.deleted_at is null`;
  if (!rows[0]) throw new AppError("not_found");
  return shape(rows[0]);
}

export type Entry = {
  item: string; actor: string; kind: string; member?: string | null; place?: string | null; status?: string | null; note?: string | null; day?: string | null;
  qty?: number | null; costCents?: number | null; ref?: string | null; due?: string | null;
};
export async function record(sql: Query, entry: Entry): Promise<void> {
  await sql`insert into history (item_id, actor, kind, member, place, status, note, day, qty, cost_cents, ref, due)
    values (${entry.item}, ${entry.actor}, ${entry.kind}, ${entry.member ?? null}, ${entry.place ?? null}, ${entry.status ?? null}, ${entry.note ?? null}, ${entry.day ?? null},
      ${entry.qty ?? null}, ${entry.costCents ?? null}, ${entry.ref ?? null}, ${entry.due ?? null})`;
}

// ---- Receipts (the person says "I received it": lib/receipts.ts) ----------

// A receipt waits for the person an item was just given to. Any receipt of
// the item still waiting is closed first (the item moved on).
export async function openReceipt(sql: Query, entry: { item: string; member: string; by: string; day: string; condition: string | null }): Promise<void> {
  await closeReceipts(sql, entry.item);
  await sql`insert into receipts (item_id, member_id, given_by, given_on, condition) values (${entry.item}, ${entry.member}, ${entry.by}, ${entry.day}, ${entry.condition})`;
}

// The item left its holder: its receipt is closed, confirmed or not, never
// deleted (a sheet printed later still says what was confirmed).
export async function closeReceipts(sql: Query, itemId: string): Promise<void> {
  await sql`update receipts set closed_at = now() where item_id = ${itemId} and closed_at is null`;
}

// Undo of a take-back: the item never left their hands, so their last
// receipt of it counts again — confirmed or waiting as it was.
async function reopenReceipt(sql: Query, itemId: string, member: string): Promise<boolean> {
  const [last] = await sql<{ id: string; closed_at: Date | null; confirmed_at: Date | null }[]>`
    select id, closed_at, confirmed_at from receipts where item_id = ${itemId} and member_id = ${member} order by id desc limit 1`;
  if (!last) return false;
  if (last.closed_at) await sql`update receipts set closed_at = null where id = ${last.id}`;
  return true;
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
// status may also be "low": things counted in bulk at or under their minimum.
export type Filters = { q?: string; category?: string; status?: string; holder?: string; sort?: string; ids?: string[] };

// The catalogue, searched and filtered. q finds a tag, a serial number, a
// name, a supplier, a place, a field's value (an IMEI) — and a holder by
// name (the Chest is asked). holder: a member id, "erased",
// "place:<name>", or "nobody".
// (The clause is wrapped: a fragment awaited on its own would run.)
// A member (viewer.manager false) searches what they may read: a serial
// number or a field's value on their own items only, a holder or a place
// only where the category shows holders (or their own).
type Viewer = { id: string; manager: boolean };
const viewerOf = (actor: Member): Viewer => ({ id: actor.id, manager: can(actor, "items.manage") });

async function where(sql: Query, filters: Filters, viewer: Viewer) {
  const q = typeof filters.q === "string" ? filters.q.trim().slice(0, limits.search) : "";
  const like = "%" + q.replace(/[\\%_]/gu, m => "\\" + m) + "%";
  const holders = q ? await namedLike(q) : [];
  const categoryId = filters.category && /^[1-9][0-9]{0,17}$/u.test(filters.category) ? filters.category : null;
  const status = filters.status && ["in_stock", "in_use", "in_repair", "lost", "retired"].includes(filters.status) ? filters.status : null;
  const low = filters.status === "low";
  const h = filters.holder ?? "";
  const ids = filters.ids?.filter(x => /^[1-9][0-9]{0,17}$/u.test(x)).slice(0, limits.labels);
  const me = viewer.id;
  // For a member: their own item, and an item whose holders they may see.
  const own = sql`(i.holder = ${me} or exists (select 1 from seats s where s.item_id = i.id and s.member_id = ${me}))`;
  const shown = viewer.manager ? sql`true` : sql`(c.members_see or ${own})`;
  const mine = viewer.manager ? sql`true` : own;
  return { clause: sql`i.deleted_at is null
    ${q ? sql`and (i.tag ilike ${like} or i.name ilike ${like}
      ${viewer.manager ? sql`or i.supplier ilike ${like}` : sql``}
      or (${mine} and i.serial ilike ${like})
      or (${shown} and i.place ilike ${like})
      or (${mine} and exists (select 1 from jsonb_each_text(i.extra) e where e.value ilike ${like}))
      or (${shown} and (i.holder = any(${holders}) or exists (select 1 from seats s where s.item_id = i.id and s.member_id = any(${holders})))))` : sql``}
    ${categoryId ? sql`and i.category_id = ${categoryId}` : sql``}
    ${status ? sql`and i.status = ${status}` : sql``}
    ${low ? sql`and i.status <> 'retired' and i.min_quantity is not null and i.quantity <= i.min_quantity` : sql``}
    ${h === "nobody" ? sql`and ${shown} and i.holder is null and i.place is null and i.seats is null and i.quantity is null`
      : h.startsWith("place:") ? sql`and ${shown} and i.place = ${h.slice(6)}`
      : /^mbr_[a-z2-7]{26}$/u.test(h) || h === "erased" ? sql`and ${h === me ? sql`true` : shown} and (i.holder = ${h} or exists (select 1 from seats s where s.item_id = i.id and s.member_id = ${h}))`
      : sql``}
    ${ids ? sql`and i.id = any(${ids})` : sql``}` };
}

export async function listItems(sql: Query, actor: Member | null, filters: Filters = {}, max = 1000, offset = 0): Promise<Item[]> {
  const viewer = viewerOf(browser(actor));
  const order = filters.sort === "name" ? sql`lower(i.name), i.id`
    : filters.sort === "newest" ? sql`i.created_at desc, i.id desc`
    : filters.sort === "ending" ? sql`least(i.warranty_until, i.renews_on) nulls last, i.id`
    : sql`lower(i.tag), i.id`;
  const rows = await sql<Row[]>`${select(sql)}
    where ${(await where(sql, filters, viewer)).clause}
    order by ${order}
    limit ${max} offset ${Math.max(0, Math.floor(offset))}`;
  const items = rows.map(shape);
  if (viewer.manager) return items;
  const seated = await mySeats(sql, viewer.id, items);
  return items.map(i => forMember(i, viewer.id, seated.has(i.id)));
}

// How many items the filters find (the list's pages).
export async function countItems(sql: Query, actor: Member | null, filters: Filters = {}): Promise<number> {
  const viewer = viewerOf(browser(actor));
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from items i join categories c on c.id = i.category_id where ${(await where(sql, filters, viewer)).clause}`;
  return row?.n ?? 0;
}

// The licences, among these items, where this member has a seat.
async function mySeats(sql: Query, me: string, items: Item[]): Promise<Set<string>> {
  const licences = items.filter(i => i.seats !== null).map(i => i.id);
  if (licences.length === 0) return new Set();
  return new Set((await sql<{ item_id: string }[]>`select item_id from seats where member_id = ${me} and item_id = any(${licences})`).map(r => String(r.item_id)));
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
  const receipt = await currentReceipt(sql, item);
  if (!can(who, "items.manage")) {
    const mySeat = seats.some(s => s.member === who.id);
    const mine = item.holder === who.id || mySeat;
    return { full: false, item: brief(forMember(item, who.id, mySeat)), mySeat, mine, myProblems: problems.filter(p => p.reportedBy === who.id), receipt: item.holder === who.id ? receipt : null };
  }
  const historyRows = await sql<{ id: string; at: Date; day: string | null; actor: string; kind: string; member: string | null; place: string | null; status: string | null; note: string | null; qty: number | null; cost_cents: string | null; ref: string | null; due: string | null }[]>`
    select id, at, to_char(day, 'YYYY-MM-DD') as day, actor, kind, member, place, status, note, qty, cost_cents, ref, to_char(due, 'YYYY-MM-DD') as due
    from history where item_id = ${item.id}
    order by at desc, id desc limit 200`;
  const history = historyRows.map(({ cost_cents, ...h }) => ({ ...h, id: String(h.id), at: new Date(h.at).toISOString(), costCents: cost_cents === null ? null : Number(cost_cents) }));
  return { full: true, item, seats, problems, history, receipt };
}

export async function places(sql: Query, actor: Member | null): Promise<string[]> {
  const viewer = viewerOf(browser(actor));
  // A member lists the places of the categories that show who holds them.
  return (await sql<{ place: string }[]>`select distinct i.place from items i join categories c on c.id = i.category_id
    where i.place is not null and i.deleted_at is null ${viewer.manager ? sql`` : sql`and c.members_see`} order by i.place limit 200`).map(r => r.place);
}

// ---- Writing --------------------------------------------------------------

export type ItemInput = {
  categoryId?: unknown; name?: unknown; tag?: unknown; serial?: unknown; purchasedOn?: unknown; price?: unknown; supplier?: unknown;
  warrantyUntil?: unknown; notes?: unknown; seats?: unknown; renewsOn?: unknown; cost?: unknown; period?: unknown;
  extra?: unknown; quantity?: unknown; minQuantity?: unknown;
  // Several identical items at once: how many, and their serial numbers
  // (one per item, in order; fewer is fine).
  count?: unknown; serials?: unknown;
};

type Fields = {
  name: string; serial: string | null; purchasedOn: string | null; priceCents: number | null; supplier: string | null; warrantyUntil: string | null;
  notes: string | null; seats: number | null; renewsOn: string | null; costCents: number | null; period: Period | null;
  quantity: number | null; minQuantity: number | null;
};

// fields reads a form: an item has a serial and a warranty; a licence has
// seats, a renewal and a cost per month or year; a thing counted in bulk has
// a quantity and a minimum.
function fields(input: ItemInput, kind: Category["kind"]): Fields {
  const dateOf = (value: unknown) => {
    try { return day(value); } catch { throw new AppError("invalid_date"); }
  };
  const base = {
    name: clean(input.name, limits.name),
    purchasedOn: dateOf(input.purchasedOn),
    priceCents: money(input.price),
    supplier: optional(input.supplier, limits.supplier),
    notes: optional(input.notes, limits.notes, { multiline: true }),
    quantity: null, minQuantity: null,
  };
  if (kind === "licence") {
    const seats = seatsCount(input.seats);
    if (seats === null) throw new AppError("invalid_seats");
    const period = input.period === "month" || input.period === "year" ? input.period : input.period === undefined || input.period === null || input.period === "" ? "year" : null;
    if (!period) throw new AppError("invalid");
    return { ...base, serial: null, warrantyUntil: null, seats, renewsOn: dateOf(input.renewsOn), costCents: money(input.cost), period };
  }
  if (kind === "consumable") {
    const quantity = count(input.quantity ?? 0);
    const minQuantity = input.minQuantity === undefined || input.minQuantity === null || input.minQuantity === "" ? null : count(input.minQuantity);
    return { ...base, priceCents: null, serial: null, warrantyUntil: null, seats: null, renewsOn: null, costCents: null, period: null, quantity, minQuantity };
  }
  return { ...base, serial: optional(input.serial, limits.serial), warrantyUntil: dateOf(input.warrantyUntil), seats: null, renewsOn: null, costCents: null, period: null };
}

// The serial numbers of several items added at once: a list, or a text
// with one per line (pasted from a delivery note). Empty lines are
// skipped.
function serialList(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/u) : null;
  if (!list) throw new AppError("invalid");
  return list.slice(0, limits.bulk + 1).map(v => optional(v, limits.serial)).filter((v): v is string => v !== null);
}

export async function createItem(sql: Sql, actor: Member | null, input: ItemInput): Promise<Item> {
  return (await createItems(sql, actor, input))[0]!;
}

// createItems adds one item, or several identical ones (count, with one
// serial number each): each its own tag — the next numbers, or a series
// from the tag the person chose ("LAP-009", "LAP-010"…).
export async function createItems(sql: Sql, actor: Member | null, input: ItemInput): Promise<Item[]> {
  const who = manager(actor);
  const cat = await category(sql, input.categoryId);
  const f = fields(input, cat.kind);
  const extra = readExtra(await fieldsOf(sql, cat.id), input.extra);
  const serials = cat.kind === "asset" ? serialList(input.serials) : [];
  const n = input.count === undefined || input.count === null || input.count === "" ? Math.max(1, serials.length) : count(input.count, 1, limits.bulk);
  if (serials.length > n) throw new AppError("invalid_quantity", { max: n });
  if (n > 1 && cat.kind !== "asset") throw new AppError(cat.kind === "licence" ? "is_licence" : "is_consumable");
  if (new Set(serials.map(x => x.toLowerCase())).size !== serials.length) throw new AppError("invalid");
  const wanted = input.tag === undefined || input.tag === null || (typeof input.tag === "string" && input.tag.trim() === "") ? null : tagSeries(readTag(input.tag), n);
  return sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('equipment.tags'))`;
    const [{ n: existing } = { n: 0 }] = await tx<{ n: number }[]>`select count(*)::int as n from items where deleted_at is null`;
    if (existing + n > limits.items) throw new AppError("too_many", { max: limits.items });
    const made: Item[] = [];
    let auto = wanted ? 0 : Number((await nextTag(tx)).slice(3)) - 1;
    for (let k = 0; k < n; k++) {
      let tag = wanted ? wanted[k]! : makeTag(++auto);
      // The tool's own series skips a tag a person already chose.
      while (!wanted && !(await tagFree(tx, tag))) tag = makeTag(++auto);
      if (!(await tagFree(tx, tag))) throw new AppError("tag_taken", { tag });
      const serial = n > 1 ? serials[k] ?? null : serials[0] ?? f.serial;
      const [row] = await tx<{ id: string }[]>`
        insert into items (category_id, tag, name, serial, purchased_on, price_cents, supplier, warranty_until, notes, seats, renews_on, cost_cents, period, quantity, min_quantity, extra, created_by)
        values (${cat.id}, ${tag}, ${f.name}, ${serial}, ${f.purchasedOn}, ${f.priceCents}, ${f.supplier}, ${f.warrantyUntil}, ${f.notes}, ${f.seats}, ${f.renewsOn}, ${f.costCents}, ${f.period},
          ${f.quantity}, ${f.minQuantity}, ${tx.json(extra)}, ${who.id})
        returning id`;
      await record(tx, { item: row!.id, actor: who.id, kind: "created", status: "in_stock", qty: f.quantity || null });
      made.push(await load(tx, row!.id));
    }
    return made;
  });
}

// The keys of the fields a change touched, for the history ("name, serial").
const editable = ["name", "tag", "category", "serial", "purchasedOn", "priceCents", "supplier", "warrantyUntil", "notes", "seats", "renewsOn", "costCents", "period", "quantity", "minQuantity", "extra"] as const;

export async function updateItem(sql: Sql, actor: Member | null, itemId: unknown, input: ItemInput): Promise<Item> {
  const who = manager(actor);
  const result = await sql.begin(async tx => {
    const before = await load(tx, itemId, { lock: true });
    const cat = input.categoryId === undefined ? before.category : await category(tx, input.categoryId);
    if (cat.kind !== before.category.kind) throw new AppError(before.category.kind === "licence" ? "is_licence" : before.category.kind === "consumable" ? "is_consumable" : cat.kind === "licence" ? "not_licence" : "not_consumable");
    const f = fields(input, cat.kind);
    if (cat.kind === "consumable" && (input.quantity === undefined || input.quantity === "")) f.quantity = before.quantity ?? 0;
    const extra = input.extra === undefined && cat.id === before.category.id ? before.extra : readExtra(await fieldsOf(tx, cat.id), input.extra);
    if (f.seats !== null && f.seats < before.seatsUsed) throw new AppError("seats_below_used", { used: before.seatsUsed });
    const tag = input.tag === undefined ? before.tag : readTag(input.tag);
    if (tag.toLowerCase() !== before.tag.toLowerCase()) {
      await tx`select pg_advisory_xact_lock(hashtext('equipment.tags'))`;
      if (!(await tagFree(tx, tag, before.id))) throw new AppError("tag_taken", { tag });
    }
    await tx`update items set category_id = ${cat.id}, tag = ${tag}, name = ${f.name}, serial = ${f.serial}, purchased_on = ${f.purchasedOn},
      price_cents = ${f.priceCents}, supplier = ${f.supplier}, warranty_until = ${f.warrantyUntil}, notes = ${f.notes}, seats = ${f.seats},
      renews_on = ${f.renewsOn}, cost_cents = ${f.costCents}, period = ${f.period}, quantity = ${f.quantity}, min_quantity = ${f.minQuantity},
      extra = ${tx.json(extra)}, updated_at = now() where id = ${before.id}`;
    const after = await load(tx, before.id);
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const changed = editable.filter(k => k === "category" ? after.category.id !== before.category.id : !same(after[k], before[k]));
    if (changed.length > 0) await record(tx, { item: before.id, actor: who.id, kind: "edited", note: changed.join(",") });
    return { after, before };
  });
  await tell.stockLevel(result.after, result.before);
  return result.after;
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
// told in their bell, in their language, and asked to confirm they
// received it (a receipt). quiet is an Undo: the item goes back to whom
// just had it, without a bell, and their receipt counts again. bell: false
// leaves the telling to the caller (a request answered).
export async function give(sql: Sql, actor: Member | null, itemId: unknown, input: { to?: unknown; note?: unknown; day?: unknown }, options: { quiet?: boolean; bell?: boolean } = {}): Promise<Item> {
  const who = manager(actor);
  const to = holding(input.to);
  const note = optional(input.note, limits.condition, { multiline: true });
  const when = onDay(input.day);
  if ("member" in to && !(await present([to.member])).has(to.member)) throw new AppError("not_member");
  const { item, previous } = await sql.begin(async tx => {
    const before = await load(tx, itemId, { lock: true });
    if (before.category.kind === "licence") throw new AppError("is_licence");
    if (before.category.kind === "consumable") throw new AppError("is_consumable");
    if (before.status === "retired") throw new AppError("not_available");
    if (("member" in to && before.holder === to.member) || ("place" in to && before.place === to.place)) throw new AppError("already_there");
    if (before.holder || before.place) await record(tx, { item: before.id, actor: who.id, kind: "returned", member: before.holder, place: before.place, day: when });
    const member = "member" in to ? to.member : null;
    const place = "place" in to ? to.place : null;
    await tx`update items set holder = ${member}, place = ${place}, held_since = ${when}, status = 'in_use', updated_at = now() where id = ${before.id}`;
    await record(tx, { item: before.id, actor: who.id, kind: "given", member, place, note, day: when });
    await closeReceipts(tx, before.id);
    if (member && !(options.quiet && (await reopenReceipt(tx, before.id, member)))) await openReceipt(tx, { item: before.id, member, by: who.id, day: when, condition: note });
    return { item: await load(tx, before.id), previous: before.holder };
  });
  if (previous) await tell.takenBack(previous, item.id);
  if (item.holder && !options.quiet && options.bell !== false) await tell.given(who, item.holder, item);
  await tell.refreshBadges(sql, [previous, item.holder]);
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
    await closeReceipts(tx, before.id);
    const from: Holding = before.holder ? { member: before.holder } : { place: before.place! };
    return { item: await load(tx, before.id), from };
  });
  if ("member" in result.from) {
    await tell.takenBack(result.from.member, result.item.id);
    await tell.maybeAllBack(sql, result.from.member);
    await tell.refreshBadges(sql, [result.from.member]);
  }
  return result;
}

// A repair, as the status says it: the repairer's reference and the day it
// is expected back when it goes; what it cost when it comes back.
export type Repair = { ref?: unknown; due?: unknown; cost?: unknown };

// setStatus: in stock, in repair, lost, retired. An item someone holds is
// taken back first (a lost laptop is no longer "with Hugo"). A licence, or
// a thing counted in bulk, is only ever retired (cancelled: a licence's
// seats are freed) or active again.
export async function setStatus(sql: Sql, actor: Member | null, itemId: unknown, value: unknown, noteValue?: unknown, repair: Repair = {}): Promise<Item> {
  const who = manager(actor);
  if (!isChosenStatus(value)) throw new AppError("invalid");
  const note = optional(noteValue, limits.condition, { multiline: true });
  const ref = value === "in_repair" ? optional(repair.ref, limits.ref) : null;
  let due: string | null = null;
  if (value === "in_repair") {
    try { due = day(repair.due); } catch { throw new AppError("invalid_date"); }
  }
  const costCents = value !== "in_repair" ? money(repair.cost) : null;
  const result = await sql.begin(async tx => {
    const before = await load(tx, itemId, { lock: true });
    const freed: string[] = [];
    let status: Status = value;
    if (before.category.kind === "licence" || before.category.kind === "consumable") {
      if (value !== "retired" && value !== "in_stock") throw new AppError(before.category.kind === "licence" ? "is_licence" : "is_consumable");
      if (value === "retired" && before.category.kind === "licence") {
        const seats = await tx<{ member_id: string }[]>`delete from seats where item_id = ${before.id} returning member_id`;
        for (const s of seats) {
          await record(tx, { item: before.id, actor: who.id, kind: "seat_taken", member: s.member_id });
          freed.push(s.member_id);
        }
      } else if (before.category.kind === "licence") status = before.seatsUsed > 0 ? "in_use" : "in_stock";
    } else if (before.holder || before.place) {
      await tx`update items set holder = null, place = null, held_since = null where id = ${before.id}`;
      await record(tx, { item: before.id, actor: who.id, kind: "returned", member: before.holder, place: before.place, status: value });
      await closeReceipts(tx, before.id);
      if (before.holder) freed.push(before.holder);
    }
    // A repair's reference or return day may be said again while it is away.
    const repairNews = status === "in_repair" && (ref !== null || due !== null);
    if (status === before.status && freed.length === 0 && !repairNews) return { item: before, freed };
    await tx`update items set status = ${status}, updated_at = now() where id = ${before.id}`;
    await record(tx, { item: before.id, actor: who.id, kind: "status", status, note, ref, due, costCents: before.status === "in_repair" ? costCents : null });
    return { item: await load(tx, before.id), freed };
  });
  for (const m of result.freed) {
    await tell.takenBack(m, result.item.id);
    await tell.maybeAllBack(sql, m);
  }
  if (result.freed.length > 0) await tell.refreshBadges(sql, result.freed);
  return result.item;
}

// The repair an item is in now: since when, the repairer's reference, the
// day it is expected back (the last word of the history on it).
export async function repairOf(sql: Query, itemId: string): Promise<{ since: string; ref: string | null; due: string | null } | null> {
  const rows = await sql<{ at: Date; status: string; ref: string | null; due: string | null }[]>`
    select at, status, ref, to_char(due, 'YYYY-MM-DD') as due from history
    where item_id = ${itemId} and ((kind = 'status') or (kind = 'returned' and status is not null)) order by id desc limit 20`;
  if (rows[0]?.status !== "in_repair") return null;
  // The first word of this repair gives its start; the latest words its
  // reference and its day.
  let k = 0;
  while (rows[k + 1]?.status === "in_repair") k++;
  const span = rows.slice(0, k + 1);
  return { since: new Date(rows[k]!.at).toISOString(), ref: span.find(r => r.ref !== null)?.ref ?? null, due: span.find(r => r.due !== null)?.due ?? null };
}

// What repairs cost an item, all told.
export async function repairCosts(sql: Query, itemId: string): Promise<{ count: number; cents: number }> {
  const [row] = await sql<{ n: number; cents: string | null }[]>`
    select count(*)::int as n, sum(cost_cents) as cents from history where item_id = ${itemId} and kind = 'status' and cost_cents is not null`;
  return { count: row?.n ?? 0, cents: Number(row?.cents ?? 0) };
}

// ---- Things counted in bulk ---------------------------------------------------

// handOut takes some out of the stock — to a person, a place, or nobody in
// particular ("put in the meeting room"). They are used up, not lent: the
// history keeps who had how many. Under the minimum, the managers hear it.
export async function handOut(sql: Sql, actor: Member | null, itemId: unknown, input: { qty?: unknown; to?: unknown; note?: unknown }): Promise<Item> {
  const who = manager(actor);
  const qty = count(input.qty ?? 1, 1);
  const to = input.to === undefined || input.to === null || input.to === "" ? null : holding(input.to);
  const note = optional(input.note, limits.condition, { multiline: true });
  if (to && "member" in to && !(await present([to.member])).has(to.member)) throw new AppError("not_member");
  const result = await sql.begin(async tx => {
    const before = await load(tx, itemId, { lock: true });
    if (before.category.kind !== "consumable") throw new AppError("not_consumable");
    if (before.status === "retired") throw new AppError("not_available");
    if ((before.quantity ?? 0) < qty) throw new AppError("not_enough", { count: before.quantity ?? 0 });
    await tx`update items set quantity = quantity - ${qty}, updated_at = now() where id = ${before.id}`;
    await record(tx, { item: before.id, actor: who.id, kind: "handed_out", qty, member: to && "member" in to ? to.member : null, place: to && "place" in to ? to.place : null, note, day: chest.today() });
    return { before, after: await load(tx, before.id) };
  });
  await tell.stockLevel(result.after, result.before);
  return result.after;
}

// restock adds to the stock (a delivery).
export async function restock(sql: Sql, actor: Member | null, itemId: unknown, input: { qty?: unknown; note?: unknown }): Promise<Item> {
  const who = manager(actor);
  const qty = count(input.qty, 1);
  const note = optional(input.note, limits.condition, { multiline: true });
  const result = await sql.begin(async tx => {
    const before = await load(tx, itemId, { lock: true });
    if (before.category.kind !== "consumable") throw new AppError("not_consumable");
    if ((before.quantity ?? 0) + qty > limits.quantity) throw new AppError("invalid_quantity", { max: limits.quantity });
    await tx`update items set quantity = coalesce(quantity, 0) + ${qty}, updated_at = now() where id = ${before.id}`;
    await record(tx, { item: before.id, actor: who.id, kind: "restocked", qty, note, day: chest.today() });
    return { before, after: await load(tx, before.id) };
  });
  await tell.stockLevel(result.after, result.before);
  return result.after;
}

// Things at or under their minimum, fewest first.
export async function runningLow(sql: Query, actor: Member | null): Promise<Item[]> {
  manager(actor);
  const rows = await sql<Row[]>`${select(sql)}
    where i.deleted_at is null and i.status <> 'retired' and i.min_quantity is not null and i.quantity <= i.min_quantity
    order by i.quantity, lower(i.name) limit 100`;
  return rows.map(shape);
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

// What I hold: my own page, for everyone with a role — with the receipt of
// each item (waiting for my "I received it", or confirmed).
export async function mine(sql: Query, actor: Member | null): Promise<Holdings & { problems: Problem[]; receipts: Map<string, Receipt> }> {
  const who = browser(actor);
  const held = await heldBy(sql, who.id);
  const rows = await sql<{ id: string; item_id: string; reported_by: string; body: string; created_at: Date }[]>`
    select id, item_id, reported_by, body, created_at from problems where reported_by = ${who.id} and solved_at is null order by id desc limit 50`;
  const receipts = await openReceipts(sql, who.id);
  return { ...held, problems: rows.map(p => ({ id: String(p.id), itemId: String(p.item_id), reportedBy: p.reported_by, body: p.body, createdAt: new Date(p.created_at).toISOString() })), receipts };
}

// Receipts still waiting after a while (given on or before that day), for
// the managers: the person has not said they received it.
export async function unconfirmedReceipts(sql: Query, actor: Member | null, before: string): Promise<{ item: Item; member: string; givenOn: string; remindedToday: boolean }[]> {
  manager(actor);
  const rows = await sql<{ item_id: string; member_id: string; given_on: string; reminded: boolean }[]>`
    select r.item_id, r.member_id, to_char(r.given_on, 'YYYY-MM-DD') as given_on, coalesce(r.reminded_at > now() - interval '20 hours', false) as reminded from receipts r join items i on i.id = r.item_id
    where r.confirmed_at is null and r.closed_at is null and r.given_on <= ${before} and i.holder = r.member_id and i.deleted_at is null
    order by r.given_on, r.id limit 50`;
  const out: { item: Item; member: string; givenOn: string; remindedToday: boolean }[] = [];
  for (const r of rows) out.push({ item: await load(sql, r.item_id), member: r.member_id, givenOn: r.given_on, remindedToday: r.reminded });
  return out;
}

// The receipts of what a person holds now, by item id.
export async function openReceipts(sql: Query, member: string): Promise<Map<string, Receipt>> {
  const rows = await sql<(ReceiptRow & { item_id: string })[]>`
    select r.id, r.item_id, r.member_id, r.given_by, to_char(r.given_on, 'YYYY-MM-DD') as given_on, r.condition, r.confirmed_at, r.remark, r.charter_id
    from receipts r join items i on i.id = r.item_id
    where r.member_id = ${member} and r.closed_at is null and i.holder = ${member} and i.deleted_at is null order by r.id`;
  return new Map(rows.map(r => [String(r.item_id), receiptShape(r)]));
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
      await closeReceipts(tx, String(itemId));
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
    await tell.refreshBadges(sql, [h]);
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
      if (moved.length > 0) {
        await record(tx, { item: itemId, actor: who.id, kind: "given", member: h, day: when });
        await reopenReceipt(tx, itemId, h);
      }
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
  if (h !== "erased") await tell.refreshBadges(sql, [h]);
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

// ---- Invoices -----------------------------------------------------------------

// The purchase invoice (a PDF or a picture, in the Chest's files), for the
// accountant. Managers only: members never see money.
export async function setInvoice(sql: Sql, actor: Member | null, itemId: unknown, object: string | null): Promise<{ item: Item; previous: string | null }> {
  const who = manager(actor);
  return sql.begin(async tx => {
    const before = await load(tx, itemId, { lock: true });
    await tx`update items set invoice = ${object}, updated_at = now() where id = ${before.id}`;
    await record(tx, { item: before.id, actor: who.id, kind: "invoice", note: object ? "added" : "removed" });
    return { item: await load(tx, before.id), previous: before.invoice };
  });
}

export async function invoiceOf(sql: Query, actor: Member | null, itemId: unknown): Promise<string> {
  manager(actor);
  const item = await load(sql, itemId);
  if (!item.invoice) throw new AppError("not_found");
  return item.invoice;
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

export type InRepair = Item & { repair: { since: string; ref: string | null; due: string | null } | null };

export async function overview(sql: Query, actor: Member | null, now = chest.today()): Promise<{ ending: Item[]; repair: InRepair[]; problems: (Problem & { item: Item })[]; low: Item[] }> {
  manager(actor);
  const repair: InRepair[] = [];
  for (const item of (await sql<Row[]>`${select(sql)} where i.deleted_at is null and i.status = 'in_repair' order by i.updated_at limit 100`).map(shape)) {
    repair.push({ ...item, repair: await repairOf(sql, item.id) });
  }
  return { ending: await endingSoon(sql, now), repair, problems: await openProblems(sql, actor), low: await runningLow(sql, actor) };
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
