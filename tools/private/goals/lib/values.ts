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
  return k.unit ? `${n} ${k.unit}` : n;
}

// The number alone, as typed back in a field ("12,5" in French).
export function plainNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(intl(locale), { useGrouping: false, maximumFractionDigits: 4 }).format(value);
}
