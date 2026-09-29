"use server";

import * as chest from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { revalidatePath } from "next/cache";
import * as checks from "../../lib/checks.ts";
import * as components from "../../lib/components.ts";
import { db } from "../../lib/db.ts";
import { AppError, attempt, type Result } from "../../lib/errors.ts";
import { catalogue } from "../../lib/i18n/index.ts";
import { otherLanguage, writerLanguage } from "../../lib/languages.ts";
import * as incidents from "../../lib/incidents.ts";
import * as hooks from "../../lib/hooks.ts";
import { flushHooks } from "../../lib/hooks.ts";
import { flush } from "../../lib/mailer.ts";
import { moment, worst, type Impact } from "../../lib/model.ts";
import { currentMember } from "../../lib/session.ts";
import { setChecksState } from "../../lib/settings.ts";
import { headers } from "next/headers";
import * as heartbeats from "../../lib/heartbeats.ts";
import { savePageSettings } from "../../lib/page-settings.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import * as subscribers from "../../lib/subscribers.ts";
import * as templates from "../../lib/templates.ts";
import * as tell from "../../lib/tell.ts";
import { tellTools } from "../../lib/tell-tools.ts";

// The server actions of the members' part. Each is an endpoint anyone can
// call: each reads the member from the Chest's assertion again; the
// services check their rights. They answer codes, never sentences, and
// refresh the pages of /chest and the public page.

async function act<T>(step: (actor: Member) => Promise<T>): Promise<Result<T>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return step(actor);
  });
  revalidatePath("/", "layout");
  return result;
}

// After an update is posted, the first emails go at once (a few, so the
// editor never waits); the schedule sends the rest.
async function sendSoon(): Promise<void> {
  try {
    await flush(db(), { limit: 25 });
  } catch (error) {
    console.error("emails not sent yet", error instanceof Error ? error.name : "error");
  }
  try {
    await flushHooks(db(), { limit: 50 });
  } catch (error) {
    console.error("chat updates not sent yet", error instanceof Error ? error.name : "error");
  }
}

async function namesOf(ids: string[]): Promise<string[]> {
  const all = await components.allComponents(db());
  return ids.map(id => all.find(c => c.id === id)?.name).filter((n): n is string => Boolean(n));
}

// ---- Incidents -------------------------------------------------------------

export type WhenInput = { day: string; minutes: number };
const zone = () => chest.timeZone();

type SecondInput = { title?: string; body?: string; resolution?: string } | null;

export async function postIncident(input: { title: string; status: string; body: string; states: Record<string, string>; second?: SecondInput; language?: string }): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const sql = db();
    const { incidentId } = await incidents.openIncident(sql, actor, input);
    const impacts = Object.values(input.states) as Impact[];
    await tell.incidentOpened({ id: incidentId, title: input.title.trim() }, worst(impacts), await namesOf(Object.keys(input.states)));
    await tell.refreshBadges(sql);
    await sendSoon();
    await tellTools(sql, incidentId, "opened");
    return { id: incidentId };
  });
}

export async function backfillIncident(input: { title: string; body: string; resolution: string; states: Record<string, string>; started: WhenInput; resolved: WhenInput; second?: SecondInput; language?: string }): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const startedAt = moment(input.started?.day, input.started?.minutes, zone());
    const resolvedAt = moment(input.resolved?.day, input.resolved?.minutes, zone());
    const { incidentId } = await incidents.backfill(db(), actor, { title: input.title, body: input.body, resolution: input.resolution, states: input.states, startedAt, resolvedAt, second: input.second ?? null, language: input.language });
    return { id: incidentId };
  });
}

// An update; reopen: true only from the "Reopen" dialog (a resolved
// incident refuses any other step).
export async function postUpdate(incidentId: string, input: { status: string; body: string; bodySecond?: string; states?: Record<string, string>; reopen?: boolean }): Promise<Result<{ resolved: boolean }>> {
  return act(async actor => {
    const sql = db();
    const before = await incidents.incidentFor(sql, actor, incidentId);
    const done = await incidents.addUpdate(sql, actor, incidentId, input);
    if (done.resolved && before.status !== "resolved") await tell.incidentResolved({ id: before.id, title: before.title });
    if (done.reopened) {
      const after = await incidents.incidentFor(sql, actor, incidentId);
      const last = after.updates.find(u => u.removedAt === null);
      await tell.incidentOpened({ id: after.id, title: after.title }, worst(Object.values(last?.states ?? {})), await namesOf(Object.keys(last?.states ?? {})));
    }
    await tell.refreshBadges(sql);
    await sendSoon();
    await tellTools(sql, incidentId, done.reopened ? "opened" : undefined);
    return { resolved: done.resolved };
  });
}

