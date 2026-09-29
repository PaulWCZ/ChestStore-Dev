"use server";

import type { Member } from "@argentic/chest-sdk/member";
import { revalidatePath } from "next/cache";
import { can } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { everyone } from "../../lib/directory.ts";
import * as entries from "../../lib/entries.ts";
import { AppError, attempt, type Result } from "../../lib/errors.ts";
import { catalogue, isLocale } from "../../lib/i18n/index.ts";
import { forgetFormer as forget, planImport, runImport, type ImportOptions, type ImportPlan } from "../../lib/import.ts";
import * as handoff from "../../lib/handoff.ts";
import * as invoicing from "../../lib/invoicing.ts";
import type { DateOrder } from "../../lib/import-formats.ts";
import * as projects from "../../lib/projects.ts";
import * as rates from "../../lib/rates.ts";
import type { ReportQuery } from "../../lib/reports.ts";
import { currentMember } from "../../lib/session.ts";
import * as settings from "../../lib/settings.ts";
import * as timer from "../../lib/timer.ts";
import * as weeks from "../../lib/weeks.ts";

// The server actions of the members' part. Each is an endpoint anyone can
// call: each reads the member from the Chest's assertion again; the
// services check their rights. They answer codes, never sentences, and
// refresh the pages of /chest (the timer bar is on all of them).

async function act<T>(step: (actor: Member) => Promise<T>): Promise<Result<T>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return step(actor);
  });
  revalidatePath("/chest", "layout");
  return result;
}

const wordsOf = (actor: Member) => catalogue(isLocale(actor.locale) ? actor.locale : "en");

// The timer.
export async function startTimer(input: { projectId: string; taskId: string | null; note: string }): Promise<Result<{ stopped: entries.Entry | null }>> {
  return act(actor => timer.startTimer(db(), actor, input));
}
export async function updateTimer(input: { projectId?: string; taskId?: string | null; note?: string }): Promise<Result<null>> {
  return act(async actor => { await timer.updateTimer(db(), actor, input); return null; });
}
export async function stopTimer(at?: string): Promise<Result<{ entry: entries.Entry | null; day: string }>> {
  return act(actor => timer.stopTimer(db(), actor, at));
}
export async function discardTimer(): Promise<Result<timer.Discarded>> {
  return act(actor => timer.discardTimer(db(), actor));
}
export async function restoreTimer(input: timer.Discarded): Promise<Result<null>> {
  return act(async actor => { await timer.restoreTimer(db(), actor, input); return null; });
}

// The week grid.
export async function saveCell(input: { projectId: string; taskId: string | null; day: string; minutes: number }): Promise<Result<entries.Cell>> {
  return act(actor => entries.saveCell(db(), actor, input));
}
export async function addRow(input: { week: string; projectId: string; taskId: string | null }): Promise<Result<null>> {
  return act(async actor => { await entries.addRow(db(), actor, input); return null; });
}
export async function removeRow(input: { week: string; projectId: string; taskId: string | null }): Promise<Result<string[]>> {
  return act(actor => entries.removeRow(db(), actor, input));
}
export async function copyLastWeek(week: string): Promise<Result<number>> {
  return act(actor => entries.copyLastWeek(db(), actor, week));
}
export async function restoreEntries(ids: string[], row?: { week: string; projectId: string; taskId: string | null }): Promise<Result<number>> {
  return act(async actor => {
    if (row && ids.length === 0) {
      await entries.addRow(db(), actor, row);
      return 0;
    }
    const n = await entries.restoreEntries(db(), actor, ids);
    if (row) await entries.addRow(db(), actor, row).catch(() => {});
    return n;
  });
}

// The day list.
export async function addEntry(input: entries.EntryInput): Promise<Result<entries.Entry>> {
  return act(actor => entries.addEntry(db(), actor, input));
}
export async function updateEntry(entryId: string, input: entries.EntryInput): Promise<Result<entries.Entry>> {
  return act(actor => entries.updateEntry(db(), actor, entryId, input));
}
export async function deleteEntry(entryId: string): Promise<Result<null>> {
  return act(async actor => { await entries.deleteEntry(db(), actor, entryId); return null; });
}
export async function setNote(entryId: string, note: string): Promise<Result<null>> {
  return act(async actor => { await entries.setNote(db(), actor, entryId, note); return null; });
}

// The week sent for approval, and the managers' answers.
export async function submitWeek(week: string): Promise<Result<weeks.WeekState & { approvers: number }>> {
  return act(actor => weeks.submitWeek(db(), actor, week));
}
export async function withdrawWeek(week: string): Promise<Result<null>> {
  return act(async actor => { await weeks.withdrawWeek(db(), actor, week); return null; });
}
export async function approveWeek(memberId: string, week: string, anyway = false): Promise<Result<null>> {
  return act(async actor => { await weeks.approveWeek(db(), actor, memberId, week, { anyway }); return null; });
}
export async function returnWeek(memberId: string, week: string, reason: string): Promise<Result<null>> {
  return act(async actor => { await weeks.returnWeek(db(), actor, memberId, week, reason); return null; });
}
export async function remind(memberIds: string[], week: string): Promise<Result<number>> {
  return act(actor => weeks.remind(db(), actor, memberIds, week));
}

