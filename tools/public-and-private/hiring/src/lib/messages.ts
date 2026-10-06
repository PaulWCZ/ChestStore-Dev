import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import * as files from "@argentic/chest-sdk/files";
import { activity, manageable, touch } from "./candidates.ts";
import { accept, copy, remove as removeFiles } from "./cv.ts";
import type { Query, Sql } from "./db.ts";
import { clean, id, isLanguage, limits, type Language } from "../shared/model.ts";

// What the team wrote to a candidate: one conversation per candidate,
// shown on their page to recruiters (never to interviewers: an offer's
// terms). Sending is the outbox's (lib/outbox.ts). The Chest receives no
// mail (owner's decision, 6 October 2026): a candidate's answer reaches the
// company's usual inbox, not Hiring. Emails an earlier version received
// (direction 'in') stay in the table, unread here. Codes, never sentences.

export type MessageKind = "message" | "rejection" | "interview" | "interview_cancelled" | "confirmation" | "interview_request";
export type MessageStatus = "waiting" | "sent" | "none" | "failed" | "cancelled" | "bounced";
export type Attachment = { file: string; name: string; type: string; size: number };

export type Message = {
  id: string;
  candidateId: string | null;
  kind: MessageKind;
  author: string | null;
  subject: string;
  body: string;
  status: MessageStatus;
  sendAfter: string | null;
  createdAt: string;
  sentAt: string | null;
  attachments: { name: string; type: string; size: number }[];
  hasCalendar: boolean;
};

type MessageDb = {
  id: string; candidate_id: string | null; kind: MessageKind; author: string | null; subject: string; body: string;
  status: MessageStatus; send_after: Date | null; created_at: Date; sent_at: Date | null; attachments: Attachment[] | null; calendar: string | null;
};
const toMessage = (r: MessageDb): Message => ({
  id: String(r.id), candidateId: r.candidate_id === null ? null : String(r.candidate_id), kind: r.kind, author: r.author, subject: r.subject, body: r.body,
  status: r.status, sendAfter: r.send_after ? r.send_after.toISOString() : null, createdAt: r.created_at.toISOString(), sentAt: r.sent_at ? r.sent_at.toISOString() : null,
  attachments: (Array.isArray(r.attachments) ? r.attachments : []).map(a => ({ name: a.name, type: a.type, size: a.size })), hasCalendar: r.calendar !== null,
});
const columns = (sql: Query) => sql`id, candidate_id, kind, author, subject, body, status, send_after, created_at, sent_at, attachments, calendar`;

// How long a rejection email waits before it leaves: the Undo of its toast
// is over by then (8 s), and Undo cancels it (candidates.restore).
export const undoSeconds = 15;

// conversation: a candidate's emails, oldest first, for a recruiter.
export async function conversation(sql: Sql, actor: Member | null, candidateId: unknown): Promise<Message[]> {
  const { candidate } = await manageable(sql, actor, candidateId);
  const rows = await sql<MessageDb[]>`select ${columns(sql)} from messages where candidate_id = ${candidate.id} and direction = 'out' order by created_at, id limit 500`;
  return rows.map(toMessage);
}

// queue puts an email to a candidate in the outbox: now, or after a delay
// (a rejection waits for its Undo). calendar: the .ics of an invitation.
// Says the message's id; the caller asks the outbox to send what is due.
export async function queue(sql: Query, actor: Pick<Member, "id">, candidateId: string, input: { kind: MessageKind; subject: unknown; text: unknown; delaySeconds?: number; calendar?: string; attachments?: Attachment[] }): Promise<string> {
  const subject = clean(input.subject, limits.subject);
  const text = clean(input.text, limits.emailText, { multiline: true });
  const after = new Date(Date.now() + (input.delaySeconds ?? 0) * 1000);
  const [row] = await sql<{ id: string }[]>`
    insert into messages (candidate_id, direction, kind, author, subject, body, status, send_after, calendar, attachments)
    values (${candidateId}, 'out', ${input.kind}, ${actor.id}, ${subject}, ${text}, 'waiting', ${after}, ${input.calendar ?? null}, ${sql.json((input.attachments ?? []) as never)})
    returning id`;
  return String(row!.id);
}

// Files sent with an email (an offer letter): five at most, 9 MiB together
// (the Chest's mail takes 10 MiB a message, its text included).
export const attachLimits = { count: 5, total: 9 << 20 } as const;
export type NewFile = { ticket: unknown; name: unknown };

