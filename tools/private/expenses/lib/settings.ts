import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { clean, id, limits, memberId, percent } from "./model.ts";
import { convert, defaultCurrency, isCurrency, parseAmount, parseRate } from "./money.ts";
import { checkScale, isVehicleKind, powers, type Scale, type VehicleKind } from "./scale.ts";

// What the accountant sets for the whole company — currency, reminder,
// categories, the mileage scale, who approves whom — and each person's
// vehicle.

// currency: the company's; reminder: on the 25th; setupDone: the
// accountant went through the first checks (the banner goes); journal:
// the accounts of the accounting journal (lib/journal.ts), editable by the
// accountant, French chart defaults; payer: the company's name as the bank
// transfer file writes it.
export type Journal = { code: string; employees: string; vat: string; card: string };
export type Settings = { currency: string; reminder: boolean; setupDone: boolean; journal: Journal; payer: string };
const defaults: Settings = { currency: defaultCurrency, reminder: true, setupDone: false, journal: { code: "NDF", employees: "421000", vat: "445660", card: "467000" }, payer: "" };

const accountPattern = /^[0-9A-Za-z]{1,20}$/u;
function isJournal(value: unknown): value is Journal {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v["code"] === "string" && /^[0-9A-Za-z]{1,10}$/u.test(v["code"]) && ["employees", "vat", "card"].every(k => typeof v[k] === "string" && accountPattern.test(v[k] as string));
}

export async function settings(sql: Query): Promise<Settings> {
  const rows = await sql<{ key: string; value: unknown }[]>`select key, value from settings`;
  const out: Settings = { ...defaults, journal: { ...defaults.journal } };
  for (const r of rows) {
    if (r.key === "currency" && isCurrency(r.value)) out.currency = r.value;
    if (r.key === "reminder" && typeof r.value === "boolean") out.reminder = r.value;
    if (r.key === "setupDone" && typeof r.value === "boolean") out.setupDone = r.value;
    if (r.key === "journal" && isJournal(r.value)) out.journal = r.value;
    if (r.key === "payer" && typeof r.value === "string") out.payer = r.value;
  }
  return out;
}

export type SettingsInput = { currency?: unknown; reminder?: unknown; setupDone?: unknown; journal?: unknown; payer?: unknown };

export async function updateSettings(sql: Sql, actor: Member | null, input: SettingsInput): Promise<Settings> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const values: [string, unknown][] = [];
  if (input.currency !== undefined) {
    if (!isCurrency(input.currency)) throw new AppError("currency_invalid");
    values.push(["currency", input.currency]);
  }
  for (const key of ["reminder", "setupDone"] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "boolean") throw new AppError("invalid");
    values.push([key, input[key]]);
  }
  if (input.journal !== undefined) {
    const current = (await settings(sql)).journal;
    const merged = { ...current, ...(typeof input.journal === "object" && input.journal !== null ? input.journal : {}) } as Record<string, unknown>;
    for (const k of Object.keys(merged)) if (typeof merged[k] === "string") merged[k] = (merged[k] as string).trim();
    const journal = { code: merged["code"], employees: merged["employees"], vat: merged["vat"], card: merged["card"] };
    if (!isJournal(journal)) throw new AppError("account_invalid");
    values.push(["journal", journal]);
  }
  if (input.payer !== undefined) values.push(["payer", clean(input.payer, limits.payer, { optional: true })]);
  for (const [key, value] of values) {
    await sql`insert into settings (key, value) values (${key}, ${sql.json(value as never)}) on conflict (key) do update set value = excluded.value`;
  }
  return settings(sql);
}

// Categories. A built-in one has a key the pages name in each language,
// until the accountant gives it a name.
// guests: people choosing it are asked who was at the table (meals);
// perNight: its limit is per night (hotels), people say how many nights.
export type Category = { id: string; key: string | null; name: string | null; account: string; vatRecovery: number; cap: number | null; mileage: boolean; archived: boolean; guests: boolean; perNight: boolean };

