import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import type { Query, Sql } from "./db.ts";
import { checkBic, checkIban, countryCode, maskIban, needsAddress, sepaCountry } from "../shared/iban.ts";
import { clean, limits, memberId } from "../shared/model.ts";
import { isLegacy, openLegacy, sealIban } from "./seal.ts";
import { relative, type Locale } from "../i18n/index.ts";
import type { BankCurrent } from "../components/bank-form.tsx";

// Bank details: each person's account, where their reimbursements go, and
// the company's ("company"), where the transfer file takes them from.
//
// Who reaches them: a person their own; the accountants everyone's (they
// pay, and often hold these details already) and the company's. Nobody else
// — an approver never sees an account. Pages only ever show them masked;
// the whole IBAN leaves the tool only in the transfer file.

// A postal address: asked for an account in a SEPA country outside the
// EEA (lib/iban.ts, needsAddress) and for the company's (the payer's
// address goes with those transfers); optional otherwise.
export type Address = { street: string; postcode: string; town: string; country: string };
// held: entered or changed by someone else than its owner (an accountant),
// and not confirmed by the owner since: no transfer file pays into it
// until they say "These are mine" (confirmBankDetails) or enter it
// themselves. The company's account is the accountants' own.
export type BankView = { masked: string; country: string; sepa: boolean; bic: string | null; holder: string; address: Address | null; needsAddress: boolean; updatedAt: string; updatedBy: string; held: boolean };
type Row = { owner: string; iban: string; last4: string; country: string; bic: string | null; holder: string; street: string; postcode: string; town: string; address_country: string | null; updated_by: string; updated_at: Date; confirmed_at: Date | null };
const rowColumns = (sql: Query) => sql`owner, iban, last4, country, bic, holder, street, postcode, town, address_country, updated_by, updated_at, confirmed_at`;
const isHeld = (r: Row) => r.owner !== "company" && r.updated_by !== r.owner && (r.confirmed_at === null || r.confirmed_at < r.updated_at);

// An address is complete enough for a transfer file with a town and a
// country (the EPC's "hybrid" address: town and country structured).
export function addressOf(r: { street: string; postcode: string; town: string; address_country: string | null }): Address | null {
  return r.town !== "" && r.address_country ? { street: r.street, postcode: r.postcode, town: r.town, country: r.address_country } : null;
}

function mayReach(actor: Member | null, owner: string): boolean {
  if (!actor) return false;
  if (owner === "company") return can(actor, "settings");
  if (owner === actor.id) return can(actor, "own");
  return can(actor, "pay");
}

function ownerOf(value: unknown): string {
  return value === "company" ? "company" : memberId(value);
}

const view = (r: Row): BankView => ({ masked: maskIban(r.country, r.last4), country: r.country, sepa: sepaCountry(r.country), bic: r.bic, holder: r.holder, address: addressOf(r), needsAddress: needsAddress(r.country), updatedAt: r.updated_at.toISOString(), updatedBy: r.updated_by, held: isHeld(r) });

export async function bankDetails(sql: Query, actor: Member | null, ownerValue: unknown): Promise<BankView | null> {
  const owner = ownerOf(ownerValue);
  if (!mayReach(actor, owner)) throw new AppError("forbidden");
  const [row] = await sql<Row[]>`select ${rowColumns(sql)} from bank_accounts where owner = ${owner}`;
  return row ? view(row) : null;
}

// The masked details of several people at once (the "To pay back" page).
export async function bankViews(sql: Query, actor: Member | null, owners: string[]): Promise<Map<string, BankView>> {
  if (!can(actor, "pay")) throw new AppError("forbidden");
  const rows = await sql<Row[]>`select ${rowColumns(sql)} from bank_accounts where owner = any(${owners}::text[])`;
  return new Map(rows.map(r => [r.owner, view(r)]));
}

export type BankInput = { iban?: unknown; bic?: unknown; holder?: unknown; street?: unknown; postcode?: unknown; town?: unknown; addressCountry?: unknown };

