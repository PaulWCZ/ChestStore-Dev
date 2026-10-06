import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import type { Query, Sql } from "./db.ts";
import { note } from "./journal.ts";
import { clean, id, limits, memberId } from "../shared/model.ts";
import { present } from "./people.ts";

// Staff without the Chest in the directory and the org chart (a warehouse
// worker, an intern: an HR record not linked to any member). Everyone who
// reads the directory sees what it shows of anyone — the name, the job,
// the team, the manager — marked "Not in the Chest", and nothing else of
// the record (no contract, no dates, no address, not even that it is a
// record: their card opens nothing, HR's opens the record). Listed while
// they work here: started (or no first day written) and not left; HR may
// take someone off the directory. Their id on the page is "rec:<record>".

export type Offline = { id: string; recordId: string; name: string; title: string; team: string; managerId: string | null };

export const offlinePrefix = "rec:";

export async function offlineStaff(sql: Query, actor: Member | null, now: string): Promise<Offline[]> {
  if (!actor || !can(actor, "directory.read")) throw new AppError("forbidden");
  const rows = await sql<{ id: string; legal_name: string; job: string; team: string; manager_id: string | null }[]>`
    select id::text as id, legal_name, job, team, manager_id from records
    where member_id is null and erased_at is null and listed
      and (end_date is null or end_date >= ${now}::date) and (start_date is null or start_date <= ${now}::date)
    order by lower(legal_name), id limit 2000`;
  return rows.map(r => ({ id: offlinePrefix + r.id, recordId: r.id, name: r.legal_name, title: r.job, team: r.team, managerId: r.manager_id }));
}

export type Placement = { listed: boolean; team: string; managerId: string | null };

// Where the directory shows someone without the Chest (HR, on their record).
export async function placement(sql: Query, actor: Member | null, recordId: unknown): Promise<Placement & { linked: boolean }> {
  if (!actor || !can(actor, "records.manage")) throw new AppError("forbidden");
  const [row] = await sql<{ listed: boolean; team: string; manager_id: string | null; member_id: string | null }[]>`select listed, team, manager_id, member_id from records where id = ${id(recordId)} and erased_at is null`;
  if (!row) throw new AppError("not_found");
  return { listed: row.listed, team: row.team, managerId: row.manager_id, linked: row.member_id !== null };
}

export async function setPlacement(sql: Sql, actor: Member | null, recordId: unknown, input: { listed?: unknown; team?: unknown; managerId?: unknown }): Promise<void> {
  if (!actor || !can(actor, "records.manage")) throw new AppError("forbidden");
  if (!input || typeof input !== "object") throw new AppError("invalid");
  const key = id(recordId);
  const before = await placement(sql, actor, key);
  if (before.linked) throw new AppError("invalid");
  const listed = input.listed === undefined ? before.listed : input.listed;
  if (typeof listed !== "boolean") throw new AppError("invalid");
  const team = input.team === undefined ? before.team : clean(input.team, limits.team, { optional: true });
  const manager = input.managerId === undefined ? before.managerId : input.managerId === null || input.managerId === "" ? null : memberId(input.managerId);
  if (manager && manager !== before.managerId && !(await present([manager])).has(manager)) throw new AppError("not_member");
  const changed = [...(listed !== before.listed ? ["listed"] : []), ...(team !== before.team ? ["team"] : []), ...(manager !== before.managerId ? ["managerId"] : [])];
  if (changed.length === 0) return;
  await sql.begin(async tx => {
    await tx`update records set listed = ${listed}, team = ${team}, manager_id = ${manager}, updated_at = now() where id = ${key}`;
    await note(tx, actor, "changed", { recordId: key, fields: changed });
  });
}
