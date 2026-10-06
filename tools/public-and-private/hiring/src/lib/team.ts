import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";

// The members who have the tool, for a picker (interviewers, feedback):
// their id, name, photo and role here. Empty when the Chest cannot be
// asked: the page still renders.
export type Teammate = { id: string; name: string; photo: string | null; role: string | null };

export async function teammates(): Promise<Teammate[]> {
  const found: Teammate[] = [];
  try {
    let after: string | undefined;
    for (let page = 0; page < 4; page++) {
      const answer = await members.list({ limit: 500, ...(after ? { after } : {}) });
      found.push(...answer.members.map(m => ({ id: m.id, name: m.name, photo: m.photo, role: m.role })));
      if (!answer.next) break;
      after = answer.next;
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return found;
}
