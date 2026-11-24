import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import type { Query } from "./db.ts";

// Who may join a desk — "desk:<approver's id>", "desk:accountants" (chest.json:
// the channel's "join"; migration 0008) — is the Chest's to check, at
// every join, in the table desk_live: an approver hears only of the
// expenses sent to them, the accountants of every expense sent, and nobody
// of a draft (the feed is desk_events, written by a trigger for expenses
// that are or were sent). admit writes the reader's row once "To approve"
// checked their role, and answers its channel and mark: let in again after
// their row went (forget), a new mark, and the page's live island joins
// again (islands/Live.tsx).
export type Followed = { channel: string; ticket: string };

export async function admit(sql: Query, member: Member): Promise<Followed[]> {
  if (!can(member, "approve")) return [];
  const key = can(member, "approve.all") ? "accountants" : member.id;
  await sql`insert into desk_live (desk_key, member_id) values (${key}, ${member.id}) on conflict do nothing`;
  const [row] = await sql<{ since: Date }[]>`select since from desk_live where desk_key = ${key} and member_id = ${member.id}`;
  return row ? [{ channel: `desk:${key}`, ticket: String(row.since.getTime()) }] : [];
}

// forget: their role changed, they lost access, left or were erased —
// the Chest takes them out of their desk at once.
export async function forget(sql: Query, memberId: string): Promise<void> {
  await sql`delete from desk_live where member_id = ${memberId}`;
}
