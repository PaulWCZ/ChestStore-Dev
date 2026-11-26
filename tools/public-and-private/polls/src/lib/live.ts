import { ChestError } from "@argentic/chest-sdk/errors";
import * as realtime from "@argentic/chest-sdk/realtime";
import { log } from "@argentic/chest-app";
import type { Query } from "./db.ts";

// What Polls tells the members' open pages through the Chest's realtime
// (SDK 0.7.0, chest.json's "realtime"). Most changes are rows the Chest's
// feeds carry by themselves — a poll's words, status or final date
// (polls), its comments and replies — each with its id alone: the page
// reads the rest from Polls, which checks who may see it. An answer is not
// a row a feed may carry (an anonymous answer rewrites the whole poll's
// counts: its rows would tell nothing but their number), so it is
// published once, after it is written: "poll.answered", without payload,
// to the poll's page and to its organiser's home ("mine:<member>": only
// they join it). A page that missed it (gone more than two minutes) is
// told to read again (resync).
//
// Delivery is a courtesy: when the Chest cannot take it, the answer is
// written all the same and the page shows it at its next read.
export const pollChannel = (pollId: string) => `poll:${pollId}`;
export const mineChannel = (memberId: string) => `mine:${memberId}`;

// Who may join "poll:<id>" is the Chest's to check, at every join, in the
// table poll_live (chest.json: the channel's "join"; migration 0007): a
// poll put to other people is never heard of — its answers, its comments —
// by a member who may not see it. admit writes the row once Polls has
// checked the member sees the poll (polls.view), and answers its mark: a
// page let in again after its row went (below) gets a new one, and its
// live island joins again (islands/Live.tsx).
export async function admit(sql: Query, pollId: string, memberId: string): Promise<string> {
  const [row] = await sql<{ since: Date }[]>`
    with added as (insert into poll_live (poll_id, member_id) values (${pollId}, ${memberId}) on conflict do nothing returning since)
    select since from added union all select since from poll_live where poll_id = ${pollId} and member_id = ${memberId} limit 1`;
  return row ? String(row.since.getTime()) : "";
}

// forget takes the rows out wherever who sees a poll may have changed: the
// Chest then takes those members out of the channels at once.
export async function forget(sql: Query, which: { poll: string } | { member: string }): Promise<void> {
  if ("poll" in which) await sql`delete from poll_live where poll_id = ${which.poll}`;
  else await sql`delete from poll_live where member_id = ${which.member}`;
}

export async function answered(poll: { id: string; organiser: string }): Promise<void> {
  const channels = [pollChannel(poll.id), ...(poll.organiser.startsWith("mbr_") ? [mineChannel(poll.organiser)] : [])];
  for (const channel of channels) {
    try {
      await realtime.publish(channel, "poll.answered");
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      log.warn("live: not published", { note: error.code });
      return;
    }
  }
}

// watching: of these members, those who have this poll's page on screen
// now (realtime.online's watching) — they see a new comment arrive and are
// not told of it again. Nobody when the Chest cannot say: then they are
// told (a notification too many rather than one missing).
export async function watching(memberIds: readonly string[], pollId: string): Promise<Set<string>> {
  if (memberIds.length === 0) return new Set();
  try {
    return new Set((await realtime.online(memberIds, { channel: pollChannel(pollId) })).watching);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return new Set();
  }
}
