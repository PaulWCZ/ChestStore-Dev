import type { Member } from "@argentic/chest-sdk/member";
import { can, recordAccess } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import type { Query, Sql } from "./db.ts";
import { format } from "../i18n/index.ts";
import { note } from "./journal.ts";
import { clean, id } from "../shared/model.ts";
import { cut, notify, withdraw } from "./notify.ts";
import { everyone, people } from "./people.ts";
import { read, updateRecord, type Fields } from "./records.ts";

// "Request a change" on My HR record: the person asks HR to change their
// home address or emergency contact (a move, a new phone), HR accepts it
// (the record changes, written in the journal as HR's change) or declines
// it with a word. One request waits at a time per record; the person may
// take it back. The asked values live in the request only while it waits,
// then only the fields' names stay (the journal never keeps values).
// Everything else of the record (contract, identity) is HR's to write from
// documents: the person tells HR.
export const askable = ["address", "emergencyName", "emergencyRelation", "emergencyPhone"] as const;
export type Askable = (typeof askable)[number];
export type Asked = Partial<Pick<Fields, Askable>>;
export type ChangeRequest = { id: string; recordId: string; memberId: string; changes: Asked; note: string; createdAt: string };
const noteMax = 300;
const key = (requestId: string) => `change:${requestId}`;

type Row = { id: string; record_id: string; member_id: string; changes: Asked | string[]; note: string; created_at: Date };
const toRequest = (r: Row): ChangeRequest => ({
  id: String(r.id), recordId: String(r.record_id), memberId: r.member_id, changes: Array.isArray(r.changes) ? {} : r.changes, note: r.note, createdAt: r.created_at.toISOString(),
});

async function hrIds(): Promise<string[]> {
  return (await everyone({ role: "hr" })).people.map(p => p.id);
}

// The person asks: only their own record, only the askable fields, only
// what differs from the record.
export async function askChange(sql: Sql, actor: Member | null, recordId: unknown, input: unknown): Promise<ChangeRequest> {
  const key_ = id(recordId);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AppError("invalid");
  const given = input as { [k: string]: unknown };
  const fields = Object.fromEntries(Object.entries(given).filter(([k]) => (askable as readonly string[]).includes(k)));
  const extra = Object.keys(given).filter(k => k !== "note" && !(askable as readonly string[]).includes(k));
  if (extra.length > 0) throw new AppError("invalid");
  const asked = read(fields) as Asked;
  const text = clean(given["note"] ?? "", noteMax, { optional: true, multiline: true });
  const made = await sql.begin(async tx => {
    const [record] = await tx<{ member_id: string | null; address: string; emergency_name: string; emergency_relation: string; emergency_phone: string; erased_at: Date | null }[]>`
      select member_id, address, emergency_name, emergency_relation, emergency_phone, erased_at from records where id = ${key_} for update`;
    // Only the person asks; HR edits the record itself.
    if (!record || record.erased_at || recordAccess(actor, { memberId: record.member_id }) === null || record.member_id !== actor!.id) throw new AppError("not_found");
    const current: Asked = { address: record.address, emergencyName: record.emergency_name, emergencyRelation: record.emergency_relation, emergencyPhone: record.emergency_phone };
    const changes = Object.fromEntries(Object.entries(asked).filter(([k, v]) => current[k as Askable] !== v)) as Asked;
    if (Object.keys(changes).length === 0) throw new AppError("empty");
    const [waiting] = await tx`select 1 from record_requests where record_id = ${key_} and status = 'waiting'`;
    if (waiting) throw new AppError("already_asked");
    const [row] = await tx<Row[]>`
      insert into record_requests (record_id, member_id, changes, note) values (${key_}, ${actor!.id}, ${tx.json(changes)}, ${text})
      returning id, record_id, member_id, changes, note, created_at`;
    await note(tx, actor!, "change_asked", { recordId: key_, fields: Object.keys(changes) });
    return toRequest(row!);
  });
  const hr = (await hrIds()).filter(h => h !== actor!.id);
  await notify(hr, t => ({ title: format(t.bell.changeAsked, { name: actor!.name }), ...(made.note ? { body: cut(made.note, 280) } : {}) }), { path: `/chest/records/${key_}`, key: key(made.id) });
  return made;
}

