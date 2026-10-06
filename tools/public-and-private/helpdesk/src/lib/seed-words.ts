// Safe in the browser: no SDK here.
// The tags a new desk starts with (the sample's "Damaged", "Delivery"…)
// are kept as keys ("@damaged") and shown in each reader's language (the
// catalogues' seed section) until someone renames them; a tag typed in any
// language that names a seeded one is that tag.
import type { Member } from "@argentic/chest-sdk/member";
import { catalogue, isLocale, locales, type Catalogue } from "./i18n/index.ts";

const keyed = /^@([a-z][a-zA-Z]{0,29})$/u;
const words = (t: Catalogue) => t.seed.tags as Readonly<Record<string, string>>;

export function shownTag(name: string, t: Catalogue): string {
  const m = keyed.exec(name);
  return (m && words(t)[m[1]!]) || name;
}

// storedTag: the key a typed name would be, if it names a seeded tag in
// any language (the caller looks whether the desk has that tag).
export function storedTag(name: string): string {
  if (keyed.test(name)) return name;
  const folded = name.trim().toLocaleLowerCase("en");
  for (const l of locales) for (const [key, text] of Object.entries(words(catalogue(l)))) if (text.toLocaleLowerCase("en") === folded) return "@" + key;
  return name;
}

// The catalogue of whoever reads (a member), English otherwise.
export const readerWords = (actor: Pick<Member, "language"> | null): Catalogue => catalogue(actor && isLocale(actor.language) ? actor.language : "en");
