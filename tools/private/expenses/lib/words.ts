// Safe in the browser: no SDK here.
// Words for the tool's own data, in the reader's catalogue: a built-in
// category is named in each language until the accountant renames it; a
// vehicle's power is written as the scale names it.
import type { Catalogue } from "./i18n/index.ts";
import { format } from "./i18n/format.ts";

type Words = Pick<Catalogue, "categories" | "powers" | "vehicles">;

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
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : locale, { maximumFractionDigits: 1 }).format(tenths / 10);
}
