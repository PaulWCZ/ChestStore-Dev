import { createHash } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { can, jobAccess, roleOf, type JobAccess } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { settings, stagesOf, toJob, type Job, type Stage } from "./jobs.ts";
import {
  clean,
  daysBetween,
  email,
  id,
  isLanguage,
  isMemberId,
  isRecommendation,
  isRejectReason,
  limits,
  link,
  phone,
  type Language,
  type Recommendation,
  type RejectReason,
} from "./model.ts";

// Candidates and the team's work on them: stages, rejections, notes,
// feedback, the activity line. Team functions take (sql, actor, …) and check
// the rights first, then the job: a candidate of a job someone may not see
// does not exist for them. Codes, never sentences.

export type Cv = { object: string; fileName: string; type: string; size: number };
export type Status = "active" | "rejected";

export type Candidate = {
  id: string;
  jobId: string;
  stageId: string;
  status: Status;
  name: string;
  email: string;
  phone: string;
  link: string;
  coverLetter: string;
  source: "careers" | "team";
  addedBy: string | null;
  language: Language;
  consentAt: string | null;
  cv: { fileName: string; type: string; size: number } | null;
  stageEnteredAt: string;
  // The day a hired candidate starts, when said ("YYYY-MM-DD").
  startDate: string | null;
  rejectReason: RejectReason | null;
  rejectNote: string | null;
  rejectedAt: string | null;
  createdAt: string;
  lastActivityAt: string;
};

type CandidateDb = {
  id: string; job_id: string; stage_id: string; status: Status; name: string; email: string; phone: string; link: string; cover_letter: string;
  source: "careers" | "team"; added_by: string | null; language: Language; consent_at: Date | null; cv_object: string | null; cv_name: string | null; cv_type: string | null; cv_size: string | null;
  stage_entered_at: Date; start_date: Date | string | null; reject_reason: RejectReason | null; reject_note: string | null; rejected_at: Date | null; created_at: Date; last_activity_at: Date;
};
// A date column as "YYYY-MM-DD", whatever the driver gives (a Date at UTC
// midnight, or the text).
const dateText = (d: Date | string | null): string | null => (d === null ? null : typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));
const toCandidate = (r: CandidateDb): Candidate => ({
  id: String(r.id), jobId: String(r.job_id), stageId: String(r.stage_id), status: r.status, name: r.name, email: r.email, phone: r.phone, link: r.link, coverLetter: r.cover_letter,
  source: r.source, addedBy: r.added_by, language: r.language, consentAt: r.consent_at ? r.consent_at.toISOString() : null,
  cv: r.cv_object ? { fileName: r.cv_name ?? "cv", type: r.cv_type ?? "application/octet-stream", size: Number(r.cv_size ?? 0) } : null,
  stageEnteredAt: r.stage_entered_at.toISOString(), startDate: dateText(r.start_date), rejectReason: r.reject_reason, rejectNote: r.reject_note, rejectedAt: r.rejected_at ? r.rejected_at.toISOString() : null,
  createdAt: r.created_at.toISOString(), lastActivityAt: r.last_activity_at.toISOString(),
});

// A candidate is "new" for a recruiter while they sit in their job's first
// stage, came through the careers page, and that recruiter never opened
// them: the tile's number.
const firstStage = (sql: Query) => sql`(select s.id from stages s where s.job_id = c.job_id order by s.position, s.id limit 1)`;

async function activity(sql: Query, candidateId: string, actor: string | null, kind: string, data: Record<string, unknown> = {}): Promise<void> {
  await sql`insert into activity (candidate_id, actor, kind, data) values (${candidateId}, ${actor}, ${kind}, ${sql.json(data as never)})`;
}

async function touch(sql: Query, candidateId: string): Promise<void> {
  await sql`update candidates set last_activity_at = now() where id = ${candidateId}`;
}

// load reads a candidate with the reader's access to its job, or not_found.
async function load(sql: Query, actor: Member | null, candidateId: unknown, lock = false): Promise<{ candidate: Candidate; access: JobAccess; cvObject: string | null }> {
  const key = id(candidateId);
  const [row] = lock
    ? await sql<CandidateDb[]>`select * from candidates where id = ${key} for update`
    : await sql<CandidateDb[]>`select * from candidates where id = ${key}`;
  if (!row) throw new AppError("not_found");
  const access = await jobAccess(sql, actor, String(row.job_id));
  if (!access) throw new AppError("not_found");
  return { candidate: toCandidate(row), access, cvObject: row.cv_object };
}

