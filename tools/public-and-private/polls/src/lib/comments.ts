import type { Member } from "@argentic/chest-sdk/member";
import { asked, manages, sees } from "./access.ts";
import { AppError } from "@argentic/chest-app";
import type { Query, Sql } from "./db.ts";
import { clean, id, limits } from "./model.ts";
import { load, rights, type Poll } from "./polls.ts";

// Comments on a poll: "I can do the 17th, but only after 8 pm". Flat, named,
// on named polls only — an anonymous poll takes none (a comment carries its
// author's name next to answers that must not). Written by those the poll
// asks and those who manage it, while it is open or closed; removed by
// their author or by those who manage the poll (with undo).
export type Comment = { id: string; author: string; body: string; createdAt: string; mine: boolean; removable: boolean };

async function commentable(sql: Query, actor: Member | null, pollId: unknown): Promise<Poll> {
  const poll = await load(sql, pollId);
  if (!sees(actor, rights(poll))) throw new AppError("not_found");
  if (poll.anonymous || poll.status === "draft") throw new AppError("no_comments");
  if (!asked(actor, rights(poll)) && !manages(actor, rights(poll))) throw new AppError("forbidden");
  return poll;
}

// open: whether this reader may write on this poll.
export function canComment(actor: Member, poll: Poll): boolean {
  return !poll.anonymous && poll.status !== "draft" && !poll.deleted && (asked(actor, rights(poll)) || manages(actor, rights(poll)));
}

export async function list(sql: Query, actor: Member | null, pollId: unknown): Promise<Comment[]> {
  const poll = await load(sql, pollId);
  if (!sees(actor, rights(poll))) throw new AppError("not_found");
  if (poll.anonymous) return [];
  const rows = await sql<{ id: string; author: string; body: string; created_at: Date }[]>`
    select id, author, body, created_at from comments where poll_id = ${poll.id} and deleted_at is null order by id limit ${limits.comments}`;
  const manager = manages(actor, rights(poll));
  return rows.map(r => ({ id: String(r.id), author: r.author, body: r.body, createdAt: new Date(r.created_at).toISOString(), mine: r.author === actor!.id, removable: r.author === actor!.id || manager }));
}

export async function add(sql: Sql, actor: Member | null, pollId: unknown, body: unknown, now = new Date()): Promise<{ comment: Comment; poll: Poll }> {
  const text = clean(body, limits.comment, { multiline: true });
  return sql.begin(async tx => {
    const poll = await commentable(tx, actor, pollId);
    await tx`select id from polls where id = ${poll.id} for update`;
    const [count] = await tx<{ n: number }[]>`select count(*)::int as n from comments where poll_id = ${poll.id} and deleted_at is null`;
    if (count!.n >= limits.comments) throw new AppError("too_many", { max: limits.comments });
    const [row] = await tx<{ id: string }[]>`insert into comments (poll_id, author, body, created_at) values (${poll.id}, ${actor!.id}, ${text}, ${now}) returning id`;
    return { comment: { id: String(row!.id), author: actor!.id, body: text, createdAt: now.toISOString(), mine: true, removable: true }, poll };
  });
}

// remove puts a comment aside (restore brings it back, for the toast's Undo).
export async function remove(sql: Sql, actor: Member | null, commentId: unknown, now = new Date()): Promise<string> {
  return mark(sql, actor, commentId, now);
}

export async function restore(sql: Sql, actor: Member | null, commentId: unknown): Promise<string> {
  return mark(sql, actor, commentId, null);
}

async function mark(sql: Sql, actor: Member | null, commentId: unknown, at: Date | null): Promise<string> {
  const key = id(commentId);
  const [c] = await sql<{ poll_id: string; author: string }[]>`select poll_id, author from comments where id = ${key}`;
  if (!c) throw new AppError("not_found");
  const poll = await load(sql, c.poll_id);
  if (!sees(actor, rights(poll))) throw new AppError("not_found");
  if (c.author !== actor!.id && !manages(actor, rights(poll))) throw new AppError("forbidden");
  await sql`update comments set deleted_at = ${at} where id = ${key}`;
  return String(c.poll_id);
}
