import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";
import { catalogue, format, isLocale, type Locale } from "./i18n/index.ts";

// The people a page shows, from the member ids the tool stores: names and
// photos come from the Chest when rendering, never from the tool's data.
// "former" left the Chest (their name kept), "erased" had their data erased,
// "unknown" is an id the Chest does not know here (or the Chest could not be
// asked: the page still renders).
export type Person = { id: string; name: string; photo: string | null; status: "member" | "former" | "erased" | "unknown"; locale: Locale };

export async function people(ids: Iterable<string>): Promise<Map<string, Person>> {
  const wanted = [...new Set(ids)].filter(id => typeof id === "string" && id.startsWith("mbr_"));
  const found = new Map<string, Person>();
  if (wanted.length === 0) return found;
  try {
    const answer = await members.lookup(wanted);
    for (const m of answer.members) found.set(m.id, { id: m.id, name: m.name, photo: m.photo, status: "member", locale: isLocale(m.language) ? m.language : "en" });
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
  return person.name;
}

// nameFor writes any author or owner the tool stores: a member, nobody
// (unassigned), 'erased', or the tool itself ('chest').
export function nameFor(id: string | null, found: Map<string, Person>, locale: Locale): string {
  const t = catalogue(locale).people;
  if (id === null) return t.unassigned;
  if (id === "erased") return t.erased;
  if (id === "chest") return t.chest;
  return nameOf(found.get(id), locale);
}

// The names and photos a page hands to its views, by id.
export type Directory = Record<string, { name: string; photo: string | null }>;
export async function directory(ids: Iterable<string | null | undefined>, locale: Locale): Promise<Directory> {
  const list = [...new Set([...ids].filter((x): x is string => typeof x === "string"))];
  const found = await people(list);
  const out: Directory = {};
  for (const id of list) out[id] = { name: nameFor(id, found, locale), photo: found.get(id)?.status === "member" ? found.get(id)!.photo : null };
  return out;
}
