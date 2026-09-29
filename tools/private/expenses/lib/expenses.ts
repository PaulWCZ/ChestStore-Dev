import { createHash } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { can, expenseAccess, type ExpenseAccess } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { clean, distanceTenths, id, ids, limits, memberId, paidByValues, spentOn, type PaidBy, type Status } from "./model.ts";
import { convert, isCurrency, parseAmount, parseRate } from "./money.ts";
import type { ReceiptFile } from "./receipts.ts";
import { tripCents, type VehicleKind } from "./scale.ts";
import { approverOf, mileageCategory, scaleFor, settings, vehicleOf } from "./settings.ts";

// Expenses: a person adds them (a receipt, or a trip with their vehicle),
// sends them, their approver approves or refuses each, the accountant marks
// them paid. Every function checks the actor's rights first and answers
// data or an AppError code.

export type Trip = { from: string; to: string; distance: number; vehicle: VehicleKind; power: string; electric: boolean; scaleYear: number };
export type Receipt = { name: string; type: string; size: number };
export type Expense = {
  id: string;
  owner: string;
  kind: "expense" | "mileage";
  status: Status;
  spentOn: string;
  amount: number;
  currency: string;
  // In another currency than the company's: the rate (millionths) and where
  // it came from; base is the amount in baseCurrency (the company's), null
  // while no rate is known.
  rate: number | null;
  rateSource: "typed" | "company" | null;
  base: number | null;
  baseCurrency: string | null;
  vat: number | null;
  categoryId: string;
  merchant: string;
  note: string;
  paidBy: PaidBy;
  receipt: Receipt | null;
  trip: Trip | null;
  // Who was at the table: people of the Chest (ids) and from outside (names).
  guests: { members: string[]; names: string[] };
  approver: string | null;
  submittedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  refusedReason: string | null;
  // Refused, and nothing changed since: it cannot be sent again as it is.
  refusedUnchanged: boolean;
  paidOn: string | null;
  createdAt: string;
  deleted: boolean;
};

type Row = {
  id: string; member_id: string; kind: "expense" | "mileage"; status: Status; spent_on: string; amount_cents: string; currency: string; vat_cents: string | null;
  category_id: string; merchant: string; note: string; paid_by: PaidBy; receipt_object: string | null; receipt_name: string | null; receipt_type: string | null; receipt_size: string | null;
  from_place: string | null; to_place: string | null; distance_tenths: number | null; vehicle: VehicleKind | null; power: string | null; electric: boolean | null; scale_year: number | null;
  approver_id: string | null; submitted_at: Date | null; decided_by: string | null; decided_at: Date | null; refused_reason: string | null; paid_on: string | null; created_at: Date; deleted_at: Date | null;
  refused_fingerprint: string | null; updated_at: Date; guest_members: string[]; guest_names: string[];
  rate_micro: string | null; rate_source: "typed" | "company" | null; base_cents: string | null; base_currency: string | null; payment_run_id: string | null;
};

const columns = (sql: Query) => sql`
  e.id, e.member_id, e.kind, e.status, to_char(e.spent_on, 'YYYY-MM-DD') as spent_on, e.amount_cents, e.currency, e.vat_cents, e.category_id, e.merchant, e.note, e.paid_by,
  e.receipt_object, e.receipt_name, e.receipt_type, e.receipt_size, e.from_place, e.to_place, e.distance_tenths, e.vehicle, e.power, e.electric, e.scale_year,
  e.approver_id, e.submitted_at, e.decided_by, e.decided_at, e.refused_reason, to_char(e.paid_on, 'YYYY-MM-DD') as paid_on, e.created_at, e.deleted_at,
  e.refused_fingerprint, e.updated_at, e.guest_members, e.guest_names,
  e.rate_micro, e.rate_source, e.base_cents, e.base_currency, e.payment_run_id`;

// What its owner put on an expense, as one hash: what a refusal remembers,
// so that the same expense cannot come back unchanged. A trip's amount is
// left out (the scale and the other trips move it, not its owner). Empty
// values are left out too, so that a column added later with its default
// does not make an old refusal look changed.
export function fingerprint(r: Row): string {
  const fields: Record<string, unknown> = {
    kind: r.kind, spentOn: r.spent_on, amount: r.kind === "mileage" ? null : String(r.amount_cents), currency: r.currency, vat: r.vat_cents === null ? null : String(r.vat_cents),
    category: String(r.category_id), merchant: r.merchant, note: r.note, paidBy: r.paid_by, receipt: r.receipt_object,
    from: r.from_place, to: r.to_place, distance: r.distance_tenths, guestMembers: r.guest_members, guestNames: r.guest_names, rate: r.rate_source === "typed" ? r.rate_micro : null,
  };
  const kept = Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)).sort(([a], [b]) => a.localeCompare(b));
  return createHash("sha256").update(JSON.stringify(kept)).digest("hex");
}

// A draft refused and not changed since. A refusal from before the
// fingerprint (the first version) counts as unchanged until the draft is
// saved again.
function refusedUnchanged(r: Row): boolean {
  if (r.status !== "draft" || r.refused_reason === null) return false;
  if (r.refused_fingerprint !== null) return fingerprint(r) === r.refused_fingerprint;
  return r.decided_at !== null && r.updated_at.getTime() <= r.decided_at.getTime();
}

