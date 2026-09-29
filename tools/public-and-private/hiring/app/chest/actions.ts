"use server";

import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { revalidatePath } from "next/cache";
import * as candidates from "../../lib/candidates.ts";
import * as cv from "../../lib/cv.ts";
import { db } from "../../lib/db.ts";
import { AppError, attempt, type Result } from "../../lib/errors.ts";
import * as jobs from "../../lib/jobs.ts";
import * as brand from "../../lib/brand.ts";
import { importRows, undoImport as undoImportRows } from "../../lib/import.ts";
import * as interviews from "../../lib/interviews.ts";
import * as selfSchedule from "../../lib/self-schedule.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { headers } from "next/headers";
import * as mailer from "../../lib/mailer.ts";
import * as messages from "../../lib/messages.ts";
import { clean, isCandidateReason, limits } from "../../lib/model.ts";
import * as outbox from "../../lib/outbox.ts";
import { currentMember } from "../../lib/session.ts";
import * as share from "../../lib/share.ts";
import * as tell from "../../lib/tell.ts";

// The team's actions. Each is an endpoint anyone can call: each reads the
// member from the Chest's assertion again; the services check the rights.

async function act<T>(step: (actor: Member) => Promise<T>): Promise<Result<T>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return step(actor);
  });
  revalidatePath("/chest", "layout");
  return result;
}

// What the Chest says of a member: they have the tool; they recruit.
async function ask<T>(question: () => Promise<T>): Promise<T> {
  try {
    return await question();
  } catch (error) {
    if (error instanceof ChestError) throw new AppError("unavailable");
    throw error;
  }
}
const hasTool = (memberId: string) => ask(async () => (await members.get(memberId)) !== null);
const isRecruiter = (memberId: string) => ask(async () => (await members.get(memberId))?.role === "recruiter");

// ---- Jobs ------------------------------------------------------------------

export async function createJob(input: jobs.JobInput): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const job = await jobs.createJob(db(), actor, input);
    return { id: job.id };
  });
}

export async function duplicateJob(jobId: string): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await jobs.duplicateJob(db(), actor, jobId)).id }));
}

export async function updateJob(jobId: string, input: jobs.JobInput): Promise<Result<null>> {
  return act(async actor => { await jobs.updateJob(db(), actor, jobId, input); return null; });
}

export async function setJobState(jobId: string, state: string): Promise<Result<{ previous: string }>> {
  return act(async actor => {
    const done = await jobs.setJobState(db(), actor, jobId, state);
    return { previous: done.previous };
  });
}

export async function removeJob(jobId: string): Promise<Result<null>> {
  return act(async actor => { await jobs.removeJob(db(), actor, jobId); return null; });
}

export async function addStage(jobId: string, name: string): Promise<Result<null>> {
  return act(async actor => { await jobs.addStage(db(), actor, jobId, name); return null; });
}

export async function renameStage(stageId: string, name: string): Promise<Result<null>> {
  return act(async actor => { await jobs.renameStage(db(), actor, stageId, name); return null; });
}

export async function moveStage(stageId: string, direction: "up" | "down"): Promise<Result<null>> {
  return act(async actor => { await jobs.moveStage(db(), actor, stageId, direction); return null; });
}

export async function removeStage(stageId: string): Promise<Result<null>> {
  return act(async actor => { await jobs.removeStage(db(), actor, stageId); return null; });
}

export async function addInterviewer(jobId: string, memberId: string): Promise<Result<null>> {
  return act(async actor => { await jobs.addInterviewer(db(), actor, jobId, memberId, hasTool); return null; });
}

export async function removeInterviewer(jobId: string, memberId: string): Promise<Result<null>> {
  return act(async actor => { await jobs.removeInterviewer(db(), actor, jobId, memberId); return null; });
}

export async function saveSettings(input: { companyName?: string; intros?: Record<string, string>; careersOpen?: boolean; retentionMonths?: number; country?: string; website?: string; accent?: string }): Promise<Result<null>> {
  return act(async actor => { await jobs.saveSettings(db(), actor, input); return null; });
}

