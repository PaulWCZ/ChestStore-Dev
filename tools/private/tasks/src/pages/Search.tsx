import type { PageContext, View } from "@argentic/chest-app";
import { AppError } from "@argentic/chest-app";
import { plural, localeOf } from "../i18n/index.ts";
import { columnName } from "../lib/boards.ts";
import { searchCards } from "../lib/cards.ts";
import { db } from "../lib/db.ts";

// Cards by words of their title or description, or a phrase of their
// comments, checklists or labels, on the boards I see; the archive too
// when asked (each result then says it is archived). A plain form: it
// works without a script.
export async function searchPage({ member, locale: language, t, query }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const q = (query("q") ?? "").trim().slice(0, 100);
  const archived = query("archived") === "1";
  let found: Awaited<ReturnType<typeof searchCards>> = [];
  if (q) {
    try {
      found = await searchCards(db(), member, q, { archived });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
  }
  const hidden = q && !archived ? (await searchCards(db(), member, q, { archived: true }).catch(() => [])).length - found.length : 0;
  return {
    title: t.search.title,
    body: (
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
        {hidden > 0 && <p className="hint"><a href={`/chest/search?${new URLSearchParams({ q, archived: "1" }).toString()}`}>{plural(t.search.inArchive, hidden, locale)}</a></p>}
        <ul className="task-list results">
          {found.map(c => (
            <li key={c.id} className="task">
              <a className="title" href={`/chest/boards/${c.boardId}?card=${c.id}`}>{c.title}</a>
              <span className="where">
                {c.archived && <span className="chip">{t.search.archived}</span>}
                <span className="chip">{columnName(c.columnName, c.columnKey, t.templates.columns)}</span>
                <span className={`chip label-chip c-${c.boardColor}`}>{c.boardName}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    ),
  };
}