async function manageable(sql: Query, actor: Member | null, candidateId: unknown, lock = false) {
  if (!can(actor, "candidates.manage")) throw new AppError("forbidden");
  const found = await load(sql, actor, candidateId, lock);
  if (found.access !== "manage") throw new AppError("forbidden");
  return found;
}

// ---- The careers page's form -----------------------------------------------

// The form's guard: 10 applications an hour from one address (a hash of it),
// 200 an hour from everyone; a honeypot field; a form sent faster than a
// person can type is refused (lib/form-token.ts).
export const formLimits = { perVisitorHour: 10, perHour: 200, uploadsPerVisitorHour: 10, minimumSeconds: 3 } as const;

export async function guard(sql: Query, visitor: string, kind: "apply" | "upload" = "apply"): Promise<void> {
  const hour = new Date(Math.floor(Date.now() / 3600000) * 3600000);
  const key = (kind === "apply" ? "v:" : "u:") + createHash("sha256").update(visitor).digest("hex").slice(0, 32);
  const all = kind === "apply" ? "all" : "all-uploads";
  const counts = await sql<{ key: string; count: number }[]>`
    insert into form_counts (key, hour, count) values (${key}, ${hour}, 1), (${all}, ${hour}, 1)
    on conflict (key, hour) do update set count = form_counts.count + 1
    returning key, count`;
  const mine = counts.find(c => c.key === key)?.count ?? 0;
  const everyone = counts.find(c => c.key === all)?.count ?? 0;
  const perVisitor = kind === "apply" ? formLimits.perVisitorHour : formLimits.uploadsPerVisitorHour;
  if (mine > perVisitor || everyone > formLimits.perHour) throw new AppError("too_many");
  await sql`delete from form_counts where hour < ${new Date(hour.getTime() - 86400000)}`;
}

export type Application = { slug: unknown; name: unknown; email: unknown; phone?: unknown; link?: unknown; coverLetter?: unknown; consent: unknown; language: string; cv: Cv | null };

// openJob is the job a visitor may apply to: open, on an open careers page.
export async function openJob(sql: Query, slug: unknown): Promise<Job> {
  if (typeof slug !== "string" || slug.length > 80) throw new AppError("not_found");
  const s = await settings(sql);
  const [row] = await sql<Parameters<typeof toJob>[0][]>`select * from jobs where slug = ${slug} and state <> 'draft'`;
  if (!row) throw new AppError("not_found");
  if (row.state !== "open" || !s.careersOpen) throw new AppError("closed");
  return toJob(row);
}

// apply files an application from the careers page, in the job's first
// stage. A CV is required, unless the Chest cannot take files from
// visitors yet: then a link to one (or to a profile) is.
export async function apply(sql: Sql, input: Application): Promise<{ candidate: Candidate; job: Job }> {
  const job = await openJob(sql, input.slug);
  const name = clean(input.name, limits.name);
  const address = email(input.email);
  const tel = phone(input.phone);
  const url = link(input.link);
  const letter = clean(input.coverLetter, limits.coverLetter, { multiline: true, optional: true });
  if (input.consent !== true) throw new AppError("consent");
  if (!input.cv && url === "") throw new AppError("cv_missing");
  const language: Language = isLanguage(input.language) ? input.language : "en";
  return sql.begin(async tx => {
    const [first] = await stagesOf(tx, job.id);
    if (!first) throw new AppError("closed");
    const [row] = await tx<CandidateDb[]>`
      insert into candidates (job_id, stage_id, name, email, phone, link, cover_letter, source, language, consent_at, cv_object, cv_name, cv_type, cv_size)
      values (${job.id}, ${first.id}, ${name}, ${address}, ${tel}, ${url}, ${letter}, 'careers', ${language}, now(),
        ${input.cv?.object ?? null}, ${input.cv?.fileName ?? null}, ${input.cv?.type ?? null}, ${input.cv?.size ?? null})
      returning *`;
    const candidate = toCandidate(row!);
    await activity(tx, candidate.id, null, "applied");
    return { candidate, job };
  });
}

