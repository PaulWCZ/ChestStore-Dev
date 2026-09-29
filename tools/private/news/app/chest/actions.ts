"use server";

import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";
import { revalidatePath } from "next/cache";
import { syncEvent } from "../../lib/agenda.ts";
import { inAudience } from "../../lib/access.ts";
import { everyone, tally } from "../../lib/audience.ts";
import { db } from "../../lib/db.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import { setDigestEmail } from "../../lib/preferences.ts";
import * as posts from "../../lib/posts.ts";
import { currentMember } from "../../lib/session.ts";
import { removeObjects } from "../../lib/storage.ts";
import * as tell from "../../lib/tell.ts";
import { today } from "../../lib/time.ts";
import { undoImport } from "../../lib/transfer.ts";
import { chestZone } from "../../lib/zone.ts";

// The server actions of the members' part. Each is an endpoint anyone can
// call: each reads the member from the Chest's assertion again; the
// services check their rights. They answer codes, never sentences, and
// refresh the pages of /chest.

type Actor = NonNullable<Awaited<ReturnType<typeof currentMember>>>;

async function act<T>(step: (actor: Actor) => Promise<T>): Promise<Result<T>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return step(actor);
  });
  revalidatePath("/chest", "layout");
  return result;
}

// Publishing: a new post, or changes to one. What is due is told at once
// (a welcome to the new colleague, an edited Important post to its new
// audience); a new Important post goes out after its "Undo" seconds
// (release, or the next pass); a scheduled one waits for its time.
export async function savePost(postId: string | null, input: posts.PostInput): Promise<Result<{ id: string; published: boolean; undoUntil: string | null }>> {
  return act(async actor => {
    const sql = db();
    const options = { zone: chestZone() };
    const saved = postId === null ? await posts.createPost(sql, actor, input, { ...options, hold: true }) : await posts.updatePost(sql, actor, postId, input, options);
    await removeObjects(saved.removed);
    // No longer Important, or for another audience: its items go from
    // every bell (the next lines tell the new audience again).
    const changed = "importantChanged" in saved ? (saved as posts.Updated) : null;
    if (changed && (changed.importantChanged || (changed.important && changed.audienceChanged))) {
      await tell.settled(saved.id);
      await tell.refreshEveryone(sql);
    }
    if (changed?.reconfirm) await tell.refreshEveryone(sql);
    if (saved.published && saved.undoUntil === null && (saved.important || saved.kind === "welcome")) await tell.announce(sql);
    if (saved.kind === "event" || changed?.wasEvent) await syncEvent(sql, saved.id);
    return { id: saved.id, published: saved.published, undoUntil: saved.undoUntil };
  });
}

// The "Undo" seconds of a new Important post are over: it goes out now
// (the next pass would send it otherwise).
export async function release(): Promise<Result<null>> {
  return act(async () => { await tell.announce(db()); return null; });
}

// "Undo" within those seconds: nothing was sent, the post is taken back.
export async function recallPost(postId: string): Promise<Result<null>> {
  return act(async actor => { await posts.recall(db(), actor, postId); return null; });
}

export async function deletePost(postId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const done = await posts.deletePost(sql, actor, postId);
    if (done.important) {
      await tell.settled(postId);
      await tell.refreshEveryone(sql);
    }
    if (done.kind === "event") await syncEvent(sql, postId);
    return null;
  });
}

export async function restorePost(postId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const done = await posts.restorePost(sql, actor, postId);
    if (done.important) await tell.refreshEveryone(sql);
    if (done.kind === "event") await syncEvent(sql, postId);
    return null;
  });
}

export async function pinPost(postId: string, pinned: boolean): Promise<Result<null>> {
  return act(async actor => { await posts.setPinned(db(), actor, postId, pinned); return null; });
}

// Taking part: reactions, comments and replies, "I have read it", coming
// or not.
export async function react(postId: string, emoji: string, on: boolean): Promise<Result<null>> {
  return act(async actor => { await posts.react(db(), actor, postId, emoji, on); return null; });
}

export async function addComment(postId: string, body: string, parentId: string | null = null): Promise<Result<posts.Comment>> {
  return act(async actor => {
    const done = await posts.addComment(db(), actor, postId, body, parentId);
    await tell.commented(actor, done);
    return done.comment;
  });
}

export async function editComment(commentId: string, body: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const done = await posts.editComment(sql, actor, commentId, body);
    if (done.mentioned.length > 0) {
      const post = await posts.post(sql, actor, done.postId, { zone: chestZone() });
      await tell.mentionedIn(actor, post, done.mentioned, body, tell.postPath(post.id) + "#comment-" + commentId);
    }
    return null;
  });
}

export async function removeComment(commentId: string): Promise<Result<null>> {
  return act(async actor => { await posts.removeComment(db(), actor, commentId); return null; });
}

export async function restoreComment(commentId: string): Promise<Result<null>> {
  return act(async actor => { await posts.restoreComment(db(), actor, commentId); return null; });
}

// People to mention in a comment: those who see the post, by the start of
// their name (8 at most).
export async function mentionable(postId: string, query: string): Promise<Result<{ id: string; name: string }[]>> {
  return act(async actor => {
    const post = await posts.post(db(), actor, postId, { zone: chestZone() });
    const q = typeof query === "string" ? query.trim().slice(0, 60) : "";
    if (!q) return [];
    try {
      const found = await members.list({ q, limit: 20 });
      return found.members
        .filter(m => m.id !== actor.id && m.role !== null && (m.isAdmin || m.id === post.author || inAudience(m, post)))
        .slice(0, 8)
        .map(m => ({ id: m.id, name: m.name }));
    } catch (error) {
      if (error instanceof ChestError) return [];
      throw error;
    }
  });
}

export async function confirmRead(postId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const done = await posts.confirm(sql, actor, postId);
    await tell.confirmed(sql, actor, done.id);
    return null;
  });
}

// Coming or not: the calendar follows (Proposal (studio)); a seat freed
// goes to the first waiting, who is told.
export async function answerEvent(postId: string, answer: "yes" | "no" | null): Promise<Result<{ answer: "yes" | "no" | "wait" | null }>> {
  return act(async actor => {
    const sql = db();
    const done = await posts.answer(sql, actor, postId, answer, { zone: chestZone() });
    if (done.promoted) {
      const [row] = await sql<{ title: string }[]>`select title from posts where id = ${postId}`;
      await tell.promoted(done.promoted, { id: postId, title: row?.title ?? "" });
    }
    await syncEvent(sql, postId);
    return { answer: done.answer };
  });
}

// A reminder to those who have not confirmed an Important post (once a
// day), in the bell and by email.
export async function remind(postId: string): Promise<Result<{ count: number }>> {
  return act(async actor => {
    const sql = db();
    const post = await posts.claimReminder(sql, actor, postId);
    const { confirmed } = await posts.confirmations(sql, actor, postId);
    const { pending } = tally(post, confirmed, (await everyone()).people);
    await tell.remind(sql, post, pending, today(chestZone()));
    return { count: pending.length };
  });
}

// The weekly digest by email, or only in the bell.
export async function digestByEmail(on: boolean): Promise<Result<null>> {
  return act(async actor => { await setDigestEmail(db(), actor, on); return null; });
}

// An import from Slack taken back (lib/transfer.ts).
export async function undoSlackImport(batch: string): Promise<Result<{ count: number }>> {
  return act(async actor => ({ count: await undoImport(db(), actor, batch) }));
}