function toExpense(r: Row): Expense {
  return {
    id: String(r.id),
    owner: r.member_id,
    kind: r.kind,
    status: r.status,
    spentOn: r.spent_on,
    amount: Number(r.amount_cents),
    currency: r.currency,
    rate: r.rate_micro === null ? null : Number(r.rate_micro),
    rateSource: r.rate_source,
    base: r.base_cents === null ? null : Number(r.base_cents),
    baseCurrency: r.base_currency,
    vat: r.vat_cents === null ? null : Number(r.vat_cents),
    categoryId: String(r.category_id),
    merchant: r.merchant,
    note: r.note,
    paidBy: r.paid_by,
    receipt: r.receipt_object ? { name: r.receipt_name ?? "", type: r.receipt_type ?? "", size: Number(r.receipt_size ?? 0) } : null,
    guests: { members: r.guest_members ?? [], names: r.guest_names ?? [] },
    trip: r.kind === "mileage" ? { from: r.from_place ?? "", to: r.to_place ?? "", distance: r.distance_tenths ?? 0, vehicle: r.vehicle!, power: r.power ?? "", electric: r.electric ?? false, scaleYear: r.scale_year ?? 0 } : null,
    approver: r.approver_id,
    submittedAt: r.submitted_at?.toISOString() ?? null,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at?.toISOString() ?? null,
    refusedReason: r.refused_reason,
    refusedUnchanged: refusedUnchanged(r),
    paidOn: r.paid_on,
    createdAt: r.created_at.toISOString(),
    deleted: r.deleted_at !== null,
  };
}

// Warnings, never blocks: what an approver should look at twice.
// "resent": sent again after a refusal (changed since: otherwise it could
// not be sent), with the reason of the last refusal — the approver checks
// the change, and "Approve all" leaves it for a look of its own.
export type Warning = { code: "duplicate" | "receipt_reused" | "no_receipt" | "over_cap" | "resent" | "no_guests" | "no_rate"; cap?: number; reason?: string };

export async function warnings(sql: Query, list: Expense[], options: { anyone?: boolean } = {}): Promise<Map<string, Warning[]>> {
  const out = new Map<string, Warning[]>();
  if (list.length === 0) return out;
  const idList = list.map(e => e.id);
  const { currency } = await settings(sql);
  const rows = await sql<{ id: string; duplicate: boolean; reused: boolean; cap: string | null; refused: string | null; guests: boolean }[]>`
    select e.id,
      exists (select 1 from expenses o where o.id <> e.id and o.deleted_at is null and o.kind = 'expense' and e.kind = 'expense'
              and o.member_id = e.member_id and o.spent_on = e.spent_on and o.amount_cents = e.amount_cents and o.currency = e.currency
              and lower(o.merchant) = lower(e.merchant)) as duplicate,
      exists (select 1 from expenses o where o.id <> e.id and o.deleted_at is null and e.receipt_sha256 is not null and o.receipt_sha256 = e.receipt_sha256
              and (${options.anyone === true} or o.member_id = e.member_id)) as reused,
      c.cap_cents as cap, c.guests,
      case when e.status = 'submitted' then (select h.detail from history h where h.expense_id = e.id and h.kind = 'refused' order by h.at desc, h.id desc limit 1) end as refused
    from expenses e join categories c on c.id = e.category_id
    where e.id = any(${idList}::bigint[])`;
  const byId = new Map(rows.map(r => [String(r.id), r]));
  for (const e of list) {
    const r = byId.get(e.id);
    const found: Warning[] = [];
    if (r?.refused !== null && r?.refused !== undefined) found.push({ code: "resent", reason: r.refused });
    if (r?.duplicate) found.push({ code: "duplicate" });
    if (r?.reused) found.push({ code: "receipt_reused" });
    if (e.kind === "expense" && !e.receipt) found.push({ code: "no_receipt" });
    if (e.base === null) found.push({ code: "no_rate" });
    if (e.kind === "expense" && r?.guests && e.guests.members.length + e.guests.names.length === 0) found.push({ code: "no_guests" });
    if (r?.cap !== null && r?.cap !== undefined && e.currency === currency && e.amount > Number(r.cap)) found.push({ code: "over_cap", cap: Number(r.cap) });
    if (found.length > 0) out.set(e.id, found);
  }
  return out;
}

// The actor's own expenses, newest first (deleted ones out), `limit` at
// most.
export async function mine(sql: Query, actor: Member | null, options: { limit?: number } = {}): Promise<Expense[]> {
  if (!actor || !can(actor, "own")) throw new AppError("forbidden");
  const rows = await sql<Row[]>`
    select ${columns(sql)} from expenses e
    where e.member_id = ${actor.id} and e.deleted_at is null
    order by e.spent_on desc, e.id desc limit ${Math.min(options.limit ?? 400, 1000)}`;
  return rows.map(toExpense);
}

export type HistoryItem = { actor: string; kind: string; detail: string; at: string };

