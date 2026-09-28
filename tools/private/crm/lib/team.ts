import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";
import { AppError } from "./errors.ts";

// The team as the Chest knows it: who may own a deal, a company, a contact
// or a next step (a manager or a salesperson who has the tool now), and who
// the managers are (told when someone leaves).
export type Teammate = { id: string; name: string; photo: string | null; role: string };
const working = new Set(["manager", "sales"]);

// team lists, by name, the people who may own things (500 a page, up to
// 2,000). When the Chest cannot be asked, the pickers show nobody.
export async function team(): Promise<Teammate[]> {
  const found: Teammate[] = [];
  try {
    let after: string | undefined;
    for (let page = 0; page < 4; page++) {
      const answer = await members.list({ limit: 500, ...(after ? { after } : {}) });
      for (const m of answer.members) if (m.role && working.has(m.role)) found.push({ id: m.id, name: m.name, photo: m.photo, role: m.role });
      if (!answer.next) break;
      after = answer.next;
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return found;
}

// assignable refuses an owner who does not have the tool with a role that
// works on clients. The actor themselves always may (they are here).
export async function checkAssignable(memberId: string | null, actorId: string): Promise<void> {
  if (memberId === null || memberId === actorId) return;
  try {
    const answer = await members.lookup([memberId]);
    const found = answer.members.find(m => m.id === memberId);
    if (!found || !found.role || !working.has(found.role)) throw new AppError("invalid");
  } catch (error) {
    if (error instanceof ChestError) throw new AppError("unavailable");
    throw error;
  }
}

// managers: the ids of the managers, to tell them what needs a new owner.
export async function managers(): Promise<string[]> {
  try {
    const ids: string[] = [];
    let after: string | undefined;
    for (let page = 0; page < 4; page++) {
      const answer = await members.list({ role: "manager", limit: 500, ...(after ? { after } : {}) });
      ids.push(...answer.members.map(m => m.id));
      if (!answer.next) break;
      after = answer.next;
    }
    return ids;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return [];
  }
}
