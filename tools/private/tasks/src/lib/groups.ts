import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";

// The groups a private board may be shared with.
//
// With the capability "members.groups" (Proposal (studio), announced for
// the official 0.5; chest.proposals.json) a private board may be shared
// with any group of the Chest (Sales, Office), and every member the Chest
// gives Tasks — member(request), members.list/lookup — carries every group
// of the Chest they are in: whether someone sees a board is read from the
// member, never kept here. Without the capability, the groups that give
// Tasks only (0.4.1's). The list of groups is kept a minute, per Chest API
// (the tests start many), and forgotten when the Chest says a group
// changed (events).
const keep = 60_000;
type Kept<T> = { at: number; api: string | undefined; value: T };
let offered: Kept<{ id: string; name: string }[]> | null = null;

const fresh = <T>(kept: Kept<T> | null | undefined): kept is Kept<T> => !!kept && kept.api === process.env["CHEST_API"] && Date.now() - kept.at < keep;

export function forgetGroups(): void {
  offered = null;
}

// The groups a private board may be shared with, by name: every group of
// the Chest with the capability, else those that give Tasks; null when the
// Chest does not answer (the page says the list could not be read).
export async function sharingGroups(): Promise<{ id: string; name: string }[] | null> {
  if (fresh(offered)) return offered.value;
  let found: { id: string; name: string }[];
  try {
    found = (await members.groups.all()).map(g => ({ id: g.id, name: g.name }));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    try {
      found = (await members.groups.list()).map(g => ({ id: g.id, name: g.name }));
    } catch (inner) {
      if (!(inner instanceof ChestError)) throw inner;
      return null;
    }
  }
  found.sort((a, b) => a.name.localeCompare(b.name));
  offered = { at: Date.now(), api: process.env["CHEST_API"], value: found };
  return found;
}