// addCandidate files someone the team met (a referral, a CV received by
// hand) in a stage of the job — the first when not said.
export async function addCandidate(sql: Sql, actor: Member | null, jobId: unknown, input: { name: unknown; email: unknown; phone?: unknown; link?: unknown; coverLetter?: unknown; language?: unknown; stageId?: unknown; cv: Cv | null }): Promise<Candidate> {
  if (!actor || !can(actor, "candidates.manage")) throw new AppError("forbidden");
  const key = id(jobId);
  if ((await jobAccess(sql, actor, key)) !== "manage") throw new AppError("not_found");
  const name = clean(input.name, limits.name);
  const address = email(input.email);
  const tel = phone(input.phone);
  const url = link(input.link);
  const letter = clean(input.coverLetter, limits.coverLetter, { multiline: true, optional: true });
  const language: Language = isLanguage(input.language) ? input.language : "en";
  return sql.begin(async tx => {
    const [exists] = await tx<{ id: string }[]>`select id from jobs where id = ${key} for update`;
    if (!exists) throw new AppError("not_found");
    const list = await stagesOf(tx, key);
    const stage = input.stageId === undefined || input.stageId === null || input.stageId === "" ? list[0] : list.find(s => s.id === String(input.stageId));
    if (!stage) throw new AppError("invalid");
    const [row] = await tx<CandidateDb[]>`
      insert into candidates (job_id, stage_id, name, email, phone, link, cover_letter, source, added_by, language, cv_object, cv_name, cv_type, cv_size)
      values (${key}, ${stage.id}, ${name}, ${address}, ${tel}, ${url}, ${letter}, 'team', ${actor.id}, ${language},
        ${input.cv?.object ?? null}, ${input.cv?.fileName ?? null}, ${input.cv?.type ?? null}, ${input.cv?.size ?? null})
      returning *`;
    const candidate = toCandidate(row!);
    await activity(tx, candidate.id, actor.id, "added", { stage: stage.name });
    // The one who added them has seen them.
    await tx`insert into candidate_seen (candidate_id, member_id) values (${candidate.id}, ${actor.id}) on conflict do nothing`;
    return candidate;
  });
}

// editCandidate corrects what the candidate wrote (a typo in an address).
export async function editCandidate(sql: Sql, actor: Member | null, candidateId: unknown, input: { name: unknown; email: unknown; phone?: unknown; link?: unknown; language?: unknown }): Promise<Candidate> {
  const { candidate } = await manageable(sql, actor, candidateId);
  const name = clean(input.name, limits.name);
  const address = email(input.email);
  const tel = phone(input.phone);
  const url = link(input.link);
  const language: Language = isLanguage(input.language) ? input.language : candidate.language;
  const [row] = await sql<CandidateDb[]>`update candidates set name = ${name}, email = ${address}, phone = ${tel}, link = ${url}, language = ${language} where id = ${candidate.id} returning *`;
  return toCandidate(row!);
}

// setCv gives a candidate a CV (or a new one). Says the old file, which the
// caller deletes from the Chest.
export async function setCv(sql: Sql, actor: Member | null, candidateId: unknown, cv: Cv): Promise<{ previous: string | null }> {
  if (!actor) throw new AppError("forbidden");
  return sql.begin(async tx => {
    const { candidate, cvObject } = await manageable(tx, actor, candidateId, true);
    await tx`update candidates set cv_object = ${cv.object}, cv_name = ${cv.fileName}, cv_type = ${cv.type}, cv_size = ${cv.size}, last_activity_at = now() where id = ${candidate.id}`;
    await activity(tx, candidate.id, actor.id, "cv", { replaced: cvObject !== null });
    return { previous: cvObject };
  });
}

// cvObject is the file of a candidate's CV, for someone who sees them.
export async function cvOf(sql: Sql, actor: Member | null, candidateId: unknown): Promise<Cv> {
  const { candidate, cvObject } = await load(sql, actor, candidateId);
  if (!cvObject || !candidate.cv) throw new AppError("not_found");
  return { object: cvObject, ...candidate.cv };
}

// ---- The board -------------------------------------------------------------

export type CandidateCard = {
  id: string;
  name: string;
  stageId: string;
  status: Status;
  source: "careers" | "team";
  // The average rating, only for whoever may see the feedback (a recruiter,
  // or an interviewer who gave theirs); null otherwise or without any.
  rating: number | null;
  ratings: number;
  days: number;
  hasCv: boolean;
  unseen: boolean;
  askedOfMe: boolean;
  rejectReason: RejectReason | null;
  createdAt: string;
};

