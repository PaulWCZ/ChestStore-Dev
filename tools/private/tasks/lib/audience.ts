import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";
import { boardAccess } from "./access.ts";
import type { Board } from "./boards.ts";

// The people a board's cards may be given to, or who may be mentioned on
// it: those who see it (a role in Tasks, and the board open to them). For
// the pickers of a page: names and photos, by name. The Chest is asked a
// page of 500 at a time, up to 2,000 people.
export type Person = { id: string; name: string; photo: string | null };

export async function boardAudience(b: Pick<Board, "visibility" | "people" | "groups">): Promise<Person[]> {
  const found: Person[] = [];
  try {
    let after: string | undefined;
    for (let page = 0; page < 4; page++) {
      const answer = await members.list({ limit: 500, ...(after ? { after } : {}) });
      for (const m of answer.members) if (boardAccess(m, b) !== "none") found.push({ id: m.id, name: m.name, photo: m.photo });
      if (!answer.next) break;
      after = answer.next;
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return found;
}

// The groups that give Tasks, for a private board's settings.
export async function groupsOfTool(): Promise<{ id: string; name: string }[]> {
  try {
    return (await members.groups.list()).map(g => ({ id: g.id, name: g.name }));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return [];
  }
}
