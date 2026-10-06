import type { Member } from "@argentic/chest-sdk/member";
import { fail } from "@argentic/chest-app";
import { db } from "@argentic/chest-app/db";

// EXAMPLE (Notes): the rules and the SQL, nothing about pages. A function
// that changes something takes who does it, checks they may, and refuses
// with a code (fail), never a sentence.
export type Note = { id: string; body: string; author: string | null; pinned: boolean; createdAt: Date };
export const maxLength = 2000;
// Messages from the public page, at most this many a day: anyone on the
// Internet can write there, so the table is bounded.
export const visitorsPerDay = 50;

type Row = { id: string; body: string; author: string | null; pinned: boolean; created_at: Date };
const shown = (r: Row): Note => ({ id: r.id, body: r.body, author: r.author, pinned: r.pinned, createdAt: r.created_at });

export async function listNotes(): Promise<Note[]> {
  const rows = await db()<Row[]>`select id, body, author, pinned, created_at from notes where deleted_at is null order by pinned desc, created_at desc limit 200`;
  return rows.map(shown);
}

export async function addNote(author: Member, body: string): Promise<string> {
  const [row] = await db()<{ id: string }[]>`insert into notes (body, author) values (${body}, ${author.id}) returning id`;
  return row!.id;
}

// A visitor's message: refused once the day's are counted ("busy").
export async function addVisitorNote(body: string): Promise<void> {
  const [row] = await db()<{ id: string }[]>`
    insert into notes (body, author) select ${body}, null
    where (select count(*) from notes where author is null and created_at > now() - interval '1 day') < ${visitorsPerDay}
    returning id`;
  if (!row) fail("busy");
}

// Its author, an admin of the Chest, or anyone for a visitor's note.
export const mayChange = (actor: Member, note: { author: string | null }) => note.author === null || note.author === actor.id || actor.isAdmin;

async function changeable(actor: Member, id: string, deleted: boolean): Promise<void> {
  const [note] = await db()<{ author: string | null }[]>`select author from notes where id = ${id} and (deleted_at is not null) = ${deleted}`;
  if (!note) fail("not_found");
  else if (!mayChange(actor, note)) fail("forbidden");
}

export async function setPinned(actor: Member, id: string, pinned: boolean): Promise<void> {
  await changeable(actor, id, false);
  await db()`update notes set pinned = ${pinned} where id = ${id}`;
}

// Gone for the team at once, kept 30 days for Undo; older ones are purged
// here (no schedule needed for that).
export async function removeNote(actor: Member, id: string): Promise<void> {
  await changeable(actor, id, false);
  await db()`update notes set deleted_at = now() where id = ${id}`;
  await db()`delete from notes where deleted_at < now() - interval '30 days'`;
}

export async function restoreNote(actor: Member, id: string): Promise<void> {
  await changeable(actor, id, true);
  await db()`update notes set deleted_at = null where id = ${id}`;
}

// A member asked to be forgotten (member.erased): their notes stay, with
// no author.
export async function forget(memberId: string): Promise<void> {
  await db()`update notes set author = 'erased' where author = ${memberId}`;
}
