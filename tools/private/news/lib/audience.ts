import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";

// Everyone who has News with a role: the readers of the company's front
// page. The Chest answers 500 at a time; News reads up to 10,000 people.
export type Reader = { id: string; name: string; photo: string | null; locale: Locale; role: string | null };

export const pageSize = 500;
export const maxPages = 20;

export type Page = { people: Reader[]; next: string | null };

// page reads one page of members after a cursor (null: from the start).
export async function page(after: string | null): Promise<Page> {
  const answer = await members.list({ limit: pageSize, ...(after ? { after } : {}) });
  return {
    people: answer.members.filter(m => m.role !== null).map(m => ({ id: m.id, name: m.name, photo: m.photo, locale: m.locale, role: m.role })),
    next: answer.next,
  };
}

// everyone reads every page; complete is false when the Chest could not be
// asked (not granted, unreachable) or the company is larger than News reads.
export async function everyone(): Promise<{ people: Reader[]; complete: boolean }> {
  const people: Reader[] = [];
  let after: string | null = null;
  try {
    for (let i = 0; i < maxPages; i++) {
      const p: Page = await page(after);
      people.push(...p.people);
      if (!p.next) return { people, complete: true };
      after = p.next;
    }
    return { people, complete: false };
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return { people, complete: false };
  }
}

// hasTool says whether this member has News now (a welcome names only a
// colleague who does). Unavailable when the Chest cannot be asked.
export async function hasTool(memberId: string): Promise<boolean | "unavailable"> {
  try {
    return (await members.get(memberId)) !== null;
  } catch (error) {
    if (error instanceof CapabilityNotGranted || error instanceof ChestError) return "unavailable";
    throw error;
  }
}
