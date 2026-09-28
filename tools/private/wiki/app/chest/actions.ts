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
import * as comments from "../../lib/comments.ts";
import * as reviews from "../../lib/reviews.ts";
import * as tell from "../../lib/tell.ts";
import * as templates from "../../lib/templates.ts";
import * as watching from "../../lib/watching.ts";

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

const wordsOf = (actor: Actor) => catalogue(isLocale(actor.locale) ? actor.locale : "en");

// Pages. A new page starts blank, from a template of its space, or from a
// built-in model in the editor's language.
export async function createPage(input: { spaceId: string; parentId?: string | null; title: string; start?: string }): Promise<Result<{ id: string }>> {
  return act(actor => templates.createFrom(db(), actor, input, wordsOf(actor)));
}

export async function listTemplates(spaceId: string): Promise<Result<{ id: string; title: string }[]>> {
  return act(actor => templates.spaceTemplates(db(), actor, spaceId), { refresh: false });
}

export async function setTemplate(pageId: string, on: boolean): Promise<Result<boolean>> {
  return act(actor => templates.setTemplate(db(), actor, pageId, on));
}

export async function movePage(pageId: string, input: { spaceId: string; parentId: string | null; index?: number | null }): Promise<Result<null>> {
  return act(async actor => {
    const before = await pages.page(db(), actor, pageId, "write");
    await pages.movePage(db(), actor, pageId, input);
    if (String(input.spaceId) !== before.spaceId) await tell.moved(db(), before.id, String(input.spaceId));
    return null;
  });
}

export async function deletePage(pageId: string): Promise<Result<{ pages: number }>> {
  return act(async actor => {
    const { pages: count, ids } = await pages.deletePage(db(), actor, pageId);
    await tell.forget(db(), ids);
    return { pages: count };
  });
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
  return act(async actor => {
    const done = await editing.publish(db(), actor, pageId, input);
    if (done.changed) await tell.saved(db(), actor, await pages.page(db(), actor, pageId));
    return done;
  });
}

export async function stopEditing(pageId: string, keepDraft = false): Promise<Result<null>> {
  return act(async actor => { await editing.stopEditing(db(), actor, pageId, { keepDraft }); return null; }, { refresh: false });
}

// History.
export async function restoreVersion(pageId: string, number: number): Promise<Result<{ version: number }>> {
  return act(async actor => {
    const done = await history.restore(db(), actor, pageId, number);
    await tell.saved(db(), actor, await pages.page(db(), actor, pageId));
    return done;
  });
}

// Comments. Each answers what the thread shows; a new one is told to the
// page's author, earlier commenters and watchers who may read it.
export type CommentView = { id: string; author: string; name: string; photo: string | null; body: string; at: string; when: string; edited: boolean };

async function view(c: comments.Comment, actor: Actor): Promise<CommentView> {
  const locale = isLocale(actor.locale) ? actor.locale : "en";
  const person = (await people([c.author])).get(c.author);
  return { id: c.id, author: c.author, name: nameOf(person, locale), photo: person?.photo ?? null, body: c.body, at: c.createdAt.toISOString(), when: "", edited: c.editedAt !== null };
}

export async function addComment(pageId: string, body: string): Promise<Result<CommentView>> {
  return act(async actor => {
    const { comment, page } = await comments.addComment(db(), actor, pageId, body);
    await tell.commented(db(), actor, page, comment);
    return view(comment, actor);
  }, { refresh: false });
}

export async function editComment(commentId: string, body: string): Promise<Result<CommentView>> {
  return act(async actor => view(await comments.editComment(db(), actor, commentId, body), actor), { refresh: false });
}

export async function removeComment(commentId: string): Promise<Result<null>> {
  return act(async actor => { await comments.removeComment(db(), actor, commentId); return null; }, { refresh: false });
}

export async function restoreComment(commentId: string): Promise<Result<null>> {
  return act(async actor => { await comments.restoreComment(db(), actor, commentId); return null; }, { refresh: false });
}

// Watching a page.
export async function setWatching(pageId: string, on: boolean): Promise<Result<boolean>> {
  return act(actor => watching.setWatching(db(), actor, pageId, on), { refresh: false });
}

// Review reminders: set (or turn off, with null), and "Still correct".
export async function setReview(pageId: string, months: number | null): Promise<Result<null>> {
  return act(async actor => {
    await reviews.setReview(db(), actor, pageId, months);
    await tell.reviewSettled(String(pageId));
    return null;
  });
}

export async function markReviewed(pageId: string): Promise<Result<null>> {
  return act(async actor => {
    await reviews.markReviewed(db(), actor, pageId);
    await tell.reviewSettled(String(pageId));
    return null;
  });
}