export async function renameIncident(incidentId: string, title: string, titleSecond?: string): Promise<Result> {
  return act(async actor => { await incidents.renameIncident(db(), actor, incidentId, title, titleSecond); await tellTools(db(), incidentId); return null; });
}

// Corrects an update's text and, when given, its second version: each
// change is logged.
export async function editUpdate(updateId: string, body: string, bodySecond?: string): Promise<Result> {
  return act(async actor => {
    await incidents.editUpdate(db(), actor, updateId, body);
    if (bodySecond !== undefined) await incidents.editUpdate(db(), actor, updateId, bodySecond, new Date(), { second: true });
    return null;
  });
}

export async function writePostmortem(incidentId: string, input: { body: string; bodySecond?: string }): Promise<Result> {
  return act(async actor => { await incidents.writePostmortem(db(), actor, incidentId, input); return null; });
}

export async function removeUpdate(updateId: string): Promise<Result> {
  return act(async actor => {
    const { incidentId } = await incidents.removeUpdate(db(), actor, updateId);
    await tell.refreshBadges(db());
    await tellTools(db(), incidentId);
    return null;
  });
}

export async function restoreUpdate(updateId: string): Promise<Result> {
  return act(async actor => {
    await incidents.restoreUpdate(db(), actor, updateId);
    await tell.refreshBadges(db());
    const [row] = await db()<{ incident_id: string }[]>`select incident_id from updates where id = ${/^[1-9][0-9]{0,17}$/u.test(updateId) ? updateId : "0"}`;
    if (row) await tellTools(db(), String(row.incident_id));
    return null;
  });
}

export async function removeIncident(incidentId: string): Promise<Result> {
  return act(async actor => {
    await incidents.removeIncident(db(), actor, incidentId);
    await tell.incidentRemoved(incidentId);
    await tell.refreshBadges(db());
    await tellTools(db(), incidentId);
    return null;
  });
}

export async function restoreIncident(incidentId: string): Promise<Result> {
  return act(async actor => {
    await incidents.restoreIncident(db(), actor, incidentId);
    await tell.refreshBadges(db());
    await tellTools(db(), incidentId, "opened");
    return null;
  });
}

// ---- Maintenance -----------------------------------------------------------

type MaintenanceForm = { title: string; body?: string; start: WhenInput; end: WhenInput; components: string[]; autoPosts: boolean; second?: SecondInput; language?: string };

export async function planMaintenance(input: MaintenanceForm): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const start = moment(input.start?.day, input.start?.minutes, zone());
    const end = moment(input.end?.day, input.end?.minutes, zone());
    const { incidentId } = await incidents.planMaintenance(db(), actor, { title: input.title, body: input.body, start, end, components: input.components, autoPosts: input.autoPosts, second: input.second ?? null, language: input.language });
    await sendSoon();
    return { id: incidentId };
  });
}

export async function changeMaintenance(incidentId: string, input: MaintenanceForm): Promise<Result> {
  return act(async actor => {
    const start = moment(input.start?.day, input.start?.minutes, zone());
    const end = moment(input.end?.day, input.end?.minutes, zone());
    await incidents.editMaintenance(db(), actor, incidentId, { title: input.title, start, end, components: input.components, autoPosts: input.autoPosts });
    return null;
  });
}

export async function postMaintenanceUpdate(incidentId: string, input: { status: string; body: string; bodySecond?: string }): Promise<Result> {
  return act(async actor => {
    await incidents.maintenanceUpdate(db(), actor, incidentId, input);
    await sendSoon();
    return null;
  });
}

// ---- Components ------------------------------------------------------------

