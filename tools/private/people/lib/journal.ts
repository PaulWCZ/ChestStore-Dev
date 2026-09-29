import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";

// The journal: who read or changed an employee record, read or downloaded
// the staff register, or changed someone's job details (title, manager…).
// It names the fields, never their values: the journal is not a second copy
// of the record. HR reads it on the record and on the profile; it is kept
// two years. Every sensitive read or write goes through here.
export type Action = "viewed" | "created" | "changed" | "linked" | "document_added" | "document_opened" | "document_removed" | "register_viewed" | "register_exported" | "profile_changed"
  | "imported" | "change_asked" | "change_accepted" | "change_declined" | "letter_printed";
export type Entry = { id: string; at: string; actor: string; action: Action; fields: string[] };

export const keepJournalDays = 730;
// A record opened again by the same person within half an hour (a page
// refreshing itself, back and forth) is one reading.
const sameVisitMinutes = 30;

export async function note(sql: Query, actor: Member | { id: string }, action: Action, about: { recordId?: string | null; memberId?: string | null; fields?: string[] } = {}): Promise<void> {
  const recordId = about.recordId ?? null;
  if (action === "viewed" || action === "register_viewed") {
    const [recent] = await sql`
      select 1 from journal where actor = ${actor.id} and action = ${action}
        and record_id is not distinct from ${recordId}::bigint and at > now() - make_interval(mins => ${sameVisitMinutes}) limit 1`;
    if (recent) return;
  }
  await sql`
    insert into journal (actor, action, record_id, member_id, fields)
    values (${actor.id}, ${action}, ${recordId}, ${about.memberId ?? null}, ${about.fields ?? []}::text[])`;
}

type Row = { id: string; at: Date; actor: string; action: Action; fields: string[] };
const toEntry = (r: Row): Entry => ({ id: String(r.id), at: r.at.toISOString(), actor: r.actor, action: r.action, fields: r.fields });

// The last entries about one record, or about one person's job details.
// Callers check that the reader is HR.
export async function ofRecord(sql: Query, recordId: string, limit = 50): Promise<Entry[]> {
  return (await sql<Row[]>`select id, at, actor, action, fields from journal where record_id = ${recordId} order by at desc, id desc limit ${limit}`).map(toEntry);
}

export async function ofMember(sql: Query, memberId: string, limit = 20): Promise<Entry[]> {
  return (await sql<Row[]>`select id, at, actor, action, fields from journal where member_id = ${memberId} and record_id is null order by at desc, id desc limit ${limit}`).map(toEntry);
}

export async function ofRegister(sql: Query, limit = 20): Promise<Entry[]> {
  return (await sql<Row[]>`select id, at, actor, action, fields from journal where action in ('register_viewed', 'register_exported') order by at desc, id desc limit ${limit}`).map(toEntry);
}

export async function purgeJournal(sql: Query): Promise<number> {
  return (await sql`delete from journal where at < now() - make_interval(days => ${keepJournalDays}) returning id`).length;
}

// Someone whose data was erased: their id leaves the journal ('erased');
// entries about them go with their profile.
export async function forget(sql: Query, memberId: string): Promise<void> {
  await sql`update journal set actor = 'erased' where actor = ${memberId}`;
  await sql`delete from journal where member_id = ${memberId} and record_id is null`;
  await sql`update journal set member_id = null where member_id = ${memberId}`;
}
