"use server";

import { revalidatePath } from "next/cache";
import * as activities from "../../lib/activities.ts";
import { detach, forgetObjects } from "../../lib/attachments.ts";
import { bulk, type BulkAction } from "../../lib/bulk.ts";
import * as companies from "../../lib/companies.ts";
import * as contacts from "../../lib/contacts.ts";
import { db } from "../../lib/db.ts";
import * as deals from "../../lib/deals.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import * as fields from "../../lib/fields.ts";
import { catalogue, isLocale } from "../../lib/i18n/index.ts";
import type { ImportReport } from "../../lib/importers.ts";
import * as leads from "../../lib/leads.ts";
import { mergeCompanies, mergeContacts } from "../../lib/merge.ts";
import { search, type Lookalike } from "../../lib/search.ts";
import { currentMember } from "../../lib/session.ts";
import * as share from "../../lib/share.ts";
import * as stages from "../../lib/stages.ts";
import { publishStep, reconcile } from "../../lib/step-calendar.ts";
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

type Custom = Record<string, string>;
type CompanyInput = { name?: string; website?: string; phone?: string; email?: string; address?: string; postcode?: string; city?: string; country?: string; siren?: string; vat?: string; industry?: string; notes?: string; tags?: string; owner?: string | null; custom?: Custom };
type ContactInput = { name?: string; email?: string; phone?: string; phone2?: string; url?: string; title?: string; company?: string | null; notes?: string; tags?: string; owner?: string | null; custom?: Custom };
type DealInput = { title?: string; company?: string | null; contact?: string | null; value?: string; stage?: string; expectedClose?: string | null; owner?: string | null; reason?: string; custom?: Custom };

// What a deletion leaves to settle: the bell items of the steps that went,
// the tiles' numbers, the stored files.
async function settle(gone: { steps: { id: string; owner: string | null }[]; objects: string[] }): Promise<void> {
  for (const s of gone.steps) await tell.stepSettled(s.id);
  await tell.refreshBadges(db(), gone.steps.map(s => s.owner));
  await forgetObjects(gone.objects);
  // Steps gone with what they were about leave the calendars too.
  await reconcile(db());
}

// Companies.
export async function addCompany(input: CompanyInput): Promise<Result<{ id: string; name: string }>> {
  return act(actor => companies.addCompany(db(), actor, input));
}
export async function updateCompany(id: string, input: CompanyInput): Promise<Result<null>> {
  return act(async actor => { await companies.updateCompany(db(), actor, id, input); return null; });
}
export async function deleteCompany(id: string): Promise<Result<null>> {
  return act(async actor => { await settle({ steps: [], ...(await companies.deleteCompany(db(), actor, id)) }); return null; });
}

// Contacts.
export async function addContact(input: ContactInput): Promise<Result<{ id: string; name: string }>> {
  return act(actor => contacts.addContact(db(), actor, input));
}
export async function updateContact(id: string, input: ContactInput): Promise<Result<null>> {
  return act(async actor => { await contacts.updateContact(db(), actor, id, input); await reconcile(db()); return null; });
}
export async function deleteContact(id: string): Promise<Result<null>> {
  return act(async actor => { await settle(await contacts.deleteContact(db(), actor, id)); return null; });
}

// Leads from the forms (My day), a contact that may be another, and the
// form answers a manager checks (lib/leads.ts).
export async function takeLead(id: string, to?: string): Promise<Result<{ name: string }>> {
  return act(async actor => {
    const taken = await leads.takeLead(db(), actor, id, to);
    await tell.leadGiven(actor, taken.owner, taken);
    return { name: taken.name };
  });
}
export async function dismissLead(id: string): Promise<Result<null>> {
  return act(async actor => { await leads.dismissLead(db(), actor, id); return null; });
}
export async function restoreLead(id: string): Promise<Result<null>> {
  return act(async actor => { await leads.restoreLead(db(), actor, id); return null; });
}
export async function keepApart(id: string): Promise<Result<null>> {
  return act(async actor => { await leads.keepApart(db(), actor, id); return null; });
}
export async function markFormLine(id: string, checked: boolean): Promise<Result<null>> {
  return act(async actor => { await leads.markChecked(db(), actor, id, checked); return null; });
}
export async function moveFormLine(id: string, to: string): Promise<Result<{ contact: string }>> {
  return act(actor => leads.moveLine(db(), actor, id, to));
}

