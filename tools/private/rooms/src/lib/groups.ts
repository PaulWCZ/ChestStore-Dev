import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";

// The Chest's groups — Sales, Tech, the workshop — by name: the teams of
// "Who's where" and the groups a room or an area may be kept for. With the
// "members.groups" capability (SDK 0.7.0, chest.json) Rooms sees every
// group of the Chest; without it (an owner who refused it), only the groups
// that give Rooms (none when Rooms is open to everyone). Empty when the
// Chest could not be asked: the pages work without teams.
export type Group = { id: string; name: string };

// Kept a minute (the SDK's advice), per Chest API (tests start many).
let cached: { at: number; api: string | undefined; groups: Group[] } | null = null;
let inGroups: { at: number; api: string | undefined; of: Map<string, string[]> } | null = null;

// Forgets what is kept: someone moved between groups (member.updated with
// changed: ["groups"], the lifecycle's handler) — the groups and each
// member's are read again. A renamed group is read again within a minute
// (0.7.0 has no group events: names are read at render).
export function forgetGroups(): void {
  cached = null;
  inGroups = null;
  memberGroups.clear();
}

// Every group one member is in. With "members.groups", the members API
// answers every group of the Chest the member is in (members.get);
// without it, the groups that give Rooms (none when Rooms is open to
// everyone); when the Chest cannot be asked, the groups it gave with the
// member (given; null past about 150 groups, SDK 0.7.0: then none is
// assumed until the Chest answers). It decides who may book a place kept
// for a group, and every page asks it: kept a minute per member, forgotten
// on the events above; a stale answer serves while the Chest says "too
// many" or cannot be reached.
const memberGroups = new Map<string, { at: number; api: string | undefined; groups: string[] }>();

export async function groupsOf(member: { id: string; groups: readonly string[] | null }): Promise<string[]> {
  const api = process.env["CHEST_API"];
  const kept = memberGroups.get(member.id);
  const usable = kept && kept.api === api ? kept : undefined;
  if (usable && Date.now() - usable.at < 60_000) return usable.groups;
  try {
    const groups = (await members.get(member.id))?.groups ?? [...(member.groups ?? [])];
    if (memberGroups.size >= 5000) memberGroups.clear();
    memberGroups.set(member.id, { at: Date.now(), api, groups });
    return groups;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return usable ? usable.groups : [...(member.groups ?? [])];
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
    for (const g of await allGroups()) {
      let after: string | undefined;
      do {
        const page = await members.list({ group: g.id, limit: 500, ...(after ? { after } : {}) });
        for (const m of page.members) add(m.id, g.id);
        after = page.next ?? undefined;
      } while (after);
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
    groups = await allGroups();
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return [];
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  cached = { at: Date.now(), api: process.env["CHEST_API"], groups };
  return groups;
}

// Every group Rooms may see, page after page (SDK 0.7.0: groups.list is
// paged, no count bounds a company's groups): with "members.groups" every
// group of the Chest, without it the groups that give Rooms.
async function allGroups(): Promise<Group[]> {
  const all: Group[] = [];
  let after: string | undefined;
  do {
    const page = await members.groups.list({ limit: 500, ...(after ? { after } : {}) });
    for (const g of page.groups) all.push({ id: g.id, name: g.name });
    after = page.next ?? undefined;
  } while (after);
  return all;
}
