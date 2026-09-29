import { createHmac, randomBytes } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { inAudience, type Audience } from "./access.ts";
import type { Query, Sql } from "./db.ts";

// Views of a post, as an anonymous count (README, "Works council").
//
// A publisher asks "how many saw it?", not "who?". News answers with the
// number of different people of a post's audience who opened it, shown
// from 5 only (below that it says "fewer than 5": nobody can be told
// apart), counted as of the last full hour (it cannot be watched rise
// while one person opens it). It never shows who, to anyone.
//
// To count each person once without keeping who, a view is stored as a
// fingerprint: a keyed hash of the member id under a random key of that
// post alone. Thirty days after publication the count is kept and the key
// and fingerprints are deleted (freezeViews): from then on nothing links a
// person to a post. An erasure deletes the person's fingerprints at once.

export const floor = 5;
export const liveDays = 30;

const fingerprint = (key: string, memberId: string): string =>
  createHmac("sha256", Buffer.from(key, "hex")).update(memberId).digest("hex").slice(0, 32);

type Viewed = Audience & { id: string; author: string; publishAt: string; scheduled: boolean; sending: boolean };

// recordView counts the actor once for this post: only a person it is for
// (not its author), once it is out, within its first 30 days.
export async function recordView(sql: Sql, actor: Member, post: Viewed, now = new Date()): Promise<boolean> {
  if (post.scheduled || post.sending || post.author === actor.id || !inAudience(actor, post)) return false;
  const published = new Date(post.publishAt).getTime();
  if (published > now.getTime() || now.getTime() - published > liveDays * 864e5) return false;
  const [row] = await sql<{ view_key: string | null }[]>`
    update posts set view_key = coalesce(view_key, ${randomBytes(32).toString("hex")})
    where id = ${post.id} and views_kept is null returning view_key`;
  if (!row?.view_key) return false;
  const hour = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  await sql`insert into post_views (post_id, fingerprint, hour) values (${post.id}, ${fingerprint(row.view_key, actor.id)}, ${hour}) on conflict do nothing`;
  return true;
}

// views is what a publisher may read: the count as of the last full hour
// (or the count kept after 30 days); null below the floor.
export async function views(sql: Query, postId: string, now = new Date()): Promise<{ count: number | null }> {
  const [row] = await sql<{ kept: number | null; live: number }[]>`
    select p.views_kept as kept,
      (select count(*)::int from post_views v where v.post_id = p.id and v.hour < ${new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000)}) as live
    from posts p where p.id = ${postId}`;
  if (!row) return { count: null };
  return { count: shown(row.kept ?? row.live) };
}

// shown: a count below the floor is never shown.
export const shown = (count: number): number | null => (count >= floor ? count : null);

// freezeViews keeps the count of posts published 30 days ago and deletes
// their key and fingerprints (run by the purge).
export async function freezeViews(sql: Sql, now = new Date()): Promise<void> {
  const before = new Date(now.getTime() - liveDays * 864e5);
  await sql.begin(async tx => {
    const due = await tx<{ id: string }[]>`
      update posts p set views_kept = (select count(*)::int from post_views v where v.post_id = p.id), view_key = null
      where p.views_kept is null and p.publish_at < ${before} returning p.id`;
    if (due.length > 0) await tx`delete from post_views where post_id in ${tx(due.map(d => d.id))}`;
  });
}

// forgetViewer deletes an erased person's fingerprints (their views stop
// counting).
export async function forgetViewer(tx: Query, memberId: string): Promise<void> {
  const keyed = await tx<{ id: string; view_key: string }[]>`select id, view_key from posts where view_key is not null`;
  for (const p of keyed) await tx`delete from post_views where post_id = ${p.id} and fingerprint = ${fingerprint(p.view_key, memberId)}`;
}