// People: rates, usual weeks, former people (managers).
export async function setRate(input: { kind: "bill" | "cost"; projectId?: string | null; memberId?: string | null; cents: number | null; from: string }): Promise<Result<rates.RateStep[]>> {
  return act(actor => rates.setRate(db(), actor, input));
}
export async function removeRateStep(input: { kind: "bill" | "cost"; projectId?: string | null; memberId?: string | null; from: string }): Promise<Result<rates.RateStep[]>> {
  return act(actor => rates.removeStep(db(), actor, input));
}
export async function setCapacity(memberId: string, minutes: number | null): Promise<Result<null>> {
  return act(async actor => { await weeks.setCapacity(db(), actor, memberId, minutes); return null; });
}
export async function forgetFormer(formerId: string): Promise<Result<null>> {
  return act(async actor => { await forget(db(), actor, formerId); return null; });
}

// Invoiced time (managers).
export async function markInvoiced(q: ReportQuery): Promise<Result<invoicing.Marked>> {
  return act(actor => invoicing.markInvoiced(db(), actor, q));
}
// Billable time to Quotes as a draft invoice (lib/handoff.ts).
export async function sendToQuotes(input: { projectId: string; from: string; to: string }): Promise<Result<{ handoff: string; entries: number; minutes: number; receivers: number }>> {
  return act(actor => handoff.sendBillable(db(), actor, input));
}

export async function takeBackFromQuotes(handoffId: string): Promise<Result<null>> {
  return act(async actor => { await handoff.cancelHandoff(db(), actor, handoffId); return null; });
}

export async function unmarkInvoiced(marked: invoicing.Marked): Promise<Result<number>> {
  return act(actor => invoicing.unmarkInvoiced(db(), actor, marked));
}

// Clients, projects, tasks (managers).
export async function createProject(input: projects.ProjectInput): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await projects.createProject(db(), actor, input)).id }));
}
export async function updateProject(projectId: string, input: projects.ProjectInput): Promise<Result<null>> {
  return act(async actor => { await projects.updateProject(db(), actor, projectId, input); return null; });
}
export async function archiveProject(projectId: string, archived: boolean): Promise<Result<null>> {
  return act(async actor => { await projects.archiveProject(db(), actor, projectId, archived); return null; });
}
export async function addTask(projectId: string, name: string): Promise<Result<projects.Task>> {
  return act(actor => projects.addTask(db(), actor, projectId, name));
}
export async function renameTask(taskId: string, name: string): Promise<Result<null>> {
  return act(async actor => { await projects.renameTask(db(), actor, taskId, name); return null; });
}
export async function archiveTask(taskId: string, archived: boolean): Promise<Result<null>> {
  return act(async actor => { await projects.archiveTask(db(), actor, taskId, archived); return null; });
}
export async function renameClient(clientId: string, name: string): Promise<Result<null>> {
  return act(async actor => { await projects.renameClient(db(), actor, clientId, name); return null; });
}
export async function archiveClient(clientId: string, archived: boolean): Promise<Result<null>> {
  return act(async actor => { await projects.archiveClient(db(), actor, clientId, archived); return null; });
}
export async function addExample(): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const t = wordsOf(actor).projects.example;
    return { id: (await projects.example(db(), actor, { client: t.client, project: t.project, tasks: [t.design, t.development, t.meetings] })).id };
  });
}

// Settings (managers).
export async function lockUntil(day: string | null): Promise<Result<null>> {
  return act(async actor => { await settings.lock(db(), actor, day); return null; });
}
export async function saveReminder(input: { enabled: boolean; minutes: number }): Promise<Result<null>> {
  return act(async actor => { await settings.saveReminder(db(), actor, input); return null; });
}
export async function saveChoices(input: { approvals?: boolean; hoursStyle?: settings.HoursStyle }): Promise<Result<null>> {
  return act(async actor => { await settings.saveChoices(db(), actor, input); return null; });
}

// Import (managers). The people of the Chest are read here, once per call.
export type ImportChoices = { order: DateOrder | null; former: "keep" | "skip"; locked: "import" | "skip" };
async function importOptions(actor: Member, choices: ImportChoices): Promise<ImportOptions> {
  if (!can(actor, "import")) throw new AppError("forbidden");
  const people = (await everyone()).map(p => ({ id: p.id, name: p.name }));
  return { people, noProject: wordsOf(actor).importer.noProject, former: choices.former === "skip" ? "skip" : "keep", locked: choices.locked === "import" ? "import" : "skip", ...(choices.order ? { order: choices.order } : {}) };
}
export async function previewImport(text: string, choices: ImportChoices): Promise<Result<ImportPlan>> {
  return attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return planImport(db(), actor, text, await importOptions(actor, choices));
  });
}
export async function importTime(text: string, choices: ImportChoices): Promise<Result<{ imported: number }>> {
  return act(async actor => ({ imported: (await runImport(db(), actor, text, await importOptions(actor, choices))).imported }));
}
