import type { Member } from "@argentic/chest-sdk/member";
import type { Fragment, Query } from "./db.ts";
import { limits } from "./model.ts";
import { listSpaces } from "./spaces.ts";
import { fold, phrase, synonymTerms, type Term } from "./synonyms.ts";

// The little words that never count alone, French and English (folded:
// lower case, no accents).
export const stopWords = new Set([
  "a", "au", "aux", "avec", "ce", "ces", "cette", "comment", "d", "dans", "de", "des", "du", "en", "est", "et", "il", "je", "l", "la", "le", "les", "leur", "ma", "mes", "mon", "ne", "nos", "notre", "on", "ou", "par", "pas", "pour", "qu", "que", "qui", "quoi", "sa", "se", "ses", "son", "sur", "ta", "te", "un", "une", "vos", "votre", "y",
  "an", "and", "are", "at", "be", "by", "can", "do", "for", "from", "how", "i", "if", "in", "is", "it", "its", "my", "of", "or", "our", "the", "to", "what", "when", "where", "who", "with", "your",
]);

// units cuts what was typed into the query's words: a run of words that
// is one of the synonyms' terms is one unit (all its terms, as phrases);
// the other words are units of their own, little words left out (unless
// nothing else is left).
export type Unit = { parts: string[] } | { synonyms: Term[]; typed: Term };
export function units(typed: string[][], terms: Term[][]): Unit[] {
  const tokens = typed.map(p => fold(p.join("")));
  const out: Unit[] = [];
  const plain = tokens.some(t => !stopWords.has(t));
  for (let i = 0; i < tokens.length; ) {
    let best: { length: number; group: number; term: Term } | null = null;
    for (const [group, list] of terms.entries()) {
      for (const term of list) {
        const length = term.tokens.length;
        if (length === 0 || (best && length <= best.length)) continue;
        if (term.tokens.every((w, k) => tokens[i + k] === w)) best = { length, group, term };
      }
    }
    if (best) {
      out.push({ synonyms: terms[best.group]!, typed: best.term });
      i += best.length;
      continue;
    }
    if (!plain || !stopWords.has(tokens[i]!)) out.push({ parts: typed[i]! });
    i++;
  }
  return out;
}

