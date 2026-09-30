import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { candidate as readCandidate, manageable } from "./candidates.ts";
import { toCsv } from "./csv.ts";
import type { Sql } from "./db.ts";
import type { Catalogue } from "./i18n/index.ts";
import { ofCandidate } from "./interviews.ts";
import { conversation, type Attachment } from "./messages.ts";
import { cvTypes, isCvType, slugify } from "./model.ts";
import { stageLabel } from "./stages.ts";
import type { Entry } from "./zip.ts";

// Leaving is part of the product: "Export everything" gives a recruiter
// every job, candidate, note, feedback, email, interview and history line
// as spreadsheets, with every CV — the company's data, readable without
// the tool. And a candidate's own data, for their right of access
// (GDPR art. 15): what they sent, what the team wrote about them, the
// emails, as one archive.

const csvOf = (rows: (string | number | null | undefined)[][]) => new TextEncoder().encode(toCsv(rows.map(r => r.map(v => (v === null || v === undefined ? "" : v)))));
const day = (d: Date | string | null) => (d === null ? "" : (typeof d === "string" ? d : d.toISOString()).slice(0, 16).replace("T", " "));
const extension = (type: string | null) => (type && isCvType(type) ? cvTypes[type] : "docx");

// The files of emails — sent (an offer letter, a template's files) and
// received (what a candidate attached) — each under its email's folder,
// by the name it had: "emails/<email id>/offer.pdf". A name is one path
// segment (no slash nor backslash, no leading dot) and never twice in one email.
const segment = (name: string) => name.replace(/[\\/\u0000-\u001f]/gu, "_").replace(/^\.+/u, "_").slice(0, 200) || "file";
export function emailFiles(message: { id: string; attachments: Attachment[] | null }, folder = "emails"): { path: string; file: string }[] {
  const used = new Set<string>();
  return (Array.isArray(message.attachments) ? message.attachments : []).filter(a => typeof a.file === "string").map(a => {
    const base = segment(String(a.name ?? ""));
    let path = `${folder}/${message.id}/${base}`;
    for (let n = 2; used.has(path); n++) path = `${folder}/${message.id}/${n}-${base}`;
    used.add(path);
    return { path, file: a.file };
  });
}
// One file of the Chest's, or nothing when it is gone (erased, expired).
async function* read(list: { path: string; file: string }[]): AsyncGenerator<Entry> {
  for (const f of list) {
    const file = await files.get(f.file).catch(() => null);
    if (file) yield { name: f.path, data: file.data };
  }
}

export async function* everything(sql: Sql, actor: Member | null, t: Catalogue): AsyncGenerator<Entry> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const h = t.exportAll.headers;
  const jobs = await sql<{ id: string; slug: string; title: string; team: string; place: string; contract: string; remote: string; state: string; language: string; created_at: Date; opened_at: Date | null; closed_at: Date | null; description: string }[]>`select * from jobs order by id`;
  yield { name: "jobs.csv", data: csvOf([[h.id, h.title, h.team, h.place, h.contract, h.remote, h.state, h.language, h.created, h.opened, h.closed, h.address, h.description],
    ...jobs.map(j => [j.id, j.title, j.team, j.place, t.facts.contract[j.contract as "permanent"], t.facts.remote[j.remote as "onsite"], t.home.states[j.state as "open"], j.language, day(j.created_at), day(j.opened_at), day(j.closed_at), "/" + j.slug, j.description])]) };
  const stages = await sql<{ id: string; job_id: string; name: string | null; preset: "new" | null; position: number; hired: boolean }[]>`select id, job_id, name, preset, position, hired from stages order by job_id, position`;
  const stageName = (id: string) => stageLabel(stages.find(s => String(s.id) === String(id)), t.jobSettings.defaults);
  const people = await sql<{ id: string; job_id: string; stage_id: string; status: string; name: string; email: string; phone: string; link: string; cover_letter: string; source: string; language: string; reject_reason: string | null; created_at: Date; last_activity_at: Date; pool_at: Date | null; answers: { label: string; answer: string }[]; cv_object: string | null; cv_type: string | null; origin: string }[]>`
    select * from candidates order by id`;
  yield { name: "candidates.csv", data: csvOf([[h.id, h.job, t.export.headers.name, t.export.headers.email, t.export.headers.phone, t.export.headers.link, t.export.headers.stage, t.export.headers.status, t.export.headers.reason, t.export.headers.source, h.language, t.export.headers.applied, t.export.headers.activity, h.pool, h.answers, h.coverLetter, h.cv],
    ...people.map(c => [c.id, c.job_id, c.name, c.email, c.phone, c.link, stageName(c.stage_id), t.export.status[c.status as "active"], c.reject_reason ? t.reject.reasons[c.reject_reason as "other"] : "", t.candidate.source[c.source as "careers"] + (c.origin ? ` (${c.origin})` : ""), c.language, day(c.created_at), day(c.last_activity_at), day(c.pool_at),
      (Array.isArray(c.answers) ? c.answers : []).map(a => `${a.label}: ${a.answer}`).join("\n"), c.cover_letter, c.cv_object ? `cv/${c.id}.${extension(c.cv_type)}` : ""])]) };
  const notes = await sql<{ candidate_id: string; author: string; body: string; created_at: Date }[]>`select candidate_id, author, body, created_at from notes order by candidate_id, created_at`;
  yield { name: "notes.csv", data: csvOf([[h.candidate, h.author, h.text, h.date], ...notes.map(n => [n.candidate_id, n.author, n.body, day(n.created_at)])]) };
  const feedback = await sql<{ candidate_id: string; author: string; rating: number; strengths: string; concerns: string; recommendation: string; updated_at: Date }[]>`select * from feedback order by candidate_id, created_at`;
  yield { name: "feedback.csv", data: csvOf([[h.candidate, h.author, t.candidate.rating, t.candidate.strengths, t.candidate.concerns, t.candidate.recommendation, h.date],
    ...feedback.map(f => [f.candidate_id, f.author, f.rating, f.strengths, f.concerns, t.candidate.recommendations[f.recommendation as "yes"], day(f.updated_at)])]) };
  const mails = await sql<{ id: string; candidate_id: string | null; direction: string; kind: string; author: string | null; from_address: string | null; subject: string; body: string; status: string; created_at: Date; attachments: Attachment[] | null }[]>`select * from messages order by candidate_id, created_at, id`;
  const mailFiles = new Map(mails.map(m => [m, emailFiles({ id: String(m.id), attachments: m.attachments })]));
  yield { name: "emails.csv", data: csvOf([[h.candidate, h.direction, h.author, h.subject, h.text, h.status, h.date, h.files],
    ...mails.map(m => [m.candidate_id ?? "", m.direction === "in" ? h.in : h.out, m.author ?? m.from_address ?? "", m.subject, m.body, m.status, day(m.created_at), mailFiles.get(m)!.map(f => f.path).join("\n")])]) };
  const interviews = await sql<{ candidate_id: string; starts_at: Date; ends_at: Date; place: string; people: string[]; cancelled_at: Date | null }[]>`
    select i.candidate_id, i.starts_at, i.ends_at, i.place, i.cancelled_at, coalesce((select array_agg(p.member_id) from interview_people p where p.interview_id = i.id), '{}') as people from interviews i order by i.starts_at`;
  yield { name: "interviews.csv", data: csvOf([[h.candidate, h.start, h.end, h.place, h.people, h.cancelled], ...interviews.map(i => [i.candidate_id, day(i.starts_at), day(i.ends_at), i.place, i.people.join(" "), day(i.cancelled_at)])]) };
  const log = await sql<{ candidate_id: string; actor: string | null; kind: string; data: unknown; created_at: Date }[]>`select candidate_id, actor, kind, data, created_at from activity order by candidate_id, created_at`;
  yield { name: "history.csv", data: csvOf([[h.candidate, h.author, h.kind, h.details, h.date], ...log.map(a => [a.candidate_id, a.actor ?? "", a.kind, JSON.stringify(a.data ?? {}), day(a.created_at)])]) };
  // Every CV, one at a time: the archive never holds them all in memory.
  for (const c of people) {
    if (!c.cv_object) continue;
    const file = await files.get(c.cv_object).catch(() => null);
    if (file) yield { name: `cv/${c.id}.${extension(c.cv_type)}`, data: file.data };
  }
  // Every email's files, one at a time too.
  for (const list of mailFiles.values()) yield* read(list);
  yield { name: "README.txt", data: new TextEncoder().encode(t.exportAll.readme) };
}

