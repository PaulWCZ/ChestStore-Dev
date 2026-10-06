// Safe in the browser: no SDK here.
// Words for the tool's own data, in the reader's catalogue: a built-in
// category is named in each language until the accountant renames it; a
// vehicle's power is written as the scale names it.
import type { Catalogue } from "../i18n/index.ts";
import { format, numberFormat, plural, regionNames } from "../i18n/format.ts";

type Words = Pick<Catalogue, "categories" | "powers" | "vehicles" | "allowance">;

export function categoryName(c: { key: string | null; name: string | null } | undefined, t: Pick<Catalogue, "categories">): string {
  if (!c) return "";
  if (c.name) return c.name;
  return c.key && c.key in t.categories ? t.categories[c.key as keyof Catalogue["categories"]] : "";
}

export function powerName(kind: string, power: string, t: Pick<Words, "powers">): string {
  const key = `${kind}.${power}`;
  return key in t.powers ? t.powers[key as keyof Catalogue["powers"]] : format(t.powers.other, { power });
}

export function vehicleName(kind: string, t: Pick<Words, "vehicles">): string {
  return kind in t.vehicles ? t.vehicles[kind as keyof Catalogue["vehicles"]] : kind;
}

// A distance in tenths of a km, in the reader's language ("12,5").
export function km(tenths: number, locale: string): string {
  return numberFormat(locale, { maximumFractionDigits: 1 }).format(tenths / 10);
}

// A flat rate's name: the accountant's, or the built-in one's in the
// reader's language.
export function allowanceName(a: { key: string | null; name: string | null } | undefined, t: Pick<Words, "allowance">): string {
  if (!a) return "";
  if (a.name) return a.name;
  return a.key && a.key in t.allowance.names ? t.allowance.names[a.key as keyof Catalogue["allowance"]["names"]] : "";
}

// "3 nights × €56.80".
export function allowanceDetail(units: number, unit: string, unitAmount: string, t: Pick<Words, "allowance">, locale: string): string {
  const u = unit as keyof Catalogue["allowance"]["units"];
  return plural(t.allowance.detail, units, locale, { unit: t.allowance.units[u] ?? unit, units: t.allowance.plural[u] ?? unit, amount: unitAmount });
}

// Country names in the reader's language (Intl), sorted for a select:
// computed on the server and handed to the view as plain options.
export function countryOptions(codes: readonly string[], locale: string): { value: string; label: string }[] {
  const names = regionNames(locale);
  return codes.map(code => ({ value: code, label: names.of(code) ?? code })).sort((a, b) => a.label.localeCompare(b.label, locale));
}
