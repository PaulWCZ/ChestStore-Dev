import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { clean, fieldValue, fold, id, isFieldType, limits, type FieldType } from "./model.ts";

// Fields a manager adds to a category — an IMEI for phones, RAM and OS for
// laptops, a licence plate and the next inspection for vehicles. Their
// values live on each item (items.extra, keyed by the field's id), are
// searched, printed on the handover sheet, exported and imported. A removed
// field keeps its values, unseen; Undo brings it back.
export type Field = { id: string; categoryId: string; name: string; type: FieldType };

type Row = { id: string; category_id: string; name: string; type: FieldType };
const shape = (r: Row): Field => ({ id: String(r.id), categoryId: String(r.category_id), name: r.name, type: r.type });

function manager(actor: Member | null): Member {
  if (!actor || !can(actor, "items.manage")) throw new AppError("forbidden");
  return actor;
}

// Every field of every category still listed, in their order.
export async function allFields(sql: Query): Promise<Field[]> {
  const rows = await sql<Row[]>`
    select f.id, f.category_id, f.name, f.type from fields f join categories c on c.id = f.category_id
    where f.removed_at is null and c.removed_at is null order by f.category_id, f.position, f.id`;
  return rows.map(shape);
}

export async function fieldsOf(sql: Query, categoryId: string): Promise<Field[]> {
  const rows = await sql<Row[]>`select id, category_id, name, type from fields where category_id = ${categoryId} and removed_at is null order by position, id`;
  return rows.map(shape);
}

export async function listFields(sql: Query, actor: Member | null): Promise<Field[]> {
  manager(actor);
  return allFields(sql);
}

export async function addField(sql: Sql, actor: Member | null, input: { categoryId?: unknown; name?: unknown; type?: unknown }): Promise<Field> {
  manager(actor);
  const categoryId = id(input.categoryId);
  const name = clean(input.name, limits.fieldName);
  const type: FieldType = input.type === undefined ? "text" : isFieldType(input.type) ? input.type : (() => { throw new AppError("invalid"); })();
  return sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('equipment.fields'))`;
    const [cat] = await tx<{ kind: string }[]>`select kind from categories where id = ${categoryId} and removed_at is null`;
    if (!cat) throw new AppError("not_found");
    const current = await fieldsOf(tx, categoryId);
    if (current.length >= limits.fieldsPerCategory) throw new AppError("too_many", { max: limits.fieldsPerCategory });
    if (current.some(f => fold(f.name) === fold(name))) throw new AppError("field_taken", { name });
    const [row] = await tx<Row[]>`
      insert into fields (category_id, name, type, position)
      values (${categoryId}, ${name}, ${type}, (select coalesce(max(position), 0) + 1 from fields where category_id = ${categoryId}))
      returning id, category_id, name, type`;
    return shape(row!);
  });
}

// A new name (the type stays: values already written keep their meaning).
export async function renameField(sql: Sql, actor: Member | null, fieldId: unknown, nameValue: unknown): Promise<Field> {
  manager(actor);
  const key = id(fieldId);
  const name = clean(nameValue, limits.fieldName);
  return sql.begin(async tx => {
    const [row] = await tx<Row[]>`select id, category_id, name, type from fields where id = ${key} and removed_at is null for update`;
    if (!row) throw new AppError("not_found");
    const others = (await fieldsOf(tx, String(row.category_id))).filter(f => f.id !== String(row.id));
    if (others.some(f => fold(f.name) === fold(name))) throw new AppError("field_taken", { name });
    const [updated] = await tx<Row[]>`update fields set name = ${name} where id = ${key} returning id, category_id, name, type`;
    return shape(updated!);
  });
}

export async function removeField(sql: Sql, actor: Member | null, fieldId: unknown): Promise<void> {
  manager(actor);
  const gone = await sql`update fields set removed_at = now() where id = ${id(fieldId)} and removed_at is null returning id`;
  if (gone.length === 0) throw new AppError("not_found");
}

// Undo of a removal, unless a field of that name came meanwhile.
export async function restoreField(sql: Sql, actor: Member | null, fieldId: unknown): Promise<Field> {
  manager(actor);
  const key = id(fieldId);
  return sql.begin(async tx => {
    const [row] = await tx<Row[]>`select id, category_id, name, type from fields where id = ${key} and removed_at is not null for update`;
    if (!row) throw new AppError("not_found");
    if ((await fieldsOf(tx, String(row.category_id))).some(f => fold(f.name) === fold(row.name))) throw new AppError("field_taken", { name: row.name });
    const [back] = await tx<Row[]>`update fields set removed_at = null where id = ${key} returning id, category_id, name, type`;
    return shape(back!);
  });
}

// readExtra checks the values a form sent for the fields of a category:
// { "<field id>": "value" }. An empty value is left out; an id that is not
// one of the category's fields is refused.
export function readExtra(fields: Field[], value: unknown): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new AppError("invalid");
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const field = fields.find(f => f.id === key);
    if (!field) throw new AppError("invalid");
    let v: string | null;
    try {
      v = fieldValue(field.type, raw);
    } catch (error) {
      if (error instanceof AppError && error.code === "invalid_field") throw new AppError("invalid_field", { field: field.name });
      throw error;
    }
    if (v !== null) out[field.id] = v;
  }
  return out;
}

// The values of an item for these fields, in their order, as [field, value].
export function valuesOf(fields: Field[], extra: Record<string, string>): { field: Field; value: string }[] {
  return fields.flatMap(f => (extra[f.id] ? [{ field: f, value: extra[f.id]! }] : []));
}
