import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";

// The Chest's groups, by name (adapted from the store's News tool). With
// the "groups" permission (Proposal (studio): "groups": "read") Polls sees
// every group of the Chest — Sales, Tech, the workshop — even when Polls is
// open to everyone: a poll may ask one of them, and an anonymous survey's
// results may be read per group (lib/teams.ts). Without it, only the groups
// that give Polls (the Chest shows a tool no other group). Null when the
// Chest could not be asked.
export type Group = { id: string; name: string; size: number };

// Kept a minute (the SDK's advice), per Chest API (tests start many).
let cached: { at: number; api: string | undefined; groups: Group[] } | null = null;

export async function chestGroups(options: { fresh?: boolean } = {}): Promise<Group[] | null> {
  if (!options.fresh && cached && cached.api === process.env["CHEST_API"] && Date.now() - cached.at < 60_000) return cached.groups;
  let groups: Group[];
  try {
    groups = (await members.groups.all()).map(g => ({ id: g.id, name: g.name, size: g.size }));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    if (!(error instanceof CapabilityNotGranted)) return null;
    try {
      groups = (await members.groups.list()).map(g => ({ id: g.id, name: g.name, size: g.members.length }));
    } catch (inner) {
      if (!(inner instanceof ChestError)) throw inner;
      return null;
    }
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  cached = { at: Date.now(), api: process.env["CHEST_API"], groups };
  return groups;
}

// forgetGroups: a group changed or was removed (events): read them again.
export function forgetGroups(): void {
  cached = null;
}

// groupMembers: who is in each of these groups now (among those who have
// Polls), to tell a group inside another one apart (lib/teams.ts). Null
// when the Chest cannot say for one of them.
export async function groupMembers(ids: readonly string[]): Promise<Map<string, Set<string>> | null> {
  const out = new Map<string, Set<string>>();
  try {
    for (const id of ids) {
      const found = new Set<string>();
      let after: string | undefined;
      for (let i = 0; i < 20; i++) {
        const page = await members.groups.members(id, { limit: 1000, ...(after ? { after } : {}) });
        if (!page) break;
        for (const m of page.members) found.add(m);
        if (!page.next) break;
        after = page.next;
      }
      out.set(id, found);
    }
    return out;
  } catch (error) {
    if (error instanceof CapabilityNotGranted) {
      try {
        const list = await members.groups.list();
        for (const g of list) if (ids.includes(g.id)) out.set(g.id, new Set(g.members));
        return ids.every(id => out.has(id)) ? out : null;
      } catch (inner) {
        if (inner instanceof ChestError) return null;
        throw inner;
      }
    }
    if (error instanceof ChestError) return null;
    throw error;
  }
}

// withAllGroups: the member with every group they are in. The Chest's
// assertion (member(request)) and members.* name only the groups that give
// Polls — none when Polls is open to everyone, the usual case — so a poll
// put to Sales asks the Chest who is in Sales (members.groups.of, with the
// "groups" permission). Without that permission, or when the Chest cannot
// say, the groups the Chest gave with the member.
export async function withAllGroups<M extends { id: string; groups: string[] }>(who: M): Promise<M> {
  try {
    const all = await members.groups.of(who.id);
    return all ? { ...who, groups: [...new Set([...who.groups, ...all])] } : who;
  } catch (error) {
    if (error instanceof ChestError) return who;
    throw error;
  }
}

// withGroupsOf: these people with those of these groups they are in added
// (one question per group, not per person: a poll's audience may be
// thousands). The people unchanged when the Chest cannot say.
export async function withGroupsOf<P extends { id: string; groups: string[] }>(people: P[], ids: readonly string[], known?: Map<string, Set<string>> | null): Promise<P[]> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0 || people.length === 0) return people;
  const inGroups = known === undefined ? await groupMembers(wanted) : known;
  if (!inGroups) return people;
  return people.map(p => {
    const extra = wanted.filter(g => inGroups.get(g)?.has(p.id) && !p.groups.includes(g));
    return extra.length === 0 ? p : { ...p, groups: [...p.groups, ...extra] };
  });
}