export async function board(sql: Sql, actor: Member | null, jobId: unknown, now = new Date()): Promise<CandidateCard[]> {
  const key = id(jobId);
  const access = await jobAccess(sql, actor, key);
  if (!actor || !access) throw new AppError("not_found");
  const rows = await sql<{ id: string; name: string; stage_id: string; status: Status; source: "careers" | "team"; stage_entered_at: Date; cv: boolean; unseen: boolean; asked: boolean; mine: boolean; rating: string | null; ratings: number; reject_reason: RejectReason | null; created_at: Date }[]>`
    select c.id, c.name, c.stage_id, c.status, c.source, c.stage_entered_at, c.cv_object is not null as cv, c.reject_reason, c.created_at,
      (c.status = 'active' and c.source = 'careers' and c.stage_id = ${firstStage(sql)} and not exists (select 1 from candidate_seen s where s.candidate_id = c.id and s.member_id = ${actor.id})) as unseen,
      exists (select 1 from feedback_requests r where r.candidate_id = c.id and r.member_id = ${actor.id}) as asked,
      exists (select 1 from feedback f where f.candidate_id = c.id and f.author = ${actor.id}) as mine,
      (select avg(f.rating)::numeric(3,1)::text from feedback f where f.candidate_id = c.id) as rating,
      (select count(*)::int from feedback f where f.candidate_id = c.id) as ratings
    from candidates c where c.job_id = ${key}
    order by c.stage_entered_at, c.id
    limit ${limits.page}`;
  const recruiter = access === "manage";
  return rows.map(r => ({
    id: String(r.id), name: r.name, stageId: String(r.stage_id), status: r.status, source: r.source,
    rating: (recruiter || r.mine) && r.rating !== null ? Number(r.rating) : null,
    ratings: recruiter || r.mine ? r.ratings : 0,
    days: daysBetween(r.stage_entered_at, now), hasCv: r.cv, unseen: recruiter && r.unseen, askedOfMe: r.asked, rejectReason: r.reject_reason, createdAt: r.created_at.toISOString(),
  }));
}

// ---- One candidate ---------------------------------------------------------

export type Note = { id: string; author: string; body: string; at: string };
export type Feedback = { id: string; author: string; rating: number; strengths: string; concerns: string; recommendation: Recommendation; at: string; updatedAt: string };
export type Activity = { id: string; actor: string | null; kind: string; data: Record<string, unknown>; at: string };

export type CandidateDetail = {
  candidate: Candidate;
  job: Job;
  stages: Stage[];
  access: JobAccess;
  notes: Note[];
  mine: Feedback | null;
  // Others' feedback: shown to a recruiter, and to an interviewer once they
  // gave theirs; otherwise only how many there are.
  others: Feedback[];
  othersHidden: number;
  asked: string[];
  askedOfMe: boolean;
  activity: Activity[];
  elsewhere: { id: string; jobTitle: string; status: Status; stage: string; createdAt: string }[];
};

const toFeedback = (r: { id: string; author: string; rating: number; strengths: string; concerns: string; recommendation: Recommendation; created_at: Date; updated_at: Date }): Feedback => ({
  id: String(r.id), author: r.author, rating: r.rating, strengths: r.strengths, concerns: r.concerns, recommendation: r.recommendation, at: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});

