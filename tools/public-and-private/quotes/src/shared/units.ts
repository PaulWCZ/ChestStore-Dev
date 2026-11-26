// Safe in the browser: no SDK here.
// The unit of a line as a document prints it: "1 exemplaire", "10
// exemplaires", "1,5 heure", "2 hours". The known units come from the
// document language's catalogue (pdf.units, both forms); another unit
// takes that language's regular plural (pdf.unitPlural) when it is one word
// of letters — "affiche" → "affiches" — and is left as typed otherwise
// ("m²", "h", "jour-homme"). Which quantities take the plural is the
// language's own rule (Intl.PluralRules: in French 0 and 1.5 are singular).
import { format, intl, looseCollator, pluralRules } from "../i18n/format.ts";

type Forms = { readonly one: string; readonly other: string };
export type UnitWords = { readonly units: Readonly<Record<string, Forms>>; readonly unitPlural: { readonly regular: string; readonly unchanged: string } };

// Compared as people mean them: no case, no accents.
const same = (a: string, b: string) => looseCollator().compare(a, b) === 0;

export function unitText(unit: string, quantity: number, words: UnitWords, locale: string): string {
  const text = unit.trim();
  if (!text) return "";
  if (pluralRules(intl(locale)).select(quantity / 1000) === "one") return text;
  for (const forms of Object.values(words.units)) {
    if (same(forms.one, text) || same(forms.other, text)) return forms.other;
  }
  if (/^\p{Ll}{3,}$/u.test(text) && !words.unitPlural.unchanged.split(" ").some(end => text.endsWith(end))) return format(words.unitPlural.regular, { unit: text });
  return text;
}

// The unit's key in the catalogues (hour, day, copy…), whatever the
// language it was written in; null for a unit of the person's own.
export function unitKey(unit: string, catalogues: readonly UnitWords[]): string | null {
  const text = unit.trim();
  if (!text) return null;
  for (const words of catalogues) {
    for (const [key, forms] of Object.entries(words.units)) if (same(forms.one, text) || same(forms.other, text)) return key;
  }
  return null;
}

// UN/ECE Recommendation 20 codes of the known units, as a structured
// invoice (EN 16931, BT-130) names them; C62 ("one") for any other.
export const unitCodes: Readonly<Record<string, string>> = {
  hour: "HUR", day: "DAY", halfDay: "C62", week: "WEE", month: "MON", year: "ANN", unit: "C62", copy: "H87", page: "C62", flat: "LS", lot: "C62", m2: "MTK", km: "KMT", kg: "KGM",
};
