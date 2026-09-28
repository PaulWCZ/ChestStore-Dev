// Safe in the browser: no SDK here. How the pages write the tool's own
// things — a category's name (the catalogue's until a manager renames it),
// an amount of money — in the reader's language.
import { intl } from "./i18n/format.ts";

type CategoryLike = { key: string | null; name: string | null };
type Words = { categories: Record<string, string> };

export function categoryName(c: CategoryLike, t: Words): string {
  return c.name ?? (c.key ? t.categories[c.key] ?? c.key : "");
}

export function moneyText(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(intl(locale), { style: "currency", currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2, minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}
