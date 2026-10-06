import { changeStamp } from "@argentic/chest-app/db";
import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";
import { groupsOf } from "./groups.ts";
import { clockAt } from "./tell.ts";

// A page's version (page(render, { version })): what it shows, in a few
// characters. Any transaction that changes Goals' tables moves the
// package's change stamp (migrations/0006_chest_changes.sql: right under
// concurrent writes); the reader's groups say which
// confidential objectives they see; the day and a ten-minute step move
// "this week", "3 days ago" and a quiet key result along. The package keys
// it by reader, language and address: a refresh with nothing new is a 304.
//
// What it does not cover (a page may show it up to ten minutes late, or
// until something is written): what the Chest holds and Goals does not —
// a member's name or photo, the company's look (its sheet changes
// address, the page does not), a team's groups and members as kept a
// minute (lib/teams.ts).
export async function stamp(sql: Query, reader: Member, now: Date = new Date()): Promise<string> {
  const [n, groups] = await Promise.all([changeStamp(sql as Parameters<typeof changeStamp>[0]), groupsOf(reader)]);
  return [n, clockAt(now).today, Math.floor(now.getTime() / 600_000), reader.role ?? "", [...groups].sort().join(",")].join(":");
}