// The careers page's logo or photos: the image the browser sent is
// checked and published, then recorded; images no longer shown are
// deleted. photos: the objects to keep, in order, plus the new one.
export async function setBrandImage(which: "logo" | "photos", ticket: string | null, keep: string[] = []): Promise<Result<null>> {
  return act(async actor => {
    if (which !== "logo" && which !== "photos") throw new AppError("invalid");
    const s = await jobs.settings(db());
    const added = ticket ? await brand.acceptImage(ticket) : null;
    const kept = which === "photos" ? s.photos.filter(p => keep.includes(p.object)) : [];
    try {
      const unused = await jobs.setImages(db(), actor, which, [...kept, ...(added ? [added] : [])]);
      await cv.remove(unused);
    } catch (error) {
      if (added) await cv.remove([added.object]);
      throw error;
    }
    return null;
  });
}

// ---- Candidates ------------------------------------------------------------

// Tells People of a hire (or of one taken back): Proposal (studio), events
// between tools; nothing is told when the Chest cannot take it.
async function tellHired(actor: Member, c: candidates.Candidate): Promise<void> {
  const [job] = await db()<{ title: string; team: string; place: string }[]>`select title, team, place from jobs where id = ${c.jobId}`;
  await share.hired({ candidate: c.id, name: c.name, email: c.email, job: job!.title, team: job!.team, place: job!.place, startDate: c.startDate, hiredBy: actor.id }, c.stageEnteredAt);
}

export async function moveCandidate(candidateId: string, stageId: string, startDate?: string): Promise<Result<{ from: string; hired: boolean }>> {
  return act(async actor => {
    const sql = db();
    const done = await candidates.move(sql, actor, candidateId, stageId, startDate);
    if (done.to.hired && !done.from.hired) await tellHired(actor, done.candidate);
    if (done.from.hired && !done.to.hired) await share.hireCancelled(done.candidate.id);
    await tell.refreshBadges(sql);
    return { from: done.from.id, hired: done.to.hired && !done.from.hired };
  });
}

// rejectCandidate records the rejection, then queues the email the
// recruiter wrote, when they asked for it: it leaves only once the Undo of
// the toast is over (messages.undoSeconds) — Undo cancels it before
// anything left.
export async function rejectCandidate(candidateId: string, reason: string, note: string, email: { send: boolean; text: string }): Promise<Result<{ delivery: "waiting" | "skipped"; seconds: number; at: string }>> {
  return act(async actor => {
    const sql = db();
    const at = new Date(Date.now() - 1000).toISOString();
    const text = email.send ? clean(email.text, limits.emailText, { multiline: true }) : "";
    const before = await candidates.candidate(sql, actor, candidateId);
    const c = await candidates.reject(sql, actor, candidateId, reason, note);
    if (before.candidate.status === "active" && (await candidates.isHiredStage(sql, c.stageId))) await share.hireCancelled(c.id);
    await interviews.requeue(sql, { candidate: c.id });
    await tell.settled(c.id);
    await tell.refreshBadges(sql);
    if (!email.send || before.candidate.status !== "active") return { delivery: "skipped" as const, seconds: 0, at };
    const s = await jobs.settings(sql);
    const draft = mailer.rejectionDraft(c, before.job, s.companyName, actor.firstName || actor.name);
    await messages.queue(sql, actor, c.id, { kind: "rejection", subject: draft.subject, text, delaySeconds: messages.undoSeconds });
    return { delivery: "waiting" as const, seconds: messages.undoSeconds, at };
  });
}

