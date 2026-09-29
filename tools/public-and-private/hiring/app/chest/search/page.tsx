import { PageHeader, SearchBox } from "@argentic/chest-ui/components";
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
      <PageHeader title={t.search.title} />
      <div className="search-form">
        <SearchBox action="/chest/search" value={query} id="q" shortcut={false} labels={{ label: t.search.label, placeholder: t.search.placeholder, shortcut: t.search.shortcut, submit: t.search.go }} />
      </div>
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
