import type { Field } from "./fields.ts";
import { fold } from "../shared/model.ts";
import type { Catalogue } from "../i18n/index.ts";
import type { Item } from "./items.ts";
import { categoryName, fieldName } from "../shared/words.ts";

// The equipment as a spreadsheet, in the reader's language: one row per
// item, amounts as plain numbers (a spreadsheet reads them), days as
// YYYY-MM-DD; then a column per field of the categories (IMEI, RAM…), one
// per name. The tool's importer reads this file back. The download
// (src/app.tsx) writes it row by row, as the items are read.
export type ExportHeader = { cells: string[]; names: string[]; fields: Field[] };

export function exportHeader(t: Catalogue, fields: Field[] = []): ExportHeader {
  const h = t.export.headers;
  // One column per field name, whatever category has it.
  const names: string[] = [];
  for (const f of fields) if (!names.some(n => fold(n) === fold(fieldName(f, t)))) names.push(fieldName(f, t));
  return { cells: [h.tag, h.name, h.category, h.status, h.holder, h.place, h.since, h.serial, h.bought, h.price, h.currency, h.supplier, h.warranty, h.seats, h.seatsUsed, h.renews, h.cost, h.period, h.quantity, h.minimum, h.notes, ...names], names, fields };
}

export function exportRow(i: Item, t: Catalogue, currency: string, holderName: (id: string) => string, header: ExportHeader): (string | number)[] {
  const amount = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));
  return [
    i.tag,
    i.name,
    categoryName(i.category, t),
    t.status[i.status],
    i.holder ? holderName(i.holder) : "",
    i.place ?? "",
    i.heldSince ?? "",
    i.serial ?? "",
    i.purchasedOn ?? "",
    amount(i.priceCents),
    i.priceCents !== null || i.costCents !== null ? currency : "",
    i.supplier ?? "",
    i.warrantyUntil ?? "",
    i.seats ?? "",
    i.seats !== null ? i.seatsUsed : "",
    i.renewsOn ?? "",
    amount(i.costCents),
    i.period ? t.periods[i.period] : "",
    i.quantity ?? "",
    i.minQuantity ?? "",
    i.notes ?? "",
    ...header.names.map(n => {
      const field = header.fields.find(f => f.categoryId === i.category.id && fold(fieldName(f, t)) === fold(n));
      return field ? i.extra[field.id] ?? "" : "";
    }),
  ];
}

// The whole file's rows at once (the tests read them back).
export function exportRows(items: Item[], t: Catalogue, currency: string, holderName: (id: string) => string, fields: Field[] = []): unknown[][] {
  const header = exportHeader(t, fields);
  return [header.cells, ...items.map(i => exportRow(i, t, currency, holderName, header))];
}
