import { EmptyState } from "@argentic/chest-ui/components";
import { Highlighted } from "../components/highlighted.tsx";
import { Speech } from "../components/icons.tsx";
import type { PageContext, View } from "../core/http.tsx";
import { Island } from "../core/island.tsx";
import { format, isLocale, plural } from "../i18n/index.ts";
import { dates } from "../lib/dates.ts";
import { db } from "../lib/db.ts";
import { nameOf, people } from "../lib/people.ts";
import { otherLanguage, search } from "../lib/search.ts";
import { chestZone } from "../lib/zone.ts";
import { limits } from "../shared/model.ts";

// Search: one box, then the posts found — their headline and the passage
// that matched, the comments that matched — the words found marked. Only
// what the member may see is searched (src/lib/search.ts).
export async function searchPage({ member, locale, t, query: read }: PageContext): Promise<View> {
  const zone = chestZone();
  const query = (read("q") ?? "").slice(0, limits.query).trim();
  const hits = query ? await search(db(), member, query) : [];
  // Nothing found: posts written only in another language may hold the word in it.
  const other = query && hits.length === 0 ? await otherLanguage(db(), member) : null;
  const language = (code: string) => (isLocale(code) ? t.languageNames[code] : code);
  const who = await people(hits.flatMap(h => h.comments.map(c => c.author)));
  const name = (id: string) => (id === member.id ? t.people.you : nameOf(who.get(id), locale));
  const d = dates(locale, zone);
  return { title: t.search.title, body: (
    <div className="search-page narrow">
      <h1>{t.search.title}</h1>
      <div className="search-box">
        <Island name="Search" props={{ id: "q", value: query, maxLength: limits.query, autoFocus: !query, labels: t.searchBox }} />
      </div>
      {!query ? <p className="quiet-text">{t.search.start}</p> : hits.length === 0 ? (
        <div role="status">
          <EmptyState title={format(t.search.none, { query })} body={other ? format(t.search.otherLanguage, { language: language(other) }) : t.search.noneHint} />
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
                {h.foundIn && <p className="quiet-text found-in">{format(t.search.foundIn, { language: language(h.foundIn) })}</p>}
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
    </div>
  ) };
}
