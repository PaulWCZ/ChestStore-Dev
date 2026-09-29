import { intl } from "./i18n/format.ts";
import { countries } from "./model.ts";

// The countries a job may be in, named in the reader's language, sorted
// for them. Written on the server (Node and browsers may name a country
// differently: the page would not hydrate).
export function countryNames(locale: string): [string, string][] {
  const names = new Intl.DisplayNames([intl(locale)], { type: "region" });
  return countries.map(c => [c, names.of(c) ?? c] as [string, string]).sort((a, b) => a[1].localeCompare(b[1], intl(locale)));
}
