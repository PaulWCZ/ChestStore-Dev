import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { activity, manageable, touch } from "./candidates.ts";
import type { Query, Sql } from "./db.ts";
import { clean, id, isLanguage, limits, type Language } from "./model.ts";

// What the team wrote to a candidate and what they answered: one
// conversation per candidate, shown on their page to recruiters (never to
// interviewers: an offer's terms, a private answer). Sending is the
// outbox's (lib/outbox.ts); receiving is lib/mail-in.ts. Codes, never
// sentences.

export type MessageKind = "message" | "rejection" | "interview" | "interview_cancelled" | "confirmation" | "interview_request";
export type MessageStatus = "waiting" | "sent" | "none" | "failed" | "cancelled" | "received" | "bounced";
export type Attachment = { file: string; name: string; type: string; size: number };

export type Message = {
  id: string;
  candidateId: string | null;
  direction: "out" | "in";
  kind: MessageKind;
  author: string | null;
  subject: string;
  body: string;
  fromAddress: string | null;
  fromName: string | null;
  status: MessageStatus;
  sendAfter: string | null;
  createdAt: string;
  sentAt: string | null;
  attachments: { name: string; type: string; size: number }[];
  hasOriginal: boolean;
  hasCalendar: boolean;
  authenticated: boolean | null;
};

type MessageDb = {
  id: string; candidate_id: string | null; direction: "out" | "in"; kind: MessageKind; author: string | null; subject: string; body: string; from_address: string | null; from_name: string | null;
  status: MessageStatus; send_after: Date | null; created_at: Date; sent_at: Date | null; attachments: Attachment[] | null; original: string | null; calendar: string | null; authenticated: boolean | null;
};
const toMessage = (r: MessageDb): Message => ({
  id: String(r.id), candidateId: r.candidate_id === null ? null : String(r.candidate_id), direction: r.direction, kind: r.kind, author: r.author, subject: r.subject, body: r.body,
  fromAddress: r.from_address, fromName: r.from_name, status: r.status, sendAfter: r.send_after ? r.send_after.toISOString() : null, createdAt: r.created_at.toISOString(), sentAt: r.sent_at ? r.sent_at.toISOString() : null,
  attachments: (Array.isArray(r.attachments) ? r.attachments : []).map(a => ({ name: a.name, type: a.type, size: a.size })), hasOriginal: r.original !== null, hasCalendar: r.calendar !== null, authenticated: r.authenticated,
});
const columns = (sql: Query) => sql`id, candidate_id, direction, kind, author, subject, body, from_address, from_name, status, send_after, created_at, sent_at, attachments, original, calendar, authenticated`;

// How long a rejection email waits before it leaves: the Undo of its toast
// is over by then (8 s), and Undo cancels it (candidates.restore).
export const undoSeconds = 15;

// conversation: a candidate's emails, oldest first, for a recruiter.
export async function conversation(sql: Sql, actor: Member | null, candidateId: unknown): Promise<Message[]> {
  const { candidate } = await manageable(sql, actor, candidateId);
  const rows = await sql<MessageDb[]>`select ${columns(sql)} from messages where candidate_id = ${candidate.id} order by created_at, id limit 500`;
  return rows.map(toMessage);
}

// queue puts an email to a candidate in the outbox: now, or after a delay
// (a rejection waits for its Undo). calendar: the .ics of an invitation.
// Says the message's id; the caller asks the outbox to send what is due.
export async function queue(sql: Query, actor: Pick<Member, "id">, candidateId: string, input: { kind: MessageKind; subject: unknown; text: unknown; delaySeconds?: number; calendar?: string }): Promise<string> {
  const subject = clean(input.subject, limits.subject);
  const text = clean(input.text, limits.emailText, { multiline: true });
  const after = new Date(Date.now() + (input.delaySeconds ?? 0) * 1000);
  const [row] = await sql<{ id: string }[]>`
    insert into messages (candidate_id, direction, kind, author, subject, body, status, send_after, calendar)
    values (${candidateId}, 'out', ${input.kind}, ${actor.id}, ${subject}, ${text}, 'waiting', ${after}, ${input.calendar ?? null})
    returning id`;
  return String(row!.id);
}