// bulkReject rejects several candidates of a job with one reason, each
// with the rejection email in their own language when asked — every email
// waiting for the Undo like one rejection's. Says who was rejected.
export async function bulkReject(ids: string[], reason: string, send: boolean): Promise<Result<{ done: string[]; seconds: number; at: string }>> {
  return act(async actor => {
    const sql = db();
    const at = new Date(Date.now() - 1000).toISOString();
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > limits.bulk) throw new AppError("invalid");
    const s = await jobs.settings(sql);
    const done: string[] = [];
    for (const id of ids) {
      const before = await candidates.candidate(sql, actor, id);
      if (before.candidate.status !== "active") continue;
      const c = await candidates.reject(sql, actor, id, reason, "");
      if (await candidates.isHiredStage(sql, c.stageId)) await share.hireCancelled(c.id);
      await interviews.requeue(sql, { candidate: c.id });
      await tell.settled(c.id);
      if (send && !isCandidateReason(reason)) {
        const draft = mailer.rejectionDraft(c, before.job, s.companyName, actor.firstName || actor.name);
        await messages.queue(sql, actor, c.id, { kind: "rejection", subject: draft.subject, text: draft.text, delaySeconds: messages.undoSeconds });
      }
      done.push(c.id);
    }
    await tell.refreshBadges(sql);
    return { done, seconds: messages.undoSeconds, at };
  });
}

// undoReject: the Undo of a rejection, of one candidate or several. They
// are back where they were, and their rejection emails still waiting
// never leave (candidates.restore cancels them). Says how many had
// already left since the rejection — the toast was held open past its
// time — so the Undo tells the truth.
export async function undoReject(ids: string[], since: string): Promise<Result<{ left: number }>> {
  return act(async actor => {
    const sql = db();
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > limits.bulk) throw new AppError("invalid");
    for (const id of ids) await restoreOne(sql, actor, id);
    await tell.refreshBadges(sql);
    return { left: await messages.rejectionsSent(sql, actor, ids, since) };
  });
}

// rejectionsLeft: once the Undo of a rejection is over, send what is due
// and say how many of these candidates' rejection emails left.
export async function rejectionsLeft(ids: string[], since: string): Promise<Result<{ left: number }>> {
  return act(async actor => {
    const sql = db();
    await outbox.flush(sql);
    return { left: await messages.rejectionsSent(sql, actor, ids, since) };
  });
}

// bulkMove moves several candidates of a job to one stage (never into
// "hired": each hire asks its first day). Says where each was, for Undo.
export async function bulkMove(ids: string[], stageId: string): Promise<Result<{ from: Record<string, string> }>> {
  return act(async actor => {
    const sql = db();
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > limits.bulk) throw new AppError("invalid");
    if (await candidates.isHiredStage(sql, String(stageId))) throw new AppError("invalid");
    const from: Record<string, string> = {};
    for (const id of ids) {
      const done = await candidates.move(sql, actor, id, stageId);
      if (done.from.id !== done.to.id) from[id] = done.from.id;
      if (done.from.hired && !done.to.hired) await share.hireCancelled(done.candidate.id);
    }
    await tell.refreshBadges(sql);
    return { from };
  });
}

// bulkMoveBack: the Undo of a bulk move.
export async function bulkMoveBack(from: Record<string, string>): Promise<Result<null>> {
  return act(async actor => {
    const entries = Object.entries(from ?? {}).slice(0, limits.bulk);
    for (const [id, stage] of entries) {
      const done = await candidates.move(db(), actor, id, stage);
      if (done.to.hired && !done.from.hired) await tellHired(actor, done.candidate);
    }
    return null;
  });
}

// restoreOne brings a rejected candidate back (Bring back, or the Undo of
// a rejection): back on their interviewers' calendars, and People told
// again when they were hired.
async function restoreOne(sql: ReturnType<typeof db>, actor: Member, candidateId: string): Promise<void> {
  const before = await candidates.candidate(sql, actor, candidateId);
  const c = await candidates.restore(sql, actor, candidateId);
  await interviews.requeue(sql, { candidate: c.id });
  if (before.candidate.status === "rejected" && (await candidates.isHiredStage(sql, c.stageId))) await tellHired(actor, { ...c, stageEnteredAt: new Date().toISOString() });
}

