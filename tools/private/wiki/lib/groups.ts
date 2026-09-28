import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";

// The groups that give the wiki (for a space kept to some of them), by
// name. Without an answer from the Chest, none: the page still works.
export async function groupsOfTool(): Promise<{ id: string; name: string }[]> {
  try {
    return (await members.groups.list()).map(g => ({ id: g.id, name: g.name })).sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return [];
  }
}
