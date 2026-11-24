import type { Member } from "@argentic/chest-sdk/member";
import { can, roleOf } from "./access.ts";
import type { Query } from "./db.ts";
import { AppError } from "./errors.ts";

// The team's settings a manager chooses (migrations/0008, table settings).
// "export": who may download the lists — companies, contacts, deals as
// files (a whole client base leaves with them): the managers, the managers
// and sales (the default), or everyone with a role. The whole book's ZIP
// stays the managers'; one person's vCard and their own data (GDPR) stay
// open to whoever reads them.
export const exportChoices = ["managers", "sales", "everyone"] as const;
export type ExportChoice = (typeof exportChoices)[number];

export async function exportSetting(sql: Query): Promise<ExportChoice> {
  const [row] = await sql<{ value: string }[]>`select value from settings where key = 'export'`;
  return (exportChoices as readonly string[]).includes(row?.value ?? "") ? row!.value as ExportChoice : "sales";
}

export function mayExport(actor: Member | null, setting: ExportChoice): boolean {
  const role = roleOf(actor);
  if (role === null) return false;
  return setting === "everyone" || role === "manager" || (setting === "sales" && role === "sales");
}

// Refuses a download of a list to whoever the setting leaves out.
export async function checkExport(sql: Query, actor: Member | null): Promise<void> {
  if (!mayExport(actor, await exportSetting(sql))) throw new AppError("forbidden");
}

export async function setExport(sql: Query, actor: Member | null, value: ExportChoice): Promise<void> {
  if (!can(actor, "stages")) throw new AppError("forbidden");
  await sql`insert into settings (key, value) values ('export', ${value}) on conflict (key) do update set value = excluded.value`;
}

// The team's default currency (SDK 0.7.0: the Chest has none — a company
// may sell in several). It is the currency of a new deal, and the one the
// totals are written in (the deals in another are counted, never added).
// Each deal keeps its own (deals.currency). EUR until a manager sets
// another (migrations/0010).
export async function defaultCurrency(sql: Query): Promise<string> {
  const [row] = await sql<{ value: string }[]>`select value from settings where key = 'currency'`;
  return row && /^[A-Z]{3}$/u.test(row.value) ? row.value : "EUR";
}

// A currency a manager may choose: an ISO 4217 code this server knows.
export function currencyCode(value: unknown): string {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/u.test(code) || !knownCurrencies().includes(code)) throw new AppError("invalid");
  return code;
}
let known: string[] | null = null;
export function knownCurrencies(): string[] {
  known ??= Intl.supportedValuesOf("currency");
  return known;
}

export async function setDefaultCurrency(sql: Query, actor: Member | null, value: unknown): Promise<string> {
  if (!can(actor, "stages")) throw new AppError("forbidden");
  const code = currencyCode(value);
  await sql`insert into settings (key, value) values ('currency', ${code}) on conflict (key) do update set value = excluded.value`;
  return code;
}