export async function restoreCandidate(candidateId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    await restoreOne(sql, actor, candidateId);
    await tell.refreshBadges(sql);
    return null;
  });
}

export async function addNote(candidateId: string, body: string): Promise<Result<null>> {
  return act(async actor => { await candidates.addNote(db(), actor, candidateId, body); return null; });
}

export async function removeNote(noteId: string): Promise<Result<null>> {
  return act(async actor => { await candidates.removeNote(db(), actor, noteId); return null; });
}

export async function giveFeedback(candidateId: string, input: candidates.FeedbackInput): Promise<Result<null>> {
  return act(async actor => {
    const done = await candidates.giveFeedback(db(), actor, candidateId, input);
    await tell.gave(actor, done.first ? done.askedBy : [], done.candidate);
    return null;
  });
}

export async function askFeedback(candidateId: string, memberIds: string[]): Promise<Result<{ count: number }>> {
  return act(async actor => {
    const sql = db();
    const done = await candidates.askFeedback(sql, actor, candidateId, memberIds, isRecruiter);
    const [job] = await sql<{ title: string }[]>`select title from jobs where id = ${done.candidate.jobId}`;
    await tell.asked(actor, done.asked, done.candidate, { title: job!.title });
    return { count: done.asked.length };
  });
}

export async function cancelAsk(candidateId: string, memberId: string): Promise<Result<null>> {
  return act(async actor => {
    await candidates.cancelAsk(db(), actor, candidateId, memberId);
    await tell.withdrawAsk(candidateId, memberId);
    return null;
  });
}

export async function addCandidate(jobId: string, input: { name: string; email: string; phone: string; link: string; coverLetter: string; language: string; stageId: string; cv: string; cvName: string }): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const sql = db();
    const file = input.cv ? await cv.accept(input.cv, "team", input.cvName) : null;
    try {
      const c = await candidates.addCandidate(sql, actor, jobId, { ...input, cv: file });
      await tell.refreshBadges(sql);
      return { id: c.id };
    } catch (error) {
      if (file) await cv.remove([file.object]);
      throw error;
    }
  });
}

export async function editCandidate(candidateId: string, input: { name: string; email: string; phone: string; link: string; language: string }): Promise<Result<null>> {
  return act(async actor => { await candidates.editCandidate(db(), actor, candidateId, input); return null; });
}

export async function setCv(candidateId: string, ticket: string, fileName: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const file = await cv.accept(ticket, "team", fileName);
    try {
      const done = await candidates.setCv(sql, actor, candidateId, file);
      if (done.previous) await cv.remove([done.previous]);
    } catch (error) {
      await cv.remove([file.object]);
      throw error;
    }
    return null;
  });
}

// ---- Emails -------------------------------------------------------------------

// writeTo sends a recruiter's email to a candidate now. Without mail on
// this Chest, the email is kept as "not sent" and the page opens the
// recruiter's own mail app with it (mailto:), then records it was written
// there.
export async function writeTo(candidateId: string, subject: string, text: string): Promise<Result<{ status: "sent" | "none" | "waiting"; message: string; to: string }>> {
  return act(async actor => {
    const sql = db();
    const message = await messages.write(sql, actor, candidateId, { subject, text });
    const status = await outbox.sendNow(sql, message);
    const [c] = await sql<{ email: string }[]>`select email from candidates where id = ${candidateId}`;
    return { status, message, to: c?.email ?? "" };
  });
}

export async function writtenOutside(messageId: string): Promise<Result<null>> {
  return act(async actor => { await messages.writtenOutside(db(), actor, messageId); return null; });
}

export async function saveTemplate(input: { id?: string; name: string; language: string; subject: string; body: string }): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await messages.saveTemplate(db(), actor, input)).id }));
}

export async function removeTemplate(templateId: string): Promise<Result<null>> {
  return act(async actor => { await messages.removeTemplate(db(), actor, templateId); return null; });
}

export async function fileMessage(messageId: string, candidateId: string): Promise<Result<null>> {
  return act(async actor => { await messages.file(db(), actor, messageId, candidateId); return null; });
}

