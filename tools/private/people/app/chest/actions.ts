"use server";

import type { Member } from "@argentic/chest-sdk/member";
import { revalidatePath } from "next/cache";
import { db } from "../../lib/db.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import { examples } from "../../lib/examples.ts";
import { catalogue, isLocale } from "../../lib/i18n/index.ts";
import * as arrivals from "../../lib/arrivals.ts";
import { profilePhrase } from "../../lib/examples.ts";
import * as fields from "../../lib/fields.ts";
import * as records from "../../lib/records.ts";
import { today } from "../../lib/zone.ts";
import * as importer from "../../lib/importer.ts";
import * as j from "../../lib/journeys.ts";
import * as profiles from "../../lib/profiles.ts";
import * as share from "../../lib/share.ts";
import { currentMember } from "../../lib/session.ts";
import * as tell from "../../lib/tell.ts";

// The server actions of the members' part. Each is an endpoint anyone can
// call: each reads the member from the Chest's assertion again; the
// services check their rights. They answer codes, never sentences, and
// refresh the pages of /chest.

async function act<T>(step: (actor: Member) => Promise<T>): Promise<Result<T>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return step(actor);
  });
  revalidatePath("/chest", "layout");
  return result;
}

// Profiles: what a person writes about themselves, the job fields HR
// keeps, and the values of HR's extra fields. Any part may be absent. The
// newcomer's "fill in your profile" step ticks itself once they did.
export async function saveProfile(id: string, own: unknown, job: unknown, extras?: Record<string, string>): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    if (own !== null && own !== undefined) {
      if (id !== actor.id) throw new AppError("forbidden");
      const saved = await profiles.updateOwn(sql, actor, own);
      if (profiles.filled(saved)) {
        for (const ticked of await j.autoTick(sql, actor.id, profilePhrase)) await afterTick(actor, ticked);
      }
    }
    if (job !== null && job !== undefined) await profiles.updateJob(sql, actor, id, job);
    if (extras && typeof extras === "object") {
      for (const [fieldId, value] of Object.entries(extras).slice(0, 50)) await fields.setValue(sql, actor, id, fieldId, value);
    }
    return null;
  });
}

// One cell of HR's table: a job field ("title", "team", "office",
// "managerId", "startDate", "phone") or an extra field ("x:<id>").
export async function saveCell(memberId: string, key: string, value: string | null): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    if (typeof key === "string" && key.startsWith("x:")) await fields.setValue(sql, actor, memberId, key.slice(2), value ?? "");
    else if (["title", "team", "office", "managerId", "startDate", "phone"].includes(key)) await profiles.updateJob(sql, actor, memberId, { [key]: value });
    else throw new AppError("invalid");
    return null;
  });
}

// HR's extra profile fields.
export async function addField(input: { label: string; editor: string; kind?: string; options?: string; alertDays?: string }): Promise<Result<fields.Extra>> {
  return act(actor => fields.addField(db(), actor, input));
}

export async function updateField(fieldId: string, input: { label: string; editor: string; options?: string; alertDays?: string }): Promise<Result<null>> {
  return act(async actor => { await fields.updateField(db(), actor, fieldId, input); return null; });
}

export async function removeField(fieldId: string, removed: boolean): Promise<Result<null>> {
  return act(async actor => { await fields.removeField(db(), actor, fieldId, removed); return null; });
}

// Ticking a step of a checklist (or unticking it).
export async function tickItem(itemId: string, done: boolean): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const ticked = await j.tick(sql, actor, itemId, done);
    await afterTick(actor, ticked);
    return null;
  });
}

async function afterTick(actor: Member, ticked: j.Ticked): Promise<void> {
  const sql = db();
  if (ticked.assignee) await tell.todo(sql, actor, { id: ticked.journeyId }, [ticked.assignee]);
  if (ticked.completed) await tell.completed(sql, ticked.journeyId, actor);
  if (ticked.reopened) await tell.reopened(ticked.journeyId);
}

// Templates.
export async function createTemplate(input: { kind: string; name: string }): Promise<Result<{ id: string }>> {
  return act(actor => j.createTemplate(db(), actor, input));
}

export async function addExampleTemplates(): Promise<Result<string[]>> {
  return act(actor => j.addExamples(db(), actor, examples(catalogue(isLocale(actor.locale) ? actor.locale : "en"))));
}

export async function renameTemplate(templateId: string, name: string): Promise<Result<null>> {
  return act(async actor => { await j.renameTemplate(db(), actor, templateId, name); return null; });
}

export async function archiveTemplate(templateId: string, archived: boolean): Promise<Result<null>> {
  return act(async actor => { await j.archiveTemplate(db(), actor, templateId, archived); return null; });
}

export async function addTemplateItem(templateId: string, input: { text: string; role: string; memberId?: string | null; offset: number }): Promise<Result<j.TemplateItem>> {
  return act(actor => j.addTemplateItem(db(), actor, templateId, input));
}

export async function updateTemplateItem(itemId: string, input: { text: string; role: string; memberId?: string | null; offset: number }): Promise<Result<j.TemplateItem>> {
  return act(actor => j.updateTemplateItem(db(), actor, itemId, input));
}

export async function removeTemplateItem(itemId: string): Promise<Result<j.TemplateItem>> {
  return act(actor => j.removeTemplateItem(db(), actor, itemId));
}

