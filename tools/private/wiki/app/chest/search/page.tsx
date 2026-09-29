import Link from "next/link";
import { Search } from "../../../components/icons.tsx";
import { db } from "../../../lib/db.ts";
import { format, plural, relative } from "../../../lib/i18n/index.ts";
import { search, type Segment } from "../../../lib/search.ts";
import { viewer } from "../../../lib/session.ts";
import { can } from "../../../lib/access.ts";
import { listSpaces } from "../../../lib/spaces.ts";

// Search results: the title and the passage that matched, the matched
// words marked like a highlighter on paper.
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const q = (await searchParams)["q"]?.slice(0, 100).trim() ?? "";
  const sql = db();
  const [hits, spaces] = await Promise.all([search(sql, member, q), listSpaces(sql, member)]);
  const colors = new Map(spaces.map(s => [s.id, s.color]));
  const now = new Date();
  return (
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
                <Link href={`/chest/pages/${h.id}`} className="result-title"><Marked parts={h.title} /></Link>
                <p className="snippet"><Marked parts={h.snippet} /></p>
                <p className="byline">
                  <span className={`space-tag color-${colors.get(h.spaceId) ?? "green"}`}>{format(t.search.in, { space: h.spaceName })}</span>
                  {relative(h.updatedAt, locale, now)}
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
      {/* Editors keep the words that mean the same ("vacances" = "congés"). */}
      {can(member, "write") && <p className="muted small center"><Link href="/chest/search/synonyms">{t.search.synonyms}</Link></p>}
    </div>
  );
}

function Marked({ parts }: { parts: Segment[] }) {
  return <>{parts.map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}</>;
}
