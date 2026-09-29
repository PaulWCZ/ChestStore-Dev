import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { clean, day, id, limits, memberId } from "./model.ts";
import { present } from "./people.ts";

// Extra profile fields HR adds for the whole company — "Languages",
// "T-shirt size", "LinkedIn" — shown on every profile that has a value and
// found by the directory's search. Each is filled by the person (and HR),
// or by HR only. A removed field is kept 30 days, then goes with its values
// (Undo meanwhile). Its kind: text; a date (YYYY-MM-DD), which may remind
// HR some days before ("Medical visit", "Badge expires"); or a choice from
// HR's list ("T-shirt size": S, M, L). A field's kind never changes (its
// values would no longer fit); its list and reminder may.
export type FieldKind = "text" | "date" | "choice";
export const fieldKinds: readonly FieldKind[] = ["text", "date", "choice"];
export type Extra = { id: string; label: string; editor: "person" | "hr"; kind: FieldKind; options: string[]; alertDays: number | null };
type FieldRow = { id: string; label: string; editor: "person" | "hr"; kind: FieldKind; options: string[]; alert_days: number | null };
const toExtra = (r: FieldRow): Extra => ({ id: String(r.id), label: r.label, editor: r.editor, kind: r.kind, options: r.options, alertDays: r.alert_days });

// A choice list: one option per entry (or per line), cleaned, no repeats.
function optionsOf(value: unknown): string[] {
  const list = typeof value === "string" ? value.split(/\r?\n/u) : Array.isArray(value) ? value : null;
  if (!list) throw new AppError("invalid");
  const seen = new Set<string>();
  const found: string[] = [];
  for (const item of list) {
    const text = clean(item, limits.fieldLabel, { optional: true });
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    found.push(text);
  }
  if (found.length === 0) throw new AppError("empty");
  if (found.length > limits.fieldOptions) throw new AppError("too_many", { max: limits.fieldOptions });
  return found;
}

function alertOf(value: unknown): number | null {
  if (value === undefined || value === null || value === "" || value === 0) return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 365) throw new AppError("invalid");
  return n;
}

// What a value of this field is, checked: a text; a day; one of the list
// (whatever its case: stored as HR wrote the option).
export function valueFor(field: Pick<Extra, "kind" | "options">, value: unknown): string {
  const text = clean(value, limits.fieldValue, { optional: true });
  if (text === "") return "";
  if (field.kind === "date") return day(text)!;
  if (field.kind === "choice") {
    const found = field.options.find(o => o.toLowerCase() === text.toLowerCase());
    if (!found) throw new AppError("invalid");
    return found;
  }
  return text;
}
export const keepRemovedFieldDays = 30;

function hr(actor: Member | null): Member {
  if (!actor || !can(actor, "profile.job")) throw new AppError("forbidden");
  return actor;
}

export async function listFields(sql: Query, actor: Member | null): Promise<Extra[]> {
  if (!actor || !can(actor, "directory.read")) throw new AppError("forbidden");
  const rows = await sql<FieldRow[]>`select id, label, editor, kind, options, alert_days from fields where removed_at is null order by position, id`;
  return rows.map(toExtra);
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

export async function addField(sql: Sql, actor: Member | null, input: { label?: unknown; editor?: unknown; kind?: unknown; options?: unknown; alertDays?: unknown }): Promise<Extra> {
  hr(actor);
  const label = clean(input?.label, limits.fieldLabel);
  const editor = input?.editor === "hr" ? "hr" : "person";
  if (input?.kind !== undefined && !fieldKinds.includes(input.kind as FieldKind)) throw new AppError("invalid");
  const kind: FieldKind = (input?.kind as FieldKind | undefined) ?? "text";
  const options = kind === "choice" ? optionsOf(input?.options) : [];
  const alertDays = kind === "date" ? alertOf(input?.alertDays) : null;
  return sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('people.fields'))`;
    const [c] = await tx<{ n: number; last: number }[]>`select count(*)::int as n, coalesce(max(position), 0)::int as last from fields where removed_at is null`;
    if (c!.n >= limits.fields) throw new AppError("too_many", { max: limits.fields });
    const [row] = await tx<{ id: string }[]>`insert into fields (label, editor, position, kind, options, alert_days) values (${label}, ${editor}, ${c!.last + 1}, ${kind}, ${options}, ${alertDays}) returning id`;
    return { id: String(row!.id), label, editor, kind, options, alertDays };
  });
}

// updateField: its name, who fills it; a choice's list (a value no longer
// in it stays until changed); a date's reminder.
export async function updateField(sql: Sql, actor: Member | null, fieldId: unknown, input: { label?: unknown; editor?: unknown; options?: unknown; alertDays?: unknown }): Promise<void> {
  hr(actor);
  const label = clean(input?.label, limits.fieldLabel);
  const editor = input?.editor === "hr" ? "hr" : "person";
  const [field] = await sql<FieldRow[]>`select id, label, editor, kind, options, alert_days from fields where id = ${id(fieldId)} and removed_at is null`;
  if (!field) throw new AppError("not_found");
  const options = field.kind === "choice" && input?.options !== undefined ? optionsOf(input.options) : field.options;
  const alertDays = field.kind === "date" && input?.alertDays !== undefined ? alertOf(input.alertDays) : field.alert_days;
  await sql`update fields set label = ${label}, editor = ${editor}, options = ${options}, alert_days = ${alertDays} where id = ${field.id}`;
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
  const [field] = await sql<{ editor: "person" | "hr"; kind: FieldKind; options: string[] }[]>`select editor, kind, options from fields where id = ${key} and removed_at is null`;
  if (!field) throw new AppError("not_found");
  const text = valueFor(field, value);
  const mine = who === actor.id && can(actor, "profile.own") && field.editor === "person";
  if (!mine && !can(actor, "profile.job")) throw new AppError("forbidden");
  if (who !== actor.id && !(await present([who])).has(who)) throw new AppError("not_found");
  if (text === "") await sql`delete from field_values where member_id = ${who} and field_id = ${key}`;
  else await sql`insert into field_values (member_id, field_id, value) values (${who}, ${key}, ${text}) on conflict (member_id, field_id) do update set value = excluded.value`;
}

export async function purgeFields(sql: Query): Promise<number> {
  return (await sql`delete from fields where removed_at < now() - make_interval(days => ${keepRemovedFieldDays}) returning id`).length;
}

// Date fields with a reminder: the values falling within their reminder
// from this day (HR's morning bell: "Hugo Bernard: Medical visit on 12
// October").
export async function dueDates(sql: Query, on: string): Promise<{ memberId: string; fieldId: string; label: string; day: string }[]> {
  const rows = await sql<{ member_id: string; field_id: string; label: string; value: string }[]>`
    select v.member_id, v.field_id, f.label, v.value from field_values v join fields f on f.id = v.field_id
    where f.removed_at is null and f.kind = 'date' and f.alert_days is not null
      and v.value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and v.value::date between ${on}::date and ${on}::date + f.alert_days
    order by v.value, v.member_id limit 2000`;
  return rows.map(r => ({ memberId: r.member_id, fieldId: String(r.field_id), label: r.label, day: r.value }));
}
