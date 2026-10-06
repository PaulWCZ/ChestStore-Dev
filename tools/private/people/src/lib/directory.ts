import type { Member } from "@argentic/chest-sdk/member";
import { AppError } from "../shared/app-error.ts";
import { can } from "./access.ts";
import type { Query, Sql } from "./db.ts";
import { everyone, people } from "./people.ts";
import { valuesOf } from "./fields.ts";
import { profiles, reconcile, type Profile } from "./profiles.ts";
import { today } from "./zone.ts";

// The directory: everyone who has the tool — the Chest is the truth of who
// is in the company, with their name and photo — and what this tool knows
// of each. Ordered by name as the Chest orders them. The work address is the
// Chest's (members.email); extras are the values of HR's extra fields.
export type Entry = Profile & { id: string; name: string; firstName: string; lastName: string; photo: string | null; email: string; extras: Record<string, string> };

export async function directory(sql: Sql, actor: Member | null): Promise<{ ok: boolean; entries: Entry[] }> {
  if (!actor || !can(actor, "directory.read")) throw new AppError("forbidden");
  const listed = await everyone();
  const ids = listed.people.map(p => p.id);
  if (listed.ok) await reconcile(sql, ids, today());
  const known = await profiles(sql, actor, ids);
  const extras = await valuesOf(sql, actor, ids);
  return {
    ok: listed.ok,
    entries: listed.people.map(p => ({ ...known.get(p.id)!, id: p.id, name: p.name, firstName: p.firstName, lastName: p.lastName, photo: p.photo, email: p.email, extras: extras.get(p.id) ?? {} })),
  };
}

// The managers who left while people still report to them: their place in
// the org chart is kept (a card marked "has left") until HR names someone
// else. Their name is the Chest's (a former member's is kept); above them,
// their own manager while their profile is kept (30 days).
export type Departed = { id: string; name: string; managerId: string | null };

export async function departedManagers(sql: Query, entries: readonly Entry[]): Promise<Departed[]> {
  const listed = new Set(entries.map(e => e.id));
  const ids = [...new Set(entries.filter(e => e.managerLeft && e.managerId && !listed.has(e.managerId)).map(e => e.managerId!))];
  if (ids.length === 0) return [];
  const above = new Map((await sql<{ member_id: string; manager_id: string | null }[]>`select member_id, manager_id from profiles where member_id = any(${ids}::text[])`).map(r => [r.member_id, r.manager_id]));
  const names = await people(ids);
  return ids.map(id => {
    const up = above.get(id) ?? null;
    return { id, name: names.get(id)?.name ?? "", managerId: up && listed.has(up) ? up : null };
  });
}
