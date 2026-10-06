import { collator, intl, regionNames } from "../shared/format.ts";
import { countries } from "../shared/model.ts";

// The countries a job may be in, named in the reader's language, sorted
// for them. Written on the server (Node and browsers may name a country
// differently), with kept Intl objects.
export function countryNames(locale: string): [string, string][] {
  const names = regionNames(intl(locale));
  const order = collator(intl(locale));
  return countries.map(c => [c, names.of(c) ?? c] as [string, string]).sort((a, b) => order.compare(a[1], b[1]));
}
