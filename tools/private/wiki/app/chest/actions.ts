"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db.ts";
import * as editing from "../../lib/editing.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import * as history from "../../lib/history.ts";
import { catalogue, isLocale } from "../../lib/i18n/index.ts";
import { memberPattern } from "../../lib/model.ts";
import * as pages from "../../lib/pages.ts";
import { nameOf, people } from "../../lib/people.ts";
import { currentMember } from "../../lib/session.ts";
import * as spaces from "../../lib/spaces.ts";
import { addExample as starter } from "../../lib/starter.ts";
import * as comments from "../../lib/comments.ts";
import * as pins from "../../lib/pins.ts";
import * as reads from "../../lib/reads.ts";
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

export async function updateSpace(spaceId: string, input: { name?: string; description?: string; color?: string; visibility?: string; groups?: string[]; editing?: string; editors?: string[] }): Promise<Result<null>> {
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
// On an empty wiki, "Write the first page" makes its space first ("new":
// a Handbook, in the editor's language).
export async function createPage(input: { spaceId: string; parentId?: string | null; title: string; start?: string }): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const words = wordsOf(actor);
    const spaceId = input.spaceId === "new" ? (await spaces.createSpace(db(), actor, { name: words.starter.space, description: words.starter.description })).id : input.spaceId;
    return templates.createFrom(db(), actor, { ...input, spaceId }, words);
  });
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

// The open editor, every 30 seconds: the lock stays the member's (or comes
// back, if it lapsed and nobody took it); someone else's comes with a name.
export async function keepEditing(pageId: string): Promise<Result<{ holder: Holder | null }>> {
  return act(async actor => {
    const { lock } = await editing.heartbeat(db(), actor, pageId);
    return { holder: lock ? await holder(lock, actor) : null };
  }, { refresh: false });
}

// Unsaved changes dropped from the page itself; Undo puts them back.
export async function discardDraft(pageId: string): Promise<Result<{ title: string; doc: string; baseVersion: number } | null>> {
  return act(async actor => {
    const kept = await editing.discardDraft(db(), actor, pageId);
    return kept ? { title: kept.title, doc: JSON.stringify(kept.doc), baseVersion: kept.baseVersion } : null;
  });
}

export async function keepDraft(pageId: string, draft: { title: string; doc: string; baseVersion: number }): Promise<Result<null>> {
  return act(async actor => { await editing.keepDraft(db(), actor, pageId, draft); return null; });
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

// People named with "@" in it (picked from the list the page offers) are
// told on their own, if they may read the page.
export async function addComment(pageId: string, body: string, mentioned: string[] = []): Promise<Result<CommentView>> {
  return act(async actor => {
    const { comment, page } = await comments.addComment(db(), actor, pageId, body);
    const named = Array.isArray(mentioned) ? [...new Set(mentioned.filter(m => typeof m === "string" && memberPattern.test(m)))].slice(0, 20) : [];
    await tell.commented(db(), actor, page, comment, named);
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

// Read and acknowledged: editors ask (everyone who reads the space, or
// some groups); each person asked confirms; the bell item goes then.
export async function askRead(pageId: string, groups?: string[]): Promise<Result<{ asked: number }>> {
  return act(async actor => {
    const p = await reads.ask(db(), actor, pageId, groups === undefined ? {} : { groups });
    const state = await reads.readState(db(), actor, p.id);
    return { asked: state.asked ? await tell.readAsked(actor, p, state.asked) : 0 };
  });
}

export async function stopAskRead(pageId: string): Promise<Result<null>> {
  return act(async actor => {
    await reads.stopAsking(db(), actor, pageId);
    await tell.readSettled(String(pageId));
    return null;
  });
}

export async function confirmRead(pageId: string): Promise<Result<{ version: number }>> {
  return act(async actor => {
    const done = await reads.confirm(db(), actor, pageId);
    await tell.readSettled(String(pageId), [actor.id]);
    return done;
  });
}

// Pinning a page to the home page.
export async function setPinned(pageId: string, on: boolean): Promise<Result<boolean>> {
  return act(actor => pins.setPinned(db(), actor, pageId, on));
}
