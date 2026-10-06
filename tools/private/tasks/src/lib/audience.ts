import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";
import { boardAccess } from "./access.ts";
import { sharingGroups } from "./groups.ts";
import type { Board } from "./boards.ts";
import { format, listFormat, type Catalogue, type Locale } from "../i18n/index.ts";

// The people a board's cards may be given to, or who may be mentioned on
// it: those who see it (a role in Tasks, and the board open to them). For
// the pickers of a page: names and photos, by name. The Chest is asked a
// page of 500 at a time, every page (no cap of our own: the company's size
// is the only limit). null when the Chest does not answer: the page says
// the list could not be read rather than showing an empty picker.
export type Person = { id: string; name: string; photo: string | null };

export async function boardAudience(b: Pick<Board, "visibility" | "people" | "groups">): Promise<Person[] | null> {
  const found: Person[] = [];
  try {
    let after: string | undefined;
    const seen = new Set<string>();
    for (;;) {
      const answer = await members.list({ limit: 500, ...(after ? { after } : {}) });
      for (const m of answer.members) if (boardAccess(m, b) !== "none") found.push({ id: m.id, name: m.name, photo: m.photo });
      // A cursor seen twice would loop for ever: what was read is kept.
      if (!answer.next || seen.has(answer.next)) break;
      seen.add(answer.next);
      after = answer.next;
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return null;
  }
  return found;
}

// The groups a private board may be shared with (lib/groups.ts).
export const groupsOfTool = sharingGroups;

// Whom a new private board may be shared with: everyone who has Tasks but
// the creator, and the Chest's groups; unreadable when the Chest did not
// answer for either.
export type Sharing = { people: Person[]; groups: { id: string; name: string }[]; unreadable: boolean };

export async function sharingFor(memberId: string): Promise<Sharing> {
  const [people, groups] = await Promise.all([boardAudience({ visibility: "team", people: [], groups: [] }), groupsOfTool()]);
  return { people: (people ?? []).filter(p => p.id !== memberId), groups: groups ?? [], unreadable: people === null || groups === null };
}

export const noSharing: Sharing = { people: [], groups: [], unreadable: false };

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
  return found.length > 0 ? format(t.home.nothingShared.body, { names: listFormat(locale, "disjunction").format(found) }) : t.home.nothingShared.anyone;
}
