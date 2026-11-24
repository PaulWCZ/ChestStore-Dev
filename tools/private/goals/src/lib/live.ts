import { log } from "@argentic/chest-app";
import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as realtime from "@argentic/chest-sdk/realtime";
import { roleOf } from "./access.ts";
import type { Query } from "./db.ts";

// What a page left open follows (SDK 0.7.0's realtime, chest.json's
// "realtime"), never a timer. Objectives, key results, check-ins and
// comments are fed, an id alone, on "objective:<live_key>" (migration
// 0009): "objective:everyone" for what every member sees, "objective:<id>"
// for a confidential objective and what belongs to it. Who may join is the
// Chest's to check, at every join, in the table objective_live: a
// confidential objective is never heard of — when it is written, checked
// in or commented on — by a member who may not see it.
//
// admit writes the rows once a page has checked what its reader sees
// (lib/read.ts, visibleTo: the confidential objectives it shows), and
// answers each channel's mark: one let in again after its row went gets a
// new one, and the page's live island joins again (islands/Live.tsx). The
// rows of an objective go in the database itself whenever who sees it may
// change (migration 0009's triggers); a member's go here (forget) when
// their groups or role change, they lose access, leave or are erased.
export type Followed = { channel: string; ticket: string };
export const feeds = ["objectives", "key_results", "check_ins", "comments", "goals.changed"];

export async function admit(sql: Query, member: Member, confidential: readonly { id: string; visibility: string }[]): Promise<Followed[]> {
  if (!roleOf(member)) return [];
  const keys = ["everyone", ...new Set(confidential.filter(o => o.visibility !== "everyone").map(o => o.id))];
  await sql`insert into objective_live ${sql(keys.map(key => ({ objective_key: key, member_id: member.id })))} on conflict do nothing`;
  const rows = await sql<{ objective_key: string; since: Date }[]>`select objective_key, since from objective_live where member_id = ${member.id} and objective_key in ${sql(keys)}`;
  const marks = new Map(rows.map(r => [r.objective_key, String(r.since.getTime())]));
  return keys.flatMap(key => (marks.has(key) ? [{ channel: `objective:${key}`, ticket: marks.get(key)! }] : []));
}

export async function forget(sql: Query, memberId: string): Promise<void> {
  await sql`delete from objective_live where member_id = ${memberId}`;
}

// An objective made confidential, or for everyone again: its rows now go
// to another channel, so both are told, without an id, to read again.
export async function moved(objectiveId: string): Promise<void> {
  for (const channel of ["objective:everyone", `objective:${objectiveId}`]) {
    try {
      await realtime.publish(channel, "goals.changed");
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      log.warn("live: not published", { note: error.code });
    }
  }
}
