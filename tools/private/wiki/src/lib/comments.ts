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
//
// A comment at the top may get replies (one level: a reply to a reply
// joins the same conversation), may quote the passage of the page it is
// about (chosen on the page: "Comment on this passage"), and is resolved
// when its question is answered — by its author or the page's editors; it
// folds, and a reply or "Reopen" opens it again. Removing a comment at the
// top hides its replies with it.

export type Comment = { id: string; author: string; body: string; createdAt: Date; editedAt: Date | null; parentId: string | null; quote: string | null; resolvedAt: Date | null; resolvedBy: string | null };

type CommentRow = { id: string; author: string; body: string; created_at: Date; edited_at: Date | null; parent_id: string | null; quote: string | null; resolved_at: Date | null; resolved_by: string | null };
const toComment = (r: CommentRow): Comment => ({ id: String(r.id), author: r.author, body: r.body, createdAt: r.created_at, editedAt: r.edited_at, parentId: r.parent_id === null ? null : String(r.parent_id), quote: r.quote, resolvedAt: r.resolved_at, resolvedBy: r.resolved_by });
const columns = "id, author, body, created_at, edited_at, parent_id, quote, resolved_at, resolved_by";

// How long a removed comment can come back.
export const undoMinutes = 60;

export async function comments(sql: Query, actor: Member | null, pageId: unknown): Promise<Comment[]> {
  const p = await page(sql, actor, pageId);
  const found = await sql<CommentRow[]>`
    select c.id, c.author, c.body, c.created_at, c.edited_at, c.parent_id, c.quote, c.resolved_at, c.resolved_by from page_comments c
    left join page_comments up on up.id = c.parent_id
    where c.page_id = ${p.id} and c.removed_at is null and (up.id is null or up.removed_at is null)
    order by c.created_at, c.id limit ${limits.commentsPerPage}`;
  return found.map(toComment);
}

// addComment answers the comment and the page it is on (for the bell);
// with a parent, a reply (to the conversation at the top, reopened if it
// was resolved); with a quote, the passage it is about.
export async function addComment(sql: Sql, actor: Member | null, pageId: unknown, body: unknown, options: { parentId?: unknown; quote?: unknown } = {}): Promise<{ comment: Comment; page: Page; thread: string[] }> {
  const p = await page(sql, actor, pageId);
  const text = clean(body, limits.comment, { multiline: true });
  let parentId: string | null = null;
  let thread: string[] = [];
  if (options.parentId !== undefined && options.parentId !== null && options.parentId !== "") {
    const [up] = await sql<{ id: string; parent_id: string | null }[]>`select id, parent_id from page_comments where id = ${id(options.parentId)} and page_id = ${p.id} and removed_at is null`;
    if (!up) throw new AppError("not_found");
    parentId = String(up.parent_id ?? up.id);
    // Who took part: told of the reply.
    thread = (await sql<{ author: string }[]>`select distinct author from page_comments where (id = ${parentId} or parent_id = ${parentId}) and removed_at is null and author like 'mbr\_%'`).map(r => r.author);
  }
  const quote = parentId !== null || options.quote === undefined || options.quote === null || options.quote === "" ? null : clean(options.quote, limits.quote);
  await purgeRemoved(sql);
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from page_comments where page_id = ${p.id}`;
  if ((count?.n ?? 0) >= limits.commentsPerPage) throw new AppError("too_many", { max: limits.commentsPerPage });
  const row = await sql.begin(async tx => {
    const [made] = await tx<CommentRow[]>`
      insert into page_comments (page_id, author, body, parent_id, quote) values (${p.id}, ${actor!.id}, ${text}, ${parentId}, ${quote})
      returning id, author, body, created_at, edited_at, parent_id, quote, resolved_at, resolved_by`;
    if (parentId) await tx`update page_comments set resolved_at = null, resolved_by = null where id = ${parentId}`;
    return made!;
  });
  return { comment: toComment(row), page: p, thread };
}

// resolveComment folds a conversation (resolved) or opens it again, by
// its author or the page's editors.
export async function resolveComment(sql: Sql, actor: Member | null, commentId: unknown, resolved: boolean): Promise<Comment> {
  const c = await reach(sql, actor, commentId);
  const [top] = await sql<{ parent_id: string | null }[]>`select parent_id from page_comments where id = ${c.id}`;
  if (top?.parent_id) throw new AppError("invalid");
  if (!mayRemove(actor!, c)) throw new AppError("forbidden");
  const [row] = await sql<CommentRow[]>`
    update page_comments set resolved_at = ${resolved ? sql`now()` : null}, resolved_by = ${resolved ? actor!.id : null}
    where id = ${c.id} returning ${sql.unsafe(columns)}`;
  return toComment(row!);
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
    where id = ${c.id} returning ${sql.unsafe(columns)}`;
  return toComment(row!);
}

const mayRemove = (actor: Member, c: { author: string; page: Page }) => c.author === actor.id || c.page.space.access === "write";

export async function removeComment(sql: Sql, actor: Member | null, commentId: unknown): Promise<{ id: string; pageId: string }> {
  const c = await reach(sql, actor, commentId);
  if (!mayRemove(actor!, c)) throw new AppError("forbidden");
  await sql`update page_comments set removed_at = now() where id = ${c.id} and removed_at is null`;
  await purgeRemoved(sql);
  return { id: c.id, pageId: c.page.id };
}

// restoreComment is the Undo of a removal, by whoever may remove it.
export async function restoreComment(sql: Sql, actor: Member | null, commentId: unknown): Promise<Comment> {
  const c = await reach(sql, actor, commentId, { removed: true });
  if (!mayRemove(actor!, c)) throw new AppError("forbidden");
  const [row] = await sql<CommentRow[]>`update page_comments set removed_at = null where id = ${c.id} returning ${sql.unsafe(columns)}`;
  return toComment(row!);
}

// commentOf: a comment by id (for the bell), removed or not.
export async function commentOf(sql: Query, commentId: string): Promise<(Comment & { pageId: string }) | null> {
  const [row] = await sql<(CommentRow & { page_id: string })[]>`select ${sql.unsafe(columns)}, page_id from page_comments where id = ${commentId}`;
  return row ? { ...toComment(row), pageId: String(row.page_id) } : null;
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
