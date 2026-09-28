import { ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { asked } from "./access.ts";

// Who a poll is put to: the members who have Polls with a role — all of
// them, or those of the poll's groups. Read from the Chest when needed,
// never copied: someone who joins a group later is asked too, someone who
// loses access is no longer counted. The Chest answers 500 at a time; Polls
// reads up to 10,000 people.
export type Person = { id: string; name: string; locale: Locale; role: string | null; groups: string[] };
export type Audience = { everyone: boolean; groups: readonly string[] };

export const pageSize = 500;
export const maxPages = 20;

export type Page = { people: Person[]; next: string | null };

// page reads one page of members after a cursor (null: from the start),
// keeping those the poll asks.
export async function page(audience: Audience, after: string | null): Promise<Page> {
  const answer = await members.list({ limit: pageSize, ...(after ? { after } : {}) });
  return {
    people: answer.members
      .map(m => ({ id: m.id, name: m.name, locale: m.locale, role: m.role, groups: m.groups }))
      .filter(p => asked({ ...p, isAdmin: false }, audience)),
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
  return all({ everyone: true, groups: [] });
}

export const inAudience = (p: Person, audience: Audience): boolean => asked({ ...p, isAdmin: false }, audience);

// The groups that give Polls (the Chest shows a tool only these), by name:
// the choices of "who is asked". Null when the Chest cannot say.
export async function groups(): Promise<{ id: string; name: string; size: number }[] | null> {
  try {
    return (await members.groups.list()).map(g => ({ id: g.id, name: g.name, size: g.members.length })).sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if (error instanceof ChestError) return null;
    throw error;
  }
}
