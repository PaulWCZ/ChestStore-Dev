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
      <div className="page-head"><h1>{t.pool.title}</h1></div>
      <p className="lede-s">{t.pool.intro}</p>
      <form className="search-form" role="search" action="/chest/pool">
        <label className="visually-hidden" htmlFor="pool-q">{t.pool.filter}</label>
        <input id="pool-q" name="q" type="search" className="field" defaultValue={q.slice(0, 100)} placeholder={t.pool.filter} maxLength={100} />
        <button type="submit" className="button quiet">{t.search.go}</button>
      </form>
      {list.length === 0 ? (
        <div className="empty"><h2>{q ? t.pool.noneFound : t.pool.emptyTitle}</h2><p>{t.pool.emptyBody}</p></div>
      ) : (
        <>
          <p className="muted">{plural(t.pool.count, list.length, locale)}</p>
          <FoundList list={list} locale={locale} t={t} />
        </>
      )}
    </div>
  );
}
