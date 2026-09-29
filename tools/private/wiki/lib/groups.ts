import { ChestError } from "@argentic/chest-sdk/errors";
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

// The people who have the editor role (the only ones a space can name as
// its editors), by name. Without an answer from the Chest, none.
export async function editorsOfTool(): Promise<{ id: string; name: string }[]> {
  const found: { id: string; name: string }[] = [];
  try {
    let after: string | undefined;
    do {
      const page = await members.list({ role: "editor", limit: 500, ...(after ? { after } : {}) });
      found.push(...page.members.map(m => ({ id: m.id, name: m.name })));
      after = page.next ?? undefined;
    } while (after && found.length < 2000);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return found;
}
