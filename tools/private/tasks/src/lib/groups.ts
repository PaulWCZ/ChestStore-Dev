import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";

// The groups a private board may be shared with, and the groups of a member.
//
// With the capability "members.groups" (chest.json, SDK 0.5+) a private
// board may be shared with any group of the Chest (Sales, Office), and
// every member the Chest gives Tasks — member(request), members.list/lookup
// — carries every group of the Chest they are in: whether someone sees a
// board is read from the member, never kept here. A member in more groups
// than an assertion carries (about 150) comes with `groups: null`: their
// groups are then asked with members.get (withGroups).
//
// The list of groups is read a page at a time (no count bounds a team) and
// kept a minute, per Chest API (the tests start many); a member's groups
// changing is member.updated {changed: ["groups"]}, and a group renamed is
// read again after the minute (SDK 0.5+: no group events).
const keep = 60_000;
type Kept<T> = { at: number; api: string | undefined; value: T };
let offered: Kept<{ id: string; name: string }[]> | null = null;
const memberGroups = new Map<string, Kept<string[]>>();

const fresh = <T>(kept: Kept<T> | null | undefined): kept is Kept<T> => !!kept && kept.api === process.env["CHEST_API"] && Date.now() - kept.at < keep;

export function forgetGroups(): void {
  offered = null;
  memberGroups.clear();
}

// The groups a private board may be shared with, by name: every group of
// the Chest; null when the Chest does not answer (the page says the list
// could not be read).
export async function sharingGroups(): Promise<{ id: string; name: string }[] | null> {
  if (fresh(offered)) return offered.value;
  const found: { id: string; name: string }[] = [];
  try {
    const seen = new Set<string>();
    let after: string | undefined;
    for (;;) {
      const page = await members.groups.list({ limit: 500, ...(after ? { after } : {}) });
      for (const g of page.groups) found.push({ id: g.id, name: g.name });
      // A cursor seen twice would loop for ever: what was read is kept.
      if (!page.next || seen.has(page.next)) break;
      seen.add(page.next);
      after = page.next;
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return null;
  }
  found.sort((a, b) => a.name.localeCompare(b.name));
  offered = { at: Date.now(), api: process.env["CHEST_API"], value: found };
  return found;
}

export type Grouped<M extends Member> = Omit<M, "groups"> & { groups: string[] };

// withGroups gives a member their groups when the Chest sent `null` (more
// groups than an assertion carries): asked with members.get, kept a
// minute. When the Chest does not answer, no group — the safe answer (a
// board shared with a group stays closed to them until it answers).
export async function withGroups<M extends Member>(who: M): Promise<Grouped<M>> {
  if (who.groups !== null) return who as Grouped<M>;
  const kept = memberGroups.get(who.id);
  if (fresh(kept)) return { ...who, groups: kept.value };
  let groups: string[] = [];
  try {
    groups = (await members.get(who.id))?.groups ?? [];
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return { ...who, groups };
  }
  if (memberGroups.size > 1000) memberGroups.clear();
  memberGroups.set(who.id, { at: Date.now(), api: process.env["CHEST_API"], value: groups });
  return { ...who, groups };
}

// The same for a list of members (the pickers, the morning, the calendars).
export const allWithGroups = <M extends Member>(list: M[]): Promise<Grouped<M>[]> => Promise.all(list.map(m => withGroups(m)));
