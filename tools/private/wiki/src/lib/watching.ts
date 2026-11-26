import type { Member } from "@argentic/chest-sdk/member";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { limits } from "./model.ts";
import { page } from "./pages.ts";

// Watching a page: whoever reads it may follow it, and is then told in the
// Chest's bell when someone else saves it or comments on it (lib/tell.ts).
// One switch; nothing else to set.

export async function isWatching(sql: Query, actor: Member | null, pageId: unknown): Promise<boolean> {
  const p = await page(sql, actor, pageId);
  return (await sql`select 1 from page_watchers where page_id = ${p.id} and member_id = ${actor!.id}`).length > 0;
}

// setWatching turns watching on or off; it answers the new state.
export async function setWatching(sql: Sql, actor: Member | null, pageId: unknown, on: unknown): Promise<boolean> {
  if (typeof on !== "boolean") throw new AppError("invalid");
  const p = await page(sql, actor, pageId);
  if (!on) {
    await sql`delete from page_watchers where page_id = ${p.id} and member_id = ${actor!.id}`;
    return false;
  }
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from page_watchers where member_id = ${actor!.id}`;
  if ((count?.n ?? 0) >= limits.watchedPerMember) throw new AppError("too_many", { max: limits.watchedPerMember });
  await sql`insert into page_watchers (page_id, member_id) values (${p.id}, ${actor!.id}) on conflict do nothing`;
  return true;
}

// The members watching a page (whether they still see it is checked when
// telling them).
export async function watchers(sql: Query, pageId: string): Promise<string[]> {
  return (await sql<{ member_id: string }[]>`select member_id from page_watchers where page_id = ${pageId} order by since`).map(r => r.member_id);
}
