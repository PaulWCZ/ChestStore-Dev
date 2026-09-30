import Link from "next/link";
import { Book, Download, Lock, Pen, Pin, Plus, Search, Upload } from "../../components/icons.tsx";
import { NewPageButton } from "../../components/new-page.tsx";
import { NewSpaceButton } from "../../components/new-space.tsx";
import { can } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { myDrafts } from "../../lib/editing.ts";
import { askWhom } from "../../lib/groups.ts";
import { format, formatDate, newPageWords, plural, relative } from "../../lib/i18n/index.ts";
import { recent } from "../../lib/pages.ts";
import { pinned } from "../../lib/pins.ts";
import { toRead } from "../../lib/reads.ts";
import { myReviews } from "../../lib/reviews.ts";
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
  const [spaces, latest, drafts, checks, reading, pins] = await Promise.all([listSpaces(sql, member), recent(sql, member, { limit: 8, withoutImports: true }), myDrafts(sql, member), myReviews(sql, member), toRead(sql, member), pinned(sql, member)]);
  const who = await people(latest.map(p => p.updatedBy));
  const now = new Date();
  const writer = can(member, "write");
  // Everyone's own "My pages", made with its first page.
  const mine = { spaceId: "mine", spaceName: t.mine.name, parentId: null, parentTitle: null };
  if (spaces.length === 0) {
    // A reader cannot start the wiki: it names who can.
    const ask = writer ? null : await askWhom(locale, t.space.anotherEditor);
    return (
      <div className="page narrow">
        <div className="welcome">
          <Book />
          <h1>{writer ? t.home.empty.title : t.home.empty.readerTitle}</h1>
          <p>{writer ? t.home.empty.body : ask ? format(t.home.empty.readerAsk, { names: ask }) : t.home.empty.readerBody}</p>
          {!writer && (
            <>
              <p>{t.mine.readerEmpty}</p>
              <div className="row-actions">
                <NewPageButton className="button quiet" target={mine} t={newPageWords(t)}><Lock />{t.mine.new}</NewPageButton>
              </div>
            </>
          )}
          {writer && (
            <div className="welcome-actions">
              <ExampleButton label={t.home.empty.example} hint={t.home.empty.exampleHint} errors={t.errors} />
              <div className="row-actions">
                <NewPageButton className="button quiet" target={{ spaceId: "new", spaceName: t.starter.space, parentId: null, parentTitle: null }} t={newPageWords(t)}><Pen />{t.space.firstPage}</NewPageButton>
                <Link className="button quiet" href="/chest/import"><Upload />{t.home.empty.import}</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="page">
      <section className="ask" aria-labelledby="ask-title">
        <h1 id="ask-title">{t.home.title}</h1>
        <form action="/chest/search" role="search" className="ask-form">
          <label htmlFor="ask" className="visually-hidden">{t.home.searchLabel}</label>
          <Search />
          <input id="ask" name="q" type="search" placeholder={t.home.searchPlaceholder} maxLength={100} autoComplete="off" />
          <button type="submit" className="button">{t.home.searchButton}</button>
        </form>
        {pins.length > 0 && (
          <nav className="pins" aria-label={t.home.pinned}>
            <ul>
              {pins.map(p => (
                <li key={p.id} className={`color-${spaces.find(s => s.id === p.spaceId)?.color ?? "green"}`}><Link href={`/chest/pages/${p.id}`}><Pin />{p.title}</Link></li>
              ))}
            </ul>
          </nav>
        )}
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
      {reading.length > 0 && (
        <section className="checks to-read" aria-labelledby="to-read-title">
          <h2 id="to-read-title" className="kicker">{t.reads.home}</h2>
          <ul>
            {reading.map(r => (
              <li key={r.id}>
                <Link className="draft-title" href={`/chest/pages/${r.id}`}>{r.title}</Link>
                <span className="muted">{format(t.reads.since, { date: formatDate(r.askedAt, locale, { day: "numeric", month: "short", timeZone: member.timeZone }) })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {checks.length > 0 && (
        <section className="checks" aria-labelledby="checks-title">
          <h2 id="checks-title" className="kicker">{t.home.reviews}</h2>
          <ul>
            {checks.map(c => (
              <li key={c.id}>
                <Link className="draft-title" href={`/chest/pages/${c.id}`}>{c.title}</Link>
                <span className="muted">{format(t.home.reviewDue, { date: formatDate(c.since, locale, { day: "numeric", month: "short", timeZone: member.timeZone }) })}</span>
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
          <div className="row-actions spaces-foot">
            {!spaces.some(s => s.visibility === "private") && <NewPageButton className="button quiet small" target={mine} t={newPageWords(t)}><Lock />{t.mine.new}</NewPageButton>}
            {writer && <NewSpaceButton className="button quiet small" t={{ newSpace: t.newSpace, common: t.common, errors: t.errors, dialog: t.dialog }}><Plus />{t.shell.newSpace}</NewSpaceButton>}
            {writer && <a className="button quiet small" href="/chest/export" download><Download />{t.home.exportAll}</a>}
          </div>
        </section>
      </div>
    </div>
  );
}
