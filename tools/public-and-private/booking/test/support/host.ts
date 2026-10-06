import type { Member } from "@argentic/chest-sdk/member";
import * as b from "../../src/lib/booking.ts";
import type { Query } from "../../src/lib/db.ts";

// A host whose page is public: made as the first visit makes it, then their
// hours confirmed (a new host is not public until then — test/ready.test.ts).
export async function openHost(sql: Query, actor: Member, first: { title: string; slug: string }): Promise<b.Host> {
  await b.ensureHost(sql, actor, first);
  await b.confirmHours(sql, actor);
  return (await b.hostOf(sql, actor.id))!;
}
