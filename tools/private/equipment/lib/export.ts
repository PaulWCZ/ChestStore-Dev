import type { Catalogue } from "./i18n/index.ts";
import type { Item } from "./items.ts";
import { categoryName } from "./words.ts";

// The equipment as a spreadsheet, in the reader's language: one row per
// item, amounts as plain numbers (a spreadsheet reads them), days as
// YYYY-MM-DD. The tool's importer reads this file back.
export function exportRows(items: Item[], t: Catalogue, currency: string, holderName: (id: string) => string): unknown[][] {
  const h = t.export.headers;
  const header = [h.tag, h.name, h.category, h.status, h.holder, h.place, h.since, h.serial, h.bought, h.price, h.currency, h.supplier, h.warranty, h.seats, h.seatsUsed, h.renews, h.cost, h.period, h.notes];
  const amount = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));
  const rows = items.map(i => [
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
    i.notes ?? "",
  ]);
  return [header, ...rows];
}
