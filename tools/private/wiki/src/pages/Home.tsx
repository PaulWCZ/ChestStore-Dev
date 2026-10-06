import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { Book, Download, Pin, Search, Upload } from "../components/icons.tsx";
import { format, formatDate, localeOf, newPageWords, plural, relative } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { myDrafts } from "../lib/editing.ts";
import { askWhom } from "../lib/groups.ts";
import { recent } from "../lib/pages.ts";
import { nameOf, people } from "../lib/people.ts";
import { pinned } from "../lib/pins.ts";
import { toRead } from "../lib/reads.ts";
import { myReviews } from "../lib/reviews.ts";
import { listSpaces } from "../lib/spaces.ts";

// Home: the one question people come with — "what do you want to know?" —
// then what changed lately, and the spaces. An empty wiki offers an
// example handbook in one click, or an import.
export async function homePage({ member, locale: language, t }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const [spaces, latest, drafts, checks, reading, pins] = await Promise.all([listSpaces(sql, member), recent(sql, member, { limit: 8, withoutImports: true }), myDrafts(sql, member), myReviews(sql, member), toRead(sql, member), pinned(sql, member)]);
  const who = await people(latest.map(p => p.updatedBy));
  const now = new Date();
  const colorOf = (spaceId: string) => spaces.find(s => s.id === spaceId)?.color ?? "green";
  const writer = can(member, "write");
  // Everyone's own "My pages", made with its first page.
  const mine = { spaceId: "mine", spaceName: t.mine.name, parentId: null, parentTitle: null };
  if (spaces.length === 0) {
    // A reader cannot start the wiki: it names who can.
    const ask = writer ? null : await askWhom(locale, t.space.anotherEditor);
    return { title: t.tool.name, body: (
      <div className="page narrow">
        <div className="welcome">
          <Book />
          <h1>{writer ? t.home.empty.title : t.home.empty.readerTitle}</h1>
          <p>{writer ? t.home.empty.body : ask ? format(t.home.empty.readerAsk, { names: ask }) : t.home.empty.readerBody}</p>
          {!writer && (
            <>
              <p>{t.mine.readerEmpty}</p>
              <div className="row-actions">
                <Island name="NewPageButton" props={{ className: "button quiet", target: mine, label: t.mine.new, icon: "lock", t: newPageWords(t) }} />
              </div>
            </>
          )}
          {writer && (
            <div className="welcome-actions">
              <Island name="ExampleButton" props={{ label: t.home.empty.example, hint: t.home.empty.exampleHint }} />
              <div className="row-actions">
                <Island name="NewPageButton" props={{ className: "button quiet", target: { spaceId: "new", spaceName: t.starter.space, parentId: null, parentTitle: null }, label: t.space.firstPage, icon: "pen", t: newPageWords(t) }} />
                <a className="button quiet" href="/chest/import"><Upload />{t.home.empty.import}</a>
              </div>
            </div>
          )}
        </div>
      </div>
    ) };
  }
  return { title: t.tool.name, body: (
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
                <li key={p.id} className={`color-${colorOf(p.spaceId)}`}><a href={`/chest/pages/${p.id}`}><Pin />{p.title}</a></li>
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
                <a className="button quiet small" href={`/chest/pages/${d.pageId}/edit`}>{t.home.continue}</a>
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
                <a className="draft-title" href={`/chest/pages/${r.id}`}>{r.title}</a>
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
                <a className="draft-title" href={`/chest/pages/${c.id}`}>{c.title}</a>
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
                <a href={`/chest/pages/${p.id}`} className="recent-title">{p.title}</a>
                {p.excerpt && <p className="excerpt">{p.excerpt}</p>}
                <p className="byline">
                  <span className={`space-tag color-${colorOf(p.spaceId)}`}>{p.spaceName}</span>
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
                <a href={`/chest/spaces/${s.id}`}>
                  <span className="space-name">{s.name}</span>
                  {s.description && <span className="space-description">{s.description}</span>}
                  <span className="muted">{plural(t.home.pages, s.pages, locale)}</span>
                </a>
              </li>
            ))}
          </ul>
          <div className="row-actions">
            {!spaces.some(s => s.visibility === "private") && <Island name="NewPageButton" props={{ className: "button quiet small", target: mine, label: t.mine.new, icon: "lock", t: newPageWords(t) }} />}
            {writer && <Island name="NewSpaceButton" props={{ className: "button quiet small", label: t.shell.newSpace, t: { newSpace: t.newSpace, common: t.common, dialog: t.kit.dialog } }} />}
            {writer && <a className="button quiet small" href="/chest/export" download><Download />{t.home.exportAll}</a>}
          </div>
        </section>
      </div>
    </div>
  ) };
}