// rejectionsSent: of these candidates, how many had a rejection email
// leave since `since` (a rejection's time, from rejectCandidate): what
// the toast of a rejection says once its Undo is over, and what an Undo
// that came too late owns up to.
export async function rejectionsSent(sql: Query, actor: Member | null, candidateIds: unknown, since: unknown): Promise<number> {
  if (!Array.isArray(candidateIds) || candidateIds.length === 0 || candidateIds.length > limits.bulk) throw new AppError("invalid");
  const from = typeof since === "string" ? new Date(since) : null;
  if (!from || Number.isNaN(from.getTime())) throw new AppError("invalid");
  const ids: string[] = [];
  for (const candidateId of candidateIds) ids.push((await manageable(sql, actor, candidateId)).candidate.id);
  const [row] = await sql<{ n: number }[]>`
    select count(distinct candidate_id)::int as n from messages
    where candidate_id in ${sql(ids)} and kind = 'rejection' and status = 'sent' and created_at >= ${from}`;
  return row?.n ?? 0;
}

// write: a recruiter's email to a candidate (from a template or not).
export async function write(sql: Sql, actor: Member | null, candidateId: unknown, input: { subject: unknown; text: unknown }): Promise<string> {
  if (!actor) throw new AppError("forbidden");
  const { candidate } = await manageable(sql, actor, candidateId);
  return queue(sql, actor, candidate.id, { kind: "message", subject: input.subject, text: input.text });
}

// writtenOutside: the Chest cannot send emails yet, so the recruiter's own
// mail app opened with the text: the history says it was written there.
export async function writtenOutside(sql: Sql, actor: Member | null, messageId: unknown): Promise<void> {
  if (!actor) throw new AppError("forbidden");
  const [row] = await sql<{ candidate_id: string | null; status: MessageStatus }[]>`select candidate_id, status from messages where id = ${id(messageId)} and direction = 'out'`;
  if (!row || row.candidate_id === null) throw new AppError("not_found");
  await manageable(sql, actor, String(row.candidate_id));
  if (row.status !== "none") return;
  await activity(sql, String(row.candidate_id), actor.id, "written_outside");
  await touch(sql, String(row.candidate_id));
}

// ---- Templates -------------------------------------------------------------

export type Template = { id: string; name: string; language: Language; subject: string; body: string; createdBy: string; updatedAt: string };
type TemplateDb = { id: string; name: string; language: Language; subject: string; body: string; created_by: string; updated_at: Date };
const toTemplate = (r: TemplateDb): Template => ({ id: String(r.id), name: r.name, language: r.language, subject: r.subject, body: r.body, createdBy: r.created_by, updatedAt: r.updated_at.toISOString() });

export async function templates(sql: Sql, actor: Member | null): Promise<Template[]> {
  if (!can(actor, "candidates.manage")) throw new AppError("forbidden");
  return (await sql<TemplateDb[]>`select * from templates order by language, lower(name), id limit ${limits.templates}`).map(toTemplate);
}