type CategoryRow = { id: string; key: string | null; name: string | null; account: string; vat_recovery: number; cap_cents: string | null; mileage: boolean; archived_at: Date | null; guests: boolean; per_night: boolean };
const toCategory = (r: CategoryRow): Category => ({ id: String(r.id), key: r.key, name: r.name, account: r.account, vatRecovery: r.vat_recovery, cap: r.cap_cents === null ? null : Number(r.cap_cents), mileage: r.mileage, archived: r.archived_at !== null, guests: r.guests, perNight: r.per_night });
const categoryColumns = "id, key, name, account, vat_recovery, cap_cents, mileage, archived_at, guests, per_night";

export async function categories(sql: Query, options: { archived?: boolean } = {}): Promise<Category[]> {
  const rows = await sql<CategoryRow[]>`select ${sql.unsafe(categoryColumns)} from categories ${options.archived ? sql`` : sql`where archived_at is null`} order by archived_at nulls first, position, id`;
  return rows.map(toCategory);
}

// The category of flat rates (built in: they are booked there, unless a
// rate has an account of its own).
export async function allowanceCategory(sql: Query): Promise<Category> {
  const [row] = await sql<CategoryRow[]>`select ${sql.unsafe(categoryColumns)} from categories where key = 'allowance'`;
  if (!row) throw new AppError("category_invalid");
  return toCategory(row);
}

export async function mileageCategory(sql: Query): Promise<Category> {
  const [row] = await sql<CategoryRow[]>`select ${sql.unsafe(categoryColumns)} from categories where mileage order by archived_at nulls first, id limit 1`;
  if (!row) throw new AppError("category_invalid");
  return toCategory(row);
}

type CategoryInput = { name?: unknown; account?: unknown; vatRecovery?: unknown; cap?: unknown; guests?: unknown; perNight?: unknown };

function categoryFields(input: CategoryInput, currency: string) {
  const out: { name?: string | null; account?: string; vatRecovery?: number; cap?: number | null; guests?: boolean; perNight?: boolean } = {};
  for (const key of ["guests", "perNight"] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "boolean") throw new AppError("invalid");
    out[key] = input[key];
  }
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
    insert into categories (name, account, vat_recovery, cap_cents, guests, position)
    values (${f.name}, ${f.account ?? ""}, ${f.vatRecovery ?? 100}, ${f.cap ?? null}, ${f.guests ?? false}, (select coalesce(max(position), 0) + 1 from categories))
    returning ${sql.unsafe(categoryColumns)}`;
  return toCategory(row!);
}

export async function updateCategory(sql: Sql, actor: Member | null, categoryId: unknown, input: CategoryInput & { archived?: unknown }): Promise<Category> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const cid = id(categoryId);
  const { currency } = await settings(sql);
  const f = categoryFields(input, currency);
  const [current] = await sql<CategoryRow[]>`select ${sql.unsafe(categoryColumns)} from categories where id = ${cid}`;
  if (!current) throw new AppError("not_found");
  let archived = current.archived_at !== null;
  if (input.archived !== undefined) {
    if (typeof input.archived !== "boolean") throw new AppError("invalid");
    // The mileage and flat-rate categories stay: trips and flat rates need them.
    if (input.archived && (current.mileage || current.key === "allowance")) throw new AppError("category_invalid");
    archived = input.archived;
  }
  if (f.name === null && current.key === null) throw new AppError("empty");
  const [row] = await sql<CategoryRow[]>`
    update categories set
      name = ${f.name !== undefined ? f.name : current.name},
      account = ${f.account !== undefined ? f.account : current.account},
      vat_recovery = ${f.vatRecovery !== undefined ? f.vatRecovery : current.vat_recovery},
      cap_cents = ${f.cap !== undefined ? f.cap : current.cap_cents},
      guests = ${f.guests !== undefined ? f.guests : current.guests},
      per_night = ${f.perNight !== undefined ? f.perNight : current.per_night},
      archived_at = ${archived ? (current.archived_at ?? new Date()) : null}
    where id = ${cid}
    returning ${sql.unsafe(categoryColumns)}`;
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

// Each person's vehicle, and the registration certificate that proves it
// (checked by an accountant; a change of vehicle takes the check off).
export type Vehicle = { kind: VehicleKind; power: string; electric: boolean };
export type VehicleProof = { name: string; type: string; checkedBy: string | null; checkedAt: string | null };

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
    on conflict (member_id) do update set kind = excluded.kind, power = excluded.power, electric = excluded.electric, updated_at = now(),
      checked_by = case when (vehicles.kind, vehicles.power, vehicles.electric) = (excluded.kind, excluded.power, excluded.electric) then vehicles.checked_by end,
      checked_at = case when (vehicles.kind, vehicles.power, vehicles.electric) = (excluded.kind, excluded.power, excluded.electric) then vehicles.checked_at end`;
  return { kind: input.kind, power: input.power, electric: input.electric };
}

