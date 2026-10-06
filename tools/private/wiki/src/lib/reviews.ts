import type { Member } from "@argentic/chest-sdk/member";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { isReviewMonths } from "./model.ts";
import { page } from "./pages.ts";
import { listSpaces } from "./spaces.ts";

// Review reminders: a page an editor asks to check every 3, 6 or 12 months.
// That editor becomes its owner. When the time comes, the owner is told
// once in the Chest's bell (the "reviews" schedule, lib/tell.ts), and the
// page asks its editors "Still correct?"; one click answers it, and the
// next reminder is months away. Saving the page does not count: a typo
// fixed is not a page checked. Optional and quiet: nothing shows until a
// page is due.

// setReview sets how often a page is checked (null: never). Whoever sets it
// owns it; the months already counted since the last check stay counted.
// It answers the owner before, to withdraw what they were told.
export async function setReview(sql: Sql, actor: Member | null, pageId: unknown, months: unknown): Promise<{ previousOwner: string | null }> {
  const p = await page(sql, actor, pageId, "write");
  const previousOwner = p.review?.owner ?? null;
  if (months === null) {
    await sql`update pages set review_months = null, review_owner = null, reviewed_at = null, review_told = false where id = ${p.id}`;
    return { previousOwner };
  }
  if (!isReviewMonths(months)) throw new AppError("invalid");
  await sql`
    update pages set review_months = ${months}, review_owner = ${actor!.id}, reviewed_at = coalesce(reviewed_at, now()),
      review_told = review_told and coalesce(review_owner = ${actor!.id} and review_months = ${months}, false)
    where id = ${p.id}`;
  return { previousOwner };
}

// markReviewed: "Still correct", by any editor of the page.
export async function markReviewed(sql: Sql, actor: Member | null, pageId: unknown): Promise<void> {
  const p = await page(sql, actor, pageId, "write");
  if (!p.review) throw new AppError("invalid");
  await sql`update pages set reviewed_at = now(), review_told = false where id = ${p.id}`;
}

// The pages the actor owns that are due, in the spaces they may write in
// (the home page lists them).
export async function myReviews(sql: Query, actor: Member | null): Promise<{ id: string; title: string; since: Date }[]> {
  if (!actor) return [];
  const spaces = (await listSpaces(sql, actor)).filter(s => s.access === "write").map(s => s.id);
  if (spaces.length === 0) return [];
  const found = await sql<{ id: string; title: string; since: Date }[]>`
    select id, title, reviewed_at + make_interval(months => review_months) as since from pages
    where review_owner = ${actor.id} and review_months is not null and deleted_at is null and space_id in ${sql(spaces)}
      and reviewed_at + make_interval(months => review_months) <= now()
    order by since, id limit 20`;
  return found.map(r => ({ id: String(r.id), title: r.title, since: r.since }));
}

// The pages due whose owner was not told yet (the schedule's work).
export type Due = { id: string; title: string; spaceId: string; owner: string | null; lastEditor: string };

export async function dueUntold(sql: Query): Promise<Due[]> {
  const found = await sql<{ id: string; title: string; space_id: string; review_owner: string | null; updated_by: string }[]>`
    select id, title, space_id, review_owner, updated_by from pages
    where review_months is not null and not review_told and deleted_at is null
      and reviewed_at + make_interval(months => review_months) <= now()
    order by reviewed_at, id limit 500`;
  return found.map(r => ({ id: String(r.id), title: r.title, spaceId: String(r.space_id), owner: r.review_owner, lastEditor: r.updated_by }));
}

export async function markTold(sql: Query, pageId: string): Promise<void> {
  await sql`update pages set review_told = true where id = ${pageId}`;
}