// Checklists.
export async function startChecklist(input: { personId?: string; arrivalId?: string; managerId?: string | null; templateId: string; anchor: string }): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const sql = db();
    // A leaving checklist sets the person's last day: other tools are told.
    const person = typeof input?.personId === "string" && !input.arrivalId ? input.personId : null;
    const started = await share.around(sql, person, () => j.startJourney(sql, actor, input));
    await tell.todo(sql, actor, started, started.assignees.keys());
    return { id: started.id };
  });
}

export async function addChecklistItem(journeyId: string, input: { text: string; assignee: string | null; due: string }): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const { item, ticked } = await j.addJourneyItem(sql, actor, journeyId, input);
    if (item.assignee) await tell.todo(sql, actor, { id: ticked.journeyId }, [item.assignee]);
    if (ticked.reopened) await tell.reopened(ticked.journeyId);
    return null;
  });
}

export async function updateChecklistItem(itemId: string, input: { text?: string; assignee?: string | null; due?: string }): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const changed = await j.updateJourneyItem(sql, actor, itemId, input);
    if (changed.before !== changed.item.assignee) {
      await tell.todo(sql, actor, { id: changed.journeyId }, [changed.before, changed.item.assignee].filter((x): x is string => x !== null));
    }
    return null;
  });
}

export async function removeChecklistItem(itemId: string, removed: boolean): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const ticked = await j.removeJourneyItem(sql, actor, itemId, removed);
    await afterTick(actor, ticked);
    return null;
  });
}

export async function stopChecklist(journeyId: string, stopped: boolean): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    // Stopping (or restarting) a leaving checklist changes the person's
    // departure: other tools are told.
    const it = /^\d{1,18}$/u.test(String(journeyId)) ? await j.about(sql, String(journeyId)).catch(() => null) : null;
    const { assignees } = await share.around(sql, it?.personId ?? null, () => j.stopJourney(sql, actor, journeyId, stopped));
    if (stopped) await tell.settled(sql, journeyId, assignees);
    else await tell.todo(sql, actor, { id: journeyId }, assignees);
    return null;
  });
}

export async function deleteChecklist(journeyId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const { assignees } = await j.deleteJourney(sql, actor, journeyId);
    await tell.settled(sql, journeyId, assignees);
    return null;
  });
}

// Import: the page shows the plan (with HR's choices of columns and date
// order); the import reads the file again with the same choices.
export async function previewImport(text: string, choices: importer.Choices = {}): Promise<Result<importer.Plan>> {
  return act(actor => importer.previewImport(db(), actor, text, choices));
}

export async function applyImport(text: string, choices: importer.Choices = {}): Promise<Result<{ updated: number; skipped: number; loops: string[] }>> {
  return act(actor => importer.applyImport(db(), actor, text, choices));
}

// Arrivals written by HR by hand.
export async function addArrival(input: arrivals.ArrivalInput): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await arrivals.addArrival(db(), actor, input)).id }));
}

export async function updateArrival(arrivalId: string, input: arrivals.ArrivalInput): Promise<Result<null>> {
  return act(async actor => { await arrivals.updateArrival(db(), actor, arrivalId, input); return null; });
}

// Employee records.
export async function createRecord(input: { memberId?: string; legalName?: string }): Promise<Result<{ id: string }>> {
  return act(actor => records.createRecord(db(), actor, input));
}

export async function createAllRecords(): Promise<Result<number>> {
  return act(actor => records.createForEveryone(db(), actor));
}

export async function saveRecord(recordId: string, input: Record<string, unknown>): Promise<Result<{ changed: string[] }>> {
  return act(actor => records.updateRecord(db(), actor, recordId, input));
}

export async function linkRecord(recordId: string, memberId: string | null): Promise<Result<null>> {
  return act(async actor => { await records.linkRecord(db(), actor, recordId, memberId); return null; });
}

export async function deleteRecord(recordId: string): Promise<Result<null>> {
  return act(async actor => { await records.deleteRecord(db(), actor, recordId, today()); return null; });
}

export async function documentUpload(recordId: string, input: { type: string; size: number }): Promise<Result<{ url: string }>> {
  return act(actor => records.documentUpload(db(), actor, recordId, input));
}

export async function documentAdded(recordId: string, input: { object: string; name: string; kind: string }): Promise<Result<records.Document>> {
  return act(actor => records.addDocument(db(), actor, recordId, input));
}

export async function removeDocument(recordId: string, documentId: string): Promise<Result<null>> {
  return act(async actor => { await records.removeDocument(db(), actor, recordId, documentId); return null; });
}

// Arrivals told by other tools: linked to the member they became, or
// removed (with the checklists started for them).
export async function linkArrival(arrivalId: string, memberId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const linked = await arrivals.linkArrival(sql, actor, arrivalId, memberId);
    for (const journey of linked.journeys) {
      const open = await sql<{ assignee: string }[]>`select distinct assignee from journey_items where journey_id = ${journey} and assignee like 'mbr_%'`;
      await tell.todo(sql, actor, { id: journey }, open.map(r => r.assignee));
    }
    return null;
  });
}

export async function removeArrival(arrivalId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const { journeys } = await arrivals.removeArrival(sql, actor, arrivalId);
    for (const journey of journeys) await tell.settled(sql, journey.id, journey.assignees);
    return null;
  });
}
