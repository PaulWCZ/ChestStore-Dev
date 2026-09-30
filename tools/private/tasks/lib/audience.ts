import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";
import { boardAccess } from "./access.ts";
import { sharingGroups, withGroupsAmong } from "./groups.ts";
import type { Board } from "./boards.ts";
import { format, intl, type Catalogue, type Locale } from "./i18n/index.ts";

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
      for (const m of await withGroupsAmong(answer.members, b.groups)) if (boardAccess(m, b) !== "none") found.push({ id: m.id, name: m.name, photo: m.photo });
      if (!answer.next) break;
      after = answer.next;
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return found;
}

// The groups a private board may be shared with (lib/groups.ts).
export const groupsOfTool = sharingGroups;

// Whom a new private board may be shared with: everyone who has Tasks but
// the creator, and the Chest's groups.
export async function sharingFor(memberId: string): Promise<{ people: Person[]; groups: { id: string; name: string }[] }> {
  const [people, groups] = await Promise.all([boardAudience({ visibility: "team", people: [], groups: [] }), groupsOfTool()]);
  return { people: people.filter(p => p.id !== memberId), groups };
}

// The managers' names, for "ask a manager" (at most three).
export async function managerNames(): Promise<string[]> {
  try {
    const answer = await members.list({ limit: 500 });
    return answer.members.filter(m => m.role === "manager").slice(0, 3).map(m => m.name);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return [];
  }
}

// Who to ask for a board, by name when the Chest says who the managers are
// (the empty home and Boards pages of someone nothing is shared with).
export async function askWho(t: Catalogue, locale: Locale): Promise<string> {
  const found = await managerNames();
  return found.length > 0 ? format(t.home.nothingShared.body, { names: new Intl.ListFormat(intl(locale), { type: "disjunction" }).format(found) }) : t.home.nothingShared.anyone;
}
