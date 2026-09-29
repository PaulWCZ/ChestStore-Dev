import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { checkBic, checkIban, maskIban, sepaCountry } from "./iban.ts";
import { clean, limits, memberId } from "./model.ts";
import { seal, unseal } from "./seal.ts";

// Bank details: each person's account, where their reimbursements go, and
// the company's ("company"), where the transfer file takes them from.
//
// Who reaches them: a person their own; the accountants everyone's (they
// pay, and often hold these details already) and the company's. Nobody else
// — an approver never sees an account. Pages only ever show them masked;
// the whole IBAN leaves the tool only in the transfer file.

export type BankView = { masked: string; country: string; sepa: boolean; bic: string | null; holder: string; updatedAt: string; updatedBy: string };
type Row = { owner: string; iban: string; last4: string; country: string; bic: string | null; holder: string; updated_by: string; updated_at: Date };

const context = (owner: string) => "bank:" + owner;

function mayReach(actor: Member | null, owner: string): boolean {
  if (!actor) return false;
  if (owner === "company") return can(actor, "settings");
  if (owner === actor.id) return can(actor, "own");
  return can(actor, "pay");
}

function ownerOf(value: unknown): string {
  return value === "company" ? "company" : memberId(value);
}

const view = (r: Row): BankView => ({ masked: maskIban(r.country, r.last4), country: r.country, sepa: sepaCountry(r.country), bic: r.bic, holder: r.holder, updatedAt: r.updated_at.toISOString(), updatedBy: r.updated_by });

export async function bankDetails(sql: Query, actor: Member | null, ownerValue: unknown): Promise<BankView | null> {
  const owner = ownerOf(ownerValue);
  if (!mayReach(actor, owner)) throw new AppError("forbidden");
  const [row] = await sql<Row[]>`select owner, iban, last4, country, bic, holder, updated_by, updated_at from bank_accounts where owner = ${owner}`;
  return row ? view(row) : null;
}

// The masked details of several people at once (the "To pay back" page).
export async function bankViews(sql: Query, actor: Member | null, owners: string[]): Promise<Map<string, BankView>> {
  if (!can(actor, "pay")) throw new AppError("forbidden");
  const rows = await sql<Row[]>`select owner, iban, last4, country, bic, holder, updated_by, updated_at from bank_accounts where owner = any(${owners}::text[])`;
  return new Map(rows.map(r => [r.owner, view(r)]));
}

export type BankInput = { iban?: unknown; bic?: unknown; holder?: unknown };

// setBankDetails checks the IBAN (country length and mod-97 check digits)
// and the BIC, seals the IBAN and keeps the rest. Answers the masked view.
export async function setBankDetails(sql: Sql, actor: Member | null, ownerValue: unknown, input: BankInput): Promise<BankView> {
  const owner = ownerOf(ownerValue);
  if (!mayReach(actor, owner)) throw new AppError("forbidden");
  const checked = checkIban(input.iban);
  if (!checked.ok) throw new AppError(checked.reason === "checksum" ? "iban_checksum" : "iban_invalid");
  let bic: string | null = null;
  if (input.bic !== undefined && input.bic !== null && input.bic !== "") {
    bic = checkBic(input.bic);
    if (!bic) throw new AppError("bic_invalid");
  }
  const holder = clean(input.holder ?? "", limits.holder, { optional: true });
  const [row] = await sql<Row[]>`
    insert into bank_accounts (owner, iban, last4, country, bic, holder, updated_by)
    values (${owner}, ${seal(checked.iban, context(owner))}, ${checked.iban.slice(-4)}, ${checked.country}, ${bic}, ${holder}, ${actor!.id})
    on conflict (owner) do update set iban = excluded.iban, last4 = excluded.last4, country = excluded.country, bic = excluded.bic, holder = excluded.holder,
      updated_by = excluded.updated_by, updated_at = now()
    returning owner, iban, last4, country, bic, holder, updated_by, updated_at`;
  return view(row!);
}

export async function removeBankDetails(sql: Sql, actor: Member | null, ownerValue: unknown): Promise<void> {
  const owner = ownerOf(ownerValue);
  if (!mayReach(actor, owner)) throw new AppError("forbidden");
  await sql`delete from bank_accounts where owner = ${owner}`;
}

// The whole account, for the transfer file only (lib/payments.ts): the
// sealed IBAN as stored, and how to open it.
export type SealedAccount = { owner: string; iban: string; country: string; bic: string | null; holder: string; updatedAt: Date };
export async function sealedAccounts(sql: Query, owners: string[]): Promise<Map<string, SealedAccount>> {
  const rows = await sql<Row[]>`select owner, iban, last4, country, bic, holder, updated_by, updated_at from bank_accounts where owner = any(${owners}::text[])`;
  return new Map(rows.map(r => [r.owner, { owner: r.owner, iban: r.iban, country: r.country, bic: r.bic, holder: r.holder, updatedAt: r.updated_at }]));
}

export function openIban(sealed: string, owner: string): string {
  return unseal(sealed, context(owner));
}
