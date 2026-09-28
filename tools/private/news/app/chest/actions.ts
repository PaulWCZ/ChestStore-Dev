"use server";

import { revalidatePath } from "next/cache";
import { everyone, tally } from "../../lib/audience.ts";
import { db } from "../../lib/db.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import * as posts from "../../lib/posts.ts";
import { currentMember } from "../../lib/session.ts";
import { removeObjects } from "../../lib/storage.ts";
import * as tell from "../../lib/tell.ts";
import { chestZone } from "../../lib/zone.ts";

// The server actions of the members' part. Each is an endpoint anyone can
// call: each reads the member from the Chest's assertion again; the
// services check their rights. They answer codes, never sentences, and
// refresh the pages of /chest.

async function act<T>(step: (actor: NonNullable<Awaited<ReturnType<typeof currentMember>>>) => Promise<T>): Promise<Result<T>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return step(actor);
  });
  revalidatePath("/chest", "layout");
  return result;
}

// Publishing: a new post, or changes to one. What is due is told at once
// (an Important post to everyone, a welcome to the new colleague); a
// scheduled one waits for its time.
export async function savePost(postId: string | null, input: posts.PostInput): Promise<Result<{ id: string; published: boolean }>> {
  return act(async actor => {
    const sql = db();
    const options = { zone: chestZone() };
    const saved = postId === null ? await posts.createPost(sql, actor, input, options) : await posts.updatePost(sql, actor, postId, input, options);
    await removeObjects(saved.removed);
    // No longer Important, or for another audience: its items go from
    // every bell (the next lines tell the new audience again).
    const changed = "importantChanged" in saved ? (saved as posts.Updated) : null;
    if (changed && (changed.importantChanged || (changed.important && changed.audienceChanged))) {
      await tell.settled(saved.id);
      await tell.refreshEveryone(sql);
    }
    if (saved.published && (saved.important || saved.kind === "welcome")) await tell.announce(sql);
    return { id: saved.id, published: saved.published };
  });
}

export async function deletePost(postId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const done = await posts.deletePost(sql, actor, postId);
    if (done.important) {
      await tell.settled(postId);
      await tell.refreshEveryone(sql);
    }
    return null;
  });
}

export async function restorePost(postId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const done = await posts.restorePost(sql, actor, postId);
    if (done.important) await tell.refreshEveryone(sql);
    return null;
  });
}

export async function pinPost(postId: string, pinned: boolean): Promise<Result<null>> {
  return act(async actor => { await posts.setPinned(db(), actor, postId, pinned); return null; });
}

// Taking part: reactions, comments, "I have read it", coming or not.
export async function react(postId: string, emoji: string, on: boolean): Promise<Result<null>> {
  return act(async actor => { await posts.react(db(), actor, postId, emoji, on); return null; });
}

export async function addComment(postId: string, body: string): Promise<Result<posts.Comment>> {
  return act(async actor => {
    const done = await posts.addComment(db(), actor, postId, body);
    await tell.commented(actor, done.post, done.comment.body);
    return done.comment;
  });
}

export async function editComment(commentId: string, body: string): Promise<Result<null>> {
  return act(async actor => { await posts.editComment(db(), actor, commentId, body); return null; });
}

export async function removeComment(commentId: string): Promise<Result<null>> {
  return act(async actor => { await posts.removeComment(db(), actor, commentId); return null; });
}

export async function restoreComment(commentId: string): Promise<Result<null>> {
  return act(async actor => { await posts.restoreComment(db(), actor, commentId); return null; });
}

export async function confirmRead(postId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const done = await posts.confirm(sql, actor, postId);
    await tell.confirmed(sql, actor, done.id);
    return null;
  });
}

export async function answerEvent(postId: string, answer: "yes" | "no" | null): Promise<Result<null>> {
  return act(async actor => { await posts.answer(db(), actor, postId, answer, { zone: chestZone() }); return null; });
}

// A reminder to those who have not confirmed an Important post (once a day).
export async function remind(postId: string): Promise<Result<{ count: number }>> {
  return act(async actor => {
    const sql = db();
    const post = await posts.claimReminder(sql, actor, postId);
    const { confirmed } = await posts.confirmations(sql, actor, postId);
    const { pending } = tally(post, confirmed, (await everyone()).people);
    await tell.remind(post, pending);
    return { count: pending.length };
  });
}
