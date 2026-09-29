import { FoundList } from "../../../components/found-list.tsx";
import { search } from "../../../lib/candidates.ts";
import { db } from "../../../lib/db.ts";
import { format, plural } from "../../../lib/i18n/index.ts";
import { viewer } from "../../../lib/session.ts";

// Finding a candidate across every job the reader may see: "where is the
// CV of that Lucie who applied in May?"
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { q = "" } = await searchParams;
  const { t, locale, member } = v;
  const query = q.slice(0, 100);
  const found = query.trim().length >= 2 ? await search(db(), member, query) : [];
  return (
    <div className="narrow">
      <div className="page-head"><h1>{t.search.title}</h1></div>
      <form className="search-form" role="search" action="/chest/search">
        <label className="visually-hidden" htmlFor="q">{t.search.label}</label>
        <input id="q" name="q" type="search" className="field" defaultValue={query} placeholder={t.search.placeholder} maxLength={100} autoFocus />
        <button type="submit" className="button">{t.search.go}</button>
      </form>
      {query.trim().length < 2 ? <p className="muted">{t.search.hint}</p>
        : found.length === 0 ? <p className="muted" role="status">{format(t.search.none, { q: query })}</p>
          : (
            <>
              <p className="muted" role="status">{plural(t.search.results, found.length, locale)}</p>
              <FoundList list={found} locale={locale} t={t} />
            </>
          )}
    </div>
  );
}
