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

// The members who have the tool now, with their role, 5,000 at most. When
// the Chest cannot be asked, nobody: the callers do without.
export type Holder = { id: string; name: string; role: string | null; locale: Locale };

export async function holders(options: { role?: string } = {}): Promise<Holder[]> {
  const found: Holder[] = [];
  try {
    let after: string | undefined;
    do {
      const page = await members.list({ limit: 500, ...(after ? { after } : {}), ...(options.role ? { role: options.role } : {}) });
      for (const m of page.members) found.push({ id: m.id, name: m.name, role: m.role, locale: m.locale });
      after = page.next ?? undefined;
    } while (after && found.length < 5000);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return found;
}