export async function saveTemplate(sql: Sql, actor: Member | null, input: { id?: unknown; name: unknown; language: unknown; subject: unknown; body: unknown }): Promise<Template> {
  if (!actor || !can(actor, "settings")) throw new AppError("forbidden");
  const name = clean(input.name, limits.templateName);
  const subject = clean(input.subject, limits.subject);
  const body = clean(input.body, limits.emailText, { multiline: true });
  if (!isLanguage(input.language)) throw new AppError("invalid");
  if (input.id !== undefined && input.id !== null && input.id !== "") {
    const [row] = await sql<TemplateDb[]>`update templates set name = ${name}, language = ${input.language}, subject = ${subject}, body = ${body}, updated_at = now() where id = ${id(input.id)} returning *`;
    if (!row) throw new AppError("not_found");
    return toTemplate(row);
  }
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from templates`;
  if ((count?.n ?? 0) >= limits.templates) throw new AppError("too_many", { max: limits.templates });
  const [row] = await sql<TemplateDb[]>`insert into templates (name, language, subject, body, created_by) values (${name}, ${input.language}, ${subject}, ${body}, ${actor.id}) returning *`;
  return toTemplate(row!);
}

export async function removeTemplate(sql: Sql, actor: Member | null, templateId: unknown): Promise<void> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  await sql`delete from templates where id = ${id(templateId)}`;
}

// ---- Emails no candidate claims ----------------------------------------------

// unmatched: emails to the jobs mailbox the tool could not file (a new
// address, a forwarded CV): the recruiters file them or delete them.
export async function unmatched(sql: Sql, actor: Member | null): Promise<Message[]> {
  if (!can(actor, "candidates.manage")) throw new AppError("forbidden");
  return (await sql<MessageDb[]>`select ${columns(sql)} from messages where candidate_id is null order by created_at desc, id desc limit 100`).map(toMessage);
}

export async function unmatchedCount(sql: Query): Promise<number> {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from messages where candidate_id is null`;
  return row?.n ?? 0;
}

// file puts an unmatched email in a candidate's conversation.
export async function file(sql: Sql, actor: Member | null, messageId: unknown, candidateId: unknown): Promise<void> {
  if (!actor) throw new AppError("forbidden");
  const { candidate } = await manageable(sql, actor, candidateId);
  await sql.begin(async tx => {
    const done = await tx`update messages set candidate_id = ${candidate.id} where id = ${id(messageId)} and candidate_id is null`;
    if (done.count === 0) throw new AppError("not_found");
    await activity(tx, candidate.id, actor.id, "replied", { filed: true });
    await touch(tx, candidate.id);
  });
}

// remove deletes an unmatched email; says its files, for the caller to
// delete from the Chest.
export async function remove(sql: Sql, actor: Member | null, messageId: unknown): Promise<string[]> {
  if (!can(actor, "candidates.manage")) throw new AppError("forbidden");
  const [row] = await sql<{ attachments: Attachment[] | null; original: string | null }[]>`delete from messages where id = ${id(messageId)} and candidate_id is null returning attachments, original`;
  if (!row) throw new AppError("not_found");
  return [...(row.attachments ?? []).map(a => a.file), ...(row.original ? [row.original] : [])];
}

// fileOf: one file of a received email (an attachment by its place, or the
// original), for a recruiter.
export async function fileOf(sql: Sql, actor: Member | null, messageId: unknown, which: unknown): Promise<{ object: string; name: string; type: string }> {
  if (!can(actor, "candidates.manage")) throw new AppError("forbidden");
  const [row] = await sql<{ candidate_id: string | null; attachments: Attachment[] | null; original: string | null; subject: string }[]>`select candidate_id, attachments, original, subject from messages where id = ${id(messageId)} and direction = 'in'`;
  if (!row) throw new AppError("not_found");
  if (row.candidate_id !== null) await manageable(sql, actor, String(row.candidate_id));
  if (which === "original") {
    if (!row.original) throw new AppError("not_found");
    return { object: row.original, name: "message.eml", type: "message/rfc822" };
  }
  const index = Number(which);
  const found = Number.isInteger(index) && index >= 0 ? (row.attachments ?? [])[index] : undefined;
  if (!found) throw new AppError("not_found");
  return { object: found.file, name: found.name, type: found.type };
}

// confirmation: the email that tells a candidate their application
// arrived, queued by the careers page (no member wrote it).
export async function queueConfirmation(sql: Query, candidateId: string, subject: string, text: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into messages (candidate_id, direction, kind, author, subject, body, status, send_after)
    values (${candidateId}, 'out', 'confirmation', null, ${subject.slice(0, 998)}, ${text.slice(0, 100000)}, 'waiting', now())
    returning id`;
  return String(row!.id);
}