// theirData: one candidate's archive, for their right of access.
export async function theirData(sql: Sql, actor: Member | null, candidateId: unknown, t: Catalogue): Promise<{ name: string; entries: Entry[] }> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const { cvObject } = await manageable(sql, actor, candidateId);
  const d = await readCandidate(sql, actor, candidateId);
  const mails = await conversation(sql, actor, candidateId);
  const interviews = await ofCandidate(sql, actor, candidateId);
  const c = d.candidate;
  // The files of their emails, both ways (the offer letter sent, what they
  // attached): part of what the team holds about them.
  const attached = await sql<{ id: string; attachments: Attachment[] | null }[]>`select id, attachments from messages where candidate_id = ${c.id}`;
  const filesOf = new Map(attached.map(m => [String(m.id), emailFiles({ id: String(m.id), attachments: m.attachments })]));
  const data = {
    candidate: { name: c.name, email: c.email, phone: c.phone, link: c.link, language: c.language, coverLetter: c.coverLetter, answers: c.answers, appliedAt: c.createdAt, source: c.source, keptInPoolSince: c.poolAt, lastActivityAt: c.lastActivityAt },
    job: { title: d.job.title, stage: stageLabel(d.stages.find(s => s.id === c.stageId), t.jobSettings.defaults), status: c.status, rejectReason: c.rejectReason },
    feedback: [...(d.mine ? [d.mine] : []), ...d.others].map(f => ({ rating: f.rating, strengths: f.strengths, concerns: f.concerns, recommendation: f.recommendation, at: f.updatedAt })),
    notes: d.notes.map(n => ({ text: n.body, at: n.at })),
    interviews: interviews.map(i => ({ start: i.start, end: i.end, place: i.place, cancelled: i.cancelled })),
    emails: mails.map(m => ({ direction: m.direction, subject: m.subject, text: m.body, at: m.createdAt, status: m.status, files: (filesOf.get(m.id) ?? []).map(f => f.path) })),
    history: d.activity.map(a => ({ kind: a.kind, at: a.at })),
  };
  const entries: Entry[] = [{ name: "data.json", data: new TextEncoder().encode(JSON.stringify(data, null, 2)) }];
  if (cvObject && c.cv) {
    const file = await files.get(cvObject).catch(() => null);
    if (file) entries.push({ name: c.cv.fileName || `cv.${extension(c.cv.type)}`, data: file.data });
  }
  for (const m of mails) for await (const entry of read(filesOf.get(m.id) ?? [])) entries.push(entry);
  return { name: `${slugify(c.name)}.zip`, entries };
}
