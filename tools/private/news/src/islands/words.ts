// The words of an island, in the browser: its texts come from the page
// (props), already in the reader's language; here only what puts numbers
// and names into them. Each Intl object is made once per language.
export const format = (text: string, values: Record<string, string | number> = {}): string =>
  text.replace(/\{(\w+)\}/gu, (whole, key: string) => (key in values ? String(values[key]) : whole));

export type Plural = { readonly zero?: string; readonly one: string; readonly other: string };

const tagOf = (locale: string) => (locale === "en" ? "en-GB" : locale);
const rules = new Map<string, { plural: Intl.PluralRules; number: Intl.NumberFormat }>();

// plural picks the form of { zero?, one, other } for n, then fills {count}.
export function plural(forms: Plural, n: number, locale: string, values: Record<string, string | number> = {}): string {
  const tag = tagOf(locale);
  let made = rules.get(tag);
  if (!made) rules.set(tag, (made = { plural: new Intl.PluralRules(tag), number: new Intl.NumberFormat(tag) }));
  const form = n === 0 && forms.zero !== undefined ? forms.zero : made.plural.select(n) === "one" ? forms.one : forms.other;
  return format(form, { count: made.number.format(n), ...values });
}