// candidate reads one candidate for the team; a recruiter who opens them
// has seen them (the tile's number goes down).
export async function candidate(sql: Sql, actor: Member | null, candidateId: unknown): Promise<CandidateDetail> {
  const { candidate: c, access } = await load(sql, actor, candidateId);
  if (!actor) throw new AppError("not_found");
  if (access === "manage") await sql`insert into candidate_seen (candidate_id, member_id) values (${c.id}, ${actor.id}) on conflict do nothing`;
  const [jobRow] = await sql<Parameters<typeof toJob>[0][]>`select * from jobs where id = ${c.jobId}`;
  const notes = await sql<{ id: string; author: string; body: string; created_at: Date }[]>`select id, author, body, created_at from notes where candidate_id = ${c.id} order by created_at, id`;
  const feedback = (await sql<Parameters<typeof toFeedback>[0][]>`select id, author, rating, strengths, concerns, recommendation, created_at, updated_at from feedback where candidate_id = ${c.id} order by created_at, id`).map(toFeedback);
  const mine = feedback.find(f => f.author === actor.id) ?? null;
  const rest = feedback.filter(f => f !== mine);
  const visible = access === "manage" || mine !== null;
  const asked = (await sql<{ member_id: string }[]>`select member_id from feedback_requests where candidate_id = ${c.id} order by requested_at`).map(r => r.member_id);
  const log = await sql<{ id: string; actor: string | null; kind: string; data: Record<string, unknown>; created_at: Date }[]>`select id, actor, kind, data, created_at from activity where candidate_id = ${c.id} order by created_at desc, id desc limit 200`;
  const elsewhere = access === "manage"
    ? await sql<{ id: string; title: string; status: Status; stage: string; created_at: Date }[]>`
        select c.id, j.title, c.status, s.name as stage, c.created_at from candidates c join jobs j on j.id = c.job_id join stages s on s.id = c.stage_id
        where lower(c.email) = lower(${c.email}) and c.id <> ${c.id} order by c.created_at desc limit 10`
    : [];
  return {
    candidate: c,
    job: toJob(jobRow!),
    stages: await stagesOf(sql, c.jobId),
    access,
    notes: notes.map(n => ({ id: String(n.id), author: n.author, body: n.body, at: n.created_at.toISOString() })),
    mine,
    others: visible ? rest : [],
    othersHidden: visible ? 0 : rest.length,
    asked,
    askedOfMe: asked.includes(actor.id),
    activity: log.map(a => ({ id: String(a.id), actor: a.actor, kind: a.kind, data: a.data ?? {}, at: a.created_at.toISOString() })),
    elsewhere: elsewhere.map(e => ({ id: String(e.id), jobTitle: e.title, status: e.status, stage: e.stage, createdAt: e.created_at.toISOString() })),
  };
}

// ---- Moving, rejecting -----------------------------------------------------

export async function isHiredStage(sql: Query, stageId: string): Promise<boolean> {
  const [row] = await sql<{ hired: boolean }[]>`select hired from stages where id = ${stageId}`;
  return row?.hired === true;
}

// move puts a candidate in another stage of their job. Says where they
// were (for Undo) and whether they are now hired.
// A start date as a recruiter gives it: a real day, "YYYY-MM-DD", or none.
export function startDate(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new AppError("invalid");
  const d = new Date(value + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value || d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) throw new AppError("invalid");
  return value;
}

// move puts a candidate in another stage of their job; into "hired", with
// the day they start when said (out of it, the day goes). Says where they
// were (for Undo).
export async function move(sql: Sql, actor: Member | null, candidateId: unknown, stageId: unknown, start?: unknown): Promise<{ candidate: Candidate; from: Stage; to: Stage }> {
  if (!actor) throw new AppError("forbidden");
  const day = startDate(start);
  return sql.begin(async tx => {
    const { candidate: c } = await manageable(tx, actor, candidateId, true);
    const list = await stagesOf(tx, c.jobId);
    const to = list.find(s => s.id === String(stageId ?? ""));
    const from = list.find(s => s.id === c.stageId)!;
    if (!to) throw new AppError("invalid");
    if (c.status === "rejected") throw new AppError("invalid");
    if (to.id === from.id) return { candidate: c, from, to };
    const [row] = await tx<CandidateDb[]>`update candidates set stage_id = ${to.id}, stage_entered_at = now(), last_activity_at = now(), start_date = ${to.hired ? day : null} where id = ${c.id} returning *`;
    await activity(tx, c.id, actor.id, "moved", { from: from.name, to: to.name });
    return { candidate: toCandidate(row!), from, to };
  });
}

export async function reject(sql: Sql, actor: Member | null, candidateId: unknown, reason: unknown, note?: unknown): Promise<Candidate> {
  if (!actor) throw new AppError("forbidden");
  if (!isRejectReason(reason)) throw new AppError("invalid");
  const text = clean(note, limits.rejectNote, { optional: true });
  return sql.begin(async tx => {
    const { candidate: c } = await manageable(tx, actor, candidateId, true);
    if (c.status === "rejected") return c;
    const [row] = await tx<CandidateDb[]>`update candidates set status = 'rejected', reject_reason = ${reason}, reject_note = ${text || null}, rejected_at = now(), last_activity_at = now() where id = ${c.id} returning *`;
    await activity(tx, c.id, actor.id, "rejected", { reason });
    await tx`delete from feedback_requests where candidate_id = ${c.id}`;
    return toCandidate(row!);
  });
}

