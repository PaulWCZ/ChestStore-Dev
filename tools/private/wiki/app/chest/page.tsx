import Link from "next/link";
import { Book, Plus, Search, Upload } from "../../components/icons.tsx";
import { NewSpaceButton } from "../../components/new-space.tsx";
import { can } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { myDrafts } from "../../lib/editing.ts";
import { format, plural, relative } from "../../lib/i18n/index.ts";
import { recent } from "../../lib/pages.ts";
import { nameOf, people } from "../../lib/people.ts";
import { viewer } from "../../lib/session.ts";
import { listSpaces } from "../../lib/spaces.ts";
import { ExampleButton } from "./example-button.tsx";

// Home: the one question people come with — "what do you want to know?" —
// then what changed lately, and the spaces. An empty wiki offers an
// example handbook in one click, or an import.
export default async function Home() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const [spaces, latest, drafts] = await Promise.all([listSpaces(sql, member), recent(sql, member, { limit: 8 }), myDrafts(sql, member)]);
  const who = await people(latest.map(p => p.updatedBy));
  const now = new Date();
  const writer = can(member, "write");
  if (spaces.length === 0) {
    return (
      <main className="page narrow">
        <div className="welcome">
          <Book />
          <h1>{writer ? t.home.empty.title : t.home.empty.readerTitle}</h1>
          <p>{writer ? t.home.empty.body : t.home.empty.readerBody}</p>
          {writer && (
            <div className="welcome-actions">
              <ExampleButton label={t.home.empty.example} hint={t.home.empty.exampleHint} errors={t.errors} />
              <div className="row-actions">
                <NewSpaceButton className="button quiet" t={{ newSpace: t.newSpace, common: t.common, errors: t.errors }}><Plus />{t.shell.newSpace}</NewSpaceButton>
                <Link className="button quiet" href="/chest/import"><Upload />{t.home.empty.import}</Link>
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }
  return (
    <main className="page">
      <section className="ask" aria-labelledby="ask-title">
        <h1 id="ask-title">{t.home.title}</h1>
        <form action="/chest/search" role="search" className="ask-form">
          <label htmlFor="ask" className="visually-hidden">{t.home.searchLabel}</label>
          <Search />
          <input id="ask" name="q" type="search" placeholder={t.home.searchPlaceholder} maxLength={100} autoComplete="off" />
          <button type="submit" className="button">{t.home.searchButton}</button>
        </form>
      </section>
      {drafts.length > 0 && (
        <section className="drafts" aria-labelledby="drafts-title">
          <h2 id="drafts-title" className="kicker">{t.home.drafts}</h2>
          <ul>
            {drafts.map(d => (
              <li key={d.pageId}>
                <span className="draft-title">{d.title}</span>
                <span className="muted">{relative(d.updatedAt, locale, now)}</span>
                <Link className="button quiet small" href={`/chest/pages/${d.pageId}/edit`}>{t.home.continue}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="home-grid">
        <section aria-labelledby="recent-title">
          <h2 id="recent-title" className="kicker">{t.home.recent}</h2>
          <ol className="recent">
            {latest.map(p => (
              <li key={p.id}>
                <Link href={`/chest/pages/${p.id}`} className="recent-title">{p.title}</Link>
                {p.excerpt && <p className="excerpt">{p.excerpt}</p>}
                <p className="byline">
                  <span className={`space-tag color-${spaces.find(s => s.id === p.spaceId)?.color ?? "green"}`}>{p.spaceName}</span>
                  {format(t.home.updated, { when: relative(p.updatedAt, locale, now), name: p.updatedBy === member.id ? t.people.you : nameOf(who.get(p.updatedBy), locale) })}
                </p>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="spaces-title">
          <h2 id="spaces-title" className="kicker">{t.home.spaces}</h2>
          <ul className="spaces">
            {spaces.map(s => (
              <li key={s.id} className={`space-card color-${s.color}`}>
                <Link href={`/chest/spaces/${s.id}`}>
                  <span className="space-name">{s.name}</span>
                  {s.description && <span className="space-description">{s.description}</span>}
                  <span className="muted">{plural(t.home.pages, s.pages, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {writer && <NewSpaceButton className="button quiet small" t={{ newSpace: t.newSpace, common: t.common, errors: t.errors }}><Plus />{t.shell.newSpace}</NewSpaceButton>}
        </section>
      </div>
    </main>
  );
}
