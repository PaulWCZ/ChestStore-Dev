import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";

// The people who have Rooms, by name: for the "invite people" picker and
// "Who's where". The Chest is asked a page of 500 at a time, up to 2,000
// people; q finds the start of a first or last name, accents aside. When
// the Chest does not answer, the page still renders, without the list.
export type Person = { id: string; name: string; firstName: string; photo: string | null; groups: string[] };

export async function directory(q?: string, group?: string): Promise<Person[]> {
  const found: Person[] = [];
  try {
    let after: string | undefined;
    for (let page = 0; page < 4; page++) {
      const answer = await members.list({ limit: 500, ...(after ? { after } : {}), ...(q ? { q } : {}), ...(group ? { group } : {}) });
      for (const m of answer.members) if (m.role !== null) found.push({ id: m.id, name: m.name, firstName: m.firstName || m.name, photo: m.photo, groups: m.groups });
      if (!answer.next) break;
      after = answer.next;
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return found;
}
