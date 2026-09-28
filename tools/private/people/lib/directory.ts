import type { Member } from "@argentic/chest-sdk/member";
import { AppError } from "./app-error.ts";
import { can } from "./access.ts";
import type { Sql } from "./db.ts";
import { everyone } from "./people.ts";
import { profiles, reconcile, type Profile } from "./profiles.ts";

// The directory: everyone who has the tool — the Chest is the truth of who
// is in the company, with their name and photo — and what this tool knows
// of each. Ordered by name as the Chest orders them.
export type Entry = Profile & { id: string; name: string; firstName: string; lastName: string; photo: string | null };

export async function directory(sql: Sql, actor: Member | null): Promise<{ ok: boolean; entries: Entry[] }> {
  if (!actor || !can(actor, "directory.read")) throw new AppError("forbidden");
  const listed = await everyone();
  const ids = listed.people.map(p => p.id);
  if (listed.ok) await reconcile(sql, ids);
  const known = await profiles(sql, actor, ids);
  return {
    ok: listed.ok,
    entries: listed.people.map(p => ({ ...known.get(p.id)!, id: p.id, name: p.name, firstName: p.firstName, lastName: p.lastName, photo: p.photo })),
  };
}
