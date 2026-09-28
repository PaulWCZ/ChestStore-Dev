import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import type { Run } from "@argentic/chest-sdk/schedules";
import { spaceAccess, type SpaceAudience } from "./access.ts";
import { purgeRemoved, commenters, type Comment } from "./comments.ts";
import type { Query, Sql } from "./db.ts";
import { format } from "./i18n/index.ts";
import { cut, notify, withdraw } from "./notify.ts";
import { dueUntold, markTold } from "./reviews.ts";
import { audienceOf } from "./spaces.ts";
import { watchers } from "./watching.ts";

// What the wiki tells people through the Chest's bell, each in their own
// language. Every item is keyed by its page and its reason, so a new one
// replaces the last one instead of piling up:
//
// - comments:<page> — a new comment, to the page's author, those who
//   commented before and its watchers;
// - saved:<page> — someone else saved the page, to its watchers;
// - review:<page> — the page is due for a check, to its review owner.
//
// Nobody is ever told about a page they cannot read (checked at the moment
// of telling, against the space's access and the member's current role and
// groups), nor about their own doing.
const pagePath = (pageId: string) => `/chest/pages/${pageId}`;

// audience keeps, of these people, the members who may read (or write) in a
// space now. Without an answer from the Chest, nobody: telling is a
// courtesy, never a leak.
export async function audience(space: SpaceAudience, ids: Iterable<string>, needed: "read" | "write" = "read"): Promise<string[]> {
  const wanted = [...new Set(ids)].filter(i => i.startsWith("mbr_"));
  if (wanted.length === 0) return [];
  try {
    const found = await members.lookup(wanted);
    return found.members.filter(m => {
      const access = spaceAccess(m, space);
      return needed === "write" ? access === "write" : access !== "none";
    }).map(m => m.id);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return [];
  }
}

export async function commented(sql: Query, actor: Member, page: { id: string; title: string; createdBy: string; space: SpaceAudience }, comment: Comment): Promise<string[]> {
  const people = [page.createdBy, ...(await commenters(sql, page.id)), ...(await watchers(sql, page.id))].filter(p => p !== actor.id);
  const told = await audience(page.space, people);
  await notify(told, t => ({ title: format(t.bell.commented, { name: actor.name, title: cut(page.title, 40) }), body: comment.body }), { path: `${pagePath(page.id)}#comment-${comment.id}`, key: `comments:${page.id}` });
  return told;
}

export async function saved(sql: Query, actor: Member, page: { id: string; title: string; space: SpaceAudience }): Promise<string[]> {
  const told = await audience(page.space, (await watchers(sql, page.id)).filter(p => p !== actor.id));
  await notify(told, t => ({ title: format(t.bell.saved, { name: actor.name, title: cut(page.title, 44) }) }), { path: pagePath(page.id), key: `saved:${page.id}` });
  return told;
}

// A page checked, or its reminder changed: the item asking for it goes.
export async function reviewSettled(pageId: string): Promise<void> {
  await withdraw(`review:${pageId}`);
}

const keysOf = (pageId: string) => [`comments:${pageId}`, `saved:${pageId}`, `review:${pageId}`];

// Pages in the trash: what was said about them goes from every bell (only
// for the pages someone could have been told about).
export async function forget(sql: Query, pageIds: string[]): Promise<void> {
  if (pageIds.length === 0) return;
  const told = await sql<{ id: string }[]>`
    select id from pages p where id in ${sql(pageIds)} and (review_months is not null
      or exists (select 1 from page_watchers w where w.page_id = p.id) or exists (select 1 from page_comments c where c.page_id = p.id))
    limit 200`;
  for (const { id } of told) for (const key of keysOf(String(id))) await withdraw(key);
}

// A page (with its subpages) moved to another space: those who could be
// told about it and no longer see it lose what they were told.
export async function moved(sql: Query, pageId: string, spaceId: string): Promise<void> {
  const space = await audienceOf(sql, spaceId);
  if (!space) return;
  const rows = await sql<{ id: string; people: string[] }[]>`
    with recursive down (id) as (select ${pageId}::bigint union all select c.id from pages c join down d on c.parent_id = d.id)
    select p.id, array_remove(array[p.created_by, p.review_owner]
      || array(select member_id from page_watchers w where w.page_id = p.id)
      || array(select distinct author from page_comments c where c.page_id = p.id), null) as people
    from pages p where p.id in (select id from down) limit 500`;
  const everyone = [...new Set(rows.flatMap(r => r.people))].filter(p => p.startsWith("mbr_"));
  if (everyone.length === 0) return;
  const still = new Set(await audience(space, everyone));
  for (const r of rows) {
    const gone = [...new Set(r.people)].filter(p => p.startsWith("mbr_") && !still.has(p));
    if (gone.length > 0) for (const key of keysOf(String(r.id))) await withdraw(key, gone.slice(0, 500));
  }
}

// The "reviews" schedule, each weekday morning: every page that came due
// tells its owner, once — or, when the owner can no longer write there,
// the last person who saved it. A page nobody can be told about waits for
// the next morning. Idempotent: an item already sent is never sent again
// (review_told), and a run delivered twice replaces the same key.
export async function reviews(sql: Sql, _run?: Run): Promise<{ told: number }> {
  await purgeRemoved(sql);
  let count = 0;
  const spaces = new Map<string, SpaceAudience | null>();
  for (const due of await dueUntold(sql)) {
    if (!spaces.has(due.spaceId)) spaces.set(due.spaceId, await audienceOf(sql, due.spaceId));
    const space = spaces.get(due.spaceId);
    if (!space) continue;
    const writers = new Set(await audience(space, [due.owner, due.lastEditor].filter((p): p is string => p !== null), "write"));
    const to = due.owner && writers.has(due.owner) ? due.owner : writers.has(due.lastEditor) ? due.lastEditor : null;
    if (!to) continue;
    await notify([to], t => ({ title: format(t.bell.review, { title: cut(due.title, 50) }), body: t.bell.reviewBody }), { path: pagePath(due.id), key: `review:${due.id}` });
    await markTold(sql, due.id);
    count++;
  }
  return { told: count };
}