// Many at once, and duplicates merged.
export async function bulkChange(table: "companies" | "contacts" | "deals", ids: string[], action: BulkAction): Promise<Result<{ done: number; skipped: number }>> {
  return act(async actor => {
    if (table !== "companies" && table !== "contacts" && table !== "deals") throw new AppError("invalid");
    const done = await bulk(db(), actor, table, ids, action);
    await settle(done);
    for (const g of done.given) await tell.dealGiven(actor, g.owner, g);
    return { done: done.done, skipped: done.skipped };
  });
}
export async function matchingIds(table: "companies" | "contacts", filter: { q?: string; owner?: string; tag?: string; stale?: boolean; field?: { field: string; value?: string; min?: string; max?: string } }): Promise<Result<string[]>> {
  return act(actor => (table === "companies" ? companies.companyIds(db(), actor, filter) : contacts.contactIds(db(), actor, filter)), false);
}
export async function merge(table: "companies" | "contacts", from: string, into: string): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const done = await (table === "companies" ? mergeCompanies(db(), actor, from, into) : mergeContacts(db(), actor, from, into));
    await reconcile(db());
    return done;
  });
}

// Duplicates: asked while a person types (no refresh).
export async function checkLookalikes(input: { kind: "company" | "contact"; name?: string; email?: string; website?: string; except?: string }): Promise<Result<Lookalike[]>> {
  return act(async actor => (await import("../../lib/search.ts")).lookalikes(db(), actor, input), false);
}

// Quick search, and the pickers' choices as one types (no refresh).
export async function quickSearch(q: string): Promise<Result<Awaited<ReturnType<typeof search>>>> {
  return act(actor => search(db(), actor, q), false);
}
export async function pickCompanies(q: string): Promise<Result<{ id: string; name: string; detail: string }[]>> {
  return act(actor => companies.companyChoices(db(), actor, q), false);
}
export async function pickContacts(q: string, company: string | null): Promise<Result<{ id: string; name: string; detail: string; companyId: string | null; companyName: string | null }[]>> {
  return act(actor => contacts.contactChoices(db(), actor, q, company), false);
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
  return act(async actor => { await deals.updateDeal(db(), actor, id, input); await reconcile(db()); return null; });
}
export async function moveDeal(id: string, stageId: string, after: string | null, before: string | null, reason?: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const done = await deals.moveDeal(sql, actor, id, stageId, after, before, reason);
    await share.moved(sql, done.deal, done.from, done.to);
    return null;
  });
}
export async function setDealOwner(id: string, owner: string | null): Promise<Result<null>> {
  return act(async actor => {
    const done = await deals.setOwner(db(), actor, id, owner);
    await reconcile(db());
    await tell.dealSettled(id);
    await tell.dealGiven(actor, done.given, { id, title: done.deal.title, value: done.deal.value });
    return null;
  });
}
export async function deleteDeal(id: string): Promise<Result<null>> {
  return act(async actor => {
    await settle(await deals.deleteDeal(db(), actor, id));
    await tell.dealSettled(id);
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
type StepInput = { text: string; due: string; time?: string | null; owner?: string | null };
async function titleOf(actor: Actor, step: steps.Step): Promise<{ kind: "deal" | "contact"; id: string; title: string } | null> {
  const sql = db();
  if (step.dealId) return { kind: "deal", id: step.dealId, title: (await deals.deal(sql, actor, step.dealId)).title };
  if (step.contactId) return { kind: "contact", id: step.contactId, title: (await contacts.contact(sql, actor, step.contactId)).name };
  return null;
}
export async function addStep(on: { deal?: string; contact?: string } | null, input: StepInput): Promise<Result<steps.Step>> {
  return act(async actor => {
    const sql = db();
    const done = await steps.addStep(sql, actor, on, input);
    await publishStep(sql, done.step.id);
    if (done.given) await tell.stepGiven(actor, done.given, done.step, await titleOf(actor, done.step));
    await tell.refreshBadges(sql, [done.step.owner]);
    return done.step;
  });
}
export async function updateStep(id: string, input: StepInput): Promise<Result<steps.Step>> {
  return act(async actor => {
    const sql = db();
    const done = await steps.updateStep(sql, actor, id, input);
    await publishStep(sql, done.step.id);
    if (done.previousOwner && done.previousOwner !== done.step.owner) await tell.stepSettled(done.step.id, [done.previousOwner]);
    if (done.given) await tell.stepGiven(actor, done.given, done.step, await titleOf(actor, done.step));
    await tell.refreshBadges(sql, [done.previousOwner, done.step.owner]);
    return done.step;
  });
}
export async function completeStep(id: string): Promise<Result<{ last: boolean }>> {
  return act(async actor => {
    const sql = db();
    const done = await steps.completeStep(sql, actor, id);
    await publishStep(sql, done.step.id);
    await tell.stepSettled(done.step.id);
    await tell.refreshBadges(sql, [done.step.owner]);
    return { last: done.last };
  });
}
export async function reopenStep(id: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const s = await steps.reopenStep(sql, actor, id);
    await publishStep(sql, s.id);
    await tell.refreshBadges(sql, [s.owner]);
    return null;
  });
}
export async function clearStep(id: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const s = await steps.clearStep(sql, actor, id);
    await publishStep(sql, s.id);
    await tell.stepSettled(s.id);
    await tell.refreshBadges(sql, [s.owner]);
    return null;
  });
}

