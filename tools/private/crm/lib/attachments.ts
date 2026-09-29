import type { Member } from "@argentic/chest-sdk/member";
import { can, canRemoveFile } from "./access.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { clean, id, limits } from "./model.ts";

// Files on a deal, a company or a contact — a signed quote, a
// specification, a purchase order. The bytes live in the Chest's files
// (capability "files"): the member's browser sends them to the Chest
// itself, the tool records what arrived (app/chest/api/files). Everyone who
// reads the record opens its files; whoever logs on it adds some; the one
// who added a file, or a manager, removes it.

export type Attachment = { id: string; name: string; type: string; size: number; addedBy: string; addedAt: string };
export type On = { deal?: unknown; company?: unknown; contact?: unknown };
type Anchor = { column: "deal_id" | "company_id" | "contact_id"; id: string; folder: string };

// The record a file goes on, and whether the actor may add to it.
export async function anchor(sql: Query, actor: Member | null, on: On, writing: boolean): Promise<Anchor> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  if (on.deal !== undefined && on.deal !== null && on.deal !== "") {
    const [d] = await sql<{ id: string; owner: string | null }[]>`select id, owner from deals where id = ${id(on.deal)}`;
    if (!d) throw new AppError("not_found");
    if (writing && !can(actor, "activities.log")) throw new AppError("forbidden");
    return { column: "deal_id", id: String(d.id), folder: `deals/${d.id}/` };
  }
  if (on.company !== undefined && on.company !== null && on.company !== "") {
    const [c] = await sql<{ id: string }[]>`select id from companies where id = ${id(on.company)}`;
    if (!c) throw new AppError("not_found");
    if (writing && !can(actor, "activities.log")) throw new AppError("forbidden");
    return { column: "company_id", id: String(c.id), folder: `companies/${c.id}/` };
  }
  if (on.contact !== undefined && on.contact !== null && on.contact !== "") {
    const [c] = await sql<{ id: string }[]>`select id from contacts where id = ${id(on.contact)}`;
    if (!c) throw new AppError("not_found");
    if (writing && !can(actor, "activities.log")) throw new AppError("forbidden");
    return { column: "contact_id", id: String(c.id), folder: `contacts/${c.id}/` };
  }
  throw new AppError("not_found");
}

type Row = { id: string; file_name: string; type: string; size: string; added_by: string; added_at: Date };
const toAttachment = (r: Row): Attachment => ({ id: String(r.id), name: r.file_name, type: r.type, size: Number(r.size), addedBy: r.added_by, addedAt: r.added_at.toISOString() });

export async function listFiles(sql: Query, actor: Member | null, on: On): Promise<Attachment[]> {
  const a = await anchor(sql, actor, on, false);
  const rows = await sql<Row[]>`select id, file_name, type, size, added_by, added_at from attachments where ${sql(a.column)} = ${a.id} order by added_at desc, id desc`;
  return rows.map(toAttachment);
}

// The folder an upload may go to (the Chest names the object in it), after
// checking the record takes one more file.
export async function uploadFolder(sql: Query, actor: Member | null, on: On, size: unknown): Promise<string> {
  const a = await anchor(sql, actor, on, true);
  if (typeof size === "number" && size > limits.attachmentSize) throw new AppError("file_too_large");
  const [n] = await sql<{ n: number }[]>`select count(*)::int as n from attachments where ${sql(a.column)} = ${a.id}`;
  if ((n?.n ?? 0) >= limits.attachments) throw new AppError("too_many", { max: limits.attachments });
  return a.folder;
}

// attach records a file the Chest now holds: only an object of the
// record's folder, as the Chest named it.
export async function attach(sql: Sql, actor: Member | null, on: On, file: { object: unknown; fileName: unknown; type: string; size: number }): Promise<Attachment> {
  const a = await anchor(sql, actor, on, true);
  if (typeof file.object !== "string" || !file.object.startsWith(a.folder) || !/^(deals|companies|contacts)\/[0-9]+\/[0-9a-f]{20}(\.[a-z0-9]{1,8})?$/u.test(file.object)) throw new AppError("invalid");
  const name = clean(typeof file.fileName === "string" ? file.fileName.replace(/[/\\]/gu, "_") : "", limits.fileName, { optional: true }) || file.object.split("/").pop()!;
  const [n] = await sql<{ n: number }[]>`select count(*)::int as n from attachments where ${sql(a.column)} = ${a.id}`;
  if ((n?.n ?? 0) >= limits.attachments) throw new AppError("too_many", { max: limits.attachments });
  const [row] = await sql<Row[]>`
    insert into attachments (${sql(a.column)}, object, file_name, type, size, added_by)
    values (${a.id}, ${file.object}, ${name}, ${file.type.slice(0, 120)}, ${file.size}, ${actor!.id})
    on conflict (object) do nothing
    returning id, file_name, type, size, added_by, added_at`;
  if (!row) throw new AppError("invalid");
  return toAttachment(row);
}

// The stored object of a file, for whoever reads its record.
export async function fileObject(sql: Query, actor: Member | null, fileId: unknown): Promise<{ object: string; name: string }> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const [row] = await sql<{ object: string; file_name: string }[]>`select object, file_name from attachments where id = ${id(fileId)}`;
  if (!row) throw new AppError("not_found");
  return { object: row.object, name: row.file_name };
}

// detach removes one file; says which object to delete from the Chest.
export async function detach(sql: Sql, actor: Member | null, fileId: unknown): Promise<string> {
  const [row] = await sql<{ id: string; object: string; added_by: string }[]>`select id, object, added_by from attachments where id = ${id(fileId)}`;
  if (!row) throw new AppError("not_found");
  if (!canRemoveFile(actor, { addedBy: row.added_by })) throw new AppError("forbidden");
  await sql`delete from attachments where id = ${row.id}`;
  return row.object;
}

// forgetObjects deletes stored files the database no longer lists (after a
// record was deleted). A courtesy: an object left behind is only space.
export async function forgetObjects(objects: string[]): Promise<void> {
  if (objects.length === 0) return;
  const files = await import("@argentic/chest-sdk/files");
  for (const object of objects) await files.delete(object).catch(() => false);
}
