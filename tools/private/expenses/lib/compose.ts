import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";
import type { Expense } from "./expenses.ts";
import type { Catalogue, Locale } from "./i18n/index.ts";
import { today } from "./model.ts";
import { commonCurrencies, inputAmount, rateText } from "./money.ts";
import { thumbnailTypes } from "./model.ts";
import type { Scale, VehicleKind } from "./scale.ts";
import { categories, rates, scales, settings, vehicleOf, type Vehicle } from "./settings.ts";
import { holders, nameOf, people } from "./people.ts";
import { categoryName, powerName, vehicleName } from "./words.ts";

// What the add and edit screens need, as plain data for their views.
export type ComposeData = {
  today: string;
  currency: string;
  currencies: string[];
  // The company's exchange rates (millionths), by currency.
  rates: Record<string, number>;
  categories: { id: string; name: string; guests: boolean }[];
  // The team, to name who was at a meal (the actor left out).
  team: { id: string; name: string }[];
  merchants: string[];
  vehicle: (Vehicle & { label: string }) | null;
  scales: { year: number; data: Scale }[];
  trips: { id: string; day: string; tenths: number; kind: VehicleKind }[];
};

export async function composeData(sql: Query, actor: Member, t: Catalogue, keepCategory?: string): Promise<ComposeData> {
  const [cats, company, vehicle, all, everyone, known] = await Promise.all([categories(sql, { archived: true }), settings(sql), vehicleOf(sql, actor.id), scales(sql), holders(), rates(sql)]);
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
    rates: Object.fromEntries(known.map(r => [r.currency, r.rate])),
    categories: cats.filter(c => !c.mileage && (!c.archived || c.id === keepCategory)).map(c => ({ id: c.id, name: categoryName(c, t), guests: c.guests })),
    team: everyone.filter(h => h.id !== actor.id).map(h => ({ id: h.id, name: h.name })).sort((a, b) => a.name.localeCompare(b.name)),
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
  // A rate its owner typed ("" when it follows the company's).
  rate: string;
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
  guests: { members: { id: string; name: string }[]; names: string[] };
};

// The names of the guests an expense already has, for the edit screen.
export async function guestNames(e: Expense, locale: Locale): Promise<{ id: string; name: string }[]> {
  const who = await people(e.guests.members);
  return e.guests.members.map(id => ({ id, name: nameOf(who.get(id), locale) }));
}

export function initialOf(e: Expense, locale: Locale, members: { id: string; name: string }[] = []): Initial {
  return {
    id: e.id,
    spentOn: e.spentOn,
    amount: inputAmount(e.amount, e.currency, locale),
    currency: e.currency,
    rate: e.rateSource === "typed" && e.rate !== null ? rateText(e.rate, locale) : "",
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
    guests: { members, names: e.guests.names },
  };
}