// The waiting request of a record, for HR or its person.
export async function waitingChange(sql: Query, actor: Member | null, recordId: unknown): Promise<ChangeRequest | null> {
  const key_ = id(recordId);
  const [row] = await sql<(Row & { owner: string | null })[]>`
    select q.id, q.record_id, q.member_id, q.changes, q.note, q.created_at, r.member_id as owner
    from record_requests q join records r on r.id = q.record_id where q.record_id = ${key_} and q.status = 'waiting'`;
  if (!row || recordAccess(actor, { memberId: row.owner }) === null) return null;
  return toRequest(row);
}

// HR's list: every request waiting, oldest first.
export async function waitingChanges(sql: Query, actor: Member | null): Promise<(ChangeRequest & { legalName: string })[]> {
  if (!actor || !can(actor, "records.manage")) throw new AppError("forbidden");
  const rows = await sql<(Row & { legal_name: string })[]>`
    select q.id, q.record_id, q.member_id, q.changes, q.note, q.created_at, r.legal_name
    from record_requests q join records r on r.id = q.record_id where q.status = 'waiting' order by q.created_at, q.id limit 200`;
  return rows.map(r => ({ ...toRequest(r), legalName: r.legal_name }));
}

// The person takes their request back.
export async function withdrawChange(sql: Sql, actor: Member | null, requestId: unknown): Promise<void> {
  if (!actor) throw new AppError("forbidden");
  const done = await sql<{ id: string }[]>`
    update record_requests set status = 'withdrawn', changes = to_jsonb(array(select jsonb_object_keys(changes))), decided_by = ${actor.id}, decided_at = now()
    where id = ${id(requestId)} and member_id = ${actor.id} and status = 'waiting' returning id`;
  if (done.length === 0) throw new AppError("not_found");
  await withdraw(key(String(done[0]!.id)));
}

// HR answers: accepted, the record takes the asked values (a change of
// HR's in the journal); declined, with an optional word. The person is
// told in the bell either way.
export async function decideChange(sql: Sql, actor: Member | null, requestId: unknown, accept: unknown, answer: unknown = ""): Promise<{ changed: string[] }> {
  if (!actor || !can(actor, "records.manage")) throw new AppError("forbidden");
  if (typeof accept !== "boolean") throw new AppError("invalid");
  const text = clean(answer ?? "", noteMax, { optional: true, multiline: true });
  const [row] = await sql<Row[]>`select id, record_id, member_id, changes, note, created_at from record_requests where id = ${id(requestId)} and status = 'waiting'`;
  if (!row) throw new AppError("not_found");
  const request = toRequest(row);
  let changed: string[] = [];
  if (accept) changed = (await updateRecord(sql, actor, request.recordId, request.changes)).changed;
  const settled = await sql`
    update record_requests set status = ${accept ? "accepted" : "declined"}, answer = ${text}, changes = to_jsonb(array(select jsonb_object_keys(changes))),
      decided_by = ${actor.id}, decided_at = now()
    where id = ${request.id} and status = 'waiting'`;
  if (settled.count === 0) throw new AppError("not_found");
  await note(sql, actor, accept ? "change_accepted" : "change_declined", { recordId: request.recordId, fields: Object.keys(request.changes) });
  await withdraw(key(request.id));
  if (request.memberId !== actor.id && (await people([request.memberId])).get(request.memberId)?.status === "member") {
    await notify([request.memberId], t => ({
      title: accept ? t.bell.changeAccepted : t.bell.changeDeclined,
      ...(text ? { body: cut(text, 280) } : {}),
    }), { path: `/chest/records/${request.recordId}`, key: `${key(request.id)}:answer` });
  }
  return { changed };
}

// An erasure: the person's requests go (their values with them).
export async function forgetChanges(sql: Query, member: string): Promise<void> {
  await sql`delete from record_requests where member_id = ${member}`;
  await sql`update record_requests set decided_by = 'erased' where decided_by = ${member}`;
}
