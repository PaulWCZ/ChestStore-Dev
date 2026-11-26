import type { MemberContext, PageContext, View } from "@argentic/chest-app";
import { Search } from "../components/icons.tsx";
import { format, localeOf, plural, relative } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { search, type Segment } from "../lib/search.ts";
import { listSpaces } from "../lib/spaces.ts";

// Search results: the title and the passage that matched, the matched
// words marked like a highlighter on paper.
export async function searchPage({ member, locale: language, t, query }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(language);
  const q = query("q")?.slice(0, 100).trim() ?? "";
  const sql = db();
  const [hits, spaces] = await Promise.all([search(sql, member, q), listSpaces(sql, member)]);
  const colors = new Map(spaces.map(s => [s.id, s.color]));
  const now = new Date();
  const colorOf = (spaceId: string) => colors.get(spaceId) ?? "green";
  return { title: q ? `${q} · ${t.search.title}` : t.search.title, body: (
    <div className="page narrow">
      <h1 className="visually-hidden">{t.search.title}</h1>
      <form action="/chest/search" role="search" className="ask-form">
        <label htmlFor="search-q" className="visually-hidden">{t.search.label}</label>
        <Search />
        <input id="search-q" name="q" type="search" defaultValue={q} maxLength={100} autoComplete="off" placeholder={t.home.searchPlaceholder} autoFocus={q === ""} />
        <button type="submit" className="button">{t.home.searchButton}</button>
      </form>
      {q === "" ? <p className="muted center">{t.search.prompt}</p> : (
        <>
          <p className="result-count" role="status">{plural(t.search.results, hits.length, locale, { q })}</p>
          {hits.length === 0 && <p className="muted">{t.search.hint}</p>}
          <ol className="results">
            {hits.map(h => (
              <li key={h.id}>
                <a href={`/chest/pages/${h.id}`} className="result-title"><Marked parts={h.title} /></a>
                <p className="snippet"><Marked parts={h.snippet} /></p>
                <p className="byline">
                  <span className={`space-tag color-${colorOf(h.spaceId)}`}>{format(t.search.in, { space: h.spaceName })}</span>
                  {relative(h.updatedAt, locale, now)}
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
      {/* Editors keep the words that mean the same ("vacances" = "congés"). */}
      {can(member, "write") && <p className="muted small center"><a href="/chest/search/synonyms">{t.search.synonyms}</a></p>}
    </div>
  ) };
}

function Marked({ parts }: { parts: Segment[] }) {
  return <>{parts.map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}</>;
}