// Search over titles and words, in any language, accents and case aside
// ("conges" finds "Congés"), each word by its beginning ("vac" finds
// "vacation"). "wifi", "wi-fi" and "Wi-Fi" are one word (the index keeps
// hyphenated words joined too, migrations/0003), and each word is also
// found by its French and English stem ("rembourser" finds "remboursé",
// migrations/0005). Pages holding every word come first — those holding
// them as typed, then those with them in the title —; when fewer than
// three do, pages holding some of them as typed follow (kept()). A word
// with a typo is matched to the nearest word the wiki holds (trigrams),
// and so is a title, only when nothing better is found. Results come with
// the passage that matched, the matched words marked.
//
// The little words of French and English ("de", "la", "the", "of"…) do not
// count as words of the query (unless it has no other): "note de frais" is
// never matched on "de". Words that mean the same (lib/synonyms.ts, one
// list per wiki, editable by editors) are one word of the query: "note de
// frais" also finds "expenses", "tt" finds "télétravail", "vacances"
// finds "congés" and "holidays".

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
  // One word marked in parts ("Wi" "-" "Fi": the index reads a hyphenated
  // word as its parts too) is marked whole, so it reads "Wi-Fi".
  const joined: Segment[] = [];
  for (let k = 0; k < out.length; k++) {
    const s = out[k]!;
    const last = joined.at(-1);
    const next = out[k + 1];
    if (last?.hit && !s.hit && next?.hit && /^[-‐‑'’.·]{1,3}$/u.test(s.text)) {
      last.text += s.text + next.text;
      k++;
      continue;
    }
    if (last?.hit && s.hit) last.text += s.text;
    else joined.push({ ...s });
  }
  return joined;
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

type Row = { id: string; space_id: string; title: string; snippet: string; updated_at: Date; updated_by: string; matched: number; typed: number; strong: number };

// One word of the query (or one group of words that mean the same), as the
// queries that find it, from the closest to the loosest:
// - typed: as written, by its beginning, with its hyphenated spellings —
//   or, for a group, the term that was typed;
// - stem: its stems, French and English (migrations/0005: "rembourser",
//   "remboursé" and "remboursement" share "rembours");
// - related: the other terms of its group;
// - near: the nearest words the wiki holds, when it holds the word nowhere
//   (a typo).
type Want = { typed: string; stem: string | null; related: string | null; near: string | null; show: string };

// A tsquery of stems (lexemes as the index keeps them), or null.
const stemQuery = (stems: string[]): string | null => {
  const clean = [...new Set(stems)].filter(w => /^[\p{L}\p{N}]+$/u.test(w));
  return clean.length > 0 ? clean.join(" | ") : null;
};

export async function search(sql: Query, actor: Member | null, query: unknown): Promise<Hit[]> {
  const q = typeof query === "string" ? query.slice(0, limits.query).trim() : "";
  const typed = words(q);
  if (typed.length === 0) return [];
  const spaces = await listSpaces(sql, actor);
  if (spaces.length === 0) return [];
  const names = new Map(spaces.map(s => [s.id, s.name]));
  const visible = spaces.map(s => s.id);

  // A word as the wiki may write it with a hyphen ("wifi" → "wi-fi").
  const spell = async (parts: string[]): Promise<string> => {
    let text = wordQuery(parts);
    const joined = parts.join("");
    if (joined.length >= 3) {
      const spelled = await sql<{ word: string }[]>`
        select word from search_words where word like ${"%-%"} and replace(word, '-', '') like ${joined.replace(/[\\%_]/gu, "") + "%"} order by char_length(word) limit 3`;
      for (const s of spelled) if (/^[\p{L}\p{N}]+(-[\p{L}\p{N}]+)+$/u.test(s.word)) text += ` | (${s.word.split("-").join(" <-> ")})`;
    }
    return text;
  };
  // A word's stems, when it is one word of three letters or more; and the
  // same stems by their beginning, to mark them in the passage ("rembours"
  // marks "remboursement") when long enough to mean something.
  const stemsOf = async (parts: string[]): Promise<{ stem: string | null; prefixes: string[] }> => {
    const joined = parts.join("");
    if (parts.length !== 1 || joined.length < 3) return { stem: null, prefixes: [] };
    const [row] = await sql<{ stems: string[] }[]>`
      select tsvector_to_array(to_tsvector('wiki_en', ${joined}) || to_tsvector('wiki_fr', ${joined})) as stems`;
    const stems = row?.stems ?? [];
    return { stem: stemQuery(stems), prefixes: [...new Set(stems)].filter(w => w.length >= 4 && w !== joined && /^[\p{L}\p{N}]+$/u.test(w)).map(w => `${w}:*`) };
  };
  const wants: Want[] = [];
  for (const unit of units(typed, await synonymTerms(sql))) {
    if ("synonyms" in unit) {
      // Each term: one word as it may be spelled, several as a phrase.
      const term = (t: Term) => (t.words.length === 1 && t.words[0]!.length >= 3 ? spell(t.words) : Promise.resolve(phrase(t.words)));
      const own = await term(unit.typed);
      const each = await Promise.all(unit.synonyms.filter(t => t !== unit.typed).map(term));
      const related = each.filter(Boolean).join(" | ");
      const { stem, prefixes } = await stemsOf(unit.typed.words.length === 1 ? unit.typed.words : []);
      wants.push({ typed: own, stem, related: related || null, near: null, show: [own, ...prefixes, related].filter(Boolean).join(" | ") });
      continue;
    }
    const parts = unit.parts;
    const joined = parts.join("");
    const own = await spell(parts);
    const { stem, prefixes } = await stemsOf(parts);
    const [present] = await sql<{ any: boolean }[]>`
      select exists (select 1 from pages where deleted_at is null and space_id in ${sql(visible)}
        and (search @@ to_tsquery('wiki', ${own})${stem ? sql` or stems @@ to_tsquery('simple', ${stem})` : sql``})) as any`;
    let near: string | null = null;
    if (!present?.any && joined.length >= 4) {
      const found = await sql<{ word: string }[]>`
        select word from search_words where word % ${joined} and similarity(word, ${joined}) >= 0.4
        order by similarity(word, ${joined}) desc, abs(char_length(word) - ${joined.length}), word limit 3`;
      const list = found.map(n => n.word).filter(w => /^[\p{L}\p{N}]+$/u.test(w));
      if (list.length > 0) near = list.join(" | ");
    }
    wants.push({ typed: own, stem, related: null, near, show: [own, ...prefixes, near].filter(Boolean).join(" | ") });
  }
  const typedHit = (w: Want): Fragment => w.stem ? sql`(p.search @@ to_tsquery('wiki', ${w.typed}) or p.stems @@ to_tsquery('simple', ${w.stem}))` : sql`(p.search @@ to_tsquery('wiki', ${w.typed}))`;
  const strongHit = (w: Want): Fragment => w.related ? sql`(${typedHit(w)} or p.search @@ to_tsquery('wiki', ${w.related}))` : typedHit(w);
  const anyHit = (w: Want): Fragment => w.near ? sql`(${strongHit(w)} or p.search @@ to_tsquery('wiki', ${w.near}))` : strongHit(w);
  const sum = (hit: (w: Want) => Fragment): Fragment => wants.reduce<Fragment>((total, w) => sql`${total} + (${hit(w)})::int`, sql`0`);
  const either = wants.reduce<Fragment>((all, w) => sql`${all} or ${anyHit(w)}`, sql`false`);
  const show = wants.map(w => `(${w.show})`).join(" | ");
  const stems = stemQuery(wants.flatMap(w => (w.stem ? w.stem.split(" | ") : [])));
  const options = `StartSel=${start}, StopSel=${stop}, MaxWords=26, MinWords=12, MaxFragments=2, FragmentDelimiter=" … "`;
  const found = await sql<Row[]>`
    with q as (select to_tsquery('wiki', ${show}) as query, ${stems ? sql`to_tsquery('simple', ${stems})` : sql`null::tsquery`} as stems, unaccent(lower(${q})) as plain),
    hits as (
      select p.id, p.space_id, p.title, p.body, p.search, p.stems, p.updated_at, p.updated_by,
        (${sum(anyHit)}) as matched, (${sum(typedHit)}) as typed, (${sum(strongHit)}) as strong,
        similarity(unaccent(lower(p.title)), q.plain) as alike,
        (to_tsvector('wiki', p.title || ' ' || wiki_compounds(p.title)) @@ q.query
          or coalesce((to_tsvector('wiki_en', p.title) || to_tsvector('wiki_fr', p.title)) @@ q.stems, false)) as titled
      from pages p, q
      where p.deleted_at is null and p.space_id in ${sql(visible)}
        and (${either} or similarity(unaccent(lower(p.title)), q.plain) > 0.35)
    ),
    ranked as (
      select h.*, ts_rank(h.search, q.query) + coalesce(ts_rank(h.stems, q.stems), 0) / 2 + h.alike as rank from hits h, q
      order by h.matched desc, h.typed desc, h.titled desc, rank desc, h.updated_at desc limit 30
    )
    select r.id, r.space_id, r.updated_at, r.updated_by, r.matched, r.typed, r.strong, r.titled,
      ts_headline('wiki', r.title, q.query, ${`StartSel=${start}, StopSel=${stop}, HighlightAll=true`}) as title,
      ts_headline('wiki', left(r.body, 60000), q.query, ${options}) as snippet
    from ranked r, q order by r.matched desc, r.typed desc, r.titled desc, r.rank desc, r.updated_at desc`;
  return kept(found, wants.length).map(r => ({
    id: String(r.id),
    spaceId: String(r.space_id),
    spaceName: names.get(String(r.space_id)) ?? "",
    title: segments(r.title),
    // Without a match in the words (a title found by its likeness), the
    // page's first words.
    snippet: segments(r.snippet.replace(/\s+/gu, " ").trim()),
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
    complete: r.matched >= wants.length,
  }));
}

// The relevance floor. Pages holding every word come first; when fewer
// than three do, pages holding some follow — only those holding a word as
// typed (or by its stem), not merely a word that means the same ("clé
// bureau" does not list every page saying "office"). And when some page
// holds a word as typed, by its stem or through its group, pages found
// only through a typo's neighbour or a look-alike title are left out
// ("nouvel arrivant" does not list a page for its "arrives").
export function kept<R extends { matched: number; typed: number; strong: number }>(found: R[], wanted: number): R[] {
  const solid = found.some(r => r.strong > 0) ? found.filter(r => r.strong > 0) : found;
  const complete = solid.filter(r => r.matched >= wanted);
  if (complete.length >= 3) return complete;
  if (complete.length > 0) return solid.filter(r => r.matched >= wanted || r.typed > 0);
  return solid;
}
