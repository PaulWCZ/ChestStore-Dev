import type { Member } from "@argentic/chest-sdk/member";
import type { Fragment, Query } from "./db.ts";
import { limits } from "./model.ts";
import { listSpaces } from "./spaces.ts";

// Search over titles and words, in any language, accents and case aside
// ("conges" finds "Congés"), each word by its beginning ("vac" finds
// "vacation"). "wifi", "wi-fi" and "Wi-Fi" are one word (the index keeps
// hyphenated words joined too, migrations/0003). Pages holding every word
// come first; when fewer than three do, pages holding some of them follow,
// those holding more first. A word with a typo is matched to the nearest
// word the wiki holds (trigrams), and so is a title. Results come with the
// passage that matched, the matched words marked.

export type Segment = { text: string; hit: boolean };
export type Hit = { id: string; title: Segment[]; snippet: Segment[]; spaceId: string; spaceName: string; updatedAt: Date; updatedBy: string; complete: boolean };

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

// What a person typed, as words: each is its parts, split where the
// text had a hyphen, an apostrophe or a dot ("Wi-Fi" → ["wi", "fi"]).
// Letters and digits only, so nothing a person types can change the
// query's meaning.
export function words(q: string): string[][] {
  const out: string[][] = [];
  const seen = new Set<string>();
  for (const chunk of q.normalize("NFC").toLowerCase().split(/[^\p{L}\p{N}\-‐‑'’.·]+/u)) {
    const parts = chunk.split(/[-‐‑'’.·]+/u).filter(w => w.length > 0);
    const key = parts.join("");
    if (parts.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(parts);
  }
  return out.slice(0, 8);
}

// terms: the query's words, flat (kept for callers that want the parts).
export function terms(q: string): string[] {
  return [...new Set(words(q).flat())].slice(0, 8);
}

// The query of one word, as to_tsquery reads it: its joined form by its
// beginning, or its parts one after the other ("wi-fi" → wifi:* | wi <-> fi:*).
export function wordQuery(parts: string[]): string {
  const joined = parts.join("");
  if (parts.length === 1) return `${joined}:*`;
  return `${joined}:* | (${parts.slice(0, -1).join(" <-> ")} <-> ${parts.at(-1)}:*)`;
}

type Row = { id: string; space_id: string; title: string; snippet: string; updated_at: Date; updated_by: string; matched: number };

export async function search(sql: Query, actor: Member | null, query: unknown): Promise<Hit[]> {
  const q = typeof query === "string" ? query.slice(0, limits.query).trim() : "";
  const typed = words(q);
  if (typed.length === 0) return [];
  const spaces = await listSpaces(sql, actor);
  if (spaces.length === 0) return [];
  const names = new Map(spaces.map(s => [s.id, s.name]));
  const visible = spaces.map(s => s.id);

  // Each word as a query, widened where the wiki writes it otherwise:
  // hyphenated ("wifi" → also "wi-fi", for the marked passage), or with a
  // typo when it is found nowhere ("pasword" → also "password").
  const queries: string[] = [];
  for (const parts of typed) {
    let text = wordQuery(parts);
    const joined = parts.join("");
    const [present] = await sql<{ any: boolean }[]>`
      select exists (select 1 from pages where deleted_at is null and space_id in ${sql(visible)} and search @@ to_tsquery('wiki', ${text})) as any`;
    if (joined.length >= 3) {
      const spelled = await sql<{ word: string }[]>`
        select word from search_words where word like ${"%-%"} and replace(word, '-', '') like ${joined.replace(/[\\%_]/gu, "") + "%"} order by char_length(word) limit 3`;
      for (const s of spelled) if (/^[\p{L}\p{N}]+(-[\p{L}\p{N}]+)+$/u.test(s.word)) text += ` | (${s.word.split("-").join(" <-> ")})`;
    }
    if (!present?.any && joined.length >= 4) {
      const near = await sql<{ word: string }[]>`
        select word from search_words where word % ${joined} and similarity(word, ${joined}) >= 0.4
        order by similarity(word, ${joined}) desc, abs(char_length(word) - ${joined.length}), word limit 3`;
      for (const n of near) if (/^[\p{L}\p{N}]+$/u.test(n.word)) text += ` | ${n.word}`;
    }
    queries.push(text);
  }
  const any = queries.map(x => `(${x})`).join(" | ");
  const matched = queries.reduce<Fragment>((sum, x) => sql`${sum} + (p.search @@ to_tsquery('wiki', ${x}))::int`, sql`0`);
  const options = `StartSel=${start}, StopSel=${stop}, MaxWords=26, MinWords=12, MaxFragments=2, FragmentDelimiter=" … "`;
  const found = await sql<Row[]>`
    with q as (select to_tsquery('wiki', ${any}) as query, unaccent(lower(${q})) as plain),
    hits as (
      select p.id, p.space_id, p.title, p.body, p.search, p.updated_at, p.updated_by, (${matched}) as matched,
        similarity(unaccent(lower(p.title)), q.plain) as alike
      from pages p, q
      where p.deleted_at is null and p.space_id in ${sql(visible)}
        and (p.search @@ q.query or similarity(unaccent(lower(p.title)), q.plain) > 0.35)
    ),
    ranked as (
      select h.*, ts_rank(h.search, q.query) + h.alike as rank from hits h, q
      order by h.matched desc, rank desc, h.updated_at desc limit 30
    )
    select r.id, r.space_id, r.updated_at, r.updated_by, r.matched,
      ts_headline('wiki', r.title, q.query, ${`StartSel=${start}, StopSel=${stop}, HighlightAll=true`}) as title,
      ts_headline('wiki', left(r.body, 60000), q.query, ${options}) as snippet
    from ranked r, q order by r.matched desc, r.rank desc, r.updated_at desc`;
  // Pages holding every word; when fewer than three, the others follow.
  const complete = found.filter(r => r.matched >= queries.length);
  const kept = complete.length >= 3 ? complete : found;
  return kept.map(r => ({
    id: String(r.id),
    spaceId: String(r.space_id),
    spaceName: names.get(String(r.space_id)) ?? "",
    title: segments(r.title),
    // Without a match in the words (a title found by its likeness), the
    // page's first words.
    snippet: segments(r.snippet.replace(/\s+/gu, " ").trim()),
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
    complete: r.matched >= queries.length,
  }));
}