// setBankDetails checks the IBAN (country length and mod-97 check digits)
// and the BIC, seals the IBAN and keeps the rest. Answers the masked view.
export async function setBankDetails(sql: Sql, actor: Member | null, ownerValue: unknown, input: BankInput): Promise<BankView> {
  const owner = ownerOf(ownerValue);
  if (!mayReach(actor, owner)) throw new AppError("forbidden");
  // An empty IBAN keeps the one saved (the address, BIC or name change).
  const keep = input.iban === undefined || input.iban === null || (typeof input.iban === "string" && input.iban.trim() === "");
  const [saved] = keep ? await sql<Row[]>`select ${rowColumns(sql)} from bank_accounts where owner = ${owner}` : [];
  if (keep && !saved) throw new AppError("iban_invalid");
  const checked = saved ? { ok: true as const, iban: "", country: saved.country } : checkIban(input.iban);
  if (!checked.ok) throw new AppError(checked.reason === "checksum" ? "iban_checksum" : "iban_invalid");
  let bic: string | null = null;
  if (input.bic !== undefined && input.bic !== null && input.bic !== "") {
    bic = checkBic(input.bic);
    if (!bic) throw new AppError("bic_invalid");
  }
  const holder = clean(input.holder ?? "", limits.holder, { optional: true });
  const street = clean(input.street ?? "", limits.street, { optional: true });
  const postcode = clean(input.postcode ?? "", limits.postcode, { optional: true });
  const town = clean(input.town ?? "", limits.town, { optional: true });
  const typedCountry = input.addressCountry === undefined || input.addressCountry === null || input.addressCountry === "" ? null : countryCode(input.addressCountry);
  if (input.addressCountry !== undefined && input.addressCountry !== null && input.addressCountry !== "" && typedCountry === null) throw new AppError("invalid");
  // Without a town, no address is kept (a country alone says nothing).
  const addressCountry = town === "" ? null : typedCountry ?? checked.country;
  if (needsAddress(checked.country) && (town === "" || addressCountry === null)) throw new AppError("address_needed");
  // Sealed by the Chest before the write (sealing needs no member).
  const iban = saved ? saved.iban : await sealIban(checked.iban, owner);
  const [row] = await sql<Row[]>`
    insert into bank_accounts (owner, iban, last4, country, bic, holder, street, postcode, town, address_country, updated_by)
    values (${owner}, ${iban}, ${saved ? saved.last4 : checked.iban.slice(-4)}, ${checked.country}, ${bic}, ${holder}, ${street}, ${postcode}, ${town}, ${addressCountry}, ${actor!.id})
    on conflict (owner) do update set iban = excluded.iban, last4 = excluded.last4, country = excluded.country, bic = excluded.bic, holder = excluded.holder,
      street = excluded.street, postcode = excluded.postcode, town = excluded.town, address_country = excluded.address_country,
      updated_by = excluded.updated_by, updated_at = now()
    returning ${rowColumns(sql)}`;
  return view(row!);
}

// The owner says the details someone else entered are theirs: a transfer
// file may pay into them again. Nothing to confirm: not_found.
export async function confirmBankDetails(sql: Sql, actor: Member | null): Promise<void> {
  if (!actor || !can(actor, "own")) throw new AppError("forbidden");
  const [row] = await sql`update bank_accounts set confirmed_at = now() where owner = ${actor.id} and updated_by <> owner returning owner`;
  if (!row) throw new AppError("not_found");
}

export async function removeBankDetails(sql: Sql, actor: Member | null, ownerValue: unknown): Promise<void> {
  const owner = ownerOf(ownerValue);
  if (!mayReach(actor, owner)) throw new AppError("forbidden");
  await sql`delete from bank_accounts where owner = ${owner}`;
}

// The whole account, for the transfer file only (lib/payments.ts): the
// sealed IBAN as stored, and how to open it.
export type SealedAccount = { owner: string; iban: string; country: string; bic: string | null; holder: string; address: Address | null; updatedAt: Date; held: boolean };
export async function sealedAccounts(sql: Query, owners: string[]): Promise<Map<string, SealedAccount>> {
  const rows = await sql<Row[]>`select ${rowColumns(sql)} from bank_accounts where owner = any(${owners}::text[])`;
  return new Map(rows.map(r => [r.owner, { owner: r.owner, iban: r.iban, country: r.country, bic: r.bic, holder: r.holder, address: addressOf(r), updatedAt: r.updated_at, held: isHeld(r) }]));
}

// resealLegacy moves account numbers kept in the tool's own formats before
// the Chest sealed them (src/lib/seal.ts) to the Chest's sealing — in
// bank_accounts and in the transfer files kept to be downloaded again. Run
// by the nightly cleanup; a value it cannot open (its key gone) stays, and
// the accountant is told to enter it again when a file needs it. Answers
// how many were moved.
export async function resealLegacy(sql: Sql): Promise<number> {
  let moved = 0;
  const rows = await sql<{ owner: string; iban: string }[]>`select owner, iban from bank_accounts where iban like 'v0.%' or iban like 'v1.%'`;
  for (const r of rows) {
    let plain: string;
    try { plain = openLegacy(r.iban, r.owner); } catch { continue; }
    const sealed = await sealIban(plain, r.owner);
    const done = await sql`update bank_accounts set iban = ${sealed} where owner = ${r.owner} and iban = ${r.iban} returning owner`;
    moved += done.length;
  }
  const runs = await sql<{ id: string; file: { payer: { iban: string }; transfers: { member: string; iban: string }[] } }[]>`
    select id, file from payment_runs where file #>> '{payer,iban}' like 'v_.%' or exists (select 1 from jsonb_array_elements(file -> 'transfers') t where t ->> 'iban' like 'v_.%')`;
  for (const r of runs) {
    const again = async (value: string, owner: string) => {
      if (!isLegacy(value)) return value;
      try { return await sealIban(openLegacy(value, owner), owner); } catch { return value; }
    };
    const file = { ...r.file, payer: { ...r.file.payer, iban: await again(r.file.payer.iban, "company") }, transfers: await Promise.all(r.file.transfers.map(async t => ({ ...t, iban: t.iban === "" ? "" : await again(t.iban, t.member) }))) };
    await sql`update payment_runs set file = ${sql.json(file as never)} where id = ${r.id}`;
    moved++;
  }
  return moved;
}

// What the bank details form shows of a saved account (masked).
export function bankCurrent(b: BankView | null, locale: Locale): BankCurrent {
  return b && { masked: b.masked, country: b.country, bic: b.bic, holder: b.holder, since: relative(b.updatedAt, locale), address: b.address, needsAddress: b.needsAddress };
}
