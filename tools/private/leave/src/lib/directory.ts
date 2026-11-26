import { ChestError } from "@argentic/chest-sdk/errors";
import { localeOf, type Locale } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";

// The people who have the tool, as the Chest says now: the rows of the team
// calendar and of HR's list, the approvers one may name, the HR people who
// answer when nobody else was named. Read from the Chest each time (names
// are never copied), 500 at a time, every page (no cap of the tool's own:
// the company's size is the only limit).
export type DirectoryPerson = { id: string; name: string; firstName: string; lastName: string; photo: string | null; role: string | null; locale: Locale };

// pages reads every page of a members' list; a cursor seen twice ends it
// (what was read is kept), never a loop.
async function pages<T>(read: (after: string | undefined) => Promise<{ items: T[]; next: string | null }>): Promise<T[]> {
  const found: T[] = [];
  const seen = new Set<string>();
  let after: string | undefined;
  for (;;) {
    const page = await read(after);
    found.push(...page.items);
    if (!page.next || seen.has(page.next)) return found;
    seen.add(page.next);
    after = page.next;
  }
}

export async function everyone(): Promise<DirectoryPerson[]> {
  return pages(async after => {
    const answer = await members.list({ limit: 500, ...(after ? { after } : {}) });
    return { items: answer.members.map(m => ({ id: m.id, name: m.name, firstName: m.firstName, lastName: m.lastName, photo: m.photo, role: m.role, locale: localeOf(m.language) })), next: answer.next };
  });
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
  return pages(async after => {
    const answer = await members.list({ role: "hr", limit: 500, ...(after ? { after } : {}) });
    return { items: answer.members.map(m => m.id), next: answer.next };
  });
}

// roleNow: the role of someone who has the tool, null if they have none or
// no longer have the tool.
export async function roleNow(memberId: string): Promise<string | null> {
  return (await members.get(memberId))?.role ?? null;
}

// The Chest's groups the team calendar is filtered by. With the capability
// "members.groups" (chest.json, SDK 0.5+) every group of the Chest —
// Sales, Tech, the workshop — even when Leave is open to everyone, which
// gives it no group; read a page at a time. None when the Chest does not
// answer (the page still renders).
export async function groups(): Promise<{ id: string; name: string }[]> {
  try {
    return await pages(async after => {
      const answer = await members.groups.list({ limit: 500, ...(after ? { after } : {}) });
      return { items: answer.groups.map(g => ({ id: g.id, name: g.name })), next: answer.next };
    });
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return [];
  }
}

// Who is in a group, among those who have Leave (members.list({group}):
// any group of the Chest with "members.groups", a group that gives Leave
// without it); null when the Chest does not answer or refuses the group.
export async function groupMembers(id: string): Promise<string[] | null> {
  try {
    return await pages(async after => {
      const answer = await members.list({ group: id, limit: 500, ...(after ? { after } : {}) });
      return { items: answer.members.map(m => m.id), next: answer.next };
    });
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return null;
  }
}
