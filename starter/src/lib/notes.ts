import type { Member } from "@argentic/chest-sdk/member";
import type postgres from "postgres";
import { fail } from "../core/tool.ts";

// The notes: the rules and the SQL, nothing about pages. Each function
// takes the database and, for a change, who makes it; it refuses with a
// code (fail), never a sentence.
export type Note = { id: string; body: string; author: string | null; pinned: boolean; createdAt: Date };
export const maxLength = 2000;

const shown = (r: { id: string; body: string; author: string | null; pinned: boolean; created_at: Date }): Note =>
  ({ id: String(r.id), body: r.body, author: r.author, pinned: r.pinned, createdAt: r.created_at });

export async function listNotes(sql: postgres.Sql): Promise<Note[]> {
  const rows = await sql<{ id: string; body: string; author: string | null; pinned: boolean; created_at: Date }[]>`
    select id, body, author, pinned, created_at from notes where deleted_at is null order by pinned desc, created_at desc limit 200`;
  return rows.map(shown);
}

// author: a member's id, or null for a visitor of the public page.
export async function addNote(sql: postgres.Sql, author: string | null, body: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`insert into notes (body, author) values (${body}, ${author}) returning id`;
  return String(row!.id);
}

// Its author, an admin of the Chest, or anyone for a visitor's note.
export const mayChange = (actor: Member, note: { author: string | null }) => note.author === null || note.author === actor.id || actor.isAdmin;

async function changeable(sql: postgres.Sql, actor: Member, id: string, deleted: boolean): Promise<void> {
  const [note] = await sql<{ author: string | null }[]>`select author from notes where id = ${id} and (deleted_at is not null) = ${deleted}`;
  if (!note) fail("not_found");
  else if (!mayChange(actor, note)) fail("forbidden");
}

export async function setPinned(sql: postgres.Sql, actor: Member, id: string, pinned: boolean): Promise<void> {
  await changeable(sql, actor, id, false);
  await sql`update notes set pinned = ${pinned} where id = ${id}`;
}

// Deleted for the team at once; kept 30 days for Undo, then purged.
export async function removeNote(sql: postgres.Sql, actor: Member, id: string): Promise<void> {
  await changeable(sql, actor, id, false);
  await sql`update notes set deleted_at = now() where id = ${id}`;
}

export async function restoreNote(sql: postgres.Sql, actor: Member, id: string): Promise<void> {
  await changeable(sql, actor, id, true);
  await sql`update notes set deleted_at = null where id = ${id}`;
}

export async function purge(sql: postgres.Sql): Promise<number> {
  const gone = await sql`delete from notes where deleted_at < now() - interval '30 days'`;
  await sql`delete from chest_seen where at < now() - interval '30 days'`;
  return gone.count;
}

// A member asked to be forgotten (member.erased): their notes stay, with
// no author.
export async function forget(sql: postgres.Sql, memberId: string): Promise<void> {
  await sql`update notes set author = 'erased' where author = ${memberId}`;
}
