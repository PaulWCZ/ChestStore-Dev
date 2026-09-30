import { ChestError } from "@argentic/chest-sdk/errors";
import { localeOf, type Locale } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { catalogue, format, formatDate } from "./i18n/index.ts";

// The people a page shows, from the member ids the tool stores: names and
// photos come from the Chest when rendering, never from the tool's data.
// "former" left the Chest (their name kept), "erased" had their data erased,
// "unknown" is an id the Chest does not know here (or the Chest could not be
// asked: the page still renders). leftAt: when a former or erased member
// left the Chest (studio.15), null when the Chest does not say.
export type Person = { id: string; name: string; photo: string | null; status: "member" | "former" | "erased" | "unknown"; locale: Locale; leftAt: string | null };

export async function people(ids: Iterable<string>): Promise<Map<string, Person>> {
  const wanted = [...new Set(ids)].filter(id => typeof id === "string" && id.startsWith("mbr_"));
  const found = new Map<string, Person>();
  if (wanted.length === 0) return found;
  try {
    const answer = await members.lookup(wanted);
    for (const m of answer.members) found.set(m.id, { id: m.id, name: m.name, photo: m.photo, status: "member", locale: localeOf(m.language), leftAt: null });
    for (const f of answer.former) found.set(f.id, { id: f.id, name: f.name ?? "", photo: null, status: f.status, locale: "en", leftAt: f.leftAt ?? null });
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  for (const id of wanted) if (!found.has(id)) found.set(id, { id, name: "", photo: null, status: "unknown", locale: "en", leftAt: null });
  return found;
}

// leftNote says that someone left, and when when the Chest says it ("Left
// the company on 30 September: …"); null for a member. `words` are a
// catalogue's two sentences: without the day, and with {date}.
export function leftNote(person: Person | undefined, locale: Locale, words: { left: string; leftOn: string }, now = new Date()): string | null {
  if (person?.status !== "former" && person?.status !== "erased") return null;
  if (!person.leftAt || !Number.isFinite(Date.parse(person.leftAt))) return words.left;
  const at = new Date(person.leftAt);
  const sameYear = formatDate(at, locale, { year: "numeric" }) === formatDate(now, locale, { year: "numeric" });
  return format(words.leftOn, { date: formatDate(at, locale, sameYear ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" }) });
}

// nameOf is how a page writes a person, in the reader's language.
export function nameOf(person: Person | undefined, locale: Locale): string {
  const t = catalogue(locale).people;
  if (!person || person.status === "unknown") return t.unknown;
  if (person.status === "erased") return t.erased;
  if (person.status === "former") return person.name ? format(t.former, { name: person.name }) : t.erased;
  return person.name;
}

// The members who have the tool now, with their role (for the approvers'
// table and to find the accountants), 5,000 at most. When the Chest cannot
// be asked, nobody: the callers fall back to what they can do alone.
export type Holder = { id: string; name: string; photo: string | null; role: string | null; locale: Locale };

export async function holders(options: { role?: string } = {}): Promise<Holder[]> {
  const found: Holder[] = [];
  try {
    let after: string | undefined;
    do {
      const page = await members.list({ limit: 500, ...(after ? { after } : {}), ...(options.role ? { role: options.role } : {}) });
      for (const m of page.members) found.push({ id: m.id, name: m.name, photo: m.photo, role: m.role, locale: localeOf(m.language) });
      after = page.next ?? undefined;
    } while (after && found.length < 5000);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return found;
}

// The accountants: who approves when nobody is named, who pays.
export async function accountants(): Promise<string[]> {
  return (await holders({ role: "accountant" })).map(h => h.id);
}

// mayApprove: the member has the tool now, as an approver or accountant.
export async function mayApprove(id: string): Promise<boolean> {
  try {
    const m = await members.get(id);
    return m !== null && (m.role === "approver" || m.role === "accountant");
  } catch (error) {
    if (error instanceof ChestError) return false;
    throw error;
  }
}
