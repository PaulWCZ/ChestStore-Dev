import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";

// The currency a new money key result starts in: the tool's own setting
// (the Chest has no currency, SDK 0.7.0), EUR until an administrator picks
// another. Every money key result keeps its own code beside its values
// (key_results.currency), chosen in its form: changing this default
// changes no key result, and no value is ever added across currencies
// (a key result fed by Clients counts the deals won in its own currency).

const known = new Set<string>(Intl.supportedValuesOf("currency"));
export const isCurrency = (value: unknown): value is string => typeof value === "string" && /^[A-Z]{3}$/u.test(value) && known.has(value);

export async function defaultCurrency(sql: Query): Promise<string> {
  const [row] = await sql<{ currency: string }[]>`select currency from settings where id`;
  return row?.currency ?? "EUR";
}

// The currency of a money key result: the one chosen, else the default.
export async function currencyFor(sql: Query, chosen: unknown): Promise<string> {
  if (chosen === undefined || chosen === null || chosen === "") return defaultCurrency(sql);
  if (!isCurrency(chosen)) throw new AppError("invalid");
  return chosen;
}

export async function saveCurrency(sql: Sql, actor: Member | null, value: unknown): Promise<string> {
  if (!actor || !can(actor, "settings.manage")) throw new AppError("forbidden");
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!isCurrency(code)) throw new AppError("invalid");
  await sql`update settings set currency = ${code}, updated_by = ${actor.id}, updated_at = now() where id`;
  return code;
}
