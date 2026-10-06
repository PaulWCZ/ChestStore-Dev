import { localeOf, type Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import type { Sql } from "./db.ts";
import { AppError } from "../core/tool.ts";
import { fold, hasHit, highlight, snippet, terms, type Segment } from "./highlight.ts";
import { plain } from "../shared/markdown.ts";
import { limits, mentionToken, pick, withNames, type Kind, type Version } from "../shared/model.ts";
import { mentionOf, people, type Person } from "./people.ts";
import { seen } from "./posts.ts";

// Search across the posts and the comments the actor may see (the same
// rule as the front page: published — scheduled too for publishers —, not
// deleted, for them). Words are found in any language, case and accents
// aside, each by its beginning or by its stem in English and French
// ("move" finds "moving", "déménager" finds "déménagement"); a headline
// with a typo is still found (trigrams). A post is found by any of its
// languages and always shown in the reader's, as on the front page (when
// the words are only in another language, the result says which:
// foundIn). A post appears once, with the passage of its text and the
// comments that matched, the words found marked. A comment's mentions
// (stored @[mbr_…]) read "@Name" in the reader's language, names from the
// Chest ("@former member" for someone it no longer knows), before the
// passage is cut and marked: no member id ever reaches the page.
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
  // The words are in this other language of the post, not the reader's.
  foundIn: string | null;
};

type PostRow = { id: string; kind: Kind; title: string; body: string; locale: string; versions: Version[]; author: string; publish_at: Date; rank: number };
type CommentRow = { id: string; post_id: string; author: string; body: string; created_at: Date; kind: Kind; title: string; post_body: string; locale: string; versions: Version[]; post_author: string; publish_at: Date; rank: number };

