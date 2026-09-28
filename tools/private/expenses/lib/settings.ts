import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { clean, id, limits, memberId, percent } from "./model.ts";
import { defaultCurrency, isCurrency, parseAmount } from "./money.ts";
import { checkScale, isVehicleKind, powers, type Scale, type VehicleKind } from "./scale.ts";

// What the accountant sets for the whole company — currency, reminder,
// categories, the mileage scale, who approves whom — and each person's
// vehicle.

export type Settings = { currency: string; reminder: boolean };
const defaults: Settings = { currency: defaultCurrency, reminder: true };

export async function settings(sql: Query): Promise<Settings> {
  const rows = await sql<{ key: string; value: unknown }[]>`select key, value from settings`;
  const out: Settings = { ...defaults };
  for (const r of rows) {
    if (r.key === "currency" && isCurrency(r.value)) out.currency = r.value;
    if (r.key === "reminder" && typeof r.value === "boolean") out.reminder = r.value;
  }
  return out;
}

export async function updateSettings(sql: Sql, actor: Member | null, input: { currency?: unknown; reminder?: unknown }): Promise<Settings> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  if (input.currency !== undefined) {
    if (!isCurrency(input.currency)) throw new AppError("currency_invalid");
    await sql`insert into settings (key, value) values ('currency', ${sql.json(input.currency)}) on conflict (key) do update set value = excluded.value`;
  }
  if (input.reminder !== undefined) {
    if (typeof input.reminder !== "boolean") throw new AppError("invalid");
    await sql`insert into settings (key, value) values ('reminder', ${sql.json(input.reminder)}) on conflict (key) do update set value = excluded.value`;
  }
  return settings(sql);
}

// Categories. A built-in one has a key the pages name in each language,
// until the accountant gives it a name.
export type Category = { id: string; key: string | null; name: string | null; account: string; vatRecovery: number; cap: number | null; mileage: boolean; archived: boolean };

type CategoryRow = { id: string; key: string | null; name: string | null; account: string; vat_recovery: number; cap_cents: string | null; mileage: boolean; archived_at: Date | null };
const toCategory = (r: CategoryRow): Category => ({ id: String(r.id), key: r.key, name: r.name, account: r.account, vatRecovery: r.vat_recovery, cap: r.cap_cents === null ? null : Number(r.cap_cents), mileage: r.mileage, archived: r.archived_at !== null });

export async function categories(sql: Query, options: { archived?: boolean } = {}): Promise<Category[]> {
  const rows = await sql<CategoryRow[]>`select id, key, name, account, vat_recovery, cap_cents, mileage, archived_at from categories ${options.archived ? sql`` : sql`where archived_at is null`} order by archived_at nulls first, position, id`;
  return rows.map(toCategory);
}

export async function mileageCategory(sql: Query): Promise<Category> {
  const [row] = await sql<CategoryRow[]>`select id, key, name, account, vat_recovery, cap_cents, mileage, archived_at from categories where mileage order by archived_at nulls first, id limit 1`;
  if (!row) throw new AppError("category_invalid");
  return toCategory(row);
}

type CategoryInput = { name?: unknown; account?: unknown; vatRecovery?: unknown; cap?: unknown };

function categoryFields(input: CategoryInput, currency: string) {
  const out: { name?: string | null; account?: string; vatRecovery?: number; cap?: number | null } = {};
  // An empty name gives a built-in category its own name back (the caller
  // refuses it for the others).
  if (input.name !== undefined) out.name = input.name === "" ? null : clean(input.name, limits.categoryName);
  if (input.account !== undefined) {
    out.account = clean(input.account, limits.account, { optional: true });
    if (!/^[0-9A-Za-z .-]*$/u.test(out.account)) throw new AppError("invalid");
  }
  if (input.vatRecovery !== undefined) out.vatRecovery = percent(input.vatRecovery);
  if (input.cap !== undefined) {
    if (input.cap === null || input.cap === "") out.cap = null;
    else {
      const cap = parseAmount(input.cap, currency);
      if (cap === null || cap <= 0 || cap > limits.amount) throw new AppError("amount_invalid");
      out.cap = cap;
    }
  }
  return out;
}

export async function addCategory(sql: Sql, actor: Member | null, input: CategoryInput): Promise<Category> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const { currency } = await settings(sql);
  const f = categoryFields(input, currency);
  if (f.name === undefined || f.name === null) throw new AppError("empty");
  const [counted] = await sql<{ n: number }[]>`select count(*)::int as n from categories where archived_at is null`;
  const n = counted?.n ?? 0;
  if (n >= limits.categories) throw new AppError("too_many", { max: limits.categories });
  const [row] = await sql<CategoryRow[]>`
    insert into categories (name, account, vat_recovery, cap_cents, position)
    values (${f.name}, ${f.account ?? ""}, ${f.vatRecovery ?? 100}, ${f.cap ?? null}, (select coalesce(max(position), 0) + 1 from categories))
    returning id, key, name, account, vat_recovery, cap_cents, mileage, archived_at`;
  return toCategory(row!);
}

export async function updateCategory(sql: Sql, actor: Member | null, categoryId: unknown, input: CategoryInput & { archived?: unknown }): Promise<Category> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const cid = id(categoryId);
  const { currency } = await settings(sql);
  const f = categoryFields(input, currency);
  const [current] = await sql<CategoryRow[]>`select id, key, name, account, vat_recovery, cap_cents, mileage, archived_at from categories where id = ${cid}`;
  if (!current) throw new AppError("not_found");
  let archived = current.archived_at !== null;
  if (input.archived !== undefined) {
    if (typeof input.archived !== "boolean") throw new AppError("invalid");
    // The mileage category stays: trips need it.
    if (input.archived && current.mileage) throw new AppError("category_invalid");
    archived = input.archived;
  }
  if (f.name === null && current.key === null) throw new AppError("empty");
  const [row] = await sql<CategoryRow[]>`
    update categories set
      name = ${f.name !== undefined ? f.name : current.name},
      account = ${f.account !== undefined ? f.account : current.account},
      vat_recovery = ${f.vatRecovery !== undefined ? f.vatRecovery : current.vat_recovery},
      cap_cents = ${f.cap !== undefined ? f.cap : current.cap_cents},
      archived_at = ${archived ? (current.archived_at ?? new Date()) : null}
    where id = ${cid}
    returning id, key, name, account, vat_recovery, cap_cents, mileage, archived_at`;
  return toCategory(row!);
}

