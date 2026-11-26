import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";
import { catalogue, format, localeOf, type Locale } from "../i18n/index.ts";

// The people a page shows, from the member ids the tool stores: names and
// photos come from the Chest when rendering, never from the tool's data.
// "former" left the Chest (their name kept), "no_access" is still in the
// Chest but lost access to News (their name kept, SDK 0.4.1), "erased" had
// their data erased, "unknown" is an id the Chest does not know here (or
// the Chest could not be asked: the page still renders).
export type Person = { id: string; name: string; photo: string | null; status: "member" | "former" | "no_access" | "erased" | "unknown"; locale: Locale };

export async function people(ids: Iterable<string>): Promise<Map<string, Person>> {
  const wanted = [...new Set(ids)].filter(id => typeof id === "string" && id.startsWith("mbr_"));
  const found = new Map<string, Person>();
  if (wanted.length === 0) return found;
  try {
    const answer = await members.lookup(wanted);
    for (const m of answer.members) found.set(m.id, { id: m.id, name: m.name, photo: m.photo, status: "member", locale: localeOf(m.language) });
    for (const f of answer.former) found.set(f.id, { id: f.id, name: f.name ?? "", photo: null, status: f.status, locale: "en" });
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  for (const id of wanted) if (!found.has(id)) found.set(id, { id, name: "", photo: null, status: "unknown", locale: "en" });
  return found;
}

// nameOf is how a page writes a person, in the reader's language.
export function nameOf(person: Person | undefined, locale: Locale): string {
  const t = catalogue(locale).people;
  if (!person || person.status === "unknown") return t.unknown;
  if (person.status === "erased") return t.erased;
  if (person.status === "former") return person.name ? format(t.former, { name: person.name }) : t.erased;
  if (person.status === "no_access") return person.name ? format(t.noAccess, { name: person.name }) : t.erased;
  return person.name;
}

// mentionOf is how a mention in a comment names a person, after its "@":
// their name; someone the Chest no longer knows (erased, or an id it does
// not know here) reads "former member" — never their id.
export function mentionOf(person: Person | undefined, locale: Locale): string {
  if (!person || person.status === "unknown" || person.status === "erased" || ((person.status === "former" || person.status === "no_access") && !person.name)) return catalogue(locale).people.mentionGone;
  return nameOf(person, locale);
}
