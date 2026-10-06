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
// (lib/match.ts): server-side only, never sent to a browser. Rooms never
// reads the members' addresses (no "members.email"): the addresses the
// file carries are sent to the Chest, which answers those that are members
// who have Rooms (members.matchEmails, SDK studio.15); each found address
// is set on its member for the matcher, nothing else is learnt or kept.
// When the Chest cannot match, the file is matched by names alone.
const addressIn = /[^\s@<>()[\]\\,;:"'=]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,63}/gu;

export async function matchable(text = ""): Promise<Matchable[]> {
  const found: Matchable[] = [];
  let after: string | undefined;
  for (let page = 0; page < 4; page++) {
    const answer = await members.list({ limit: 500, ...(after ? { after } : {}) });
    for (const m of answer.members) {
      if (m.role !== null) found.push({ id: m.id, name: m.name, firstName: m.firstName, lastName: m.lastName });
    }
    if (!answer.next) break;
    after = answer.next;
  }
  // Folded lines (an .ics file's) are unfolded first: an address may span two.
  const addresses = [...new Set((text.replace(/\r?\n[ \t]/gu, "").match(addressIn) ?? []).map(a => a.toLowerCase()))];
  if (addresses.length === 0) return found;
  let matched: Record<string, string> = {};
  try {
    matched = await members.matchEmails(addresses);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return found;
  }
  const byId = new Map(found.map(p => [p.id, p]));
  const extra: Matchable[] = [];
  for (const [address, id] of Object.entries(matched)) {
    const person = byId.get(id);
    // A member with two matched addresses (two spellings in the file) is
    // listed once more for the second.
    if (person && !person.email) person.email = address;
    else if (person) extra.push({ ...person, email: address });
  }
  return [...found, ...extra];
}
