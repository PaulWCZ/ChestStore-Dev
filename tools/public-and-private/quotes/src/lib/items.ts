import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import type { Query, Sql } from "./db.ts";
import { clean, id, limits } from "../shared/model.ts";
import { isVatRate, parseAmount } from "../shared/money.ts";

// The catalogue: what the company sells, with its price excluding VAT and
// its VAT rate. A line made from an item copies it (the document keeps its
// own words and price: changing the catalogue never changes a document).
// Items are archived, never deleted.

export type Item = { id: string; name: string; description: string; unit: string; unitPrice: number; vatRate: number; goods: boolean; archived: boolean };

type Row = { id: number; name: string; description: string; unit: string; unit_price: number; vat_rate: number; goods: boolean; archived_at: Date | null };
const toItem = (r: Row): Item => ({ id: String(r.id), name: r.name, description: r.description, unit: r.unit, unitPrice: r.unit_price, vatRate: r.vat_rate, goods: r.goods, archived: r.archived_at !== null });

export async function listItems(sql: Query, actor: Member | null, options: { archived?: boolean } = {}): Promise<Item[]> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const rows = await sql<Row[]>`
    select * from items where ${options.archived ? sql`archived_at is not null` : sql`archived_at is null`}
    order by lower(name), id limit ${limits.items}`;
  return rows.map(toItem);
}

export type ItemInput = Partial<Record<"name" | "description" | "unit" | "unitPrice" | "vatRate" | "goods", unknown>>;

function fields(input: ItemInput, currency: string, current?: Item) {
  const name = input.name === undefined ? current?.name ?? "" : clean(input.name, limits.name);
  if (!name) throw new AppError("empty");
  let unitPrice = current?.unitPrice ?? 0;
  if (input.unitPrice !== undefined) {
    const parsed = parseAmount(input.unitPrice, currency, { negative: true });
    if (parsed === null || Math.abs(parsed) > limits.unitPrice) throw new AppError("amount_invalid");
    unitPrice = parsed;
  }
  const vatRate = input.vatRate === undefined ? current?.vatRate ?? 2000 : input.vatRate;
  if (!isVatRate(vatRate)) throw new AppError("rate_invalid");
  const goods = input.goods === undefined ? current?.goods ?? false : input.goods;
  if (typeof goods !== "boolean") throw new AppError("invalid");
  return {
    name,
    description: input.description === undefined ? current?.description ?? "" : clean(input.description, limits.description, { optional: true, multiline: true }),
    unit: input.unit === undefined ? current?.unit ?? "" : clean(input.unit, limits.unit, { optional: true }),
    unit_price: unitPrice,
    vat_rate: vatRate,
    goods,
  };
}

export async function addItem(sql: Sql, actor: Member | null, input: ItemInput, currency: string): Promise<Item> {
  if (!can(actor, "catalogue.write")) throw new AppError("forbidden");
  const f = fields(input, currency);
  const [counted] = await sql<{ n: number }[]>`select count(*)::int as n from items where archived_at is null`;
  if ((counted?.n ?? 0) >= limits.items) throw new AppError("too_many", { max: limits.items });
  const [row] = await sql<Row[]>`insert into items ${sql({ ...f, created_by: actor!.id })} returning *`;
  return toItem(row!);
}

export async function updateItem(sql: Sql, actor: Member | null, itemId: unknown, input: ItemInput, currency: string): Promise<Item> {
  if (!can(actor, "catalogue.write")) throw new AppError("forbidden");
  const [current] = await sql<Row[]>`select * from items where id = ${id(itemId)}`;
  if (!current) throw new AppError("not_found");
  const f = fields(input, currency, toItem(current));
  const [row] = await sql<Row[]>`update items set ${sql(f)}, updated_at = now() where id = ${current.id} returning *`;
  return toItem(row!);
}

export async function archiveItem(sql: Sql, actor: Member | null, itemId: unknown, archived: boolean): Promise<void> {
  if (!can(actor, "catalogue.write")) throw new AppError("forbidden");
  if (typeof archived !== "boolean") throw new AppError("invalid");
  const rows = await sql`update items set archived_at = ${archived ? sql`coalesce(archived_at, now())` : null}, updated_at = now() where id = ${id(itemId)} returning id`;
  if (rows.length === 0) throw new AppError("not_found");
}
