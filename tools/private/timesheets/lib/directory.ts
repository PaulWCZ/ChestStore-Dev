import { ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";

// The people who have the tool, as the Chest says now: the rows of the Team
// and People pages, the people one may name on a project, the names an
// import matches. Read from the Chest each time (names are never copied),
// 500 at a time, up to 2,000 people.
export type DirectoryPerson = { id: string; name: string; firstName: string; lastName: string; photo: string | null; role: string | null; groups: string[]; locale: Locale };

export async function everyone(): Promise<DirectoryPerson[]> {
  const found: DirectoryPerson[] = [];
  let after: string | undefined;
  for (let page = 0; page < 4; page++) {
    const answer = await members.list({ limit: 500, ...(after ? { after } : {}) });
    for (const m of answer.members) found.push({ id: m.id, name: m.name, firstName: m.firstName, lastName: m.lastName, photo: m.photo, role: m.role, groups: m.groups, locale: m.locale });
    if (!answer.next) break;
    after = answer.next;
  }
  return found;
}

// everyoneOrNone: for a page, which still renders when the Chest does not
// answer (it says so).
export async function everyoneOrNone(): Promise<{ people: DirectoryPerson[]; reached: boolean }> {
  try {
    return { people: await everyone(), reached: true };
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return { people: [], reached: false };
  }
}

// The managers now (members.list by role): who hears of weeks to approve
// and budgets running out. The Chest not answering: nobody (a bell is a
// courtesy).
export async function managerIds(): Promise<string[]> {
  const found: string[] = [];
  let after: string | undefined;
  try {
    for (let page = 0; page < 4; page++) {
      const answer = await members.list({ role: "manager", limit: 500, ...(after ? { after } : {}) });
      found.push(...answer.members.map(m => m.id));
      if (!answer.next) break;
      after = answer.next;
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return found;
}

// isManager: the member has the tool now, as a manager (a project's lead
// must be one).
export async function isManager(id: string): Promise<boolean> {
  try {
    const m = await members.get(id);
    return m !== null && m.role === "manager";
  } catch (error) {
    if (error instanceof ChestError) return false;
    throw error;
  }
}
