import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { fieldLimits, isFieldKind, isFieldObject, type Custom, type FieldDef, type FieldObject } from "../shared/custom.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { catalogue, locales, type Catalogue } from "../i18n/index.ts";
import { clean, id } from "../shared/model.ts";

// The team's own fields, set by a manager (Settings → Fields): each has a
// label, a kind and, for a choice, its choices. Everyone who reads a record
// reads its fields; whoever may edit the record fills them.

type Row = { id: string; object: FieldObject; label: string; kind: FieldDef["kind"]; options: string[]; label_key?: string | null; option_keys?: string[] };
const toField = (r: Row): FieldDef => ({ id: String(r.id), object: r.object, label: r.label, kind: r.kind, options: r.options, labelKey: r.label_key ?? null, optionKeys: r.option_keys ?? [] });

// A field's names as a reader sees them: those the tool offered (the
// sample's "Competitor", its choices) in the reader's language, until a
// manager renamed them; the others as typed. The values kept on records
// stay what they are (options); optionLabels say how to show each.
type SeedWords = Catalogue["seed"];
const seedLabel = (w: SeedWords, key: string | null | undefined): string | undefined => (key ? (w.fields as Record<string, string>)[key] : undefined);
const seedOption = (w: SeedWords, key: string | undefined): string | undefined => (key ? (w.options as Record<string, string>)[key] : undefined);
export function localized(f: FieldDef, t: Catalogue): FieldDef {
  const keys = f.optionKeys ?? [];
  return { ...f, label: seedLabel(t.seed, f.labelKey) ?? f.label, optionLabels: f.options.map((o, i) => seedOption(t.seed, keys[i]) ?? o) };
}
// The label shown for a value of a choice field (the value itself when it
// is not one of the choices any more).
export function optionLabel(f: FieldDef, value: string): string {
  const i = f.options.indexOf(value);
  return i >= 0 ? f.optionLabels?.[i] ?? value : value;
}

export async function listFields(sql: Query, object?: FieldObject, t?: Catalogue): Promise<FieldDef[]> {
  const rows = await sql<Row[]>`
    select id, object, label, kind, options, label_key, option_keys from fields ${object ? sql`where object = ${object}` : sql``}
    order by object, position, id`;
  return rows.map(r => (t ? localized(toField(r), t) : toField(r)));
}

export async function fieldsByObject(sql: Query, t?: Catalogue): Promise<Record<FieldObject, FieldDef[]>> {
  const all = await listFields(sql, undefined, t);
  return { companies: all.filter(f => f.object === "companies"), contacts: all.filter(f => f.object === "contacts"), deals: all.filter(f => f.object === "deals") };
}

function manager(actor: Member | null): void {
  if (!can(actor, "fields")) throw new AppError("forbidden");
}

// Choices as a list, or one per line / separated by commas; each once.
export function options(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,;]/u) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") throw new AppError("invalid");
    const text = item.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "").trim();
    if (text === "") continue;
    if ([...text].length > fieldLimits.option) throw new AppError("too_long", { max: fieldLimits.option });
    const k = text.toLocaleLowerCase("en");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(text);
  }
  if (out.length > fieldLimits.options) throw new AppError("too_many", { max: fieldLimits.options });
  return out;
}

// addField: `tx` lets an import create the fields a file brings, in its
// own transaction.
export async function addField(sql: Query, actor: Member | null, input: { object: unknown; label: unknown; kind: unknown; options?: unknown }): Promise<FieldDef> {
  manager(actor);
  if (!isFieldObject(input.object) || !isFieldKind(input.kind)) throw new AppError("invalid");
  const label = clean(input.label, fieldLimits.label);
  const choices = input.kind === "choice" ? options(input.options) : [];
  if (input.kind === "choice" && choices.length === 0) throw new AppError("empty");
  const [count] = await sql<{ n: number; taken: number }[]>`
    select count(*)::int as n, count(*) filter (where lower(label) = lower(${label}))::int as taken from fields where object = ${input.object}`;
  if ((count?.n ?? 0) >= fieldLimits.perObject) throw new AppError("too_many", { max: fieldLimits.perObject });
  if ((count?.taken ?? 0) > 0) throw new AppError("invalid");
  const [row] = await sql<Row[]>`
    insert into fields (object, label, kind, options, position)
    values (${input.object}, ${label}, ${input.kind}, ${choices}, coalesce((select max(position) + 1 from fields where object = ${input.object}), 0))
    returning id, object, label, kind, options`;
  return toField(row!);
}

async function field(sql: Query, fieldId: unknown): Promise<FieldDef & { position: number }> {
  const [row] = await sql<(Row & { position: number })[]>`select id, object, label, kind, options, label_key, option_keys, position from fields where id = ${id(fieldId)}`;
  if (!row) throw new AppError("not_found");
  return { ...toField(row), position: row.position };
}