export async function removeMessage(messageId: string): Promise<Result<null>> {
  return act(async actor => { await cv.remove(await messages.remove(db(), actor, messageId)); return null; });
}

// ---- Interviews ---------------------------------------------------------------

// Who may be on a candidate's interview: the job's interviewers, and the
// recruiters (the Chest says their role).
async function isTeam(memberId: string, jobId: string): Promise<boolean> {
  const [on] = await db()<{ x: number }[]>`select 1 as x from job_interviewers where job_id = ${jobId} and member_id = ${memberId}`;
  return on !== undefined || (await isRecruiter(memberId));
}

export async function scheduleInterview(candidateId: string, input: interviews.InterviewInput): Promise<Result<{ status: "sent" | "none" | "waiting" | "skipped" }>> {
  return act(async actor => {
    const sql = db();
    const done = await interviews.schedule(sql, actor, candidateId, input, isTeam);
    const status = done.message ? await outbox.sendNow(sql, done.message) : "skipped";
    await interviews.flushCalendars(sql);
    return { status };
  });
}

export async function cancelInterview(interviewId: string, tellThem: boolean): Promise<Result<{ status: "sent" | "none" | "waiting" | "skipped" }>> {
  return act(async actor => {
    const sql = db();
    const done = await interviews.cancel(sql, actor, interviewId, tellThem);
    const status = done.message ? await outbox.sendNow(sql, done.message) : "skipped";
    await interviews.flushCalendars(sql);
    return { status };
  });
}

// sendInterviewLink: the candidate chooses the time (lib/self-schedule.ts).
// Says what became of the email, and the link (for a Chest without email:
// the recruiter sends it themselves).
export async function sendInterviewLink(candidateId: string, input: selfSchedule.RequestInput): Promise<Result<{ status: "sent" | "none" | "waiting" | "skipped"; link: string }>> {
  return act(async actor => {
    const sql = db();
    const done = await selfSchedule.send(sql, actor, candidateId, input, isTeam, publicOrigin(await headers()));
    const status = done.message ? await outbox.sendNow(sql, done.message) : "skipped";
    return { status, link: done.link };
  });
}

export async function cancelInterviewLink(requestId: string): Promise<Result<null>> {
  return act(async actor => { await selfSchedule.cancel(db(), actor, requestId); return null; });
}

// busyTimes: when these people already have interviews on a day.
export async function busyTimes(people: string[], day: string): Promise<Result<interviews.Busy[]>> {
  return act(async actor => interviews.busy(db(), actor, people, day));
}

// ---- Talent pool, import ----------------------------------------------------

export async function considerFor(candidateId: string, jobId: string): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const sql = db();
    const copy = await candidates.considerFor(sql, actor, candidateId, jobId, cv.copy);
    await tell.refreshBadges(sql);
    return { id: copy.id };
  });
}

export async function setPool(candidateId: string, on: boolean): Promise<Result<null>> {
  return act(async actor => { await candidates.setPool(db(), actor, candidateId, on); return null; });
}

export async function importCandidates(jobId: string, input: { rows: unknown[]; stages: Record<string, string>; origin: string; language: string }): Promise<Result<{ added: { id: string; email: string }[]; skipped: { line: number; reason: string }[] }>> {
  return act(async actor => {
    const done = await importRows(db(), actor, jobId, input);
    await tell.refreshBadges(db());
    return done;
  });
}

export async function undoImport(ids: string[]): Promise<Result<null>> {
  return act(async actor => { await cv.remove(await undoImportRows(db(), actor, ids)); return null; });
}

export async function eraseCandidate(candidateId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const gone = await candidates.erase(sql, actor, candidateId);
    await cv.remove(gone.objects);
    await interviews.flushCalendars(sql);
    if (gone.wasHired) await share.hireCancelled(candidateId);
    await tell.settled(candidateId);
    await tell.refreshBadges(sql);
    return null;
  });
}
