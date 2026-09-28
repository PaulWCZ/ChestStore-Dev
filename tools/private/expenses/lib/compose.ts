import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";
import type { Expense } from "./expenses.ts";
import type { Catalogue, Locale } from "./i18n/index.ts";
import { today } from "./model.ts";
import { commonCurrencies, inputAmount } from "./money.ts";
import { thumbnailTypes } from "./model.ts";
import type { Scale, VehicleKind } from "./scale.ts";
import { categories, scales, settings, vehicleOf, type Vehicle } from "./settings.ts";
import { categoryName, powerName, vehicleName } from "./words.ts";

// What the add and edit screens need, as plain data for their views.
export type ComposeData = {
  today: string;
  currency: string;
  currencies: string[];
  categories: { id: string; name: string }[];
  merchants: string[];
  vehicle: (Vehicle & { label: string }) | null;
  scales: { year: number; data: Scale }[];
  trips: { id: string; day: string; tenths: number; kind: VehicleKind }[];
};

export async function composeData(sql: Query, actor: Member, t: Catalogue, keepCategory?: string): Promise<ComposeData> {
  const [cats, company, vehicle, all] = await Promise.all([categories(sql, { archived: true }), settings(sql), vehicleOf(sql, actor.id), scales(sql)]);
  const merchants = await sql<{ merchant: string }[]>`
    select merchant from expenses where member_id = ${actor.id} and merchant <> '' and deleted_at is null
    group by merchant order by max(created_at) desc limit 30`;
  const year = Number(today().slice(0, 4));
  const trips = await sql<{ id: string; day: string; tenths: number; kind: VehicleKind }[]>`
    select id, to_char(spent_on, 'YYYY-MM-DD') as day, distance_tenths as tenths, vehicle as kind from expenses
    where member_id = ${actor.id} and kind = 'mileage' and deleted_at is null and spent_on >= ${`${year - 1}-01-01`}`;
  return {
    today: today(),
    currency: company.currency,
    currencies: [...new Set([company.currency, ...commonCurrencies])],
    categories: cats.filter(c => !c.mileage && (!c.archived || c.id === keepCategory)).map(c => ({ id: c.id, name: categoryName(c, t) })),
    merchants: merchants.map(m => m.merchant),
    vehicle: vehicle ? { ...vehicle, label: `${vehicleName(vehicle.kind, t)} · ${powerName(vehicle.kind, vehicle.power, t)}${vehicle.electric ? " · " + t.trip.electric : ""}` } : null,
    scales: all.map(s => ({ year: s.year, data: s.data })),
    trips: trips.map(r => ({ id: String(r.id), day: r.day, tenths: r.tenths, kind: r.kind })),
  };
}

// An expense as the edit screen fills its fields.
export type Initial = {
  id: string;
  spentOn: string;
  amount: string;
  currency: string;
  vat: string;
  categoryId: string;
  merchant: string;
  note: string;
  paidBy: "me" | "company";
  receipt: { thumb: string | null; pdf: boolean; name: string } | null;
  from: string;
  to: string;
  distance: string;
  refusedReason: string | null;
};

export function initialOf(e: Expense, locale: Locale): Initial {
  return {
    id: e.id,
    spentOn: e.spentOn,
    amount: inputAmount(e.amount, e.currency, locale),
    currency: e.currency,
    vat: e.vat === null ? "" : inputAmount(e.vat, e.currency, locale),
    categoryId: e.categoryId,
    merchant: e.merchant,
    note: e.note,
    paidBy: e.paidBy,
    receipt: e.receipt ? { thumb: thumbnailTypes.includes(e.receipt.type) ? `/chest/receipts/${e.id}?size=1024` : null, pdf: e.receipt.type === "application/pdf", name: e.receipt.name } : null,
    from: e.trip?.from ?? "",
    to: e.trip?.to ?? "",
    distance: e.trip ? String(e.trip.distance / 10).replace(".", locale === "fr" ? "," : ".") : "",
    refusedReason: e.refusedReason,
  };
}
