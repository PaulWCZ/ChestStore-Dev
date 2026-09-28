import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../../components/auto-refresh.tsx";
import { Flash } from "../../../../components/flash.tsx";
import { Clock, Lock, Pen } from "../../../../components/icons.tsx";
import { db } from "../../../../lib/db.ts";
import { lockOf } from "../../../../lib/editing.ts";
import { AppError } from "../../../../lib/errors.ts";
import { format, moment, relative } from "../../../../lib/i18n/index.ts";
import { ancestors, backlinks, page, titles, tree, type Page } from "../../../../lib/pages.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { render } from "../../../../lib/render.ts";
import { viewer } from "../../../../lib/session.ts";
import { listSpaces } from "../../../../lib/spaces.ts";
import { PageActions, type MovePlace } from "./page-actions.tsx";

// Reading a page: the default for everyone. Where it is, its title, who
// changed it last, the text set for reading; for editors one obvious
// action, "Edit". Links to other pages show their current titles.
export default async function ReadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  const query = await searchParams;
  const sql = db();
  let p: Page;
  try {
    p = await page(sql, member, id);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const [path, known, linked, lock, nodes, draft] = await Promise.all([
    ancestors(sql, p.id),
    titles(sql, member, p.doc),
    backlinks(sql, member, p.id),
    lockOf(sql, p.id),
    tree(sql, member, [p.spaceId]),
    sql`select 1 from drafts where page_id = ${p.id} and member_id = ${member.id}`,
  ]);
  const { html, headings } = render(p.doc, { title: i => known.get(i), missing: t.page.missing });
  const who = await people([p.updatedBy, ...(lock ? [lock.memberId] : [])]);
  const now = new Date();
  const writer = p.space.access === "write";
  const children = nodes.filter(n => n.parentId === p.id);
  const holder = lock && lock.memberId !== member.id ? lock : null;
  const empty = html.replace(/<p><\/p>/gu, "").trim() === "";
  const flash = query["saved"] !== undefined ? (query["over"] ? format(t.page.savedOver, { name: nameOf((await people([query["over"]])).get(query["over"]), locale) }) : t.page.saved)
    : query["restored"] ? format(t.history.restoredToast, { number: query["restored"] })
    : query["example"] ? t.home.exampleAdded : null;
  const toc = headings.filter(h => h.level <= 2);
  // Where the page may move: the spaces the editor writes in, and their pages.
  let places: MovePlace | undefined;
  if (writer) {
    const writable = (await listSpaces(sql, member)).filter(s => s.access === "write");
    const all = await tree(sql, member, writable.map(s => s.id));
    places = { spaces: writable.map(s => ({ id: s.id, name: s.name })), nodes: all.map(n => ({ id: n.id, spaceId: n.spaceId, parentId: n.parentId, title: n.title })) };
  }
  return (
    <main className={`page reading color-${p.space.color}`}>
      <Flash text={flash} />
      <AutoRefresh seconds={60} />
      <nav className="crumbs" aria-label={t.page.breadcrumb}>
        <Link href={`/chest/spaces/${p.spaceId}`} className="kicker">{p.space.name}</Link>
        {path.map(a => <span key={a.id}><span aria-hidden="true">/</span><Link href={`/chest/pages/${a.id}`}>{a.title}</Link></span>)}
      </nav>
      <div className={`article-grid${toc.length >= 3 ? " with-toc" : ""}`}>
        <article className="article">
          <header className="article-head">
            <h1>{p.title}</h1>
            <div className="article-meta">
              <Link href={`/chest/pages/${p.id}/history`} className="byline">
                <Clock />
                {format(t.page.updated, { when: relative(p.updatedAt, locale, now), name: p.updatedBy === member.id ? t.people.you : nameOf(who.get(p.updatedBy), locale) })}
              </Link>
              <PageActions
                page={{ id: p.id, title: p.title, spaceId: p.spaceId, parentId: p.parentId, hasChildren: children.length > 0 }}
                writer={writer}
                editHref={`/chest/pages/${p.id}/edit`}
                t={{ page: t.page, move: t.move, shell: t.shell, common: t.common, errors: t.errors, newPage: t.newPage, spaceName: p.space.name, locale }}
                {...(places ? { places } : {})}
              />
            </div>
          </header>
          {holder && (
            <p className="notice" role="status"><Lock />{format(holder.idle ? t.page.editingIdle : t.page.editing, { name: nameOf(who.get(holder.memberId), locale), time: moment(holder.since, locale, now) })}</p>
          )}
          {draft.length > 0 && !holder && (
            <p className="notice mine" role="status"><Pen />{t.page.yourDraft} <Link href={`/chest/pages/${p.id}/edit`}>{t.page.continueDraft}</Link></p>
          )}
          {empty ? (
            <div className="empty soft">
              <p>{t.page.emptyBody}</p>
              {writer && <Link className="button" href={`/chest/pages/${p.id}/edit`}>{t.page.emptyEdit}</Link>}
            </div>
          ) : (
            <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
          )}
          {children.length > 0 && (
            <section className="related" aria-labelledby="children-title">
              <h2 id="children-title" className="kicker">{t.page.children}</h2>
              <ul>{children.map(c => <li key={c.id}><Link href={`/chest/pages/${c.id}`}>{c.title}</Link></li>)}</ul>
            </section>
          )}
          {linked.length > 0 && (
            <section className="related" aria-labelledby="backlinks-title">
              <h2 id="backlinks-title" className="kicker">{t.page.backlinks}</h2>
              <ul>{linked.map(c => <li key={c.id}><Link href={`/chest/pages/${c.id}`}>{c.title}</Link></li>)}</ul>
            </section>
          )}
        </article>
        {toc.length >= 3 && (
          <aside className="toc" aria-labelledby="toc-title">
            <h2 id="toc-title" className="kicker">{t.page.toc}</h2>
            <ol>{toc.map(h => <li key={h.id} className={`level-${h.level}`}><a href={`#${h.id}`}>{h.text}</a></li>)}</ol>
          </aside>
        )}
      </div>
    </main>
  );
}
