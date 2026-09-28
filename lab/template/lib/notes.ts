import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import type { Sql } from "./db.ts";
import { AppError } from "./errors.ts";

// The notes, as the pages see them. Every function takes the database and
// the member acting, checks the rights (lib/access.ts) and throws AppError
// with a code; none returns a sentence.
export const limits = { body: 500, page: 200 } as const;
// A deleted note can be restored this long, then it is purged.
const keepDeleted = "30 days";

export type Note = { id: string; body: string; author: string; pinned: boolean; createdAt: string };

type Row = { id: string; body: string; author: string; pinned: boolean; created_at: Date };
const toNote = (r: Row): Note => ({ id: String(r.id), body: r.body, author: r.author, pinned: r.pinned, createdAt: r.created_at.toISOString() });

const idPattern = /^[1-9][0-9]{0,17}$/u;
function checkId(id: string): string {
  if (!idPattern.test(id)) throw new AppError("not_found");
  return id;
}

// clean trims a text and bounds it; control characters other than line
// breaks are dropped.
export function clean(text: unknown, max: number): string {
  if (typeof text !== "string") throw new AppError("invalid");
  const value = text.replace(/\r\n?/gu, "\n").replace(/[^\P{Cc}\n\t]/gu, "").trim();
  if (value === "") throw new AppError("empty");
  if ([...value].length > max) throw new AppError("too_long", { max });
  return value;
}

export async function listNotes(sql: Sql, actor: Member | null): Promise<Note[]> {
  if (!can(actor, "notes.read")) throw new AppError("forbidden");
  // Purge what was deleted long enough ago: there is no background job.
  await sql`delete from notes where deleted_at < now() - ${keepDeleted}::interval`;
  const rows = await sql<Row[]>`
    select id, body, author, pinned, created_at from notes
    where deleted_at is null
    order by pinned desc, created_at desc
    limit ${limits.page}`;
  return rows.map(toNote);
}

export async function addNote(sql: Sql, actor: Member | null, body: unknown): Promise<Note> {
  if (!actor || !can(actor, "notes.write")) throw new AppError("forbidden");
  const text = clean(body, limits.body);
  const [row] = await sql<Row[]>`insert into notes (body, author) values (${text}, ${actor.id}) returning id, body, author, pinned, created_at`;
  return toNote(row!);
}

// A note is removed by its author, or by whoever may remove any note.
export async function removeNote(sql: Sql, actor: Member | null, id: string): Promise<void> {
  if (!actor || !can(actor, "notes.write")) throw new AppError("forbidden");
  const [row] = await sql<{ author: string }[]>`select author from notes where id = ${checkId(id)} and deleted_at is null`;
  if (!row) throw new AppError("not_found");
  if (row.author !== actor.id && !can(actor, "notes.remove.any")) throw new AppError("forbidden");
  await sql`update notes set deleted_at = now() where id = ${id}`;
}

export async function restoreNote(sql: Sql, actor: Member | null, id: string): Promise<void> {
  if (!actor || !can(actor, "notes.write")) throw new AppError("forbidden");
  const [row] = await sql<{ author: string }[]>`select author from notes where id = ${checkId(id)} and deleted_at is not null`;
  if (!row) throw new AppError("not_found");
  if (row.author !== actor.id && !can(actor, "notes.remove.any")) throw new AppError("forbidden");
  await sql`update notes set deleted_at = null where id = ${id}`;
}

export async function setPinned(sql: Sql, actor: Member | null, id: string, pinned: boolean): Promise<Note> {
  if (!can(actor, "notes.pin")) throw new AppError("forbidden");
  const [row] = await sql<Row[]>`update notes set pinned = ${pinned} where id = ${checkId(id)} and deleted_at is null returning id, body, author, pinned, created_at`;
  if (!row) throw new AppError("not_found");
  return toNote(row);
}
