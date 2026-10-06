import { ChestError } from "@argentic/chest-sdk/errors";
import { localeOf, type Locale } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { catalogue, format } from "../i18n/index.ts";

// The people a page shows, from the member ids the tool stores: names and
// photos come from the Chest when rendering, never from the tool's data.
// "former" left the Chest (their name kept), "no_access" is still in the
// Chest but lost access to Support (their name kept), "erased" had their
// data erased, "unknown" is an id the Chest does not know here (or the
// Chest could not be asked: the page still renders).
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

// knownPeople: the same, for a public page — which never asks the Chest on
// each visit (a flood of visits would spend the tool's limits there): what
// the Chest said is kept a minute, five hundred people at most.
const kept = new Map<string, { person: Person; at: number }>();
export async function knownPeople(ids: Iterable<string>, now = Date.now()): Promise<Map<string, Person>> {
  const wanted = [...new Set(ids)];
  const found = new Map<string, Person>();
  const missing = wanted.filter(id => {
    const hit = kept.get(id);
    if (hit && now - hit.at < 60_000) found.set(id, hit.person);
    return !found.has(id);
  });
  if (missing.length) {
    for (const [id, person] of await people(missing)) {
      found.set(id, person);
      if (kept.size >= 500) kept.delete(kept.keys().next().value!);
      kept.set(id, { person, at: now });
    }
  }
  return found;
}

// nameOf is how a page writes a person, in the reader's language.
export function nameOf(person: Person | undefined, locale: Locale): string {
  const t = catalogue(locale).people;
  if (!person || person.status === "unknown") return t.unknown;
  if (person.status === "erased") return t.erased;
  if (person.status === "former") return person.name ? format(t.former, { name: person.name }) : t.erased;
  if (person.status === "no_access") return person.name ? format(t.noAccess, { name: person.name }) : t.unknown;
  return person.name;
}