export async function vehicleProof(sql: Query, member: string): Promise<VehicleProof | null> {
  const [row] = await sql<{ proof_name: string | null; proof_type: string | null; checked_by: string | null; checked_at: Date | null }[]>`
    select proof_name, proof_type, checked_by, checked_at from vehicles where member_id = ${member} and proof_object is not null`;
  return row ? { name: row.proof_name ?? "", type: row.proof_type ?? "", checkedBy: row.checked_by, checkedAt: row.checked_at?.toISOString() ?? null } : null;
}

// setVehicleProof puts the registration certificate on the actor's vehicle
// (an upload of theirs, inspected by the caller), or takes it off (null).
// Answers the object it replaced, for the caller to forget.
export async function setVehicleProof(sql: Sql, actor: Member | null, file: { object: string; type: string; sha256: string } | null, name?: unknown): Promise<string | null> {
  if (!actor || !can(actor, "own")) throw new AppError("forbidden");
  const fileName = clean(name ?? "", limits.fileName, { optional: true });
  return sql.begin(async tx => {
    const [current] = await tx<{ proof_object: string | null }[]>`select proof_object from vehicles where member_id = ${actor.id} for update`;
    if (!current) throw new AppError("no_vehicle");
    if (file) {
      const [used] = await tx`delete from uploads where object = ${file.object} and member_id = ${actor.id} returning object`;
      if (!used) throw new AppError("file_missing");
    }
    await tx`update vehicles set proof_object = ${file?.object ?? null}, proof_name = ${file ? fileName || file.object.split("/").at(-1)! : null}, proof_type = ${file?.type ?? null},
      proof_sha256 = ${file?.sha256 ?? null}, checked_by = null, checked_at = null where member_id = ${actor.id}`;
    return current.proof_object;
  });
}

// The object of a person's registration certificate, for that person and
// the accountants.
export async function vehicleProofObject(sql: Query, actor: Member | null, memberValue: unknown): Promise<{ object: string; type: string; name: string }> {
  const member = memberId(memberValue);
  if (!actor || (actor.id !== member && !can(actor, "settings"))) throw new AppError("not_found");
  const [row] = await sql<{ proof_object: string | null; proof_type: string | null; proof_name: string | null }[]>`select proof_object, proof_type, proof_name from vehicles where member_id = ${member}`;
  if (!row?.proof_object) throw new AppError("not_found");
  return { object: row.proof_object, type: row.proof_type ?? "", name: row.proof_name ?? "" };
}

// An accountant looked at the certificate: the vehicle matches it (or not,
// to take the check off).
export async function checkVehicle(sql: Sql, actor: Member | null, memberValue: unknown, checked: unknown): Promise<void> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const member = memberId(memberValue);
  if (typeof checked !== "boolean") throw new AppError("invalid");
  const [row] = await sql`update vehicles set checked_by = ${checked ? actor!.id : null}, checked_at = ${checked ? new Date() : null}
    where member_id = ${member} and proof_object is not null returning member_id`;
  if (!row) throw new AppError("not_found");
}

