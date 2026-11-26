import type { Member } from "@argentic/chest-sdk/member";
import { AppError } from "@argentic/chest-app";
import { can } from "./access.ts";
import type { Query, Sql } from "./db.ts";
import { currencyCode } from "../shared/model.ts";
import { currencyDecimals } from "../i18n/format.ts";

// The tool's default currency (SDK 0.7.0: the Chest has none — a company
// may buy in several). It fills the currency of a new price or cost, and
// nothing else: every amount saved carries its own code (items.currency,
// history.currency). EUR until a manager sets another (migrations/0009).
export async function defaultCurrency(sql: Query): Promise<string> {
  const [row] = await sql<{ currency: string }[]>`select currency from settings where id`;
  return row?.currency ?? "EUR";
}

// Whether amounts written before 0.7.0 still carry the currency 0009
// guessed (EUR: the Chest's was never written in Equipment's data).
export async function currencyGuessed(sql: Query): Promise<boolean> {
  const [row] = await sql<{ guessed: boolean }[]>`select currency_guessed as guessed from settings where id`;
  return row?.guessed === true;
}

// A manager changes it; the amounts already written keep theirs — but
// for those 0009 guessed (migrations/0010): the first save, even of the
// same code, gives them the currency saved, each read again in that
// currency's minor unit (0.4 kept every amount in hundredths), and they
// are guessed no longer.
export async function setDefaultCurrency(sql: Sql, actor: Member | null, value: unknown): Promise<string> {
  if (!can(actor, "items.manage")) throw new AppError("forbidden");
  const code = currencyCode(value);
  if (code === null) throw new AppError("invalid_currency");
  const scale = 10 ** currencyDecimals(code);
  await sql.begin(async tx => {
    const [s] = await tx<{ guessed: boolean }[]>`
      insert into settings (id, currency) values (true, ${code}) on conflict (id) do update set currency = excluded.currency
      returning currency_guessed as guessed`;
    if (!s?.guessed) return;
    const minor = (column: string) => tx`least(round(${tx(column)} * ${scale}::numeric / 100), 100000000000)::bigint`;
    await tx`update items set currency = ${code}, price_cents = ${minor("price_cents")}, cost_cents = ${minor("cost_cents")}, currency_guessed = false where currency_guessed`;
    await tx`update history set currency = ${code}, cost_cents = ${minor("cost_cents")}, currency_guessed = false where currency_guessed`;
    await tx`update settings set currency_guessed = false where id`;
  });
  return code;
}
