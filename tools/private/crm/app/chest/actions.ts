"use server";

import { revalidatePath } from "next/cache";
import * as activities from "../../lib/activities.ts";
import * as companies from "../../lib/companies.ts";
import * as contacts from "../../lib/contacts.ts";
import { db } from "../../lib/db.ts";
import * as deals from "../../lib/deals.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import { catalogue, isLocale } from "../../lib/i18n/index.ts";
import type { ImportReport } from "../../lib/importers.ts";
import { search, type Lookalike } from "../../lib/search.ts";
import { currentMember } from "../../lib/session.ts";
import * as stages from "../../lib/stages.ts";
import * as steps from "../../lib/steps.ts";
import * as tell from "../../lib/tell.ts";

// The server actions of the members' part. Each is an endpoint anyone can
// call: each reads the member from the Chest's assertion again; the
// services check their rights. They answer codes, never sentences, and
// refresh the pages of /chest.

type Actor = NonNullable<Awaited<ReturnType<typeof currentMember>>>;
async function act<T>(step: (actor: Actor) => Promise<T>, refresh = true): Promise<Result<T>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return step(actor);
  });
  if (refresh) revalidatePath("/chest", "layout");
  return result;
}

type CompanyInput = { name?: string; website?: string; phone?: string; address?: string; industry?: string; notes?: string; tags?: string; owner?: string | null };
type ContactInput = { name?: string; email?: string; phone?: string; title?: string; company?: string | null; notes?: string; tags?: string; owner?: string | null };
type DealInput = { title?: string; company?: string | null; contact?: string | null; value?: string; stage?: string; expectedClose?: string | null; owner?: string | null; reason?: string };

// Companies.
export async function addCompany(input: CompanyInput): Promise<Result<{ id: string; name: string }>> {
  return act(actor => companies.addCompany(db(), actor, input));
}
export async function updateCompany(id: string, input: CompanyInput): Promise<Result<null>> {
  return act(async actor => { await companies.updateCompany(db(), actor, id, input); return null; });
}
export async function deleteCompany(id: string): Promise<Result<null>> {
  return act(async actor => { await companies.deleteCompany(db(), actor, id); return null; });
}

// Contacts.
export async function addContact(input: ContactInput): Promise<Result<{ id: string; name: string }>> {
  return act(actor => contacts.addContact(db(), actor, input));
}
export async function updateContact(id: string, input: ContactInput): Promise<Result<null>> {
  return act(async actor => { await contacts.updateContact(db(), actor, id, input); return null; });
}
export async function deleteContact(id: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const gone = await contacts.deleteContact(sql, actor, id);
    if (gone.stepId) await tell.stepSettled(gone.stepId);
    await tell.refreshBadges(sql, [gone.stepOwner]);
    return null;
  });
}

// Duplicates: asked while a person types (no refresh).
export async function checkLookalikes(input: { kind: "company" | "contact"; name?: string; email?: string; website?: string; except?: string }): Promise<Result<Lookalike[]>> {
  return act(async actor => (await import("../../lib/search.ts")).lookalikes(db(), actor, input), false);
}

// Quick search for pickers (no refresh).
export async function quickSearch(q: string): Promise<Result<Awaited<ReturnType<typeof search>>>> {
  return act(actor => search(db(), actor, q), false);
}

// Deals.
export async function addDeal(input: DealInput): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const d = await deals.addDeal(db(), actor, { ...input, title: input.title ?? "" });
    await tell.dealGiven(actor, d.owner, { id: d.id, title: d.title, value: d.value });
    return { id: d.id };
  });
}
export async function updateDeal(id: string, input: DealInput): Promise<Result<null>> {
  return act(async actor => { await deals.updateDeal(db(), actor, id, input); return null; });
}
export async function moveDeal(id: string, stageId: string, after: string | null, before: string | null, reason?: string): Promise<Result<null>> {
  return act(async actor => { await deals.moveDeal(db(), actor, id, stageId, after, before, reason); return null; });
}
export async function setDealOwner(id: string, owner: string | null): Promise<Result<null>> {
  return act(async actor => {
    const done = await deals.setOwner(db(), actor, id, owner);
    await tell.dealSettled(id);
    await tell.dealGiven(actor, done.given, { id, title: done.deal.title, value: done.deal.value });
    return null;
  });
}
export async function deleteDeal(id: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const gone = await deals.deleteDeal(sql, actor, id);
    await tell.dealSettled(id);
    if (gone.stepId) await tell.stepSettled(gone.stepId);
    await tell.refreshBadges(sql, [gone.stepOwner]);
    return null;
  });
}

