// Safe in the browser: no SDK here.
// Names the tool itself wrote into a new company's book — the sample's tags
// ("key account") and industries ("Food retail") — are kept as keys
// ("@keyAccount") and shown in each reader's language (the catalogues'
// seed section), until someone replaces them with words of their own. A
// person who types a seeded name in any language (or keeps it in a form)
// keeps the key: "grand compte" and "key account" are one tag.
import { catalogue, locales, type Catalogue } from "../i18n/index.ts";

export type SeedKind = "tags" | "industries";
const keyed = /^@([a-z][a-zA-Z]{0,39})$/u;

const wordsOf = (t: Catalogue, kind: SeedKind) => t.seed[kind] as Readonly<Record<string, string>>;

// shownName: a stored name as the reader reads it.
export function shownName(kind: SeedKind, value: string, t: Catalogue): string {
  const m = keyed.exec(value);
  return (m && wordsOf(t, kind)[m[1]!]) || value;
}

// keptKeys: names sent back by a form, where a record had seeded names —
// one shown in any language (as the form showed it) keeps its key; any
// other name is the person's own, as typed. Only a record's own keys are
// kept: a person typing "retail" on a new record writes their own word.
export function keptKeys(kind: SeedKind, current: readonly string[], next: readonly string[]): string[] {
  const keys = current.filter(value => keyed.test(value));
  if (keys.length === 0) return [...next];
  return next.map(value => {
    const folded = value.trim().toLocaleLowerCase("en");
    return keys.find(key => locales.some(l => shownName(kind, key, catalogue(l)).toLocaleLowerCase("en") === folded)) ?? value;
  });
}
