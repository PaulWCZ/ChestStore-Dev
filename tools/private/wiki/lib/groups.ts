import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";

// The Chest's groups the wiki offers — for a space kept to some of them,
// edited by some of them, or asked to confirm a page — by name. With the
// "groups" permission (Proposal (studio): "groups": "read", as News) the
// wiki sees every group of the Chest (Sales, Tech, the warehouse) even
// when it is open to everyone; without it, only the groups that give the
// wiki (the usual wiki, open to all, then has none). Without an answer
// from the Chest, none: the page still works. Kept a minute (the SDK's
// advice), per Chest API (the tests start many).
export type Group = { id: string; name: string };
let cached: { at: number; api: string | undefined; groups: Group[] } | null = null;

export async function companyGroups(): Promise<Group[]> {
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

// A group changed or was removed (events): read them again.
export function forgetGroups(): void {
  cached = null;
}

// The members who have the wiki (with a role, or none), by name: all of
// them, or those of one role. Without an answer from the Chest, none.
export async function membersOfTool(options: { role?: string } = {}): Promise<Member[]> {
  const found: Member[] = [];
  try {
    let after: string | undefined;
    do {
      const page = await members.list({ limit: 500, ...(options.role ? { role: options.role } : {}), ...(after ? { after } : {}) });
      found.push(...page.members);
      after = page.next ?? undefined;
    } while (after && found.length < 5000);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return found;
}

// The people who have the editor role (the only ones a space can name as
// its editors), by name.
export async function editorsOfTool(): Promise<{ id: string; name: string }[]> {
  return (await membersOfTool({ role: "editor" })).map(m => ({ id: m.id, name: m.name }));
}