// What happened.
export async function logActivity(on: { deal?: string; contact?: string; company?: string }, kind: string, body: string): Promise<Result<activities.Activity>> {
  return act(actor => activities.log(db(), actor, on, kind, body));
}
export async function editActivity(id: string, body: string): Promise<Result<null>> {
  return act(async actor => { await activities.edit(db(), actor, id, body); return null; });
}
export async function removeActivity(id: string): Promise<Result<null>> {
  return act(async actor => { await activities.remove(db(), actor, id); return null; });
}
export async function restoreActivity(id: string): Promise<Result<null>> {
  return act(async actor => { await activities.restore(db(), actor, id); return null; });
}

// Next steps.
export async function setStep(on: { deal?: string; contact?: string }, input: { text: string; due: string; owner?: string | null }): Promise<Result<steps.Step>> {
  return act(async actor => {
    const sql = db();
    const done = await steps.setStep(sql, actor, on, input);
    if (done.previousOwner && done.previousOwner !== done.step.owner) await tell.stepSettled(done.step.id, [done.previousOwner]);
    if (done.given) {
      const title = done.step.dealId ? (await deals.deal(sql, actor, done.step.dealId)).title : (await contacts.contact(sql, actor, done.step.contactId)).name;
      await tell.stepGiven(actor, done.given, done.step, { kind: done.step.dealId ? "deal" : "contact", id: (done.step.dealId ?? done.step.contactId)!, title });
    }
    await tell.refreshBadges(sql, [done.previousOwner, done.step.owner]);
    return done.step;
  });
}
export async function completeStep(id: string): Promise<Result<steps.Step>> {
  return act(async actor => {
    const sql = db();
    const done = await steps.completeStep(sql, actor, id);
    await tell.stepSettled(done.step.id);
    await tell.refreshBadges(sql, [done.step.owner]);
    return done.step;
  });
}
export async function reopenStep(id: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const s = await steps.reopenStep(sql, actor, id);
    await tell.refreshBadges(sql, [s.owner]);
    return null;
  });
}
export async function clearStep(id: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const s = await steps.clearStep(sql, actor, id);
    await tell.stepSettled(s.id);
    await tell.refreshBadges(sql, [s.owner]);
    return null;
  });
}

// Stages (managers).
export async function addStage(name: string, probability: string): Promise<Result<null>> {
  return act(async actor => { await stages.addStage(db(), actor, { name, probability }); return null; });
}
export async function updateStage(id: string, input: { name?: string; probability?: string }): Promise<Result<null>> {
  return act(async actor => { await stages.updateStage(db(), actor, id, input); return null; });
}
export async function moveStage(id: string, direction: "up" | "down"): Promise<Result<null>> {
  return act(async actor => { await stages.moveStage(db(), actor, id, direction === "up" ? "up" : "down"); return null; });
}
export async function removeStage(id: string): Promise<Result<null>> {
  return act(async actor => { await stages.removeStage(db(), actor, id); return null; });
}

// Import: the page read the file to show what will come; the server reads
// it again (never trusting the page's reading).
export async function importTable(kind: string, text: string, mapping: string[]): Promise<Result<ImportReport>> {
  return act(async actor => {
    const { importTable: run } = await import("../../lib/importers.ts");
    const t = catalogue(isLocale(actor.locale) ? actor.locale : "en");
    return run(db(), actor, kind, text, mapping, t.stages);
  });
}
export async function importVcards(text: string): Promise<Result<ImportReport>> {
  return act(async actor => (await import("../../lib/importers.ts")).importVcards(db(), actor, text));
}
