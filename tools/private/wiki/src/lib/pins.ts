import type { Member } from "@argentic/chest-sdk/member";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { page } from "./pages.ts";
import { listSpaces } from "./spaces.ts";

// Pages pinned to the home page by their editors — the few everyone looks
// for ("Holidays", "Who to ask") — shown to whoever reads them, the latest
// pinned last. At most twelve.
export const maxPins = 12;

export async function setPinned(sql: Sql, actor: Member | null, pageId: unknown, on: unknown): Promise<boolean> {
  if (typeof on !== "boolean") throw new AppError("invalid");
  const p = await page(sql, actor, pageId, "write");
  if (!on) {
    await sql`update pages set pinned_at = null where id = ${p.id}`;
    return false;
  }
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from pages where pinned_at is not null and deleted_at is null and id <> ${p.id}`;
  if ((count?.n ?? 0) >= maxPins) throw new AppError("too_many", { max: maxPins });
  await sql`update pages set pinned_at = coalesce(pinned_at, now()) where id = ${p.id}`;
  return true;
}

export async function isPinned(sql: Query, pageId: string): Promise<boolean> {
  return (await sql`select 1 from pages where id = ${pageId} and pinned_at is not null`).length > 0;
}

export async function pinned(sql: Query, actor: Member | null): Promise<{ id: string; title: string; spaceId: string }[]> {
  const spaces = (await listSpaces(sql, actor)).map(s => s.id);
  if (spaces.length === 0) return [];
  const found = await sql<{ id: string; title: string; space_id: string }[]>`
    select id, title, space_id from pages where pinned_at is not null and deleted_at is null and space_id in ${sql(spaces)}
    order by pinned_at, id limit ${maxPins}`;
  return found.map(r => ({ id: String(r.id), title: r.title, spaceId: String(r.space_id) }));
}
