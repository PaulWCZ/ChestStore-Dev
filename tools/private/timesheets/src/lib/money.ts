import type { Member } from "@argentic/chest-sdk/member";
import { currencyDecimals, currencyPattern } from "@argentic/chest-app";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { transaction } from "./tx.ts";

// The currency of Timesheets' rates, budgets and amounts: the tool's own
// setting (the Chest has no currency, SDK 0.7.0), EUR until a manager picks
// another (migrations/0007). Every amount it keeps carries that code beside
// it — each rate (rates.currency), each project's rate and budget
// (projects.currency), the rates written on invoiced entries
// (entries.rates_currency), each hand-off to Quotes (handoffs.currency) —,
// and they are always the same one: one currency per Timesheets, so a total
// never adds two currencies.
//
// Changing it re-labels them: 80 EUR becomes 80 GBP — a correction (rates
// entered before the tool had its own setting were taken as euros, the
// Chest's default then), never a conversion. So it is refused once time was
// invoiced or handed to Quotes: those amounts left the tool in their
// currency.

// The currencies offered: those with cents (rates are read in hundredths).
export const currencies = ["EUR", "USD", "GBP", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK", "PLN", "CZK", "RON", "MAD", "SGD", "HKD", "ZAR"] as const;

// share: inside a write that records an amount in it (a hand-off), the row
// is read FOR SHARE — a change of currency waits for that write to end.
// The ISO 4217 codes this runtime knows (an unknown one is refused).
const known = new Set<string>(Intl.supportedValuesOf("currency"));

export async function currency(sql: Query, options: { share?: boolean } = {}): Promise<string> {
  const [row] = await sql<{ currency: string }[]>`select currency from settings where id ${options.share ? sql`for share` : sql``}`;
  return row?.currency ?? "EUR";
}

// fixed: whether the currency can no longer change (time invoiced or handed
// to Quotes).
export async function currencyFixed(sql: Query): Promise<boolean> {
  const [row] = await sql<{ fixed: boolean }[]>`select exists (select 1 from handoffs) or exists (select 1 from entries where invoiced_at is not null) as fixed`;
  return row?.fixed ?? false;
}

export async function setCurrency(sql: Sql, actor: Member | null, value: unknown): Promise<string> {
  if (!actor || !can(actor, "settings")) throw new AppError("forbidden");
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!currencyPattern.test(code) || !known.has(code) || currencyDecimals(code) !== 2) throw new AppError("invalid");
  return transaction(sql, async tx => {
    const [now] = await tx<{ currency: string }[]>`select currency from settings where id for update`;
    if (now?.currency === code) return code;
    if (await currencyFixed(tx)) throw new AppError("currency_fixed");
    await tx`update settings set currency = ${code} where id`;
    await tx`update rates set currency = ${code}`;
    await tx`update projects set currency = ${code}`;
    await tx`update entries set rates_currency = ${code} where rates_currency is not null`;
    return code;
  });
}
