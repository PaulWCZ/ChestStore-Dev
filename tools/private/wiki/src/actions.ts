import { chest } from "@argentic/chest-sdk/chest";
import { ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { action, fail, type Field, type MemberContext } from "@argentic/chest-app";
import { catalogue, localeOf, moment } from "./i18n/index.ts";
import * as comments from "./lib/comments.ts";
import { db } from "./lib/db.ts";
import * as editing from "./lib/editing.ts";
import { AppError } from "./lib/errors.ts";
import { attach, folderOf, objectPattern } from "./lib/files.ts";
import * as history from "./lib/history.ts";
import { limits, memberPattern } from "./lib/model.ts";
import * as pages from "./lib/pages.ts";
import { nameOf, people, type Person } from "./lib/people.ts";
import * as pins from "./lib/pins.ts";
import * as reads from "./lib/reads.ts";
import * as reviews from "./lib/reviews.ts";
import * as spaces from "./lib/spaces.ts";
import { addExample as starter } from "./lib/starter.ts";
import * as synonyms from "./lib/synonyms.ts";
import * as tell from "./lib/tell.ts";
import * as templates from "./lib/templates.ts";
import * as watching from "./lib/watching.ts";

// Every mutation of the wiki, by name, served at POST /chest/actions/<name>
// and called from an island with call("movePage", { pageId, … }). The
// member is read from the Chest's assertion on each call (with every group
// they are in: src/app.tsx); who may do what is checked in src/lib/, from
// `member`, never from the input. The services read their input themselves
// and refuse it with their own code (an unknown page is "not_found", a
// title too long "too_long" with its maximum): the fields here only type
// what an island sends (as()), the package bounds the body. A success
// refreshes the page the island is on, unless the island says otherwise
// (call(…, { refresh: false })).
const as = <T>(): Field<T> => ({ read: value => value as T });
const page = { pageId: as<string>() };
const wordsOf = (member: Member) => catalogue(localeOf(member.language));

async function removeObjects(objects: string[]): Promise<void> {
  for (const object of objects) await files.delete(object).catch(() => false);
}

// A lock held by someone else, with their name and since when, in the
// reader's language and zone.
export type Holder = { name: string; time: string; idle: boolean; minutes: number };
async function holder(lock: editing.Lock, { member, locale }: MemberContext): Promise<Holder> {
  const person = (await people([lock.memberId])).get(lock.memberId);
  return { name: nameOf(person, localeOf(locale)), time: moment(lock.since, locale, member.timeZone), idle: lock.idle, minutes: Math.max(0, Math.round((Date.now() - lock.activeAt.getTime()) / 60000)) };
}

// A comment as the thread shows it (src/islands/Comments.tsx).
export type CommentView = { id: string; author: string; name: string; photo: string | null; body: string; at: string; when: string; edited: boolean; parentId: string | null; quote: string | null; resolved: boolean; resolvedBy: string | null };
export async function commentView(c: comments.Comment, member: Member, locale: string, who?: Map<string, Person>): Promise<CommentView> {
  const lang = localeOf(locale);
  const known = who ?? (await people([c.author, ...(c.resolvedBy ? [c.resolvedBy] : [])]));
  const person = known.get(c.author);
  return {
    id: c.id,
    author: c.author,
    name: nameOf(person, lang),
    photo: person?.photo ?? null,
    body: c.body,
    at: c.createdAt.toISOString(),
    when: moment(c.createdAt, locale, member.timeZone),
    edited: c.editedAt !== null,
    parentId: c.parentId,
    quote: c.quote,
    resolved: c.resolvedAt !== null,
    resolvedBy: c.resolvedBy ? (c.resolvedBy === member.id ? catalogue(lang).comments.you : nameOf(known.get(c.resolvedBy), lang)) : null,
  };
}

// The Chest refused or could not answer about a file: said in the
// reader's words.
function fileRefusal(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof TooLarge) fail("file_too_large");
  if (error instanceof ChestError) fail("unavailable");
  throw error;
}