// One expense as the actor may see it, with what they may do and its
// history; not_found when they may not see it.
export async function expense(sql: Query, actor: Member | null, expenseId: unknown): Promise<{ expense: Expense; access: ExpenseAccess; history: HistoryItem[] }> {
  const eid = id(expenseId);
  const [row] = await sql<(Row & { assigned: string | null })[]>`
    select ${columns(sql)}, a.approver_id as assigned from expenses e left join approvers a on a.member_id = e.member_id
    where e.id = ${eid}`;
  if (!row) throw new AppError("not_found");
  const access = expenseAccess(actor, { owner: row.member_id, status: row.status, approver: row.approver_id, assignedTo: row.assigned });
  if (!access.see || (row.deleted_at !== null && !access.own)) throw new AppError("not_found");
  const history = await sql<{ actor: string; kind: string; detail: string; at: Date }[]>`select actor, kind, detail, at from history where expense_id = ${eid} order by at, id`;
  return { expense: toExpense(row), access, history: history.map(h => ({ actor: h.actor, kind: h.kind, detail: h.detail, at: h.at.toISOString() })) };
}

// The receipt object of an expense the actor may see.
export async function receiptObject(sql: Query, actor: Member | null, expenseId: unknown): Promise<{ object: string; type: string; name: string }> {
  const eid = id(expenseId);
  await expense(sql, actor, eid);
  const [row] = await sql<{ receipt_object: string | null; receipt_type: string | null; receipt_name: string | null }[]>`select receipt_object, receipt_type, receipt_name from expenses where id = ${eid}`;
  if (!row?.receipt_object) throw new AppError("not_found");
  return { object: row.receipt_object, type: row.receipt_type ?? "", name: row.receipt_name ?? "" };
}

async function ownDraft(tx: Query, actor: Member, expenseId: string, kind: "expense" | "mileage"): Promise<Row> {
  const [row] = await tx<Row[]>`select ${columns(tx)} from expenses e where e.id = ${expenseId} and e.deleted_at is null for update`;
  if (!row || row.member_id !== actor.id) throw new AppError("not_found");
  if (row.kind !== kind) throw new AppError("invalid");
  if (row.status !== "draft") throw new AppError("not_draft");
  return row;
}

// An expense with a receipt. `receipt`: a new upload (inspected by the
// caller: lib/receipts.ts), null to take it off, undefined to keep it.
export type ExpenseInput = { spentOn?: unknown; amount?: unknown; currency?: unknown; vat?: unknown; categoryId?: unknown; merchant?: unknown; note?: unknown; paidBy?: unknown; receiptName?: unknown; guestMembers?: unknown; guestNames?: unknown; rate?: unknown };

// The guests of a meal: member ids (never the actor: they paid) and names
// of people from outside, 30 of each at most.
export function guestsOf(input: { guestMembers?: unknown; guestNames?: unknown }, actor: string): { members: string[]; names: string[] } {
  const list = (value: unknown): unknown[] => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new AppError("invalid");
    if (value.length > limits.guests) throw new AppError("too_many", { max: limits.guests });
    return value;
  };
  const members = [...new Set(list(input.guestMembers).map(memberId))].filter(m => m !== actor);
  const names = [...new Set(list(input.guestNames).map(n => clean(n, limits.guestName)))];
  return { members, names };
}

