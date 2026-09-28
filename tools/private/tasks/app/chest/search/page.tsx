import Link from "next/link";
import { searchCards } from "../../../lib/cards.ts";
import { db } from "../../../lib/db.ts";
import { AppError } from "../../../lib/errors.ts";
import { plural } from "../../../lib/i18n/index.ts";
import { viewer } from "../../../lib/session.ts";

// Cards by words of their title or description, on the boards I see.
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  let found: Awaited<ReturnType<typeof searchCards>> = [];
  if (q) {
    try {
      found = await searchCards(db(), member, q);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
  }
  return (
    <main className="narrow">
      <h1>{t.search.title}</h1>
      <form action="/chest/search" role="search" className="row" style={{ margin: "var(--space-4) 0" }}>
        <label htmlFor="search-page" className="visually-hidden">{t.shell.search}</label>
        <input id="search-page" name="q" type="search" className="field" style={{ flex: 1 }} defaultValue={q} maxLength={100} placeholder={t.shell.search} autoFocus={!q} />
        <button type="submit" className="button">{t.shell.searchButton}</button>
      </form>
      {q ? <p className="muted" role="status">{plural(t.search.results, found.length, locale, { q })}</p> : <p className="hint">{t.search.hint}</p>}
      <ul className="task-list" style={{ marginTop: "var(--space-3)" }}>
        {found.map(c => (
          <li key={c.id} className="task">
            <Link className="title" href={`/chest/boards/${c.boardId}?card=${c.id}`}>{c.title}</Link>
            <span className="where">
              <span className="chip">{c.columnName}</span>
              <span className={`chip label-chip c-${c.boardColor}`}>{c.boardName}</span>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
