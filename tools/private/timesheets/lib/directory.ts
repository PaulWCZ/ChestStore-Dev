import { ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";

// The people who have the tool, as the Chest says now: the rows of the team
// calendar and of HR's list, the approvers one may name, the HR people who
// answer when nobody else was named. Read from the Chest each time (names
// are never copied), 500 at a time, up to 2,000 people.
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

// The HR people now (members.list by role).
export async function hrIds(): Promise<string[]> {
  const found: string[] = [];
  let after: string | undefined;
  for (let page = 0; page < 4; page++) {
    const answer = await members.list({ role: "hr", limit: 500, ...(after ? { after } : {}) });
    found.push(...answer.members.map(m => m.id));
    if (!answer.next) break;
    after = answer.next;
  }
  return found;
}

// roleNow: the role of someone who has the tool, null if they have none or
// no longer have the tool.
export async function roleNow(memberId: string): Promise<string | null> {
  return (await members.get(memberId))?.role ?? null;
}

export async function groups(): Promise<{ id: string; name: string; members: string[] }[]> {
  try {
    return (await members.groups.list()).map(g => ({ id: g.id, name: g.name, members: g.members }));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return [];
  }
}