export async function saveExpense(sql: Sql, actor: Member | null, expenseId: unknown, input: ExpenseInput, receipt?: ReceiptFile | null): Promise<{ expense: Expense; dropped: string | null }> {
  if (!actor || !can(actor, "own")) throw new AppError("forbidden");
  const company = await settings(sql);
  const currency = input.currency === undefined || input.currency === "" ? company.currency : input.currency;
  if (!isCurrency(currency)) throw new AppError("currency_invalid");
  const amount = parseAmount(input.amount, currency);
  if (amount === null || amount <= 0 || amount > limits.amount) throw new AppError("amount_invalid");
  let vat: number | null = null;
  if (input.vat !== undefined && input.vat !== null && input.vat !== "") {
    vat = parseAmount(input.vat, currency);
    if (vat === null) throw new AppError("amount_invalid");
    if (vat > amount) throw new AppError("vat_too_high");
  }
  const day = spentOn(input.spentOn);
  // Another currency: the rate typed (the card statement's), else the
  // company's rate for it, else none yet.
  let rate: { micro: number; source: "typed" | "company" } | null = null;
  if (currency !== company.currency) {
    if (input.rate !== undefined && input.rate !== null && input.rate !== "") {
      const micro = parseRate(input.rate);
      if (micro === null) throw new AppError("rate_invalid");
      rate = { micro, source: "typed" };
    } else {
      const [known] = await sql<{ rate_micro: string }[]>`select rate_micro from rates where currency = ${currency}`;
      if (known) rate = { micro: Number(known.rate_micro), source: "company" };
    }
  }
  const base = currency === company.currency ? amount : rate ? convert(amount, currency, rate.micro, company.currency) : null;
  const baseCurrency = base === null ? null : company.currency;
  const merchant = clean(input.merchant ?? "", limits.merchant, { optional: true });
  const note = clean(input.note ?? "", limits.note, { optional: true, multiline: true });
  const paidBy = input.paidBy ?? "me";
  if (typeof paidBy !== "string" || !(paidByValues as readonly string[]).includes(paidBy)) throw new AppError("invalid");
  const categoryId = id(input.categoryId);
  const guests = guestsOf(input, actor.id);
  const receiptName = receipt ? clean(input.receiptName ?? "", limits.fileName, { optional: true }) || receipt.object.split("/").at(-1)! : null;
  return sql.begin(async tx => {
    const existing = expenseId === null || expenseId === undefined ? null : await ownDraft(tx, actor, id(expenseId), "expense");
    const [category] = await tx<{ id: string; mileage: boolean; archived_at: Date | null }[]>`select id, mileage, archived_at from categories where id = ${categoryId}`;
    if (!category || category.mileage || (category.archived_at !== null && String(existing?.category_id) !== categoryId)) throw new AppError("category_invalid");
    // The upload is used once, by the member it was granted to.
    if (receipt) {
      const [used] = await tx`delete from uploads where object = ${receipt.object} and member_id = ${actor.id} returning object`;
      if (!used) throw new AppError("file_missing");
    }
    let dropped: string | null = null;
    const fileFields = receipt === undefined
      ? null
      : receipt === null
        ? { object: null, name: null, type: null, size: null, sha: null }
        : { object: receipt.object, name: receiptName, type: receipt.type, size: receipt.size, sha: receipt.sha256 };
    if (fileFields && existing?.receipt_object && existing.receipt_object !== fileFields.object) dropped = existing.receipt_object;
    let row: Row | undefined;
    if (!existing) {
      [row] = await tx<Row[]>`
        insert into expenses as e (member_id, kind, spent_on, amount_cents, currency, vat_cents, category_id, merchant, note, paid_by, guest_members, guest_names, rate_micro, rate_source, base_cents, base_currency, receipt_object, receipt_name, receipt_type, receipt_size, receipt_sha256)
        values (${actor.id}, 'expense', ${day}, ${amount}, ${currency}, ${vat}, ${categoryId}, ${merchant}, ${note}, ${paidBy}, ${guests.members}::text[], ${guests.names}::text[],
                ${rate?.micro ?? null}, ${rate?.source ?? null}, ${base}, ${baseCurrency},
                ${fileFields?.object ?? null}, ${fileFields?.name ?? null}, ${fileFields?.type ?? null}, ${fileFields?.size ?? null}, ${fileFields?.sha ?? null})
        returning ${columns(tx)}`;
      await tx`insert into history (expense_id, actor, kind) values (${row!.id}, ${actor.id}, 'created')`;
    } else {
      [row] = await tx<Row[]>`
        update expenses as e set spent_on = ${day}, amount_cents = ${amount}, currency = ${currency}, vat_cents = ${vat}, category_id = ${categoryId},
          merchant = ${merchant}, note = ${note}, paid_by = ${paidBy}, guest_members = ${guests.members}::text[], guest_names = ${guests.names}::text[],
          rate_micro = ${rate?.micro ?? null}, rate_source = ${rate?.source ?? null}, base_cents = ${base}, base_currency = ${baseCurrency}, updated_at = now()
          ${fileFields ? tx`, receipt_object = ${fileFields.object}, receipt_name = ${fileFields.name}, receipt_type = ${fileFields.type}, receipt_size = ${fileFields.size}, receipt_sha256 = ${fileFields.sha}` : tx``}
        where e.id = ${existing.id}
        returning ${columns(tx)}`;
      await tx`insert into history (expense_id, actor, kind) values (${existing.id}, ${actor.id}, 'edited')`;
    }
    return { expense: toExpense(row!), dropped };
  });
}

// A trip with one's own vehicle: the amount comes from the scale and the
// year's earlier trips (lib/scale.ts).
export type TripInput = { spentOn?: unknown; from?: unknown; to?: unknown; distance?: unknown; roundTrip?: unknown; note?: unknown };

export async function saveTrip(sql: Sql, actor: Member | null, expenseId: unknown, input: TripInput): Promise<Expense> {
  if (!actor || !can(actor, "own")) throw new AppError("forbidden");
  const vehicle = await vehicleOf(sql, actor.id);
  if (!vehicle) throw new AppError("no_vehicle");
  const day = spentOn(input.spentOn);
  const from = clean(input.from ?? "", limits.place);
  const to = clean(input.to ?? "", limits.place);
  const note = clean(input.note ?? "", limits.note, { optional: true, multiline: true });
  let distance = distanceTenths(input.distance);
  if (input.roundTrip === true) distance *= 2;
  if (distance > limits.distanceTenths) throw new AppError("distance_invalid");
  const year = Number(day.slice(0, 4));
  const scale = await scaleFor(sql, year);
  if (!scale.data[vehicle.kind].rows.some(r => r.power === vehicle.power)) throw new AppError("no_vehicle");
  const { currency } = await settings(sql);
  const category = await mileageCategory(sql);
  const eid = await sql.begin(async tx => {
    let target: string;
    const years = new Set([year]);
    const kinds = new Set<VehicleKind>([vehicle.kind]);
    if (expenseId === null || expenseId === undefined) {
      const [row] = await tx<{ id: string }[]>`
        insert into expenses (member_id, kind, spent_on, amount_cents, base_cents, currency, base_currency, category_id, merchant, note, paid_by, from_place, to_place, distance_tenths, vehicle, power, electric, scale_year)
        values (${actor.id}, 'mileage', ${day}, 1, 1, ${currency}, ${currency}, ${category.id}, '', ${note}, 'me', ${from}, ${to}, ${distance}, ${vehicle.kind}, ${vehicle.power}, ${vehicle.electric}, ${scale.year})
        returning id`;
      target = String(row!.id);
      await tx`insert into history (expense_id, actor, kind) values (${target}, ${actor.id}, 'created')`;
    } else {
      const existing = await ownDraft(tx, actor, id(expenseId), "mileage");
      target = String(existing.id);
      years.add(Number(existing.spent_on.slice(0, 4)));
      if (existing.vehicle) kinds.add(existing.vehicle);
      await tx`
        update expenses set spent_on = ${day}, note = ${note}, from_place = ${from}, to_place = ${to}, distance_tenths = ${distance},
          vehicle = ${vehicle.kind}, power = ${vehicle.power}, electric = ${vehicle.electric}, scale_year = ${scale.year}, currency = ${currency}, base_currency = ${currency}, updated_at = now()
        where id = ${target}`;
      await tx`insert into history (expense_id, actor, kind) values (${target}, ${actor.id}, 'edited')`;
    }
    for (const y of years) for (const k of kinds) await recomputeTrips(tx, actor.id, y, k);
    return target;
  });
  return (await expense(sql, actor, eid)).expense;
}

