import { EmptyState, PageHeader, SearchBox } from "@argentic/chest-ui/components";
import { notFound } from "next/navigation";
import { FoundList } from "../../../components/found-list.tsx";
import { can } from "../../../lib/access.ts";
import { pool } from "../../../lib/candidates.ts";
import { db } from "../../../lib/db.ts";
import { plural } from "../../../lib/i18n/index.ts";
import { viewer } from "../../../lib/session.ts";

// The talent pool: people who agreed to be kept in mind for other jobs,
// each once. From a person's page, "Propose for another job".
export default async function Pool({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const v = await viewer();
  if (!v || !can(v.member, "candidates.manage")) notFound();
  const { q = "" } = await searchParams;
  const { t, locale, member } = v;
  const list = await pool(db(), member, q.slice(0, 100));
  return (
    <div className="narrow">
      <PageHeader title={t.pool.title} intro={t.pool.intro} />
      <div className="search-form">
        <SearchBox action="/chest/pool" value={q.slice(0, 100)} id="pool-q" shortcut={false} labels={{ label: t.pool.filter, placeholder: t.pool.filter, shortcut: t.search.shortcut, submit: t.search.go }} />
      </div>
      {list.length === 0 ? (
        <EmptyState title={q ? t.pool.noneFound : t.pool.emptyTitle} body={t.pool.emptyBody} />
      ) : (
        <>
          <p className="muted">{plural(t.pool.count, list.length, locale)}</p>
          <FoundList list={list} locale={locale} t={t} />
        </>
      )}
    </div>
  );
}
