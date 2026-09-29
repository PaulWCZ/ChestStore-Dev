import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { inAudience, type Audience } from "./access.ts";

// Everyone who has News with a role: the readers of the company's front
// page. The Chest answers 500 at a time; News reads up to 10,000 people.
// groups: their groups (all of them with the "groups" permission; those
// that give News without it) — a post's audience.
export type Reader = { id: string; name: string; photo: string | null; locale: Locale; role: string | null; groups: string[] };

export const pageSize = 500;
export const maxPages = 20;

export type Page = { people: Reader[]; next: string | null };

// page reads one page of members after a cursor (null: from the start).
export async function page(after: string | null): Promise<Page> {
  const answer = await members.list({ limit: pageSize, ...(after ? { after } : {}) });
  return {
    people: answer.members.filter(m => m.role !== null).map(m => ({ id: m.id, name: m.name, photo: m.photo, locale: m.locale, role: m.role, groups: m.groups })),
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
    return (await members.get(memberId)) !== null;
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

// reach counts, among a post's audience (not its author), how many came to
// News after it was published — any page, never which (lib/posts.ts,
// touch). Counts only: never who (README, "Works council").
export function reach(post: Audience & { author: string; publishAt: string }, people: Reader[], activity: Map<string, Date>): { came: number; total: number } {
  const audience = people.filter(p => p.id !== post.author && inAudience(p, post));
  const since = new Date(post.publishAt).getTime();
  return { came: audience.filter(p => (activity.get(p.id)?.getTime() ?? 0) >= since).length, total: audience.length };
}
