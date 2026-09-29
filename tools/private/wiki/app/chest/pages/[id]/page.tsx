import { EmptyState } from "@argentic/chest-ui/components";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can, spaceAccess } from "../../../../lib/access.ts";
import { AutoRefresh } from "../../../../components/auto-refresh.tsx";
import { Flash } from "../../../../components/flash.tsx";
import { Check, Clock, Lock, Pen } from "../../../../components/icons.tsx";
import { db } from "../../../../lib/db.ts";
import { lockOf } from "../../../../lib/editing.ts";
import { AppError } from "../../../../lib/errors.ts";
import { comments as commentsOf } from "../../../../lib/comments.ts";
import { format, moment, newPageWords, plural, relative } from "../../../../lib/i18n/index.ts";
import { ancestors, backlinks, page, titles, tree, type Page } from "../../../../lib/pages.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { render } from "../../../../lib/render.ts";
import { viewer } from "../../../../lib/session.ts";
import { listSpaces } from "../../../../lib/spaces.ts";
import { isWatching } from "../../../../lib/watching.ts";
import { companyGroups, membersOfTool } from "../../../../lib/groups.ts";
import { isPinned } from "../../../../lib/pins.ts";
import { readState } from "../../../../lib/reads.ts";
import { Comments } from "./comments.tsx";
import { DraftNotice, PageActions, ReadRequest, ReviewAsk, type MovePlace } from "./page-actions.tsx";

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
  const [path, known, linked, lock, nodes, draft, thread, watching, read, pin] = await Promise.all([
    ancestors(sql, p.id),
    titles(sql, member, p.doc),
    backlinks(sql, member, p.id),
    lockOf(sql, p.id),
    tree(sql, member, [p.spaceId]),
    sql`select 1 from drafts where page_id = ${p.id} and member_id = ${member.id}`,
    commentsOf(sql, member, p.id),
    isWatching(sql, member, p.id),
    readState(sql, member, p.id),
    isPinned(sql, p.id),
  ]);
  const { html, headings } = render(p.doc, { title: i => known.get(i), missing: t.page.missing });
  const who = await people([p.updatedBy, ...(lock ? [lock.memberId] : []), ...thread.flatMap(c => (c.resolvedBy ? [c.author, c.resolvedBy] : [c.author])), ...(p.review?.owner ? [p.review.owner] : [])]);
  const now = new Date();
  const writer = p.space.access === "write";
  const children = nodes.filter(n => n.parentId === p.id);
  const holder = lock && lock.memberId !== member.id ? lock : null;
  const empty = html.replace(/<p><\/p>/gu, "").trim() === "";
  // Pictures the save left out are said, never hidden behind "Saved.".
  const dropped = Math.min(Math.max(Number.parseInt(String(query["dropped"] ?? "0"), 10) || 0, 0), 999);
  const flash = query["saved"] !== undefined && dropped > 0 ? plural(t.page.savedDropped, dropped, locale)
    : query["saved"] !== undefined ? (query["over"] ? format(t.page.savedOver, { name: nameOf((await people([query["over"]])).get(query["over"]), locale) }) : t.page.saved)
    : query["restored"] ? format(t.history.restoredToast, { number: query["restored"] })
    : query["example"] ? t.home.exampleAdded : null;
  const toc = headings.filter(h => h.level <= 2);
  const owner = p.review?.owner ?? null;
  // Where the page may move: the spaces the editor writes in, and their pages.
  // Whom a comment may name with "@": the people who read this page.
  const mentionable = (await membersOfTool()).filter(m => m.id !== member.id && spaceAccess(m, p.space) !== "none").map(m => ({ id: m.id, name: m.name }));
  let places: MovePlace | undefined;
  let groups: { id: string; name: string }[] = [];
  if (writer) {
    groups = read.asked ? [] : await companyGroups();
    // A shared page never moves into "My pages" (lib/pages.ts, movePage).
    const writable = (await listSpaces(sql, member)).filter(s => s.access === "write" && (s.visibility !== "private" || p.space.visibility === "private"));
    const all = await tree(sql, member, writable.map(s => s.id));
    places = { spaces: writable.map(s => ({ id: s.id, name: s.name })), nodes: all.map(n => ({ id: n.id, spaceId: n.spaceId, parentId: n.parentId, title: n.title })) };
  }
  return (
    <div className={`page reading color-${p.space.color}`}>
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
            {p.template && <p className="template-tag"><span className="pill">{t.templates.tag}</span></p>}
            <div className="article-meta">
              <Link href={`/chest/pages/${p.id}/history`} className="byline">
                <Clock />
                {format(t.page.updated, { when: relative(p.updatedAt, locale, now), name: p.updatedBy === member.id ? t.people.you : nameOf(who.get(p.updatedBy), locale) })}
              </Link>
              <PageActions
                page={{ id: p.id, title: p.title, spaceId: p.spaceId, parentId: p.parentId, hasChildren: children.length > 0 }}
                writer={writer}
                editHref={`/chest/pages/${p.id}/edit`}
                t={{ ...newPageWords(t), page: t.page, move: t.move, shell: t.shell, watch: t.watch, review: t.review, reads: t.reads, marks: { tag: t.templates.tag, mark: t.templates.mark, unmark: t.templates.unmark, marked: t.templates.marked, unmarked: t.templates.unmarked }, spaceName: p.space.name, locale }}
                state={{ watching, template: p.template, review: { months: p.review?.months ?? null, ownerName: owner ? nameOf(who.get(owner), locale) : null, mine: owner === member.id }, readAsked: read.asked !== null, pinned: pin, private: p.space.visibility === "private" }}
                groups={groups}
                {...(places ? { places } : {})}
              />
            </div>
          </header>
          {p.space.visibility === "private" && <p className="muted small read-only"><Lock />{t.mine.notice}</p>}
          {!writer && can(member, "write") && <p className="muted small read-only"><Lock />{format(t.page.readOnly, { space: p.space.name })}</p>}
          {holder && (
            <p className="notice" role="status"><Lock />{format(holder.idle ? t.page.editingIdle : t.page.editing, { name: nameOf(who.get(holder.memberId), locale), time: moment(holder.since, locale, now) })}</p>
          )}
          {read.concerned && read.asked && (read.mine === null || read.mine.version < read.asked.version) && (
            <ReadRequest pageId={p.id} again={read.mine !== null}
              t={{ banner: t.reads.banner, bannerAgain: t.reads.bannerAgain, confirm: t.reads.confirm, confirmed: t.reads.confirmed, errors: t.errors }} />
          )}
          {read.concerned && read.asked && read.mine !== null && read.mine.version >= read.asked.version && (
            <p className="muted small read-only"><Check />{format(t.reads.youRead, { when: relative(read.mine.at, locale, now) })}</p>
          )}
          {writer && p.review?.due && (
            <ReviewAsk pageId={p.id} months={p.review.months} editHref={`/chest/pages/${p.id}/edit`}
              text={format(t.review.due, { when: relative(p.review.reviewedAt, locale, now) })}
              t={{ stillCorrect: t.review.stillCorrect, update: t.review.update, done: t.review.done, errors: t.errors }} />
          )}
          {writer && lock && lock.memberId === member.id && draft.length === 0 && (
            <p className="notice mine" role="status"><Pen />{t.page.editingYou} <Link href={`/chest/pages/${p.id}/edit`}>{t.page.continueDraft}</Link></p>
          )}
          {writer && draft.length > 0 && !holder && (
            <DraftNotice pageId={p.id} editHref={`/chest/pages/${p.id}/edit`}
              t={{ text: t.page.yourDraft, continue: t.page.continueDraft, discard: t.page.discardDraft, discarded: t.page.draftDiscarded, errors: t.errors }} />
          )}
          {empty ? (
            <EmptyState title={t.page.emptyBody} action={writer ? <Link className="button" href={`/chest/pages/${p.id}/edit`}>{t.page.emptyEdit}</Link> : null} />
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
          <Comments
            key={p.id}
            pageId={p.id}
            me={member.id}
            moderator={writer}
            initial={thread.map(c => {
              const person = who.get(c.author);
              return { id: c.id, author: c.author, name: nameOf(person, locale), photo: person?.photo ?? null, body: c.body, at: c.createdAt.toISOString(), when: moment(c.createdAt, locale, now), edited: c.editedAt !== null, parentId: c.parentId, quote: c.quote, resolved: c.resolvedAt !== null, resolvedBy: c.resolvedBy ? (c.resolvedBy === member.id ? t.comments.you : nameOf(who.get(c.resolvedBy), locale)) : null };
            })}
            people={mentionable}
            t={{ comments: t.comments, errors: t.errors, locale }}
          />
        </article>
        {toc.length >= 3 && (
          <aside className="toc" aria-labelledby="toc-title">
            <h2 id="toc-title" className="kicker">{t.page.toc}</h2>
            <ol>{toc.map(h => <li key={h.id} className={`level-${h.level}`}><a href={`#${h.id}`}>{h.text}</a></li>)}</ol>
          </aside>
        )}
      </div>
    </div>
  );
}