export async function addComponent(input: { name: string; description?: string; parentId?: string | null; kind?: string; teamOnly?: boolean; language?: string; second?: { name?: string; description?: string } }): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await components.addComponent(db(), actor, input)).id }));
}

// A first page in one click: the usual services, written in the editor's
// language with their names in the other one — a bilingual company's
// visitors read them in theirs from the first day.
export async function addExample(): Promise<Result> {
  return act(async actor => {
    const sql = db();
    if ((await components.allComponents(sql)).length > 0) return null;
    const language = writerLanguage(actor);
    const names = catalogue(language).components.exampleNames.split("|");
    const seconds = catalogue(otherLanguage(language)).components.exampleNames.split("|");
    for (const [k, name] of names.slice(0, 8).entries()) await components.addComponent(sql, actor, { name, language, second: { name: seconds[k] } });
    return null;
  });
}

export async function updateComponent(componentId: string, input: { name?: string; description?: string; parentId?: string | null; hidden?: boolean; teamOnly?: boolean; second?: { name?: string; description?: string } }): Promise<Result> {
  return act(async actor => { await components.updateComponent(db(), actor, componentId, input); return null; });
}

export async function moveComponent(componentId: string, direction: "up" | "down"): Promise<Result> {
  return act(async actor => { await components.moveComponent(db(), actor, componentId, direction); return null; });
}

export async function removeComponent(componentId: string): Promise<Result<components.Snapshot>> {
  return act(async actor => {
    const sql = db();
    const watched = (await checks.listWatches(sql)).some(w => w.componentId === componentId);
    const gone = await components.removeComponent(sql, actor, componentId);
    if (watched) await setChecksState(sql, await checks.syncChest(sql));
    return { kind: gone.kind, name: gone.name, description: gone.description, parentId: gone.parentId, position: gone.position, hidden: gone.hidden, teamOnly: gone.teamOnly };
  });
}

// The Undo of a deletion (the kit's toast): the component back in its place.
export async function putBackComponent(snapshot: components.Snapshot): Promise<Result> {
  return act(async actor => { await components.putBack(db(), actor, snapshot); return null; });
}

// ---- Checks (Proposal (studio)) --------------------------------------------

// Saving keeps the addresses in the tool, then hands the whole list to the
// Chest; running is false when this Chest cannot run checks yet.
export async function saveChecks(list: checks.WatchInput[]): Promise<Result<{ running: boolean }>> {
  return act(async actor => {
    const sql = db();
    await checks.saveWatches(sql, actor, list);
    const state = await checks.syncChest(sql);
    await setChecksState(sql, state);
    return { running: state === "running" };
  });
}

// ---- Subscribers -----------------------------------------------------------

export async function removeSubscriber(subscriberId: string): Promise<Result> {
  return act(async actor => { await subscribers.removeSubscriber(db(), actor, subscriberId); return null; });
}

// A chat or web address subscription: the Chest forgets the address.
export async function removeHook(hookId: string): Promise<Result> {
  return act(async actor => { await hooks.removeHook(db(), actor, hookId); return null; });
}

// ---- Templates -------------------------------------------------------------

export async function saveTemplate(input: templates.TemplateInput & { title: string; body: string }): Promise<Result<{ name: string }>> {
  return act(async actor => ({ name: (await templates.saveTemplate(db(), actor, input)).name }));
}

export async function removeTemplate(templateId: string): Promise<Result<templates.Template>> {
  return act(async actor => templates.removeTemplate(db(), actor, templateId));
}

// ---- The public page's settings --------------------------------------------

export async function savePage(input: { website: string; support: string; embedSites: string }): Promise<Result> {
  return act(async actor => { await savePageSettings(db(), actor, input); return null; });
}

// ---- Heartbeats ------------------------------------------------------------

// A new secret address for a service's job, shown once.
export async function createHeartbeat(componentId: string, every: number): Promise<Result<{ url: string }>> {
  return act(async actor => {
    const { token } = await heartbeats.createHeartbeat(db(), actor, componentId, every);
    return { url: `${publicOrigin(await headers()) ?? ""}/heartbeat/${token}` };
  });
}

export async function removeHeartbeat(componentId: string): Promise<Result> {
  return act(async actor => { await heartbeats.removeHeartbeat(db(), actor, componentId); return null; });
}