// takeFiles claims the files a recruiter's browser sent (their tickets,
// lib/cv.ts: checked, moved to folder), and copies the template's files
// they kept. All or nothing: a refusal deletes what was taken.
async function takeFiles(folder: "sent" | "templates", uploaded: unknown, fromTemplate: Attachment[]): Promise<Attachment[]> {
  const sent = uploaded === undefined || uploaded === null ? [] : uploaded;
  if (!Array.isArray(sent) || sent.length + fromTemplate.length > attachLimits.count) throw new AppError("too_many_files", { max: attachLimits.count });
  const kept: Attachment[] = [];
  try {
    for (const f of fromTemplate) {
      const c = await copy(f.file, folder);
      if (!c) throw new AppError("not_found");
      kept.push({ file: c.object, name: f.name, type: c.type, size: c.size });
    }
    for (const f of sent as NewFile[]) {
      const c = await accept(f?.ticket, "team", f?.name, folder);
      kept.push({ file: c.object, name: c.fileName, type: c.type, size: c.size });
    }
    if (kept.reduce((n, f) => n + f.size, 0) > attachLimits.total) throw new AppError("files_too_large", { max: attachLimits.total >> 20 });
    return kept;
  } catch (error) {
    await removeFiles(kept.map(f => f.file));
    // A CV's words would be wrong here: a file's.
    if (error instanceof AppError && (error.code === "cv_invalid" || error.code === "cv_missing")) throw new AppError("file_invalid");
    if (error instanceof AppError && error.code === "cv_too_large") throw new AppError("files_too_large", { max: attachLimits.total >> 20 });
    throw error;
  }
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

// write: a recruiter's email to a candidate (from a template or not), with
// files: the ones they added (tickets of uploads) and those of the company
// template they started from that they kept (templateFiles: their objects).
// Each file is the email's own copy (sent/), kept in the conversation and
// erased with the candidate.
export async function write(sql: Sql, actor: Member | null, candidateId: unknown, input: { subject: unknown; text: unknown; files?: unknown; template?: unknown; templateFiles?: unknown }): Promise<string> {
  if (!actor) throw new AppError("forbidden");
  const { candidate } = await manageable(sql, actor, candidateId);
  const subject = clean(input.subject, limits.subject);
  const text = clean(input.text, limits.emailText, { multiline: true });
  let fromTemplate: Attachment[] = [];
  if (input.template !== undefined && input.template !== null && input.template !== "" && Array.isArray(input.templateFiles) && input.templateFiles.length > 0) {
    const [row] = await sql<{ attachments: Attachment[] | null }[]>`select attachments from templates where id = ${id(input.template)}`;
    if (!row) throw new AppError("not_found");
    const wanted = new Set(input.templateFiles.filter((x): x is string => typeof x === "string"));
    fromTemplate = (row.attachments ?? []).filter(a => wanted.has(a.file));
  }
  const attachments = await takeFiles("sent", input.files, fromTemplate);
  try {
    return await queue(sql, actor, candidate.id, { kind: "message", subject, text, attachments });
  } catch (error) {
    await removeFiles(attachments.map(f => f.file));
    throw error;
  }
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

// attachments: files sent with every email written from it (the offer
// letter), each a file of the tool's (templates/…).
export type Template = { id: string; name: string; language: Language; subject: string; body: string; createdBy: string; updatedAt: string; attachments: Attachment[] };
type TemplateDb = { id: string; name: string; language: Language; subject: string; body: string; created_by: string; updated_at: Date; attachments: Attachment[] | null };
const toTemplate = (r: TemplateDb): Template => ({ id: String(r.id), name: r.name, language: r.language, subject: r.subject, body: r.body, createdBy: r.created_by, updatedAt: r.updated_at.toISOString(), attachments: Array.isArray(r.attachments) ? r.attachments : [] });

export async function templates(sql: Sql, actor: Member | null): Promise<Template[]> {
  if (!can(actor, "candidates.manage")) throw new AppError("forbidden");
  return (await sql<TemplateDb[]>`select * from templates order by language, lower(name), id limit ${limits.templates}`).map(toTemplate);
}

// saveTemplate: files — the ones added (tickets), and keep: those it had
// that stay (their objects, under templates/). A file left out stays in
// the tool's files until the nightly sweep (sweepTemplateFiles), so that
// Undo of a deletion brings the template back whole.
export async function saveTemplate(sql: Sql, actor: Member | null, input: { id?: unknown; name: unknown; language: unknown; subject: unknown; body: unknown; files?: unknown; keep?: unknown }): Promise<Template> {
  if (!actor || !can(actor, "settings")) throw new AppError("forbidden");
  const name = clean(input.name, limits.templateName);
  const subject = clean(input.subject, limits.subject);
  const body = clean(input.body, limits.emailText, { multiline: true });
  if (!isLanguage(input.language)) throw new AppError("invalid");
  if (input.keep !== undefined && (!Array.isArray(input.keep) || input.keep.length > attachLimits.count)) throw new AppError("invalid");
  // Files it keeps: the tool's own template files, as they are.
  const kept: Attachment[] = [];
  for (const k of (input.keep ?? []) as unknown[]) {
    const f = k as Partial<Attachment> | null;
    if (!f || typeof f.file !== "string" || !/^templates\/[0-9a-f]{20}\.(pdf|docx?|jpg|png|heic)$/u.test(f.file)) throw new AppError("invalid");
    const held = await files.stat(f.file).catch(() => null);
    if (!held) throw new AppError("not_found");
    kept.push({ file: f.file, name: clean(f.name, limits.fileName), type: held.type.split(";")[0]!.trim(), size: held.size });
  }
  const added = await takeFiles("templates", input.files, []);
  const attachments = [...kept, ...added];
  if (attachments.length > attachLimits.count || attachments.reduce((n, f) => n + f.size, 0) > attachLimits.total) {
    await removeFiles(added.map(f => f.file));
    throw new AppError(attachments.length > attachLimits.count ? "too_many_files" : "files_too_large", { max: attachments.length > attachLimits.count ? attachLimits.count : attachLimits.total >> 20 });
  }
  if (input.id !== undefined && input.id !== null && input.id !== "") {
    const [row] = await sql<TemplateDb[]>`update templates set name = ${name}, language = ${input.language}, subject = ${subject}, body = ${body}, attachments = ${sql.json(attachments as never)}, updated_at = now() where id = ${id(input.id)} returning *`;
    if (!row) throw new AppError("not_found");
    return toTemplate(row);
  }
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from templates`;
  if ((count?.n ?? 0) >= limits.templates) throw new AppError("too_many", { max: limits.templates });
  const [row] = await sql<TemplateDb[]>`insert into templates (name, language, subject, body, created_by, attachments) values (${name}, ${input.language}, ${subject}, ${body}, ${actor.id}, ${sql.json(attachments as never)}) returning *`;
  return toTemplate(row!);
}

// sweepTemplateFiles: the nightly cleanup deletes the template files no
// template holds any more (a file taken off, a template deleted), a day
// after they were last written.
export async function sweepTemplateFiles(sql: Sql, now = new Date()): Promise<number> {
  const held = new Set((await sql<{ file: string }[]>`select a->>'file' as file from templates t, jsonb_array_elements(t.attachments) a`).map(r => r.file));
  let gone = 0;
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const { files: list, next } = await files.list({ prefix: "templates/", ...(after ? { after } : {}) });
    for (const f of list) {
      if (!held.has(f.name) && now.getTime() - new Date(f.updated).getTime() > 86400000) {
        await removeFiles([f.name]);
        gone++;
      }
    }
    if (!next) break;
    after = next;
  }
  return gone;
}

export async function removeTemplate(sql: Sql, actor: Member | null, templateId: unknown): Promise<void> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  await sql`delete from templates where id = ${id(templateId)}`;
}

// fileOf: one file of an email the team sent (an attachment by its
// place), for a recruiter.
export async function fileOf(sql: Sql, actor: Member | null, messageId: unknown, which: unknown): Promise<{ object: string; name: string; type: string }> {
  if (!can(actor, "candidates.manage")) throw new AppError("forbidden");
  const [row] = await sql<{ candidate_id: string | null; attachments: Attachment[] | null }[]>`select candidate_id, attachments from messages where id = ${id(messageId)} and direction = 'out'`;
  if (!row || row.candidate_id === null) throw new AppError("not_found");
  await manageable(sql, actor, String(row.candidate_id));
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