export async function search(sql: Sql, actor: Member | null, query: unknown, now = new Date()): Promise<Hit[]> {
  if (!actor || !can(actor, "read")) throw new AppError("forbidden");
  const words = terms(query);
  if (words.length === 0) return [];
  const tsquery = words.map(w => `${w}:*`).join(" & ");
  const whole = words.join(" ");
  const posts = await sql<PostRow[]>`
    with q as (select to_tsquery('news', ${tsquery}) as query, plainto_tsquery('news_en', ${whole}) as en, plainto_tsquery('news_fr', ${whole}) as fr, unaccent(lower(${whole})) as plain)
    select p.id, p.kind, p.title, p.body, p.locale, p.author, p.publish_at,
      coalesce((select json_agg(json_build_object('locale', v.locale, 'title', v.title, 'body', v.body)) from post_versions v where v.post_id = p.id), '[]'::json) as versions,
      (ts_rank(p.search, q.query) + ts_rank(p.stems, q.en || q.fr) / 2 + similarity(unaccent(lower(p.title)), q.plain)
        + coalesce((select max(ts_rank(v.search, q.query)) from post_versions v where v.post_id = p.id), 0))::float8 as rank
    from posts p, q
    where ${seen(sql, actor)} and (p.search @@ q.query or p.stems @@ q.en or p.stems @@ q.fr or similarity(unaccent(lower(p.title)), q.plain) > 0.35
      or exists (select 1 from post_versions v where v.post_id = p.id and (v.search @@ q.query or v.stems @@ q.en or v.stems @@ q.fr or similarity(unaccent(lower(v.title)), q.plain) > 0.35)))
    order by rank desc, p.publish_at desc, p.id desc
    limit ${limits.results}`;
  const comments = await sql<CommentRow[]>`
    with q as (select to_tsquery('news', ${tsquery}) as query, plainto_tsquery('news_en', ${whole}) as en, plainto_tsquery('news_fr', ${whole}) as fr)
    select c.id, c.post_id, c.author, c.body, c.created_at, p.kind, p.title, p.body as post_body, p.locale, p.author as post_author, p.publish_at,
      coalesce((select json_agg(json_build_object('locale', v.locale, 'title', v.title, 'body', v.body)) from post_versions v where v.post_id = p.id), '[]'::json) as versions,
      (ts_rank(c.search, q.query) / 2)::float8 as rank
    from comments c join posts p on p.id = c.post_id, q
    where c.deleted_at is null and ${seen(sql, actor)} and (c.search @@ q.query or c.stems @@ q.en or c.stems @@ q.fr)
    order by rank desc, c.created_at desc
    limit ${limits.results}`;

  // The words to mark: as typed, by their beginning, and their stems
  // ("déménager" marks "déménageons" by "demenag").
  const [stemmed] = await sql<{ stems: string[] }[]>`select tsvector_to_array(to_tsvector('news_en', ${whole}) || to_tsvector('news_fr', ${whole})) as stems`;
  const marks = [...new Set([...words, ...(stemmed?.stems ?? []).map(fold).filter(w => w.length >= 4)])];
  const found = new Map<string, Hit & { rank: number }>();
  for (const p of posts) {
    // The reader's version, as everywhere; when the words are only in
    // another language of the post, the result says which.
    const shown = pick(p, localeOf(actor.language));
    const all = [{ locale: p.locale, title: p.title, body: p.body }, ...p.versions].filter(v => v.locale !== shown.locale);
    const matches = (v: Version) => hasHit(highlight(v.title, marks)) || hasHit(snippet(plain(v.body), marks));
    const other = matches(shown) ? undefined : all.find(matches);
    const body = plain(shown.body);
    found.set(String(p.id), {
      id: String(p.id),
      kind: p.kind,
      title: highlight(shown.title, marks),
      // Found by a stem or in another language: the start of the text.
      text: body ? snippet(body, marks) : null,
      author: p.author,
      publishAt: p.publish_at.toISOString(),
      scheduled: p.publish_at.getTime() > now.getTime(),
      comments: [],
      foundIn: other?.locale ?? null,
      rank: p.rank,
    });
  }
  const locale = localeOf(actor.language);
  const mentioned = comments.flatMap(c => [...c.body.matchAll(mentionToken)].map(m => m[1]!));
  const who = mentioned.length > 0 ? await people(mentioned) : new Map<string, Person>();
  const readable = (body: string) => withNames(body, id => mentionOf(who.get(id), locale));
  for (const c of comments) {
    const key = String(c.post_id);
    // Found by a comment only: the post's headline in the reader's language.
    const hit = found.get(key) ?? {
      id: key, kind: c.kind, title: highlight(pick({ locale: c.locale, title: c.title, body: c.post_body, versions: c.versions }, localeOf(actor.language)).title, marks), text: null, author: c.post_author,
      publishAt: c.publish_at.toISOString(), scheduled: c.publish_at.getTime() > now.getTime(), comments: [], foundIn: null, rank: 0,
    };
    hit.rank = Math.max(hit.rank, c.rank);
    if (hit.comments.length < 3) hit.comments.push({ id: String(c.id), author: c.author, at: c.created_at.toISOString(), text: snippet(readable(c.body), marks, 160) });
    found.set(key, hit);
  }
  return [...found.values()]
    .sort((a, b) => b.rank - a.rank || b.publishAt.localeCompare(a.publishAt) || Number(b.id) - Number(a.id))
    .slice(0, limits.results)
    .map(({ rank: _rank, ...hit }) => hit);
}

// otherLanguage: when some posts the actor sees are written only in
// another language than theirs, that language — an empty search then
// suggests trying the word in it ("first aid" for "secourisme"). News has
// no translation (no network).
export async function otherLanguage(sql: Sql, actor: Member | null): Promise<string | null> {
  if (!actor || !can(actor, "read")) throw new AppError("forbidden");
  const [row] = await sql<{ locale: string }[]>`
    select p.locale from posts p
    where ${seen(sql, actor)} and p.locale <> ${localeOf(actor.language)}
      and not exists (select 1 from post_versions v where v.post_id = p.id and v.locale = ${localeOf(actor.language)})
    group by p.locale order by count(*) desc limit 1`;
  return row?.locale ?? null;
}
