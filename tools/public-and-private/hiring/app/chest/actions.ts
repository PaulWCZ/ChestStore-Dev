"use server";

import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { revalidatePath } from "next/cache";
import * as candidates from "../../lib/candidates.ts";
import * as cv from "../../lib/cv.ts";
import { db } from "../../lib/db.ts";
import { AppError, attempt, type Result } from "../../lib/errors.ts";
import { catalogue } from "../../lib/i18n/index.ts";
import * as jobs from "../../lib/jobs.ts";
import * as mailer from "../../lib/mailer.ts";
import { clean, limits } from "../../lib/model.ts";
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
    const t = catalogue(actor.locale).jobSettings.defaults;
    const job = await jobs.createJob(db(), actor, input, [t.new, t.screening, t.interview, t.offer, t.hired]);
    return { id: job.id };
  });
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

export async function saveSettings(input: { companyName?: string; intro?: string; careersOpen?: boolean; retentionMonths?: number }): Promise<Result<null>> {
  return act(async actor => { await jobs.saveSettings(db(), actor, input); return null; });
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

// rejectCandidate records the rejection, then sends the email the
// recruiter wrote, when they asked for it (the mail proposal: without it,
// the rejection stands and the page says no email left).
export async function rejectCandidate(candidateId: string, reason: string, note: string, email: { send: boolean; text: string }): Promise<Result<{ delivery: "email" | "none" | "skipped" }>> {
  return act(async actor => {
    const sql = db();
    const text = email.send ? clean(email.text, limits.emailText, { multiline: true }) : "";
    const before = await candidates.candidate(sql, actor, candidateId);
    const c = await candidates.reject(sql, actor, candidateId, reason, note);
    if (before.candidate.status === "active" && (await candidates.isHiredStage(sql, c.stageId))) await share.hireCancelled(c.id);
    await tell.settled(c.id);
    await tell.refreshBadges(sql);
    if (!email.send) return { delivery: "skipped" as const };
    const [job] = await sql<{ title: string }[]>`select title from jobs where id = ${c.jobId}`;
    const s = await jobs.settings(sql);
    const delivery = await mailer.reject(c, { title: job!.title }, s.companyName, actor.firstName || actor.name, text);
    if (delivery === "email") await candidates.emailed(sql, c.id, actor.id, "rejection");
    return { delivery };
  });
}

export async function restoreCandidate(candidateId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const before = await candidates.candidate(sql, actor, candidateId);
    const c = await candidates.restore(sql, actor, candidateId);
    if (before.candidate.status === "rejected" && (await candidates.isHiredStage(sql, c.stageId))) await tellHired(actor, { ...c, stageEnteredAt: new Date().toISOString() });
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

export async function eraseCandidate(candidateId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const gone = await candidates.erase(sql, actor, candidateId);
    await cv.remove(gone.objects);
    if (gone.wasHired) await share.hireCancelled(candidateId);
    await tell.settled(candidateId);
    await tell.refreshBadges(sql);
    return null;
  });
}