// restore takes a rejection back: the candidate returns to the stage they
// were in.
export async function restore(sql: Sql, actor: Member | null, candidateId: unknown): Promise<Candidate> {
  if (!actor) throw new AppError("forbidden");
  return sql.begin(async tx => {
    const { candidate: c } = await manageable(tx, actor, candidateId, true);
    if (c.status === "active") return c;
    const [row] = await tx<CandidateDb[]>`update candidates set status = 'active', reject_reason = null, reject_note = null, rejected_at = null, last_activity_at = now() where id = ${c.id} returning *`;
    await activity(tx, c.id, actor.id, "restored");
    return toCandidate(row!);
  });
}

// emailed records a message sent to the candidate (the line in their
// history; an email is a contact: the retention starts again).
export async function emailed(sql: Query, candidateId: string, actor: string | null, kind: "confirmation" | "rejection"): Promise<void> {
  await activity(sql, candidateId, actor, "emailed", { kind });
  await touch(sql, candidateId);
}

// ---- Notes and feedback ----------------------------------------------------

export async function addNote(sql: Sql, actor: Member | null, candidateId: unknown, body: unknown): Promise<Note> {
  if (!actor) throw new AppError("forbidden");
  const text = clean(body, limits.note, { multiline: true });
  const { candidate: c } = await manageable(sql, actor, candidateId);
  return sql.begin(async tx => {
    const [count] = await tx<{ n: number }[]>`select count(*)::int as n from notes where candidate_id = ${c.id}`;
    if ((count?.n ?? 0) >= 500) throw new AppError("too_many", { max: 500 });
    const [row] = await tx<{ id: string; created_at: Date }[]>`insert into notes (candidate_id, author, body) values (${c.id}, ${actor.id}, ${text}) returning id, created_at`;
    await touch(tx, c.id);
    return { id: String(row!.id), author: actor.id, body: text, at: row!.created_at.toISOString() };
  });
}

// removeNote deletes one's own note (a recruiter's mistake).
export async function removeNote(sql: Sql, actor: Member | null, noteId: unknown): Promise<void> {
  if (!actor || !can(actor, "candidates.manage")) throw new AppError("forbidden");
  const [row] = await sql<{ candidate_id: string; author: string }[]>`select candidate_id, author from notes where id = ${id(noteId)}`;
  if (!row) throw new AppError("not_found");
  await manageable(sql, actor, String(row.candidate_id));
  if (row.author !== actor.id) throw new AppError("forbidden");
  await sql`delete from notes where id = ${id(noteId)}`;
}

export type FeedbackInput = { rating: unknown; strengths?: unknown; concerns?: unknown; recommendation: unknown };

// giveFeedback writes (or rewrites) the actor's feedback on a candidate of
// a job they are on. Says whether it is their first, and who had asked
// for it (to tell them).
export async function giveFeedback(sql: Sql, actor: Member | null, candidateId: unknown, input: FeedbackInput): Promise<{ feedback: Feedback; first: boolean; askedBy: string[]; candidate: Candidate }> {
  if (!actor || !can(actor, "feedback.give")) throw new AppError("forbidden");
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 4) throw new AppError("invalid");
  if (!isRecommendation(input.recommendation)) throw new AppError("invalid");
  const strengths = clean(input.strengths, limits.feedbackText, { multiline: true, optional: true });
  const concerns = clean(input.concerns, limits.feedbackText, { multiline: true, optional: true });
  const recommendation = input.recommendation;
  return sql.begin(async tx => {
    const { candidate: c } = await load(tx, actor, candidateId, true);
    const [before] = await tx<{ id: string }[]>`select id from feedback where candidate_id = ${c.id} and author = ${actor.id}`;
    const [row] = before
      ? await tx<Parameters<typeof toFeedback>[0][]>`update feedback set rating = ${rating}, strengths = ${strengths}, concerns = ${concerns}, recommendation = ${recommendation}, updated_at = now() where id = ${before.id} returning id, author, rating, strengths, concerns, recommendation, created_at, updated_at`
      : await tx<Parameters<typeof toFeedback>[0][]>`insert into feedback (candidate_id, author, rating, strengths, concerns, recommendation) values (${c.id}, ${actor.id}, ${rating}, ${strengths}, ${concerns}, ${recommendation}) returning id, author, rating, strengths, concerns, recommendation, created_at, updated_at`;
    const askedBy = (await tx<{ requested_by: string }[]>`delete from feedback_requests where candidate_id = ${c.id} and member_id = ${actor.id} returning requested_by`).map(r => r.requested_by).filter(isMemberId).filter(m => m !== actor.id);
    if (!before) await activity(tx, c.id, actor.id, "feedback");
    await touch(tx, c.id);
    return { feedback: toFeedback(row!), first: !before, askedBy, candidate: c };
  });
}

