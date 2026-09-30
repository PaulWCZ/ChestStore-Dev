import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";

// Which groups people are in, for a private board shared with groups.
//
// A member's `groups` (member(request), members.*) are only the groups
// that *give* Tasks, 16 at most (SDK 0.3.0). Tasks is usually open to
// everyone, so no group gives it: with the "groups" permission (Proposal
// (studio): "groups": "read") a private board may be shared with any group
// of the Chest (Sales, Office), and whether someone is in it is asked of
// the Chest — members.groups.of(id) for the person signed in,
// members.groups.members(group) for the people of a list. Without the
// permission, or without an answer, the member's own groups are the answer
// (0.3.0's). Answers are kept a minute (the SDK's advice), per Chest API
// (the tests start many), and forgotten when the Chest says a member or a
// group changed (events).
const keep = 60_000;
type Kept<T> = { at: number; api: string | undefined; value: T };
const ofMember = new Map<string, Kept<string[] | null>>();
const ofGroup = new Map<string, Kept<Set<string> | null>>();
let offered: Kept<{ id: string; name: string }[]> | null = null;

const fresh = <T>(kept: Kept<T> | null | undefined): kept is Kept<T> => !!kept && kept.api === process.env["CHEST_API"] && Date.now() - kept.at < keep;
const keepIt = <T>(value: T): Kept<T> => ({ at: Date.now(), api: process.env["CHEST_API"], value });

export function forgetGroups(): void {
  ofMember.clear();
  ofGroup.clear();
  offered = null;
}

// Every group of this member: theirs from the Chest, else those that give
// the tool (what the member already carries).
export async function withGroups<T extends { id: string; groups: string[] }>(who: T): Promise<T> {
  let kept = ofMember.get(who.id);
  if (!fresh(kept)) {
    let value: string[] | null;
    try {
      value = await members.groups.of(who.id);
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      value = null;
    }
    kept = keepIt(value);
    ofMember.set(who.id, kept);
  }
  return kept.value ? { ...who, groups: [...new Set([...who.groups, ...kept.value])] } : who;
}

// The members of one group who have the tool; null when the Chest does not
// say (no permission, unavailable). A group the Chest no longer has is
// empty.
async function membersOf(groupId: string): Promise<Set<string> | null> {
  const kept = ofGroup.get(groupId);
  if (fresh(kept)) return kept.value;
  let value: Set<string> | null = new Set();
  try {
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const answer = await members.groups.members(groupId, { limit: 1000, ...(after ? { after } : {}) });
      if (!answer) break;
      for (const id of answer.members) value.add(id);
      if (!answer.next) break;
      after = answer.next;
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    value = null;
  }
  ofGroup.set(groupId, keepIt(value));
  return value;
}

// These people with the groups among `groupIds` they are in (the groups a
// board is shared with): one call per group, not per person.
export async function withGroupsAmong<T extends { id: string; groups: string[] }>(people: T[], groupIds: Iterable<string>): Promise<T[]> {
  const wanted = [...new Set(groupIds)];
  if (wanted.length === 0 || people.length === 0) return people;
  const extra = new Map<string, string[]>();
  for (const g of wanted) {
    const inside = await membersOf(g);
    if (!inside) continue;
    for (const id of inside) extra.set(id, [...(extra.get(id) ?? []), g]);
  }
  return people.map(p => (extra.has(p.id) ? { ...p, groups: [...new Set([...p.groups, ...extra.get(p.id)!])] } : p));
}

// The groups a private board may be shared with, by name: every group of
// the Chest with the permission, else those that give Tasks; none without
// an answer.
export async function sharingGroups(): Promise<{ id: string; name: string }[]> {
  if (fresh(offered)) return offered.value;
  let found: { id: string; name: string }[];
  try {
    found = (await members.groups.all()).map(g => ({ id: g.id, name: g.name }));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    try {
      found = (await members.groups.list()).map(g => ({ id: g.id, name: g.name }));
    } catch (inner) {
      if (!(inner instanceof ChestError)) throw inner;
      return [];
    }
  }
  found.sort((a, b) => a.name.localeCompare(b.name));
  offered = keepIt(found);
  return found;
}
