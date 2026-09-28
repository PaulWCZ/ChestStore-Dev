"use server";

import type { Member } from "@argentic/chest-sdk/member";
import { revalidatePath } from "next/cache";
import { db } from "../../lib/db.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import { examples } from "../../lib/examples.ts";
import { catalogue, isLocale } from "../../lib/i18n/index.ts";
import * as arrivals from "../../lib/arrivals.ts";
import * as importer from "../../lib/importer.ts";
import * as j from "../../lib/journeys.ts";
import * as profiles from "../../lib/profiles.ts";
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

// Profiles: what a person writes about themselves, and the job fields HR
// keeps. Either part may be absent.
export async function saveProfile(id: string, own: unknown, job: unknown): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    if (own !== null && own !== undefined) {
      if (id !== actor.id) throw new AppError("forbidden");
      await profiles.updateOwn(sql, actor, own);
    }
    if (job !== null && job !== undefined) await profiles.updateJob(sql, actor, id, job);
    return null;
  });
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
    const started = await j.startJourney(sql, actor, input);
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
    const { assignees } = await j.stopJourney(sql, actor, journeyId, stopped);
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

// Import: the page shows the plan; the import reads the file again.
export async function previewImport(text: string): Promise<Result<importer.Plan>> {
  return act(actor => importer.previewImport(db(), actor, text));
}

export async function applyImport(text: string): Promise<Result<{ updated: number; skipped: number; loops: string[] }>> {
  return act(actor => importer.applyImport(db(), actor, text));
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
