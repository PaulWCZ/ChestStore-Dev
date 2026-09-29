// Safe in the browser: no SDK here.
// A key result's values as people read them, in their language: "12",
// "1 200 customers", "35 %", "12 000 €". A milestone has no number: the
// page writes "Done" or "Not yet" from its catalogue.
import { intl } from "./i18n/format.ts";

// unitLocale: the language the unit is written in (its writer's), whose
// rule picks the form for one; null when unknown (written before Goals
// kept it).
export type Measured = { kind: "number" | "percent" | "money" | "milestone"; unit: string; currency: string | null; unitLocale?: string | null };

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
  const unit = unitFor(k.unit, value, k.unitLocale ?? null);
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

// singularOf: the form for one, guessed from the plural a person typed
// ("customers" → "customer", "people" → "person", "clients signés" →
// "client signé", "journaux" → "journal"); null when there is nothing to
// guess ("km/h", "%", a word that does not end like a plural). The key
// result form shows the guess, and the person may correct it.
const irregular: Record<string, string> = { people: "person", men: "man", women: "woman", children: "child", feet: "foot", teeth: "tooth", mice: "mouse" };
function singularWord(word: string, locale: string): string {
  const lower = word.toLowerCase();
  if (locale.startsWith("fr")) {
    if (word.length < 3) return word;
    if (/eaux$/u.test(lower)) return word.slice(0, -1);
    if (/aux$/u.test(lower) && word.length > 4) return word.slice(0, -3) + "al";
    if (/[sx]$/u.test(lower) && !/[sx]{2}$/u.test(lower)) return word.slice(0, -1);
    return word;
  }
  if (irregular[lower]) return word[0] === word[0]!.toUpperCase() ? irregular[lower]![0]!.toUpperCase() + irregular[lower]!.slice(1) : irregular[lower]!;
  if (word.length > 4 && /[^aeiou]ies$/u.test(lower)) return word.slice(0, -3) + "y";
  if (/(ss|x|z|ch|sh)es$/u.test(lower)) return word.slice(0, -2);
  if (word.length > 2 && /s$/u.test(lower) && !/(ss|us|is)$/u.test(lower)) return word.slice(0, -1);
  return word;
}
export function singularOf(plural: string, locale: string): string | null {
  const text = plural.trim();
  if (!/^[\p{L}'’ -]+$/u.test(text)) return null;
  const words = text.split(/(\s+|-)/u);
  let out: string[];
  if (locale.startsWith("fr")) out = words.map(w => (/^[\p{L}'’]+$/u.test(w) ? singularWord(w, locale) : w));
  else {
    // English: the last word is the noun ("new customers", "sales calls").
    const last = words.length - 1;
    out = words.map((w, i) => (i === last ? singularWord(w, locale) : w));
  }
  const one = out.join("");
  return one === text ? null : one;
}

// unitParts / unitOf: the two fields of the form ("customers", and for one
// "customer") and the unit as stored ("customer/customers").
export function unitParts(unit: string): { plural: string; one: string } {
  const forms = unitForms(unit);
  return forms ? { plural: forms.other, one: forms.one } : { plural: unit, one: "" };
}
export function unitOf(plural: string, one: string): string {
  const p = plural.trim(), o = one.trim();
  if (!p) return "";
  if (!o || o === p) return p;
  const combined = `${o}/${p}`;
  return unitForms(combined) ? combined : p;
}

// unitFor: the unit's form for this value, by the rule of the unit's own
// language — "0 customers" (English) and "0 client" (French), whoever
// reads it: the words are the writer's, so is their grammar. A unit whose
// language is unknown takes the form for one at 1 only, the rule both
// languages share (never "0 customer").
export function unitFor(unit: string, value: number, unitLocale: string | null): string {
  const forms = unitForms(unit);
  if (!forms) return unit;
  if (!Number.isInteger(value)) return forms.other;
  if (!unitLocale) return Math.abs(value) === 1 ? forms.one : forms.other;
  return new Intl.PluralRules(intl(unitLocale)).select(value) === "one" ? forms.one : forms.other;
}

// The number alone, as typed back in a field ("12,5" in French).
export function plainNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(intl(locale), { useGrouping: false, maximumFractionDigits: 4 }).format(value);
}
