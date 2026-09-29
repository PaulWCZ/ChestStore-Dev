import Link from "next/link";
import { columnName } from "../../../lib/boards.ts";
import { searchCards } from "../../../lib/cards.ts";
import { db } from "../../../lib/db.ts";
import { AppError } from "../../../lib/errors.ts";
import { plural } from "../../../lib/i18n/index.ts";
import { viewer } from "../../../lib/session.ts";

// Cards by words of their title or description, or a phrase of their
// comments, checklists or labels, on the boards I see; the archive too
// when asked (each result then says it is archived).
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string; archived?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 100);
  const archived = params.archived === "1";
  let found: Awaited<ReturnType<typeof searchCards>> = [];
  if (q) {
    try {
      found = await searchCards(db(), member, q, { archived });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
  }
  const hidden = q && !archived ? (await searchCards(db(), member, q, { archived: true }).catch(() => [])).length - found.length : 0;
  return (
    <div className="narrow">
      <h1>{t.search.title}</h1>
      <form action="/chest/search" role="search" aria-label={t.search.title} className="stack search-form">
        <div className="row">
          <label htmlFor="search-page" className="visually-hidden">{t.shell.search}</label>
          <input id="search-page" name="q" type="search" className="field grow" defaultValue={q} maxLength={100} placeholder={t.shell.search} autoFocus={!q} />
          <button type="submit" className="button">{t.shell.searchButton}</button>
        </div>
        <label className="row small check-line">
          <input type="checkbox" name="archived" value="1" defaultChecked={archived} />
          {t.search.includeArchived}
        </label>
      </form>
      {q ? <p className="muted" role="status">{plural(t.search.results, found.length, locale, { q })}</p> : <p className="hint">{t.search.hint}</p>}
      {hidden > 0 && <p className="hint"><Link href={`/chest/search?${new URLSearchParams({ q, archived: "1" }).toString()}`}>{plural(t.search.inArchive, hidden, locale)}</Link></p>}
      <ul className="task-list results">
        {found.map(c => (
          <li key={c.id} className="task">
            <Link className="title" href={`/chest/boards/${c.boardId}?card=${c.id}`}>{c.title}</Link>
            <span className="where">
              {c.archived && <span className="chip">{t.search.archived}</span>}
              <span className="chip">{columnName(c.columnName, c.columnKey, t.templates.columns)}</span>
              <span className={`chip label-chip c-${c.boardColor}`}>{c.boardName}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