// askFeedback asks members for their feedback on a candidate: the job's
// interviewers, or recruiters (isRecruiter: the Chest says their role).
// Someone who already gave theirs is not asked. Says who was newly asked.
export async function askFeedback(sql: Sql, actor: Member | null, candidateId: unknown, memberIds: unknown, isRecruiter: (memberId: string) => Promise<boolean>): Promise<{ asked: string[]; candidate: Candidate }> {
  if (!actor) throw new AppError("forbidden");
  if (!Array.isArray(memberIds) || memberIds.length === 0 || memberIds.length > limits.interviewers || !memberIds.every(isMemberId)) throw new AppError("invalid");
  const { candidate: c } = await manageable(sql, actor, candidateId);
  if (c.status === "rejected") throw new AppError("invalid");
  const onJob = new Set((await sql<{ member_id: string }[]>`select member_id from job_interviewers where job_id = ${c.jobId}`).map(r => r.member_id));
  const done = new Set((await sql<{ author: string }[]>`select author from feedback where candidate_id = ${c.id}`).map(r => r.author));
  const wanted = [...new Set(memberIds as string[])].filter(m => !done.has(m));
  for (const m of wanted) if (!onJob.has(m) && !(await isRecruiter(m))) throw new AppError("invalid");
  return sql.begin(async tx => {
    const asked: string[] = [];
    for (const m of wanted) {
      const added = await tx`insert into feedback_requests (candidate_id, member_id, requested_by) values (${c.id}, ${m}, ${actor.id}) on conflict do nothing`;
      if (added.count > 0) asked.push(m);
    }
    if (asked.length > 0) await activity(tx, c.id, actor.id, "asked", { members: asked });
    return { asked, candidate: c };
  });
}

// cancelAsk withdraws a request for feedback.
export async function cancelAsk(sql: Sql, actor: Member | null, candidateId: unknown, memberId: unknown): Promise<void> {
  if (!isMemberId(memberId)) throw new AppError("invalid");
  const { candidate: c } = await manageable(sql, actor, candidateId);
  await sql`delete from feedback_requests where candidate_id = ${c.id} and member_id = ${memberId}`;
}

// The feedback waiting on someone: what the home page lists first.
export type Waiting = { candidateId: string; name: string; jobId: string; jobTitle: string; requestedBy: string; requestedAt: string };
export async function waitingOn(sql: Sql, actor: Member | null): Promise<Waiting[]> {
  if (!actor || !roleOf(actor)) throw new AppError("forbidden");
  const role = roleOf(actor);
  const rows = await sql<{ candidate_id: string; name: string; job_id: string; title: string; requested_by: string; requested_at: Date }[]>`
    select r.candidate_id, c.name, c.job_id, j.title, r.requested_by, r.requested_at
    from feedback_requests r join candidates c on c.id = r.candidate_id join jobs j on j.id = c.job_id
    where r.member_id = ${actor.id} and c.status = 'active'
      and (${role === "recruiter"} or exists (select 1 from job_interviewers i where i.job_id = c.job_id and i.member_id = ${actor.id}))
    order by r.requested_at limit 100`;
  return rows.map(r => ({ candidateId: String(r.candidate_id), name: r.name, jobId: String(r.job_id), jobTitle: r.title, requestedBy: r.requested_by, requestedAt: r.requested_at.toISOString() }));
}

// ---- Keeping and erasing ---------------------------------------------------