export const actions = {
  // ---- Spaces.
  createSpace: action({ name: as<string>(), description: as<string | undefined>() }, async (input, { member }) => ({ id: (await spaces.createSpace(db(), member, input)).id })),

  updateSpace: action({ spaceId: as<string>(), input: as<{ name?: string; description?: string; color?: string; visibility?: string; groups?: string[]; editing?: string; editors?: string[] }>() }, async ({ spaceId, input }, { member }) => {
    await spaces.updateSpace(db(), member, spaceId, input !== null && typeof input === "object" ? input : fail("invalid"));
    return null;
  }),

  deleteSpace: action({ spaceId: as<string>() }, async ({ spaceId }, { member }) => {
    await removeObjects((await spaces.deleteSpace(db(), member, spaceId)).objects);
    return null;
  }),

  // The one-click example handbook of an empty wiki, in the editor's
  // language.
  addExample: action({}, async (_input, { member }) => starter(db(), member, wordsOf(member))),

  // ---- Pages. A new page starts blank, from a template of its space, or
  // from a built-in model in the editor's language. On an empty wiki,
  // "Write the first page" makes its space first ("new": a Handbook, in
  // the editor's language); "mine" is the member's own "My pages"
  // (src/lib/spaces.ts, mySpace), made the first time.
  createPage: action({ spaceId: as<string>(), parentId: as<string | null | undefined>(), title: as<string>(), start: as<string | undefined>() }, async (input, { member }) => {
    const words = wordsOf(member);
    const spaceId = input.spaceId === "new" ? (await spaces.createSpace(db(), member, { name: words.starter.space, description: words.starter.description })).id
      : input.spaceId === "mine" ? (await spaces.mySpace(db(), member, { name: words.mine.name, description: words.mine.description })).id
      : input.spaceId;
    return templates.createFrom(db(), member, { ...input, spaceId }, words);
  }),

  listTemplates: action({ spaceId: as<string>() }, async ({ spaceId }, { member }) => templates.spaceTemplates(db(), member, spaceId)),

  setTemplate: action({ ...page, on: as<boolean>() }, async ({ pageId, on }, { member }) => templates.setTemplate(db(), member, pageId, on)),

  movePage: action({ ...page, spaceId: as<string>(), parentId: as<string | null>(), index: as<number | null | undefined>() }, async ({ pageId, spaceId, parentId, index }, { member }) => {
    const sql = db();
    const before = await pages.page(sql, member, pageId, "write");
    await pages.movePage(sql, member, pageId, { spaceId, parentId, index: index ?? null });
    if (String(spaceId) !== before.spaceId) await tell.moved(sql, before.id, String(spaceId));
    return null;
  }),

  deletePage: action(page, async ({ pageId }, { member }) => {
    const { pages: count, ids } = await pages.deletePage(db(), member, pageId);
    await tell.forget(db(), ids);
    return { pages: count };
  }),

  restorePage: action(page, async ({ pageId }, { member }) => {
    await pages.restorePage(db(), member, pageId);
    return null;
  }),

  purgePage: action(page, async ({ pageId }, { member }) => {
    await removeObjects((await pages.purgePage(db(), member, pageId)).objects);
    return null;
  }),

  // ---- Editing: the lock, the draft, the save. A lock held by someone
  // else comes with their name, in the actor's language; times are written
  // here, in the actor's zone (the browser formats nothing).
  openEditor: action({ ...page, takeOver: as<boolean | undefined>() }, async ({ pageId, takeOver }, context) => {
    const opened = await editing.startEditing(db(), context.member, pageId, { takeOver: takeOver === true });
    if (opened.status === "locked") return { status: "locked" as const, holder: await holder(opened.lock, context) };
    const draft = opened.draft;
    return {
      status: "editing" as const,
      version: opened.version,
      draft: draft ? { title: draft.title, doc: JSON.stringify(draft.doc), baseVersion: draft.baseVersion, time: moment(draft.updatedAt, context.locale, context.member.timeZone) } : null,
    };
  }),

  // Every change, a few seconds after the last one (the editor's draft):
  // refreshes nothing (the editor is the only one showing it).
  saveDraft: action({ ...page, title: as<string>(), doc: as<string>(), baseVersion: as<number>() }, async ({ pageId, title, doc, baseVersion }, context) => {
    const { lock } = await editing.saveDraft(db(), context.member, pageId, { title, doc, baseVersion });
    return { holder: lock ? await holder(lock, context) : null, time: moment(new Date(), context.locale, context.member.timeZone) };
  }, { maxBody: 3 << 20 }),

  publishPage: action({ ...page, title: as<string>(), doc: as<string>(), baseVersion: as<number>() }, async ({ pageId, title, doc, baseVersion }, { member }) => {
    const done = await editing.publish(db(), member, pageId, { title, doc, baseVersion });
    if (done.changed) await tell.saved(db(), member, await pages.page(db(), member, pageId));
    return done;
  }, { maxBody: 3 << 20 }),

  // The open editor, every 30 seconds: the lock stays the member's (or
  // comes back, if it lapsed and nobody took it); someone else's comes
  // with a name.
  keepEditing: action(page, async ({ pageId }, context) => {
    const { lock } = await editing.heartbeat(db(), context.member, pageId);
    return { holder: lock ? await holder(lock, context) : null };
  }),

  // Unsaved changes dropped from the page itself; Undo puts them back.
  discardDraft: action(page, async ({ pageId }, { member }) => {
    const kept = await editing.discardDraft(db(), member, pageId);
    return kept ? { title: kept.title, doc: JSON.stringify(kept.doc), baseVersion: kept.baseVersion } : null;
  }),

  keepDraft: action({ ...page, title: as<string>(), doc: as<string>(), baseVersion: as<number>() }, async ({ pageId, title, doc, baseVersion }, { member }) => {
    await editing.keepDraft(db(), member, pageId, { title, doc, baseVersion });
    return null;
  }, { maxBody: 3 << 20 }),

  stopEditing: action({ ...page, keepDraft: as<boolean | undefined>() }, async ({ pageId, keepDraft }, { member }) => {
    await editing.stopEditing(db(), member, pageId, { keepDraft: keepDraft === true });
    return null;
  }),

  // An image or a file for a page, in two steps around the browser's own
  // upload to the Chest: requestUpload authorises one into the page's
  // folder (an editor of its space), the browser PUTs it, recordUpload
  // records it once the Chest says it holds it.
  requestUpload: action({ ...page, size: as<number>() }, async ({ pageId, size }, { member }) => {
    const p = await pages.page(db(), member, pageId, "write");
    if (typeof size === "number" && size > limits.fileSize) fail("file_too_large");
    try {
      const up = await files.uploadUrl(folderOf(p.id), { maxSize: limits.fileSize, expiresIn: 600 });
      return { url: up.url };
    } catch (error) {
      return fileRefusal(error);
    }
  }),

  recordUpload: action({ ...page, name: as<string>(), fileName: as<string>() }, async ({ pageId, name, fileName }, { member }) => {
    const p = await pages.page(db(), member, pageId, "write");
    // Only an object of this page's folder, as the Chest named it.
    if (typeof name !== "string" || !objectPattern.test(name) || !name.startsWith(folderOf(p.id))) fail("invalid");
    try {
      const held = await files.stat(name);
      if (!held) fail("file_missing");
      const saved = await attach(db(), member, p.id, { object: held.name, fileName, type: held.type, size: held.size });
      return { id: saved.id, image: saved.image, fileName: saved.fileName };
    } catch (error) {
      return fileRefusal(error);
    }
  }),

  // ---- History.
  restoreVersion: action({ ...page, number: as<number>() }, async ({ pageId, number }, { member }) => {
    const done = await history.restore(db(), member, pageId, number);
    await tell.saved(db(), member, await pages.page(db(), member, pageId));
    return done;
  }),

  // ---- Comments. Each answers what the thread shows; a new one is told to
  // the page's author, earlier commenters and watchers who may read it.
  // People named with "@" in it (picked from the list the page offers) are
  // told on their own, if they may read the page.
  addComment: action({ ...page, body: as<string>(), mentioned: as<string[] | undefined>(), parentId: as<string | null | undefined>(), quote: as<string | null | undefined>() }, async ({ pageId, body, mentioned, parentId, quote }, { member, locale }) => {
    const { comment, page: p } = await comments.addComment(db(), member, pageId, body, { parentId: parentId ?? null, quote: quote ?? null });
    const named = Array.isArray(mentioned) ? [...new Set(mentioned.filter(m => typeof m === "string" && memberPattern.test(m)))].slice(0, 20) : [];
    await tell.commented(db(), member, p, comment, named);
    return commentView(comment, member, locale);
  }),

  // Edited, deleted, brought back: what the bell shows of it follows (a
  // deleted comment's words leave everyone's bell at once).
  editComment: action({ commentId: as<string>(), body: as<string>() }, async ({ commentId, body }, { member, locale }) => {
    const c = await comments.editComment(db(), member, commentId, body);
    const found = await comments.commentOf(db(), c.id);
    if (found) await tell.commentShown(db(), c.id, await pages.page(db(), member, found.pageId));
    return commentView(c, member, locale);
  }),

  removeComment: action({ commentId: as<string>() }, async ({ commentId }, { member }) => {
    const gone = await comments.removeComment(db(), member, commentId);
    await tell.commentGone(db(), gone.id);
    return null;
  }),

  restoreComment: action({ commentId: as<string>() }, async ({ commentId }, { member }) => {
    const c = await comments.restoreComment(db(), member, commentId);
    const found = await comments.commentOf(db(), c.id);
    if (found) await tell.commentShown(db(), c.id, await pages.page(db(), member, found.pageId));
    return null;
  }),

  // A conversation resolved (folded) or opened again.
  resolveComment: action({ commentId: as<string>(), resolved: as<boolean>() }, async ({ commentId, resolved }, { member, locale }) => commentView(await comments.resolveComment(db(), member, commentId, resolved === true), member, locale)),

  // ---- Watching a page.
  setWatching: action({ ...page, on: as<boolean>() }, async ({ pageId, on }, { member }) => watching.setWatching(db(), member, pageId, on)),

  // ---- Review reminders: set (or turn off, with null), and "Still correct".
  setReview: action({ ...page, months: as<number | null>() }, async ({ pageId, months }, { member }) => {
    await reviews.setReview(db(), member, pageId, months);
    await tell.reviewSettled(String(pageId));
    return null;
  }),

  markReviewed: action(page, async ({ pageId }, { member }) => {
    await reviews.markReviewed(db(), member, pageId);
    await tell.reviewSettled(String(pageId));
    return null;
  }),

  // ---- Read and acknowledged: editors ask (everyone who reads the space,
  // or some groups); each person asked confirms; the bell item goes then.
  askRead: action({ ...page, groups: as<string[] | undefined>() }, async ({ pageId, groups }, { member }) => {
    const p = await reads.ask(db(), member, pageId, groups === undefined ? {} : { groups });
    const state = await reads.readState(db(), member, p.id);
    return { asked: state.asked ? await tell.readAsked(member, p, state.asked) : 0 };
  }),

  // "Remind those who have not confirmed": the bell again, and an email.
  remindRead: action(page, async ({ pageId }, { member }) => {
    const p = await pages.page(db(), member, pageId, "write");
    const state = await reads.readState(db(), member, p.id);
    if (!state.asked) fail("invalid");
    return { reminded: await tell.remindReaders(db(), p, state.asked!, chest.today()) };
  }),

  stopAskRead: action(page, async ({ pageId }, { member }) => {
    await reads.stopAsking(db(), member, pageId);
    await tell.readSettled(String(pageId));
    return null;
  }),

  confirmRead: action(page, async ({ pageId }, { member }) => {
    const done = await reads.confirm(db(), member, pageId);
    await tell.readSettled(String(pageId), [member.id]);
    return done;
  }),

  // ---- Words that mean the same, for search (editors).
  saveSynonyms: action({ groupId: as<string | null>(), words: as<string>() }, async ({ groupId, words }, { member }) => synonyms.saveSynonyms(db(), member, groupId, words)),

  deleteSynonyms: action({ groupId: as<string>() }, async ({ groupId }, { member }) => synonyms.deleteSynonyms(db(), member, groupId)),

  // ---- Pinning a page to the home page.
  setPinned: action({ ...page, on: as<boolean>() }, async ({ pageId, on }, { member }) => pins.setPinned(db(), member, pageId, on)),
};
