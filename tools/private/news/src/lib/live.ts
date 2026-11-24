import { ChestError } from "@argentic/chest-sdk/errors";
import * as realtime from "@argentic/chest-sdk/realtime";
import { log } from "@argentic/chest-app";

// What News tells the members' open pages through the Chest's realtime
// (SDK 0.7.0, chest.json's "realtime"). Most changes are rows the Chest's
// feeds carry by themselves, each with its id alone — a post (posts, on
// "news"), its comments and reactions (on "post:<id>"); the page reads the
// rest from News, which checks who may see it. What is not fed is
// published once it is written, without payload:
// - "post.answered" on "post:<id>": someone answered an event (seats and
//   the waiting list change; rsvps rows carry a member id, never fed);
// - "post.confirmed" on "mine:<author>": a reader confirmed an Important
//   post — only its author's page reads the readers again (a company-wide
//   post's confirmations would otherwise make every open page read).
// Delivery is a courtesy: when the Chest cannot take it, what was written
// stays, and the page shows it at its next read.
export const postChannel = (postId: string) => `post:${postId}`;
export const mineChannel = (memberId: string) => `mine:${memberId}`;

async function publish(channel: string, event: string): Promise<void> {
  try {
    await realtime.publish(channel, event);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    log.warn("live: not published", { note: error.code });
  }
}

export const answered = (postId: string) => publish(postChannel(postId), "post.answered");
export async function confirmed(post: { author: string }): Promise<void> {
  if (post.author.startsWith("mbr_")) await publish(mineChannel(post.author), "post.confirmed");
}

// watching: of these members, those who have this post's page on screen
// now (realtime.online's watching) — they see a comment arrive and are
// not told of it again. Nobody when the Chest cannot say (a notification
// too many rather than one missing).
export async function watching(memberIds: readonly string[], postId: string): Promise<Set<string>> {
  const ids = [...new Set(memberIds.filter(id => id.startsWith("mbr_")))];
  if (ids.length === 0) return new Set();
  try {
    return new Set((await realtime.online(ids, { channel: postChannel(postId) })).watching);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return new Set();
  }
}
