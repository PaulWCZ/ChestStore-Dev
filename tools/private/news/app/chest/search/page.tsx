import { Search as SearchIcon, Speech } from "../../../components/icons.tsx";
import { Highlighted } from "../../../components/highlighted.tsx";
import { dates } from "../../../lib/dates.ts";
import { db } from "../../../lib/db.ts";
import { format, plural } from "../../../lib/i18n/index.ts";
import { limits } from "../../../lib/model.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { search } from "../../../lib/search.ts";
import { viewer } from "../../../lib/session.ts";

// Search: one box, then the posts found — their headline and the passage
// that matched, the comments that matched — the words found marked. Only
// what the member may see is searched (lib/search.ts).
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t, zone } = v;
  const raw = (await searchParams)["q"];
  const query = (typeof raw === "string" ? raw : "").slice(0, limits.query).trim();
  const hits = query ? await search(db(), member, query) : [];
  const who = await people(hits.flatMap(h => h.comments.map(c => c.author)));
  const name = (id: string) => (id === member.id ? t.people.you : nameOf(who.get(id), locale));
  const d = dates(locale, zone);
  return (
    <main className="search-page narrow">
      <h1>{t.search.title}</h1>
      <form className="search-box" role="search" action="/chest/search" method="get">
        <label htmlFor="q" className="visually-hidden">{t.search.label}</label>
        <input id="q" name="q" type="search" className="field" defaultValue={query} placeholder={t.search.placeholder} maxLength={limits.query} autoFocus={!query} />
        <button type="submit" className="button"><SearchIcon />{t.search.button}</button>
      </form>
      {!query ? <p className="quiet-text">{t.search.start}</p> : hits.length === 0 ? (
        <div className="empty" role="status">
          <h2>{format(t.search.none, { query })}</h2>
          <p>{t.search.noneHint}</p>
        </div>
      ) : (
        <>
          <p className="quiet-text" role="status">{plural(t.search.results, hits.length, locale, { query })}</p>
          <ol className="results">
            {hits.map(h => (
              <li key={h.id} className="result">
                <p className="kicker">
                  <span className="kind">{t.kinds[h.kind]}</span>
                  {h.scheduled && <span className="flag">{t.search.scheduled}</span>}
                  <time className="quiet-text" dateTime={h.publishAt}>{d.date(h.publishAt)}</time>
                </p>
                <h2 className="headline"><a href={`/chest/posts/${h.id}`}><Highlighted segments={h.title} /></a></h2>
                {h.text && <p className="dek"><Highlighted segments={h.text} /></p>}
                {h.comments.length > 0 && (
                  <div className="result-comments">
                    <h3><Speech />{t.search.inComments}</h3>
                    <ul>
                      {h.comments.map(c => (
                        <li key={c.id}><a href={`/chest/posts/${h.id}#comment-${c.id}`}><strong>{format(t.search.said, { name: name(c.author) })}</strong> <Highlighted segments={c.text} /></a></li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
