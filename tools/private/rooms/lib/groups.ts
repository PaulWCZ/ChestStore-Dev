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
