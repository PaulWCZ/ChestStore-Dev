import { ChestError } from "@argentic/chest-sdk/errors";
import { localeOf, type Locale } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { asked } from "./access.ts";
import { chestGroups } from "./groups.ts";

// Who a poll is put to: the members who have Polls with a role — all of
// them, or those of the poll's groups. Read from the Chest when needed,
// never copied: someone who joins a group later is asked too, someone who
// loses access is no longer counted. The Chest answers 500 at a time; Polls
// reads up to 10,000 people.
export type Person = { id: string; name: string; locale: Locale; role: string | null; groups: string[] };
export type Audience = { everyone: boolean; groups: readonly string[]; people: readonly string[] };

export const pageSize = 500;
export const maxPages = 20;

export type Page = { people: Person[]; next: string | null };

// page reads one page of members after a cursor (null: from the start),
// keeping those the poll asks. A member's groups are those the Chest names
// (every group they are in, with "members.groups": lib/groups.ts).
export async function page(audience: Audience, after: string | null): Promise<Page> {
  const answer = await members.list({ limit: pageSize, ...(after ? { after } : {}) });
  const listed = answer.members.map(m => ({ id: m.id, name: m.name, locale: localeOf(m.language), role: m.role, groups: [...m.groups] }));
  return {
    people: listed.filter(p => asked({ ...p, isAdmin: false }, audience)),
    next: answer.next,
  };
}

// all reads every page; complete is false when the Chest could not be asked
// (not granted, unreachable) or the company is larger than Polls reads.
export async function all(audience: Audience): Promise<{ people: Person[]; complete: boolean }> {
  const people: Person[] = [];
  let after: string | null = null;
  try {
    for (let i = 0; i < maxPages; i++) {
      const p: Page = await page(audience, after);
      people.push(...p.people);
      if (!p.next) return { people, complete: true };
      after = p.next;
    }
    return { people, complete: false };
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return { people, complete: false };
  }
}

// everyone: all who have the tool with a role, once, for a page that counts
// several polls' audiences.
export async function everyone(): Promise<{ people: Person[]; complete: boolean }> {
  return all({ everyone: true, groups: [], people: [] });
}

export const inAudience = (p: Person, audience: Audience): boolean => asked({ ...p, isAdmin: false }, audience);

// findPeople: members who have Polls whose name starts with what was typed,
// for "who is asked: these people".
export async function findPeople(q: string): Promise<{ id: string; name: string }[]> {
  const text = q.trim().slice(0, 60);
  if (text === "") return [];
  try {
    return (await members.list({ q: text, limit: 12 })).members.filter(m => m.role !== null).map(m => ({ id: m.id, name: m.name }));
  } catch (error) {
    if (error instanceof ChestError) return [];
    throw error;
  }
}

// havePolls: of these ids, those of members who have Polls now (null when
// the Chest cannot say).
export async function havePolls(ids: string[]): Promise<string[] | null> {
  if (ids.length === 0) return [];
  try {
    return (await members.lookup(ids)).members.filter(m => m.role !== null).map(m => m.id);
  } catch (error) {
    if (error instanceof ChestError) return null;
    throw error;
  }
}

// The groups a poll may ask, by name: every group of the Chest with
// "members.groups" (Proposal (studio)), else those that give Polls
// (lib/groups.ts). Null when the Chest cannot say.
export async function groups(): Promise<{ id: string; name: string; size: number }[] | null> {
  return chestGroups();
}
