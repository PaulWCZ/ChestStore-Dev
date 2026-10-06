import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";
import { groupsOf } from "./groups.ts";
import { clockAt } from "./tell.ts";

// A page's version (page(render, { version })): what it shows, in a few
// characters. Any write to Goals' tables moves the counter
// (migrations/0005_changes.sql); the reader's groups say which
// confidential objectives they see; the day and a ten-minute step move
// "this week", "3 days ago" and a quiet key result along. The package keys
// it by reader, language and address: a refresh with nothing new is a 304.
export async function stamp(sql: Query, reader: Member, now: Date = new Date()): Promise<string> {
  const [[row], groups] = await Promise.all([sql<{ n: string }[]>`select last_value::text as n from goals_changes`, groupsOf(reader)]);
  return [row?.n ?? "0", clockAt(now).today, Math.floor(now.getTime() / 600_000), reader.role ?? "", [...groups].sort().join(",")].join(":");
}
