import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";
import type { Expense } from "./expenses.ts";
import type { Catalogue, Locale } from "./i18n/index.ts";
import { today } from "./model.ts";
import { format } from "./i18n/index.ts";
import { commonCurrencies, formatMoney, inputAmount, rateText } from "./money.ts";
import { thumbnailTypes } from "./model.ts";
import type { Scale, VehicleKind } from "./scale.ts";
import { holders, nameOf, people } from "./people.ts";
import { allowances, categories, rates, scales, settings, vehicleOf, type Vehicle } from "./settings.ts";
import { allowanceName, categoryName, powerName, vehicleName } from "./words.ts";

// What the add and edit screens need, as plain data for their views.
export type ComposeData = {
  today: string;
  currency: string;
  currencies: string[];
  // The company's exchange rates (millionths), by currency.
  rates: Record<string, number>;
  categories: { id: string; name: string; guests: boolean; perNight: boolean; cap: number | null }[];
  // The company's flat rates (archived ones only when the edited expense
  // uses one).
  allowances: { id: string; name: string; amount: number; unit: string; rate: string }[];
  // The team, to name who was at a meal (the actor left out).
  team: { id: string; name: string }[];
  merchants: string[];
  vehicle: (Vehicle & { label: string }) | null;
  scales: { year: number; data: Scale }[];
  trips: { id: string; day: string; tenths: number; kind: VehicleKind }[];
  // Kilometres driven before the tool, by year and vehicle kind.
  prior: { year: number; kind: VehicleKind; tenths: number }[];
  // The trips made most often lately, one tap to fill the form again.
  usual: { from: string; to: string; tenths: number }[];
};

export async function composeData(sql: Query, actor: Member, t: Catalogue, locale: Locale, keep: { category?: string; allowance?: string } = {}): Promise<ComposeData> {
  const [cats, company, vehicle, all, everyone, known, flat] = await Promise.all([categories(sql, { archived: true }), settings(sql), vehicleOf(sql, actor.id), scales(sql), holders(), rates(sql), allowances(sql, { archived: true })]);
  const merchants = await sql<{ merchant: string }[]>`
    select merchant from expenses where member_id = ${actor.id} and merchant <> '' and deleted_at is null
    group by merchant order by max(created_at) desc limit 30`;
  const year = Number(today().slice(0, 4));
  const trips = await sql<{ id: string; day: string; tenths: number; kind: VehicleKind }[]>`
    select id, to_char(spent_on, 'YYYY-MM-DD') as day, distance_tenths as tenths, vehicle as kind from expenses
    where member_id = ${actor.id} and kind = 'mileage' and deleted_at is null and spent_on >= ${`${year - 1}-01-01`}`;
  const prior = await sql<{ year: number; kind: VehicleKind; tenths: number }[]>`
    select year, vehicle as kind, distance_tenths as tenths from prior_distances where member_id = ${actor.id} and year >= ${year - 1}`;
  const usual = await sql<{ from_place: string; to_place: string; distance_tenths: number }[]>`
    select from_place, to_place, distance_tenths from expenses
    where member_id = ${actor.id} and kind = 'mileage' and deleted_at is null and spent_on >= ${`${year - 1}-01-01`}
    group by from_place, to_place, distance_tenths order by count(*) desc, max(spent_on) desc limit 4`;
  return {
    today: today(),
    currency: company.currency,
    currencies: [...new Set([company.currency, ...commonCurrencies])],
    rates: Object.fromEntries(known.map(r => [r.currency, r.rate])),
    categories: cats.filter(c => !c.mileage && c.key !== "allowance" && (!c.archived || c.id === keep.category)).map(c => ({ id: c.id, name: categoryName(c, t), guests: c.guests, perNight: c.perNight, cap: c.cap })),
    allowances: flat.filter(a => !a.archived || a.id === keep.allowance).map(a => ({
      id: a.id, name: allowanceName(a, t), amount: a.amount, unit: a.unit,
      rate: format(t.allowance.rate, { amount: formatMoney(a.amount, company.currency, locale), unit: t.allowance.units[a.unit] }),
    })),
    team: everyone.filter(h => h.id !== actor.id).map(h => ({ id: h.id, name: h.name })).sort((a, b) => a.name.localeCompare(b.name)),
    merchants: merchants.map(m => m.merchant),
    vehicle: vehicle ? { ...vehicle, label: `${vehicleName(vehicle.kind, t)} · ${powerName(vehicle.kind, vehicle.power, t)}${vehicle.electric ? " · " + t.trip.electric : ""}` } : null,
    scales: all.map(s => ({ year: s.year, data: s.data })),
    trips: trips.map(r => ({ id: String(r.id), day: r.day, tenths: r.tenths, kind: r.kind })),
    prior: prior.map(p => ({ year: p.year, kind: p.kind, tenths: p.tenths })),
    usual: usual.map(u => ({ from: u.from_place, to: u.to_place, tenths: u.distance_tenths })),
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
  nights: string;
  allowanceId: string;
  units: string;
  guests: { members: { id: string; name: string }[]; names: string[]; alone: boolean };
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
    nights: e.nights === null ? "1" : String(e.nights),
    allowanceId: e.allowance?.id ?? "",
    units: e.allowance ? String(e.allowance.units) : "1",
    guests: { members, names: e.guests.names, alone: e.alone },
  };
}
