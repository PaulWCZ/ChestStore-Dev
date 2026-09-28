"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db.ts";
import * as editing from "../../lib/editing.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import * as history from "../../lib/history.ts";
import { catalogue, isLocale } from "../../lib/i18n/index.ts";
import * as pages from "../../lib/pages.ts";
import { nameOf, people } from "../../lib/people.ts";
import { currentMember } from "../../lib/session.ts";
import * as spaces from "../../lib/spaces.ts";
import { addExample as starter } from "../../lib/starter.ts";

// The server actions of the members' part. Each is an endpoint anyone can
// call: each reads the member from the Chest's assertion again; the
// services check their rights. They answer codes, never sentences, and
// refresh the pages of /chest (the sidebar shows every title).

type Actor = NonNullable<Awaited<ReturnType<typeof currentMember>>>;

async function act<T>(step: (actor: Actor) => Promise<T>, options: { refresh?: boolean } = {}): Promise<Result<T>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return step(actor);
  });
  if (options.refresh !== false) revalidatePath("/chest", "layout");
  return result;
}

async function removeObjects(objects: string[]): Promise<void> {
  if (objects.length === 0) return;
  const files = await import("@argentic/chest-sdk/files");
  for (const object of objects) await files.delete(object).catch(() => false);
}

// Spaces.
export async function createSpace(input: { name: string; description?: string }): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await spaces.createSpace(db(), actor, input)).id }));
}

export async function updateSpace(spaceId: string, input: { name?: string; description?: string; color?: string; visibility?: string; groups?: string[] }): Promise<Result<null>> {
  return act(async actor => { await spaces.updateSpace(db(), actor, spaceId, input); return null; });
}

export async function moveSpace(spaceId: string, beforeId: string | null): Promise<Result<null>> {
  return act(async actor => { await spaces.moveSpace(db(), actor, spaceId, beforeId); return null; });
}

export async function deleteSpace(spaceId: string): Promise<Result<null>> {
  return act(async actor => { await removeObjects((await spaces.deleteSpace(db(), actor, spaceId)).objects); return null; });
}

export async function addExample(): Promise<Result<{ spaceId: string; pageId: string }>> {
  return act(actor => starter(db(), actor, catalogue(isLocale(actor.locale) ? actor.locale : "en")));
}

// Pages.
export async function createPage(input: { spaceId: string; parentId?: string | null; title: string }): Promise<Result<{ id: string }>> {
  return act(actor => pages.createPage(db(), actor, input));
}

export async function movePage(pageId: string, input: { spaceId: string; parentId: string | null; index?: number | null }): Promise<Result<null>> {
  return act(async actor => { await pages.movePage(db(), actor, pageId, input); return null; });
}

export async function deletePage(pageId: string): Promise<Result<{ pages: number }>> {
  return act(actor => pages.deletePage(db(), actor, pageId));
}

export async function restorePage(pageId: string): Promise<Result<null>> {
  return act(async actor => { await pages.restorePage(db(), actor, pageId); return null; });
}

export async function purgePage(pageId: string): Promise<Result<null>> {
  return act(async actor => { await removeObjects((await pages.purgePage(db(), actor, pageId)).objects); return null; });
}

// Editing: the lock, the draft, the save. Drafts refresh nothing (the
// editor is the only one showing them). A lock held by someone else comes
// with their name, in the actor's language.
export type Holder = { name: string; since: string; idle: boolean; minutes: number };

async function holder(lock: editing.Lock, actor: Actor): Promise<Holder> {
  const locale = isLocale(actor.locale) ? actor.locale : "en";
  const person = (await people([lock.memberId])).get(lock.memberId);
  return { name: nameOf(person, locale), since: lock.since.toISOString(), idle: lock.idle, minutes: Math.max(0, Math.round((Date.now() - lock.activeAt.getTime()) / 60000)) };
}

export type Opened = { status: "editing"; draft: { title: string; doc: unknown; baseVersion: number; updatedAt: string } | null; version: number } | { status: "locked"; holder: Holder };

export async function openEditor(pageId: string, takeOver = false): Promise<Result<Opened>> {
  return act(async actor => {
    const opened = await editing.startEditing(db(), actor, pageId, { takeOver });
    if (opened.status === "locked") return { status: "locked" as const, holder: await holder(opened.lock, actor) };
    return { status: "editing" as const, version: opened.version, draft: opened.draft ? { title: opened.draft.title, doc: opened.draft.doc, baseVersion: opened.draft.baseVersion, updatedAt: opened.draft.updatedAt.toISOString() } : null };
  }, { refresh: false });
}

export async function saveDraft(pageId: string, input: { title: string; doc: unknown; baseVersion: number }): Promise<Result<{ holder: Holder | null }>> {
  return act(async actor => {
    const { lock } = await editing.saveDraft(db(), actor, pageId, input);
    return { holder: lock ? await holder(lock, actor) : null };
  }, { refresh: false });
}

export async function publishPage(pageId: string, input: { title: string; doc: unknown; baseVersion: number }): Promise<Result<{ version: number; changed: boolean; replaced: string | null }>> {
  return act(actor => editing.publish(db(), actor, pageId, input));
}

export async function stopEditing(pageId: string, keepDraft = false): Promise<Result<null>> {
  return act(async actor => { await editing.stopEditing(db(), actor, pageId, { keepDraft }); return null; }, { refresh: false });
}

// History.
export async function restoreVersion(pageId: string, number: number): Promise<Result<{ version: number }>> {
  return act(actor => history.restore(db(), actor, pageId, number));
}
