import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import type { Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { hasHit, highlight, snippet, terms, type Segment } from "./highlight.ts";
import { plain } from "./markdown.ts";
import { limits, type Kind } from "./model.ts";
import { seen } from "./posts.ts";

// Search across the posts and the comments the actor may see (the same
// rule as the front page: published — scheduled too for publishers —, not
// deleted, for them). Words are found in any language, case and accents
// aside, each by its beginning; a headline with a typo is still found
// (trigrams). A post appears once, with the passage of its text and the
// comments that matched, the words found marked.
export type CommentHit = { id: string; author: string; at: string; text: Segment[] };
export type Hit = {
  id: string;
  kind: Kind;
  title: Segment[];
  text: Segment[] | null;
  author: string;
  publishAt: string;
  scheduled: boolean;
  comments: CommentHit[];
};

type PostRow = { id: string; kind: Kind; title: string; body: string; author: string; publish_at: Date; rank: number };
type CommentRow = { id: string; post_id: string; author: string; body: string; created_at: Date; kind: Kind; title: string; post_author: string; publish_at: Date; rank: number };

export async function search(sql: Sql, actor: Member | null, query: unknown, now = new Date()): Promise<Hit[]> {
  if (!actor || !can(actor, "read")) throw new AppError("forbidden");
  const words = terms(query);
  if (words.length === 0) return [];
  const tsquery = words.map(w => `${w}:*`).join(" & ");
  const whole = words.join(" ");
  const posts = await sql<PostRow[]>`
    with q as (select to_tsquery('news', ${tsquery}) as query, unaccent(lower(${whole})) as plain)
    select p.id, p.kind, p.title, p.body, p.author, p.publish_at,
      (ts_rank(p.search, q.query) + similarity(unaccent(lower(p.title)), q.plain))::float8 as rank
    from posts p, q
    where ${seen(sql, actor)} and (p.search @@ q.query or similarity(unaccent(lower(p.title)), q.plain) > 0.35)
    order by rank desc, p.publish_at desc, p.id desc
    limit ${limits.results}`;
  const comments = await sql<CommentRow[]>`
    with q as (select to_tsquery('news', ${tsquery}) as query)
    select c.id, c.post_id, c.author, c.body, c.created_at, p.kind, p.title, p.author as post_author, p.publish_at,
      (ts_rank(c.search, q.query) / 2)::float8 as rank
    from comments c join posts p on p.id = c.post_id, q
    where c.deleted_at is null and ${seen(sql, actor)} and c.search @@ q.query
    order by rank desc, c.created_at desc
    limit ${limits.results}`;

  const found = new Map<string, Hit & { rank: number }>();
  for (const p of posts) {
    const body = plain(p.body);
    const text = snippet(body, words);
    found.set(String(p.id), {
      id: String(p.id),
      kind: p.kind,
      title: highlight(p.title, words),
      text: body && hasHit(text) ? text : null,
      author: p.author,
      publishAt: p.publish_at.toISOString(),
      scheduled: p.publish_at.getTime() > now.getTime(),
      comments: [],
      rank: p.rank,
    });
  }
  for (const c of comments) {
    const key = String(c.post_id);
    const hit = found.get(key) ?? {
      id: key, kind: c.kind, title: highlight(c.title, words), text: null, author: c.post_author,
      publishAt: c.publish_at.toISOString(), scheduled: c.publish_at.getTime() > now.getTime(), comments: [], rank: 0,
    };
    hit.rank = Math.max(hit.rank, c.rank);
    if (hit.comments.length < 3) hit.comments.push({ id: String(c.id), author: c.author, at: c.created_at.toISOString(), text: snippet(c.body, words, 160) });
    found.set(key, hit);
  }
  return [...found.values()]
    .sort((a, b) => b.rank - a.rank || b.publishAt.localeCompare(a.publishAt) || Number(b.id) - Number(a.id))
    .slice(0, limits.results)
    .map(({ rank: _rank, ...hit }) => hit);
}
