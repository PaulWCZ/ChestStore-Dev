import type { Query } from "./db.ts";

// Who may join "board:<id>" (chest.json: the channel's "join"; migration
// 0009) is the Chest's to check, at every join, in the table board_live: a
// private board is never heard of — when its cards change — by a member
// who may not see it. admit writes the rows once Tasks has checked the
// member sees these boards (boards.board, boards.listBoards), and answers
// each board's mark: a board let in again after its row went (below) gets
// a new one, and the page's live island joins its channel again
// (islands/Live.tsx).
export async function admit(sql: Query, boardIds: readonly string[], memberId: string): Promise<Map<string, string>> {
  const ids = [...new Set(boardIds)];
  if (ids.length === 0) return new Map();
  await sql`insert into board_live ${sql(ids.map(id => ({ board_id: id, member_id: memberId })))} on conflict do nothing`;
  const rows = await sql<{ board_id: string; since: Date }[]>`select board_id, since from board_live where member_id = ${memberId} and board_id in ${sql(ids)}`;
  return new Map(rows.map(r => [String(r.board_id), String(r.since.getTime())]));
}

// forget takes the rows out wherever who sees a board may have changed:
// the Chest then takes those members out of the channels at once (their
// pages read themselves again, and are let in again if still allowed).
export async function forget(sql: Query, which: { board: string } | { member: string }): Promise<void> {
  if ("board" in which) await sql`delete from board_live where board_id = ${which.board}`;
  else await sql`delete from board_live where member_id = ${which.member}`;
}
