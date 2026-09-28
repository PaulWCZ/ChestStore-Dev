import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";
import { limits } from "./model.ts";
import { listSpaces } from "./spaces.ts";

// Search over titles and words, in any language, accents and case aside
// ("conges" finds "Congés"), each word by its beginning ("vac" finds
// "vacation"); a title with a typo is still found (trigrams). Results come
// with the passage that matched, the matched words marked.

export type Segment = { text: string; hit: boolean };
export type Hit = { id: string; title: Segment[]; snippet: Segment[]; spaceId: string; spaceName: string; updatedAt: Date; updatedBy: string };

const start = "\u0001";
const stop = "\u0002";

// segments splits a text marked by ts_headline into plain and matched parts.
export function segments(marked: string): Segment[] {
  const out: Segment[] = [];
  for (const [k, part] of marked.split(start).entries()) {
    if (k === 0) {
      if (part) out.push({ text: part, hit: false });
      continue;
    }
    const [hit = "", rest = ""] = part.split(stop);
    if (hit) out.push({ text: hit, hit: true });
    if (rest) out.push({ text: rest, hit: false });
  }
  return out;
}

// The words of a query as a prefix search: letters and digits only, so
// nothing a person types can change the query's meaning.
export function terms(q: string): string[] {
  return [...new Set(q.normalize("NFC").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 0))].slice(0, 8);
}

export async function search(sql: Query, actor: Member | null, query: unknown): Promise<Hit[]> {
  const q = typeof query === "string" ? query.slice(0, limits.query).trim() : "";
  const words = terms(q);
  if (words.length === 0) return [];
  const spaces = await listSpaces(sql, actor);
  if (spaces.length === 0) return [];
  const names = new Map(spaces.map(s => [s.id, s.name]));
  const tsquery = words.map(w => `${w}:*`).join(" & ");
  const options = `StartSel=${start}, StopSel=${stop}, MaxWords=26, MinWords=12, MaxFragments=2, FragmentDelimiter=" … "`;
  const found = await sql<{ id: string; space_id: string; title: string; snippet: string; updated_at: Date; updated_by: string }[]>`
    with q as (select to_tsquery('wiki', ${tsquery}) as query, unaccent(lower(${q})) as plain)
    select p.id, p.space_id, p.updated_at, p.updated_by,
      ts_headline('wiki', p.title, q.query, ${`StartSel=${start}, StopSel=${stop}, HighlightAll=true`}) as title,
      ts_headline('wiki', left(p.body, 60000), q.query, ${options}) as snippet
    from pages p, q
    where p.deleted_at is null and p.space_id in ${sql(spaces.map(s => s.id))}
      and (p.search @@ q.query or similarity(unaccent(lower(p.title)), q.plain) > 0.35)
    order by ts_rank(p.search, q.query) + similarity(unaccent(lower(p.title)), q.plain) desc, p.updated_at desc
    limit 30`;
  return found.map(r => ({
    id: String(r.id),
    spaceId: String(r.space_id),
    spaceName: names.get(String(r.space_id)) ?? "",
    title: segments(r.title),
    // Without a match in the words (a title found by its likeness), the
    // page's first words.
    snippet: segments(r.snippet.replace(/\s+/gu, " ").trim()),
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  }));
}