// recomputeTrips sets again the amount of a person's trips of a year with
// one kind of vehicle that are not yet approved, in the order they were
// made: a trip added before others moves them along the scale. Approved and
// paid trips keep their amount, and still count in the year's distance.
export async function recomputeTrips(tx: Query, member: string, year: number, kind: VehicleKind): Promise<number> {
  const trips = await tx<{ id: string; status: Status; amount_cents: string; distance_tenths: number; power: string; electric: boolean; scale_year: number }[]>`
    select id, status, amount_cents, distance_tenths, power, electric, scale_year from expenses
    where member_id = ${member} and kind = 'mileage' and vehicle = ${kind} and deleted_at is null
      and spent_on >= ${`${year}-01-01`} and spent_on < ${`${year + 1}-01-01`}
    order by spent_on, id
    for update`;
  if (trips.length === 0) return 0;
  const scale = await scaleFor(tx, year);
  let before = 0;
  let changed = 0;
  for (const t of trips) {
    if (t.status === "draft" || t.status === "submitted") {
      let amount: number;
      try {
        amount = Math.max(1, tripCents(scale.data, kind, t.power, t.electric, before, t.distance_tenths));
      } catch {
        // A power the scale no longer lists: the amount stays as it was.
        amount = Number(t.amount_cents);
      }
      if (amount !== Number(t.amount_cents) || scale.year !== t.scale_year) {
        await tx`update expenses set amount_cents = ${amount}, base_cents = ${amount}, scale_year = ${scale.year} where id = ${t.id}`;
        changed++;
      }
    }
    before += t.distance_tenths;
  }
  return changed;
}

// After the accountant changes a scale: every trip not yet approved.
export async function recomputeAllTrips(sql: Sql): Promise<number> {
  const groups = await sql<{ member_id: string; year: number; vehicle: VehicleKind }[]>`
    select distinct member_id, extract(year from spent_on)::int as year, vehicle from expenses
    where kind = 'mileage' and deleted_at is null and status in ('draft', 'submitted')`;
  let changed = 0;
  for (const g of groups) changed += await sql.begin(tx => recomputeTrips(tx, g.member_id, g.year, g.vehicle));
  return changed;
}

// The distance of a person's trips in a year (tenths of km), by vehicle.
export async function yearDistance(sql: Query, member: string, year: number): Promise<number> {
  const [row] = await sql<{ d: string | null }[]>`
    select sum(distance_tenths) as d from expenses where member_id = ${member} and kind = 'mileage' and deleted_at is null
      and spent_on >= ${`${year}-01-01`} and spent_on < ${`${year + 1}-01-01`}`;
  return Number(row?.d ?? 0);
}

// Deleting a draft keeps it a week (Undo), then the job forgets it.
export async function remove(sql: Sql, actor: Member | null, expenseId: unknown): Promise<void> {
  if (!actor || !can(actor, "own")) throw new AppError("forbidden");
  const eid = id(expenseId);
  await sql.begin(async tx => {
    const row = await ownDraft(tx, actor, eid, (await tx<{ kind: "expense" | "mileage" }[]>`select kind from expenses where id = ${eid}`)[0]?.kind ?? "expense");
    await tx`update expenses set deleted_at = now() where id = ${row.id}`;
    if (row.kind === "mileage" && row.vehicle) await recomputeTrips(tx, actor.id, Number(row.spent_on.slice(0, 4)), row.vehicle);
  });
}

export async function restore(sql: Sql, actor: Member | null, expenseId: unknown): Promise<void> {
  if (!actor || !can(actor, "own")) throw new AppError("forbidden");
  const eid = id(expenseId);
  await sql.begin(async tx => {
    const [row] = await tx<Row[]>`select ${columns(tx)} from expenses e where e.id = ${eid} and e.member_id = ${actor.id} and e.deleted_at is not null for update`;
    if (!row) throw new AppError("not_found");
    await tx`update expenses set deleted_at = null where id = ${eid}`;
    if (row.kind === "mileage" && row.vehicle) await recomputeTrips(tx, actor.id, Number(row.spent_on.slice(0, 4)), row.vehicle);
  });
}