// The mileage scale of each year.
export type ScaleYear = { year: number; data: Scale; source: string; updatedAt: string };

export async function scales(sql: Query): Promise<ScaleYear[]> {
  const rows = await sql<{ year: number; data: unknown; source: string; updated_at: Date }[]>`select year, data, source, updated_at from mileage_scales order by year desc`;
  return rows.map(r => ({ year: r.year, data: checkScale(r.data), source: r.source, updatedAt: r.updated_at.toISOString() }));
}

// The scale that applies to a year: its own, or the latest one before it
// (the scale of a year is published the next spring), or the first one.
export async function scaleFor(sql: Query, year: number): Promise<ScaleYear> {
  const [row] = await sql<{ year: number; data: unknown; source: string; updated_at: Date }[]>`
    select year, data, source, updated_at from mileage_scales
    order by (year <= ${year}) desc, case when year <= ${year} then -year else year end limit 1`;
  if (!row) throw new AppError("no_scale");
  return { year: row.year, data: checkScale(row.data), source: row.source, updatedAt: row.updated_at.toISOString() };
}

export async function saveScale(sql: Sql, actor: Member | null, yearValue: unknown, data: unknown, source: unknown): Promise<ScaleYear> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const year = typeof yearValue === "number" ? yearValue : Number(yearValue);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new AppError("invalid");
  const scale = checkScale(data);
  const text = clean(source ?? "", 500, { optional: true });
  await sql`
    insert into mileage_scales (year, data, source, updated_by, updated_at) values (${year}, ${sql.json(scale as never)}, ${text}, ${actor!.id}, now())
    on conflict (year) do update set data = excluded.data, source = excluded.source, updated_by = excluded.updated_by, updated_at = now()`;
  return scaleFor(sql, year);
}

// Each person's vehicle.
export type Vehicle = { kind: VehicleKind; power: string; electric: boolean };

export async function vehicleOf(sql: Query, member: string): Promise<Vehicle | null> {
  const [row] = await sql<{ kind: VehicleKind; power: string; electric: boolean }[]>`select kind, power, electric from vehicles where member_id = ${member}`;
  return row ? { kind: row.kind, power: row.power, electric: row.electric } : null;
}

export async function setVehicle(sql: Sql, actor: Member | null, input: { kind?: unknown; power?: unknown; electric?: unknown }): Promise<Vehicle> {
  if (!can(actor, "own")) throw new AppError("forbidden");
  if (!isVehicleKind(input.kind) || typeof input.power !== "string" || typeof input.electric !== "boolean") throw new AppError("invalid");
  const { data } = await scaleFor(sql, new Date().getFullYear());
  if (!powers(data, input.kind).includes(input.power)) throw new AppError("invalid");
  await sql`
    insert into vehicles (member_id, kind, power, electric) values (${actor!.id}, ${input.kind}, ${input.power}, ${input.electric})
    on conflict (member_id) do update set kind = excluded.kind, power = excluded.power, electric = excluded.electric, updated_at = now()`;
  return { kind: input.kind, power: input.power, electric: input.electric };
}

// Who approves whom. Without a row, the accountants.
export async function approverMap(sql: Query): Promise<Map<string, string>> {
  const rows = await sql<{ member_id: string; approver_id: string }[]>`select member_id, approver_id from approvers`;
  return new Map(rows.map(r => [r.member_id, r.approver_id]));
}

export async function approverOf(sql: Query, member: string): Promise<string | null> {
  const [row] = await sql<{ approver_id: string }[]>`select approver_id from approvers where member_id = ${member}`;
  return row?.approver_id ?? null;
}

// setApprover names who approves a person (null: the accountants). The
// approver must be someone who may approve (checked by the caller against
// the Chest: `mayApprove`). Expenses of that person still waiting move to
// the new approver.
export async function setApprover(sql: Sql, actor: Member | null, memberValue: unknown, approverValue: unknown, mayApprove: (id: string) => Promise<boolean>): Promise<string[]> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const member = memberId(memberValue);
  const approver = approverValue === null || approverValue === "" ? null : memberId(approverValue);
  if (approver === member) throw new AppError("approver_invalid");
  if (approver !== null && !(await mayApprove(approver))) throw new AppError("approver_invalid");
  return sql.begin(async tx => {
    if (approver === null) await tx`delete from approvers where member_id = ${member}`;
    else await tx`insert into approvers (member_id, approver_id) values (${member}, ${approver}) on conflict (member_id) do update set approver_id = excluded.approver_id`;
    const moved = await tx<{ id: string; approver_id: string | null }[]>`
      update expenses e set approver_id = ${approver} from (select id, approver_id from expenses where member_id = ${member} and status = 'submitted' and deleted_at is null and approver_id is distinct from ${approver} for update) old
      where e.id = old.id returning e.id, old.approver_id`;
    for (const m of moved) await tx`insert into history (expense_id, actor, kind) values (${m.id}, ${actor!.id}, 'reassigned')`;
    return [...new Set(moved.map(m => m.approver_id).filter((a): a is string => a !== null))];
  });
}