// updateField renames a field or changes its choices. A choice renamed in
// place (same position in the list) is renamed on every record too; a
// choice removed stays on the records that hold it until someone changes it.
export async function updateField(sql: Sql, actor: Member | null, fieldId: unknown, input: { label?: unknown; options?: unknown }): Promise<void> {
  manager(actor);
  const f = await field(sql, fieldId);
  // A name the tool offered, sent back as a reader saw it (in any of the
  // languages), is not a rename: it keeps following each reader's language.
  const shown = locales.map(l => localized(f, catalogue(l)));
  let label = input.label === undefined ? f.label : clean(input.label, fieldLimits.label);
  let labelKey = f.labelKey ?? null;
  if (labelKey && input.label !== undefined) {
    if (shown.some(s => s.label === label)) label = f.label;
    else labelKey = null;
  }
  let choices = f.kind === "choice" && input.options !== undefined ? options(input.options) : f.options;
  let optionKeys = f.optionKeys ?? [];
  if (optionKeys.length > 0 && f.kind === "choice" && input.options !== undefined) {
    if (shown.some(s => JSON.stringify(s.optionLabels) === JSON.stringify(choices))) choices = f.options;
    else optionKeys = [];
  }
  if (f.kind === "choice" && choices.length === 0) throw new AppError("empty");
  const [taken] = await sql`select 1 from fields where object = ${f.object} and lower(label) = lower(${label}) and id <> ${f.id}`;
  if (taken) throw new AppError("invalid");
  await sql.begin(async tx => {
    await tx`update fields set label = ${label}, options = ${choices}, label_key = ${labelKey}, option_keys = ${optionKeys} where id = ${f.id}`;
    if (f.kind === "choice" && choices.length === f.options.length) {
      for (const [i, before] of f.options.entries()) {
        const after = choices[i]!;
        if (after === before) continue;
        await tx`update ${tx(f.object)} set custom = jsonb_set(custom, ${[f.id]}::text[], to_jsonb(${after}::text)) where custom->>${f.id} = ${before}`;
      }
    }
  });
}

export async function moveField(sql: Sql, actor: Member | null, fieldId: unknown, direction: "up" | "down"): Promise<void> {
  manager(actor);
  const f = await field(sql, fieldId);
  const list = await sql<{ id: string }[]>`select id from fields where object = ${f.object} order by position, id`;
  const ids = list.map(r => String(r.id));
  const at = ids.indexOf(f.id);
  const to = direction === "up" ? at - 1 : at + 1;
  if (to < 0 || to >= ids.length) return;
  [ids[at], ids[to]] = [ids[to]!, ids[at]!];
  await sql.begin(async tx => {
    for (const [i, x] of ids.entries()) await tx`update fields set position = ${i} where id = ${x}`;
  });
}

// removeField removes the field and every value of it.
export async function removeField(sql: Sql, actor: Member | null, fieldId: unknown): Promise<void> {
  manager(actor);
  const f = await field(sql, fieldId);
  await sql.begin(async tx => {
    await tx`update ${tx(f.object)} set custom = custom - ${f.id}::text where custom ? ${f.id}`;
    await tx`delete from fields where id = ${f.id}`;
  });
}

// A record's values as a list, in the fields' order, for its page.
export function shownValues(fields: FieldDef[], custom: Custom): { field: FieldDef; value: string | number }[] {
  return fields.filter(f => custom[f.id] !== undefined && custom[f.id] !== "").map(f => ({ field: f, value: custom[f.id]! }));
}

// The filter of a list by one field: `cf` names the field; `cv` a value
// (a choice, or words of a text), `cmin`/`cmax` a range (number, day).
export type FieldFilter = { field: string; value?: string; min?: string; max?: string };
export function fieldClause(sql: Query, alias: string, fields: FieldDef[], filter: FieldFilter | undefined) {
  const f = filter ? fields.find(x => x.id === filter.field) : undefined;
  if (!f || !filter) return sql`true`;
  const column = sql(alias + ".custom");
  const key = f.id;
  const parts = [];
  if (f.kind === "choice" && filter.value) parts.push(sql`${column}->>${key} = ${filter.value}`);
  if (f.kind === "text" && filter.value) parts.push(sql`crm_fold(${column}->>${key}) like '%' || crm_fold(${filter.value.replace(/[\\%_]/gu, "").slice(0, 100)}) || '%'`);
  if (f.kind === "number") {
    const num = (v: string | undefined) => { const n = v === undefined || v.trim() === "" ? null : Number(v.replace(",", ".")); return n !== null && Number.isFinite(n) ? n : null; };
    const low = num(filter.min), high = num(filter.max);
    const value = sql`(case when jsonb_typeof(${column}->${key}) = 'number' then (${column}->>${key})::numeric end)`;
    if (low !== null) parts.push(sql`${value} >= ${low}`);
    if (high !== null) parts.push(sql`${value} <= ${high}`);
    if (low === null && high === null) parts.push(sql`${column} ? ${key}`);
  }
  if (f.kind === "date") {
    const isDay = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/u.test(v) ? v : null);
    const low = isDay(filter.min), high = isDay(filter.max);
    if (low) parts.push(sql`${column}->>${key} >= ${low}`);
    if (high) parts.push(sql`${column}->>${key} <= ${high}`);
    if (!low && !high) parts.push(sql`${column} ? ${key}`);
  }
  if (parts.length === 0) parts.push(sql`${column} ? ${key}`);
  return parts.reduce((all, p) => sql`${all} and ${p}`);
}

// A list's field filter, as its address writes it (cf, cv, cmin, cmax).
export function fieldFilterOf(get: (key: string) => string): FieldFilter | undefined {
  const field = get("cf");
  if (!/^[1-9][0-9]{0,17}$/u.test(field)) return undefined;
  return { field, value: get("cv").slice(0, 100), min: get("cmin").slice(0, 30), max: get("cmax").slice(0, 30) };
}
