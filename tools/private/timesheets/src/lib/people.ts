import { ChestError } from "@argentic/chest-sdk/errors";
import { localeOf, type Locale } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { db } from "./db.ts";
import { catalogue, format } from "../i18n/index.ts";

// The people a page shows, from the member ids the tool stores: names and
// photos come from the Chest when rendering, never from the tool's data.
// "former" left the Chest (their name kept), "no_access" is still in the
// Chest but lost access to the tool (their name kept), "erased" had their
// data erased,
// "unknown" is an id the Chest does not know here (or the Chest could not be
// asked: the page still renders). An 'imp_…' id is someone who left before
// the Chest, whose time came with an import: "former", with the name the
// old tool gave (kept by the tool: the Chest never knew them). leftAt: when
// a former member left the Chest (members.leftAt, a studio proposal; null
// when the Chest does not say, and for imported people, who left before it).
export type Person = { id: string; name: string; photo: string | null; status: "member" | "former" | "no_access" | "erased" | "unknown"; locale: Locale; leftAt: string | null };

export async function people(ids: Iterable<string>): Promise<Map<string, Person>> {
  const all = [...new Set(ids)];
  const wanted = all.filter(id => typeof id === "string" && id.startsWith("mbr_"));
  const found = new Map<string, Person>();
  const imported = all.filter(id => typeof id === "string" && /^imp_[1-9][0-9]{0,17}$/u.test(id));
  if (imported.length) {
    const rows = await db()<{ id: string; name: string }[]>`select 'imp_' || id as id, name from former_people where id = any(${imported.map(x => x.slice(4))}::bigint[])`;
    for (const r of rows) found.set(r.id, { id: r.id, name: r.name, photo: null, status: "former", locale: "en", leftAt: null });
    for (const id of imported) if (!found.has(id)) found.set(id, { id, name: "", photo: null, status: "erased", locale: "en", leftAt: null });
  }
  if (wanted.length === 0) return found;
  try {
    const answer = await members.lookup(wanted);
    for (const m of answer.members) found.set(m.id, { id: m.id, name: m.name, photo: m.photo, status: "member", locale: localeOf(m.language), leftAt: null });
    for (const f of answer.former) found.set(f.id, { id: f.id, name: f.name ?? "", photo: null, status: f.status, locale: "en", leftAt: null });
    // When they left: one call for all of them (a proposal; a Chest that
    // does not say leaves it null, and the page says nothing).
    const gone = answer.former.filter(f => f.status !== "no_access").map(f => f.id);
    if (gone.length > 0) {
      const left = await members.leftAt(gone).catch((error: unknown) => {
        if (error instanceof ChestError) return new Map<string, string>();
        throw error;
      });
      for (const [id, at] of left) {
        const person = found.get(id);
        if (person) person.leftAt = at;
      }
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  for (const id of wanted) if (!found.has(id)) found.set(id, { id, name: "", photo: null, status: "unknown", locale: "en", leftAt: null });
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

// nameFor writes a stored author: a member id, or 'erased'.
export function nameFor(id: string, found: Map<string, Person>, locale: Locale): string {
  if (id === "erased") return catalogue(locale).people.erased;
  return nameOf(found.get(id), locale);
}