// Every vehicle, for the accountants: what the scale uses for each person,
// and whether its certificate was seen.
export type VehicleRow = Vehicle & { member: string; proof: boolean; checked: boolean };
export async function vehicles(sql: Query, actor: Member | null): Promise<VehicleRow[]> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const rows = await sql<{ member_id: string; kind: VehicleKind; power: string; electric: boolean; proof_object: string | null; checked_at: Date | null }[]>`
    select member_id, kind, power, electric, proof_object, checked_at from vehicles order by member_id limit 5000`;
  return rows.map(r => ({ member: r.member_id, kind: r.kind, power: r.power, electric: r.electric, proof: r.proof_object !== null, checked: r.checked_at !== null }));
}

// The kilometres driven for work in a year before this tool, with the
// actor's vehicle kind; the year's trips not yet approved move with it.
export async function priorDistance(sql: Query, member: string, year: number, kind: VehicleKind): Promise<number> {
  const [row] = await sql<{ distance_tenths: number }[]>`select distance_tenths from prior_distances where member_id = ${member} and year = ${year} and vehicle = ${kind}`;
  return row?.distance_tenths ?? 0;
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

// The company's exchange rates, set by the accountant: an expense in that
// currency saved without a rate of its own takes it. Changing one updates
// the expenses not yet approved that use it (or had none), and gives one to
// approved expenses that had none (they could not be paid back without it).
export type Rate = { currency: string; rate: number; updatedAt: string };

export async function rates(sql: Query): Promise<Rate[]> {
  const rows = await sql<{ currency: string; rate_micro: string; updated_at: Date }[]>`select currency, rate_micro, updated_at from rates order by currency`;
  return rows.map(r => ({ currency: r.currency, rate: Number(r.rate_micro), updatedAt: r.updated_at.toISOString() }));
}

export async function setRate(sql: Sql, actor: Member | null, currencyValue: unknown, rateValue: unknown): Promise<number> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const company = await settings(sql);
  if (!isCurrency(currencyValue) || currencyValue === company.currency) throw new AppError("currency_invalid");
  const currency = currencyValue;
  const micro = rateValue === null || rateValue === "" ? null : parseRate(rateValue);
  if (micro === null && rateValue !== null && rateValue !== "") throw new AppError("rate_invalid");
  return sql.begin(async tx => {
    if (micro === null) await tx`delete from rates where currency = ${currency}`;
    else await tx`insert into rates (currency, rate_micro, updated_by) values (${currency}, ${micro}, ${actor!.id}) on conflict (currency) do update set rate_micro = excluded.rate_micro, updated_by = excluded.updated_by, updated_at = now()`;
    const open = await tx<{ id: string; amount_cents: string }[]>`
      select id, amount_cents from expenses where currency = ${currency} and deleted_at is null
        and ((status in ('draft', 'submitted') and (rate_source = 'company' or rate_source is null))
          or (status = 'approved' and base_cents is null and ${micro !== null}))
      for update`;
    for (const e of open) {
      const base = micro === null ? null : convert(Number(e.amount_cents), currency, micro, company.currency);
      await tx`update expenses set rate_micro = ${micro}, rate_source = ${micro === null ? null : "company"}, base_cents = ${base}, base_currency = ${base === null ? null : company.currency} where id = ${e.id}`;
    }
    return open.length;
  });
}

// Flat rates (forfaits): an amount per day, night or meal. A built-in one
// has a key the pages name in each language, until the accountant renames
// it. Archived ones stay on the expenses that used them.
export const allowanceUnits = ["day", "night", "meal"] as const;
export type AllowanceUnit = (typeof allowanceUnits)[number];
export type Allowance = { id: string; key: string | null; name: string | null; amount: number; unit: AllowanceUnit; account: string; source: string; archived: boolean };
type AllowanceRow = { id: string; key: string | null; name: string | null; amount_cents: string; unit: AllowanceUnit; account: string; source: string; archived_at: Date | null };
const toAllowance = (r: AllowanceRow): Allowance => ({ id: String(r.id), key: r.key, name: r.name, amount: Number(r.amount_cents), unit: r.unit, account: r.account, source: r.source, archived: r.archived_at !== null });

