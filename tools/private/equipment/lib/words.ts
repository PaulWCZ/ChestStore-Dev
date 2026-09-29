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

// A field's name: the catalogue's for a field the tool proposed (its key),
// in the reader's language, until a manager renames it.
export function fieldName(f: { key: string | null; name: string }, t: { fieldNames: Record<string, string> }): string {
  return f.key ? t.fieldNames[f.key] ?? f.name : f.name;
}

// The rules for company equipment as a reader reads them: the tool's
// example in their language, or the manager's own words.
export function charterText(c: { example: boolean; body: string }, t: { settings: { rulesExample: string } }): string {
  return c.example ? t.settings.rulesExample : c.body;
}
