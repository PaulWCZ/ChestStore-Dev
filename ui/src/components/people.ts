// Finding people (and Chest groups) by what one types: accents and case
// aside, by the start of the first name, the last name or any word of the
// name ("lé" finds Léa Moreau, "mor" too, "lea mo" too). Pure: a tool that
// holds its team in memory searches here; one that asks its server uses
// the same rule there.
import { compareText, fold } from "./text.js";

export type Choice = {
  // "member" (an mbr_… id) or "group" (a Chest group: "Sales").
  readonly kind?: "member" | "group";
  readonly id: string;
  readonly name: string;
  // A second line: a job title, an email, "12 people".
  readonly detail?: string;
  readonly photo?: string | null;
  // For a group: how many people are in it.
  readonly size?: number;
};

// The words a name is made of, folded: "Jean-Pierre O’Neil" → jean, pierre, o, neil.
function wordsOf(name: string): string[] {
  return fold(name).split(/[\s\-‐'’.]+/u).filter(Boolean);
}

// matches: every word typed starts a word of the name (in any order), or
// the whole name starts with what is typed.
export function matches(name: string, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  const folded = fold(name);
  if (folded.startsWith(q)) return true;
  const words = wordsOf(name);
  return wordsOf(query).every(t => words.some(w => w.startsWith(t)));
}

export type SearchOptions = {
  // Ids chosen recently by this person, most recent first: shown first.
  readonly recent?: readonly string[];
  // At most this many answers (a picker never lists 400 names).
  readonly limit?: number;
  // Ids to leave out (already chosen, or not allowed).
  readonly exclude?: readonly string[];
};

// searchChoices: the matches, recent first (in the order of `recent`), then
// groups, then people, each by name.
export function searchChoices<T extends Choice>(list: readonly T[], query: string, { recent = [], limit = 50, exclude = [] }: SearchOptions = {}): T[] {
  const skip = new Set(exclude);
  const rank = new Map(recent.map((id, i) => [id, i]));
  return list
    .filter(c => !skip.has(c.id) && matches(c.name, query))
    .sort((a, b) => {
      const ra = rank.get(a.id);
      const rb = rank.get(b.id);
      if (ra !== undefined || rb !== undefined) return (ra ?? Infinity) - (rb ?? Infinity);
      const ga = a.kind === "group" ? 0 : 1;
      const gb = b.kind === "group" ? 0 : 1;
      return ga - gb || compareText(a.name, b.name);
    })
    .slice(0, limit);
}

// localSearch: the search function a PeoplePicker wants, over a list the
// page already holds.
export function localSearch<T extends Choice>(list: readonly T[], options: SearchOptions = {}): (query: string) => Promise<T[]> {
  return async (query: string) => searchChoices(list, query, options);
}

// rememberRecent: the new list of recent ids after choosing one (most
// recent first, at most `max`). The tool keeps it where it likes (its
// database per member; the kit keeps nothing).
export function rememberRecent(recent: readonly string[], id: string, max = 8): string[] {
  return [id, ...recent.filter(r => r !== id)].slice(0, max);
}