// Totals by currency: [{currency, amount}], largest first.
// An expense with a base (in the company's currency) counts in it; one in
// another currency without a rate counts apart, in its own.
export type Total = { currency: string; amount: number };
export function totals(list: { amount: number; currency: string; base?: number | null; baseCurrency?: string | null }[]): Total[] {
  const sums = new Map<string, number>();
  for (const e of list) {
    const [currency, amount] = e.base !== undefined && e.base !== null && e.baseCurrency ? [e.baseCurrency, e.base] : [e.currency, e.amount];
    sums.set(currency, (sums.get(currency) ?? 0) + amount);
  }
  return [...sums].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount);
}

// submit sends the actor's drafts to their approver (the one named for
// them, when that person may still approve; the accountants otherwise).
export async function submit(sql: Sql, actor: Member | null, selection: unknown, mayApprove: (id: string) => Promise<boolean>): Promise<{ claim: string; approver: string | null; expenses: Expense[] }> {
  if (!actor || !can(actor, "own")) throw new AppError("forbidden");
  const list = ids(selection);
  let approver = await approverOf(sql, actor.id);
  if (approver !== null && !(await mayApprove(approver))) approver = null;
  return sql.begin(async tx => {
    const rows = await tx<Row[]>`
      select ${columns(tx)} from expenses e where e.id = any(${list}::bigint[]) and e.member_id = ${actor.id} and e.deleted_at is null for update`;
    if (rows.length !== list.length) throw new AppError("not_found");
    if (rows.some(r => r.status !== "draft")) throw new AppError("not_draft");
    // A refusal means something: the same expense does not go back as it was.
    if (rows.some(refusedUnchanged)) throw new AppError("refused_unchanged");
    const [claim] = await tx<{ id: string }[]>`insert into claims (member_id) values (${actor.id}) returning id`;
    const updated = await tx<Row[]>`
      update expenses as e set status = 'submitted', approver_id = ${approver}, submitted_at = now(), claim_id = ${claim!.id}, refused_reason = null, decided_by = null, decided_at = null
      where e.id = any(${list}::bigint[]) returning ${columns(tx)}`;
    for (const r of updated) await tx`insert into history (expense_id, actor, kind) values (${r.id}, ${actor.id}, 'submitted')`;
    return { claim: String(claim!.id), approver, expenses: updated.map(toExpense).sort((a, b) => a.spentOn.localeCompare(b.spentOn)) };
  });
}

// What waits for the actor's decision, oldest sent first.
export async function waiting(sql: Query, actor: Member | null): Promise<Expense[]> {
  if (!actor || !can(actor, "approve")) throw new AppError("forbidden");
  const all = can(actor, "approve.all");
  const rows = await sql<(Row & { assigned: string | null })[]>`
    select ${columns(sql)}, a.approver_id as assigned from expenses e left join approvers a on a.member_id = e.member_id
    where e.status = 'submitted' and e.deleted_at is null ${all ? sql`` : sql`and e.approver_id = ${actor.id}`}
    order by e.submitted_at, e.spent_on, e.id limit 2000`;
  return rows.filter(r => expenseAccess(actor, { owner: r.member_id, status: r.status, approver: r.approver_id, assignedTo: r.assigned }).decide).map(toExpense);
}

// What the actor decided, or was decided for the people they approve, in
// the last 60 days (for "Recently").
export async function decided(sql: Query, actor: Member | null): Promise<Expense[]> {
  if (!actor || !can(actor, "approve")) throw new AppError("forbidden");
  const all = can(actor, "see.all");
  const rows = await sql<Row[]>`
    select ${columns(sql)} from expenses e
    where e.deleted_at is null and e.status in ('approved', 'paid') and e.decided_at > now() - interval '60 days'
      and e.member_id <> ${actor.id}
      ${all ? sql`` : sql`and (e.decided_by = ${actor.id} or e.approver_id = ${actor.id})`}
    order by e.decided_at desc, e.id desc limit 100`;
  return rows.map(toExpense);
}

export type Decision = { owner: string; expenses: Expense[] };