// erase deletes everything of one candidate (their right to erasure: they
// are not members, the company answers for them). Says the CV's file, to
// delete from the Chest.
export async function erase(sql: Sql, actor: Member | null, candidateId: unknown): Promise<{ objects: string[]; wasHired: boolean }> {
  if (!can(actor, "candidates.erase")) throw new AppError("forbidden");
  return sql.begin(async tx => {
    const { candidate: c, cvObject } = await manageable(tx, actor, candidateId, true);
    const wasHired = c.status === "active" && (await isHiredStage(tx, c.stageId));
    await tx`delete from candidates where id = ${c.id}`;
    return { objects: cvObject ? [cvObject] : [], wasHired };
  });
}

// cleanup deletes the candidates whose last activity is older than the
// retention (CNIL: two years after the last contact by default), with
// their CVs. Run every night by the "cleanup" schedule; safe to run twice.
export async function cleanup(sql: Sql, now = new Date()): Promise<{ candidates: number; objects: string[] }> {
  const { retentionMonths } = await settings(sql);
  const before = new Date(now);
  before.setUTCMonth(before.getUTCMonth() - retentionMonths);
  return sql.begin(async tx => {
    const gone = await tx<{ cv_object: string | null }[]>`delete from candidates where last_activity_at < ${before} returning cv_object`;
    await tx`delete from form_counts where hour < ${new Date(now.getTime() - 86400000)}`;
    return { candidates: gone.length, objects: gone.map(r => r.cv_object).filter((o): o is string => o !== null) };
  });
}

// The objects a CV name may be: the tool never deletes anything else of
// the Chest's files by mistake.
export async function referenced(sql: Query, objects: string[]): Promise<Set<string>> {
  if (objects.length === 0) return new Set();
  return new Set((await sql<{ cv_object: string }[]>`select cv_object from candidates where cv_object in ${sql(objects)}`).map(r => r.cv_object));
}

// ---- The tile, the export --------------------------------------------------

// unseenCounts: for each recruiter, the new applications they have not
// opened (their tile's number).
export async function unseenCounts(sql: Query, people: string[]): Promise<Map<string, number>> {
  const counts = new Map(people.map(p => [p, 0]));
  if (people.length === 0) return counts;
  const rows = await sql<{ member_id: string; n: number }[]>`
    select m.member_id, count(c.id)::int as n
    from unnest(${sql.array(people)}::text[]) as m(member_id)
    left join candidates c on c.status = 'active' and c.source = 'careers' and c.stage_id = ${firstStage(sql)}
      and not exists (select 1 from candidate_seen s where s.candidate_id = c.id and s.member_id = m.member_id)
    group by m.member_id`;
  for (const r of rows) counts.set(r.member_id, r.n);
  return counts;
}

export type ExportRow = { name: string; email: string; phone: string; link: string; stage: string; status: Status; rejectReason: RejectReason | null; rating: number | null; ratings: number; source: string; appliedAt: string; lastActivityAt: string };

export async function exportRows(sql: Sql, actor: Member | null, jobId: unknown): Promise<{ job: Job; rows: ExportRow[] }> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const key = id(jobId);
  const [jobRow] = await sql<Parameters<typeof toJob>[0][]>`select * from jobs where id = ${key}`;
  if (!jobRow) throw new AppError("not_found");
  const rows = await sql<{ name: string; email: string; phone: string; link: string; stage: string; position: number; status: Status; reject_reason: RejectReason | null; rating: string | null; ratings: number; source: string; created_at: Date; last_activity_at: Date }[]>`
    select c.name, c.email, c.phone, c.link, s.name as stage, s.position, c.status, c.reject_reason, c.source, c.created_at, c.last_activity_at,
      (select avg(f.rating)::numeric(3,1)::text from feedback f where f.candidate_id = c.id) as rating,
      (select count(*)::int from feedback f where f.candidate_id = c.id) as ratings
    from candidates c join stages s on s.id = c.stage_id where c.job_id = ${key}
    order by c.status, s.position, c.created_at`;
  return {
    job: toJob(jobRow),
    rows: rows.map(r => ({ name: r.name, email: r.email, phone: r.phone, link: r.link, stage: r.stage, status: r.status, rejectReason: r.reject_reason, rating: r.rating === null ? null : Number(r.rating), ratings: r.ratings, source: r.source, appliedAt: r.created_at.toISOString(), lastActivityAt: r.last_activity_at.toISOString() })),
  };
}
