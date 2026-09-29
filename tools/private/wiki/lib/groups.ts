import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";

// The groups that give the wiki (for a space kept to some of them, or
// edited by some of them), by
// name. Without an answer from the Chest, none: the page still works.
export async function groupsOfTool(): Promise<{ id: string; name: string }[]> {
  try {
    return (await members.groups.list()).map(g => ({ id: g.id, name: g.name })).sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return [];
  }
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
