import { ChestError } from "@argentic/chest-sdk/errors";
import * as realtime from "@argentic/chest-sdk/realtime";
import { log } from "@argentic/chest-app";
import type { Query } from "./db.ts";

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

// Who may join "post:<id>" is the Chest's to check, at every join, in the
// table post_live (chest.json: the channel's "join"; migration 0008): a
// post kept to some groups is never heard of — its comments, reactions,
// answers — by a member it is not for. admit writes the row once News has
// checked the member reads the post (posts.post), and answers its mark: a
// page let in again after its row went (below) gets a new one, and its
// live island joins again (islands/Live.tsx).
export async function admit(sql: Query, postId: string, memberId: string): Promise<string> {
  const [row] = await sql<{ since: Date }[]>`
    with added as (insert into post_live (post_id, member_id) values (${postId}, ${memberId}) on conflict do nothing returning since)
    select since from added union all select since from post_live where post_id = ${postId} and member_id = ${memberId} limit 1`;
  return row ? String(row.since.getTime()) : "";
}

// forget takes the rows out wherever who reads a post may have changed:
// the Chest then takes those members out of the channels at once.
export async function forget(sql: Query, which: { post: string } | { member: string }): Promise<void> {
  if ("post" in which) await sql`delete from post_live where post_id = ${which.post}`;
  else await sql`delete from post_live where member_id = ${which.member}`;
}

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