// decide approves, or refuses with a reason, expenses the actor may decide
// on. A refused expense goes back to its owner's drafts, with the reason.
export async function decide(sql: Sql, actor: Member | null, selection: unknown, verdict: "approve" | "refuse", reasonValue?: unknown): Promise<Decision[]> {
  if (!actor || !can(actor, "approve")) throw new AppError("forbidden");
  if (verdict !== "approve" && verdict !== "refuse") throw new AppError("invalid");
  const list = ids(selection);
  const reason = verdict === "refuse" ? (() => {
    try {
      return clean(reasonValue, limits.reason);
    } catch (error) {
      if (error instanceof AppError && error.code === "empty") throw new AppError("reason_needed");
      throw error;
    }
  })() : null;
  return sql.begin(async tx => {
    const rows = await tx<(Row & { assigned: string | null })[]>`
      select ${columns(tx)}, a.approver_id as assigned from expenses e left join approvers a on a.member_id = e.member_id
      where e.id = any(${list}::bigint[]) and e.deleted_at is null for update of e`;
    if (rows.length !== list.length) throw new AppError("not_found");
    for (const r of rows) {
      const access = expenseAccess(actor, { owner: r.member_id, status: r.status, approver: r.approver_id, assignedTo: r.assigned });
      if (!access.see) throw new AppError("not_found");
      if (r.status !== "submitted") throw new AppError("not_submitted");
      if (!access.decide) throw new AppError(r.member_id === actor.id ? "self_approval" : "forbidden");
      // Sent again exactly as it was refused (a sending from before this
      // check, or a race): never approved as it is.
      if (verdict === "approve" && r.refused_fingerprint !== null && fingerprint(r) === r.refused_fingerprint) throw new AppError("refused_unchanged");
    }
    const updated = verdict === "approve"
      ? await tx<Row[]>`update expenses as e set status = 'approved', decided_by = ${actor.id}, decided_at = now() where e.id = any(${list}::bigint[]) returning ${columns(tx)}`
      : await tx<Row[]>`
          update expenses as e set status = 'draft', decided_by = ${actor.id}, decided_at = now(), refused_reason = ${reason}, approver_id = null, submitted_at = null, claim_id = null
          where e.id = any(${list}::bigint[]) returning ${columns(tx)}`;
    if (verdict === "refuse") {
      for (const r of updated) {
        r.refused_fingerprint = fingerprint(r);
        await tx`update expenses set refused_fingerprint = ${r.refused_fingerprint} where id = ${r.id}`;
      }
    }
    for (const r of updated) await tx`insert into history (expense_id, actor, kind, detail) values (${r.id}, ${actor.id}, ${verdict === "approve" ? "approved" : "refused"}, ${reason ?? ""})`;
    const byOwner = new Map<string, Expense[]>();
    for (const r of updated.map(toExpense)) byOwner.set(r.owner, [...(byOwner.get(r.owner) ?? []), r]);
    return [...byOwner].map(([owner, expenses]) => ({ owner, expenses }));
  });
}

// What the company owes back: approved, paid by the person, not yet paid.
export async function toPay(sql: Query, actor: Member | null): Promise<Expense[]> {
  if (!can(actor, "pay")) throw new AppError("forbidden");
  const rows = await sql<Row[]>`
    select ${columns(sql)} from expenses e
    where e.status = 'approved' and e.paid_by = 'me' and e.deleted_at is null
    order by e.member_id, e.spent_on, e.id limit 5000`;
  return rows.map(toExpense);
}

// Paid recently (for "Paid" and Undo), 90 days.
export async function paidRecently(sql: Query, actor: Member | null): Promise<Expense[]> {
  if (!can(actor, "pay")) throw new AppError("forbidden");
  const rows = await sql<Row[]>`
    select ${columns(sql)} from expenses e
    where e.status = 'paid' and e.deleted_at is null and e.paid_on > current_date - 90
    order by e.paid_on desc, e.member_id, e.id limit 500`;
  return rows.map(toExpense);
}

export async function markPaid(sql: Sql, actor: Member | null, selection: unknown, paidOnValue: unknown): Promise<Decision[]> {
  if (!can(actor, "pay")) throw new AppError("forbidden");
  const list = ids(selection, 2000);
  const paidOn = spentOn(paidOnValue);
  return sql.begin(async tx => {
    const rows = await tx<{ id: string; status: Status; paid_by: PaidBy }[]>`select id, status, paid_by from expenses where id = any(${list}::bigint[]) and deleted_at is null for update`;
    if (rows.length !== list.length) throw new AppError("not_found");
    if (rows.some(r => r.status !== "approved" || r.paid_by !== "me")) throw new AppError("not_approved");
    const updated = await tx<Row[]>`update expenses as e set status = 'paid', paid_on = ${paidOn}, paid_marked_by = ${actor!.id} where e.id = any(${list}::bigint[]) returning ${columns(tx)}`;
    for (const r of updated) await tx`insert into history (expense_id, actor, kind, detail) values (${r.id}, ${actor!.id}, 'paid', ${paidOn})`;
    const byOwner = new Map<string, Expense[]>();
    for (const r of updated.map(toExpense)) byOwner.set(r.owner, [...(byOwner.get(r.owner) ?? []), r]);
    return [...byOwner].map(([owner, expenses]) => ({ owner, expenses }));
  });
}

// Expenses by id, as rows (for the services that changed them).
export async function expensesByIds(sql: Query, list: string[]): Promise<Expense[]> {
  const rows = await sql<Row[]>`select ${columns(sql)} from expenses e where e.id = any(${list}::bigint[]) order by e.spent_on, e.id`;
  return rows.map(toExpense);
}

// Undo of "Mark paid": back to approved. What a transfer file paid is
// undone by cancelling the file (lib/payments.ts), never line by line.
export async function unmarkPaid(sql: Sql, actor: Member | null, selection: unknown): Promise<string[]> {
  if (!can(actor, "pay")) throw new AppError("forbidden");
  const list = ids(selection, 2000);
  return sql.begin(async tx => {
    const rows = await tx<{ id: string; status: Status; member_id: string; payment_run_id: string | null }[]>`select id, status, member_id, payment_run_id from expenses where id = any(${list}::bigint[]) and deleted_at is null for update`;
    if (rows.length !== list.length) throw new AppError("not_found");
    if (rows.some(r => r.status !== "paid" || r.payment_run_id !== null)) throw new AppError("invalid");
    await tx`update expenses set status = 'approved', paid_on = null, paid_marked_by = null where id = any(${list}::bigint[])`;
    for (const r of rows) await tx`insert into history (expense_id, actor, kind) values (${r.id}, ${actor!.id}, 'unpaid')`;
    return [...new Set(rows.map(r => r.member_id))];
  });
}

