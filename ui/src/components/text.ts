// Text helpers shared by the components: pure, the same in Node and in
// every browser (nothing here depends on the machine's locale).
import type { Plural } from "./words.js";

// fill puts values in the {placeholders} of a text; unknown ones stay.
export function fill(text: string, values: Readonly<Record<string, string | number>> = {}): string {
  return text.replace(/\{(\w+)\}/gu, (whole, key: string) => (Object.hasOwn(values, key) ? String(values[key]) : whole));
}

// plural picks the form for n in a language (CLDR rules through
// Intl.PluralRules, which agree between Node and browsers for a language
// code), then fills {count}. Counts are written without grouping, so they
// read the same on the server and in the browser.
export function plural(forms: Plural, n: number, lang: string, values: Readonly<Record<string, string | number>> = {}): string {
  let form: string;
  if (n === 0 && forms.zero !== undefined) form = forms.zero;
  else {
    let rule: string;
    try {
      rule = new Intl.PluralRules(lang).select(n);
    } catch {
      rule = n === 1 ? "one" : "other";
    }
    form = rule === "one" ? forms.one : forms.other;
  }
  return fill(form, { count: String(n), ...values });
}

// fold makes text comparable whatever its accents and case: "Léa" and
// "lea", "Æsa" stays "æsa" (no decomposition), "ß" stays.
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

// compareText orders text the same everywhere: folded first, then as
// written (a stable, machine-independent order — localeCompare depends on
// the ICU data of each engine, which would break hydration).
export function compareText(a: string, b: string): number {
  const fa = fold(a);
  const fb = fold(b);
  if (fa !== fb) return fa < fb ? -1 : 1;
  return a === b ? 0 : a < b ? -1 : 1;
}

// initials for an avatar without a photo: the first letters of the first
// and last words ("Camille Martin" → "CM"); "·" for no name.
// A trailing note in brackets is not part of the name: "Léa Dubois (former
// member)" → "LD" (0.2.1).
export function initials(name: string): string {
  const bare = name.replace(/\s*[(（[][^()（）[\]]*[)）\]]\s*$/u, "").trim() || name.trim();
  const words = bare.split(/\s+/u).filter(Boolean);
  // A word's first letter or digit ("(bot)" → "B", "«Léa»" → "L").
  const letter = (w: string | undefined) => [...(w ?? "")].find(ch => /[\p{L}\p{N}]/u.test(ch)) ?? [...(w ?? "")][0] ?? "";
  const first = letter(words[0]);
  const last = words.length > 1 ? letter(words.at(-1)) : "";
  return (first + last).toUpperCase() || "·";
}

// joinClasses keeps the truthy class names.
export function cx(...names: readonly (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

// isEditable: typing here must not trigger a page shortcut ("/", Ctrl+Z).
export function isEditable(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).tagName !== "string") return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