// Files: removing one (adding goes through app/chest/api/files).
export async function removeFile(id: string): Promise<Result<null>> {
  return act(async actor => { await forgetObjects([await detach(db(), actor, id)]); return null; });
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

// The team's own fields (managers).
export async function addField(input: { object: string; label: string; kind: string; options?: string }): Promise<Result<null>> {
  return act(async actor => { await fields.addField(db(), actor, input); return null; });
}
export async function updateField(id: string, input: { label?: string; options?: string }): Promise<Result<null>> {
  return act(async actor => { await fields.updateField(db(), actor, id, input); return null; });
}
export async function moveField(id: string, direction: "up" | "down"): Promise<Result<null>> {
  return act(async actor => { await fields.moveField(db(), actor, id, direction === "up" ? "up" : "down"); return null; });
}
export async function removeField(id: string): Promise<Result<null>> {
  return act(async actor => { await fields.removeField(db(), actor, id); return null; });
}

// Import: the page read the file to show what will come; the server reads
// it again (never trusting the page's reading).
type ImportOptions = { fileName?: string; ownerFallback?: string; fillEmpty?: boolean };
export async function importTable(kind: string, text: string, mapping: string[], options: ImportOptions = {}): Promise<Result<ImportReport>> {
  return act(async actor => {
    const { importTable: run } = await import("../../lib/importers.ts");
    const t = catalogue(isLocale(actor.locale) ? actor.locale : "en");
    const report = await run(db(), actor, kind, text, mapping, t.stages, options);
    await reconcile(db());
    return report;
  });
}
export async function importVcards(text: string, options: ImportOptions = {}): Promise<Result<ImportReport>> {
  return act(async actor => (await import("../../lib/importers.ts")).importVcards(db(), actor, text, options));
}
export async function importOwners(names: string[]): Promise<Result<string[]>> {
  return act(async actor => (await import("../../lib/importers.ts")).unknownOwners(actor, names), false);
}
export async function undoImport(id: string): Promise<Result<{ removed: number }>> {
  return act(async actor => {
    const done = await (await import("../../lib/importers.ts")).undoImport(db(), actor, id);
    await settle(done);
    return { removed: done.removed };
  });
}
