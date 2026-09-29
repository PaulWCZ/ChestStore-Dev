import { ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { catalogue, format } from "./i18n/index.ts";

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
    for (const m of answer.members) found.set(m.id, { id: m.id, name: m.name, photo: m.photo, status: "member", locale: m.locale });
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

// Everyone who has the tool now, as the Chest lists them (by name, accents
// aside): the directory's truth. Asked 500 at a time, up to 5,000 people.
// When the Chest cannot be asked, the page says so (ok: false) instead of
// showing an empty company.
// email: their work address, when the Chest gives it (members.email).
export type Colleague = { id: string; name: string; firstName: string; lastName: string; photo: string | null; role: string | null; locale: Locale; email: string };

export async function everyone(options: { role?: string } = {}): Promise<{ ok: boolean; people: Colleague[] }> {
  const found: Colleague[] = [];
  try {
    let after: string | undefined;
    for (let page = 0; page < 10; page++) {
      const answer = await members.list({ limit: 500, ...(after ? { after } : {}), ...(options.role ? { role: options.role } : {}) });
      for (const m of answer.members) found.push({ id: m.id, name: m.name, firstName: m.firstName, lastName: m.lastName, photo: m.photo, role: m.role, locale: m.locale, email: m.email ?? "" });
      if (!answer.next) break;
      after = answer.next;
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return { ok: false, people: found };
  }
  return { ok: true, people: found };
}

// present keeps, of these ids, the members who have the tool now. The
// Chest's answer decides: when it cannot be asked, this throws (the action
// is refused as "unavailable", never done on a guess).
export async function present(ids: Iterable<string>): Promise<Set<string>> {
  const wanted = [...new Set(ids)].filter(id => typeof id === "string" && id.startsWith("mbr_"));
  if (wanted.length === 0) return new Set();
  const answer = await members.lookup(wanted);
  return new Set(answer.members.map(m => m.id));
}

// Whom a checklist is about, as a page writes it: a member (their name and
// photo from the Chest), or an arrival not linked yet (the name another
// tool gave).
export function subjectOf(j: { personId: string | null; arrivalName: string | null }, who: Map<string, Person>, locale: Locale): { name: string; photo: string | null } {
  if (j.personId) return { name: nameOf(who.get(j.personId), locale), photo: who.get(j.personId)?.photo ?? null };
  return { name: j.arrivalName || catalogue(locale).people.unknown, photo: null };
}
