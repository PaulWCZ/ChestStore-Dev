import { ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { intl } from "./i18n/format.ts";
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

// Everyone who has the tool (the owners a form offers), by name; [] when
// the Chest cannot be asked.
export async function everyone(): Promise<{ id: string; name: string; photo: string | null }[]> {
  const found: { id: string; name: string; photo: string | null }[] = [];
  try {
    let after: string | undefined;
    do {
      const page = await members.list({ limit: 500, ...(after ? { after } : {}) });
      for (const m of page.members) found.push({ id: m.id, name: m.name, photo: m.photo });
      after = page.next ?? undefined;
    } while (after && found.length < 2000);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return found;
}

// whoStarts: the names of those who may start a cycle (the tool's admins —
// the first role — the Chest's own admins last: they are rarely the ones
// to ask), at most three, written as the reader reads a choice ("Camille
// Martin or Sofia Rossi"); null when the Chest names nobody. A member's
// empty page then says whom to ask.
export async function whoStarts(locale: Locale): Promise<string | null> {
  const found: { name: string; isAdmin: boolean }[] = [];
  try {
    let after: string | undefined;
    do {
      const page = await members.list({ role: "admin", limit: 500, ...(after ? { after } : {}) });
      for (const m of page.members) found.push({ name: m.name, isAdmin: m.isAdmin });
      after = page.next ?? undefined;
    } while (after && found.length < 2000);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  if (found.length === 0) return null;
  found.sort((a, b) => Number(a.isAdmin) - Number(b.isAdmin) || a.name.localeCompare(b.name));
  return new Intl.ListFormat(intl(locale), { type: "disjunction" }).format(found.slice(0, 3).map(p => p.name));
}

// The member's empty page before the first cycle: whom to ask, by name.
export async function noCycleWords(locale: Locale): Promise<string> {
  const t = catalogue(locale).home;
  const names = await whoStarts(locale);
  return names ? format(t.noCycleAsk, { names }) : t.noCycleMember;
}
