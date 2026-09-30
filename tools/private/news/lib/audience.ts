import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import { localeOf, type Locale } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { inAudience, type Audience } from "./access.ts";
import { withAllGroups } from "./groups.ts";

// Everyone who has News with a role: the readers of the company's front
// page. The Chest answers 500 at a time; News reads up to 10,000 people.
// groups: their groups (all of them with the "groups" permission, asked
// of the Chest: lib/groups.ts; those that give News without it) — a post's
// audience.
export type Reader = { id: string; name: string; photo: string | null; locale: Locale; role: string | null; groups: string[] };

export const pageSize = 500;
export const maxPages = 20;

export type Page = { people: Reader[]; next: string | null };

// page reads one page of members after a cursor (null: from the start).
export async function page(after: string | null): Promise<Page> {
  const answer = await members.list({ limit: pageSize, ...(after ? { after } : {}) });
  return {
    people: await withAllGroups(answer.members.filter(m => m.role !== null).map(m => ({ id: m.id, name: m.name, photo: m.photo, locale: localeOf(m.language), role: m.role, groups: m.groups }))),
    next: answer.next,
  };
}

// everyone reads every page; complete is false when the Chest could not be
// asked (not granted, unreachable) or the company is larger than News reads.
export async function everyone(): Promise<{ people: Reader[]; complete: boolean }> {
  const people: Reader[] = [];
  let after: string | null = null;
  try {
    for (let i = 0; i < maxPages; i++) {
      const p: Page = await page(after);
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

// hasTool says whether this member has News now (a welcome names only a
// colleague who does). Unavailable when the Chest cannot be asked.
export async function hasTool(memberId: string): Promise<boolean | "unavailable"> {
  try {
    // A role gives News; without one, the Chest lists them but they cannot read it.
    const person = await members.get(memberId);
    return person !== null && person.role !== null;
  } catch (error) {
    if (error instanceof CapabilityNotGranted || error instanceof ChestError) return "unavailable";
    throw error;
  }
}

// haveTool says which of these members have News now (a post kept to
// people names only colleagues who do). Unavailable when the Chest cannot
// be asked.
export async function haveTool(ids: string[]): Promise<Set<string> | "unavailable"> {
  try {
    return new Set((await members.lookup(ids)).members.map(m => m.id));
  } catch (error) {
    if (error instanceof ChestError) return "unavailable";
    throw error;
  }
}

// tally is who confirmed an Important post and who has not yet, counted on
// its audience only: a confirmation left by someone it is no longer for
// (its groups changed, or theirs) is not counted; someone who left the
// Chest stays in the record. Its author is never asked.
export function tally<C extends { member: string }>(post: Audience & { author: string }, confirmed: C[], people: Reader[]): { confirmed: C[]; pending: Reader[] } {
  const byId = new Map(people.map(p => [p.id, p]));
  const counted = confirmed.filter(c => {
    const person = byId.get(c.member);
    return !person || inAudience(person, post);
  });
  const done = new Set(counted.map(c => c.member));
  return { confirmed: counted, pending: people.filter(p => p.id !== post.author && inAudience(p, post) && !done.has(p.id)) };
}

// audienceSize counts the people a post is for (not its author): what
// "Read by" and views are counted against.
export function audienceSize(post: Audience & { author: string }, people: Reader[]): number {
  return people.filter(p => p.id !== post.author && inAudience(p, post)).length;
}

// Who a reader may ask to publish: the publishers, by name — at most
// three, the Chest's administrators last (they are rarely the ones to
// ask). Without an answer from the Chest, none.
export async function whoPublishes(): Promise<{ names: string[]; more: boolean }> {
  try {
    const answer = await members.list({ limit: 500, role: "publisher" });
    const list = [...answer.members].sort((a, b) => Number(a.isAdmin) - Number(b.isAdmin) || a.name.localeCompare(b.name));
    return { names: list.slice(0, 3).map(m => m.name), more: list.length > 3 || answer.next !== null };
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return { names: [], more: false };
  }
}

// The publishers' ids (up to 10,000): who approves the posts proposed by
// everyone. None when the Chest cannot be asked.
export async function publisherIds(): Promise<string[]> {
  const ids: string[] = [];
  let after: string | null = null;
  try {
    for (let i = 0; i < maxPages; i++) {
      const answer = await members.list({ limit: pageSize, role: "publisher", ...(after ? { after } : {}) });
      ids.push(...answer.members.map(m => m.id));
      if (!answer.next) break;
      after = answer.next;
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return ids;
}
