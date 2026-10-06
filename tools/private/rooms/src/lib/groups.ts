import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";

// The Chest's groups — Sales, Tech, the workshop — by name: the teams of
// "Who's where" and the groups a room or an area may be kept for. With the
// "members.groups" capability (Proposal (studio), announced for the
// official 0.5: chest.proposals.json "capabilities": ["members.groups"])
// Rooms sees every group of the Chest; without it, only the groups that
// give Rooms (none when Rooms is open to everyone). Empty when the Chest could not be asked:
// the pages work without teams.
export type Group = { id: string; name: string };

// Kept a minute (the SDK's advice), per Chest API (tests start many).
let cached: { at: number; api: string | undefined; groups: Group[] } | null = null;
let inGroups: { at: number; api: string | undefined; of: Map<string, string[]> } | null = null;

// Forgets what is kept: a group changed or was removed, or someone moved
// between groups (group.changed, group.removed, member.updated: the
// lifecycle's handlers) — the groups and each member's are read again.
export function forgetGroups(): void {
  cached = null;
  inGroups = null;
  memberGroups.clear();
}

// Every group one member is in. With "members.groups", the members API
// answers every group of the Chest the member is in (members.get);
// without it, the groups that give Rooms (none when Rooms is open to
// everyone); when the Chest cannot be asked, the groups it gave with the
// member (given). (The official 0.4.1 parser refuses a member listed in
// more than 16 groups: such a member then falls back to given.) It decides
// who may book a place kept for a group, and every page asks it: kept a
// minute per member (pages refresh themselves every 20 s, within the
// members' 600 calls a minute), forgotten on the events above; a stale
// answer serves while the Chest says "too many" or cannot be reached.
const memberGroups = new Map<string, { at: number; api: string | undefined; groups: string[] }>();

export async function groupsOf(member: { id: string; groups: readonly string[] }): Promise<string[]> {
  const api = process.env["CHEST_API"];
  const kept = memberGroups.get(member.id);
  const usable = kept && kept.api === api ? kept : undefined;
  if (usable && Date.now() - usable.at < 60_000) return usable.groups;
  try {
    const groups = (await members.get(member.id))?.groups ?? [...member.groups];
    if (memberGroups.size >= 5000) memberGroups.clear();
    memberGroups.set(member.id, { at: Date.now(), api, groups });
    return groups;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return usable ? usable.groups : [...member.groups];
  }
}

// Who is in which group, for pages that show many people ("Who's where",
// the teams): member id → every group they are in, among the members who
// have Rooms. From members.list({ group }) of each group (every group of
// the Chest, with "members.groups"), else the groups that give Rooms with
// their members. Kept a minute; empty when the Chest could not be asked.
export async function membership(): Promise<Map<string, string[]>> {
  if (inGroups && inGroups.api === process.env["CHEST_API"] && Date.now() - inGroups.at < 60_000) return inGroups.of;
  const of = new Map<string, string[]>();
  const add = (member: string, group: string) => of.set(member, [...(of.get(member) ?? []), group]);
  try {
    try {
      for (const g of await members.groups.all()) {
        let after: string | undefined;
        do {
          const page = await members.list({ group: g.id, limit: 500, ...(after ? { after } : {}) });
          for (const m of page.members) add(m.id, g.id);
          after = page.next ?? undefined;
        } while (after);
      }
    } catch (error) {
      if (!(error instanceof CapabilityNotGranted)) throw error;
      of.clear();
      for (const g of await members.groups.list()) for (const id of g.members) add(id, g.id);
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return new Map();
  }
  inGroups = { at: Date.now(), api: process.env["CHEST_API"], of };
  return of;
}

export async function chestGroups(): Promise<Group[]> {
  if (cached && cached.api === process.env["CHEST_API"] && Date.now() - cached.at < 60_000) return cached.groups;
  let groups: Group[];
  try {
    groups = (await members.groups.all()).map(g => ({ id: g.id, name: g.name }));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    if (!(error instanceof CapabilityNotGranted)) return [];
    try {
      groups = (await members.groups.list()).map(g => ({ id: g.id, name: g.name }));
    } catch (inner) {
      if (!(inner instanceof ChestError)) throw inner;
      return [];
    }
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  cached = { at: Date.now(), api: process.env["CHEST_API"], groups };
  return groups;
}
