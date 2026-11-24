import type { Member } from "@argentic/chest-sdk/member";
import { AppError } from "@argentic/chest-app";
import { can } from "./access.ts";
import type { Query, Sql } from "./db.ts";
import { currencyCode } from "../shared/model.ts";

// The tool's default currency (SDK 0.7.0: the Chest has none — a company
// may buy in several). It fills the currency of a new price or cost, and
// nothing else: every amount saved carries its own code (items.currency,
// history.currency). EUR until a manager sets another (migrations/0009).
export async function defaultCurrency(sql: Query): Promise<string> {
  const [row] = await sql<{ currency: string }[]>`select currency from settings where id`;
  return row?.currency ?? "EUR";
}

// A manager changes it; the amounts already written keep theirs.
export async function setDefaultCurrency(sql: Sql, actor: Member | null, value: unknown): Promise<string> {
  if (!can(actor, "items.manage")) throw new AppError("forbidden");
  const code = currencyCode(value);
  if (code === null) throw new AppError("invalid_currency");
  await sql`insert into settings (id, currency) values (true, ${code}) on conflict (id) do update set currency = excluded.currency`;
  return code;
}
