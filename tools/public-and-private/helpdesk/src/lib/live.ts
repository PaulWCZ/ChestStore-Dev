import { ChestError } from "@argentic/chest-sdk/errors";
import * as realtime from "@argentic/chest-sdk/realtime";
import type { Query } from "./db.ts";

// Live pages (SDK 0.7.0's realtime, chest.json's "realtime"): the Chest
// holds every open page's connection, so the tool sleeps while they stay
// open and wakes only when someone writes.
//
// - "desk" (the roles that read tickets): the inbox, a ticket, the
//   reports. The feeds of tickets, messages, tags and incidents tell every
//   write of those tables, with their ids only — the page reads the rest
//   from the server, which checks who reads (src/islands/Live.tsx).
// - "mine:<member>" (that member alone): My requests. A table feeds one
//   channel only, and tickets feed "desk", so what the team does to a
//   colleague's request (an answer, a new status) is told here by the tool.
//
// A courtesy: the action is done whatever the Chest answers.
export const requestChanged = "request.changed";

export async function tellRequesters(sql: Query, ticketIds: readonly string[]): Promise<void> {
  if (ticketIds.length === 0) return;
  const rows = await sql<{ requester: string }[]>`
    select distinct requester from tickets where id in ${sql(ticketIds as string[])} and requester like 'mbr\_%'`;
  for (const { requester } of rows) {
    try {
      await realtime.publish(`mine:${requester}`, requestChanged);
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
  }
}
