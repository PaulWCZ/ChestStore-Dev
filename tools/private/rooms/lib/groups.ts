import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";

// The Chest's groups — Sales, Tech, the workshop — by name: the teams of
// "Who's where" and the groups a room or an area may be kept for. With the
// "groups" permission (Proposal (studio): "groups": "read") Rooms sees every
// group of the Chest; without it, only the groups that give Rooms (none
// when Rooms is open to everyone). Empty when the Chest could not be asked:
// the pages work without teams.
export type Group = { id: string; name: string };

// Kept a minute (the SDK's advice), per Chest API (tests start many).
let cached: { at: number; api: string | undefined; groups: Group[] } | null = null;
let inGroups: { at: number; api: string | undefined; of: Map<string, string[]> } | null = null;

// Forgets what is kept (a member's groups changed: member.updated).
export function forgetGroups(): void {
  cached = null;
  inGroups = null;
}

// Every group one member is in — not only the groups that give Rooms,
// which is all that member(request).groups and the members API say (SDK
// 0.3.0: at most 16, none when Rooms is open to everyone). With "groups":
// "read", the Chest answers members.groups.of(id); without it, or when it
// cannot be asked, the groups it gave with the member (given). Asked
// fresh: it decides who may book a place kept for a group.
export async function groupsOf(member: { id: string; groups: readonly string[] }): Promise<string[]> {
  try {
    return (await members.groups.of(member.id)) ?? [];
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return [...member.groups];
  }
}

// Who is in which group, for pages that show many people ("Who's where",
// the teams): member id → every group they are in, among the members who
// have Rooms. From members.groups.members of each group (every group of
// the Chest, with "groups": "read"), else the groups that give Rooms with
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
          const page = await members.groups.members(g.id, { limit: 1000, ...(after ? { after } : {}) });
          if (!page) break;
          for (const id of page.members) add(id, g.id);
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