export async function allowances(sql: Query, options: { archived?: boolean } = {}): Promise<Allowance[]> {
  const rows = await sql<AllowanceRow[]>`
    select id, key, name, amount_cents, unit, account, source, archived_at from allowances
    ${options.archived ? sql`` : sql`where archived_at is null`} order by archived_at nulls first, position, id`;
  return rows.map(toAllowance);
}

type AllowanceInput = { name?: unknown; amount?: unknown; unit?: unknown; account?: unknown; source?: unknown; archived?: unknown };

export async function saveAllowanceRate(sql: Sql, actor: Member | null, allowanceId: unknown, input: AllowanceInput): Promise<Allowance> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const { currency } = await settings(sql);
  const current = allowanceId === null || allowanceId === undefined ? null : (await sql<AllowanceRow[]>`select id, key, name, amount_cents, unit, account, source, archived_at from allowances where id = ${id(allowanceId)}`)[0];
  if (allowanceId !== null && allowanceId !== undefined && !current) throw new AppError("not_found");
  const name = input.name === undefined ? current?.name ?? null : input.name === "" ? null : clean(input.name, limits.allowanceName);
  if (name === null && !current?.key) throw new AppError("empty");
  let amount = current ? Number(current.amount_cents) : null;
  if (input.amount !== undefined) {
    amount = parseAmount(input.amount, currency);
    if (amount === null || amount <= 0 || amount > 10_000_000) throw new AppError("amount_invalid");
  }
  if (amount === null) throw new AppError("amount_invalid");
  const unit = input.unit === undefined ? current?.unit : input.unit;
  if (typeof unit !== "string" || !(allowanceUnits as readonly string[]).includes(unit)) throw new AppError("invalid");
  const account = input.account === undefined ? current?.account ?? "" : clean(input.account, limits.account, { optional: true });
  if (!/^[0-9A-Za-z .-]*$/u.test(account)) throw new AppError("account_invalid");
  const source = input.source === undefined ? current?.source ?? "" : clean(input.source, 500, { optional: true });
  let archived = current?.archived_at ?? null;
  if (input.archived !== undefined) {
    if (typeof input.archived !== "boolean") throw new AppError("invalid");
    archived = input.archived ? archived ?? new Date() : null;
  }
  if (!current) {
    const [counted] = await sql<{ n: number }[]>`select count(*)::int as n from allowances where archived_at is null`;
    if ((counted?.n ?? 0) >= limits.categories) throw new AppError("too_many", { max: limits.categories });
    const [row] = await sql<AllowanceRow[]>`
      insert into allowances (name, amount_cents, unit, account, source, position)
      values (${name}, ${amount}, ${unit}, ${account}, ${source}, (select coalesce(max(position), 0) + 1 from allowances))
      returning id, key, name, amount_cents, unit, account, source, archived_at`;
    return toAllowance(row!);
  }
  const [row] = await sql<AllowanceRow[]>`
    update allowances set name = ${name}, amount_cents = ${amount}, unit = ${unit}, account = ${account}, source = ${source}, archived_at = ${archived}
    where id = ${current.id} returning id, key, name, amount_cents, unit, account, source, archived_at`;
  return toAllowance(row!);
}

// Each person's account in the journal (lib/journal.ts), for accountants.
export async function memberAccounts(sql: Query): Promise<Map<string, string>> {
  const rows = await sql<{ member_id: string; account: string }[]>`select member_id, account from member_accounts`;
  return new Map(rows.map(r => [r.member_id, r.account]));
}

export async function setMemberAccount(sql: Sql, actor: Member | null, memberValue: unknown, accountValue: unknown): Promise<void> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const member = memberId(memberValue);
  const account = clean(accountValue ?? "", limits.account, { optional: true });
  if (account === "") {
    await sql`delete from member_accounts where member_id = ${member}`;
    return;
  }
  if (!/^[0-9A-Za-z]{1,20}$/u.test(account)) throw new AppError("account_invalid");
  await sql`insert into member_accounts (member_id, account) values (${member}, ${account}) on conflict (member_id) do update set account = excluded.account`;
}