// What waits for each of these members: expenses to decide (for an
// accountant, those nobody else approves too), and their own refused
// drafts. The number on the tool's tile.
export async function waitingCounts(sql: Query, memberIds: string[], accountantIds: string[]): Promise<Map<string, number>> {
  const counts = new Map(memberIds.map(m => [m, 0]));
  if (memberIds.length === 0) return counts;
  const accountants = accountantIds.filter(a => memberIds.includes(a));
  const approvals = await sql<{ member: string; n: number }[]>`
    select m.member, count(e.id)::int as n
    from unnest(${memberIds}::text[]) as m(member)
    join expenses e on e.status = 'submitted' and e.deleted_at is null and (
      (e.approver_id = m.member and e.member_id <> m.member)
      or (m.member = any(${accountants}::text[]) and e.approver_id is null
          and (e.member_id <> m.member or not exists (select 1 from approvers a where a.member_id = e.member_id))))
    group by m.member`;
  for (const r of approvals) counts.set(r.member, (counts.get(r.member) ?? 0) + r.n);
  const refused = await sql<{ member: string; n: number }[]>`
    select member_id as member, count(*)::int as n from expenses
    where member_id = any(${memberIds}::text[]) and status = 'draft' and refused_reason is not null and deleted_at is null group by member_id`;
  for (const r of refused) counts.set(r.member, (counts.get(r.member) ?? 0) + r.n);
  return counts;
}

// The export of a month (by the day of the expense): approved and paid
// expenses, with their category, oldest first; one person or everyone.
export type ExportRow = Expense & { categoryKey: string | null; categoryName: string | null; account: string; vatRecovery: number; decidedBy: string | null };

export async function exportRows(sql: Query, actor: Member | null, range: { from: string; to: string }, person?: string | null): Promise<ExportRow[]> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const rows = await sql<(Row & { category_key: string | null; category_name: string | null; account: string; vat_recovery: number })[]>`
    select ${columns(sql)}, c.key as category_key, c.name as category_name, c.account, c.vat_recovery
    from expenses e join categories c on c.id = e.category_id
    where e.deleted_at is null and e.status in ('approved', 'paid') and e.spent_on >= ${range.from} and e.spent_on < ${range.to}
      ${person ? sql`and e.member_id = ${person}` : sql``}
    order by e.spent_on, e.member_id, e.id limit ${limits.exportRows + 1}`;
  if (rows.length > limits.exportRows) throw new AppError("export_too_large", { max: limits.exportRows });
  return rows.map(r => ({ ...toExpense(r), categoryKey: r.category_key, categoryName: r.category_name, account: r.account, vatRecovery: r.vat_recovery }));
}

// The receipts of the same selection, for the ZIP: bounded in count and
// bytes before anything is sent.
export async function exportReceipts(sql: Query, actor: Member | null, range: { from: string; to: string }, person?: string | null): Promise<{ id: string; owner: string; spentOn: string; amount: number; currency: string; object: string; type: string; size: number }[]> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const rows = await sql<{ id: string; member_id: string; spent_on: string; amount_cents: string; currency: string; receipt_object: string; receipt_type: string; receipt_size: string }[]>`
    select e.id, e.member_id, to_char(e.spent_on, 'YYYY-MM-DD') as spent_on, e.amount_cents, e.currency, e.receipt_object, e.receipt_type, e.receipt_size
    from expenses e
    where e.deleted_at is null and e.status in ('approved', 'paid') and e.receipt_object is not null and e.spent_on >= ${range.from} and e.spent_on < ${range.to}
      ${person ? sql`and e.member_id = ${person}` : sql``}
    order by e.spent_on, e.member_id, e.id limit ${limits.exportFiles + 1}`;
  if (rows.length > limits.exportFiles) throw new AppError("export_too_large", { max: limits.exportFiles });
  const bytes = rows.reduce((sum, r) => sum + Number(r.receipt_size), 0);
  if (bytes > limits.exportBytes) throw new AppError("export_too_large", { max: limits.exportFiles });
  return rows.map(r => ({ id: String(r.id), owner: r.member_id, spentOn: r.spent_on, amount: Number(r.amount_cents), currency: r.currency, object: r.receipt_object, type: r.receipt_type, size: Number(r.receipt_size) }));
}

// The months that have something to export, newest first (the Export
// page's picker), with counts.
export async function exportMonths(sql: Query, actor: Member | null): Promise<{ month: string; count: number; people: number }[]> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const rows = await sql<{ month: string; count: number; people: number }[]>`
    select to_char(spent_on, 'YYYY-MM') as month, count(*)::int as count, count(distinct member_id)::int as people from expenses
    where deleted_at is null and status in ('approved', 'paid') group by 1 order by 1 desc limit 36`;
  return rows;
}

// Who has something to export in a month, and how much.
export async function exportPeople(sql: Query, actor: Member | null, range: { from: string; to: string }): Promise<{ member: string; count: number }[]> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const rows = await sql<{ member_id: string; n: number }[]>`
    select member_id, count(*)::int as n from expenses where deleted_at is null and status in ('approved', 'paid')
      and spent_on >= ${range.from} and spent_on < ${range.to} group by member_id`;
  return rows.map(r => ({ member: r.member_id, count: r.n }));
}
