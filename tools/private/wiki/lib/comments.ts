import type { Member } from "@argentic/chest-sdk/member";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { clean, id, limits } from "./model.ts";
import { page, type Page } from "./pages.ts";

// Comments at the bottom of a page: plain text, in the order written.
// Whoever reads a page may comment on it (readers too: a question under a
// policy is how a wiki stays right); they follow the page's access exactly —
// a page the actor cannot see has no comments for them (not_found). Each
// person edits and removes their own; the page's editors (the Chest's
// admins among them) may remove any. A removed comment waits an hour for
// Undo, hidden, then goes for good.

export type Comment = { id: string; author: string; body: string; createdAt: Date; editedAt: Date | null };

type CommentRow = { id: string; author: string; body: string; created_at: Date; edited_at: Date | null };
const toComment = (r: CommentRow): Comment => ({ id: String(r.id), author: r.author, body: r.body, createdAt: r.created_at, editedAt: r.edited_at });

// How long a removed comment can come back.
export const undoMinutes = 60;

export async function comments(sql: Query, actor: Member | null, pageId: unknown): Promise<Comment[]> {
  const p = await page(sql, actor, pageId);
  const found = await sql<CommentRow[]>`
    select id, author, body, created_at, edited_at from page_comments
    where page_id = ${p.id} and removed_at is null order by created_at, id limit ${limits.commentsPerPage}`;
  return found.map(toComment);
}

// addComment answers the comment and the page it is on (for the bell).
export async function addComment(sql: Sql, actor: Member | null, pageId: unknown, body: unknown): Promise<{ comment: Comment; page: Page }> {
  const p = await page(sql, actor, pageId);
  const text = clean(body, limits.comment, { multiline: true });
  await purgeRemoved(sql);
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from page_comments where page_id = ${p.id}`;
  if ((count?.n ?? 0) >= limits.commentsPerPage) throw new AppError("too_many", { max: limits.commentsPerPage });
  const [row] = await sql<CommentRow[]>`
    insert into page_comments (page_id, author, body) values (${p.id}, ${actor!.id}, ${text})
    returning id, author, body, created_at, edited_at`;
  return { comment: toComment(row!), page: p };
}

// The comment as the actor may reach it: on a page they see, not removed
// (unless asked, for Undo).
async function reach(sql: Query, actor: Member | null, commentId: unknown, options: { removed?: boolean } = {}): Promise<{ id: string; author: string; page: Page; removed: boolean }> {
  const key = id(commentId);
  const [row] = await sql<{ page_id: string; author: string; removed: boolean; recent: boolean }[]>`
    select page_id, author, removed_at is not null as removed, removed_at > now() - make_interval(mins => ${undoMinutes}) as recent
    from page_comments where id = ${key}`;
  if (!row) throw new AppError("not_found");
  const p = await page(sql, actor, String(row.page_id));
  if (row.removed && !(options.removed && row.recent)) throw new AppError("not_found");
  return { id: key, author: row.author, page: p, removed: row.removed };
}

export async function editComment(sql: Sql, actor: Member | null, commentId: unknown, body: unknown): Promise<Comment> {
  const c = await reach(sql, actor, commentId);
  if (c.author !== actor!.id) throw new AppError("forbidden");
  const text = clean(body, limits.comment, { multiline: true });
  const [row] = await sql<CommentRow[]>`
    update page_comments set body = ${text}, edited_at = case when body = ${text} then edited_at else now() end
    where id = ${c.id} returning id, author, body, created_at, edited_at`;
  return toComment(row!);
}

const mayRemove = (actor: Member, c: { author: string; page: Page }) => c.author === actor.id || c.page.space.access === "write";

export async function removeComment(sql: Sql, actor: Member | null, commentId: unknown): Promise<void> {
  const c = await reach(sql, actor, commentId);
  if (!mayRemove(actor!, c)) throw new AppError("forbidden");
  await sql`update page_comments set removed_at = now() where id = ${c.id} and removed_at is null`;
  await purgeRemoved(sql);
}

// restoreComment is the Undo of a removal, by whoever may remove it.
export async function restoreComment(sql: Sql, actor: Member | null, commentId: unknown): Promise<void> {
  const c = await reach(sql, actor, commentId, { removed: true });
  if (!mayRemove(actor!, c)) throw new AppError("forbidden");
  await sql`update page_comments set removed_at = null where id = ${c.id}`;
}

// Removed comments past their Undo go for good (on each removal, and every
// morning with the review reminders: no background work of our own).
export async function purgeRemoved(sql: Query): Promise<void> {
  await sql`delete from page_comments where removed_at < now() - make_interval(mins => ${undoMinutes})`;
}

// The people who took part in a page's conversation: its comments' authors.
export async function commenters(sql: Query, pageId: string): Promise<string[]> {
  const found = await sql<{ author: string }[]>`select distinct author from page_comments where page_id = ${pageId} and removed_at is null and author like 'mbr\_%'`;
  return found.map(r => r.author);
}
