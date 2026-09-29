import type { Member } from "@argentic/chest-sdk/member";
import { can, readerOf } from "./access.ts";
import { visibleTo } from "./read.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { clean, id, limits } from "./model.ts";

// Comments on an objective: everyone with a role writes; the author edits
// or deletes theirs (with Undo), an admin deletes any. A closed cycle keeps
// its conversation open: that is where the retrospective is discussed.

export type Comment = { id: string; author: string; body: string; at: string; edited: boolean };

export async function comments(sql: Query, objectiveId: string): Promise<Comment[]> {
  // What was deleted a month ago is gone for good (nothing runs in the
  // background: the next reader purges it).
  await sql`delete from comments where deleted_at < now() - interval '30 days'`;
  const rows = await sql<{ id: string; author: string; body: string; created_at: Date; edited_at: Date | null }[]>`
    select id, author, body, created_at, edited_at from comments where objective_id = ${objectiveId} and deleted_at is null order by created_at, id limit 500`;
  return rows.map(r => ({ id: String(r.id), author: r.author, body: r.body, at: r.created_at.toISOString(), edited: r.edited_at !== null }));
}

export async function addComment(sql: Sql, actor: Member | null, objectiveId: unknown, body: unknown): Promise<{ comment: Comment; objective: { id: string; title: string; owner: string; keyResultOwners: string[] } }> {
  if (!actor || !can(actor, "comment")) throw new AppError("forbidden");
  const text = clean(body, limits.comment, { multiline: true });
  // A confidential objective's conversation is its readers' only.
  const [o] = await sql<{ id: string; title: string; owner: string }[]>`select o.id, o.title, o.owner from objectives o where o.id = ${id(objectiveId)} and o.archived_at is null ${visibleTo(sql, readerOf(actor))}`;
  if (!o) throw new AppError("not_found");
  const [row] = await sql<{ id: string; created_at: Date }[]>`insert into comments (objective_id, author, body) values (${o.id}, ${actor.id}, ${text}) returning id, created_at`;
  const owners = (await sql<{ owner: string }[]>`select distinct owner from key_results where objective_id = ${o.id} and archived_at is null`).map(r => r.owner);
  return { comment: { id: String(row!.id), author: actor.id, body: text, at: row!.created_at.toISOString(), edited: false }, objective: { id: String(o.id), title: o.title, owner: o.owner, keyResultOwners: owners } };
}

async function mine(sql: Query, actor: Member | null, commentId: unknown, deleted: boolean, adminToo: boolean): Promise<string> {
  if (!actor || !can(actor, "comment")) throw new AppError("forbidden");
  const [row] = await sql<{ id: string; author: string }[]>`
    select c.id, c.author from comments c join objectives o on o.id = c.objective_id and o.archived_at is null
    where c.id = ${id(commentId)} and (c.deleted_at is not null) = ${deleted}`;
  if (!row) throw new AppError("not_found");
  if (row.author !== actor.id && !(adminToo && can(actor, "any.write"))) throw new AppError("forbidden");
  return String(row.id);
}

export async function editComment(sql: Sql, actor: Member | null, commentId: unknown, body: unknown): Promise<void> {
  const text = clean(body, limits.comment, { multiline: true });
  const found = await mine(sql, actor, commentId, false, false);
  await sql`update comments set body = ${text}, edited_at = now() where id = ${found}`;
}

export async function removeComment(sql: Sql, actor: Member | null, commentId: unknown): Promise<void> {
  const found = await mine(sql, actor, commentId, false, true);
  await sql`update comments set deleted_at = now() where id = ${found}`;
}

export async function restoreComment(sql: Sql, actor: Member | null, commentId: unknown): Promise<void> {
  const found = await mine(sql, actor, commentId, true, true);
  await sql`update comments set deleted_at = null where id = ${found}`;
}
