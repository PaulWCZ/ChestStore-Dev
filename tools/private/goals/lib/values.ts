// Safe in the browser: no SDK here.
// A key result's values as people read them, in their language: "12",
// "1 200 customers", "35 %", "12 000 €". A milestone has no number: the
// page writes "Done" or "Not yet" from its catalogue.
import { intl } from "./i18n/format.ts";

export type Measured = { kind: "number" | "percent" | "money" | "milestone"; unit: string; currency: string | null };

export function valueText(k: Measured, value: number, locale: string): string {
  if (k.kind === "percent") return new Intl.NumberFormat(intl(locale), { style: "percent", maximumFractionDigits: 1 }).format(value / 100);
  if (k.kind === "money" && k.currency) {
    try {
      return new Intl.NumberFormat(intl(locale), { style: "currency", currency: k.currency, maximumFractionDigits: Number.isInteger(value) ? 0 : 2 }).format(value);
    } catch {
      // A currency the runtime does not know: its code after the number.
      return new Intl.NumberFormat(intl(locale), { maximumFractionDigits: 2 }).format(value) + " " + k.currency;
    }
  }
  const n = new Intl.NumberFormat(intl(locale), { maximumFractionDigits: 2 }).format(value);
  const unit = unitFor(k.unit, value, locale);
  return unit ? `${n} ${unit}` : n;
}

// A unit may carry its two forms, "customer/customers": the first for one
// (in that language's rule: 1 in English, 0 and 1 in French), the second
// otherwise. A unit such as "km/h" or "visits/month" is a unit, not two
// forms: the two sides must be words beginning alike ("person/people").
export function unitForms(unit: string): { one: string; other: string } | null {
  const m = /^([\p{L}' -]+)\/([\p{L}' -]+)$/u.exec(unit);
  if (!m) return null;
  const one = m[1]!.trim(), other = m[2]!.trim();
  if (one.length < 2 || other.length < 2 || one.slice(0, 2).toLowerCase() !== other.slice(0, 2).toLowerCase()) return null;
  return { one, other };
}

export function unitFor(unit: string, value: number, locale: string): string {
  const forms = unitForms(unit);
  if (!forms) return unit;
  return Number.isInteger(value) && new Intl.PluralRules(intl(locale)).select(value) === "one" ? forms.one : forms.other;
}

// The number alone, as typed back in a field ("12,5" in French).
export function plainNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(intl(locale), { useGrouping: false, maximumFractionDigits: 4 }).format(value);
}
