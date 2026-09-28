"use server";

import type { Member } from "@argentic/chest-sdk/member";
import { revalidatePath } from "next/cache";
import { can } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { everyone } from "../../lib/directory.ts";
import * as entries from "../../lib/entries.ts";
import { AppError, attempt, type Result } from "../../lib/errors.ts";
import { catalogue, isLocale } from "../../lib/i18n/index.ts";
import { planImport, runImport, type ImportPlan } from "../../lib/import.ts";
import type { DateOrder } from "../../lib/import-formats.ts";
import * as projects from "../../lib/projects.ts";
import { currentMember } from "../../lib/session.ts";
import * as settings from "../../lib/settings.ts";
import * as timer from "../../lib/timer.ts";

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
export async function stopTimer(at?: string): Promise<Result<{ entry: entries.Entry | null }>> {
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

// Import (managers). The people of the Chest are read here, once per call.
async function importOptions(actor: Member, order: DateOrder | null) {
  if (!can(actor, "import")) throw new AppError("forbidden");
  const people = (await everyone()).map(p => ({ id: p.id, name: p.name }));
  return { people, noProject: wordsOf(actor).importer.noProject, ...(order ? { order } : {}) };
}
export async function previewImport(text: string, order: DateOrder | null): Promise<Result<ImportPlan>> {
  return attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return planImport(db(), actor, text, await importOptions(actor, order));
  });
}
export async function importTime(text: string, order: DateOrder | null): Promise<Result<{ imported: number }>> {
  return act(async actor => ({ imported: (await runImport(db(), actor, text, await importOptions(actor, order))).imported }));
}
