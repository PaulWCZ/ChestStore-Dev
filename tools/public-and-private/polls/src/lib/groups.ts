import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";

// The Chest's groups, by name (adapted from the store's News tool). With
// the capability "members.groups" (Proposal (studio), the name announced
// for the official 0.5) Polls sees every group of the Chest — Sales, Tech,
// the workshop — even when Polls is open to everyone: a poll may ask one of
// them, and an anonymous survey's results may be read per group
// (lib/teams.ts). With it, the Chest names every group a member is in
// (member(request).groups, members.list's groups), so a member's groups are
// read from the Chest's own answers, never asked again. Without it, only
// the groups that give Polls (the Chest shows a tool no other group). Null
// when the Chest could not be asked.
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

// forgetGroups: a group changed or was removed (events): its name and size
// are read again.
export function forgetGroups(): void {
  cached = null;
}

// groupMembers: who is in each of these groups now (among those who have
// Polls: members.list({group})), to tell a group inside another one apart
// (lib/teams.ts). Null when the Chest cannot say for one of them.
export async function groupMembers(ids: readonly string[]): Promise<Map<string, Set<string>> | null> {
  const out = new Map<string, Set<string>>();
  try {
    for (const id of ids) {
      const found = new Set<string>();
      let after: string | undefined;
      for (let i = 0; i < 20; i++) {
        const page = await members.list({ group: id, limit: 500, ...(after ? { after } : {}) });
        for (const m of page.members) found.add(m.id);
        if (!page.next) break;
        after = page.next;
      }
      out.set(id, found);
    }
    return out;
  } catch (error) {
    if (error instanceof ChestError) return null;
    throw error;
  }
}
