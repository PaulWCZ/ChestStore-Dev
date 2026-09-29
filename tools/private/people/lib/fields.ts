import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { clean, id, limits, memberId } from "./model.ts";
import { present } from "./people.ts";

// Extra profile fields HR adds for the whole company — "Languages",
// "T-shirt size", "LinkedIn" — shown on every profile that has a value and
// found by the directory's search. Each is filled by the person (and HR),
// or by HR only. A removed field is kept 30 days, then goes with its values
// (Undo meanwhile).
export type Extra = { id: string; label: string; editor: "person" | "hr" };
export const keepRemovedFieldDays = 30;

function hr(actor: Member | null): Member {
  if (!actor || !can(actor, "profile.job")) throw new AppError("forbidden");
  return actor;
}

export async function listFields(sql: Query, actor: Member | null): Promise<Extra[]> {
  if (!actor || !can(actor, "directory.read")) throw new AppError("forbidden");
  const rows = await sql<{ id: string; label: string; editor: "person" | "hr" }[]>`select id, label, editor from fields where removed_at is null order by position, id`;
  return rows.map(r => ({ id: String(r.id), label: r.label, editor: r.editor }));
}

// The values of these people: member → field → value.
export async function valuesOf(sql: Query, ids: string[]): Promise<Map<string, Record<string, string>>> {
  const found = new Map<string, Record<string, string>>();
  if (ids.length === 0) return found;
  const rows = await sql<{ member_id: string; field_id: string; value: string }[]>`
    select v.member_id, v.field_id, v.value from field_values v join fields f on f.id = v.field_id
    where f.removed_at is null and v.member_id = any(${ids}::text[])`;
  for (const r of rows) found.set(r.member_id, { ...(found.get(r.member_id) ?? {}), [String(r.field_id)]: r.value });
  return found;
}

export async function addField(sql: Sql, actor: Member | null, input: { label?: unknown; editor?: unknown }): Promise<Extra> {
  hr(actor);
  const label = clean(input?.label, limits.fieldLabel);
  const editor = input?.editor === "hr" ? "hr" : "person";
  return sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('people.fields'))`;
    const [c] = await tx<{ n: number; last: number }[]>`select count(*)::int as n, coalesce(max(position), 0)::int as last from fields where removed_at is null`;
    if (c!.n >= limits.fields) throw new AppError("too_many", { max: limits.fields });
    const [row] = await tx<{ id: string }[]>`insert into fields (label, editor, position) values (${label}, ${editor}, ${c!.last + 1}) returning id`;
    return { id: String(row!.id), label, editor };
  });
}

export async function updateField(sql: Sql, actor: Member | null, fieldId: unknown, input: { label?: unknown; editor?: unknown }): Promise<void> {
  hr(actor);
  const label = clean(input?.label, limits.fieldLabel);
  const editor = input?.editor === "hr" ? "hr" : "person";
  const done = await sql`update fields set label = ${label}, editor = ${editor} where id = ${id(fieldId)} and removed_at is null`;
  if (done.count === 0) throw new AppError("not_found");
}

export async function removeField(sql: Sql, actor: Member | null, fieldId: unknown, removed: boolean): Promise<void> {
  hr(actor);
  const done = await sql`update fields set removed_at = ${removed ? new Date() : null} where id = ${id(fieldId)} and (removed_at is null) = ${removed}`;
  if (done.count === 0) throw new AppError("not_found");
}

// One value: by the person for their own "person" fields, by HR for anyone.
// An empty value removes it.
export async function setValue(sql: Query, actor: Member | null, member: unknown, fieldId: unknown, value: unknown): Promise<void> {
  if (!actor || !can(actor, "directory.read")) throw new AppError("forbidden");
  const who = memberId(member);
  const key = id(fieldId);
  const text = clean(value, limits.fieldValue, { optional: true });
  const [field] = await sql<{ editor: "person" | "hr" }[]>`select editor from fields where id = ${key} and removed_at is null`;
  if (!field) throw new AppError("not_found");
  const mine = who === actor.id && can(actor, "profile.own") && field.editor === "person";
  if (!mine && !can(actor, "profile.job")) throw new AppError("forbidden");
  if (who !== actor.id && !(await present([who])).has(who)) throw new AppError("not_found");
  if (text === "") await sql`delete from field_values where member_id = ${who} and field_id = ${key}`;
  else await sql`insert into field_values (member_id, field_id, value) values (${who}, ${key}, ${text}) on conflict (member_id, field_id) do update set value = excluded.value`;
}

export async function purgeFields(sql: Query): Promise<number> {
  return (await sql`delete from fields where removed_at < now() - make_interval(days => ${keepRemovedFieldDays}) returning id`).length;
}
