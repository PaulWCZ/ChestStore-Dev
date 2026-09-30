import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";
import { membership } from "./groups.ts";
import type { Matchable } from "./match.ts";

// The people who have Rooms, by name: for the "invite people" picker and
// "Who's where". The Chest is asked a page of 500 at a time, up to 2,000
// people; q finds the start of a first or last name, accents aside. When
// the Chest does not answer, the page still renders, without the list.
export type Person = { id: string; name: string; firstName: string; photo: string | null; groups: string[] };

export async function directory(q?: string, group?: string): Promise<Person[]> {
  const found: Person[] = [];
  try {
    const inGroups = await membership();
    let after: string | undefined;
    for (let page = 0; page < 4; page++) {
      const answer = await members.list({ limit: 500, ...(after ? { after } : {}), ...(q ? { q } : {}), ...(group ? { group } : {}) });
      for (const m of answer.members) if (m.role !== null) found.push({ id: m.id, name: m.name, firstName: m.firstName || m.name, photo: m.photo, groups: inGroups.get(m.id) ?? m.groups });
      if (!answer.next) break;
      after = answer.next;
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return found;
}

// The same people for an importer to match names and addresses against
// (lib/match.ts): server-side only, never sent to a browser — the
// addresses (with "members.email") are read for matching, not shown or
// kept.
export async function matchable(): Promise<Matchable[]> {
  const found: Matchable[] = [];
  let after: string | undefined;
  for (let page = 0; page < 4; page++) {
    const answer = await members.list({ limit: 500, ...(after ? { after } : {}) });
    for (const m of answer.members) {
      if (m.role !== null) found.push({ id: m.id, name: m.name, firstName: m.firstName, lastName: m.lastName, ...(m.email ? { email: m.email } : {}) });
    }
    if (!answer.next) break;
    after = answer.next;
  }
  return found;
}
